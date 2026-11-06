/**
 * A recording SDK for monitoring runs (brain:trial --deep): every model call's request and whole response go to a sink,
 * and a call with adaptive thinking asks for its thinking summarized, so the record shows the reasoning. Display only
 * changes what comes back, never what is thought or billed. Only for runs that ask for it: the key never reaches the sink.
 */
import type { HaikuSdk } from './client.js';

// Only client.ts imports the SDK (§9): the shapes come through its port.
type Params = Parameters<HaikuSdk['messages']['create']>[0];
type Message = Awaited<ReturnType<HaikuSdk['messages']['create']>>;

/** One model call: what was sent, what came back (null when it threw), and the error's class name when it did. */
export interface TranscriptEntry {
  t: string;
  ms: number;
  request: {
    model: string;
    system: string;
    messages: Params['messages'];
    tools: string[];
    output_config: Params['output_config'] | null;
    max_tokens: number;
  };
  response: { content: Message['content']; stop_reason: Message['stop_reason']; usage: Message['usage'] } | null;
  error?: string;
}

const systemText = (system: Params['system']): string =>
  typeof system === 'string' ? system : (system ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('\n');

/** The SDK, recording each call to `sink`; the sink's own failure never fails the call. */
export function recordingSdk(sdk: HaikuSdk, sink: (entry: TranscriptEntry) => void, now: () => number = () => Date.now()): HaikuSdk {
  return {
    messages: {
      async create(params, options) {
        const sent: Params = params.thinking?.type === 'adaptive' ? { ...params, thinking: { type: 'adaptive', display: 'summarized' } } : params;
        const request: TranscriptEntry['request'] = {
          model: sent.model,
          system: systemText(sent.system),
          messages: sent.messages,
          tools: (sent.tools ?? []).map((t) => ('name' in t ? t.name : t.type)),
          output_config: sent.output_config ?? null,
          max_tokens: sent.max_tokens,
        };
        const start = now();
        const write = (entry: TranscriptEntry) => {
          try {
            sink(entry);
          } catch {
            // A lost record must not lose the game's call.
          }
        };
        try {
          const res = await sdk.messages.create(sent, options);
          write({ t: new Date().toISOString(), ms: now() - start, request, response: { content: res.content, stop_reason: res.stop_reason, usage: res.usage } });
          return res;
        } catch (err) {
          write({ t: new Date().toISOString(), ms: now() - start, request, response: null, error: err instanceof Error ? err.name : 'unknown' });
          throw err;
        }
      },
    },
  };
}
