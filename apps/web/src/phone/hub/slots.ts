import type { ComponentType } from 'react';
import type { PhoneGame } from '../game';
import type { Now } from '../Shell';
import type { HubNav } from './Hub';
import type { ReadyWords } from './ready';

/**
 * The hub's slots (C17). Planning is the hub for the month, as four tabs (the approved hub-tabs mock): Overview
 * holds the one map with its tool row and "This month" as doors into the other tabs; Governor (Council on every other
 * phone) holds the politics sub-tabs; Colony and Talk the colony and the table's talk. The rail keeps the phase line,
 * Now with its "?", the open tool's panel and Ready on every tab. The hub draws only the entries present in its
 * TabHubSlots, and of those only the ones whose `show(seat)` says yes (omitted: always).
 *
 * Today's entries are in ./today.tsx (TAB_SLOTS): the politics sub-tabs (politicsTabs) and the Sheriff's Guard, a plot
 * pick (picks), among them. An entry keeps its own state in its components and reads or changes where the hub is with useHub()
 * from ./Hub.tsx; `show` and the agenda's texts are plain functions of the seat, called on every render.
 */

/** Who is looking: what every `show` decides on. */
export type HubSeat = Pick<PhoneGame, 'view' | 'me' | 'self'>;

interface Shown {
  /** Whether this seat sees the slot now; omitted, always. */
  show?(seat: HubSeat): boolean;
}

/** A politics desk as politics/slots.ts registers it, drawn as a Governor / Council sub-tab through asDeskSub. */
export interface DeskSlot extends Shown {
  id: string;
  label: string;
  /** A 24×24 stroked SVG path. */
  icon: string;
  /** Only you see what is in it: the eye-slash on the tab. */
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
  /** Only you see what it leads to: the eye-slash and "Only you". */
  locked?: boolean;
  /** The one that matters most this month, drawn strong. */
  lead?(seat: HubSeat): boolean;
  opens: DeskDoor | { tool: string };
}

/** A mode of the colony map: what a tap does, with its panel and action while it is on. */
export interface MapToolSlot extends Shown {
  id: string;
  label: string;
  /** Only you see what it shows: the eye-slash with "Only you", or the eye-slash alone. */
  locked?: boolean | 'icon';
  /** One line on what a tap does; shown beside the tools on a laptop. Empty when its Panel says it in the rail. */
  hint(seat: HubSeat): string;
  /** The map while the tool is on. */
  Map: ComponentType;
  /** In the rail, above the desks, while the tool is on. */
  Panel?: ComponentType;
  /** In the footer, above Ready, while the tool is on. */
  Action?: ComponentType;
}

/** A strip across the stage, or a line under the month's roadmap, such as the offices. */
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

/** The slots this seat sees now. */
export const shown = <T extends Shown>(slots: readonly T[], seat: HubSeat): T[] => slots.filter((s) => s.show?.(seat) ?? true);

/** The first answer any of them gives this seat. */
export const firstGiven = <T>(gives: readonly ((seat: HubSeat) => T | null)[], seat: HubSeat): T | null => gives.reduce<T | null>((t, give) => t ?? give(seat), null);

/* The tabbed hub's slots. */

/** The four tabs, in order; `politics` is "Governor" on the Governor's phone and "Council" on every other. */
export type TabId = 'overview' | 'politics' | 'colony' | 'talk';

/** Where a door leads: a tab, a sub-tab of it, a focus for its body to read, or a map tool on Overview. */
export interface Door {
  tab: TabId;
  sub?: string;
  focus?: string;
  tool?: string;
}

/** A tab: its button in the tab column or bar, and the stage it draws while open. */
export interface TabSlot extends Shown {
  id: TabId;
  label(seat: HubSeat): string;
  /** A 24×24 stroked SVG path. */
  icon: string;
  Body: ComponentType;
  /** Drawn on the tab when something wants the player there: an offer, an open ballot, a broken promise. */
  Badge?: ComponentType;
  /** In the rail under Now while this tab shows (Overview: the open tool's panel). */
  Rail?: ComponentType;
  /** In the footer above Ready while this tab shows (Overview: the open tool's action). */
  Action?: ComponentType;
}

/** A sub-tab of the Governor / Council tab: Laws, Budget, Elections, Sheriff. */
export interface SubTabSlot extends Shown {
  id: string;
  label(seat: HubSeat): string;
  Body: ComponentType;
  Badge?: ComponentType;
  /** While another tab is open, the Now line is a door to this sub-tab: an open ballot. */
  first?(seat: HubSeat): boolean;
}

/** A plot-picking mode another tab hands to Overview's one map, standing in for the tool row until "back to". */
export interface PlotPickSlot extends Shown {
  id: string;
  /** The bar's verb, e.g. "Guarding". */
  label: string;
  /** One line under it: what a tap does. */
  hint(seat: HubSeat): string;
  back: Door & { label: string };
  /** The pick draws its own bar inside Map (the Sheriff's Guard: "Guarding · 1 of 2 · Done · back to Sheriff"). */
  ownBar?: boolean;
  Map: ComponentType;
  Panel?: ComponentType;
  Action?: ComponentType;
}

/** What the tabbed hub draws: each entry keeps `show(seat)`, as HubSlots' do. */
export interface TabHubSlots {
  tabs: TabSlot[];
  politicsTabs: SubTabSlot[];
  tools: MapToolSlot[];
  agenda: AgendaSlot[];
  banners: BannerSlot[];
  /** The offices line and the like: in the "?" sheet, under the month's steps. */
  lines: BannerSlot[];
  picks: PlotPickSlot[];
  nows: ((seat: HubSeat) => Now | null)[];
  underNow: BannerSlot[];
  /** Ceremonies only: the first shown takes the stage, tabs and all. */
  stage: StageSlot[];
  readyWords: ((seat: HubSeat) => ReadyBarWords | null)[];
}

/** Where the tabbed hub is: the open tab, sub-tab and map tool, the door's focus, and the plot pick. */
export interface HubPlace {
  tab: TabId;
  sub: string;
  tool: string;
  focus: string | null;
  pick: string | null;
}

/** The SB-1a name; kept so code built on the frozen contract compiles. Removed after the 12 Nov batch. */
export type TabHubPlace = HubPlace;

/** The tabbed hub's navigation: where it is, and the moves between tabs, sub-tabs, tools and picks. */
export interface HubNav {
  /** The desk today's components know the open place by: a tab's id, or on Governor / Council the open sub-tab's. */
  desk: string;
  tool: string;
  /** What the open tab was opened to show, from a door's `focus`; null once taken, or after a tab or tool. */
  focus: string | null;
  /** Opens today's desk `id` through its door (Hub.tsx's DESK_DOORS), with a focus for it. */
  openDesk(id: string, focus?: string): void;
  /** Switches Overview's map tool, and opens Overview. */
  pickTool(id: string): void;
  /** The tab has shown its focus: a later door with the same focus shows it again. */
  takeFocus(): void;
  tab: TabId;
  /** The open sub-tab of the Governor / Council tab. */
  sub: string;
  /** The plot-picking mode another tab handed to Overview's map, or null. */
  pick: string | null;
  open(door: Door): void;
  startPick(id: string): void;
  endPick(): void;
}

/** The SB-1a name; kept so code built on the frozen contract compiles. Removed after the 12 Nov batch. */
export type TabHubNav = HubNav;

/** The place after a door: its tab, its sub-tab and tool where it names them, and only its focus. A door away from Overview ends a pick. */
export function goTo(place: HubPlace, door: Door): HubPlace {
  return { ...place, tab: door.tab, sub: door.sub ?? place.sub, tool: door.tool ?? place.tool, focus: door.focus ?? null, pick: door.tab === 'overview' ? place.pick : null };
}

/*
 * The tabbed hub's slots (SB-1a, the approved hub-tabs mock): types only, frozen for the lanes that build against
 * them. HubSlots above stays in use until the tabbed hub replaces it; TabHubPlace then takes HubPlace's name.
 */

/** The four tabs, in order; `politics` is "Governor" on the Governor's phone and "Council" on every other. */
export type TabId = 'overview' | 'politics' | 'colony' | 'talk';

/** Where a door leads: a tab, a sub-tab of it, a focus for its body to read, or a map tool on Overview. */
export interface Door {
  tab: TabId;
  sub?: string;
  focus?: string;
  tool?: string;
}

/** A tab: its button in the tab column or bar, and the stage it draws while open. */
export interface TabSlot extends Shown {
  id: TabId;
  label(seat: HubSeat): string;
  /** A 24×24 stroked SVG path. */
  icon: string;
  Body: ComponentType;
  /** Drawn on the tab when something wants the player there: an offer, an open ballot, a broken promise. */
  Badge?: ComponentType;
  /** In the rail under Now while this tab shows (Overview: the open tool's panel). */
  Rail?: ComponentType;
  /** In the footer above Ready while this tab shows (Overview: the open tool's action). */
  Action?: ComponentType;
}

/** A sub-tab of the Governor / Council tab: Laws, Budget, Elections, Sheriff. */
export interface SubTabSlot extends Shown {
  id: string;
  label(seat: HubSeat): string;
  Body: ComponentType;
  Badge?: ComponentType;
  /** Opens first, once, as it starts asking: an open ballot (as a desk's `first` did). */
  first?(seat: HubSeat): boolean;
}

/** A plot-picking mode another tab hands to Overview's one map, standing in for the tool row until "back to". */
export interface PlotPickSlot extends Shown {
  id: string;
  /** The bar's verb, e.g. "Guarding". */
  label: string;
  /** One line under it: what a tap does. */
  hint(seat: HubSeat): string;
  back: Door & { label: string };
  /** The pick draws its own bar inside Map (WS8's Guard: "Guarding · 1 of 2 · Done · back to Sheriff"). */
  ownBar?: boolean;
  Map: ComponentType;
  Panel?: ComponentType;
  Action?: ComponentType;
}

/** What the tabbed hub draws: each entry keeps `show(seat)`, as HubSlots' do. */
export interface TabHubSlots {
  tabs: TabSlot[];
  politicsTabs: SubTabSlot[];
  tools: MapToolSlot[];
  agenda: AgendaSlot[];
  banners: BannerSlot[];
  /** The offices line and the like: in the "?" sheet, under the month's steps. */
  lines: BannerSlot[];
  picks: PlotPickSlot[];
  nows: ((seat: HubSeat) => Now | null)[];
  underNow: BannerSlot[];
  /** Ceremonies only: the first shown takes the stage, tabs and all. */
  stage: StageSlot[];
  readyWords: ((seat: HubSeat) => ReadyBarWords | null)[];
}

/**
 * Where the tabbed hub is: the open tab, sub-tab and map tool, the door's focus, the plot pick, and the sub-tab that last asked first.
 * Replaces HubPlace (and takes its name) when SB-2 grafts the tabbed hub.
 */
export interface TabHubPlace {
  tab: TabId;
  sub: string;
  tool: string;
  focus: string | null;
  pick: string | null;
  first: string | null;
}

/**
 * The tabbed hub's navigation: today's HubNav plus the tab, sub-tab and plot pick, and the moves between them.
 * Replaces HubNav (and takes its name) when SB-2 grafts the tabbed hub.
 */
export interface TabHubNav extends HubNav {
  tab: TabId;
  /** The open sub-tab of the Governor / Council tab. */
  sub: string;
  /** The plot-picking mode another tab handed to Overview's map, or null. */
  pick: string | null;
  open(door: Door): void;
  startPick(id: string): void;
  endPick(): void;
}
