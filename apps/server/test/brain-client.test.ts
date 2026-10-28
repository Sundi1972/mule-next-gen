import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { BRAIN } from '@mule/engine';
import { buildPrompt, PERSONAS, type DecisionContext, type DecisionKind, type Prompt } from '@mule/ai';
import { billUnknown, CallFailed, createHaikuComplete, createWriteComplete, WRITE_KINDS, type WritePrompt } from '../src/brain/client.js';
import { fakeSdk, sdkMessage, type SdkMessage } from './brain-fakes.js';

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

const USABLE = '{"option":"a"}';
/** An SDK message with these fields exactly as the API might send them: other blocks, null or missing usage counts. */
const sent = (fields: Record<string, unknown>): SdkMessage => ({ ...sdkMessage(USABLE), ...fields }) as unknown as SdkMessage;

/** A clock that returns 1000 on the first read, then 1000 + step on every later read. */
const clock = (step: number) => {
  let n = 0;
  return () => (n++ === 0 ? 1000 : 1000 + step);
};

describe('Haiku client', () => {
  it('INV-HC3: the request is Haiku, thinking off, cached system, structured output, no retries, timeout = waitMs; no timer outlives it', async () => {
    const sdk = fakeSdk(() => sdkMessage(USABLE));
    vi.useFakeTimers();
    try {
      await createHaikuComplete(sdk)(PROMPT, 7000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    expect(sdk.requests).toHaveLength(1);
    expect(sdk.requests[0]!.params).toEqual({
      model: BRAIN.model,
      max_tokens: BRAIN.maxTokens,
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: PROMPT.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: PROMPT.user }],
      output_config: { format: { type: 'json_schema', schema: PROMPT.schema } },
    });
    expect(sdk.requests[0]!.options).toEqual({ timeout: 7000, maxRetries: 0, signal: expect.any(AbortSignal) });
    expect(sdk.requests[0]!.options.signal!.aborted).toBe(false);
  });

  it('INV-HC3: a fractional wait is rounded up for the SDK, which rejects non-integer timeouts', async () => {
    const sdk = fakeSdk(() => sdkMessage(USABLE));
    await createHaikuComplete(sdk)(PROMPT, 1000.4);
    expect(sdk.requests[0]!.options.timeout).toBe(1001);
  });

  it("INV-HC3: a body read that never ends settles as CallFailed 'timeout' at waitMs", async () => {
    vi.useFakeTimers();
    try {
      // Settles only when the signal aborts, as a stalled response.json() does: with a raw AbortError, not APIUserAbortError.
      const stalled = fakeSdk(
        (_n, _params, options) =>
          new Promise<SdkMessage>((_, reject) => {
            options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      let settled: unknown;
      const p = createHaikuComplete(stalled, clock(5000))(PROMPT, 5000).then(
        (v) => (settled = v),
        (e: unknown) => (settled = e),
      );
      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(vi.getTimerCount()).toBe(0);
      expect(settled).toBeInstanceOf(CallFailed);
      const f = settled as CallFailed;
      expect(f.outcome).toBe('timeout');
      expect(f.auth).toBe(false);
      expect(f.ms).toBe(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("INV-usage: usage maps to the ledger's fields; null or missing counts are 0; text joins the text blocks", async () => {
    const full = fakeSdk(() =>
      sent({
        content: [
          { type: 'text', text: 'ab' },
          { type: 'thinking', thinking: 'x', signature: 's' },
          { type: 'text', text: 'cd' },
        ],
        usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
      }),
    );
    const r = await createHaikuComplete(full, clock(250))(PROMPT, 1000);
    expect(r.text).toBe('abcd');
    expect(r.usage).toEqual({ input: 1, cached_read: 3, cache_write: 4, output: 2 });
    expect(r.ms).toBe(250);

    const nulls = fakeSdk(() =>
      sent({ usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: null, cache_creation_input_tokens: null } }),
    );
    const n = await createHaikuComplete(nulls)(PROMPT, 1000);
    expect(n.usage).toEqual({ input: 5, cached_read: 0, cache_write: 0, output: 6 });

    const missing = fakeSdk(() => sent({ usage: { input_tokens: 5, output_tokens: 6 } }));
    const m = await createHaikuComplete(missing)(PROMPT, 1000);
    expect(m.usage).toEqual({ input: 5, cached_read: 0, cache_write: 0, output: 6 });
  });

  it("FM-timeout: a connection timeout throws CallFailed outcome 'timeout', usage zero, ms measured", async () => {
    const sdk = fakeSdk(() => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    const err = await createHaikuComplete(sdk, clock(900))(PROMPT, 1000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CallFailed);
    const f = err as CallFailed;
    expect(f.outcome).toBe('timeout');
    expect(f.auth).toBe(false);
    expect(f.ms).toBe(900);
  });

  it("FM-timeout: an abort is also a 'timeout'", async () => {
    const sdk = fakeSdk(() => {
      throw new Anthropic.APIUserAbortError();
    });
    const f = (await createHaikuComplete(sdk)(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('timeout');
  });

  it.each([401, 403])("FM-auth: a %i throws CallFailed outcome 'error', auth true", async (status) => {
    const sdk = fakeSdk(() => {
      throw Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'nope' } }, 'nope', new Headers());
    });
    const f = (await createHaikuComplete(sdk, clock(5))(PROMPT, 1000).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(true);
    expect(f.ms).toBe(5);
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
    const sdk = fakeSdk(() => {
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
    const sdk = fakeSdk(() => {
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
    const sdk = fakeSdk(() => sdkMessage('no', {}, 'refusal'));
    const r = await createHaikuComplete(sdk)(PROMPT, 1000);
    expect(r.text).toBe('no');
    expect(r.stopReason).toBe('refusal');
    const empty = fakeSdk(() => sent({ stop_reason: 'refusal', content: [] }));
    expect((await createHaikuComplete(empty)(PROMPT, 1000)).text).toBe('');
  });
});

/** A strategy or playbook prompt: the port sends any JSON schema as it is given. */
const WRITE: WritePrompt = {
  system: "You write a seat's strategy.",
  user: 'Month 2. Write the strategy.',
  schema: { type: 'object', properties: { line: { type: 'string' } }, required: ['line'], additionalProperties: false },
};
const MOVES: readonly DecisionKind[] = ['land', 'develop', 'trade'];
const movePrompt = (kind: DecisionKind): Prompt =>
  buildPrompt([{ id: 'A', key: 'river', label: 'Claim river plot', utility: 0.5, value: 1, rationale: 'because river' }], PERSONAS.trader, { ...CONTEXT, kind });

describe("T-AC-A6: strategy and playbook calls send adaptive thinking with BRAIN's model and effort for their kind; move calls keep thinking off and Haiku", () => {
  it.each(WRITE_KINDS)("T-AC-A6: a %s call sends adaptive thinking at its kind's model, effort, reply cap and wait, one try; no timer outlives it", async (kind) => {
    const settings = BRAIN.writeCalls[kind];
    const sdk = fakeSdk(() => sdkMessage(USABLE));
    vi.useFakeTimers();
    try {
      await createWriteComplete(sdk)(kind, WRITE);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    expect(sdk.requests).toHaveLength(1);
    expect(sdk.requests[0]!.params).toEqual({
      model: settings.model,
      max_tokens: settings.maxTokens,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: WRITE.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: WRITE.user }],
      output_config: { effort: settings.effort, format: { type: 'json_schema', schema: WRITE.schema } },
    });
    expect(sdk.requests[0]!.options).toEqual({ timeout: settings.timeoutMs, maxRetries: 0, signal: expect.any(AbortSignal) });
  });

  it.each(WRITE_KINDS)("T-AC-A6: a %s call sends the model its caller names, the fallback included, with its kind's other settings", async (kind) => {
    const sdk = fakeSdk(() => sdkMessage(USABLE));
    await createWriteComplete(sdk)(kind, WRITE, BRAIN.writeFallbackModel);
    expect(sdk.requests[0]!.params).toMatchObject({
      model: BRAIN.writeFallbackModel,
      max_tokens: BRAIN.writeCalls[kind].maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: BRAIN.writeCalls[kind].effort },
    });
  });

  it.each(MOVES)('T-AC-A6: a %s call keeps thinking off, on BRAIN.model, with no effort', async (kind) => {
    const sdk = fakeSdk(() => sdkMessage(USABLE));
    await createHaikuComplete(sdk)(movePrompt(kind), BRAIN.landTimeoutMs);
    const params = sdk.requests[0]!.params;
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.model).toBe(BRAIN.model);
    expect(params.max_tokens).toBe(BRAIN.maxTokens);
    expect(params.output_config).not.toHaveProperty('effort');
  });

  it("T-AC-A6: a write call whose body never ends settles as CallFailed 'timeout' at its kind's wait, its bill unknown", async () => {
    vi.useFakeTimers();
    try {
      const stalled = fakeSdk(
        (_n, _params, options) =>
          new Promise<SdkMessage>((_, reject) => {
            options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const wait = BRAIN.writeCalls.strategy.timeoutMs;
      let settled: unknown;
      const p = createWriteComplete(stalled, clock(wait))('strategy', WRITE).then(
        (v) => (settled = v),
        (e: unknown) => (settled = e),
      );
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(vi.getTimerCount()).toBe(0);
      expect(settled).toBeInstanceOf(CallFailed);
      expect((settled as CallFailed).outcome).toBe('timeout');
      expect((settled as CallFailed).ms).toBe(wait);
      expect(billUnknown(null, settled)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T-AC-A6: a 401 on a write call is CallFailed 'error', auth true, answered so billed nothing, with only our message and no retry", async () => {
    const sdk = fakeSdk(() => {
      throw Anthropic.APIError.generate(401, { type: 'error', error: { type: 'x', message: 'sk-ant-LEAK' } }, 'sk-ant-LEAK', new Headers());
    });
    const f = (await createWriteComplete(sdk)('playbook', WRITE).catch((e: unknown) => e)) as CallFailed;
    expect(f).toBeInstanceOf(CallFailed);
    expect(f.outcome).toBe('error');
    expect(f.auth).toBe(true);
    expect(billUnknown(null, f)).toBe(false);
    expect(f.message).not.toContain('sk-ant');
    expect(sdk.calls).toBe(1);
  });

  it('T-AC-A6: a write reply carries its text, usage and thinking tokens; a response without thinking tokens reads null', async () => {
    const withThinking = sent({
      usage: { input_tokens: 7, output_tokens: 9, cache_read_input_tokens: 3, cache_creation_input_tokens: null, output_tokens_details: { thinking_tokens: 40 } },
    });
    const r = await createWriteComplete(fakeSdk(() => withThinking))('strategy', WRITE);
    expect(r).toMatchObject({ text: USABLE, thinking: 40, stopReason: 'end_turn', usage: { input: 7, cached_read: 3, cache_write: 0, output: 9 } });
    const none = await createWriteComplete(fakeSdk(() => sdkMessage(USABLE)))('playbook', WRITE);
    expect(none.thinking).toBeNull();
  });
});
