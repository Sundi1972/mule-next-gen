import type { MuleView, MyView, PlayerView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgendaRow, DeskTabs, MapTools } from '../src/phone/hub/Hub';
import { drawnSlots, type AgendaSlot, type DeskSlot, type HubSeat, type HubSlots, type MapToolSlot } from '../src/phone/hub/slots';
import { HUB_SLOTS } from '../src/phone/hub/today';

const self = { id: 's1', name: 'Lena' } as PlayerView;
const seat = (id = 's1'): HubSeat => ({ view: { month: 4 } as MuleView, me: { id } as MyView, self: { ...self, id } });

const Nothing = () => null;
const desk = (id: string, extra: Partial<DeskSlot> = {}): DeskSlot => ({ id, label: id, icon: 'M0 0', Body: Nothing, ...extra });
const tool = (id: string, extra: Partial<MapToolSlot> = {}): MapToolSlot => ({ id, label: id, hint: () => '', Map: Nothing, ...extra });
const agenda = (key: string, opens: AgendaSlot['opens'], extra: Partial<AgendaSlot> = {}): AgendaSlot => ({ key, title: () => key, sub: () => '', opens, ...extra });

/** A Governor's desk, as WS7 would register it: only its holder, here s9, sees it. */
const governor = desk('governor', { show: (s) => s.self.id === 's9' });
const slots: HubSlots = {
  nows: [],
  banners: [{ id: 'offices', show: () => false, Body: Nothing }],
  beneath: [{ id: 'prices', Body: Nothing }],
  desks: [desk('colony'), governor, desk('market')],
  tools: [tool('look'), tool('guard', { show: () => false })],
  agenda: [agenda('drone', { tool: 'look' }), agenda('governor', { desk: 'governor' }), agenda('council', { desk: 'council' }), agenda('guard', { tool: 'guard' })],
};

describe('the hub slots (C17)', () => {
  it('B-AC-14 (negative): a desk, agenda item, map tool or banner that is absent, or whose show() says no, is not drawn', () => {
    const drawn = drawnSlots(slots, seat());
    expect(drawn.desks.map((d) => d.id)).toEqual(['colony', 'market']);
    expect(drawn.tools.map((t) => t.id)).toEqual(['look']);
    expect(drawn.banners).toEqual([]);
    expect(drawn.beneath.map((b) => b.id)).toEqual(['prices']);
    // A door into a desk or tool that isn't drawn is not drawn either.
    expect(drawn.agenda.map((a) => a.key)).toEqual(['drone']);

    const tabs = renderToStaticMarkup(createElement(DeskTabs, { desks: drawn.desks, active: 'colony', onPick: () => {} }));
    expect(tabs).toContain('data-testid="desk-colony"');
    expect(tabs).toContain('data-testid="desk-market"');
    expect(tabs).not.toContain('desk-governor');
    const row = renderToStaticMarkup(createElement(AgendaRow, { items: drawn.agenda, seat: seat(), onOpen: () => {}, note: '' }));
    expect(row).toContain('data-testid="agenda-drone"');
    expect(row).not.toContain('agenda-governor');
    expect(row).not.toContain('agenda-council');
    const tools = renderToStaticMarkup(createElement(MapTools, { tools: drawn.tools, active: 'look', onPick: () => {}, hint: null }));
    expect(tools).toContain('data-testid="tool-look"');
    expect(tools).not.toContain('tool-guard');
  });

  it("B-AC-14: the office holder's desk is drawn for its holder, with its door", () => {
    const drawn = drawnSlots(slots, seat('s9'));
    expect(drawn.desks.map((d) => d.id)).toEqual(['colony', 'governor', 'market']);
    expect(drawn.agenda.map((a) => a.key)).toEqual(['drone', 'governor']);
  });

  it("C17: today's hub registers only what exists: Colony, Talk, Market; Look, Geo drone, Sell a plot; no politics", () => {
    expect(HUB_SLOTS.desks.map((d) => d.id)).toEqual(['colony', 'talk', 'market']);
    expect(HUB_SLOTS.tools.map((t) => t.id)).toEqual(['look', 'drone', 'list']);
    expect(HUB_SLOTS.agenda.map((a) => a.key)).toEqual(['drone', 'list']);
    expect(HUB_SLOTS.banners).toEqual([]);
    expect(HUB_SLOTS.beneath.map((b) => b.id)).toEqual(['market-strip']);
    expect(HUB_SLOTS.nows).toEqual([]);
  });
});
