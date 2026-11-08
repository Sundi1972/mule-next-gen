// Copied from politics-p2 (WS8), variant B: design/mocks/politics-p2/src/fixture.ts at 73e797fd (the Sheriff's parts
// only). Changes for the tabs are marked TABS:.
import type { IncidentView, MyPoliticsView } from '@mule/protocol';
/** The frame map's width (../../fixture's W), not imported: that fixture imports this one. */
const W = 15;

export const at = (x: number, y: number) => y * W + x;

/** Five sabotage orders so far, each in a different state, so every row of the case file has something to show. */
export const INCIDENTS: IncidentView[] = [
  { id: 'q7f2', month: 3, kind: 'powerCut', victim: 'ossa', at: { x: 12, y: 4 }, good: 'smithore', worked: true, culprit: null, how: null, investigated: false, fine: null },
  { id: 'k1m9', month: 4, kind: 'rumour', victim: null, at: null, good: 'food', dir: 'up', worked: true, culprit: null, how: null, investigated: false, fine: null },
  { id: 'w3c8', month: 4, kind: 'powerCut', victim: 'kai', at: { x: 9, y: 7 }, good: 'energy', worked: false, culprit: 'lena', how: 'guard', investigated: false, fine: null },
  { id: 'p5d1', month: 2, kind: 'powerCut', victim: 'brix', at: { x: 9, y: 2 }, good: 'food', worked: true, culprit: null, how: null, investigated: true, fine: null },
  { id: 'z8h4', month: 3, kind: 'powerCut', victim: 'lena', at: { x: 5, y: 6 }, good: 'energy', worked: false, culprit: 'ossa', how: 'caught', investigated: false, fine: { due: 150, paid: 150, toVictim: 75, by: 'sheriff' } },
];

/** What the server would answer to an investigation of each open case. TABS: q7f2's culprit is Brix, not Kai: Kai is the Sheriff here. */
export const INVESTIGATION: Record<string, string | null> = { q7f2: 'brix', k1m9: null };

export const FINE_STEPS = [50, 100, 150, 200, 250, 300];

export type SheriffState = NonNullable<MyPoliticsView['sheriff']>;

/** The Sheriff's desk as MyView.sheriff carries it. TABS: the guards come from the table's world (the guard intent). */
export function sheriffOf(guards: number[]): SheriffState {
  return { canAct: true, guards, max: 2, investigationsLeft: 1, fineable: ['w3c8'], steps: FINE_STEPS, multiplier: 1 };
}

/** PoliticsView.sabotage, as WS8's fixture fills it. */
export const SABOTAGE = {
  terms: { powerCut: { cost: 120, success: 0.7, detect: 0.25 }, rumour: { cost: 80, success: 0.8, detect: 0.15 } },
  incidents: INCIDENTS,
  sheriff: { guards: 2, investigations: 1, investigationsLeft: 1 },
};
