/** deep2 monitoring (6 Nov): a recording brain keeps every model call's request and whole response, thinking included. */
import { describe, expect, it } from 'vitest';
import { recordingSdk, type TranscriptEntry } from '../src/brain/transcript.js';
import { fakeSdk, sdkMessage, type SdkMessage, type SdkParams } from './brain-fakes.js';

const params = (thinking: SdkParams['thinking']): SdkParams =>
  ({
    model: 'claude-opus-5-5',
    max_tokens: 16_000,
    thinking,
    system: [{ type: 'text', text: 'The manual.' }],
    messages: [{ role: 'user', content: 'Your brief.' }],
    tools: [{ name: 'standings', description: 'Every seat.', input_schema: { type: 'object', properties: {} } }],
  }) as SdkParams;

const withThinking = (): SdkMessage => {
  const m = sdkMessage('{"edits":[],"line":""}', { input: 10, output: 5 });
  (m.content as unknown[]).unshift({ type: 'thinking', thinking: 'Food is short; buy early.', signature: 'sig' });
  return m;
};

describe('deep2: the transcript of every model call', () => {
  it('deep2: each call is recorded with its request and its whole response, and asks for its thinking summarized', async () => {
    const entries: TranscriptEntry[] = [];
    const inner = fakeSdk(() => withThinking());
    const sdk = recordingSdk(inner, (e) => entries.push(e), () => 0);
    const res = await sdk.messages.create(params({ type: 'adaptive' }), { timeout: 1_000, maxRetries: 0 });
    expect(inner.requests[0]!.params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(res.content[0]).toMatchObject({ type: 'thinking', thinking: 'Food is short; buy early.' });
    expect(entries).toHaveLength(1);
    const [e] = entries;
    expect(e!.request.model).toBe('claude-opus-5-5');
    expect(e!.request.system).toBe('The manual.');
    expect(e!.request.messages).toEqual([{ role: 'user', content: 'Your brief.' }]);
    expect(e!.request.tools).toEqual(['standings']);
    expect(e!.response?.content).toEqual(res.content);
    expect(e!.response?.usage).toMatchObject({ input_tokens: 10, output_tokens: 5 });
  });

  it('deep2: a call that throws is recorded with its error and still throws; a call without thinking keeps its thinking setting', async () => {
    const entries: TranscriptEntry[] = [];
    const inner = fakeSdk(() => {
      throw new Error('boom');
    });
    const sdk = recordingSdk(inner, (e) => entries.push(e), () => 0);
    await expect(sdk.messages.create(params({ type: 'disabled' }), { timeout: 1_000, maxRetries: 0 })).rejects.toThrow('boom');
    expect(inner.requests[0]!.params.thinking).toEqual({ type: 'disabled' });
    expect(entries[0]!.response).toBeNull();
    expect(entries[0]!.error).toBe('Error');
  });
});
