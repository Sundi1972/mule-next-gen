import { MAP, type PlacedSpecialKind, type SpecialKind as EngineSpecialKind } from '@mule/engine';
import type { MapTile, Terrain } from '@mule/ui';

/**
 * The six special fields as the design system will name and colour them. Five come with the map; the
 * meteor crater forms in play, where a meteor strikes.
 *
 * GRAFT (PR-4): `SpecialKind`, `MapSpecial`, `SPECIAL_NAME` and `SPECIAL_COLOR` move into
 * packages/ui/src/components/tokens.ts (the UI package does not depend on the engine, so it
 * keeps its own copy of the kind union, as it does for Good and Terrain), and `MapTile` gains
 * `special?: MapSpecial`. `specialLine` moves to apps/web/src/game/derive.ts next to TERRAIN_ODDS.
 */
export type SpecialKind = 'ruins' | 'crystalCavern' | 'geyser' | 'oasis' | 'relic' | 'meteorCrater';

/** Fails to compile if the engine's kinds and these drift apart. */
export type SameKinds = [SpecialKind] extends [EngineSpecialKind] ? ([EngineSpecialKind] extends [SpecialKind] ? true : never) : never;
export const KINDS_MATCH: SameKinds = true;

export interface MapSpecial {
  kind: SpecialKind;
  /** Ruins only: the good its salvage pays. */
  salvage?: 'alloy' | 'electronics';
}

/** A map plot as HoloMap takes it, with this mock's kinds: the design system's own list lacks the meteor crater until its badge is approved. */
export type SpecialTile = Omit<MapTile, 'special'> & { special?: MapSpecial };

export const SPECIAL_KINDS: SpecialKind[] = ['ruins', 'crystalCavern', 'geyser', 'oasis', 'relic', 'meteorCrater'];

/** The kinds a generated map can hold, read from the engine's placement rows. */
export const PLACED_KINDS = SPECIAL_KINDS.filter((k): k is PlacedSpecialKind => k in MAP.special.on);

export const SPECIAL_NAME: Record<SpecialKind, string> = {
  ruins: 'Ruins',
  crystalCavern: 'Crystal cavern',
  geyser: 'Geyser',
  oasis: 'Oasis',
  relic: 'Alien relic',
  meteorCrater: 'Meteor crater',
};

/**
 * DS-GAP: theme.css has no colour roles for special fields. Each kind borrows the colour of the
 * good it pays (so the colour teaches the effect): ruins the stone grey of Alloy, the cavern
 * Crystite, the geyser Water, the oasis Food. The relic pays no good of its own and borrows
 * Energy's gold, the hue furthest from the other four. Proposed: `--color-s-<kind>` in theme.css,
 * set to these values in both themes. Shape, not colour, tells the kinds apart; the colour only helps.
 * The meteor crater pays Crystite too, so it wears the cavern's colour through its own proposed token
 * (index.css), and its shape alone tells the two apart.
 */
export const SPECIAL_COLOR: Record<SpecialKind, string> = {
  ruins: 'var(--color-g-alloy)',
  crystalCavern: 'var(--color-g-crystite)',
  geyser: 'var(--color-g-water)',
  oasis: 'var(--color-g-food)',
  relic: 'var(--color-g-energy)',
  meteorCrater: 'var(--color-s-meteorCrater)',
};

const FX = MAP.specialEffect;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const SALVAGE_NAME = { alloy: 'Alloy', electronics: 'Electronics' } as const;

/** What a kind does, in general: the legend's line. Numbers from MAP.specialEffect. */
export const SPECIAL_EFFECT: Record<SpecialKind, string> = {
  ruins: `pays its first owner ${FX.salvage.alloy} Alloy or ${FX.salvage.electronics} Electronics, once, then is gone.`,
  crystalCavern: `+${FX.crystalCavern} Crystite when mined. Each month it's mined, a ${pct(FX.collapseChance)} chance it caves in.`,
  geyser: `+${FX.geyser} Water or Energy.`,
  oasis: `+${FX.oasis} Food.`,
  relic: `+${FX.relic} to every working plot touching it, anyone's.`,
  meteorCrater: `Crystite rated ${MAP.meteorCrater.crystite}, the top of the scale. Left by a meteor; what stood here was destroyed.`,
};

/**
 * The phone's one line for this plot, in derive.ts's voice: "<Name>: <what it does>." A ruin
 * says which salvage it holds, since the map drew it.
 */
export function specialLine(s: MapSpecial): string {
  return `${SPECIAL_NAME[s.kind]}: ${specialEffect(s)}`;
}

/** The line without its name, for screens that set the name in bold. */
export function specialEffect(s: MapSpecial): string {
  if (s.kind === 'ruins' && s.salvage) return `the first owner salvages ${FX.salvage[s.salvage]} ${SALVAGE_NAME[s.salvage]}, once.`;
  return SPECIAL_EFFECT[s.kind];
}

/** The accessible name: the kind, and a ruin's salvage. PR-4 appends it to the plot's own label in HoloMap. */
export function specialLabel(s: MapSpecial): string {
  return s.kind === 'ruins' && s.salvage ? `${SPECIAL_NAME.ruins}, ${SALVAGE_NAME[s.salvage]} salvage` : SPECIAL_NAME[s.kind];
}

/** Copied from apps/web/src/game/derive.ts TERRAIN_ODDS (the mock cannot import the app); PR-4 uses the real one. */
export const TERRAIN_ODDS: Partial<Record<Terrain, string>> = {
  river: 'Often good for Food and Water. Poor for Smithore.',
  lake: 'Often good for Water and Food. No Smithore.',
  plains: 'Often good for Food and Energy. Little Smithore.',
  forest: 'Often good for Food. Poor for Energy.',
  swamp: 'Often good for Water. Poor for Food.',
  hills: 'Good odds of Smithore. Poor for Food.',
  mountains: 'Very good odds of Smithore. Poor for Food and Energy.',
  desert: 'Often good for Energy. Poor for Water and Food.',
  tundra: 'Often good for Energy and Water. Some Smithore.',
  ice: 'Often good for Water. Little else.',
  volcanic: 'Often good for Energy. Some Smithore.',
  crater: 'Poor for Food. Little Smithore.',
};
