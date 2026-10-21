import { DEFAULT_SPECIES } from '@mule/engine';
import type { MuleView, PlayerView, TableView, TileView } from '@mule/protocol';
import { SPECIES, type Good, type MapTile, type Slot, type Species } from '@mule/ui';

/**
 * Small, pure readings of the view for the screens. No rules live here: the
 * server decides everything, these only turn its view into what the design
 * system draws.
 */

export const PHASE_NAME: Record<MuleView['phase'], string> = {
  planning: 'Planning',
  landGrant: 'Land grant',
  landAuction: 'Land auction',
  development: 'Development',
  production: 'Production',
  auction: 'Goods auction',
  upkeep: 'Upkeep',
  gameOver: 'Game over',
};

/** A seat's colour slot is its place at the table, so phones and the big screen agree. */
export function slotOf(view: Pick<MuleView, 'players'>, seatId: string | null | undefined): Slot | null {
  if (!seatId) return null;
  const i = view.players.findIndex((p) => p.id === seatId);
  return i < 0 ? null : ((i % 6) as Slot);
}

export function seatSpecies(view: Pick<MuleView, 'players'>): Record<Slot, Species> {
  const out = Object.fromEntries(DEFAULT_SPECIES.map((sp, i) => [i, sp])) as Record<Slot, Species>;
  view.players.forEach((p, i) => {
    if (i < 6) out[i as Slot] = p.species;
  });
  return out;
}

type SeatView = TableView<unknown>['seats'][number];

/** In the lobby, what a seat will play as: its pick, or until it picks, its seat's default. */
export function lobbySeatSpecies(seat: SeatView, index: number): Species {
  return SPECIES.find((sp) => sp === seat.pick) ?? DEFAULT_SPECIES[index % DEFAULT_SPECIES.length]!;
}

/** The design system rates ground 0 to 4; grown goods come as -2 to +3, shown on the same pips. */
export function groundPips(good: Good, rating: number): number {
  const grown = good === 'food' || good === 'water' || good === 'energy';
  return Math.max(0, Math.min(4, grown ? rating + 1 : rating));
}

/** The view's tiles as the map draws them. */
export function mapTiles(view: MuleView): MapTile[] {
  return view.tiles.map((t) => {
    const owner = slotOf(view, t.owner);
    const good = t.outfit && t.outfit !== 'greenBelt' ? t.outfit : undefined;
    const ground = t.ground ? (Object.fromEntries(Object.entries(t.ground).map(([g, n]) => [g, groundPips(g as Good, n)])) as Partial<Record<Good, number>>) : undefined;
    return {
      x: t.x,
      y: t.y,
      terrain: t.terrain,
      owner,
      ...(good ? { good } : {}),
      ...(t.peaks ? { peaks: t.peaks } : {}),
      ...(ground ? { ground } : {}),
      ...(t.pollution ? { pollution: t.pollution } : {}),
    };
  });
}

export function tileAt(view: MuleView, x: number, y: number): TileView | undefined {
  return view.tiles[y * view.width + x];
}

export function player(view: MuleView, id: string | null | undefined): PlayerView | undefined {
  return view.players.find((p) => p.id === id);
}

/** Public standings by money, best first. Scores replace money once the game is over. */
export function standings(view: MuleView): { player: PlayerView; slot: Slot; value: number }[] {
  return view.players
    .map((p, i) => ({ player: p, slot: (i % 6) as Slot, value: view.scores?.find((s) => s.id === p.id)?.score ?? p.money }))
    .sort((a, b) => b.value - a.value);
}

/** Seconds until an epoch-ms deadline by the server's clock. */
export function secondsUntil(endsAt: number | null | undefined, serverNow: number): number | undefined {
  return endsAt == null ? undefined : Math.max(0, (endsAt - serverNow) / 1000);
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en');

export function plotName(x: number, y: number): string {
  return `${x + 1}·${y + 1}`;
}

/** What a plot is good for, in one line. From the design doc's terrain odds; Crystite and Rare earth turn up anywhere, so no line names them. */
export const TERRAIN_ODDS: Partial<Record<TileView['terrain'], string>> = {
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
