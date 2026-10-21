import type { AddressInfo } from 'node:net';
import { Brain, type AiAction } from '@mule/ai';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { openPlanning, POLITICS, WALK, type GameState } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext } from './fake-context.js';

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
  vi.restoreAllMocks();
});

/** A real server on a free port, and Brix's phone seated in a started room with one AI seat. */
async function seatedPhone(options: { politics?: boolean } = {}) {
  running = createMuleServer({ seed: () => 42, ...options });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  const games = () => inbox.flatMap((m) => (m.t === 'view' && m.view.game ? [m.view.game] : []));
  /** The latest game view that matches. */
  const waitForGame = async (pred: (g: MuleView) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const hit = games().reverse().find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no such view');
  };
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
  const first = await waitForGame((g) => g.phase === 'planning');
  const intent = (i: object) => send({ t: 'intent', intent: i });
  return { first, intent, nextError, waitForGame };
}

describe('politics over the wire', () => {
  it('C1: a server created with politics on plays the election; the default server plays none until the screens ship (AM-6)', async () => {
    const on = await seatedPhone({ politics: true });
    expect(on.first.month).toBe(1);
    expect(on.first.politics, 'the board-wide politics view').toBeTruthy();
    expect(on.first.politics!.election?.stage).toBe('nominate');
    expect(on.first.phaseEndsAt, 'planning waits for the election').toBeNull();
    expect(on.first.me!.politics, "the phone's own politics").toBeTruthy();
    await running!.close();

    const dark = await seatedPhone();
    expect(dark.first.politics).toBeNull();
    expect(dark.first.me!.politics).toBeNull();
    expect(dark.first.phaseEndsAt, "planning's timer runs at once").not.toBeNull();
  });

  it('C9: the wire accepts run, vote and setTax and refuses malformed ones', async () => {
    const phone = await seatedPhone({ politics: true });
    phone.intent({ type: 'run', office: 'governor' });
    const candidate = await phone.waitForGame((g) => g.me?.politics?.running === 'governor');
    expect(candidate.politics!.election!.candidates.governor).toEqual([candidate.me!.id]);

    // Well-formed, so they reach the rules, which refuse them in nominate.
    let error = phone.nextError();
    phone.intent({ type: 'vote', office: 'governor', candidate: null });
    expect(await error).toBe('The ballot is not open yet');
    error = phone.nextError();
    phone.intent({ type: 'setTax', percent: 8 });
    expect(await error).toBe('Wait for the election to end');

    const malformed = [
      { type: 'run', office: 'mayor' },
      { type: 'run' },
      { type: 'vote', office: 'mayor', candidate: null },
      { type: 'vote', office: 'governor', candidate: 7 },
      { type: 'vote', office: 'governor' },
      { type: 'setTax', percent: 8.5 },
      { type: 'setTax', percent: '8' },
    ];
    for (const bad of malformed) {
      error = phone.nextError();
      phone.intent(bad);
      expect(await error, JSON.stringify(bad)).toBe('Bad message');
    }
    phone.intent({ type: 'run', office: null });
    await phone.waitForGame((g) => g.me?.politics?.running === null);
  });
});

/* The election and the politics view at MuleGame, on a manual clock. */

const people = [
  { id: 'lena', name: 'Lena', isAi: false },
  { id: 'brix', name: 'Brix', isAi: false },
  { id: 'ossa', name: 'Ossa', isAi: false },
  { id: 'ai1', name: 'The Baron', isAi: true },
];
const humans = ['lena', 'brix', 'ossa'];

/** The engine's state behind the game: where a test arranges ground truth. */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

function started(options: { phaseScale?: number } = {}) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, { politics: true, ...options });
  game.start(people);
  return { game, ...fake };
}
type Started = ReturnType<typeof started>;

const election = (game: MuleGame) => game.viewFor(null).politics!.election!;
const allReady = (game: MuleGame) => humans.forEach((id) => game.handle(id, { type: 'ready' }));

/** Ticks the election until it reaches the stage; the clock can't run longer than the whole election. */
function untilStage(g: Started, stage: string) {
  for (let ms = 0; ms < 120_000 && election(g.game).stage !== stage; ms += WALK.tickMs) g.advance(WALK.tickMs);
  expect(election(g.game).stage).toBe(stage);
}

/** Plays `ms` of wall time tick by tick, as the server's clock runs (one big jump is a stall, and its dt is capped). */
function tickFor(g: Started, ms: number) {
  for (let t = 0; t < Math.round(ms / WALK.tickMs); t++) g.advance(WALK.tickMs);
}

/** Arranges each player's money, the ground truth for who is appointed. */
function setMoney(game: MuleGame, money: Record<string, number>) {
  for (const p of engineOf(game).players) p.money = money[p.id]!;
}

/** Every screen at once: the three phones and the board. */
const screens = (game: MuleGame) => [...humans.map((id) => game.viewFor(id)), game.viewFor(null)];

describe('the election runs first in planning', () => {
  it('C9: in month 1 the planning timer starts only after the election is over', () => {
    // Each AI seat's land plan is a 'land' ask of its brain, made when planning proper starts.
    const landAsks: { seat: string; at: number }[] = [];
    const ask = Brain.prototype.ask;
    let now = () => 0;
    vi.spyOn(Brain.prototype, 'ask').mockImplementation(function (this: Brain, ...args) {
      if (args[0] === 'land') landAsks.push({ seat: this.mind.me, at: now() });
      return ask.apply(this, args) as never;
    });
    const g = started();
    now = g.ctx.now;
    let overAt: number | null = null;
    for (let ms = 0; ms < 120_000 && overAt === null; ms += WALK.tickMs) {
      expect(g.game.viewFor(null).phaseEndsAt, `no planning timer at ${g.ctx.now()} ms`).toBeNull();
      expect(landAsks, `no AI land plan during the election, at ${g.ctx.now()} ms`).toEqual([]);
      g.advance(WALK.tickMs);
      if (election(g.game).stage === 'over') overAt = g.ctx.now();
    }
    expect(overAt, 'nobody ran: nominate, then the reveal').toBe(POLITICS.nominateMs + POLITICS.revealMs);
    expect(landAsks, 'one land plan per AI seat, as the election ends').toEqual([{ seat: 'ai1', at: overAt }]);
    expect(g.game.viewFor(null).phase).toBe('planning');
    expect(g.game.viewFor(null).phaseEndsAt).toBe(overAt! + PHASE_MS.planning);
    g.advance(PHASE_MS.planning - 1);
    expect(g.game.viewFor(null).phase).toBe('planning');
    g.advance(1);
    expect(g.game.viewFor(null).phase).toBe('landGrant');
  });

  it('C9: ready during an election marks Done for the stage and never ends planning', () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor' });
    g.game.handle('brix', { type: 'run', office: 'governor' });
    allReady(g.game);
    expect(g.game.viewFor(null).phase).toBe('planning');
    expect(election(g.game).done).toEqual(expect.arrayContaining(humans));
    g.advance(WALK.tickMs);
    expect(election(g.game).stage, 'every player Done ends nominate at once').toBe('ballot');
    expect(election(g.game).done, 'Done is per stage').not.toContain('lena');

    allReady(g.game);
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('reveal');
    const view = g.game.viewFor(null);
    expect(view.phase).toBe('planning');
    expect(view.phaseEndsAt).toBeNull();
  });

  it("C9: an AI seat's Done during the election is Done for the stage", () => {
    const g = started();
    const aiAct = (seatId: string, action: AiAction) => (g.game as unknown as { aiAct(id: string, a: AiAction): boolean }).aiAct(seatId, action);
    expect(election(g.game).done).toEqual([]);
    expect(aiAct('ai1', { type: 'done', done: true }), 'the rules took it').toBe(true);
    expect(election(g.game).done).toEqual(['ai1']);
    expect(g.game.viewFor(null).phase).toBe('planning');
  });

  it('C9: an away seat is marked Done', () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor' });
    g.game.handle('brix', { type: 'run', office: 'governor' });
    g.game.handle('lena', { type: 'ready' });
    g.game.handle('brix', { type: 'ready' });
    g.game.connectionChanged('ossa', false);
    expect(g.game.viewFor(null).phase, 'a dropped phone does not end planning during the election').toBe('planning');
    g.advance(WALK.tickMs);
    expect(election(g.game).stage, 'Ossa counted as Done, so nominate ended').toBe('ballot');

    g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    g.game.handle('lena', { type: 'ready' });
    g.game.connectionChanged('brix', false);
    g.game.connectionChanged('lena', false);
    expect(g.game.viewFor(null).phase, 'not even when every phone has dropped').toBe('planning');
    expect(election(g.game).stage).toBe('ballot');
    g.advance(WALK.tickMs);
    expect(election(g.game).stage, 'Brix and Ossa counted as Done, so the ballot ended').toBe('reveal');
    expect(g.game.viewFor(null).phase).toBe('planning');
  });

  it('C9: a phone that reconnects during the election is no longer Done', () => {
    const g = started();
    g.game.connectionChanged('brix', false);
    g.advance(WALK.tickMs);
    expect(election(g.game).done).toContain('brix');
    g.game.connectionChanged('brix', true);
    expect(election(g.game).done, 'back at the table, Brix decides for himself').not.toContain('brix');
    g.game.handle('lena', { type: 'ready' });
    g.game.handle('ossa', { type: 'ready' });
    g.advance(WALK.tickMs);
    expect(election(g.game).stage, 'nominate waits for Brix').toBe('nominate');
  });

  it('C9: month 2 has no election; month 4 opens one, with no stale deadline', () => {
    const g = started({ phaseScale: 0.1 });
    for (let ms = 0; ms < 600_000 && g.game.viewFor(null).month === 1; ms += 100) g.advance(100);
    const view = g.game.viewFor(null);
    expect(view.month).toBe(2);
    expect(view.phase).toBe('planning');
    expect(view.politics!.election).toBeNull();
    expect(view.phaseEndsAt, 'planning runs on its timer at once').not.toBeNull();
    expect(view.phaseEndsAt! - g.ctx.now()).toBeGreaterThan(PHASE_MS.planning * 0.1 - 100);

    for (let ms = 0; ms < 1_200_000 && g.game.viewFor(null).month < 4; ms += 100) g.advance(100);
    const month4 = g.game.viewFor(null);
    expect(month4.month).toBe(4);
    expect(month4.phase).toBe('planning');
    expect(month4.politics!.election!.stage).toBe('nominate');
    expect(month4.phaseEndsAt, "no deadline left over from upkeep").toBeNull();
  });

  it.each([1, 0.1])("C9: the election's clocks scale with phaseScale (%s)", (phaseScale) => {
    const g = started({ phaseScale });
    const nominate = POLITICS.nominateMs * phaseScale;
    expect(election(g.game).total, 'the stage length in game seconds').toBe(POLITICS.nominateMs / 1_000);
    // A stalled server loop: one late tick moves the clock at most three ticks' worth.
    g.advance(10_000);
    expect(election(g.game).stage).toBe('nominate');
    expect(election(g.game).seconds).toBeCloseTo(POLITICS.nominateMs / 1_000 - (3 * WALK.tickMs) / phaseScale / 1_000);
    tickFor(g, nominate - 3 * WALK.tickMs - WALK.tickMs);
    expect(election(g.game).stage).toBe('nominate');
    expect(election(g.game).seconds).toBeCloseTo(WALK.tickMs / phaseScale / 1_000);
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('reveal');
    expect(election(g.game).total).toBe(POLITICS.revealMs / 1_000);
    tickFor(g, POLITICS.revealMs * phaseScale - WALK.tickMs);
    expect(election(g.game).stage).toBe('reveal');
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('over');
    expect(g.game.viewFor(null).phaseEndsAt).toBe(g.ctx.now() + PHASE_MS.planning * phaseScale);
  });
});

describe('the politics view', () => {
  it('B-AC-1 (server): two humans run for Governor and vote; after the reveal every view shows the same result in the same tick, and the winner has the tax desk', () => {
    const g = started();
    // Nobody runs for Sheriff: the richest player who is not the new Governor is appointed.
    setMoney(g.game, { lena: 900, brix: 1_000, ossa: 1_300, ai1: 1_100 });
    g.game.handle('lena', { type: 'run', office: 'governor' });
    g.game.handle('brix', { type: 'run', office: 'governor' });
    allReady(g.game);
    untilStage(g, 'ballot');
    g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'brix' });
    g.game.handle('ossa', { type: 'vote', office: 'governor', candidate: 'brix' });
    allReady(g.game);
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('reveal');
    const revealAt = g.ctx.now();

    let shownAt: number | null = null;
    while (election(g.game).stage !== 'over') {
      const results = screens(g.game).map((v) => v.politics!.election!.result);
      if (results[0] === null) {
        expect(results, 'no screen has the result before the others').toEqual([null, null, null, null]);
        expect(g.game.viewFor(null).news.join(' '), 'the news does not spoil the countdown').not.toMatch(/Governor/);
      } else {
        shownAt ??= g.ctx.now();
        for (const r of results) expect(r).toEqual(results[0]);
      }
      g.advance(WALK.tickMs);
    }
    expect(shownAt! - revealAt, 'shown the moment the countdown ends').toBe(POLITICS.revealCountdownMs);

    tickFor(g, 1_000);
    const line = 'Brix is Governor (elected) · Ossa is Sheriff (appointed).';
    for (const view of screens(g.game)) {
      const governor = view.politics!.election!.result!.governor;
      expect(governor).toEqual({ winner: 'brix', how: 'votes', tallies: [{ id: 'brix', votes: 2 }, { id: 'lena', votes: 1 }] });
      expect(view.politics!.election!.result!.sheriff).toEqual({ winner: 'ossa', how: 'appointed', tallies: [] });
      expect(view.politics!.governor).toBe('brix');
      expect(view.news[0]).toBe(line);
      expect(view.news.filter((n) => n === line), 'the reveal makes the news once').toHaveLength(1);
    }
    const brix = g.game.viewFor('brix');
    expect(brix.politics!.weights.find((w) => w.id === 'brix'), 'month 1: no land, no taxes paid, no Baron').toEqual({ id: 'brix', votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } });
    expect(brix.politics!.tax).toEqual({ percent: 5, start: 5, low: 0, high: 10 });
    expect(brix.me!.politics).toEqual({ running: 'governor', ballot: { governor: 'brix' }, canRun: { governor: 'closed', sheriff: 'closed' } });
    expect(brix.phaseEndsAt, 'planning has started, so the Governor can set the tax').not.toBeNull();
    expect(() => g.game.handle('lena', { type: 'setTax', percent: 8 })).toThrow('Only the Governor sets the tax');
    g.game.handle('brix', { type: 'setTax', percent: 8 });
    for (const view of screens(g.game)) expect(view.politics!.tax.percent).toBe(8);
  });

  it('B-AC-2: after the Governor sets 8%, the next auction sale is taxed at 8%', () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor' });
    allReady(g.game);
    g.advance(WALK.tickMs);
    expect(election(g.game).stage, 'one candidate: no ballot').toBe('reveal');
    untilStage(g, 'over');
    expect(election(g.game).result!.governor).toEqual({ winner: 'lena', how: 'unopposed', tallies: [{ id: 'lena', votes: 0 }] });
    expect(() => g.game.handle('lena', { type: 'setTax', percent: 11 })).toThrow('The tax can be 0% to 10% this month');
    g.game.handle('lena', { type: 'setTax', percent: 8 });
    for (const view of screens(g.game)) expect(view.politics!.tax).toEqual({ percent: 8, start: 5, low: 0, high: 10 });

    // On to the first good's walk: Lena sells, Brix buys, Ossa passes.
    allReady(g.game);
    while (g.game.viewFor('lena').phase === 'landGrant') g.advance(GRANT_TICK_MS);
    while (g.game.viewFor('lena').phase === 'development' || g.game.viewFor('lena').phase === 'production') g.advance(1_000);
    expect(g.game.viewFor('lena').phase).toBe('auction');
    allReady(g.game);
    g.advance(WALK.tickMs * 2);
    g.game.handle('lena', { type: 'declare', side: 'seller' });
    g.game.handle('brix', { type: 'declare', side: 'buyer' });
    g.game.handle('ossa', { type: 'declare', side: 'pass' });
    allReady(g.game);
    g.advance(WALK.tickMs * 2);
    const good = g.game.viewFor(null).auction!.good;
    expect(g.game.viewFor(null).auction!.stage).toBe('walk');
    g.game.handle('lena', { type: 'walk', dir: 'down' });
    g.game.handle('brix', { type: 'walk', dir: 'up' });

    const holding = () => {
      const lena = g.game.viewFor('lena');
      const brix = g.game.viewFor('brix');
      return { lenaMoney: lena.players.find((p) => p.id === 'lena')!.money, lenaUnits: lena.me!.stock[good], brixMoney: brix.players.find((p) => p.id === 'brix')!.money, brixUnits: brix.me!.stock[good] };
    };
    let sales = 0;
    for (let i = 0; i < 2_000 && sales === 0 && g.game.viewFor(null).auction?.good === good; i++) {
      const before = holding();
      g.advance(WALK.tickMs);
      const after = holding();
      if (after.lenaUnits !== before.lenaUnits - 1 || after.brixUnits !== before.brixUnits + 1) continue;
      const price = before.brixMoney - after.brixMoney;
      expect(after.lenaMoney - before.lenaMoney, `Lena's take on a sale at ${price}`).toBe(price - Math.round(price * 0.08));
      sales++;
    }
    expect(sales, 'one unit sold from Lena to Brix').toBe(1);
  });

  it('B-AC-3 (view): nobody runs → the views show the richest as Governor and the richest other as Sheriff, how appointed', () => {
    const g = started();
    setMoney(g.game, { lena: 900, brix: 1_200, ossa: 1_100, ai1: 1_000 });
    // Brix holds 10 plots and has paid 650 in sales tax; planning opens again so he is the month's Land Baron.
    const state = engineOf(g.game);
    state.tiles.slice(0, 10).forEach((t) => (t.owner = 'brix'));
    state.treasury.paid.brix = 650;
    state.treasury.money = 412;
    openPlanning(state);

    g.game.handle('ossa', { type: 'run', office: 'sheriff' });
    expect(g.game.viewFor('ossa').me!.politics!.running).toBe('sheriff');
    g.game.handle('ossa', { type: 'run', office: null });
    expect(g.game.viewFor('ossa').me!.politics!.running).toBeNull();
    expect(g.game.viewFor(null).politics!.term, 'nobody holds office yet').toBeNull();

    const board = g.game.viewFor(null).politics!;
    expect(board.baron).toBe('brix');
    expect(board.fund).toBe(g.game.viewFor(null).treasury.money);
    expect(board.fund).toBe(412);
    expect(board.weights.find((w) => w.id === 'brix'), '1 + 10 plots + Baron + 650 tax paid (capped at 2)').toEqual({ id: 'brix', votes: 5, parts: { base: 1, land: 1, reputation: 0, baron: 1, taxes: 2 } });

    allReady(g.game);
    untilStage(g, 'over');
    for (const view of screens(g.game)) {
      const { result } = view.politics!.election!;
      expect(result!.governor).toMatchObject({ winner: 'brix', how: 'appointed' });
      expect(result!.sheriff).toMatchObject({ winner: 'ossa', how: 'appointed' });
      expect(view.politics!.governor).toBe('brix');
      expect(view.politics!.sheriff).toBe('ossa');
      expect(view.politics!.term).toEqual([1, 3]);
      expect(view.politics!.next).toBe(4);
      expect(view.news[0]).toBe('Brix is Governor (appointed) · Ossa is Sheriff (appointed).');
    }
  });

  it("B-AC-5: another phone and the board never receive Brix's ballot", () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor' });
    g.game.handle('ossa', { type: 'run', office: 'governor' });
    allReady(g.game);
    untilStage(g, 'ballot');
    const others = () => JSON.stringify([g.game.viewFor('ossa'), g.game.viewFor('lena'), g.game.viewFor(null)]);

    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'lena' });
    const votedLena = others();
    expect(g.game.viewFor('brix').me!.politics!.ballot).toEqual({ governor: 'lena' });
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'ossa' });
    expect(g.game.viewFor('brix').me!.politics!.ballot).toEqual({ governor: 'ossa' });
    expect(others(), "the other screens are the same whoever Brix voted for").toBe(votedLena);
    expect(g.game.viewFor(null).politics!.election!.voted).toEqual(['brix']);
    expect(g.game.viewFor(null).me).toBeNull();
    expect(g.game.viewFor('ossa').me!.politics!.ballot).toEqual({});
  });

  it("HC-2: the board's politics view carries exactly these keys", () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor' });
    g.game.handle('brix', { type: 'run', office: 'governor' });
    allReady(g.game);
    untilStage(g, 'ballot');
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'lena' });
    expectBoardKeys(g.game.viewFor(null));
    allReady(g.game);
    untilStage(g, 'over');
    const board = g.game.viewFor(null);
    expect(board.politics!.election!.result).not.toBeNull();
    expectBoardKeys(board);
  });
});

const keysOf = (o: object) => Object.keys(o).sort();
const NEW_FIELD = 'a new board field: check it against HC-4 (secret ballots stay off the TV)';

/** Every politics field the board carries is one of these, so a ballot can't ride along. */
function expectBoardKeys(board: MuleView) {
  const politics = board.politics!;
  expect(board.me).toBeNull();
  expect(keysOf(politics), NEW_FIELD).toEqual(['baron', 'election', 'fund', 'governor', 'next', 'pay', 'sheriff', 'tax', 'term', 'weights']);
  expect(keysOf(politics.tax), NEW_FIELD).toEqual(['high', 'low', 'percent', 'start']);
  expect(keysOf(politics.pay), NEW_FIELD).toEqual(['governor', 'sheriff']);
  for (const w of politics.weights) {
    expect(keysOf(w), NEW_FIELD).toEqual(['id', 'parts', 'votes']);
    expect(keysOf(w.parts), NEW_FIELD).toEqual(['baron', 'base', 'land', 'reputation', 'taxes']);
  }
  const e = politics.election!;
  expect(keysOf(e), NEW_FIELD).toEqual(['candidates', 'done', 'result', 'seconds', 'stage', 'total', 'voted']);
  expect(keysOf(e.candidates), NEW_FIELD).toEqual(['governor', 'sheriff']);
  const seatIds = people.map((p) => p.id);
  if (e.result) expect(keysOf(e.result), NEW_FIELD).toEqual(['governor', 'sheriff']);
  for (const office of Object.values(e.result ?? {})) {
    expect(keysOf(office), NEW_FIELD).toEqual(['how', 'tallies', 'winner']);
    for (const t of office.tallies) expect(keysOf(t), NEW_FIELD).toEqual(['id', 'votes']);
  }
  for (const id of [...e.voted, ...e.done]) expect(seatIds, 'voted and done name seats, nothing more').toContain(id);
}
