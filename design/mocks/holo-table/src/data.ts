import type { Good, MapAvatar, MapTile, Slot, Species, Terrain, TickerItem } from '@mule/ui';

/**
 * Made-up game data for the prototype: month 4 of a six-player game at a
 * kitchen table. Nothing here comes from the engine.
 */

export const ROOM_CODE = 'KRTX';
export const MONTH = 4;

export interface Seat {
  slot: Slot;
  name: string;
  species: Species;
  ai?: 'Rookie' | 'Trader' | 'Tycoon';
  persona?: string;
  money: number;
  plots: number;
}

export const SEATS: Seat[] = [
  { slot: 0, name: 'Heiko', species: 'zipwing', money: 1240, plots: 4 },
  { slot: 1, name: 'Mia', species: 'bramblet', money: 1415, plots: 3 },
  { slot: 2, name: 'Jonas', species: 'gearling', money: 860, plots: 2 },
  { slot: 3, name: 'Brix', species: 'mollox', ai: 'Trader', persona: 'grumpy miner', money: 1105, plots: 3 },
  { slot: 4, name: 'Lena', species: 'glimmer', money: 990, plots: 2 },
  { slot: 5, name: 'Ossa', species: 'quibbit', ai: 'Tycoon', persona: 'smooth talker', money: 1680, plots: 3 },
];

export const ME: Slot = 0;

export const SEAT_SPECIES = Object.fromEntries(SEATS.map((s) => [s.slot, s.species])) as Record<Slot, Species>;

export const MAP_W = 15;
export const MAP_H = 9;

const ROWS = [
  'iitmhpfRpdhmmvv',
  'itmhppfRpddhmvc',
  'llhpfpsRppdhhmc',
  'llpppsfRpppdhmt',
  'ffpfpppSppdddht',
  'ffsppfpRpphhmmt',
  'tspfppfRppphmmc',
  'itppffpRpdhhmvv',
  'iitpfppRpddhmvv',
];

const KEY: Record<string, Terrain> = {
  i: 'ice', l: 'lake', m: 'mountains', h: 'hills', p: 'plains', f: 'forest', s: 'swamp',
  R: 'river', d: 'desert', v: 'volcanic', c: 'crater', t: 'tundra', S: 'store',
};

type Plot = [Slot, Good | null, number, MapTile['flag']?];

const OWNED: Record<string, Plot> = {
  '7,3': [0, 'food', 4],
  '8,3': [0, 'energy', 5],
  '9,3': [0, 'energy', 5],
  '8,2': [0, 'energy', 3],
  '7,5': [1, 'food', 4],
  '8,5': [1, 'energy', 3],
  '6,5': [1, 'food', 2],
  '1,2': [2, 'water', 4],
  '0,2': [2, 'water', 3],
  '12,2': [3, 'smithore', 3],
  '12,3': [3, 'smithore', 4],
  '13,1': [3, 'crystite', 2],
  '13,5': [4, 'smithore', 3, 'sabotage'],
  '12,6': [4, 'crystite', 3],
  '10,4': [5, 'energy', 5],
  '11,4': [5, 'energy', 5],
  '7,6': [5, 'food', 4],
  '13,3': [3, 'alloy', 2],
  '6,6': [5, 'medicine', 3],
  // Heiko's land that is still waiting for a MULE.
  '9,2': [0, null, 0],
  '10,2': [0, null, 0],
};

/** Heiko's own geo analyses: only his phone shows these. */
const GROUND: Record<string, MapTile['ground']> = {
  '9,5': { food: 3, energy: 2 },
  '11,2': { smithore: 4, rareEarth: 2 },
  '14,2': { crystite: 4, rareEarth: 1 },
  '13,7': { rareEarth: 3, energy: 3 },
  '10,6': { smithore: 2 },
  '3,3': { food: 2, water: 1 },
  '7,3': { food: 3, water: 2 },
  '8,3': { energy: 3 },
};

export function baseTiles(): MapTile[] {
  const tiles: MapTile[] = [];
  ROWS.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const plot = OWNED[`${x},${y}`];
      const terrain = KEY[ch]!;
      tiles.push({
        x,
        y,
        terrain,
        owner: plot ? plot[0] : null,
        ...(plot?.[1] ? { good: plot[1], output: plot[2] } : {}),
        ...(plot?.[3] ? { flag: plot[3] } : {}),
        ...(terrain === 'mountains' ? { peaks: 1 + ((x * 7 + y * 3) % 3) } : {}),
        ...(GROUND[`${x},${y}`] ? { ground: GROUND[`${x},${y}`] } : {}),
      });
    }),
  );
  return tiles;
}

export const TILES = baseTiles();

export const FREE_PLOTS = TILES.filter((t) => t.owner === null && t.terrain !== 'store');

export const MARKET: TickerItem[] = [
  { good: 'food', price: 81, change: 24 },
  { good: 'water', price: 19, change: -3 },
  { good: 'energy', price: 31, change: 6 },
  { good: 'smithore', price: 54, change: 0 },
  { good: 'crystite', price: 112, change: 9 },
];

export const MULE_PRICE = 380;

export const MY_STOCK: Partial<Record<Good, number>> = { food: 6, water: 4, energy: 9, smithore: 0, crystite: 2 };

export const NEWS = [
  { tone: 'warn' as const, text: 'Observatory: a drought is likely next month.' },
  { tone: 'info' as const, text: 'Mia sold 6 Food to Ossa at 78.' },
  { tone: 'alert' as const, text: "Lena's Smithore mine was sabotaged. The Sheriff is investigating." },
];

export interface ChatLine {
  from: Slot;
  text: string;
  whisper?: boolean;
}

export const TABLE_CHAT: ChatLine[] = [
  { from: 5, text: 'Lovely farm by the river, Heiko. Shame if it flooded.' },
  { from: 3, text: 'Ore at 54. A joke. I am holding mine.' },
  { from: 2, text: 'Anyone need Water? Cheap today.' },
];

export const WHISPERS: ChatLine[] = [{ from: 1, text: "Pact against Ossa? She's buying up all the Energy.", whisper: true }];

export interface Deal {
  from: Slot;
  give: string;
  get: string;
  when: string;
}

export const DEALS: Deal[] = [
  { from: 1, give: '10 Food', get: '400 credits', when: 'Delivered next month' },
  { from: 5, give: '240 credits', get: '8 Energy', when: 'Now' },
];

export const DEV_AVATARS: MapAvatar[] = [
  { slot: 0, x: 8.6, y: 3.4, carrying: 'empty', name: 'Heiko' },
  { slot: 1, x: 6.2, y: 4.8, carrying: 'food', name: 'Mia' },
  { slot: 2, x: 2.3, y: 2.6, name: 'Jonas' },
  { slot: 3, x: 11.4, y: 2.2, carrying: 'smithore', name: 'Brix' },
  { slot: 4, x: 12.6, y: 5.6, name: 'Lena' },
  { slot: 5, x: 9.8, y: 4.4, carrying: 'energy', name: 'Ossa' },
];

export function seat(slot: Slot): Seat {
  return SEATS[slot]!;
}

/** Seats after this month's sales: Heiko earned 186. Phone and big screen rank from the same list. */
export const MONTH_END_SEATS = SEATS.map((s) => (s.slot === 0 ? { ...s, money: s.money + 186 } : s));

/** Public score: money plus 300 per plot. */
export const RANKING = MONTH_END_SEATS.map((s) => ({ ...s, score: s.money + s.plots * 300 })).sort((a, b) => b.score - a.score);

/** What each player holds and needs of a good this month, as the auction shows it. */
export interface BookRow {
  slot: Slot;
  has: number;
  needs: number;
}

const FOOD_BOOK: BookRow[] = [
  { slot: 0, has: 6, needs: 3 },
  { slot: 1, has: 7, needs: 3 },
  { slot: 2, has: 5, needs: 2 },
  { slot: 3, has: 0, needs: 3 },
  { slot: 4, has: 1, needs: 4 },
  { slot: 5, has: 2, needs: 6 },
];

export const STORE_STOCK: Partial<Record<Good, number>> = { food: 8, water: 12, energy: 5, smithore: 9, crystite: 0 };

/** The auction book for a good. Food is hand-made; the others are spread from it so every tab looks plausible. */
export function bookFor(good: Good): BookRow[] {
  if (good === 'food') return FOOD_BOOK;
  const shift = good.length;
  return FOOD_BOOK.map((r, i) => {
    const needs = ((r.needs + shift + i) % 4) + 1;
    const has = i === 0 ? (MY_STOCK[good] ?? 0) : (r.has * 3 + shift * (i + 1)) % 9;
    return { slot: r.slot, has, needs };
  });
}

/** Buyers at the store's price, in the order the store serves them. Ossa is a Quibbit, so she is first in line. */
export const STORE_QUEUE: { slot: Slot; wants: number }[] = [
  { slot: 5, wants: 4 },
  { slot: 4, wants: 3 },
  { slot: 3, wants: 3 },
];

/**
 * The store hands out units in turns, one per buyer per round, until it is
 * empty or everyone has what they asked for.
 */
export function storeTurns(stock: number, queue: { slot: Slot; wants: number }[]): Slot[] {
  const left = queue.map((q) => q.wants);
  const out: Slot[] = [];
  while (out.length < stock && left.some((n) => n > 0)) {
    queue.forEach((q, i) => {
      if (out.length < stock && left[i]! > 0) {
        out.push(q.slot);
        left[i]! -= 1;
      }
    });
  }
  return out;
}
