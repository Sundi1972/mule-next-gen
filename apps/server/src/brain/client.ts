import Anthropic from '@anthropic-ai/sdk';
import { BRAIN } from '@mule/engine';
import type { Prompt } from '@mule/ai';
import type { Usage } from './ledger.js';

/** The slice of the SDK this file calls. The server passes the real client; tests pass a stub. */
export interface HaikuSdk {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options: { timeout: number; maxRetries: number },
    ): PromiseLike<Anthropic.Message>;
  };
}

export interface HaikuReply {
  text: string;
  usage: Usage;
  ms: number;
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

function fail(e: unknown, ms: number, waitMs: number): CallFailed {
  if (e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError) {
    return new CallFailed(`model call timed out (wait ${waitMs} ms)`, 'timeout', false, ms);
  }
  if (e instanceof Anthropic.APIError) {
    const auth = e.status === 401 || e.status === 403;
    const what = e.status === undefined ? 'connection failed' : `api status ${e.status}`;
    return new CallFailed(`model call failed: ${what}`, 'error', auth, ms);
  }
  return new CallFailed('model call failed', 'error', false, ms);
}

/** A mutable deep copy of the schema (plain JSON, so a round trip is exact). */
function copyOf(schema: Prompt['schema']): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema));
}

/** Null counts (the SDK sends null when a cache field does not apply) are 0, never NaN. */
const count = (n: number | null | undefined): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** The decider's port over Haiku: one try, no retries, never waits past waitMs, reports what it was billed. */
export function createHaikuComplete(
  sdk: HaikuSdk,
  now: () => number = () => performance.now(),
): (prompt: Prompt, waitMs: number) => Promise<HaikuReply> {
  return async (prompt, waitMs) => {
    const start = now();
    let res: Anthropic.Message;
    try {
      res = await sdk.messages.create(
        {
          model: BRAIN.model,
          max_tokens: BRAIN.maxTokens,
          thinking: { type: 'disabled' },
          system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: prompt.user }],
          // The prompt's schema is shared and frozen; the SDK gets its own mutable copy.
          output_config: { format: { type: 'json_schema', schema: copyOf(prompt.schema) } },
        },
        { timeout: waitMs, maxRetries: 0 },
      );
    } catch (e) {
      throw fail(e, now() - start, waitMs);
    }
    const ms = now() - start;
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const u = res.usage;
    return {
      text,
      ms,
      usage: {
        input: count(u.input_tokens),
        cached_read: count(u.cache_read_input_tokens),
        cache_write: count(u.cache_creation_input_tokens),
        output: count(u.output_tokens),
      },
    };
  };
}
