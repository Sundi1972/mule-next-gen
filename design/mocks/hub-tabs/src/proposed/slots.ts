import type { ComponentType } from 'react';
import type { AgendaSlot, BannerSlot, HubSeat, MapToolSlot, ReadyBarWords, StageSlot } from '../../../../../apps/web/src/phone/hub/slots';
import type { Now } from '../../../../../apps/web/src/phone/Shell';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/slots.ts. The tabbed hub's slots: what HubSlots becomes once the desks leave
 * the rail for whole-stage tabs. Every entry keeps today's `show(seat)` (omitted: always). What changes:
 *
 *   HubSlots.desks (DeskSlot[])     → tabs (TabSlot[]) + politicsTabs (SubTabSlot[]): a desk's Body becomes a tab's or
 *                                      a sub-tab's stage; Badge stays a component drawn on the tab.
 *   HubSlots.tools (MapToolSlot[])  → unchanged: Overview's tool row. Panel and Action move to the rail under Now
 *                                      while Overview shows; `desk` is dropped (a tool no longer opens a desk).
 *   HubSlots.agenda (AgendaSlot[])  → unchanged type; drawn as compact rows on Overview. A row whose door is a map
 *                                      tool is not drawn: the tool row is in view beside it.
 *   HubSlots.lines / banners        → into the "?" sheet (the offices line) and Overview's stage (banners).
 *   HubSlots.stage (StageSlot[])    → only a ceremony takes the stage (the election reveal, the law and overrule
 *                                      reveals); a ballot moves into its sub-tab (ballots, below).
 *   new: picks (PlotPickSlot[])     → a plot-picking mode another tab hands to Overview's map (the Sheriff's Guard).
 *   nows, underNow, readyWords      → unchanged.
 */

export type HubSeatT = HubSeat;

/** The four tabs, in order. `politics` is "Governor" on the Governor's phone and "Council" on every other. */
export type TabId = 'overview' | 'politics' | 'colony' | 'talk';

/** Where a door leads: a tab, a sub-tab of it, a focus for its body to read, or a map tool on Overview. */
export interface Door {
  tab: TabId;
  sub?: string;
  focus?: string;
  tool?: string;
}

interface Shown {
  show?(seat: HubSeat): boolean;
}

/** A tab: its button in the tab column (A) or bar (B), and the stage it draws while open. */
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

/**
 * A plot-picking mode another tab hands to Overview's one map (PM ruling: one map, in Overview). While it is on,
 * Overview's tool row gives way to its bar, "Guarding · back to Sheriff", and its Map, Panel and Action stand in for
 * the tool's. "back to" returns to `back`.
 */
export interface PlotPickSlot extends Shown {
  id: string;
  /** The bar's verb, e.g. "Guarding". */
  label: string;
  /** One line under it: what a tap does. */
  hint(seat: HubSeat): string;
  back: Door & { label: string };
  Map: ComponentType;
  Panel?: ComponentType;
  Action?: ComponentType;
}

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
