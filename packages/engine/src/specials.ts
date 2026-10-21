import { MAP, sizeBand } from './config.js';
import { neighbours } from './map.js';
import type { GameMap } from './map-rules.js';
import { createRng, type Rng } from './rng.js';
import type { GameState, ProductionLine, RawGood, SpecialField, SpecialKind, Terrain, Tile } from './types.js';

/**
 * Stage 11 of the map generator (spec RULE-5): special fields placed on a
 * finished map. Each one goes on a plot that already fits its kind, so nothing
 * is retried; a kind with no fitting plot is swapped for another, at most
 * MAP.special.kindDraws times per map.
 */

const KINDS = Object.keys(MAP.special.on) as SpecialKind[];
const SALVAGE = ['alloy', 'electronics'] as const;

type Side = 'left' | 'right';

export interface SpecialPlacement {
  map: GameMap;
  /** Kinds drawn that no plot could take, so another kind was drawn instead. */
  redraws: number;
}

/** Places the map's special fields. Pure: every choice comes from `rng`; never throws. */
export function placeSpecials(map: GameMap, players: number, rng: Rng): SpecialPlacement {
  const count = MAP.specials[sizeBand(players)];
  const store = map.tiles.find((t) => t.terrain === 'store');
  const sideOf = riverSides(map);
  const open = map.tiles.filter((t) => isOpen(map, t, store));
  const placed: { tile: Tile; kind: SpecialKind }[] = [];
  let draws = 0;
  let redraws = 0;

  while (placed.length < count && draws < MAP.special.kindDraws) {
    const left = count - placed.length;
    const used = new Set(placed.map((p) => p.kind));
    const sides = new Set(placed.map((p) => sideOf(p.tile)));
    // The last slots go to kinds and sides still missing, so the map ends with enough of each.
    const mustNewKind = left <= MAP.special.minKinds - used.size;
    const missingSides = (['left', 'right'] as Side[]).filter((s) => !sides.has(s));
    const mustSide = left <= missingSides.length ? missingSides : undefined;
    const spaced = open.filter(
      (t) => placed.every((p) => steps(p.tile, t) >= MAP.special.spacing) && (!mustSide || mustSide.includes(sideOf(t)!)),
    );

    let kinds = KINDS.filter((k) => placed.filter((p) => p.kind === k).length < MAP.special.maxPerKind && (!mustNewKind || !used.has(k)));
    let slot: { tile: Tile; kind: SpecialKind } | undefined;
    while (!slot && kinds.length > 0 && draws < MAP.special.kindDraws) {
      const kind = rng.pick(kinds);
      draws++;
      const fits = spaced.filter((t) => fitsKind(map, t, kind, store));
      if (fits.length > 0) slot = { tile: rng.pick(fits), kind };
      else {
        redraws++;
        kinds = kinds.filter((k) => k !== kind);
      }
    }
    if (!slot) break;
    placed.push(slot);
  }

  const fields = new Map(placed.map(({ tile, kind }) => [tile, specialField(kind, rng)]));
  const tiles = map.tiles.map((t) => {
    const special = fields.get(t);
    return special ? { ...t, special } : t;
  });
  return { map: { ...map, tiles }, redraws };
}

function specialField(kind: SpecialKind, rng: Rng): SpecialField {
  return kind === 'ruins' ? { kind, salvage: rng.pick(SALVAGE) } : { kind };
}

/** RULE-5's row for every kind: never river, lake or the store, nor a plot touching the store. */
function isOpen(map: GameMap, tile: Tile, store: Tile | undefined): boolean {
  if (tile.terrain === 'river' || tile.terrain === 'lake' || tile.terrain === 'store') return false;
  return !store || !neighbours(map.tiles, map.width, store).includes(tile);
}

function fitsKind(map: GameMap, tile: Tile, kind: SpecialKind, store: Tile | undefined): boolean {
  if (!(MAP.special.on[kind] as readonly Terrain[]).includes(tile.terrain)) return false;
  if (kind === 'crystalCavern') return tile.ground.crystite >= MAP.special.cavernCrystite;
  if (kind === 'oasis') return neighbours(map.tiles, map.width, tile).filter((n) => n.terrain === 'desert').length >= MAP.special.oasisDeserts;
  if (kind === 'relic') return !store || steps(tile, store) >= MAP.special.relicFromStore;
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
 * plus one per relic beside it. Production counts it before adjacency.
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

/** What the relics among a plot's 4 neighbours add to any working plot there, whoever owns them. */
export function relicBonus(state: GameState, tile: Tile): number {
  return neighbours(state.tiles, state.width, tile).filter((n) => n.special?.kind === 'relic').length * EFFECT.relic;
}

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
    } else if (special?.kind === 'crystalCavern' && mined.has(index) && collapses(state, index)) {
      delete tile.special;
    }
  });
}

function collapses(state: GameState, index: number): boolean {
  // Its own RNG from (seed, month, plot): no other draw in the game shifts it.
  const rng = createRng((Math.imul(state.seed, 0x9e3779b1) + Math.imul(state.month, 0x85ebca77) + Math.imul(index, 0xc2b2ae3d)) >>> 0);
  return rng.chance(EFFECT.collapseChance);
}
