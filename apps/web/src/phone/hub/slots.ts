import type { ComponentType } from 'react';
import type { PhoneGame } from '../game';
import type { Now } from '../Shell';

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
  opens: { desk: string } | { tool: string };
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

export interface HubSlots {
  banners: BannerSlot[];
  /** Under the map, from 1100 px only (on a phone they live in a desk), such as the store's prices. */
  beneath: BannerSlot[];
  agenda: AgendaSlot[];
  tools: MapToolSlot[];
  desks: DeskSlot[];
  /** The first that gives a Now wins, such as an election's step; with none, RULE-8's "Plan your month". */
  nows: ((seat: HubSeat) => Now | null)[];
}

const shown = <T extends Shown>(slots: readonly T[], seat: HubSeat): T[] => slots.filter((s) => s.show?.(seat) ?? true);

/** What the hub draws for this seat: the slots present whose show() says yes, and the doors to those. */
export function drawnSlots(slots: HubSlots, seat: HubSeat): HubSlots {
  const desks = shown(slots.desks, seat);
  const tools = shown(slots.tools, seat);
  const agenda = shown(slots.agenda, seat).filter(({ opens }) => ('desk' in opens ? desks.some((d) => d.id === opens.desk) : tools.some((t) => t.id === opens.tool)));
  return { banners: shown(slots.banners, seat), beneath: shown(slots.beneath, seat), agenda, tools, desks, nows: slots.nows };
}
