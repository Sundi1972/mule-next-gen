import { colonyScoreOf } from '@mule/engine';
import type { ColonyGaugesView, ColonyProjectView, ColonyView, MuleView, MyView } from '@mule/protocol';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';

/**
 * The colony at month 7's end, as apps/web/test/colony-screens.test.ts's MIDGAME sets it (wealth 26,400, fund 2,340,
 * prestige 2 with the park standing, air 38 Smoggy against 35), with its health in three states. Every number is a
 * fixture. The colony score is the engine's own colonyScoreOf (RULE-25), so the phone's score line is what trunk shows.
 */

export const SELF = 's1';

// --- The new field ------------------------------------------------------------------------------------

/**
 * Colony health (WS5's rule, approved by Heiko 6 Nov): the share of colonists who are well, never below the floor.
 * SEAM: not in ColonyGaugesView yet (WS5/WS7)
 */
export interface HealthView {
  /** The share of colonists who are well, 60 to 100. */
  well: number;
  /** Last month end's share; null in month 1. */
  lastWell: number | null;
  /** Sick colonists in 100. */
  sick: number;
}

/** SEAM: not in ColonyGaugesView yet (WS5/WS7). The colony view with health beside the gauges, local to this mock. */
export type ColonyViewHealth = ColonyView & { health: HealthView };

/** SEAM: WS5's floor: at most 4 in 10 are ever sick, so health never reads below 60. From config when WS5's rule lands. */
export const HEALTH_FLOOR = 60;

/** SEAM: decision 25: below 80 the crews start falling sick. From config when WS5's rule lands. */
export const HEALTH_CREWS = 80;

// --- The three states ---------------------------------------------------------------------------------

export type StateId = 'well' | 'sick' | 'limit';

export interface HealthState {
  id: StateId;
  name: string;
  health: HealthView;
  happiness: number;
  band: NonNullable<ColonyGaugesView['band']>;
  lastHappiness: number;
}

export const STATES: Record<StateId, HealthState> = {
  // MIDGAME as the test has it: Content 64, up 6.
  well: { id: 'well', name: 'Well', health: { well: 97, lastWell: 96, sick: 3 }, happiness: 64, band: 'content', lastHappiness: 58 },
  // Medicine short this month: 22 in 100 sick, the mood down to Restless 52.
  sick: { id: 'sick', name: 'Sick spell', health: { well: 78, lastWell: 92, sick: 22 }, happiness: 52, band: 'restless', lastHappiness: 57 },
  // Medicine short three months running: 4 in 10 sick, the most there can be; the mood Unhappy 38.
  limit: { id: 'limit', name: 'At the limit', health: { well: 60, lastWell: 63, sick: 40 }, happiness: 38, band: 'unhappy', lastHappiness: 43 },
};

export const STATE_IDS: StateId[] = ['well', 'sick', 'limit'];

// --- The view -----------------------------------------------------------------------------------------

const stock = { food: 4, water: 2, energy: 3, smithore: 0, crystite: 0, rareEarth: 0, alloy: 1, electronics: 0, medicine: 0 };

/** COPY: ws8-monthly-score's fixture ME (Heiko's own phone). */
const ME: MyView = {
  id: SELF,
  species: 'zipwing',
  stock,
  carriedMule: null,
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 3, water: 2 },
  monthNeeds: { ...stock, food: 3, water: 2, energy: 2 },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: null,
  installedThisTurn: false,
  worthParts: { money: 2_900, goods: 220, plots: 7, land: 2_100, mules: 6, muleValue: 900, office: 300, cut: 0, donated: 0 },
};

function project(over: Partial<ColonyProjectView> & Pick<ColonyProjectView, 'id' | 'name' | 'stage'>): ColonyProjectView {
  return { cost: { credits: 1_400, goods: { alloy: 4, electronics: 2 } }, funded: { credits: 1_400, goods: { alloy: 4, electronics: 2 } }, buildMonths: 3, monthsLeft: null, plot: null, prestige: 4, upkeep: 70, repairCost: null, plaque: [], ...over };
}

/** MIDGAME's three live projects (the test's closed and damaged two are left out: health is not about them). */
const PROJECTS: ColonyProjectView[] = [
  project({ id: 'stadium', name: 'Stadium', stage: 'commissioned', funded: { credits: 860, goods: { alloy: 4, electronics: 1 } } }),
  project({ id: 'hospital', name: 'Hospital', stage: 'building', buildMonths: 2, monthsLeft: 1, prestige: 3 }),
  project({ id: 'park', name: 'Park', stage: 'standing', prestige: 2, upkeep: 30 }),
];

const PLAYERS: [string, string, 'zipwing' | 'bramblet' | 'gearling' | 'mollox', boolean, number, number][] = [
  ['s1', 'Heiko', 'zipwing', false, 6_420, 6_100],
  ['s2', 'Mia', 'bramblet', false, 7_050, 6_600],
  ['s3', 'Kai', 'gearling', false, 4_980, 5_020],
  ['s4', 'Ruth', 'mollox', true, 5_610, 5_300],
];

/** Six seats, the most a table has: the TV month end's tightest fit (TV-FIT, PM ruling C, 5 Nov). */
const SIX: typeof PLAYERS = [...PLAYERS, ['s5', 'Ossa', 'bramblet', true, 5_940, 5_700], ['s6', 'Brix', 'gearling', true, 4_410, 4_650]];

const AIR = { level: 38, band: 'smoggy' } as const;
const LAST_AIR = { level: 35, band: 'smoggy' } as const;

/** Month 7's end in one of the three health states, as the server would send it once health is in the view. */
export function monthEnd(s: HealthState, { withHealth = true, six = false }: { withHealth?: boolean; six?: boolean } = {}): MuleView {
  const gauges: ColonyGaugesView = { wealth: 26_400, environment: AIR.level, prestige: 2, happiness: s.happiness, band: s.band };
  const lastGauges = { wealth: 24_900, prestige: 2, happiness: s.lastHappiness };
  const score = colonyScoreOf({ wealth: gauges.wealth, air: AIR.level, prestige: gauges.prestige, happiness: s.happiness });
  const lastScore = colonyScoreOf({ wealth: lastGauges.wealth, air: LAST_AIR.level, prestige: lastGauges.prestige, happiness: s.lastHappiness }).total;
  const base: ColonyView = { gauges, lastGauges, fund: 2_340, ledger: null, projects: PROJECTS, catalogue: [], score, lastScore };
  // `withHealth` false: the view as the server sends it today, for the trunk baselines.
  const colony: ColonyView | ColonyViewHealth = withHealth ? { ...base, health: s.health } : base;
  return aMuleView({
    players: (six ? SIX : PLAYERS).map(([id, name, species, isAi, worth, lastWorth], slot) => aPlayer({ id, name, slot, species, isAi, worth, lastWorth, ready: isAi })),
    me: ME,
    politics: null,
    month: 7,
    phase: 'upkeep',
    mulePrice: 150,
    colonists: 412,
    colonistsFed: true,
    air: AIR,
    lastAir: LAST_AIR,
    treasury: { money: 2_340, salesTax: 0.05 },
    colony,
  });
}

/** The health in a view, where this mock has put it. SEAM: `view.colony.health` once WS5/WS7 add it. */
export function healthOf(colony: ColonyView | null | undefined): HealthView | null {
  return (colony as Partial<ColonyViewHealth> | null | undefined)?.health ?? null;
}
