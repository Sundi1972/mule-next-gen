import { colonyScoreOf } from '@mule/engine';
import type { ColonyProjectView, ColonyView, MuleView, MyView } from '@mule/protocol';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';

/**
 * The table in every screen: four seats, Heiko on this phone, as apps/web/test/colony-screens.test.ts seats them. Every
 * number is a fixture; the colony's score is the engine's own colonyScoreOf (RULE-25) over the fixture's gauges, so the
 * sum on screen adds up the way the server's will.
 */

export const SELF = 's1';

const stock = { food: 4, water: 2, energy: 3, smithore: 0, crystite: 0, rareEarth: 0, alloy: 1, electronics: 0, medicine: 0 };

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
  return {
    cost: { credits: 1_400, goods: { alloy: 4, electronics: 2 } },
    funded: { credits: 1_400, goods: { alloy: 4, electronics: 2 } },
    buildMonths: 3,
    monthsLeft: null,
    plot: null,
    prestige: 4,
    upkeep: 70,
    repairCost: null,
    plaque: [],
    ...over,
  };
}

const STADIUM = project({ id: 'stadium', name: 'Stadium', stage: 'commissioned', funded: { credits: 860, goods: { alloy: 4, electronics: 1 } }, plaque: [{ playerId: 's2', value: 300 }, { playerId: 's4', value: 120 }] });
const HOSPITAL = project({ id: 'hospital', name: 'Hospital', stage: 'building', buildMonths: 2, monthsLeft: 1, prestige: 3, plaque: [{ playerId: 's1', value: 200 }] });
const PARK = project({ id: 'park', name: 'Park', stage: 'standing', prestige: 2, upkeep: 30, plaque: [{ playerId: 's2', value: 150 }] });

/**
 * CONTRACT: ws7-score-monthly (WS7, settled 5 Nov). Neither change is in the protocol on this base yet:
 * - `score` keeps its shape and the server fills it in every phase; the screens choose to show it at the month end, and
 *   the verdict only at game over;
 * - `lastScore?: number | null` is the previous month end's total, null in month 1.
 * The mock extends the type locally until WS7's branch lands.
 */
export type ColonyViewNext = ColonyView & { lastScore?: number | null };

type Gauges = ColonyView['gauges'];
type Air = MuleView['air'];

/** RULE-25 on the fixture's gauges: the engine's own function, as the server would fill `score` at the month end. */
export const scoreOf = (g: Pick<Gauges, 'wealth' | 'prestige'> & { happiness: number | null }, air: number) => colonyScoreOf({ wealth: g.wealth, air, prestige: g.prestige, happiness: g.happiness ?? 50 });

export interface Month {
  month: number;
  air: Air;
  lastAir: Air | null;
  gauges: Gauges;
  lastGauges: ColonyView['lastGauges'];
  worths: Record<string, [number, number | null, number | null]>;
  projects: ColonyProjectView[];
  fund: number;
}

/** Month 1's end: nothing built, nothing to compare with. */
export const MONTH_1: Month = {
  month: 1,
  air: { level: 24, band: 'clean' },
  lastAir: null,
  gauges: { wealth: 18_600, environment: 24, prestige: 0, happiness: 50, band: 'content' },
  lastGauges: null,
  worths: { s1: [4_120, null, null], s2: [4_460, null, null], s3: [3_980, null, null], s4: [4_050, null, null] },
  projects: [],
  fund: 600,
};

/** Month 7's end: the park stands, the hospital builds, the stadium collects. */
export const MONTH_7: Month = {
  month: 7,
  air: { level: 38, band: 'smoggy' },
  lastAir: { level: 35, band: 'smoggy' },
  gauges: { wealth: 26_400, environment: 38, prestige: 2, happiness: 64, band: 'content' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 58 },
  worths: { s1: [6_420, 6_100, null], s2: [7_050, 6_600, null], s3: [4_980, 5_020, null], s4: [5_610, 5_300, null] },
  projects: [STADIUM, HOSPITAL, PARK],
  fund: 2_340,
};

/** Month 9's end in Collapse: every Worth is cut, the colony's score is not (RULE-25 counts the wealth before any cut). */
export const COLLAPSE: Month = {
  month: 9,
  air: { level: 86, band: 'collapse' },
  lastAir: { level: 71, band: 'toxic' },
  gauges: { wealth: 27_900, environment: 86, prestige: 5, happiness: 41, band: 'restless' },
  lastGauges: { wealth: 28_300, prestige: 5, happiness: 47 },
  worths: { s1: [5_480, 6_610, 6_850], s2: [5_960, 7_380, 7_450], s3: [4_100, 5_040, 5_125], s4: [4_620, 5_700, 5_775] },
  projects: [STADIUM, { ...HOSPITAL, stage: 'standing', monthsLeft: null }, PARK],
  fund: 1_120,
};

const NAMES: [string, string, 'zipwing' | 'bramblet' | 'gearling' | 'mollox', boolean][] = [
  ['s1', 'Heiko', 'zipwing', false],
  ['s2', 'Mia', 'bramblet', false],
  ['s3', 'Kai', 'gearling', false],
  ['s4', 'Ruth', 'mollox', true],
  ['s5', 'Pip', 'zipwing', false],
  ['s6', 'Ossa', 'bramblet', true],
];

/**
 * The view at that month's end. `politics` off: no colony, no council (HC-22), today's screens. `withScore` false: the
 * view as the server sends it today, `score` null until game over and no `lastScore`.
 */
export function monthEnd(m: Month, { politics = true, withScore = true }: { politics?: boolean; withScore?: boolean } = {}): MuleView {
  const score = scoreOf(m.gauges, m.air.level);
  const colony: ColonyViewNext = { gauges: m.gauges, lastGauges: m.lastGauges, fund: m.fund, ledger: null, projects: m.projects, catalogue: [], score: withScore ? score : null, ...(withScore ? { lastScore: lastScoreOf(m) } : {}) };
  return aMuleView({
    players: NAMES.filter(([id]) => id in m.worths).map(([id, name, species, isAi], slot) => {
      const [worth, lastWorth, worthBeforeCut] = m.worths[id]!;
      return aPlayer({ id, name, slot, species, isAi, worth, lastWorth, worthBeforeCut, ready: isAi });
    }),
    me: ME,
    politics: null,
    month: m.month,
    phase: 'upkeep',
    mulePrice: 150,
    colonists: 412,
    colonistsFed: true,
    air: m.air,
    lastAir: m.lastAir,
    treasury: { money: m.fund, salesTax: 0.05 },
    ...(politics ? { colony } : {}),
  });
}

/** Last month's colony total, as the server records it (the engine's own score of last month's gauges). */
function lastScoreOf(m: Month): number | null {
  if (!m.lastGauges || !m.lastAir) return null;
  return scoreOf(m.lastGauges, m.lastAir.level).total;
}

/**
 * Month 2's end at a full table, six seats (WS4's TV-FIT case, B-AC-27-2): the stadium collecting, the park building.
 * The numbers are this mock's; the e2e's scales come from a real seeded game.
 */
export const SIX_MONTH_2: Month = {
  month: 2,
  air: { level: 27, band: 'clean' },
  lastAir: { level: 24, band: 'clean' },
  gauges: { wealth: 21_300, environment: 27, prestige: 0, happiness: 55, band: 'content' },
  lastGauges: { wealth: 19_800, prestige: 0, happiness: 50 },
  worths: { s1: [4_610, 4_120, null], s2: [4_980, 4_460, null], s3: [4_020, 3_980, null], s4: [4_330, 4_050, null], s5: [3_870, 3_940, null], s6: [4_720, 4_200, null] },
  projects: [STADIUM, { ...PARK, stage: 'building', monthsLeft: 1 }],
  fund: 940,
};

/** Game over, for the "unchanged" pages: the real TvGameOver and the real phone GameOver with C34's score. */
export function gameOver(): MuleView {
  const m: Month = { ...MONTH_7, month: 12, gauges: { wealth: 31_200, environment: 38, prestige: 14, happiness: 71, band: 'content' } };
  const v = monthEnd({ ...m, projects: [{ ...STADIUM, stage: 'standing', plaque: [{ playerId: 's2', value: 300 }, { playerId: 's1', value: 250 }, { playerId: 's4', value: 120 }] }, { ...HOSPITAL, stage: 'standing', monthsLeft: null }, PARK] });
  return { ...v, finished: true, phase: 'gameOver', scores: v.players.map((p) => ({ id: p.id, score: p.worth })) };
}
