/**
 * Route fix (deep4, 7 Nov): the land brief's "Your draft development" showed "Route: the pub." in 368 of 480 land
 * briefs, while the hands' development draft, made at development's start after the land grant, installed a MULE on the
 * plot the grant gave. Claude replaced 233 such drafts it never saw. The brief is drafted at upkeep, before the grant:
 * it must show the MULE the hands will install on the plot the seat gains in the land grant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, createGame, type GameState } from '@mule/engine';
import { AiSeat, GOOD_NAME, playbookSource } from '@mule/ai';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import { fakeSdk, KEY, neverAnswers, promptOf, type SdkParams } from './brain-fakes.js';

const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};

/**
 * The land brief the seat is sent for month 1, asked at game start; and the development the hands really draft once
 * the land grant has given the seat the first plot of its draft ranking (ground truth, drafted on the game as it then is).
 */
async function briefAndRealDraft(setUp: (state: GameState) => void = () => {}) {
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  setUp(state);
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
  const source = playbookSource([seat]);
  const asked: SdkParams[] = [];
  const sdk = fakeSdk((_n, params, options) => (asked.push(params), neverAnswers(options)));
  const playbooks = new Playbooks({ brain: createBrain({ gameId: 'g-route', env: KEY, logPath: '/dev/null', sdkFactory: () => sdk }), source, seats: [seat] });

  const ranked = source.draft(state, seat.id).land.landGrant.ranked;
  playbooks.ask(state, 1);
  await vi.advanceTimersByTimeAsync(0);
  const brief = promptOf(asked[0]!).user;

  // The land grant gives the seat its first-ranked free plot; the hands draft the development after it.
  advanceTo(state, 'landGrant');
  const granted = ranked.find((r) => state.tiles[r.plot]!.owner === null)!.plot;
  state.tiles[granted]!.owner = seat.id;
  advanceTo(state, 'development');
  const real = seat.draft(state, 'development').development!;
  return { brief, real, granted };
}

/** The brief's route line. */
const routeLine = (brief: string) => brief.split('\n').find((l) => l.startsWith('Route: '));

describe('route fix: the land brief shows the development the hands will play after the land grant', { timeout: 30_000 }, () => {
  it('route fix: the brief shows the MULE the hands install on the plot the seat gains in the land grant, with its outfit, not "the pub"', async () => {
    const { brief, real, granted } = await briefAndRealDraft();
    // Ground truth: after the grant, the hands' draft buys a MULE, outfits it and installs it on the granted plot.
    const outfit = real.route.find((s) => s.act === 'outfit')?.outfit;
    expect(real.route).toContainEqual({ act: 'install', plot: granted });
    expect(outfit).toBeDefined();

    const route = routeLine(brief);
    expect(route).not.toBe('Route: the pub.');
    expect(route).toContain(`buy a MULE, outfit it for ${outfit === 'greenBelt' ? 'a green belt' : GOOD_NAME[outfit as keyof typeof GOOD_NAME]}, install it on "granted"`);
    expect(route).toContain('the plot you gain in the land grant');
  });

  it('route fix (control): a month the seat really plans no MULE, its corral empty, the brief still says "Route: the pub." and names no granted plot', async () => {
    const { brief, real } = await briefAndRealDraft((state) => {
      state.store.mules = 0;
    });
    // Ground truth: with the corral empty the hands' draft after the grant installs nothing.
    expect(real.route.filter((s) => s.act === 'install')).toEqual([]);

    expect(routeLine(brief)).toBe('Route: the pub.');
    expect(brief).not.toContain('install it on "granted"');
  });
});
