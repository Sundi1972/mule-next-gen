import type { AddressInfo } from 'node:net';
import { PHASES, RuleError, WALK } from '@mule/engine';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** Far past any planning clock there ever was: no table plans this long by accident. */
const TEN_MINUTES = 600_000;
/** An election month's longest run once every player is Done, announce to the ceremony's end, with room to spare. */
const ELECTION_BOUND_MS = 120_000;

/** One election tick in which every human is Done for announce or the ballot, as their phones' Ready makes them; nothing is pressed in the ceremony. */
function doneTick(game: MuleGame, advance: (ms: number) => void): void {
  const stage = game.viewFor(null).politics!.election!.stage;
  if (stage === 'announce' || stage === 'ballot') for (const id of ['s1', 's2']) game.handle(id, { type: 'ready' });
  advance(WALK.tickMs);
}

/** Seed 7 with the three standard seats, in planning; Heiko (s1) hosts unless `host` names another seat or none. */
function started(options: { phaseScale?: number; politics?: boolean; host?: string | null } = {}) {
  const { host, ...gameOptions } = options;
  const fake = fakeContext({ host });
  const game = new MuleGame(fake.ctx, 7, gameOptions);
  game.start(seats);
  return { game, ...fake };
}

const phase = (game: MuleGame) => game.viewFor(null).phase;
const news = (game: MuleGame) => game.viewFor(null).news;

/** Everything every screen sees: the TV's view and each human's. A refused move leaves all of it as it was. */
const screens = (game: MuleGame) => [null, 's1', 's2'].map((viewer) => game.viewFor(viewer));

/** Expects `move` to be refused with a RuleError, every screen unchanged. */
function refusedUnchanged(game: MuleGame, move: () => void, why: string): void {
  const before = screens(game);
  expect(move, why).toThrow(RuleError);
  expect(screens(game), `${why}: nothing changes`).toEqual(before);
}

/** A planning length a table might set, in ms. */
const PLANNING_MS = 45_000;

/** Runs with PHASES.planningMs set to PLANNING_MS, as a host's config might at runtime, and puts the old value back. */
function withPlanningMs(run: () => void): void {
  const saved = PHASES.planningMs;
  PHASES.planningMs = PLANNING_MS;
  try {
    run();
  } finally {
    PHASES.planningMs = saved;
  }
}

/** Planning shows a deadline PLANNING_MS × phaseScale on, is still planning a ms before it, and starts the land grant at it. */
function plannedFor({ game, ctx, advance }: ReturnType<typeof started>, phaseScale: number): void {
  const ms = PLANNING_MS * phaseScale;
  expect(game.viewFor(null).phaseEndsAt, 'planning shows its deadline').toBe(ctx.now() + ms);
  advance(ms - 1);
  expect(phase(game)).toBe('planning');
  advance(1);
  expect(phase(game)).toBe('landGrant');
}

describe('FM-planning-untimed: planning has no clock', () => {
  it.each([1, 0.1])('FM-planning-untimed: at phaseScale %s, ten minutes on it is still planning and no screen shows a deadline', (phaseScale) => {
    const { game, advance } = started({ phaseScale });
    expect(phase(game)).toBe('planning');
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
    for (const viewer of ['s1', 's2', null]) expect(game.viewFor(viewer).phaseEndsAt, `seen by ${viewer ?? 'the TV'}`).toBeNull();
  });

  it('FM-planning-untimed: in an election month the election runs until everyone is Done, then planning proper waits with no deadline until everyone is Ready', () => {
    const { game, advance } = started({ politics: true });
    const election = () => game.viewFor(null).politics!.election!;
    expect(election().stage).toBe('announce');
    for (let ms = 0; ms < ELECTION_BOUND_MS && election().stage !== 'over'; ms += WALK.tickMs) doneTick(game, advance);
    expect(election().stage, 'the election ran to its end').toBe('over');

    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
    expect(game.viewFor(null).phaseEndsAt).toBeNull();
    for (const id of ['s1', 's2']) game.handle(id, { type: 'ready' });
    expect(phase(game)).toBe('landGrant');
  });

  it.each([1, 0.1])('FM-planning-untimed: a number put in PHASES.planningMs at runtime times planning again: at phaseScale %s it ends that number × phaseScale after it starts', (phaseScale) =>
    withPlanningMs(() => {
      const table = started({ phaseScale });
      expect(phase(table.game)).toBe('planning');
      plannedFor(table, phaseScale);
    }),
  );

  it.each([1, 0.1])("FM-planning-untimed: in an election month at phaseScale %s, a number in PHASES.planningMs times planning proper from the election's end", (phaseScale) =>
    withPlanningMs(() => {
      const table = started({ phaseScale, politics: true });
      const { game, advance } = table;
      const election = () => game.viewFor(null).politics!.election!;
      expect(election().stage).toBe('announce');
      for (let ms = 0; ms < ELECTION_BOUND_MS && election().stage !== 'over'; ms += WALK.tickMs) {
        expect(game.viewFor(null).phaseEndsAt, 'no planning deadline while the election runs').toBeNull();
        doneTick(game, advance);
      }
      expect(election().stage, 'the election ran to its end').toBe('over');
      plannedFor(table, phaseScale);
    }),
  );
});

describe('FM-planning-all-ready: planning ends when every human is Ready, connected or not', () => {
  it("FM-planning-all-ready: one human's Ready leaves planning open however long the other takes; the last one's Ready starts the land grant; the AI seat never holds it", () => {
    const { game, advance } = started();
    game.handle('s1', { type: 'ready' });
    expect(phase(game)).toBe('planning');
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
    expect(game.viewFor(null).players.find((p) => p.id === 's1')!.ready).toBe(true);
    game.handle('s2', { type: 'ready' });
    expect(phase(game)).toBe('landGrant');
  });

  it.each([
    ['drops before the other is Ready', ['drop', 'ready']],
    ['drops after the other is Ready', ['ready', 'drop']],
  ] as const)('FM-planning-all-ready: a dropped phone that is not Ready holds planning: Mia %s; back and Ready, she starts the land grant', (_, order) => {
    const { game, advance } = started();
    for (const step of order) {
      if (step === 'drop') game.connectionChanged('s2', false);
      else game.handle('s1', { type: 'ready' });
      expect(phase(game)).toBe('planning');
    }
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
    game.connectionChanged('s2', true);
    expect(phase(game), 'back, but not Ready yet').toBe('planning');
    game.handle('s2', { type: 'ready' });
    expect(phase(game)).toBe('landGrant');
  });

  it.each([
    ['drops before the other is Ready', ['drop', 'ready']],
    ['drops after the other is Ready', ['ready', 'drop']],
  ] as const)('FM-planning-all-ready: in an election month, a phone that drops once the election is over and is not Ready holds planning proper: Mia %s; back and Ready, she starts the land grant', (_, order) => {
    const { game, advance } = started({ politics: true });
    const election = () => game.viewFor(null).politics!.election!;
    for (let ms = 0; ms < ELECTION_BOUND_MS && election().stage !== 'over'; ms += WALK.tickMs) doneTick(game, advance);
    expect(election().stage, 'the election ran to its end').toBe('over');
    for (const step of order) {
      if (step === 'drop') game.connectionChanged('s2', false);
      else game.handle('s1', { type: 'ready' });
      expect(phase(game)).toBe('planning');
    }
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
    game.connectionChanged('s2', true);
    expect(phase(game), 'back, but not Ready yet').toBe('planning');
    game.handle('s2', { type: 'ready' });
    expect(phase(game)).toBe('landGrant');
  });

  it('FM-planning-all-ready: with every human dropped, planning stays open', () => {
    const { game, advance } = started();
    game.connectionChanged('s1', false);
    game.connectionChanged('s2', false);
    expect(phase(game)).toBe('planning');
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
  });
});

describe("FM-planning-host-continue: the host's Continue ends planning proper; nothing else ends it early", () => {
  it('FM-planning-host-continue: with one human Ready and the other not, Continue starts the land grant, where nobody is Ready yet', () => {
    const { game } = started();
    game.handle('s1', { type: 'ready' });
    game.handle('s1', { type: 'continue' });
    expect(phase(game)).toBe('landGrant');
    expect(game.viewFor(null).phaseEndsAt, 'the land grant has no clock (PR-F)').toBeNull();
    for (const screen of screens(game)) expect(screen.players.map((p) => p.ready), "planning's Ready is not carried into the land grant").toEqual([false, false, false]);
  });

  it('FM-planning-host-continue: with a dropped human not Ready holding planning, Continue starts the land grant', () => {
    const { game, advance } = started();
    game.connectionChanged('s2', false);
    game.handle('s1', { type: 'ready' });
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
    game.handle('s1', { type: 'continue' });
    expect(phase(game)).toBe('landGrant');
  });

  it("FM-planning-host-continue, B-AC-61: in the election's announce and ballot the host's Continue goes on without Mia, who is not Done, and the news names her; in the ceremony it is refused and nothing changes; once it is over, Continue starts the land grant", () => {
    const { game, advance } = started({ politics: true });
    const election = () => game.viewFor(null).politics!.election!;
    // Both humans run for Governor, so the office is contested and the election holds a ballot.
    for (const id of ['s1', 's2']) game.handle(id, { type: 'run', office: 'governor', promise: { kind: 'hold' } });
    const stages: string[] = [];
    for (let ms = 0; ms < ELECTION_BOUND_MS && election().stage !== 'over'; ms += WALK.tickMs) {
      const stage = election().stage;
      if (!stages.includes(stage)) {
        stages.push(stage);
        if (stage === 'ceremony') refusedUnchanged(game, () => game.handle('s1', { type: 'continue' }), "the host's Continue in the ceremony");
        else {
          game.handle('s1', { type: 'ready' });
          // A minute of ticks: the AI seat is Done after its pause, so only Mia holds the stage.
          for (let t = 0; t < 600; t++) advance(WALK.tickMs);
          expect(election().stage, `${stage} waits for Mia`).toBe(stage);
          game.handle('s1', { type: 'continue' });
          expect(phase(game), `${stage}: Continue does not end planning`).toBe('planning');
          expect(news(game)[0]).toBe('Heiko continued without Mia.');
        }
      }
      advance(WALK.tickMs);
    }
    expect(stages, 'every stage was tried').toEqual(['announce', 'ballot', 'ceremony']);
    expect(election().stage).toBe('over');
    game.handle('s1', { type: 'continue' });
    expect(phase(game)).toBe('landGrant');
  });

  it('FM-planning-host-continue: in every phase after planning, the land grant and development among them, Continue is refused and nothing changes', () => {
    const { game, advance } = started();
    readyAll(game);
    const tried: string[] = [];
    for (let i = 0; i < 30_000 && !(game.viewFor(null).month === 2 && phase(game) === 'planning'); i++) {
      if (phase(game) !== 'planning' && !tried.includes(phase(game))) {
        tried.push(phase(game));
        // Month 1's waiting development clock takes the host's Continue (A-1, first-mule.test.ts); once it runs, it is refused.
        if (game.viewFor(null).clockWaitsFor) game.handle('s1', { type: 'continue' });
        refusedUnchanged(game, () => game.handle('s1', { type: 'continue' }), `the host's Continue in ${phase(game)}`);
      }
      advance(100);
    }
    expect(tried).toEqual(expect.arrayContaining(['landGrant', 'development', 'production', 'auction', 'upkeep']));
  });

  it("FM-planning-host-continue: a non-host's Continue is refused and nothing changes; the host's ends planning with nobody Ready, and the news names who was left waiting", () => {
    const { game } = started();
    for (const seat of seats.filter((x) => x.id !== 's1')) {
      const before = screens(game);
      expect(() => game.handle(seat.id, { type: 'continue' }), seat.name).toThrow(new RuleError('Only the host can continue'));
      expect(screens(game), `${seat.name}: nothing changes`).toEqual(before);
      expect(news(game).join(' | '), `${seat.name}: no news of a refused Continue`).not.toContain('continued');
    }
    expect(phase(game)).toBe('planning');
    game.handle('s1', { type: 'continue' });
    expect(phase(game)).toBe('landGrant');
    expect(news(game)[0]).toBe('Heiko continued without Mia.');
  });

  /** Four humans and the AI Baron, in seat order Heiko, Mia, Lena, Ossa; Heiko hosts. */
  const fourHumans = [
    { id: 's1', name: 'Heiko', isAi: false, color: 0 },
    { id: 's2', name: 'Mia', isAi: false, color: 1 },
    { id: 's3', name: 'Lena', isAi: false, color: 2 },
    { id: 's4', name: 'Ossa', isAi: false, color: 3 },
    { id: 's5', name: 'The Baron', isAi: true, color: 4 },
  ];

  it.each([
    [[], 'Heiko continued without Mia, Lena and Ossa.'],
    [['s3'], 'Heiko continued without Mia and Ossa.'],
    [['s2', 's3'], 'Heiko continued without Ossa.'],
    [['s2', 's3', 's4'], null],
  ] as const)("FM-planning-host-continue: with %j Ready, the host's Continue starts the land grant and its news line, naming the humans not Ready in seat order, is %j", (readies, line) => {
    const fake = fakeContext({ table: fourHumans });
    const game = new MuleGame(fake.ctx, 7);
    game.start(fourHumans);
    for (const id of readies) game.handle(id, { type: 'ready' });
    expect(phase(game)).toBe('planning');
    game.handle('s1', { type: 'continue' });
    expect(phase(game)).toBe('landGrant');
    if (line) expect(news(game)[0]).toBe(line);
    else expect(news(game).join(' | '), 'nobody was left waiting, so no line').not.toContain('continued');
  });

  it("FM-planning-host-continue: while Heiko's phone is locked, hosting passes to Mia: his Continue is refused, hers ends planning", () => {
    const { game, setHost } = started();
    game.connectionChanged('s1', false);
    setHost('s2');
    refusedUnchanged(game, () => game.handle('s1', { type: 'continue' }), "Heiko's Continue, no longer the host");
    game.handle('s2', { type: 'continue' });
    expect(phase(game)).toBe('landGrant');
    expect(news(game)[0], 'a dropped human not Ready is named too').toBe('Mia continued without Heiko.');
  });

  it('FM-planning-host-continue: with no host, no seat can continue', () => {
    const { game } = started({ host: null });
    for (const seat of seats) refusedUnchanged(game, () => game.handle(seat.id, { type: 'continue' }), seat.name);
    expect(phase(game)).toBe('planning');
  });
});

describe('FM-planning-host-continue over the wire', () => {
  let running: MuleServer | null = null;
  afterEach(async () => {
    await running?.close();
    running = null;
  });

  it("FM-planning-host-continue: over the wire, Mia's Continue is refused and Heiko's, the host's, opens the land grant on every phone", async () => {
    running = createMuleServer({ seed: () => 42, politics: false });
    await new Promise<void>((r) => running!.server.listen(0, r));
    const { port } = running.server.address() as AddressInfo;
    const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
    const phone = async (name: string) => {
      const socket = new WebSocket(`ws://localhost:${port}/ws`);
      const inbox: ServerEnvelope<MuleView>[] = [];
      socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
      await new Promise((r) => socket.once('open', r));
      const send = (msg: object) => socket.send(JSON.stringify(msg));
      send({ t: 'join', code, name });
      const phaseSeen = () => (inbox.filter((m) => m.t === 'view').at(-1) as Extract<ServerEnvelope<MuleView>, { t: 'view' }> | undefined)?.view.game?.phase;
      const error = () => (inbox.filter((m) => m.t === 'error').at(-1) as Extract<ServerEnvelope<MuleView>, { t: 'error' }> | undefined)?.message;
      const seated = () => inbox.some((m) => m.t === 'welcome');
      return { send, phaseSeen, error, seated };
    };
    const until = async (done: () => boolean) => {
      for (let i = 0; i < 300 && !done(); i++) await new Promise((r) => setTimeout(r, 10));
    };
    const heiko = await phone('Heiko');
    const mia = await phone('Mia');
    await until(() => heiko.seated() && mia.seated());
    heiko.send({ t: 'start' });
    await until(() => heiko.phaseSeen() === 'planning' && mia.phaseSeen() === 'planning');
    expect(mia.phaseSeen()).toBe('planning');

    mia.send({ t: 'intent', intent: { type: 'continue' } });
    await until(() => mia.error() !== undefined);
    expect(mia.error()).toBe('Only the host can continue');
    expect(heiko.phaseSeen(), "Mia's Continue changed nothing").toBe('planning');

    heiko.send({ t: 'intent', intent: { type: 'continue' } });
    await until(() => heiko.phaseSeen() === 'landGrant' && mia.phaseSeen() === 'landGrant');
    expect([heiko.phaseSeen(), mia.phaseSeen()]).toEqual(['landGrant', 'landGrant']);
    expect(heiko.error(), 'the host was never refused').toBeUndefined();
  });
});
