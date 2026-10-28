import { PHASES, WALK } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** Far past any planning clock there ever was: no table plans this long by accident. */
const TEN_MINUTES = 600_000;
/** An election month's longest run on its own clocks, nominate to reveal, with room to spare. */
const ELECTION_BOUND_MS = 120_000;

function started(options: { phaseScale?: number; politics?: boolean } = {}) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, options);
  game.start(seats);
  return { game, ...fake };
}

const phase = (game: MuleGame) => game.viewFor(null).phase;

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

  it('FM-planning-untimed: in an election month the election steps on its own clocks, then planning proper waits with no deadline until everyone is Ready', () => {
    const { game, advance } = started({ politics: true });
    const election = () => game.viewFor(null).politics!.election!;
    expect(election().stage).toBe('nominate');
    for (let ms = 0; ms < ELECTION_BOUND_MS && election().stage !== 'over'; ms += WALK.tickMs) advance(WALK.tickMs);
    expect(election().stage, 'the election ran on its own clocks').toBe('over');

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
      expect(election().stage).toBe('nominate');
      for (let ms = 0; ms < ELECTION_BOUND_MS && election().stage !== 'over'; ms += WALK.tickMs) {
        expect(game.viewFor(null).phaseEndsAt, 'no planning deadline while the election runs').toBeNull();
        advance(WALK.tickMs);
      }
      expect(election().stage, 'the election ran on its own clocks').toBe('over');
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

  it('FM-planning-all-ready: with every human dropped, planning stays open', () => {
    const { game, advance } = started();
    game.connectionChanged('s1', false);
    game.connectionChanged('s2', false);
    expect(phase(game)).toBe('planning');
    advance(TEN_MINUTES);
    expect(phase(game)).toBe('planning');
  });
});
