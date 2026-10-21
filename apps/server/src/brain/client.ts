import Anthropic from '@anthropic-ai/sdk';
import { BRAIN } from '@mule/engine';
import type { Prompt } from '@mule/ai';
import type { Usage } from './ledger.js';

/** The slice of the SDK this file calls. The server passes the real client; tests pass a stub. */
export interface HaikuSdk {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options: { timeout: number; maxRetries: number; signal?: AbortSignal },
    ): PromiseLike<Anthropic.Message>;
  };
}

/**
 * The real SDK, with the key passed in (HC-2). `authToken: null` stops the SDK reading ANTHROPIC_AUTH_TOKEN, and an
 * explicit credential stops it falling back to an `ant auth` profile.
 */
export function createAnthropicSdk(apiKey: string): HaikuSdk {
  return new Anthropic({ apiKey, authToken: null });
}

export interface HaikuReply {
  text: string;
  usage: Usage;
  ms: number;
  /** 'refusal' when the model's safeguards declined (AM-8); the server's wrapper records outcome 'refused'. */
  stopReason: Anthropic.Message['stop_reason'];
}

const NO_USAGE: Usage = { input: 0, cached_read: 0, cache_write: 0, output: 0 };
const MAX_MESSAGE = 80;

/** A call that produced nothing billable. The message is ours and short; the SDK's text never leaves this file. */
export class CallFailed extends Error {
  readonly usage: Usage = { ...NO_USAGE };
  constructor(
    message: string,
    readonly outcome: 'timeout' | 'error',
    readonly auth: boolean,
    readonly ms: number,
  ) {
    super(message.slice(0, MAX_MESSAGE));
    this.name = 'CallFailed';
  }
}

function fail(e: unknown, ms: number, waitMs: number, aborted: boolean): CallFailed {
  // Our own abort is checked first: an abort during the body read surfaces as a raw DOMException, not an SDK error.
  if (aborted || e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError) {
    return new CallFailed(`model call timed out (wait ${waitMs} ms)`, 'timeout', false, ms);
  }
  if (e instanceof Anthropic.APIError) {
    const auth = e.status === 401 || e.status === 403;
    const what = e.status === undefined ? 'connection failed' : `api status ${e.status}`;
    return new CallFailed(`model call failed: ${what}`, 'error', auth, ms);
  }
  return new CallFailed('model call failed', 'error', false, ms);
}

/** A mutable deep copy: the readonly PromptSchema is not assignable to the SDK's `{ [key: string]: unknown }`. */
function copyOf(schema: Prompt['schema']): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema));
}

/** Null (the SDK's value for a cache field that does not apply) or a missing field is 0, never NaN. */
const count = (n: number | null | undefined): number => n ?? 0;

/** The decider's port over Haiku: one try, no retries, never waits past waitMs, reports what it was billed. */
export function createHaikuComplete(
  sdk: HaikuSdk,
  now: () => number = () => performance.now(),
): (prompt: Prompt, waitMs: number) => Promise<HaikuReply> {
  return async (prompt, waitMs) => {
    const start = now();
    // The SDK's timeout stops at the response headers; this abort bounds the body read too (AM-8).
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
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const u = res.usage;
    return {
      text,
      ms,
      stopReason: res.stop_reason,
      usage: {
        input: count(u.input_tokens),
        cached_read: count(u.cache_read_input_tokens),
        cache_write: count(u.cache_creation_input_tokens),
        output: count(u.output_tokens),
      },
    };
  };
}
