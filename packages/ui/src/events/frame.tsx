import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { MapTile } from '../components/HoloMap';
import type { Good, Slot } from '../components/tokens';
import { eventScript, type EventScript, type ShowGrid } from './timing';
import type { ShowEventView, ShowMode, ShowPlayer } from './types';

/**
 * Who is who on the map, read from the caller's tiles and players: the view sends no player and no good per hit, so
 * an event's player is the owner of its origin plot (a personal event only), and a hit's good is the good on its plot.
 */
export interface ShowCast {
  name(id: string): string;
  slotOf(id: string): Slot | undefined;
  /** Every seat, in seat order: the colonists at the store. */
  players: readonly ShowPlayer[];
  /** The id of the player who owns the plot, or null. */
  ownerAt(x: number, y: number): string | null;
  goodAt(x: number, y: number): Good | undefined;
  /** A personal event's player: the one it names (a sick player), else the owner of the plot it starts on. */
  playerOf(ev: ShowEventView): string | undefined;
}

export function eventCast(tiles: MapTile[], players: ShowPlayer[]): ShowCast {
  const byXY = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  const bySlot = new Map(players.map((p) => [p.slot, p]));
  const byId = new Map(players.map((p) => [p.id, p]));
  const ownerAt = (x: number, y: number) => {
    const slot = byXY.get(`${x},${y}`)?.owner;
    return slot === null || slot === undefined ? null : (bySlot.get(slot)?.id ?? null);
  };
  return {
    players,
    name: (id) => byId.get(id)?.name ?? id,
    slotOf: (id) => byId.get(id)?.slot,
    ownerAt,
    goodAt: (x, y) => byXY.get(`${x},${y}`)?.good,
    playerOf: (ev) => ev.player ?? (ev.scope === 'personal' ? (ownerAt(ev.origin.x, ev.origin.y) ?? undefined) : undefined),
  };
}

/** The view's 'mixed' draws as the gallery's neutral: neither good nor bad. */
export const signLook = (sign: ShowEventView['sign']): 'good' | 'bad' | 'neutral' => (sign === 'mixed' ? 'neutral' : sign);

/** Everything a layer reads, derived from the caller's props: every layer is a pure function of `t`. */
export interface ShowFrame {
  s: EventScript;
  t: number;
  reduced: boolean;
  tiles: MapTile[];
  grid: ShowGrid;
  cast: ShowCast;
  /** A plot's box, as percentages of the map. */
  cell(x: number, y: number): CSSProperties;
  /** A plot's centre, as percentages of the map. */
  centre(x: number, y: number): { left: string; top: string };
}

const FrameContext = createContext<ShowFrame | null>(null);

export function useShow(): ShowFrame {
  const f = useContext(FrameContext);
  if (!f) throw new Error('The event show layers need an <EventShow> around them.');
  return f;
}

/** The enclosing <EventShow>'s frame, or null outside one: for a part that brings its own show only when alone. */
export function useEnclosingEventShow(): ShowFrame | null {
  return useContext(FrameContext);
}

export interface EventShowProps {
  /** The phase's events, in the order they fired. */
  events: ShowEventView[];
  /** How long the phase's intro plays before the first event, in ms, as the server sent it. */
  introMs: number;
  /** The show clock, in seconds: the same clock as `start`. */
  t: number;
  /** When the first segment starts on that clock. */
  start?: number;
  mode?: ShowMode;
  reduced?: boolean;
  width: number;
  height: number;
  tiles: MapTile[];
  players: ShowPlayer[];
  children: ReactNode;
}

/** Gives the layers inside it the show at `t`. Draws nothing itself. */
export function EventShow({ events, introMs, t, start = 0, mode = 'tv', reduced = false, width, height, tiles, players, children }: EventShowProps) {
  const s = useMemo(() => eventScript({ events, introMs }, start, mode), [events, introMs, start, mode]);
  const cast = useMemo(() => eventCast(tiles, players), [tiles, players]);
  const frame = useMemo<ShowFrame>(
    () => ({
      s,
      t,
      reduced,
      tiles,
      grid: { width, height },
      cast,
      cell: (x, y) => ({ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%`, width: `${100 / width}%`, height: `${100 / height}%` }),
      centre: (x, y) => ({ left: `${((x + 0.5) / width) * 100}%`, top: `${((y + 0.5) / height) * 100}%` }),
    }),
    [s, t, reduced, tiles, width, height, cast],
  );
  return <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>;
}
