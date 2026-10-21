import { MAP, sizeBand } from './config.js';
import { neighbours } from './grid.js';
import type { GameMap } from './map-rules.js';
import type { FitLine } from './production.js';
import { createRng, type Rng } from './rng.js';
import type { GameState, ProductionLine, RawGood, SpecialField, SpecialKind, Terrain, Tile } from './types.js';

/**
 * Stage 11 of the map generator (spec RULE-5): special fields placed on a
 * finished map. A depth-first search over the slots: each slot draws a kind,
 * then a plot that already fits it and keeps the spacing, and the search backs
 * up to the next draw when the slots left can no longer bring the count, the
 * kinds and both river sides. Nothing is regenerated, and the search tries at
 * most MAP.special.placementTries plots per map.
 */

const KINDS = Object.keys(MAP.special.on) as SpecialKind[];
/** The goods ruins may pay, read from what each pays. */
const SALVAGE = Object.keys(MAP.specialEffect.salvage) as NonNullable<SpecialField['salvage']>[];

type Side = 'left' | 'right';

interface Slot {
  tile: Tile;
  kind: SpecialKind;
}

export interface SpecialPlacement {
  map: GameMap;
  /** Plots the search tried, those it backed out of included. */
  tries: number;
}

/**
 * Places the map's special fields. Pure: every choice comes from `rng`. Throws
 * when no placement meets RULE-5 within the bound, so a map never comes out short.
 */
export function placeSpecials(map: GameMap, players: number, rng: Rng): SpecialPlacement {
  const count = MAP.specials[sizeBand(players)];
  const store = map.tiles.find((t) => t.terrain === 'store');
  const sideOf = riverSides(map);
  // With no river there are no sides to fill, as the checker reads it.
  const sides: Side[] = map.tiles.some((t) => t.terrain === 'river') ? ['left', 'right'] : [];
  const open = map.tiles.filter((t) => isOpen(map, t, store));
  const placed: Slot[] = [];
  let tries = 0;

  const fill = (): boolean => {
    if (placed.length === count) return true;
    const left = count - placed.length;
    const used = new Set(placed.map((p) => p.kind));
    // The last slots go to kinds and sides still missing, so the map ends with enough of each.
    const mustNewKind = left <= MAP.special.minKinds - used.size;
    const missingSides = sides.filter((s) => !placed.some((p) => sideOf(p.tile) === s));
    const mustSide = left <= missingSides.length;
    const spaced = open.filter(
      (t) => placed.every((p) => steps(p.tile, t) >= MAP.special.spacing) && (!mustSide || missingSides.includes(sideOf(t)!)),
    );
    const kinds = KINDS.filter((k) => placed.filter((p) => p.kind === k).length < MAP.special.maxPerKind && (!mustNewKind || !used.has(k)));
    for (const kind of drawn(kinds, rng)) {
      for (const tile of drawn(spaced.filter((t) => fitsKind(map, t, kind)), rng)) {
        // At the bound the map is not placed short: the generator stops loudly.
        if (++tries > MAP.special.placementTries) throw new Error(`special fields: no placement within ${MAP.special.placementTries} tries`);
        placed.push({ tile, kind });
        if (fill()) return true;
        placed.pop();
      }
    }
    return false;
  };
  if (!fill()) throw new Error(`special fields: no placement of ${count} meets RULE-5 on this map`);

  const fields = new Map(placed.map(({ tile, kind }) => [tile, specialField(kind, rng)]));
  const tiles = map.tiles.map((t) => {
    const special = fields.get(t);
    return special ? { ...t, special } : t;
  });
  return { map: { ...map, tiles }, tries };
}

/** The items in an order drawn from `rng`, one draw per item taken, so an early stop draws no more. */
function* drawn<T>(items: readonly T[], rng: Rng): Generator<T> {
  const rest = [...items];
  while (rest.length > 0) yield rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!;
}

function specialField(kind: SpecialKind, rng: Rng): SpecialField {
  return kind === 'ruins' ? { kind, salvage: rng.pick(SALVAGE) } : { kind };
}

/** RULE-5's row for every kind: never river, lake or the store, nor a plot touching the store. */
function isOpen(map: GameMap, tile: Tile, store: Tile | undefined): boolean {
  if (tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'store') return false;
  return !store || !neighbours(map.tiles, map.width, store).includes(tile);
}

function fitsKind(map: GameMap, tile: Tile, kind: SpecialKind): boolean {
  if (!(MAP.special.on[kind] as readonly Terrain[]).includes(tile.terrain)) return false;
  if (kind === 'crystalCavern') return tile.ground.crystite >= MAP.special.cavernCrystite;
  if (kind === 'oasis') return neighbours(map.tiles, map.width, tile).filter((n) => n.terrain === 'desert').length >= MAP.special.oasisDeserts;
  return true;
}

/** Which side of its row's river a plot lies on; undefined in a row with no river. */
function riverSides(map: GameMap): (tile: Tile) => Side | undefined {
  const rows: number[][] = Array.from({ length: map.height }, () => []);
  for (const t of map.tiles) if (t.terrain === 'river') rows[t.y]!.push(t.x);
  return (tile) => {
    const cols = rows[tile.y]!;
    if (cols.length === 0) return undefined;
    if (tile.x < Math.min(...cols)) return 'left';
    return tile.x > Math.max(...cols) ? 'right' : undefined;
  };
}

/** Steps between two plots, as the checker counts them: across the grid, never diagonally. */
function steps(a: Tile, b: Tile): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// --- Effects (spec RULE-6) ---------------------------------------------------

const EFFECT = MAP.specialEffect;

/**
 * What special fields add to a raw plot making `good`: its own field's bonus,
 * plus MAP.specialEffect.relic per touching relic. Production counts it before adjacency.
 */
export function specialBonus(state: GameState, tile: Tile, good: RawGood): number {
  return ownBonus(tile.special?.kind, good) + relicBonus(state, tile);
}

function ownBonus(kind: SpecialKind | undefined, good: RawGood): number {
  if (kind === 'crystalCavern' && good === 'crystite') return EFFECT.crystalCavern;
  if (kind === 'geyser' && (good === 'water' || good === 'energy')) return EFFECT.geyser;
  if (kind === 'oasis' && good === 'food') return EFFECT.oasis;
  return 0;
}

/** The relics among a plot's 4 neighbours, whoever owns them; a relic on the plot itself is not one of them. */
function relicsTouching(state: GameState, tile: Tile): number {
  return neighbours(state.tiles, state.width, tile).filter((n) => n.special?.kind === 'relic').length;
}

/** What touching relics add to any working plot. */
export function relicBonus(state: GameState, tile: Tile): number {
  return relicsTouching(state, tile) * EFFECT.relic;
}

/** A factory's relic bonus and the line the phone lists for it, counting the relics; null when none touches the plot. */
export function relicFit(state: GameState, tile: Tile): { bonus: number; line: FitLine } | null {
  const relics = relicsTouching(state, tile);
  if (relics === 0) return null;
  const bonus = relicBonus(state, tile);
  return { bonus, line: { tone: 'good', text: `Next to ${relics === 1 ? 'an alien relic' : `${relics} alien relics`}: +${bonus}` } };
}

// A what-if copy pays salvage, which is certain, so an AI's look-ahead sees it; collapse needs the real seed, so it imagines none.
/**
 * The month's change to special fields, once production has run: ruins with
 * an owner pay their salvage into the owner's stock and become a plain plot;
 * a cavern that produced Crystite this month may collapse into one.
 */
export function settleSpecials(state: GameState, lines: readonly ProductionLine[]): void {
  const mined = new Set(lines.filter((l) => l.good === 'crystite' && l.made > 0).map((l) => l.tile));
  state.tiles.forEach((tile, index) => {
    const special = tile.special;
    if (special?.kind === 'ruins' && special.salvage && tile.owner) {
      state.players.find((p) => p.id === tile.owner)!.stock[special.salvage] += EFFECT.salvage[special.salvage];
      delete tile.special;
    } else if (special?.kind === 'crystalCavern' && mined.has(index) && !state.whatIf && collapses(state, index)) {
      delete tile.special;
    }
  });
}

// A what-if copy has a stand-in seed, so it can't know the real draw and imagines none, like events and colony lots.
function collapses(state: GameState, index: number): boolean {
  // Its own RNG from (seed, month, plot): no other draw in the game shifts it.
  const rng = createRng((Math.imul(state.seed, 0x9e3779b1) + Math.imul(state.month, 0x85ebca77) + Math.imul(index, 0xc2b2ae3d)) >>> 0);
  return rng.chance(EFFECT.collapseChance);
}
