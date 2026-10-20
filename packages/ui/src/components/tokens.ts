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

export const SLOT_SHAPE_NAME: Record<Slot, string> = {
  0: 'circle',
  1: 'square',
  2: 'triangle',
  3: 'diamond',
  4: 'hexagon',
  5: 'star',
};

export const SLOT_CLIP: Record<Slot, string> = {
  0: 'circle(50% at 50% 50%)',
  1: 'inset(4% round 18%)',
  2: 'polygon(50% 4%, 96% 92%, 4% 92%)',
  3: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  4: 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%)',
  5: 'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
};

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

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
