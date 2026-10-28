import type { AddressInfo } from 'node:net';
import { Brain } from '@mule/ai';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { ceremonyBeats, openPlanning, POLITICS, RuleError, WALK, type CeremonyBeat, type GameState, type Office, type TaxPromise } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext, readyAll } from './fake-context.js';

/** RULE-10: a Governor run carries a promise; tests about something else hold the tax. */
const HOLD: TaxPromise = { kind: 'hold' };
const CAP_8: TaxPromise = { kind: 'cap', percent: 8 };

/** The Sheriff path: each test of the calling block runs with both offices elected, and the config's list comes back after it. */
function bothOffices(): void {
  let saved: Office[];
  beforeEach(() => {
    saved = POLITICS.offices;
    POLITICS.offices = ['governor', 'sheriff'];
  });
  afterEach(() => {
    POLITICS.offices = saved;
  });
}

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
  const waitForGame = (pred: (g: MuleView) => boolean) => latestGame(inbox, pred);
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
  /** The board (TV) of the same room, over its own socket: its latest game view that matches. */
  const board = async () => {
    const tv = new WebSocket(`ws://localhost:${port}/ws`);
    const tvInbox: ServerEnvelope<MuleView>[] = [];
    tv.on('message', (d) => tvInbox.push(JSON.parse(d.toString())));
    await new Promise((r) => tv.once('open', r));
    tv.send(JSON.stringify({ t: 'board', code }));
    return (pred: (g: MuleView) => boolean) => latestGame(tvInbox, pred);
  };
  return { first, intent, nextError, waitForGame, board };
}

/** The latest game view in the inbox that matches, waiting for one to arrive. */
async function latestGame(inbox: ServerEnvelope<MuleView>[], pred: (g: MuleView) => boolean) {
  for (let i = 0; i < 200; i++) {
    const hit = inbox
      .flatMap((m) => (m.t === 'view' && m.view.game ? [m.view.game] : []))
      .reverse()
      .find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no such view');
}

describe('politics over the wire', () => {
  bothOffices();

  it('C1: the server a player joins plays politics by default', async () => {
    const table = await seatedPhone();
    expect(table.first.month).toBe(1);
    expect(table.first.politics, 'the board-wide politics view').toBeTruthy();
    expect(table.first.politics!.election?.stage).toBe('announce');
    expect(table.first.phaseEndsAt, 'planning waits for the election').toBeNull();
    expect(table.first.me!.politics, "the phone's own politics").toBeTruthy();
    await running!.close();

    const dark = await seatedPhone({ politics: false });
    expect(dark.first.politics).toBeNull();
    expect(dark.first.me!.politics).toBeNull();
    expect(dark.first.phaseEndsAt, 'planning has no clock without an election either').toBeNull();
  });

  it('C9: the wire accepts run, vote and setTax and refuses malformed ones', async () => {
    const phone = await seatedPhone({ politics: true });
    phone.intent({ type: 'run', office: 'governor', promise: HOLD });
    const candidate = await phone.waitForGame((g) => g.me?.politics?.running === 'governor');
    expect(candidate.politics!.candidates.governor).toEqual([candidate.me!.id]);

    // Well-formed, so they reach the rules, which refuse them in announce.
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

  it("B-AC-6 (server) · C12: a Governor run's tax promise crosses the wire to the phone and the board; a malformed or refused promise changes nothing", async () => {
    const phone = await seatedPhone({ politics: true });
    const board = await phone.board();
    phone.intent({ type: 'run', office: 'governor', promise: CAP_8 });
    const mine = await phone.waitForGame((g) => g.me?.politics?.running === 'governor');
    const me = mine.me!.id;
    expect(mine.politics!.promises).toEqual({ [me]: CAP_8 });
    const tv = await board((g) => g.politics?.candidates.governor?.includes(me) ?? false);
    expect(tv.me).toBeNull();
    expect(tv.politics!.promises).toEqual({ [me]: CAP_8 });

    const malformed = [
      { type: 'run', office: 'governor', promise: { kind: 'cap', percent: 8.5 } },
      { type: 'run', office: 'governor', promise: { kind: 'cap', percent: '8' } },
      { type: 'run', office: 'governor', promise: { kind: 'cap' } },
      { type: 'run', office: 'governor', promise: { kind: 'free' } },
      { type: 'run', office: 'governor', promise: 'Tax no higher than 8%' },
      { type: 'run', office: 'governor', promise: null },
    ];
    for (const bad of malformed) {
      const error = phone.nextError();
      phone.intent(bad);
      expect(await error, JSON.stringify(bad)).toBe('Bad message');
    }
    // Well-formed, so they reach RULE-10, which refuses them.
    const refused: [object, string][] = [
      [{ type: 'run', office: 'sheriff', promise: HOLD }, 'Sheriff candidates make no promise yet'],
      [{ type: 'run', office: 'governor' }, 'Pick a promise to run for Governor'],
      [{ type: 'run', office: 'governor', promise: { kind: 'cap', percent: 16 } }, 'A tax promise is 0% to 15%'],
    ];
    for (const [intent, message] of refused) {
      const error = phone.nextError();
      phone.intent(intent);
      expect(await error, JSON.stringify(intent)).toBe(message);
    }
    const after = await phone.waitForGame(() => true);
    expect(after.me!.politics!.running).toBe('governor');
    expect(after.politics!.promises).toEqual({ [me]: CAP_8 });
  });
});

/* The election and the politics view at MuleGame, on a manual clock. */

const people = [
  { id: 'lena', name: 'Lena', isAi: false, color: 0 },
  { id: 'brix', name: 'Brix', isAi: false, color: 1 },
  { id: 'ossa', name: 'Ossa', isAi: false, color: 2 },
  { id: 'ai1', name: 'The Baron', isAi: true, color: 3 },
];
const humans = ['lena', 'brix', 'ossa'];
/** Seeds whose AI draws (RULE-8) give a test its arrangement; each test asserts its candidacies once announce ends. */
const BARON_RUNS_SEED = 7;
const NOBODY_RUNS_SEED = 3;
const BARON_ALONE = { governor: ['ai1'], sheriff: [] };

/** The engine's state behind the game: where a test arranges ground truth. */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

function started(options: { phaseScale?: number; seed?: number; seats?: typeof people; onChanged?: (at: number) => void } = {}) {
  const { seed = BARON_RUNS_SEED, seats = people, onChanged, ...rest } = options;
  // Lena, the first human, hosts.
  const fake = fakeContext({ onChanged, table: seats });
  const game = new MuleGame(fake.ctx, seed, { politics: true, ...rest });
  game.start(seats);
  return { game, ...fake };
}
type Started = ReturnType<typeof started>;

const election = (game: MuleGame) => game.viewFor(null).politics!.election!;
const allReady = (game: MuleGame) => humans.forEach((id) => game.handle(id, { type: 'ready' }));

/** Ticks the election until it reaches the stage; the clock can't run longer than the whole election once everyone is Done. */
function untilStage(g: Started, stage: string) {
  for (let ms = 0; ms < 120_000 && election(g.game).stage !== stage; ms += WALK.tickMs) g.advance(WALK.tickMs);
  expect(election(g.game).stage).toBe(stage);
}

/** Plays `ms` of wall time tick by tick, as the server's clock runs (one big jump is a stall, and its dt is capped). */
function tickFor(g: Started, ms: number) {
  for (let t = 0; t < Math.round(ms / WALK.tickMs); t++) g.advance(WALK.tickMs);
}

/** Far longer than any planning clock there ever was. */
const LONG_WAIT_MS = 600_000;

/** Done with land: every human not yet done presses Ready in the land grant, so it ends once the AI seats are done too. */
function doneWithLand(game: MuleGame) {
  // Read from the engine, not viewFor: this runs on every step of the clock.
  const state = engineOf(game);
  for (const p of state.players) if (state.phase === 'landGrant' && !p.isAi && !p.doneWithLand) game.handle(p.id, { type: 'ready' });
}

/**
 * Plays on in 100 ms steps until `done`; nothing in planning has a clock, so every human is Ready (Done in announce and
 * the ballot) whenever planning waits, and Done with land in the land grant, which has none either.
 */
function playUntil(g: Started, done: () => boolean, boundMs: number) {
  for (let ms = 0; ms < boundMs && !done(); ms += 100) {
    const view = g.game.viewFor(null);
    if (view.phase === 'planning' && view.politics?.election?.stage !== 'ceremony') readyAll(g.game);
    doneWithLand(g.game);
    g.advance(100);
  }
}

/** Plays the election to its end, the humans Done in announce and the ballot. */
function doneThrough(g: Started) {
  playUntil(g, () => (election(g.game).stage as string) === 'over', 120_000);
  expect(election(g.game).stage).toBe('over');
}

/** The show's beats for the result the engine closed, the ground truth every screen follows. */
const beatsOf = (game: MuleGame) => {
  const state = engineOf(game);
  return ceremonyBeats(state.players.map((p) => p.id), state.politics!.election!.result!);
};

/** Plays out the longest pause an AI seat takes before it acts and presses Done (RULE-8). */
const aiPause = (g: Started) => tickFor(g, POLITICS.ai.actMs[1] + WALK.tickMs);

/** Arranges each player's money, the ground truth for who is appointed. */
function setMoney(game: MuleGame, money: Record<string, number>) {
  for (const p of engineOf(game).players) p.money = money[p.id]!;
}

/** Every screen at once: the three phones and the board. */
const screens = (game: MuleGame) => [...humans.map((id) => game.viewFor(id)), game.viewFor(null)];

/** A player's ready as each screen shows it. */
const readyOn = (game: MuleGame, id: string) => screens(game).map((v) => v.players.find((p) => p.id === id)!.ready);

describe('the election runs first in planning', () => {
  bothOffices();

  it('C9 · FM-planning-untimed: in month 1 planning proper starts only after the election is over, and then waits for every Ready', () => {
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
    allReady(g.game);
    let ceremonyAt: number | null = null;
    let overAt: number | null = null;
    for (let ms = 0; ms < 120_000 && overAt === null; ms += WALK.tickMs) {
      expect(g.game.viewFor(null).phaseEndsAt, `no planning timer at ${g.ctx.now()} ms`).toBeNull();
      expect(landAsks, `no AI land plan during the election, at ${g.ctx.now()} ms`).toEqual([]);
      g.advance(WALK.tickMs);
      if (election(g.game).stage === 'ceremony') ceremonyAt ??= g.ctx.now();
      if (election(g.game).stage === 'over') overAt = g.ctx.now();
    }
    expect(election(g.game).candidates, 'seed precondition').toEqual(BARON_ALONE);
    const { total } = beatsOf(g.game);
    expect(overAt! - ceremonyAt!, 'The Baron runs alone: the show runs its length, to the tick').toBe(Math.ceil(total / WALK.tickMs) * WALK.tickMs);
    expect(landAsks, 'one land plan per AI seat, as the election ends').toEqual([{ seat: 'ai1', at: overAt }]);
    expect(g.game.viewFor(null).phase).toBe('planning');
    expect(g.game.viewFor(null).phaseEndsAt, 'planning proper has no clock').toBeNull();
    g.advance(LONG_WAIT_MS);
    expect(g.game.viewFor(null).phase).toBe('planning');
    readyAll(g.game);
    expect(g.game.viewFor(null).phase).toBe('landGrant');
  });

  it('C9: ready during an election marks Done for the stage and never ends planning', () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    expect(g.game.viewFor(null).phase).toBe('planning');
    expect(election(g.game).done).toEqual(expect.arrayContaining(humans));
    for (let ms = 0; ms <= POLITICS.ai.actMs[1] + WALK.tickMs && election(g.game).stage === 'announce'; ms += WALK.tickMs) {
      g.advance(WALK.tickMs);
      const e = election(g.game);
      if (e.stage === 'announce') expect(e.done, `${g.ctx.now()} ms: the tick the last Done lands ends announce`).not.toEqual(expect.arrayContaining([...humans, 'ai1']));
    }
    expect(election(g.game).stage, 'every player Done, the AI seat after its pause, ends announce').toBe('ballot');
    expect(election(g.game).done, 'Done is per stage').not.toContain('lena');

    allReady(g.game);
    aiPause(g);
    expect(election(g.game).stage).toBe('ceremony');
    const view = g.game.viewFor(null);
    expect(view.phase).toBe('planning');
    expect(view.phaseEndsAt).toBeNull();

    untilStage(g, 'over');
    expect(g.game.viewFor(null).players.map((p) => p.ready), "an election Done is not planning's ready").toEqual([false, false, false, false]);
    g.game.handle('lena', { type: 'ready' });
    g.game.handle('brix', { type: 'ready' });
    expect(g.game.viewFor(null).phase, 'planning waits for Ossa').toBe('planning');
  });

  it("C9: during the election a player's ready in the views shows their Done for the stage, and planning's ready starts false after it", () => {
    const g = started();
    const readyOf = (id: string) => readyOn(g.game, id);
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('lena', { type: 'ready' });
    expect(readyOf('lena'), "Lena's button looks pressed on every screen").toEqual([true, true, true, true]);
    expect(readyOf('brix')).toEqual([false, false, false, false]);

    g.game.handle('brix', { type: 'ready' });
    g.game.handle('ossa', { type: 'ready' });
    untilStage(g, 'ballot');
    for (const id of humans) expect(readyOf(id), `${id}: a new stage needs a new Done`).toEqual([false, false, false, false]);
    g.game.handle('brix', { type: 'ready' });
    expect(readyOf('brix')).toEqual([true, true, true, true]);

    allReady(g.game);
    untilStage(g, 'over');
    expect(g.game.viewFor(null).phase, 'planning proper').toBe('planning');
    for (const id of humans) expect(readyOf(id), `${id}: planning's ready starts false`).toEqual([false, false, false, false]);
    g.game.handle('ossa', { type: 'ready' });
    expect(readyOf('ossa')).toEqual([true, true, true, true]);
    expect(readyOf('lena')).toEqual([false, false, false, false]);
  });

  it('T-AC-64: an away seat is not Done: announce and the ballot wait for it however long, every screen names it, and the host\'s Continue moves past it', () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('lena', { type: 'ready' });
    g.game.handle('brix', { type: 'ready' });
    g.game.connectionChanged('ossa', false);
    tickFor(g, LONG_WAIT_MS);
    expect(g.game.viewFor(null).phase).toBe('planning');
    expect(election(g.game).stage, 'announce waits for Ossa').toBe('announce');
    expect(readyOn(g.game, 'ossa'), 'nobody pressed Done for Ossa').toEqual([false, false, false, false]);
    for (const view of screens(g.game)) expect(view.politics!.election!.waitingFor).toEqual(['ossa']);

    g.game.handle('lena', { type: 'continue' });
    expect(readyOn(g.game, 'ossa'), "the host's Continue counts Ossa Done").toEqual([true, true, true, true]);
    expect(g.game.viewFor(null).news[0]).toBe('Lena opened the ballot without Ossa.');
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('ballot');

    g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    g.game.handle('lena', { type: 'ready' });
    g.game.connectionChanged('brix', false);
    g.game.connectionChanged('lena', false);
    tickFor(g, LONG_WAIT_MS);
    expect(g.game.viewFor(null).phase, 'not even when every phone has dropped').toBe('planning');
    expect(election(g.game).stage, 'the ballot waits for Brix and Ossa').toBe('ballot');
    expect(election(g.game).waitingFor).toEqual(['brix', 'ossa']);
  });

  it("T-AC-64: the host's Continue counts only humans Done, the host among them, and names only the others; an AI seat still acts after its own pause", () => {
    const g = started();
    expect(election(g.game).stage).toBe('announce');
    g.game.handle('lena', { type: 'continue' });
    expect([...election(g.game).done].sort(), 'every human, the host too; never the AI seat').toEqual(['brix', 'lena', 'ossa']);
    expect(g.game.viewFor(null).news[0], 'the host is not named').toBe('Lena opened the ballot without Brix and Ossa.');
    g.advance(WALK.tickMs);
    expect(election(g.game).stage, 'the last call waits for the AI seat').toBe('announce');

    aiPause(g);
    expect(election(g.game).stage, 'the AI seat pressed Done itself, after its pause').not.toBe('announce');
  });

  it('T-AC-64: a Done the player pressed stands when their phone drops and comes back; the server never presses one', () => {
    const g = started({ phaseScale: 0.1 });
    g.game.handle('lena', { type: 'ready' });
    g.game.connectionChanged('lena', false);
    g.game.connectionChanged('brix', false);
    g.advance(WALK.tickMs);
    expect(election(g.game).done, 'Lena pressed Done herself; Brix did not').toEqual(['lena']);
    g.game.connectionChanged('lena', true);
    g.game.connectionChanged('brix', true);
    expect(election(g.game).done, 'a flicker keeps Lena\'s own Done').toEqual(['lena']);
    g.game.handle('ossa', { type: 'ready' });
    tickFor(g, LONG_WAIT_MS);
    expect(election(g.game).stage, 'announce waits for Brix').toBe('announce');
    g.game.handle('brix', { type: 'ready' });
    aiPause(g);
    expect(election(g.game).stage).not.toBe('announce');
  });

  it('T-AC-64: in the ceremony the host\'s Continue is refused with "The result is being announced" and nothing changes', () => {
    const g = started();
    allReady(g.game);
    untilStage(g, 'ceremony');
    const before = JSON.stringify(screens(g.game));
    expect(() => g.game.handle('lena', { type: 'continue' })).toThrow(new RuleError('The result is being announced'));
    expect(JSON.stringify(screens(g.game))).toBe(before);
    expect(() => g.game.handle('brix', { type: 'continue' }), 'still host only').toThrow(new RuleError('Only the host can continue'));
  });

  it('C9: month 2 has no election; month 4 opens one, with no stale deadline', () => {
    const g = started({ phaseScale: 0.1 });
    playUntil(g, () => g.game.viewFor(null).month !== 1, 600_000);
    const view = g.game.viewFor(null);
    expect(view.month).toBe(2);
    expect(view.phase).toBe('planning');
    expect(view.politics!.election).toBeNull();
    expect(view.phaseEndsAt, 'planning has no clock').toBeNull();
    readyAll(g.game);
    expect(g.game.viewFor(null).phase, 'with no election, planning proper is open at once: Ready ends it').toBe('landGrant');

    playUntil(g, () => g.game.viewFor(null).month >= 4, 1_200_000);
    const month4 = g.game.viewFor(null);
    expect(month4.month).toBe(4);
    expect(month4.phase).toBe('planning');
    expect(month4.politics!.election!.stage).toBe('announce');
    expect(month4.phaseEndsAt, "no deadline left over from upkeep").toBeNull();
  });

  it.each([1, 0.1])('T-AC-61, T-AC-62 (server, phaseScale %s): announce never ends on time; the ceremony runs on its one show clock, scaled, every screen at the same second, and the winners take office at its end', (phaseScale) => {
    const g = started({ phaseScale });
    tickFor(g, LONG_WAIT_MS);
    expect(election(g.game)).toMatchObject({ stage: 'announce', ceremony: null });
    allReady(g.game);
    untilStage(g, 'ceremony');
    expect(election(g.game).candidates, 'seed precondition: no contested office, so no ballot').toEqual(BARON_ALONE);
    const total = beatsOf(g.game).total / 1_000;
    expect(election(g.game).ceremony).toEqual({ seconds: 0, total, reached: {} });

    // Each tick runs the show clock on by a tick of game time.
    const perTick = WALK.tickMs / phaseScale / 1_000;
    for (let tick = 1; tick <= 5; tick++) {
      g.advance(WALK.tickMs);
      expect(election(g.game).ceremony!.seconds).toBeCloseTo(tick * perTick);
      for (const view of screens(g.game)) expect(view.politics!.election!.ceremony).toEqual(election(g.game).ceremony);
    }
    // A stalled server loop: one late tick moves the clock at most three ticks' worth.
    g.advance(10_000);
    expect(election(g.game).ceremony!.seconds).toBeCloseTo(8 * perTick);

    const left = total - election(g.game).ceremony!.seconds;
    tickFor(g, Math.ceil(left / perTick - 1) * WALK.tickMs);
    expect(election(g.game).stage, 'the show is not over before its end').toBe('ceremony');
    expect(g.game.viewFor(null).politics!.governor, 'nobody takes office before the end').toBeNull();
    g.advance(WALK.tickMs);
    expect(election(g.game)).toMatchObject({ stage: 'over', ceremony: null });
    expect(g.game.viewFor(null).politics!.governor).toBe('ai1');
    expect(g.game.viewFor(null).phase).toBe('planning');
    expect(g.game.viewFor(null).phaseEndsAt, 'planning proper has no clock').toBeNull();
  });
});

describe('B-AC-60, B-AC-61: running any month, and a ballot that waits for everyone', () => {
  bothOffices();

  it('B-AC-60: Ossa runs for Governor promising 8% in month 2 and changes it to 7% in month 3; every screen lists her from month 2, and the month 4 announcement shows 7%', () => {
    const g = started({ phaseScale: 0.1 });
    playUntil(g, () => g.game.viewFor(null).month === 2, 600_000);
    expect(g.game.viewFor(null).politics!.election).toBeNull();
    g.game.handle('ossa', { type: 'run', office: 'governor', promise: CAP_8 });
    for (const view of screens(g.game)) {
      expect(view.politics!.candidates.governor, 'month 2').toContain('ossa');
      expect(view.politics!.promises.ossa, 'month 2').toEqual(CAP_8);
    }
    expect(g.game.viewFor('ossa').me!.politics!.running).toBe('governor');

    playUntil(g, () => g.game.viewFor(null).month === 3, 600_000);
    for (const view of screens(g.game)) expect(view.politics!.promises.ossa, 'month 3, before the change').toEqual(CAP_8);
    g.game.handle('ossa', { type: 'run', office: 'governor', promise: { kind: 'cap', percent: 7 } });

    playUntil(g, () => g.game.viewFor(null).month === 4, 600_000);
    for (const view of screens(g.game)) {
      expect(view.politics!.election!.stage).toBe('announce');
      expect(view.politics!.candidates.governor, 'month 4').toContain('ossa');
      expect(view.politics!.promises.ossa, 'month 4').toEqual({ kind: 'cap', percent: 7 });
    }
  });

  /** Lena and Brix run for Governor and the AI Baron too; everyone is Done in announce, so the ballot is open. */
  function ballotOpen() {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    untilStage(g, 'ballot');
    expect(election(g.game).candidates, 'seed precondition').toEqual({ governor: ['lena', 'brix', 'ai1'], sheriff: [] });
    g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'brix' });
    for (const id of ['lena', 'brix']) g.game.handle(id, { type: 'ready' });
    aiPause(g);
    return g;
  }

  it('B-AC-61, T-AC-68 (server): while Ossa has not cast her vote the ballot stays open however long, picked or not, and every screen waits for her; it closes at the next tick once she casts', () => {
    const g = ballotOpen();
    tickFor(g, LONG_WAIT_MS);
    expect(election(g.game).stage).toBe('ballot');
    for (const view of screens(g.game)) expect(view.politics!.election!.waitingFor).toEqual(['ossa']);

    g.game.handle('ossa', { type: 'vote', office: 'governor', candidate: 'brix' });
    tickFor(g, LONG_WAIT_MS);
    expect(election(g.game).stage, 'picking alone is not Done').toBe('ballot');
    for (const view of screens(g.game)) expect(view.politics!.election!.waitingFor).toEqual(['ossa']);

    g.game.handle('ossa', { type: 'ready' });
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('ceremony');
    expect(engineOf(g.game).politics!.election!.result!.governor).toMatchObject({ winner: 'brix', how: 'votes' });
  });

  it("B-AC-61: the host's Continue closes the ballot without the player who has not voted, and the news names them", () => {
    const g = ballotOpen();
    g.game.connectionChanged('ossa', false);
    tickFor(g, LONG_WAIT_MS);
    expect(election(g.game).stage).toBe('ballot');

    g.game.handle('lena', { type: 'continue' });
    expect(g.game.viewFor(null).news[0]).toBe('Lena closed the ballot without Ossa.');
    g.advance(WALK.tickMs);
    expect(election(g.game).stage).toBe('ceremony');
    expect(engineOf(g.game).politics!.election!.ballots, 'Ossa abstained').not.toHaveProperty('ossa');
  });
});

describe('the politics view', () => {
  bothOffices();

  it("B-AC-62, B-AC-1, T-AC-69 (server): the ceremony shows the Governor, then the Sheriff, on every screen in the same tick, beat by beat as RULE-62 times them: an office's totals from its bars beat, its winner from its winner beat, one news line each then; then the winner has the tax desk", () => {
    const g = started();
    // The Baron runs for Governor too and votes for himself; Ossa runs alone for Sheriff, unopposed.
    setMoney(g.game, { lena: 900, brix: 1_000, ossa: 1_300, ai1: 1_100 });
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('ossa', { type: 'run', office: 'sheriff' });
    allReady(g.game);
    untilStage(g, 'ballot');
    expect(election(g.game).candidates, 'seed precondition').toEqual({ governor: ['lena', 'brix', 'ai1'], sheriff: ['ossa'] });
    g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'brix' });
    g.game.handle('ossa', { type: 'vote', office: 'governor', candidate: 'brix' });
    allReady(g.game);
    untilStage(g, 'ceremony');

    const governor = { winner: 'brix', how: 'votes', tallies: [{ id: 'brix', votes: 2 }, { id: 'lena', votes: 1 }, { id: 'ai1', votes: 1 }] };
    const sheriff = { winner: 'ossa', how: 'unopposed', tallies: [{ id: 'ossa', votes: 0 }] };
    const full = { governor, sheriff };
    const lines = { governor: 'Brix is Governor (elected).', sheriff: 'Ossa is Sheriff (unopposed).' };
    const beats = beatsOf(g.game);
    expect(beats.offices.find((o) => o.office === 'governor')!.blocks, 'four blocks, interleaved in seat order').toEqual(['lena', 'brix', 'ai1', 'brix']);
    const order: CeremonyBeat[] = ['title', 'candidates', 'bars', 'tie', 'winner', 'end'];
    const seen: string[] = [];
    while (election(g.game).stage !== 'over') {
      const views = screens(g.game).map((v) => v.politics!.election!);
      for (const v of views) {
        expect(v.ceremony, 'every screen at the same second').toEqual(views[0]!.ceremony);
        expect(v.result).toEqual(views[0]!.result);
      }
      const ms = engineOf(g.game).politics!.election!.ceremony!.elapsedMs;
      const { reached } = views[0]!.ceremony!;
      for (const { office, at } of beats.offices) {
        // The latest beat the show clock has reached, as RULE-62 times it, and nothing later.
        const latest = order.filter((b) => at[b] !== null && at[b]! <= ms).at(-1);
        const where = `${office} at ${ms} ms`;
        expect(reached[office], where).toEqual(latest ? { beat: latest, at: at[latest]! / 1_000 } : undefined);
        const shown = views[0]!.result[office];
        if (ms < at.bars) expect(shown, `${where}: no totals before the bars beat`).toBeUndefined();
        else if (ms < at.winner) expect(shown, `${where}: totals, no winner`).toEqual({ tallies: full[office as 'governor'].tallies });
        else expect(shown, `${where}: the winner`).toEqual(full[office as 'governor']);
        const news = g.game.viewFor(null).news.filter((n) => n === lines[office as 'governor']);
        expect(news, `${where}: the news line from the winner beat, once`).toHaveLength(ms < at.winner ? 0 : 1);
        if (latest && seen.at(-1) !== `${office} ${latest}` && !seen.includes(`${office} ${latest}`)) seen.push(`${office} ${latest}`);
      }
      g.advance(WALK.tickMs);
    }
    expect(seen).toEqual(['governor title', 'governor candidates', 'governor bars', 'governor winner', 'governor end', 'sheriff title', 'sheriff candidates', 'sheriff bars', 'sheriff winner', 'sheriff end']);

    tickFor(g, 1_000);
    for (const view of screens(g.game)) {
      expect(view.politics!.election!.result).toEqual(full);
      expect(view.politics!.governor).toBe('brix');
      expect(view.news.slice(0, 2)).toEqual([lines.sheriff, lines.governor]);
    }
    const brix = g.game.viewFor('brix');
    expect(brix.politics!.weights.find((w) => w.id === 'brix'), 'month 1: no land, no taxes paid, no Baron').toEqual({ id: 'brix', votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } });
    expect(brix.politics!.tax).toEqual({ percent: 5, start: 5, low: 0, high: 10 });
    const reputation = engineOf(g.game).players.find((p) => p.id === 'brix')!.reputation;
    expect(brix.me!.politics, 'running is open again, for the next election').toEqual({ running: null, ballot: { governor: 'brix' }, canRun: { governor: true, sheriff: true }, paid: 0, reputation });
    expect(brix.politics!.election!.stage, 'planning proper has started, so the Governor can set the tax').toBe('over');
    expect(() => g.game.handle('lena', { type: 'setTax', percent: 8 })).toThrow('Only the Governor sets the tax');
    g.game.handle('brix', { type: 'setTax', percent: 8 });
    for (const view of screens(g.game)) expect(view.politics!.tax.percent).toBe(8);
  });

  it.each(['land', 'lot'] as const)("T-AC-69 (server): a tie broken by %s reaches the views at its tie beat, the rule and the winner with it, as the mock stamps them; one tick before, neither", (how) => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    untilStage(g, 'ballot');
    expect(election(g.game).candidates.governor, 'seed precondition').toEqual(['lena', 'brix', 'ai1']);
    // Two plots each for a lot, or one more for Brix; the Baron (ai1) votes for himself, so his ballot breaks nothing.
    const state = engineOf(g.game);
    const free = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
    for (const [i, id] of ['lena', 'lena', 'brix', 'brix', ...(how === 'land' ? ['brix'] : [])].entries()) free[i]!.owner = id;
    g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'brix' });
    allReady(g.game);
    untilStage(g, 'ceremony');
    const result = state.politics!.election!.result!.governor!;
    if (result.how !== how) expect.fail(`seed precondition: the tie went by ${result.how}`);
    const { at } = beatsOf(g.game).offices.find((o) => o.office === 'governor')!;
    expect(at.tie).not.toBeNull();
    const seen = { before: 0, at: 0 };
    // The news names the Governor at the winner beat, never at the tie beat the views reveal it.
    const winnerNews = () => g.game.viewFor(null).news.filter((n) => /is Governor \(/.test(n)).length;
    while (election(g.game).stage === 'ceremony') {
      const ms = state.politics!.election!.ceremony!.elapsedMs;
      const view = election(g.game);
      const shown = view.result.governor;
      expect(winnerNews(), `${ms} ms: the Governor's news line`).toBe(ms < at.winner ? 0 : 1);
      if (ms < at.tie!) {
        for (const v of screens(g.game)) expect(v.politics!.election!.result.governor?.winner, `${ms} ms: no winner before the tie beat`).toBeUndefined();
        expect(shown?.how, `${ms} ms: no rule before the tie beat`).toBeUndefined();
        if (ms + WALK.tickMs >= at.tie!) seen.before++;
      } else if (ms < at.winner) {
        expect(view.ceremony!.reached.governor, `${ms} ms`).toEqual({ beat: 'tie', at: at.tie! / 1_000 });
        for (const v of screens(g.game)) expect(v.politics!.election!.result.governor, `${ms} ms: the tie's rule and winner`).toEqual(result);
        seen.at++;
      }
      g.advance(WALK.tickMs);
    }
    expect(seen.before, 'the tick before the tie beat was read').toBe(1);
    expect(seen.at, 'the tie beat was read').toBeGreaterThan(0);
    expect(election(g.game).result.governor).toMatchObject({ how });
  });
  it('B-AC-2: after the Governor sets 8%, the next auction sale is taxed at 8%', () => {
    const g = started();
    // The Baron runs against Lena; the three humans vote her in.
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    untilStage(g, 'ballot');
    expect(election(g.game).candidates, 'seed precondition').toEqual({ governor: ['lena', 'ai1'], sheriff: [] });
    for (const id of humans) g.game.handle(id, { type: 'vote', office: 'governor', candidate: 'lena' });
    allReady(g.game);
    untilStage(g, 'over');
    expect(election(g.game).result!.governor).toEqual({ winner: 'lena', how: 'votes', tallies: [{ id: 'lena', votes: 3 }, { id: 'ai1', votes: 1 }] });
    expect(() => g.game.handle('lena', { type: 'setTax', percent: 11 })).toThrow('The tax can be 0% to 10% this month');
    g.game.handle('lena', { type: 'setTax', percent: 8 });
    for (const view of screens(g.game)) expect(view.politics!.tax).toEqual({ percent: 8, start: 5, low: 0, high: 10 });

    // On to the first good's walk: Lena sells, Brix buys, Ossa passes.
    allReady(g.game);
    while (g.game.viewFor('lena').phase === 'landGrant') g.advance(GRANT_TICK_MS);
    while (g.game.viewFor('lena').phase === 'development' || g.game.viewFor('lena').phase === 'production') g.advance(1_000);
    expect(g.game.viewFor('lena').phase).toBe('auction');
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
    const g = started({ seed: NOBODY_RUNS_SEED });
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
    untilStage(g, 'ceremony');
    expect(election(g.game).candidates, 'seed precondition: nobody ran, AI seat included').toEqual({ governor: [], sheriff: [] });
    untilStage(g, 'over');
    for (const view of screens(g.game)) {
      const { result } = view.politics!.election!;
      expect(result!.governor).toMatchObject({ winner: 'brix', how: 'appointed' });
      expect(result!.sheriff).toMatchObject({ winner: 'ossa', how: 'appointed' });
      expect(view.politics!.governor).toBe('brix');
      expect(view.politics!.sheriff).toBe('ossa');
      expect(view.politics!.term).toEqual([1, 3]);
      expect(view.politics!.next).toBe(4);
      expect(view.news.slice(0, 2)).toEqual(['Ossa is Sheriff (appointed).', 'Brix is Governor (appointed).']);
    }
  });

  it("B-AC-5: another phone and the board never receive Brix's ballot", () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('ossa', { type: 'run', office: 'governor', promise: HOLD });
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

  it('B-AC-6 (server) · C12: every phone and the board show each Governor candidate\'s promise under their id from announce to the result; a Sheriff candidate has none', () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: CAP_8 });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: { kind: 'lower' } });
    g.game.handle('ossa', { type: 'run', office: 'sheriff' });
    const shown = { lena: CAP_8, brix: { kind: 'lower' } };
    const refused = JSON.stringify(screens(g.game));
    expect(() => g.game.handle('ossa', { type: 'run', office: 'sheriff', promise: HOLD })).toThrow('Sheriff candidates make no promise yet');
    expect(JSON.stringify(screens(g.game)), 'a refused promise changes no screen').toBe(refused);

    // Politics' until the ballot opens, the election's after.
    const promisesOn = () => screens(g.game).map((v) => (v.politics!.election!.stage === 'announce' ? v.politics!.promises : v.politics!.election!.promises));
    // The AI seat runs too, after its seeded pause, with a promise of its own.
    aiPause(g);
    expect(g.game.viewFor(null).politics!.candidates, 'seed precondition').toEqual({ governor: ['lena', 'brix', 'ai1'], sheriff: ['ossa'] });
    const nominated = promisesOn();
    for (const promises of nominated) {
      expect(promises).toEqual(nominated[0]);
      expect(promises).toMatchObject(shown);
      expect(Object.keys(promises).sort(), 'Governor candidates only').toEqual(['ai1', 'brix', 'lena']);
    }
    // Each view is a copy: a screen's object written to never reaches the game or the next view.
    (g.game.viewFor('brix').politics!.promises.lena as { percent: number }).percent = 3;
    expect(g.game.viewFor('brix').politics!.promises.lena).toEqual(CAP_8);
    allReady(g.game);
    untilStage(g, 'ballot');
    for (const promises of promisesOn()) expect(promises).toEqual(nominated[0]);
    for (const id of humans) g.game.handle(id, { type: 'vote', office: 'governor', candidate: 'lena' });
    allReady(g.game);
    untilStage(g, 'over');
    for (const view of screens(g.game)) {
      expect(view.politics!.election!.result.governor!.winner).toBe('lena');
      expect(view.politics!.election!.promises).toEqual(nominated[0]);
    }
  });

  it("T-AC-70 (server): every screen carries the Governor's promise for the term from the end of the ceremony, through the months to the next election; my tax paid and my reputation reach my phone only", () => {
    const g = started({ phaseScale: 0.1 });
    g.game.handle('lena', { type: 'run', office: 'governor', promise: CAP_8 });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    untilStage(g, 'ballot');
    for (const id of humans) g.game.handle(id, { type: 'vote', office: 'governor', candidate: 'lena' });
    allReady(g.game);
    untilStage(g, 'ceremony');
    for (const view of screens(g.game)) expect(view.politics!.promise, 'not before Lena takes office').toBeNull();
    untilStage(g, 'over');
    for (const view of screens(g.game)) expect(view.politics).toMatchObject({ governor: 'lena', promise: CAP_8 });

    const state = engineOf(g.game);
    state.treasury.paid = { lena: 123, brix: 456 };
    const rep = { lena: 71, brix: 29, ossa: 50 };
    for (const p of state.players) if (p.id in rep) p.reputation = rep[p.id as keyof typeof rep];
    for (const id of humans) expect(g.game.viewFor(id).me!.politics, id).toMatchObject({ paid: state.treasury.paid[id] ?? 0, reputation: rep[id as keyof typeof rep] });
    expect(g.game.viewFor(null).me, 'the board has no "my" side').toBeNull();
    expect(JSON.stringify(g.game.viewFor('ossa')), "Ossa's phone carries nobody else's paid").not.toMatch(/"paid":(123|456)/);

    // The next term's candidacy leaves this term's promise alone.
    playUntil(g, () => g.game.viewFor(null).month === 3, 1_200_000);
    g.game.handle('lena', { type: 'run', office: 'governor', promise: { kind: 'lower' } });
    for (const view of screens(g.game)) expect(view.politics, 'month 3').toMatchObject({ governor: 'lena', promise: CAP_8 });
  });

  it("T-AC-71: the host's Continue news names the stage it moved past: opened the ballot in announce, closed it in the ballot, continued in planning proper", () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('lena', { type: 'ready' });
    g.game.handle('lena', { type: 'continue' });
    expect(g.game.viewFor(null).news[0]).toBe('Lena opened the ballot without Brix and Ossa.');
    untilStage(g, 'ballot');

    g.game.handle('brix', { type: 'ready' });
    g.game.handle('lena', { type: 'continue' });
    expect(g.game.viewFor(null).news[0]).toBe('Lena closed the ballot without Ossa.');
    untilStage(g, 'over');

    g.game.handle('lena', { type: 'ready' });
    g.game.handle('lena', { type: 'continue' });
    expect(g.game.viewFor(null).news[0]).toBe('Lena continued without Brix and Ossa.');
    expect(g.game.viewFor(null).phase).toBe('landGrant');
  });

  it("HC-2: the board's politics view carries exactly these keys", () => {
    const g = started();
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    untilStage(g, 'ballot');
    g.game.handle('brix', { type: 'vote', office: 'governor', candidate: 'lena' });
    expectBoardKeys(g.game.viewFor(null));
    allReady(g.game);
    untilStage(g, 'ceremony');
    tickFor(g, 3_000);
    expect(keysOf(election(g.game).ceremony!.reached), 'precondition: the show has reached an office').not.toEqual([]);
    expectBoardKeys(g.game.viewFor(null));
    untilStage(g, 'over');
    const board = g.game.viewFor(null);
    expect(board.politics!.election!.result).not.toBeNull();
    expectBoardKeys(board);
  });
});

/* AI seats in the election: their VoteHand runs, votes, presses Done and governs. */

/** One human and three Classic AI seats whose names give three personas. */
const aiTable = [
  { id: 'lena', name: 'Lena', isAi: false, color: 0 },
  { id: 'acc', name: 'The Accountant', isAi: true, color: 1 },
  { id: 'baron', name: 'The Baron', isAi: true, color: 2 },
  { id: 'grudge', name: 'The Grudge', isAi: true, color: 3 },
];
const aiIds = ['acc', 'baron', 'grudge'];

describe('AI seats in the election', () => {
  bothOffices();

  it.each([1, 0.1])("T-AC-6, T-AC-63 (server) · C8: AI seats run and vote in the server's election, and every one presses Done within its longest pause of the stage opening (phaseScale %s)", (phaseScale) => {
    // The slowest AI pause is in game time; one more tick for the step that ends the stage.
    const within = (POLITICS.ai.actMs[1] + WALK.tickMs) * phaseScale + WALK.tickMs;
    let aiRan = 0;
    let ballots = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = started({ seed, seats: aiTable, phaseScale });
      g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
      g.game.handle('lena', { type: 'ready' });
      let stage = election(g.game).stage;
      let enteredAt = 0;
      while (stage !== 'over') {
        g.advance(WALK.tickMs);
        const now = election(g.game);
        if (now.stage === stage) continue;
        const lasted = g.ctx.now() - enteredAt;
        if (stage === 'announce') {
          expect(lasted, `seed ${seed}: announce ended once every seat was Done`).toBeLessThanOrEqual(within);
          aiRan += POLITICS.offices.flatMap((o) => now.candidates[o] ?? []).filter((id) => aiIds.includes(id)).length;
        }
        if (stage === 'ballot') {
          ballots++;
          expect(lasted, `seed ${seed}: the ballot ended once every seat was Done`).toBeLessThanOrEqual(within);
          expect(now.voted, `seed ${seed}: every AI seat voted`).toEqual(expect.arrayContaining(aiIds));
        }
        if (now.stage === 'ballot') {
          g.game.handle('lena', { type: 'vote', office: 'governor', candidate: 'lena' });
          g.game.handle('lena', { type: 'ready' });
        }
        stage = now.stage;
        enteredAt = g.ctx.now();
      }
    }
    expect(aiRan, 'some AI seat ran for office across the seeds').toBeGreaterThan(0);
    expect(ballots, 'some seed had a contested office').toBeGreaterThan(0);
  });

  it('T-AC-6 (server) · C8: an AI Governor sets the tax in planning, and the screens get it', () => {
    // RULE-8 from a 5% start: a step of at most 5 toward the persona's target (cautious 4, aggressive 8, saboteur 10), +2 when the fund is low, inside the month's bounds.
    const month1: Record<string, number> = { acc: 4, nbr: 4, baron: 8, grudge: 10 };
    const month2LowFund: Record<string, number> = { acc: 6, nbr: 6, baron: 10, grudge: 12 };
    // Without the Baron at the table, another persona takes office.
    const noBaron = [...aiTable.filter((s) => s.id !== 'baron'), { id: 'nbr', name: 'The Good Neighbour', isAi: true, color: 2 }];
    const governors = new Set<string>();
    for (const [seats, seed] of [aiTable, noBaron].flatMap((t) => [1, 2, 3].map((seed) => [t, seed] as const))) {
      // What each broadcast carried: when, and in planning (where the Governor sets it) the tax a screen would draw. A whole
      // view on every broadcast of the month would cost seconds on a CI runner.
      const sent: { at: number; tax: number | null }[] = [];
      const taxOnScreen = () => (engineOf(g.game).phase === 'planning' ? g.game.viewFor(null).politics!.tax.percent : null);
      const g: Started = started({ seed, seats, phaseScale: 0.1, onChanged: (at) => sent.push({ at, tax: taxOnScreen() }) });
      // Lena is too poor to be appointed and never runs, so an AI seat governs; the fund is full.
      setMoney(g.game, Object.fromEntries(seats.map((s) => [s.id, s.isAi ? 1_000 : 0])));
      engineOf(g.game).treasury.money = 10_000;
      const electionTicks: number[] = [];
      for (let i = 0; i < 1_000 && election(g.game).stage !== 'over'; i++) {
        // Lena never runs; she is Done in announce and the ballot.
        if (election(g.game).stage !== 'ceremony') g.game.handle('lena', { type: 'ready' });
        g.advance(WALK.tickMs);
        electionTicks.push(g.ctx.now());
      }
      expect(sent.map((b) => b.at), `seed ${seed}: one broadcast on every election tick`).toEqual(electionTicks);
      const governor = g.game.viewFor(null).politics!.governor!;
      expect(seats.find((s) => s.id === governor)?.isAi, `seed ${seed}: ${governor} governs`).toBe(true);
      governors.add(governor);
      tickFor(g, WALK.tickMs * 3);
      const after = g.game.viewFor('lena').politics!.tax;
      expect(after, `seed ${seed}: month 1, ${governor} sets the tax in planning`).toEqual({ percent: month1[governor], start: 5, low: 0, high: 10 });
      expect(sent.at(-1)!.tax, `seed ${seed}: the screens were sent the new tax`).toBe(month1[governor]);
      const quiet = sent.length;
      tickFor(g, WALK.tickMs * 30);
      expect(g.game.viewFor(null).phase, 'still in planning proper').toBe('planning');
      expect(sent.length, `seed ${seed}: nothing new in planning, nothing sent`).toBe(quiet);
      readyAll(g.game);

      // The fund runs dry before month 2, which has no election: the Governor steers again, with the bump.
      // The engine's phase and month, not viewFor's: these run on every step of the clock.
      for (let ms = 0; ms < 600_000 && engineOf(g.game).phase !== 'upkeep'; ms += WALK.tickMs) {
        doneWithLand(g.game);
        g.advance(WALK.tickMs);
      }
      engineOf(g.game).treasury.money = 0;
      for (let ms = 0; ms < 600_000 && engineOf(g.game).month === 1; ms += WALK.tickMs) g.advance(WALK.tickMs);
      expect(g.game.viewFor(null).phase).toBe('planning');
      expect(g.game.viewFor(null).politics!.election, 'month 2 has no election').toBeNull();
      tickFor(g, WALK.tickMs * 3);
      const start = month1[governor]!;
      expect(g.game.viewFor('lena').politics!.tax, `seed ${seed}: month 2, ${governor}`).toEqual({ percent: month2LowFund[governor], start, low: Math.max(0, start - 5), high: Math.min(15, start + 5) });
    }
    expect(governors.size, 'the seeds put more than one persona in office').toBeGreaterThan(1);
  });

  it("T-AC-6 (server) · C8: an AI Governor's tax lands that month even when every human presses ready the moment planning proper starts", () => {
    const g = started({ seed: 1, seats: aiTable, phaseScale: 0.1 });
    setMoney(g.game, { lena: 0, acc: 1_000, baron: 1_000, grudge: 1_000 });
    engineOf(g.game).treasury.money = 10_000;
    for (let i = 0; i < 1_000 && election(g.game).stage !== 'over'; i++) {
      if (election(g.game).stage !== 'ceremony') g.game.handle('lena', { type: 'ready' });
      g.advance(WALK.tickMs);
    }
    expect(g.game.viewFor(null).politics!.governor, 'seed precondition').toBe('baron');
    g.game.handle('lena', { type: 'ready' });
    expect(g.game.viewFor(null).phase, 'planning ended at once').toBe('landGrant');
    expect(g.game.viewFor(null).politics!.tax.percent, "month 1: The Baron's 8% landed first").toBe(8);

    // Month 2 has no election; the fund ran dry, so The Baron steers to 8 + 2.
    for (let ms = 0; ms < 600_000 && engineOf(g.game).phase !== 'upkeep'; ms += WALK.tickMs) {
      doneWithLand(g.game);
      g.advance(WALK.tickMs);
    }
    engineOf(g.game).treasury.money = 0;
    for (let ms = 0; ms < 600_000 && engineOf(g.game).month === 1; ms += WALK.tickMs) g.advance(WALK.tickMs);
    expect(g.game.viewFor(null).phase).toBe('planning');
    g.game.handle('lena', { type: 'ready' });
    expect(g.game.viewFor(null).phase, 'planning ended at once').toBe('landGrant');
    expect(g.game.viewFor(null).politics!.tax.percent, 'month 2: the tax landed first').toBe(10);
  });
});

describe('T-AC-62 (server): Governor only, the default POLITICS.offices', () => {
  it('T-AC-62 (server): by default every screen shows one office: a Sheriff run is refused, and no screen carries a Sheriff candidacy, result, pay, run button or news line, nor anyone holding the office', () => {
    expect(POLITICS.offices).toEqual(['governor']);
    const g = started();
    expect(() => g.game.handle('ossa', { type: 'run', office: 'sheriff' })).toThrow(new RuleError('The Sheriff is not elected yet'));
    g.game.handle('lena', { type: 'run', office: 'governor', promise: HOLD });
    g.game.handle('brix', { type: 'run', office: 'governor', promise: HOLD });
    allReady(g.game);
    untilStage(g, 'ballot');
    for (const id of humans) g.game.handle(id, { type: 'vote', office: 'governor', candidate: 'lena' });
    allReady(g.game);
    const beats: string[] = [];
    const governorOnly = () => {
      for (const view of screens(g.game)) {
        const politics = view.politics!;
        expect(politics.sheriff).toBeNull();
        expect(keysOf(politics.candidates)).toEqual(['governor']);
        expect(keysOf(politics.election!.candidates)).toEqual(['governor']);
        expect(keysOf(politics.pay)).toEqual(['governor']);
        expect(keysOf(politics.election!.result)).not.toContain('sheriff');
        if (view.me) expect(keysOf(view.me.politics!.canRun)).toEqual(['governor']);
        expect(view.news.join(' ')).not.toMatch(/Sheriff/);
      }
    };
    while (election(g.game).stage !== 'over') {
      governorOnly();
      const reached = election(g.game).ceremony?.reached ?? {};
      expect(keysOf(reached)).not.toContain('sheriff');
      const beat = reached.governor?.beat;
      if (beat && beats.at(-1) !== beat) beats.push(beat);
      g.advance(WALK.tickMs);
    }
    governorOnly();
    expect(beats).toEqual(['title', 'candidates', 'bars', 'winner', 'end']);
    expect(keysOf(election(g.game).result)).toEqual(['governor']);
    expect(g.game.viewFor(null).news[0]).toBe('Lena is Governor (elected).');
  });
});

const keysOf = (o: object) => Object.keys(o).sort();
const NEW_FIELD = 'a new board field: check it against HC-4 (secret ballots stay off the TV)';

/** Every politics field the board carries is one of these, so a ballot can't ride along. */
function expectBoardKeys(board: MuleView) {
  const politics = board.politics!;
  expect(board.me).toBeNull();
  expect(keysOf(politics), NEW_FIELD).toEqual(['baron', 'candidates', 'election', 'fund', 'governor', 'next', 'pay', 'promise', 'promises', 'sheriff', 'tax', 'term', 'weights']);
  expect(keysOf(politics.tax), NEW_FIELD).toEqual(['high', 'low', 'percent', 'start']);
  expect(keysOf(politics.pay), NEW_FIELD).toEqual(['governor', 'sheriff']);
  for (const w of politics.weights) {
    expect(keysOf(w), NEW_FIELD).toEqual(['id', 'parts', 'votes']);
    expect(keysOf(w.parts), NEW_FIELD).toEqual(['baron', 'base', 'land', 'reputation', 'taxes']);
  }
  const e = politics.election!;
  expect(keysOf(e), NEW_FIELD).toEqual(['candidates', 'ceremony', 'done', 'promises', 'result', 'stage', 'voted', 'waitingFor']);
  if (e.ceremony) {
    expect(keysOf(e.ceremony), NEW_FIELD).toEqual(['reached', 'seconds', 'total']);
    for (const office of keysOf(e.ceremony.reached)) expect(POLITICS.offices, NEW_FIELD).toContain(office);
    for (const r of Object.values(e.ceremony.reached)) expect(keysOf(r), NEW_FIELD).toEqual(['at', 'beat']);
  }
  if (politics.promise) expect(keysOf(politics.promise), NEW_FIELD).toEqual(politics.promise.kind === 'cap' ? ['kind', 'percent'] : ['kind']);
  const seatIds = people.map((p) => p.id);
  // C12: public like the candidacy (RULE-10); a promise is only its closed shape, keyed by a Governor candidate.
  for (const running of [politics, e]) {
    expect(keysOf(running.candidates), NEW_FIELD).toEqual(['governor', 'sheriff']);
    expect(keysOf(running.promises).every((id) => running.candidates.governor?.includes(id)), 'promises name Governor candidates').toBe(true);
    for (const promise of Object.values(running.promises)) expect(keysOf(promise), NEW_FIELD).toEqual(promise.kind === 'cap' ? ['kind', 'percent'] : ['kind']);
  }
  for (const office of keysOf(e.result)) expect(POLITICS.offices, NEW_FIELD).toContain(office);
  for (const office of Object.values(e.result)) {
    expect([['tallies'], ['how', 'tallies', 'winner']], NEW_FIELD).toContainEqual(keysOf(office));
    for (const t of office.tallies) expect(keysOf(t), NEW_FIELD).toEqual(['id', 'votes']);
  }
  for (const id of [...e.voted, ...e.done, ...e.waitingFor]) expect(seatIds, 'voted, done and waitingFor name seats, nothing more').toContain(id);
}
