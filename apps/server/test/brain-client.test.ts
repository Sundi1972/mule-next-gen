import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { BRAIN } from '@mule/engine';
import { buildPrompt, PERSONAS, type DecisionContext, type Prompt } from '@mule/ai';
import { CallFailed, createHaikuComplete, type HaikuSdk } from '../src/brain/client.js';

const CONTEXT: DecisionContext = {
  kind: 'land',
  seat: 'p2',
  name: 'The Gambler',
  month: 3,
  maxMonths: 12,
  summary: 'You hold 2 plots and 400 gold.',
  seed: 1,
  pickTolerance: 0.1,
  tableTalk: [],
};
const PROMPT: Prompt = buildPrompt(
  [{ id: 'A', key: 'river', label: 'Claim river plot', utility: 0.5, value: 1, rationale: 'because river' }],
  PERSONAS.trader,
  CONTEXT,
);

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
  } as unknown as Reply; // the stub omits server-only Message fields (container, stop_details, ...)
}

function stub(result: (options: Parameters<Create>[1]) => Promise<Reply>) {
  const calls: Array<{ params: Parameters<Create>[0]; options: Parameters<Create>[1] }> = [];
  const sdk: HaikuSdk = {
    messages: {
      create: ((params: Parameters<Create>[0], options: Parameters<Create>[1]) => {
        calls.push({ params, options });
        return result(options);
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
      system: [{ type: 'text', text: PROMPT.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: PROMPT.user }],
      output_config: { format: { type: 'json_schema', schema: PROMPT.schema } },
    });
    expect(calls[0]!.options).toEqual({ timeout: 7000, maxRetries: 0, signal: expect.any(AbortSignal) });
    expect(calls[0]!.options.signal!.aborted).toBe(false);
  });

  it('INV-HC3: a fractional wait is rounded up for the SDK, which rejects non-integer timeouts', async () => {
    const { sdk, calls } = stub(async () => reply());
    await createHaikuComplete(sdk)(PROMPT, 1000.4);
    expect(calls[0]!.options.timeout).toBe(1001);
  });

  it("INV-HC3: a body read that never ends settles as CallFailed 'timeout' at waitMs", async () => {
    vi.useFakeTimers();
    try {
      // Settles only when the signal aborts, as a stalled response.json() does: with a raw AbortError, not APIUserAbortError.
      const stalled = stub(
        (options) =>
          new Promise<Reply>((_, reject) => {
            options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      let settled: unknown;
      const p = createHaikuComplete(stalled.sdk, clock(5000))(PROMPT, 5000).then(
        (v) => (settled = v),
        (e: unknown) => (settled = e),
      );
      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(settled).toBeInstanceOf(CallFailed);
      const f = settled as CallFailed;
      expect(f.outcome).toBe('timeout');
      expect(f.auth).toBe(false);
      expect(f.usage).toEqual(ZERO);
      expect(f.ms).toBe(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("INV-usage: usage maps to the ledger's fields; null or missing counts are 0; text joins the text blocks", async () => {
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

    const missing = stub(async () => reply({ usage: { input_tokens: 5, output_tokens: 6 } }));
    const m = await createHaikuComplete(missing.sdk)(PROMPT, 1000);
    expect(m.usage).toEqual({ input: 5, cached_read: 0, cache_write: 0, output: 6 });
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

  const apiErrors: Array<{ name: string; make: (leak: string) => Error; message: string }> = [
    {
      name: '500',
      make: (leak) => Anthropic.APIError.generate(500, { type: 'error', error: { type: 'x', message: leak } }, leak, new Headers({ 'x-secret': 'h' })),
      message: 'model call failed: api status 500',
    },
    {
      name: '429',
      make: (leak) => Anthropic.APIError.generate(429, { type: 'error', error: { type: 'x', message: leak } }, leak, new Headers()),
      message: 'model call failed: api status 429',
    },
    {
      name: 'a connection error that is not a timeout',
      make: (leak) => new Anthropic.APIConnectionError({ message: leak }),
      message: 'model call failed: connection failed',
    },
  ];
  it.each(apiErrors)("FM-api-error: $name throws CallFailed outcome 'error', auth false, with only our own short message", async ({ make, message }) => {
    const leak = `sk-ant-LEAK x-request-id=abc ${'z'.repeat(500)}`;
    const { sdk } = stub(async () => {
      throw make(leak);
    });
    const f = (await createHaikuComplete(sdk)(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(false);
    expect(f.message).toBe(message);
    expect(f.message).not.toContain('sk-ant');
  });

  it("FM-api-error: a non-SDK throw is also CallFailed 'error' with a short message", async () => {
    const { sdk } = stub(async () => {
      throw new Error('boom '.repeat(100));
    });
    const f = (await createHaikuComplete(sdk)(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(false);
    expect(f.message).toBe('model call failed');
    expect(f.message).not.toContain('boom');
  });

  it("FM-refusal: stop_reason 'refusal' returns normally with the text there is", async () => {
    const { sdk } = stub(async () => reply({ stop_reason: 'refusal', content: [{ type: 'text', text: 'no' }] }));
    const r = await createHaikuComplete(sdk)(PROMPT, 1000);
    expect(r.text).toBe('no');
    expect(r.stopReason).toBe('refusal');
    const empty = stub(async () => reply({ stop_reason: 'refusal', content: [] }));
    expect((await createHaikuComplete(empty.sdk)(PROMPT, 1000)).text).toBe('');
  });
});
