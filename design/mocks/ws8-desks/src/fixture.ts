import { PRESTIGE, type Good, type LawId, type LawProposal, type PrestigeId, type Terrain } from '@mule/engine';
import type { ColonyCatalogueView, ColonyProjectView, ColonyView, CouncilView, MuleView, MyView, PlayerView, PoliticsView, TileView } from '@mule/protocol';
import { airBandStyle } from '@mule/ui';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';

/**
 * The table in every screen: five seats, Lena hosts and governs, Ossa is the Land Baron. Lena, Kai and Pip are people;
 * Ossa and Brix are AI seats, so the ballot waits only for the three phones. Every number is a fixture; the catalogue's
 * prices are the engine's own PRESTIGE.
 */
export const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, money: 1_240, plots: 5, worth: 6_100 }),
  aPlayer({ id: 's2', name: 'Ossa', slot: 1, species: 'bramblet', isAi: true, money: 2_050, plots: 9, worth: 7_300 }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, species: 'gearling', money: 880, plots: 7, worth: 5_200 }),
  aPlayer({ id: 's4', name: 'Brix', slot: 3, species: 'mollox', isAi: true, money: 1_500, plots: 6, worth: 5_900 }),
  aPlayer({ id: 's5', name: 'Pip', slot: 4, money: 640, plots: 3, worth: 4_100 }),
];

export const GOVERNOR = 's1';
export const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

/** Vote weights: 10 in all, so "7 to 3" and "3 to 3" both happen with the seats as they are. */
export const WEIGHT: Record<string, number> = { s1: 2, s2: 3, s3: 2, s4: 2, s5: 1 };

/**
 * The public facts RULE-45's preview reads, per player. CONTRACT: the view carries the impact of the PENDING proposal
 * only (politics.proposal.impact); the picker's preview before Propose needs either the impact of every law × setting
 * in the view, or the server's answer to a dry-run. The mock computes it here, as the engine's lawImpact would.
 */
export const FACTS: Record<string, { pollutionBy: number; shipWorth: number; cappedPlots: number }> = {
  s1: { pollutionBy: 1.5, shipWorth: 300, cappedPlots: 0 },
  s2: { pollutionBy: 4, shipWorth: 900, cappedPlots: 2 },
  s3: { pollutionBy: 0, shipWorth: 150, cappedPlots: 1 },
  s4: { pollutionBy: 2, shipWorth: 420, cappedPlots: 1 },
  s5: { pollutionBy: 0.5, shipWorth: 0, cappedPlots: 0 },
};
export const AIR = 46;

const stock = { food: 4, water: 3, energy: 2, smithore: 0, crystite: 0, rareEarth: 0, alloy: 1, electronics: 0, medicine: 0 };

export function meOf(id: string, lawBallot: boolean | null = null): MyView {
  return {
    id,
    species: PLAYERS.find((p) => p.id === id)?.species ?? 'zipwing',
    stock: { ...stock },
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
    installedThisTurn: false,
    worthParts: { money: 1_240, goods: 160, plots: 5, land: 1_500, mules: 4, muleValue: 600, office: 300, cut: 0 },
    politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, paid: 420, reputation: 55, lawBallot },
  };
}

// --- The map: a small colony, enough to give the hub's Look tool something to show -----------------------

const W = 9;
const H = 5;
const ROWS = ['ppphRhmmp', 'pphhRpppm', 'ffpp#ppdd', 'ppfhRhppd', 'mppfRppmm'];
const T: Record<string, Terrain> = { p: 'plains', h: 'hills', m: 'mountains', R: 'river', f: 'forest', d: 'desert', '#': 'store' as Terrain };
const OWNED: Record<string, [string, TileView['outfit']]> = {
  '0,0': ['s1', 'food'], '1,0': ['s1', 'energy'], '0,1': ['s1', null], '2,3': ['s1', 'water'], '3,4': ['s1', null],
  '6,0': ['s2', 'smithore'], '7,0': ['s2', 'smithore'], '8,1': ['s2', 'alloy'], '7,1': ['s2', 'energy'], '8,2': ['s2', null], '7,4': ['s2', 'rareEarth'], '8,4': ['s2', null], '6,1': ['s2', 'food'], '5,1': ['s2', null],
  '0,2': ['s3', 'food'], '1,2': ['s3', 'food'], '0,3': ['s3', 'water'], '1,3': ['s3', null], '0,4': ['s3', 'rareEarth'], '1,4': ['s3', null], '2,4': ['s3', null],
  '5,3': ['s4', 'energy'], '6,3': ['s4', 'smithore'], '5,4': ['s4', 'alloy'], '6,4': ['s4', null], '7,3': ['s4', null], '5,2': ['s4', null],
  '2,0': ['s5', 'food'], '2,1': ['s5', null], '3,1': ['s5', null],
};
export const TILES: TileView[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): TileView => {
    const [owner, outfit] = OWNED[`${x},${y}`] ?? [null, null];
    const terrain = c === '#' ? ('plains' as Terrain) : T[c]!;
    return { x, y, terrain, peaks: terrain === 'mountains' ? 1 + ((x + y) % 3) : 0, owner, outfit, pollution: outfit === 'alloy' || outfit === 'smithore' ? 1 : 0, filter: false };
  }),
);

// --- The colony ---------------------------------------------------------------------------------------

type Funded = { credits: number; goods?: Partial<Record<Good, number>> };

export function project(id: PrestigeId, stage: ColonyProjectView['stage'], extra: Partial<ColonyProjectView> & { fundedBy?: Funded } = {}): ColonyProjectView {
  const p = PRESTIGE[id];
  const { fundedBy, ...rest } = extra;
  const done = stage !== 'commissioned';
  return {
    id,
    name: p.name,
    stage,
    cost: { credits: p.credits, goods: { ...p.goods } },
    funded: done ? { credits: p.credits, goods: { ...p.goods } } : { credits: fundedBy?.credits ?? 0, goods: { ...(fundedBy?.goods ?? {}) } },
    buildMonths: p.buildMonths,
    monthsLeft: stage === 'building' ? p.buildMonths : null,
    plot: p.needsPlot && done ? 22 : null,
    prestige: p.prestige,
    upkeep: p.upkeep,
    repairCost: stage === 'damaged' ? p.repairCost : null,
    plaque: [],
    maxBid: null,
    ...rest,
  };
}

/** The catalogue as the server words it, RULE-22's message for each row that can't be commissioned now. */
export function catalogue(projects: ColonyProjectView[], votesOpen = false): ColonyCatalogueView[] {
  const open = projects.find((q) => q.stage === 'commissioned' || q.stage === 'building');
  return (Object.keys(PRESTIGE) as PrestigeId[]).map((id) => {
    const p = PRESTIGE[id];
    const why = votesOpen
      ? 'Commission once the votes are over'
      : projects.some((q) => q.id === id)
        ? `The colony already has a ${p.name}`
        : open
          ? `The colony is already building the ${open.name}`
          : null;
    return { id, name: p.name, credits: p.credits, goods: { ...p.goods }, buildMonths: p.buildMonths, needsPlot: p.needsPlot, prestige: p.prestige, upkeep: p.upkeep, commissionable: why === null, why };
  });
}

export function colony(projects: ColonyProjectView[], fund = 2_340, votesOpen = false): ColonyView {
  const prestige = projects.filter((p) => p.stage === 'standing').reduce((a, p) => a + p.prestige, 0) + 1;
  return {
    gauges: { wealth: 14_800, environment: AIR, prestige, happiness: 62, band: 'content' },
    lastGauges: { wealth: 14_100, prestige, happiness: 60 },
    fund,
    ledger: null,
    projects,
    catalogue: catalogue(projects, votesOpen),
    strike: null,
    score: null,
  };
}

/** The park collecting: 220 of 420 cr in, no Alloy yet; Lena gave 150, Kai 70. It needs a plot and has none. */
export const PARK_COLLECTING = project('park', 'commissioned', { fundedBy: { credits: 220 }, plaque: [{ playerId: 's1', value: 150 }, { playerId: 's3', value: 70 }] });
export const HOSPITAL_STANDING = project('hospital', 'standing', { plaque: [{ playerId: 's2', value: 400 }, { playerId: 's1', value: 220 }] });
export const OBSERVATORY_DAMAGED = project('observatory', 'damaged', { plaque: [{ playerId: 's4', value: 300 }] });
export const HOSPITAL_CLOSED = project('hospital', 'closed', { plaque: [{ playerId: 's2', value: 400 }] });

// --- Politics -----------------------------------------------------------------------------------------

export type Laws = NonNullable<PoliticsView['laws']>;

export function politics(extra: Partial<PoliticsView> = {}): PoliticsView {
  return {
    governor: GOVERNOR,
    sheriff: null,
    term: [3, 6],
    next: 7,
    baron: 's2',
    tax: { percent: 6, start: 6, low: 4, high: 8 },
    fund: 2_340,
    pay: { governor: 50 },
    weights: PLAYERS.map(({ id }) => ({ id, votes: WEIGHT[id]!, parts: { base: 1, land: id === 's2' ? 1 : 0, reputation: 0, baron: id === 's2' ? 1 : 0, taxes: WEIGHT[id]! - 1 - (id === 's2' ? 2 : 0) } })),
    candidates: { governor: [] },
    promises: {},
    promise: { kind: 'cap', percent: 8 },
    promiseFrom: 6,
    election: null,
    proposal: null,
    council: null,
    laws: {},
    retry: {},
    ...extra,
  };
}

export const THREE_LAWS: Laws = { exportTax: { setting: 10, since: 2 }, pollutionTax: { setting: 20, since: 3 }, emissionCap: { setting: 50, since: 3 } };
export const ONE_LAW: Laws = { landTax: { setting: 10, since: 5 } };

export const LAND_TAX_10: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

/** The council at its ballot: Ossa and Brix (AI) have voted and are Done; the Governor's ballot starts at yes. */
export function council(stage: CouncilView['stage'], extra: Partial<CouncilView> = {}): CouncilView {
  return {
    stage,
    proposal: LAND_TAX_10,
    proposer: GOVERNOR,
    impact: {},
    voted: ['s1', 's2', 's4'],
    done: ['s2', 's4'],
    waitingFor: ['s1', 's3', 's5'],
    clockMs: 0,
    revealMs: 4_000,
    result: null,
    ...extra,
  };
}

export const PASSED = { passed: true, yes: 7, no: 3, tie: false };
export const FAILED = { passed: false, yes: 3, no: 7, tie: false };
export const TIE = { passed: true, yes: 3, no: 3, tie: true };

// --- A whole game -------------------------------------------------------------------------------------

export function game({ seat = GOVERNOR, month = 5, col, pol, lawBallot = null }: { seat?: string; month?: number; col: ColonyView; pol: PoliticsView; lawBallot?: boolean | null }): MuleView {
  return aMuleView({
    players: PLAYERS,
    me: meOf(seat, lawBallot),
    politics: { ...pol, fund: col.fund },
    colony: col,
    month,
    phase: 'planning',
    width: W,
    height: H,
    tiles: TILES,
    colonists: 1_200,
    air: { level: AIR, band: airBandStyle(AIR).name },
    treasury: { money: col.fund, salesTax: 0.06 },
    ship: { arrives: 6, inPort: false, wants: null },
  });
}

export type { LawId };
