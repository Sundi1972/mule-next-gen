import { emptyStock, MINERAL_ODDS, TERRAIN_ODDS as ODDS, UPKEEP, type Good, type Ground, type Outfit, type RawGood, type Terrain } from '@mule/engine';
import type { MuleView, MyView, PlayerView, TileView } from '@mule/protocol';
import { GOOD_NAME, TERRAIN_NAME } from '@mule/ui';
import { plotName } from '../../../../../../../apps/web/src/game/derive';
import { ME, PLAYERS, TILES, VIEW } from '../../../fixture';
import { FED, type Condition } from '../../../proposed/Condition';

/**
 * Development after the UX audit (docs/research/2026-10-28-ws6-ux-audit.md §6): Lena's month 2, as the brief has it.
 * Fixture data only. Every rule number is read from @mule/engine's config (UPKEEP, DEVELOPMENT, TERRAIN_ODDS); the
 * walking numbers from the approved stand-in for DEV_WALK (proposed/Condition.tsx).
 *
 * Lena owns three plots: Plains 4·1 (no MULE), Tundra 3·4 (an Energy MULE she put there in month 1 without analysing;
 * analysed since, it reads Water 3 of 4, Energy 1 of 4) and Crater 15·1 (no MULE). She ate 1 of the 3 Food she needs,
 * so her pace is 47%. 300 cr, or 66 cr in #pace.
 *
 * The map is the shared fixture's, with two plots repainted so the brief's names are true: 3·4 to tundra, 15·1 to crater.
 */

export const STORE = { x: 6, y: 4 };
export const PLAINS = { x: 3, y: 0 };
export const TUNDRA = { x: 2, y: 3 };
export const CRATER = { x: 14, y: 0 };
export const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
export const same = (a: { x: number; y: number } | null | undefined, b: { x: number; y: number } | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;

/** What is really underground on Lena's plots (engine ratings: grown goods -2 to +3, mined 0 to 4). Hidden until analysed. */
export const GROUND: Record<string, Ground> = {
  // Plains: the odds say Food and Energy; this one is best for Water. The reason to analyse before you install.
  [key(PLAINS)]: { food: 1, water: 2, energy: 1, smithore: 1, crystite: 0, rareEarth: 0 },
  // Tundra: Water 3 of 4, Energy 1 of 4, as the brief says. Analysed after her Energy MULE went in.
  [key(TUNDRA)]: { food: -1, water: 2, energy: 0, smithore: 2, crystite: 0, rareEarth: 1 },
  [key(CRATER)]: { food: -2, water: 0, energy: 0, smithore: 1, crystite: 3, rareEarth: 1 },
};

/** Lena's plots, and what stands on each, by month. */
const LENA_PLOTS: Record<1 | 2, { at: { x: number; y: number }; terrain: Terrain; outfit: Outfit | null; analysed: boolean }[]> = {
  1: [
    { at: PLAINS, terrain: 'plains', outfit: null, analysed: false },
    { at: TUNDRA, terrain: 'tundra', outfit: null, analysed: false },
  ],
  2: [
    { at: PLAINS, terrain: 'plains', outfit: null, analysed: false },
    { at: TUNDRA, terrain: 'tundra', outfit: 'energy', analysed: true },
    { at: CRATER, terrain: 'crater', outfit: null, analysed: false },
  ],
};

/** The others' plots in month 1 and 2: fewer than the shared month-5 fixture. */
const OTHERS: Record<1 | 2, Record<string, [string, Outfit | null]>> = {
  // Month 1: only Ossa (an AI) has a MULE in yet; Kai's and Brix's first go in as development runs (dev/TvFirstMonth.tsx).
  1: { '12,4': ['ossa', 'smithore'], '1,4': ['ossa', null], '9,2': ['brix', null], '3,2': ['brix', null], '9,7': ['kai', null], '6,7': ['kai', null] },
  2: {
    '12,4': ['ossa', 'smithore'], '13,4': ['ossa', 'smithore'], '1,4': ['ossa', 'energy'], '10,2': ['ossa', 'crystite'],
    '9,2': ['brix', 'smithore'], '3,2': ['brix', 'food'], '4,5': ['brix', null],
    '9,7': ['kai', 'water'], '6,7': ['kai', 'food'],
  },
};

function tiles(month: 1 | 2): TileView[] {
  const lena = new Map(LENA_PLOTS[month].map((p) => [key(p.at), p]));
  return TILES.map((t): TileView => {
    const mine = lena.get(key(t));
    if (mine) {
      return { ...t, terrain: mine.terrain, peaks: 0, owner: 'lena', outfit: mine.outfit, pollution: 0, ...(mine.analysed ? { ground: GROUND[key(t)]! } : {}) };
    }
    const [owner, outfit] = OTHERS[month][key(t)] ?? [null, null];
    return { ...t, owner, outfit, pollution: 0 };
  });
}

/** This month's need, as the engine works it out (production.ts needsOf): the household, plus one per few crew. */
const crewOf = (month: 1 | 2) => LENA_PLOTS[month].filter((p) => p.outfit).length * UPKEEP.crew.raw;
export const foodNeed = (month: 1 | 2) => UPKEEP.baseFood + Math.ceil(crewOf(month) / UPKEEP.crewPerFood);
const waterNeed = (month: 1 | 2) => UPKEEP.baseWater + Math.ceil(crewOf(month) / UPKEEP.crewPerWater);

/** Month 2: Lena had 1 Food and ate it, 1 of the 3 she needs. */
export const ATE: Record<1 | 2, number> = { 1: foodNeed(1), 2: 1 };
/** The MULE's price this month (the audit's month 2: 139 cr). */
export const MULE_PRICE = 139;

function me(month: 1 | 2): MyView {
  return {
    ...ME,
    stock: { ...emptyStock(), food: 0, water: 1, energy: month === 2 ? 1 : 0 },
    needs: { food: foodNeed(month), water: waterNeed(month) },
    monthNeeds: { ...emptyStock(), food: foodNeed(month), water: waterNeed(month), energy: 0 },
    hungry: ATE[month] < foodNeed(month),
    mulePrice: MULE_PRICE,
    carriedMule: null,
    produced: emptyStock(),
  };
}

const MONEY: Record<string, number> = { ossa: 520, brix: 410, kai: 280 };

/** The view Lena's phone sees: month 1 or 2, her money. */
export function devView(month: 1 | 2, money: number): MuleView {
  const t = tiles(month);
  const players: PlayerView[] = PLAYERS.map((p) => ({
    ...p,
    money: p.id === 'lena' ? money : (MONEY[p.id] ?? p.money),
    plots: t.filter((x) => x.owner === p.id).length,
    ready: false,
    doneDeveloping: false,
  }));
  return { ...VIEW, month, phase: 'development', tiles: t, players, me: me(month), mulePrice: MULE_PRICE, storeMules: 6, news: [] };
}

/** Each seat's condition: Lena per month (month 1 fed, month 2 she ate 1 of 3); Brix a little short; the AIs fed. */
export const conditions = (month: 1 | 2): Record<string, Condition> => ({
  lena: { ate: ATE[month], need: foodNeed(month), sick: false },
  ossa: FED,
  brix: month === 2 ? { ate: 8, need: 10, sick: false } : FED,
  kai: FED,
});

// --- What a plot suits ------------------------------------------------------------------------

export const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const GROWN = ['food', 'water', 'energy'] as const;

/** 0 to 4 dots, the scale the readout and the map's chips share (derive.ts groundPips). */
export function pips(good: RawGood, rating: number): number {
  const grown = (GROWN as readonly string[]).includes(good);
  return Math.max(0, Math.min(4, grown ? rating + 1 : rating));
}

/** The good the ground is best for: the most dots, the outfitters' order on a tie. */
export function bestHere(ground: Ground): RawGood {
  return RAW.reduce((b, g) => (pips(g, ground[g]) > pips(b, ground[b]) ? g : b), RAW[0]!);
}

/** Goods a plot suits: from its analysis when there is one (3 dots or more), else from its land's odds. */
export function suits(t: Pick<TileView, 'terrain' | 'ground'>): Good[] {
  if (t.ground) return RAW.filter((g) => pips(g, t.ground![g]) >= 3);
  const odds = ODDS[t.terrain as keyof typeof ODDS];
  if (!odds) return [];
  const grown = GROWN.filter((g) => odds.grown[g] === 'good');
  const mined = odds.mined.smithore === 'high' || odds.mined.smithore === 'veryHigh' ? (['smithore'] as const) : [];
  return [...grown, ...mined];
}

const list = (goods: Good[]) => (goods.length <= 1 ? goods.map((g) => GOOD_NAME[g]).join('') : `${goods.slice(0, -1).map((g) => GOOD_NAME[g]).join(', ')} and ${GOOD_NAME[goods.at(-1)!]}`);

/** What a plot suits, in a few words: "often good for Food and Energy", "analysed: best for Water". */
export function suitsLine(t: Pick<TileView, 'terrain' | 'ground'>): string {
  if (t.ground) return `analysed: best for ${GOOD_NAME[bestHere(t.ground)]}`;
  const s = suits(t);
  if (s.length > 0) return `often good for ${list(s)}`;
  const odds = ODDS[t.terrain as keyof typeof ODDS];
  const poor = odds ? GROWN.filter((g) => odds.grown[g] === 'poor') : [];
  return `${poor.length ? `poor for ${list([...poor])}; ` : ''}analyse it to know`;
}

/** How well a plot fits a good, for the guide: the analysis when known, else the land's odds (Crystite and Rare earth: anywhere). */
function fit(t: TileView, good: Good): number {
  // A factory makes its good from inputs, not from the ground: every plot fits it the same.
  if (!(RAW as string[]).includes(good)) return 2;
  const raw = good as RawGood;
  if (t.ground) return pips(raw, t.ground[raw]);
  const odds = ODDS[t.terrain as keyof typeof ODDS];
  if (!odds) return 0;
  if (raw === 'smithore') return Object.keys(MINERAL_ODDS).indexOf(odds.mined.smithore);
  if (raw === 'crystite' || raw === 'rareEarth') return 2;
  const o = odds.grown[raw];
  return o === 'good' ? 3 : o === 'poor' ? 1 : 2;
}

/**
 * V-2, RULE-7 row 5 changed (WS6's rule): the guide sends a MULE to the BEST of your free plots for its good (by the
 * analysis, else the land's odds), the nearer one only on a tie. Today it picks the nearest plot with no MULE.
 */
export function bestFreePlot(view: MuleView, good: Good, from: { x: number; y: number }): { plot: TileView; passed: TileView[] } | null {
  const free = view.tiles.filter((t) => t.owner === 'lena' && !t.outfit);
  if (free.length === 0) return null;
  const d = (t: TileView) => Math.hypot(t.x - from.x, t.y - from.y);
  const ranked = [...free].sort((a, b) => fit(b, good) - fit(a, good) || d(a) - d(b));
  return { plot: ranked[0]!, passed: ranked.slice(1) };
}

export const plotTitle = (t: Pick<TileView, 'terrain' | 'x' | 'y'>) => `${TERRAIN_NAME[t.terrain]} ${plotName(t.x, t.y)}`;
