/** Fakes the brain tests share: the SDK module and client, SDK messages, the dummy key, worstUsdOf and the ledger reader. */
import { BRAIN } from '@mule/engine';
import type { DecisionKind } from '@mule/ai';
import type { HaikuSdk } from '../src/brain/client.js';
import { NO_USAGE, readLedgerLines, type Usage } from '../src/brain/ledger.js';

// Nothing here may import the SDK at runtime: the mocked module's factory loads this file.

/** Dummy values only: no test reads, prints or sends a real credential. */
export const KEY = { ANTHROPIC_API_KEY: 'test-key-not-real' };

type Create = HaikuSdk['messages']['create'];
export type SdkParams = Parameters<Create>[0];
type SdkOptions = Parameters<Create>[1];
export type SdkMessage = Awaited<ReturnType<Create>>;

/** A reply as the SDK returns it, billed `usage` (in the ledger's terms; unset counts are 0). */
export function sdkMessage(text: string, usage: Partial<Usage> = {}, stopReason: SdkMessage['stop_reason'] = 'end_turn'): SdkMessage {
  const billed = { ...NO_USAGE, ...usage };
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: BRAIN.model,
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: billed.input,
      cache_read_input_tokens: billed.cached_read,
      cache_creation_input_tokens: billed.cache_write,
      output_tokens: billed.output,
    },
  } as unknown as SdkMessage; // the fake omits server-only Message fields (citations, container, stop_details, ...)
}

export interface FakeSdk extends HaikuSdk {
  /** Every request, oldest first. */
  readonly requests: Array<{ params: SdkParams; options: SdkOptions }>;
  readonly calls: number;
}

/** A stand-in for the SDK client: the client's real code runs on top of it. `n` counts calls from 1; a throw rejects. */
export function fakeSdk(answer: (n: number, params: SdkParams, options: SdkOptions) => SdkMessage | Promise<SdkMessage>): FakeSdk {
  const requests: FakeSdk['requests'] = [];
  return {
    requests,
    get calls() {
      return requests.length;
    },
    messages: {
      create(params, options) {
        requests.push({ params, options });
        const n = requests.length;
        return Promise.resolve().then(() => answer(n, params, options));
      },
    },
  };
}

/** What the mocked SDK module's constructor was given, and how its clients answer (null: every call rejects). */
export interface SdkModuleFake {
  built: unknown[];
  create: ((params: SdkParams, options: SdkOptions) => Promise<SdkMessage>) | null;
}

/** The system text and the user text of a request, as the client sends them. */
export function promptOf(params: SdkParams): { system: string; user: string } {
  const [system] = Array.isArray(params.system) ? params.system : [];
  const user = params.messages[0]?.content;
  if (!system || typeof user !== 'string') throw new Error('not a request the brain client sends');
  return { system: system.text, user };
}

/**
 * The @anthropic-ai/sdk module with a client class that records its options and never reaches the network. Statics
 * such as the error classes resolve to the real ones through the prototype chain, so instanceof checks still hold.
 * vi.mock is hoisted per file, so each file keeps its own call:
 * `vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, state))`.
 */
export async function fakeSdkModule(importOriginal: () => Promise<unknown>, fake: SdkModuleFake) {
  const real = (await importOriginal()) as typeof import('@anthropic-ai/sdk');
  class FakeAnthropic {
    readonly messages = {
      create: (params: SdkParams, options: SdkOptions) => (fake.create ? fake.create(params, options) : Promise.reject(new Error('no reply set'))),
    };
    constructor(options: unknown) {
      fake.built.push(options);
    }
  }
  Object.setPrototypeOf(FakeAnthropic, real.Anthropic);
  return { ...real, default: FakeAnthropic, Anthropic: FakeAnthropic };
}

/** RULE-3's worst case for a prompt of `chars` characters, from BRAIN's constants (not from the budget under test). */
export function worstUsdOf(chars: number): number {
  const p = BRAIN.pricesPerMTok;
  const tokens = Math.ceil(chars / BRAIN.charsPerToken);
  return (tokens * Math.max(p.input, p.cacheWrite) + BRAIN.maxTokens * p.output) / 1_000_000;
}

/** Every line of the ledger file, as plain records: readLedgerLines, for tests that read fields by name. */
export function readLedger(file: string): Record<string, unknown>[] {
  return readLedgerLines(file).map((l) => ({ ...l }));
}

/** What a request asks: its decision kind, the seat's name, the user text and its lines, and the lines inside the table-talk block. */
export function requestOf(params: SdkParams): { kind: DecisionKind; seat: string; user: string; lines: string[]; talk: string[] } {
  const { user } = promptOf(params);
  const lines = user.split('\n');
  const kind = /^Decision: (\w+)$/m.exec(user)?.[1];
  const seat = /^You are (.+)\. Month \d+ of \d+\.$/m.exec(user)?.[1];
  if (kind === undefined || seat === undefined) throw new Error('not a decision prompt');
  const open = lines.indexOf('<table_talk>');
  const close = lines.indexOf('</table_talk>');
  return { kind: kind as DecisionKind, seat, user, lines, talk: open < 0 ? [] : lines.slice(open + 1, close) };
}

/** RULE-3's worst case for the request the SDK received: its system text, user text and schema. */
export function worstUsdOfRequest(params: SdkParams): number {
  const { system, user } = promptOf(params);
  return worstUsdOf(system.length + user.length + JSON.stringify(params.output_config?.format?.schema).length);
}

/** A call that never answers: it rejects only when the client aborts it at its wait. */
export const neverAnswers = (options: { signal?: AbortSignal }): Promise<never> =>
  new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(options.signal?.reason)));
