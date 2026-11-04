import Anthropic from '@anthropic-ai/sdk';
import { BRAIN } from '@mule/engine';
import type { Prompt } from '@mule/ai';
import type { ModelId, Usage } from './ledger.js';

/** The slice of the SDK this file calls. The server passes the real client; tests pass a stub. */
export interface HaikuSdk {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options: { timeout: number; maxRetries: number; signal?: AbortSignal },
    ): PromiseLike<Anthropic.Message>;
  };
}

/** The public API host, pinned so a gateway URL left in the environment never receives the key. See HC-2. */
const API_HOST = 'https://api.anthropic.com';

/**
 * The real SDK, with the key passed in explicitly. `authToken: null` stops the SDK reading ANTHROPIC_AUTH_TOKEN, and an
 * explicit credential stops it falling back to an `ant auth` profile. `logLevel: 'off'` overrides ANTHROPIC_LOG, whose
 * debug level would log requests, prompts included. See HC-2.
 */
export function createAnthropicSdk(apiKey: string): HaikuSdk {
  return new Anthropic({ apiKey, authToken: null, baseURL: API_HOST, logLevel: 'off' });
}

export interface HaikuReply {
  text: string;
  usage: Usage;
  ms: number;
  /** 'refusal' when the model's safeguards declined. */
  stopReason: Anthropic.Message['stop_reason'];
}

const MAX_MESSAGE = 80;

/** A call that returned no reply. The message is ours and short; the SDK's text never leaves this file. */
export class CallFailed extends Error {
  constructor(
    message: string,
    readonly outcome: 'timeout' | 'error',
    readonly auth: boolean,
    readonly ms: number,
    /** The HTTP status the API answered with; null when no answer came (timeout, lost connection), so the bill is unknown. */
    readonly status: number | null = null,
  ) {
    super(message.slice(0, MAX_MESSAGE));
    this.name = 'CallFailed';
  }
}

/**
 * Whether a settled call's bill is unknown. A reply carries its usage, and an HTTP status shows the API answered and
 * billed nothing; anything else (a timeout, a lost connection, a raw error) may have been billed.
 */
export function billUnknown(reply: HaikuReply | null, failure: unknown): boolean {
  if (reply !== null) return false;
  return !(failure instanceof CallFailed) || failure.status === null;
}

/** A failed SDK call as a CallFailed: timeout, auth (401/403), an answered status, or no answer. */
export function fail(e: unknown, ms: number, waitMs: number, aborted: boolean): CallFailed {
  // Our own abort is checked first: an abort during the body read surfaces as a raw DOMException, not an SDK error.
  if (aborted || e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError) {
    return new CallFailed(`model call timed out (wait ${waitMs} ms)`, 'timeout', false, ms);
  }
  if (e instanceof Anthropic.APIError) {
    const auth = e.status === 401 || e.status === 403;
    const what = e.status === undefined ? 'connection failed' : `api status ${e.status}`;
    return new CallFailed(`model call failed: ${what}`, 'error', auth, ms, e.status ?? null);
  }
  return new CallFailed('model call failed', 'error', false, ms);
}

/** A mutable deep copy: a readonly schema is not assignable to the SDK's `{ [key: string]: unknown }`. */
function copyOf(schema: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema));
}

/** Null (the SDK's value for a cache field that does not apply) or a missing field is 0, never NaN. */
const count = (n: number | null | undefined): number => n ?? 0;

/** A response's billed tokens in the ledger's terms. */
const usageOf = (u: Anthropic.Usage): Usage => ({
  input: count(u.input_tokens),
  cached_read: count(u.cache_read_input_tokens),
  cache_write: count(u.cache_creation_input_tokens),
  output: count(u.output_tokens),
});

/** A response's text blocks, joined; thinking blocks are left out. */
const textOf = (res: Anthropic.Message): string => res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');

/** The decider's port over Haiku: one try, no retries, never waits past waitMs, reports what it was billed. */
export function createHaikuComplete(
  sdk: HaikuSdk,
  now: () => number = () => performance.now(),
): (prompt: Prompt, waitMs: number) => Promise<HaikuReply> {
  return async (prompt, waitMs) => {
    const start = now();
    // The SDK's timeout stops at the response headers; this abort bounds the body read too.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    let res: Anthropic.Message;
    try {
      res = await sdk.messages.create(
        {
          model: BRAIN.model,
          max_tokens: BRAIN.maxTokens,
          thinking: { type: 'disabled' },
          system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: prompt.user }],
          output_config: { format: { type: 'json_schema', schema: copyOf(prompt.schema) } },
        },
        { timeout: Math.ceil(waitMs), maxRetries: 0, signal: controller.signal },
      );
    } catch (e) {
      throw fail(e, now() - start, waitMs, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }
    const ms = now() - start;
    return { text: textOf(res), ms, stopReason: res.stop_reason, usage: usageOf(res.usage) };
  };
}

/** What a thinking call sends: its model, its effort, a reply cap that includes the thinking, and its wait in ms. */
export interface ThinkingCall {
  model: ModelId;
  effort: NonNullable<Anthropic.OutputConfig['effort']>;
  maxTokens: number;
  timeoutMs: number;
}

/** A prompt for a thinking call: the cached system text, the user text and the reply's JSON schema. */
export interface WritePrompt {
  system: string;
  user: string;
  schema: object;
}

export interface ThinkingReply extends HaikuReply {
  /** usage.output_tokens_details.thinking_tokens, or null when the response carries none. */
  thinking: number | null;
}

/**
 * The port for thinking calls: adaptive thinking at the call's effort, the schema; one try, no retries, never past its
 * wait. The caller's `signal` cancels the request too, as its wait running out does.
 */
export function createThinkingComplete(
  sdk: HaikuSdk,
  now: () => number = () => performance.now(),
): (call: ThinkingCall, prompt: WritePrompt, signal?: AbortSignal) => Promise<ThinkingReply> {
  return async (call, prompt, signal) => {
    const start = now();
    // The SDK's timeout stops at the response headers; this abort bounds the body read too.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), call.timeoutMs);
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    let res: Anthropic.Message;
    try {
      res = await sdk.messages.create(
        {
          model: call.model,
          max_tokens: call.maxTokens,
          thinking: { type: 'adaptive' },
          system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: prompt.user }],
          output_config: { effort: call.effort, format: { type: 'json_schema', schema: copyOf(prompt.schema) } },
        },
        { timeout: Math.ceil(call.timeoutMs), maxRetries: 0, signal: controller.signal },
      );
    } catch (e) {
      throw fail(e, now() - start, call.timeoutMs, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    const ms = now() - start;
    return {
      text: textOf(res),
      ms,
      stopReason: res.stop_reason,
      thinking: res.usage.output_tokens_details?.thinking_tokens ?? null,
      usage: usageOf(res.usage),
    };
  };
}

/** The game's tools for one call, as packages/ai's toolsFor makes them: MCP-shaped definitions and a handler that never throws. */
export interface ToolBox {
  definitions: readonly { name: string; description: string; input_schema: object }[];
  run(name: string, input: unknown): { content: string; is_error?: true };
}

/** What the tool loop asks its caller around each round trip: the budget before it, the ledger after it. */
export interface RoundGate {
  /**
   * Before round `round`, with the request's text so far (the prompt, its user text grown by every tool result): the
   * model it goes to, or null when its worst case fits no longer. `current` is the model of the rounds before; null
   * on round 1, when the gate picks one.
   */
  before(round: number, text: WritePrompt, current: ModelId | null): ModelId | null;
  /** After round `round`: its reply, or what it threw; `more` when it asked for tools and the loop goes on. */
  after(round: number, model: ModelId, reply: ThinkingReply | null, failure: unknown, more: boolean): void;
}

/** The loop stopped before a round trip (RULE-A4): its share ran out ('budget'), or its wait did ('deadline'). */
export class Stopped extends Error {
  constructor(
    readonly why: 'budget' | 'deadline',
    readonly round: number,
    readonly model: ModelId | null,
  ) {
    super(`tool loop stopped: ${why}`);
    this.name = 'Stopped';
  }
}

/** The last round's note: no tools now, the answer. */
const ANSWER_NOW = 'No more tools in this call: reply now, with JSON only, in the shape the schema gives.';

/**
 * The tool loop for one strategy or playbook call (C9, RULE-A4). Each round trip is one thinking call, cancelled by
 * `signal` and never past the call's wait from the first round's start. The tools are offered for BRAIN.toolRounds
 * rounds, then one more round without them asks for the answer. The gate checks the budget before every round and
 * ledgers every round after it. A round that asked for tools runs them in process and sends their results; the
 * handlers never throw. Returns the last round's reply and its model.
 */
export function createToolLoop(
  sdk: HaikuSdk,
  now: () => number = () => performance.now(),
): (call: Omit<ThinkingCall, 'model'>, prompt: WritePrompt, tools: ToolBox | undefined, gate: RoundGate, signal?: AbortSignal) => Promise<{ reply: ThinkingReply; model: ModelId }> {
  return async (call, prompt, tools, gate, signal) => {
    const start = now();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt.user }];
    let seen = prompt.user;
    let model: ModelId | null = null;
    for (let round = 1; ; round++) {
      const left = call.timeoutMs - (now() - start);
      if (signal?.aborted || !(left > 0)) throw new Stopped('deadline', round, model);
      const picked = gate.before(round, { ...prompt, user: seen }, model);
      if (picked === null) throw new Stopped('budget', round, model);
      model = picked;
      const offer = tools !== undefined && round <= BRAIN.toolRounds;
      const roundStart = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), left);
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      let res: Anthropic.Message;
      try {
        res = await sdk.messages.create(
          {
            model,
            max_tokens: call.maxTokens,
            thinking: { type: 'adaptive' },
            system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
            messages,
            ...(offer ? { tools: tools.definitions.map((d) => ({ name: d.name, description: d.description, input_schema: copyOf(d.input_schema) as Anthropic.Tool.InputSchema })) } : {}),
            output_config: { effort: call.effort, format: { type: 'json_schema', schema: copyOf(prompt.schema) } },
          },
          { timeout: Math.ceil(left), maxRetries: 0, signal: controller.signal },
        );
      } catch (e) {
        const failed = fail(e, now() - roundStart, left, controller.signal.aborted);
        gate.after(round, model, null, failed, false);
        throw failed;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
      const reply: ThinkingReply = {
        text: textOf(res),
        ms: now() - roundStart,
        stopReason: res.stop_reason,
        thinking: res.usage.output_tokens_details?.thinking_tokens ?? null,
        usage: usageOf(res.usage),
      };
      const more = offer && res.stop_reason === 'tool_use';
      gate.after(round, model, reply, null, more);
      if (!more) return { reply, model };
      // The reply goes back as it came, thinking blocks included; the results answer each tool_use in order.
      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ContentBlockParam[] = res.content.flatMap((b) => {
        if (b.type !== 'tool_use') return [];
        // A handler that throws answers a code, never its text (RULE-A4 unknown); the loop goes on.
        let r: ReturnType<ToolBox['run']>;
        try {
          r = tools.run(b.name, b.input);
        } catch {
          r = { content: JSON.stringify({ error: 'tool_failed' }), is_error: true };
        }
        seen += r.content;
        return [{ type: 'tool_result' as const, tool_use_id: b.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) }];
      });
      if (round + 1 > BRAIN.toolRounds) results.push({ type: 'text', text: ANSWER_NOW });
      messages.push({ role: 'user', content: results });
    }
  };
}

/** The kinds of call that write a seat's strategy and its playbook edits. */
export const WRITE_KINDS = ['strategy', 'playbook'] as const;
export type WriteKind = (typeof WRITE_KINDS)[number];

/** BRAIN's settings per write kind, typed so that a kind naming an unpriced model or an unknown effort fails to compile. */
export const WRITE_CALLS: Readonly<Record<WriteKind, ThinkingCall>> = BRAIN.writeCalls;

/** The fallback model, typed so that an unpriced one fails to compile. */
export const WRITE_FALLBACK_MODEL: ModelId = BRAIN.writeFallbackModel;

/**
 * The port for strategy and playbook calls: the kind's BRAIN settings, sent to the model the caller names (the kind's
 * own by default), waiting at most `waitMs` when it is below the kind's timeoutMs, and cancelled by `signal`. It only
 * talks to the API; the caller checks the budget before and ledgers after.
 */
export function createWriteComplete(
  sdk: HaikuSdk,
  now?: () => number,
): (kind: WriteKind, prompt: WritePrompt, model?: ModelId, waitMs?: number, signal?: AbortSignal) => Promise<ThinkingReply> {
  const think = createThinkingComplete(sdk, now);
  return (kind, prompt, model = WRITE_CALLS[kind].model, waitMs = Infinity, signal) => {
    const call = WRITE_CALLS[kind];
    return think({ ...call, model, timeoutMs: Math.min(waitMs, call.timeoutMs) }, prompt, signal);
  };
}
