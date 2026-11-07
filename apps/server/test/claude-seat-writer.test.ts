import { describe, expect, it } from 'vitest';
import type { WriterBrief } from '@mule/ai';
import type { PlaybookAsk } from '../src/brain/index.js';
import { ClaudeSeatWriter } from '../src/claude-seat/writer.js';

const OFFER = '/auction/food/limit';

const brief = (): WriterBrief => ({
  text: 'The auction opens on food.',
  plans: [],
  corners: false,
  strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 4, byMonth: 12 }, stances: {}, reason: 'draft' },
  offers: [{ path: OFFER, to: { type: 'number' } }],
  strategyOffered: false,
});

const askWith = (signal: AbortSignal): PlaybookAsk => ({ brief: brief(), system: 'rules', waitMs: 30_000, signal });

/** Whether `p` has settled by the time the microtasks already queued have run: no timer, no later tick. */
async function settledNow<T>(p: Promise<T>): Promise<{ value: T } | 'pending'> {
  const pending = Symbol('pending');
  const first = await Promise.race([p, Promise.resolve(pending)]);
  return first === pending ? 'pending' : { value: first as T };
}

describe('ClaudeSeatWriter', () => {
  it('T-AC-2: write resolves no_reply in the tick its signal aborts; a later submit is too late', async () => {
    const writer = new ClaudeSeatWriter({ id: 's2', persona: 'trader' });
    const controller = new AbortController();
    const written = writer.write('playbook', askWith(controller.signal));
    const ask = writer.openAsk();
    expect(ask).not.toBeNull();
    expect(await settledNow(written)).toBe('pending');

    controller.abort();

    expect(await settledNow(written)).toEqual({ value: { reply: { edits: [], line: null, cause: 'no_reply' }, refused: [] } });
    expect(writer.openAsk()).toBeNull();
    expect(await writer.submit(ask!.id, { edits: [{ path: OFFER, to: 40, reason: 'cheap' }], line: 'Food for all.' })).toEqual({ kind: 'too_late' });
  });

  it('T-AC-2: a submit in time resolves the write through the reply parser; a second answer is refused', async () => {
    const writer = new ClaudeSeatWriter({ id: 's2', persona: 'trader' });
    const written = writer.write('playbook', askWith(new AbortController().signal));
    const ask = writer.openAsk()!;

    const result = await writer.submit(ask.id, { edits: [{ path: OFFER, to: 40, reason: 'cheap' }, { path: '/strategy/kind', to: 'spoiler', reason: 'x' }], line: 'Food for all.' });

    expect(result).toEqual({ kind: 'accepted', accepted: [{ path: OFFER, to: 40, reason: 'cheap' }], refused: [{ path: '/strategy/kind', cause: 'path_not_offered' }] });
    expect(await written).toEqual({ reply: { edits: [{ path: OFFER, to: 40, reason: 'cheap' }], line: 'Food for all.' }, refused: [{ path: '/strategy/kind', cause: 'path_not_offered' }] });
    expect(await writer.submit(ask.id, { edits: [], line: '' })).toEqual({ kind: 'answered' });
    expect(await writer.submit('no-such-ask', { edits: [], line: '' })).toEqual({ kind: 'unknown_ask' });
  });

  it('T-AC-2: an ask already aborted, a wait not above 0, or a closed seat answers no_reply without an ask', async () => {
    const writer = new ClaudeSeatWriter({ id: 's2', persona: 'trader' });
    const aborted = new AbortController();
    aborted.abort();
    expect((await writer.write('playbook', askWith(aborted.signal))).reply.cause).toBe('no_reply');
    expect((await writer.write('playbook', { ...askWith(new AbortController().signal), waitMs: 0 })).reply.cause).toBe('no_reply');
    expect(writer.openAsk()).toBeNull();

    const open = writer.write('strategy', askWith(new AbortController().signal));
    writer.close();
    expect(await settledNow(open)).toEqual({ value: { reply: { edits: [], line: null, cause: 'no_reply' }, refused: [] } });
    expect((await writer.write('playbook', askWith(new AbortController().signal))).reply.cause).toBe('no_reply');
    expect(writer.over).toBe(true);
  });
});
