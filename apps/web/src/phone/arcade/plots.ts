import { MINERAL_ODDS, TERRAIN_ODDS, type Good, type Ground, type Outfit, type RawGood } from '@mule/engine';
import type { TileView } from '@mule/protocol';
import { GOOD_NAME, TERRAIN_NAME } from '@mule/ui';
import { groundPips, plotName } from '../../game/derive';

/**
 * What a plot suits, from its analysis when the player has one, else its land's odds (the development audit's helpers
 * the arcade mock's guide and side room read, design/mocks/ws6-ux/src/screens/audit/dev/fixture.ts, on the view).
 */

export const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const GROWN = ['food', 'water', 'energy'] as const;

/** Every outfit in words, the Green belt too (it is not a good). */
export const OUTFIT_WORD: Record<Outfit, string> = { ...(GOOD_NAME as Record<Good, string>), greenBelt: 'Green belt' };

/** The good the ground is best for: the most dots, the outfitters' order on a tie. */
export function bestHere(ground: Ground): RawGood {
  return RAW.reduce((b, g) => (groundPips(g, ground[g]) > groundPips(b, ground[b]) ? g : b), RAW[0]!);
}

const oddsOf = (t: Pick<TileView, 'terrain'>) => TERRAIN_ODDS[t.terrain as keyof typeof TERRAIN_ODDS] as (typeof TERRAIN_ODDS)[keyof typeof TERRAIN_ODDS] | undefined;

/** Goods a plot suits: from its analysis (3 dots or more), else from its land's odds. */
export function suits(t: Pick<TileView, 'terrain' | 'ground'>): Good[] {
  if (t.ground) return RAW.filter((g) => groundPips(g, t.ground![g]) >= 3);
  const odds = oddsOf(t);
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
  const odds = oddsOf(t);
  const poor = odds ? GROWN.filter((g) => odds.grown[g] === 'poor') : [];
  return `${poor.length ? `poor for ${list([...poor])}; ` : ''}analyse it to know`;
}

/** How well a plot fits a good, for the guide: the analysis when known, else the land's odds (Crystite and Rare earth: anywhere). */
function fit(t: TileView, good: Outfit): number {
  // A factory or the Green belt makes its good from inputs, not from the ground: every plot fits it the same.
  if (!(RAW as string[]).includes(good)) return 2;
  const raw = good as RawGood;
  if (t.ground) return groundPips(raw, t.ground[raw]);
  const odds = oddsOf(t);
  if (!odds) return 0;
  if (raw === 'smithore') return Object.keys(MINERAL_ODDS).indexOf(odds.mined.smithore);
  if (raw === 'crystite' || raw === 'rareEarth') return 2;
  const o = odds.grown[raw];
  return o === 'good' ? 3 : o === 'poor' ? 1 : 2;
}

/**
 * V-2, RULE-9 row 3a: the best of the player's free plots for a good (by the analysis, else the land's odds), the
 * nearer only on a tie; null when none is free.
 */
export function bestFreePlot(tiles: TileView[], owner: string, good: Outfit, from: { x: number; y: number }): TileView | null {
  const free = tiles.filter((t) => t.owner === owner && !t.outfit);
  if (free.length === 0) return null;
  const d = (t: TileView) => Math.hypot(t.x - from.x, t.y - from.y);
  return [...free].sort((a, b) => fit(b, good) - fit(a, good) || d(a) - d(b))[0]!;
}

/** "Plains 4·1". */
export const plotTitle = (t: Pick<TileView, 'terrain' | 'x' | 'y'>) => `${TERRAIN_NAME[t.terrain]} ${plotName(t.x, t.y)}`;
