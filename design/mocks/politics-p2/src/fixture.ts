import type { IncidentView, MuleView, MyPoliticsView, MyView } from '@mule/protocol';
import { W, viewFor as frameView, type Seat } from './frame-fixture';

export { W, H, PLAYERS, clientFor, type Seat } from './frame-fixture';

/**
 * P2's table: P0's month-5 planning (WS6's frame fixture, copied in frame-fixture.ts), with slice 4 on. Brix is Sheriff.
 * Five sabotage orders so far, each in a different state, so every row of the Sheriff's desk has something to show.
 * Ids are opaque (Heiko, 7 Nov): no screen prints one.
 */
export const at = (x: number, y: number) => y * W + x;

export const INCIDENTS: IncidentView[] = [
  // Open: a power cut nobody was caught for. Investigating it solves it (scripted below).
  { id: 'q7f2', month: 3, kind: 'powerCut', victim: 'ossa', at: { x: 12, y: 4 }, good: 'smithore', worked: true, culprit: null, how: null, investigated: false, fine: null },
  // Open: a rumour; it has no victim. Investigating it goes cold (scripted below).
  { id: 'k1m9', month: 4, kind: 'rumour', victim: null, at: null, good: 'food', dir: 'up', worked: true, culprit: null, how: null, investigated: false, fine: null },
  // Revealed by a guard and not yet fined: the one fineable case.
  { id: 'w3c8', month: 4, kind: 'powerCut', victim: 'kai', at: { x: 9, y: 7 }, good: 'energy', worked: false, culprit: 'lena', how: 'guard', investigated: false, fine: null },
  // Investigated, the trail went cold: stays cold.
  { id: 'p5d1', month: 2, kind: 'powerCut', victim: 'brix', at: { x: 9, y: 2 }, good: 'food', worked: true, culprit: null, how: null, investigated: true, fine: null },
  // Caught in the act and fined by the last Sheriff: closed.
  { id: 'z8h4', month: 3, kind: 'powerCut', victim: 'lena', at: { x: 5, y: 6 }, good: 'energy', worked: false, culprit: 'ossa', how: 'caught', investigated: false, fine: { due: 150, paid: 150, toVictim: 75, by: 'sheriff' } },
];

/** What the server would answer to an investigation of each open case (half the time it finds the culprit). */
export const INVESTIGATION: Record<string, string | null> = { q7f2: 'kai', k1m9: null };

export const FINE_STEPS = [50, 100, 150, 200, 250, 300];

/** The Sheriff's own desk state, as MyView.sheriff carries it. One guard of two posted, one investigation left. */
export type SheriffState = NonNullable<MyPoliticsView['sheriff']>;
export const SHERIFF: SheriffState = {
  canAct: true, guards: [at(6, 5)], max: 2, investigationsLeft: 1, fineable: ['w3c8'], steps: FINE_STEPS, multiplier: 1,
};

/** The desk's states a reviewer can switch between. */
export type DeskState = 'month' | 'votesOpen' | 'spent' | 'ban' | 'quiet';
export const DESK_STATES: [DeskState, string][] = [
  ['month', 'Month 5 planning'],
  ['ban', 'Sabotage ban ×2 in force'],
  ['spent', 'Investigation used, guards full'],
  ['votesOpen', 'Election day, votes open'],
  ['quiet', 'No sabotage yet'],
];

export function sheriffFor(state: DeskState): { sheriff: SheriffState; incidents: IncidentView[] } {
  switch (state) {
    case 'ban': return { sheriff: { ...SHERIFF, multiplier: 2 }, incidents: INCIDENTS };
    case 'spent': return { sheriff: { ...SHERIFF, guards: [at(6, 5), at(12, 5)], investigationsLeft: 0 }, incidents: INCIDENTS };
    case 'votesOpen': return { sheriff: { ...SHERIFF, canAct: 'votesOpen' }, incidents: INCIDENTS };
    case 'quiet': return { sheriff: { ...SHERIFF, guards: [], fineable: [] }, incidents: [] };
    default: return { sheriff: SHERIFF, incidents: INCIDENTS };
  }
}

/** The whole view for a seat, with slice 4 filled in. */
export function viewFor(seat: Seat, state: DeskState = 'month') {
  const base = frameView(seat);
  const { sheriff, incidents } = sheriffFor(state);
  const view: MuleView = {
    ...base.view,
    politics: { ...base.view.politics!, sabotage: {
      terms: { powerCut: { cost: 120, success: 0.7, detect: 0.25 }, rumour: { cost: 80, success: 0.8, detect: 0.15 } },
      incidents,
      sheriff: { guards: sheriff.max, investigations: 1, investigationsLeft: sheriff.investigationsLeft },
    } },
  };
  const politics: MyPoliticsView = {
    running: null, ballot: {}, canRun: {}, paid: 0, reputation: 50, ...base.me.politics,
    sheriff: seat === 'sheriff' ? sheriff : null, sabotage: { order: null, canOrder: true, owed: 0, mine: [] },
  };
  const me: MyView = { ...base.me, politics };
  return { ...base, view: { ...view, me }, me };
}
