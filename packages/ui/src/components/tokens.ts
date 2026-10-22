/** Names shared by components. Colours themselves live in theme.css. */

export type Slot = 0 | 1 | 2 | 3 | 4 | 5;

export const SLOT_COLOR: Record<Slot, string> = {
  0: 'var(--color-p1)',
  1: 'var(--color-p2)',
  2: 'var(--color-p3)',
  3: 'var(--color-p4)',
  4: 'var(--color-p5)',
  5: 'var(--color-p6)',
};

/** What players call each slot's colour. */
export const COLOUR_NAME: Record<Slot, string> = { 0: 'Ember', 1: 'Cobalt', 2: 'Jade', 3: 'Sun', 4: 'Violet', 5: 'Rose' };

export type Good = 'food' | 'water' | 'energy' | 'smithore' | 'crystite' | 'rareEarth' | 'alloy' | 'electronics' | 'medicine';

export const GOOD_CODE: Record<Good, string> = {
  food: 'FOOD',
  water: 'H2O',
  energy: 'NRG',
  smithore: 'ORE',
  crystite: 'CRY',
  rareEarth: 'REE',
  alloy: 'ALY',
  electronics: 'ELC',
  medicine: 'MED',
};

export const GOOD_NAME: Record<Good, string> = {
  food: 'Food',
  water: 'Water',
  energy: 'Energy',
  smithore: 'Smithore',
  crystite: 'Crystite',
  rareEarth: 'Rare earth',
  alloy: 'Alloy',
  electronics: 'Electronics',
  medicine: 'Medicine',
};

export type Terrain =
  | 'river' | 'lake' | 'plains' | 'forest' | 'swamp' | 'hills' | 'mountains'
  | 'desert' | 'tundra' | 'ice' | 'volcanic' | 'crater' | 'wasteland' | 'store';

export const TERRAIN_NAME: Record<Terrain, string> = {
  river: 'River', lake: 'Lake', plains: 'Plains', forest: 'Forest', swamp: 'Swamp', hills: 'Hills',
  mountains: 'Mountains', desert: 'Desert', tundra: 'Tundra', ice: 'Ice field', volcanic: 'Volcanic', crater: 'Crater',
  wasteland: 'Wasteland', store: 'Colony store',
};

/**
 * The five special fields. The UI keeps its own copy of the kind union, as it does for Good and
 * Terrain; apps/web checks at compile time that it equals the engine's.
 */
export type SpecialKind = 'ruins' | 'crystalCavern' | 'geyser' | 'oasis' | 'relic';

/** A plot's special field as the map draws it. */
export interface MapSpecial {
  kind: SpecialKind;
  /** Ruins only: the good its salvage pays. */
  salvage?: 'alloy' | 'electronics';
}

export const SPECIAL_KINDS: SpecialKind[] = ['ruins', 'crystalCavern', 'geyser', 'oasis', 'relic'];

export const SPECIAL_NAME: Record<SpecialKind, string> = {
  ruins: 'Ruins',
  crystalCavern: 'Crystal cavern',
  geyser: 'Geyser',
  oasis: 'Oasis',
  relic: 'Alien relic',
};

/**
 * Each kind's colour token, `--color-s-<kind>` in theme.css. Each borrows the colour of the good it pays, so the
 * colour teaches the effect; the relic, which pays no good of its own, borrows Energy's gold. Shape, not colour,
 * tells the kinds apart.
 */
export const SPECIAL_COLOR: Record<SpecialKind, string> = {
  ruins: 'var(--color-s-ruins)',
  crystalCavern: 'var(--color-s-crystalCavern)',
  geyser: 'var(--color-s-geyser)',
  oasis: 'var(--color-s-oasis)',
  relic: 'var(--color-s-relic)',
};

/** A special field's accessible name: its kind, and a ruin's salvage. HoloMap adds it to the plot's label. */
export function specialLabel(s: MapSpecial): string {
  return s.kind === 'ruins' && s.salvage ? `${SPECIAL_NAME.ruins}, ${GOOD_NAME[s.salvage]} salvage` : SPECIAL_NAME[s.kind];
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
