import type { ShowEventView } from '@mule/ui';

/**
 * P10's fixture events: what WS7's sabotage.ts::sabotageEvents files (ws7-s4-engine 4b55602a), one per scenario.
 * Trunk's EventKey has no 'powerCut' or 'marketRumour' and ShowEventView no `sabotage` yet (WS7's branch adds them),
 * hence the cast. Lines are WS7's words.
 */
export type Sabotage = { order: string; culprit: string | null; worked: boolean; guarded: boolean };
/** WS7's two keys, not yet in trunk's EventKey. */
export type SabotageKey = 'powerCut' | 'marketRumour';
export type SabotageEvent = Omit<ShowEventView, 'key'> & { key: SabotageKey; sabotage: Sabotage; good?: string; dir?: 'up' | 'down' };

const OSSA_SMITHORE = { x: 12, y: 4 };
const STORE = { x: 6, y: 4 };

const base = {
  kind: 'sabotage', sign: 'bad' as const, phase: 'production' as const, weight: 'spotlight' as const, playMs: 5200,
};

const cut = (over: Partial<SabotageEvent> & { sabotage: Sabotage }): SabotageEvent =>
  ({ ...base, key: 'powerCut', title: 'Sabotage: power cut', scope: 'personal', origin: OSSA_SMITHORE, hits: [], line: '', ...over }) as unknown as SabotageEvent;

const rumour = (over: Partial<SabotageEvent> & { sabotage: Sabotage }): SabotageEvent =>
  ({ ...base, key: 'marketRumour', title: 'Sabotage: market rumour', scope: 'colony', origin: STORE, hits: [], good: 'food', dir: 'up', line: '', ...over }) as unknown as SabotageEvent;

export type Scenario = 'cutWorked' | 'cutGuarded' | 'cutSeen' | 'rumourWorked' | 'rumourSeen';

export const SCENARIOS: { id: Scenario; label: string; event: SabotageEvent }[] = [
  {
    id: 'cutWorked', label: 'Power cut works, nobody saw',
    event: cut({ hits: [{ ...OSSA_SMITHORE, order: 0, delta: -3 }], line: 'Someone cut the power to a Smithore plot: it makes nothing this month.', sabotage: { order: 'a', culprit: null, worked: true, guarded: false } }),
  },
  {
    id: 'cutGuarded', label: 'Caught at a guarded plot',
    event: cut({ line: 'Caught at a guarded plot: the power stays on.', sabotage: { order: 'b', culprit: 'lena', worked: false, guarded: true } }),
  },
  {
    id: 'cutSeen', label: 'Power cut works, but seen',
    event: cut({ hits: [{ ...OSSA_SMITHORE, order: 0, delta: -3 }], line: 'Someone cut the power to a Smithore plot: it makes nothing this month.', sabotage: { order: 'c', culprit: 'lena', worked: true, guarded: false } }),
  },
  {
    id: 'rumourWorked', label: 'A rumour takes',
    event: rumour({ line: 'A rumour: Food opens 25% higher at the auction.', sabotage: { order: 'd', culprit: null, worked: true, guarded: false } }),
  },
  {
    id: 'rumourSeen', label: 'A rumour, caught',
    event: rumour({ line: 'Caught! The saboteur is named.', sabotage: { order: 'e', culprit: 'lena', worked: false, guarded: false } }),
  },
];
