import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import type { SeatInfo } from '@tabletop/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext } from './fake-context.js';

/** S3-C10 and S3-C11: the three deal intents cross the wire and reach diplomacy.ts, from a phone or an AI seat alike. */

let running: MuleServer | null = null;
beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(async () => {
  await running?.close();
  running = null;
  vi.restoreAllMocks();
});

/** Brix's phone seated in a started room with one AI seat, on a real server. */
async function seatedPhone() {
  running = createMuleServer({ seed: () => 42, politics: true });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  /** The next error after the ones already seen. */
  const nextError = async () => {
    const seen = inbox.filter((m) => m.t === 'error').length;
    for (let i = 0; i < 200; i++) {
      const errors = inbox.filter((m) => m.t === 'error');
      if (errors.length > seen) return (errors.at(-1) as Extract<ServerEnvelope<MuleView>, { t: 'error' }>).message;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no error message');
  };
  send({ t: 'join', code, name: 'Brix' });
  send({ t: 'addAi' });
  send({ t: 'start' });
  let first: MuleView | undefined;
  for (let i = 0; i < 200 && !first; i++) {
    first = inbox.flatMap((m) => (m.t === 'view' && m.view.game?.phase === 'planning' ? [m.view.game] : [])).at(-1);
    if (!first) await new Promise((r) => setTimeout(r, 10));
  }
  if (!first) throw new Error('the game never reached planning');
  const intent = (i: object) => send({ t: 'intent', intent: i });
  /** What the server answers an intent: the rules' refusal, or 'Bad message' when the wire refuses its shape. */
  const answer = async (i: object) => {
    const error = nextError();
    intent(i);
    return error;
  };
  return { first, answer };
}

describe('S3-C10: the wire takes the three deal intents and refuses malformed ones', () => {
  it('well-formed deal intents reach the rules: each refusal is the rules’ own words, never "Bad message"', async () => {
    const { first, answer } = await seatedPhone();
    const me = first.me!.id;
    const ai = first.players.find((p) => p.isAi)!.id;

    expect(await answer({ type: 'offerDeal', offer: { to: me, terms: { kind: 'pact' }, months: 3 } })).toBe('Pick another player');
    expect(await answer({ type: 'offerDeal', offer: { to: ai, terms: { kind: 'pact' }, months: 2 } })).toMatch(/^A pact runs /);
    expect(await answer({ type: 'offerDeal', offer: { to: ai, terms: { kind: 'vote', law: true, yes: true } } })).toBe('No law is up for a vote');
    expect(await answer({ type: 'offerDeal', offer: { to: ai, terms: { kind: 'vote', office: 'governor', candidate: ai } } })).toMatch(/is not running for Governor$/);
    expect(await answer({ type: 'withdrawDeal', id: 'deal-nope' })).toBe('That card is no longer open');
    expect(await answer({ type: 'answerDeal', id: 'deal-nope', accept: true })).toBe('That card is no longer open');
  });

  it.each([
    { type: 'offerDeal' },
    { type: 'offerDeal', offer: null },
    { type: 'offerDeal', offer: { to: 7, terms: { kind: 'pact' }, months: 3 } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'bribe' } } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'pact' }, months: '3' } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'pact' }, months: 2.5 } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'vote' } } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'vote', office: 'mayor', candidate: 'p1' } } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'vote', office: 'governor', candidate: null } } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'vote', law: false, yes: true } } },
    { type: 'offerDeal', offer: { to: 'p1', terms: { kind: 'vote', law: true } } },
    { type: 'withdrawDeal' },
    { type: 'withdrawDeal', id: 3 },
    { type: 'answerDeal', id: 'deal-x' },
    { type: 'answerDeal', id: 'deal-x', accept: 'yes' },
    { type: 'answerDeal', accept: true },
  ])('refuses %j as a bad message', async (bad) => {
    const { answer } = await seatedPhone();
    expect(await answer(bad)).toBe('Bad message');
  });
});

/** Two people and one built-in computer seat. */
const TABLE: SeatInfo[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Lena', isAi: false, color: 1 },
  { id: 's3', name: 'The Accountant', isAi: true, color: 2 },
];

function startedGame(politics = true) {
  const fake = fakeContext({ table: TABLE });
  const game = new MuleGame(fake.ctx, 10, { politics });
  game.start(TABLE);
  return game;
}

const PACT = { to: 's2', terms: { kind: 'pact' as const }, months: 3 };

describe('S3-C11: a phone’s deal intents play through diplomacy.ts in planning', () => {
  it('an open offer blocks a second one to the same player, and an unknown card is refused', () => {
    const game = startedGame();
    game.handle('s1', { type: 'offerDeal', offer: PACT });

    expect(() => game.handle('s1', { type: 'offerDeal', offer: PACT }), 'the first card is open').toThrow('Lena has not answered your last card');
    expect(() => game.handle('s1', { type: 'withdrawDeal', id: 'deal-nope' })).toThrow('That card is no longer open');
    expect(() => game.handle('s2', { type: 'answerDeal', id: 'deal-nope', accept: true })).toThrow('That card is no longer open');
  });

  it('an accepted pact is binding: a second offer between the two is refused, and answering it again is too late', () => {
    const game = startedGame();
    const before = new Set(dealIds(game));
    game.handle('s1', { type: 'offerDeal', offer: PACT });
    const id = dealIds(game).find((d) => !before.has(d))!;

    game.handle('s2', { type: 'answerDeal', id, accept: true });

    expect(() => game.handle('s2', { type: 'answerDeal', id, accept: true })).toThrow('That card is no longer open');
    expect(() => game.handle('s1', { type: 'offerDeal', offer: PACT })).toThrow('You already have a pact with Lena');
  });

  it('a withdrawn card can no longer be answered, and the proposer may offer again', () => {
    const game = startedGame();
    game.handle('s1', { type: 'offerDeal', offer: PACT });
    const id = dealIds(game).at(-1)!;

    game.handle('s1', { type: 'withdrawDeal', id });

    expect(() => game.handle('s2', { type: 'answerDeal', id, accept: true })).toThrow('That card is no longer open');
    expect(() => game.handle('s1', { type: 'offerDeal', offer: PACT })).not.toThrow();
  });

  it('with politics off the rules refuse every deal intent', () => {
    const game = startedGame(false);
    expect(() => game.handle('s1', { type: 'offerDeal', offer: PACT })).toThrow('This game plays without deals');
  });
});

/** The ids of every card in the game, read where the server's own views will read them once dealsView exists. */
function dealIds(game: MuleGame): string[] {
  return ((game as unknown as { state: { politics: { deals: { id: string }[] } | null } }).state.politics?.deals ?? []).map((d) => d.id);
}
