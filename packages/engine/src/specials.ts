import { MAP, sizeBand } from './config.js';
import { neighbours } from './map.js';
import type { GameMap } from './map-rules.js';
import type { Rng } from './rng.js';
import type { SpecialField, SpecialKind, Terrain, Tile } from './types.js';

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
