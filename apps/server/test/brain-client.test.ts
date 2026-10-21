/*
 * J/S/I (spec C3, G-2b)
 * Junior: new Anthropic() with no arguments, default retries (2) and 10 minute timeout; passes the
 *   frozen schema by cast; lets the SDK's error text reach logs; maps null usage to NaN.
 * Senior: an injected SDK, so the key never touches this file; no retries; the timeout is the hands'
 *   wait; typed failure outcomes for the ledger; null counted as 0.
 * Incident: a retried 10 minute call stalls a game and bills twice; NaN usage opens the budget.
 *
 * Contract altitude: a stub SDK is passed in; we observe the params/options it receives and the
 * value returned or the error thrown.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { Prompt } from '@mule/ai';
import { CallFailed, createHaikuComplete, type HaikuSdk } from '../src/brain/client.js';

const SCHEMA: Prompt['schema'] = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    option: Object.freeze({ type: 'string', enum: Object.freeze(['a', 'b']) }),
    line: Object.freeze({ type: 'string' }),
  }),
  required: Object.freeze(['option']),
}) as Prompt['schema'];

const PROMPT: Prompt = { system: 'sys', user: 'usr', schema: SCHEMA };

type Create = HaikuSdk['messages']['create'];
type Reply = Awaited<ReturnType<Create>>;

function reply(over: Record<string, unknown> = {}): Reply {
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: BRAIN.model,
    content: [{ type: 'text', text: '{"option":"a"}' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
    ...over,
  } as unknown as Reply;
}

function stub(result: () => Promise<Reply>) {
  const calls: Array<{ params: Parameters<Create>[0]; options: Parameters<Create>[1] }> = [];
  const sdk: HaikuSdk = {
    messages: {
      create: ((params: Parameters<Create>[0], options: Parameters<Create>[1]) => {
        calls.push({ params, options });
        return result();
      }) as Create,
    },
  };
  return { sdk, calls };
}

/** A clock that returns 1000 on the first read, then 1000 + step on every later read. */
const clock = (step: number) => {
  let n = 0;
  return () => (n++ === 0 ? 1000 : 1000 + step);
};

const ZERO = { input: 0, cached_read: 0, cache_write: 0, output: 0 };

describe('Haiku client', () => {
  it('INV-HC3: the request is Haiku, thinking off, cached system, structured output, no retries, timeout = waitMs', async () => {
    const { sdk, calls } = stub(async () => reply());
    await createHaikuComplete(sdk)(PROMPT, 7000);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toEqual({
      model: BRAIN.model,
      max_tokens: BRAIN.maxTokens,
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'usr' }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
    expect(calls[0]!.options).toEqual({ timeout: 7000, maxRetries: 0 });
  });

  it('INV-HC3: the schema sent is a copy, so mutating it does not touch prompt.schema', async () => {
    const { sdk, calls } = stub(async () => reply());
    await createHaikuComplete(sdk)(PROMPT, 1000);
    const sent = calls[0]!.params.output_config!.format!.schema as Record<string, any>;
    expect(sent).not.toBe(SCHEMA);
    expect(Object.isFrozen(sent)).toBe(false);
    sent.type = 'mutated';
    sent.properties.option.enum.push('z');
    expect(SCHEMA.type).toBe('object');
    expect(SCHEMA.properties.option.enum).toEqual(['a', 'b']);
  });

  it("INV-usage: usage maps to the ledger's fields; null cache counts are 0; text joins the text blocks", async () => {
    const full = stub(async () =>
      reply({
        content: [
          { type: 'text', text: 'ab' },
          { type: 'thinking', thinking: 'x', signature: 's' },
          { type: 'text', text: 'cd' },
        ],
      }),
    );
    const r = await createHaikuComplete(full.sdk, clock(250))(PROMPT, 1000);
    expect(r.text).toBe('abcd');
    expect(r.usage).toEqual({ input: 1, cached_read: 3, cache_write: 4, output: 2 });
    expect(r.ms).toBe(250);

    const nulls = stub(async () =>
      reply({ usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: null, cache_creation_input_tokens: null } }),
    );
    const n = await createHaikuComplete(nulls.sdk)(PROMPT, 1000);
    expect(n.usage).toEqual({ input: 5, cached_read: 0, cache_write: 0, output: 6 });
  });

  it("FM-timeout: a connection timeout throws CallFailed outcome 'timeout', usage zero, ms measured", async () => {
    const { sdk } = stub(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    const err = await createHaikuComplete(sdk, clock(900))(PROMPT, 1000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CallFailed);
    const f = err as CallFailed;
    expect(f.outcome).toBe('timeout');
    expect(f.auth).toBe(false);
    expect(f.usage).toEqual(ZERO);
    expect(f.ms).toBe(900);
  });

  it("FM-timeout: an abort is also a 'timeout'", async () => {
    const { sdk } = stub(async () => {
      throw new Anthropic.APIUserAbortError();
    });
    const f = (await createHaikuComplete(sdk)(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('timeout');
  });

  it.each([401, 403])("FM-auth: a %i throws CallFailed outcome 'error', auth true", async (status) => {
    const { sdk } = stub(async () => {
      throw Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'nope' } }, 'nope', new Headers());
    });
    const f = (await createHaikuComplete(sdk, clock(5))(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(true);
    expect(f.ms).toBe(5);
    expect(f.usage).toEqual(ZERO);
  });

  it.each([500, 429])("FM-api-error: a %i throws CallFailed outcome 'error', auth false, with a short message", async (status) => {
    const long = `sk-ant-LEAK x-request-id=abc ${'z'.repeat(500)}`;
    const { sdk } = stub(async () => {
      throw Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: long } }, long, new Headers({ 'x-secret': 'h' }));
    });
    const f = (await createHaikuComplete(sdk)(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(false);
    expect(f.message.length).toBeGreaterThan(0);
    expect(f.message.length).toBeLessThanOrEqual(80);
    expect(f.message).not.toContain('LEAK');
    expect(f.message).not.toContain('zzz');
  });

  it("FM-api-error: a non-SDK throw is also CallFailed 'error' with a short message", async () => {
    const { sdk } = stub(async () => {
      throw new Error('boom '.repeat(100));
    });
    const f = (await createHaikuComplete(sdk)(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(false);
    expect(f.message.length).toBeLessThanOrEqual(80);
  });

  it("FM-refusal: stop_reason 'refusal' returns normally with the text there is", async () => {
    const { sdk } = stub(async () => reply({ stop_reason: 'refusal', content: [{ type: 'text', text: 'no' }] }));
    const r = await createHaikuComplete(sdk)(PROMPT, 1000);
    expect(r.text).toBe('no');
    const empty = stub(async () => reply({ stop_reason: 'refusal', content: [] }));
    expect((await createHaikuComplete(empty.sdk)(PROMPT, 1000)).text).toBe('');
  });
});
