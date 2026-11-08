import type { ComponentType } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { Now } from '../src/phone/Shell';
import type { AgendaSlot, BannerSlot, Door, HubSeat, MapToolSlot, PlotPickSlot, ReadyBarWords, StageSlot, SubTabSlot, HubNav, HubPlace, TabHubSlots, TabId, TabSlot } from '../src/phone/hub/slots';

/*
 * SB-1a: the tabbed hub's slot contract, frozen for the lanes that build against it before anything draws it. These
 * pins are checked by tsc (the web typecheck runs over test/); a change to a frozen shape fails there.
 */

const Body: ComponentType = () => null;

/** A whole tabbed hub as the approved mock fills it: four tabs, the Council's sub-tabs, and the Sheriff's Guard pick. */
const HUB = {
  tabs: [
    { id: 'overview', label: () => 'Overview', icon: 'M0 0', Body, Rail: Body, Action: Body },
    { id: 'politics', label: ({ view, self }) => (view.politics?.governor === self.id ? 'Governor' : 'Council'), icon: 'M0 0', Body, Badge: Body },
    { id: 'colony', label: () => 'Colony', icon: 'M0 0', Body },
    { id: 'talk', label: () => 'Talk', icon: 'M0 0', Body, Badge: Body, show: () => true },
  ],
  politicsTabs: [{ id: 'elections', label: () => 'Elections', Body, first: () => false }],
  tools: [],
  agenda: [],
  banners: [],
  lines: [],
  picks: [{ id: 'guard', label: 'Guarding', hint: () => 'Tap a plot to guard it', back: { tab: 'politics', sub: 'sheriff', label: 'Sheriff' }, ownBar: true, Map: Body }],
  nows: [],
  underNow: [],
  stage: [],
  readyWords: [],
} satisfies TabHubSlots;

/** A tabbed hub's navigation as a test double: today's moves and the tabbed ones, each a no-op. */
const NAV = {
  desk: 'colony',
  tool: 'look',
  focus: null,
  openDesk: () => {},
  pickTool: () => {},
  takeFocus: () => {},
  tab: 'overview',
  sub: 'laws',
  pick: null,
  open: (_door: Door) => {},
  startPick: (_id: string) => {},
  endPick: () => {},
} satisfies HubNav;

describe('SB-1a: the tabbed hub slot contract', () => {
  // trace-allow: a type-level pin of the SB-1a contract freeze; tsc is the check, the run only loads it.
  it('SB-1a: the frozen shapes are exactly the approved mock\'s', () => {
    expectTypeOf<TabId>().toEqualTypeOf<'overview' | 'politics' | 'colony' | 'talk'>();
    expectTypeOf<Door>().toEqualTypeOf<{ tab: TabId; sub?: string; focus?: string; tool?: string }>();
    expectTypeOf<HubPlace>().toEqualTypeOf<{ tab: TabId; sub: string; tool: string; focus: string | null; pick: string | null; first: string | null }>();
    expectTypeOf<TabSlot>().toEqualTypeOf<{
      show?(seat: HubSeat): boolean;
      id: TabId;
      label(seat: HubSeat): string;
      icon: string;
      Body: ComponentType;
      Badge?: ComponentType;
      Rail?: ComponentType;
      Action?: ComponentType;
    }>();
    expectTypeOf<SubTabSlot>().toEqualTypeOf<{ show?(seat: HubSeat): boolean; id: string; label(seat: HubSeat): string; Body: ComponentType; Badge?: ComponentType; first?(seat: HubSeat): boolean }>();
    expectTypeOf<PlotPickSlot>().toEqualTypeOf<{
      show?(seat: HubSeat): boolean;
      id: string;
      label: string;
      hint(seat: HubSeat): string;
      back: Door & { label: string };
      ownBar?: boolean;
      Map: ComponentType;
      Panel?: ComponentType;
      Action?: ComponentType;
    }>();
    expectTypeOf<TabHubSlots>().toEqualTypeOf<{
      tabs: TabSlot[];
      politicsTabs: SubTabSlot[];
      tools: MapToolSlot[];
      agenda: AgendaSlot[];
      banners: BannerSlot[];
      lines: BannerSlot[];
      picks: PlotPickSlot[];
      nows: ((seat: HubSeat) => Now | null)[];
      underNow: BannerSlot[];
      stage: StageSlot[];
      readyWords: ((seat: HubSeat) => ReadyBarWords | null)[];
    }>();
    expectTypeOf(HUB).toExtend<TabHubSlots>();
    // SB-2 grafted it: HubNav is today's moves, kept for the components that make them, plus the tabbed ones.
    type Today = 'desk' | 'tool' | 'focus' | 'openDesk' | 'pickTool' | 'takeFocus';
    expectTypeOf<Pick<HubNav, Today>>().toEqualTypeOf<{ desk: string; tool: string; focus: string | null; openDesk(id: string, focus?: string): void; pickTool(id: string): void; takeFocus(): void }>();
    expectTypeOf<Omit<HubNav, Today>>().toEqualTypeOf<{ tab: TabId; sub: string; pick: string | null; open(door: Door): void; startPick(id: string): void; endPick(): void }>();
    expectTypeOf(NAV).toExtend<HubNav>();

    // @ts-expect-error a tab is one of the four: "map" is not
    const _map: TabSlot = { id: 'map', label: () => '', icon: '', Body };
    // @ts-expect-error a door names its tab
    const _door: Door = { sub: 'laws' };
    // @ts-expect-error the tabbed nav still carries today's moves: openDesk is not optional
    const _nav: HubNav = { ...NAV, openDesk: undefined };
    void [_map, _door, _nav];
  });
});
