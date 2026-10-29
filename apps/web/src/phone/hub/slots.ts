import type { ComponentType } from 'react';
import type { PhoneGame } from '../game';
import type { Now } from '../Shell';
import type { ReadyWords } from './ready';

/**
 * The hub's slots (C17). Planning is the hub for the month: the stage holds banners, "This month" (the agenda: each
 * item a door into a desk or a map tool), the map tools and the colony map; the rail holds Now, the open tool's
 * panel, the desks and the open desk's body. The hub draws only the entries present in its HubSlots, and of those
 * only the ones whose `show(seat)` says yes (omitted: always); an agenda item whose door is not drawn is not drawn.
 *
 * Today's entries are in ./today.tsx (HUB_SLOTS). WS7 adds its own to those lists, in the order they should show:
 * the Council, Secret, Governor's and Sheriff's desks (an office desk's `show` asks whether this seat holds the
 * office), their agenda items, map tools such as Guard and Target, the offices strip as a banner, and a Now for
 * the election's steps. An entry keeps its own state in its components (they may use hooks, and read or change
 * the open desk and tool with useHub() from ./Hub.tsx); `show` and the agenda's texts are plain functions of the
 * seat, called on every render.
 */

/** Who is looking: what every `show` decides on. */
export type HubSeat = Pick<PhoneGame, 'view' | 'me' | 'self'>;

interface Shown {
  /** Whether this seat sees the slot now; omitted, always. */
  show?(seat: HubSeat): boolean;
}

/** A desk in the rail: a tab, and the body the rail shows while it is open. */
export interface DeskSlot extends Shown {
  id: string;
  label: string;
  /** A 24×24 stroked SVG path. */
  icon: string;
  /** Only you see what is in it: a lock on the tab. */
  locked?: boolean;
  Body: ComponentType;
  /** Drawn on the tab, such as unread messages. */
  Badge?: ComponentType;
  /** The map tool to switch to when the desk opens. */
  tool?: string;
  /** Comes first, opens as it starts asking, and folds Now to its title (E-9), such as an office's desk for its holder. */
  first?(seat: HubSeat): boolean;
}

/** A door into a desk. The desk reads `focus` with useHub(), such as to open its sheet. */
export interface DeskDoor {
  desk: string;
  focus?: string;
}

/** A door in "This month": opens a desk or switches the map's tool. */
export interface AgendaSlot extends Shown {
  key: string;
  title(seat: HubSeat): string;
  sub(seat: HubSeat): string;
  /** Only you see what it leads to: a lock. */
  locked?: boolean;
  /** The one that matters most this month, drawn strong. */
  lead?(seat: HubSeat): boolean;
  opens: DeskDoor | { tool: string };
}

/** A mode of the colony map: what a tap does, with its panel and action while it is on. */
export interface MapToolSlot extends Shown {
  id: string;
  label: string;
  locked?: boolean;
  /** One line on what a tap does; shown beside the tools on a laptop. */
  hint(seat: HubSeat): string;
  /** The map while the tool is on. */
  Map: ComponentType;
  /** In the rail, above the desks, while the tool is on. */
  Panel?: ComponentType;
  /** In the footer, above Ready, while the tool is on. */
  Action?: ComponentType;
  /** The desk to open with the tool. */
  desk?: string;
}

/** A strip across the stage, such as the offices above This month. */
export interface BannerSlot extends Shown {
  id: string;
  Body: ComponentType;
}

/** A situation that takes the stage while it shows, such as election day. */
export interface StageSlot extends Shown {
  id: string;
  /** The shell's phase title while it shows; omitted, planning's. */
  phase?(seat: HubSeat): string;
  Body: ComponentType;
  /** In the rail under Now while it shows, in place of the desks. */
  Rail?: ComponentType;
}

/** The ready bar's words in a situation, whether its button is live, and what its count counts (VOTED). */
export interface ReadyBarWords extends ReadyWords {
  canReady?: boolean;
  label?: string;
}

export interface HubSlots {
  banners: BannerSlot[];
  /** Under the map, from 1100 px only (on a phone they live in a desk), such as the store's prices. */
  beneath: BannerSlot[];
  agenda: AgendaSlot[];
  tools: MapToolSlot[];
  desks: DeskSlot[];
  /** The first that gives a Now wins, such as an election's step; with none, RULE-8's "Plan your month". */
  nows: ((seat: HubSeat) => Now | null)[];
  /** The first shown takes the stage (on a phone all of it, from 1100 px above the map) and the rail under Now. */
  stage?: StageSlot[];
  /** The first that gives words wins; with none, planning's. */
  readyWords?: ((seat: HubSeat) => ReadyBarWords | null)[];
}

const shown = <T extends Shown>(slots: readonly T[], seat: HubSeat): T[] => slots.filter((s) => s.show?.(seat) ?? true);

/** The first answer any of them gives this seat. */
export const firstGiven = <T>(gives: readonly ((seat: HubSeat) => T | null)[], seat: HubSeat): T | null => gives.reduce<T | null>((t, give) => t ?? give(seat), null);

/** What the hub draws for this seat: the slots present whose show() says yes, a desk that asks first first, and the doors to those. */
export function drawnSlots(slots: HubSlots, seat: HubSeat): HubSlots {
  const asks = (d: DeskSlot) => d.first?.(seat) ?? false;
  const all = shown(slots.desks, seat);
  const desks = [...all.filter(asks), ...all.filter((d) => !asks(d))];
  const tools = shown(slots.tools, seat);
  const agenda = shown(slots.agenda, seat).filter(({ opens }) => ('desk' in opens ? desks.some((d) => d.id === opens.desk) : tools.some((t) => t.id === opens.tool)));
  const stage = shown(slots.stage ?? [], seat).slice(0, 1);
  return { banners: shown(slots.banners, seat), beneath: shown(slots.beneath, seat), agenda, tools, desks, nows: slots.nows, stage, readyWords: slots.readyWords ?? [] };
}

/** Where the hub is: the open desk and map tool, the focus the desk was opened with, and the desk that last asked first. */
export interface HubPlace {
  desk: string;
  tool: string;
  focus: string | null;
  first: string | null;
}

/** The place after a door, tab or tool: a desk brings its map tool, a tool its desk, and only a door's focus is kept. */
export function goTo(place: HubPlace, to: AgendaSlot['opens'], drawn: HubSlots): HubPlace {
  if ('desk' in to) return { ...place, desk: to.desk, tool: drawn.desks.find((d) => d.id === to.desk)?.tool ?? place.tool, focus: to.focus ?? null };
  return { ...place, tool: to.tool, desk: drawn.tools.find((t) => t.id === to.tool)?.desk ?? place.desk, focus: null };
}

/** The place once a desk starts asking to come first: it opens, once, so a tab away from it stays. Unchanged, the same object. */
export function settle(place: HubPlace, drawn: HubSlots, seat: HubSeat): HubPlace {
  const head = drawn.desks[0];
  const first = head?.first?.(seat) ? head.id : null;
  if (first === place.first) return place;
  return first ? { ...goTo(place, { desk: first }, drawn), first } : { ...place, first };
}

export function deskAsks(_place: HubPlace): boolean {
  throw new Error('NotImplemented: desk-asks');
}
