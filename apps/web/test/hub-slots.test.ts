import { GOODS } from '@mule/engine';
import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { AgendaRow, DeskTabs, Hub, MapTools } from '../src/phone/hub/Hub';
import { drawnSlots, goTo, settle, type AgendaSlot, type DeskSlot, type HubSeat, type HubSlots, type MapToolSlot, type ReadyBarWords, type StageSlot } from '../src/phone/hub/slots';

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
  beneath: [{ id: 'prices', Body: Nothing }, { id: 'hidden', show: () => false, Body: Nothing }],
  desks: [desk('colony'), governor, desk('market')],
  tools: [tool('look'), tool('guard', { show: () => false })],
  agenda: [agenda('drone', { tool: 'look' }), agenda('governor', { desk: 'governor' }), agenda('council', { desk: 'council' }), agenda('guard', { tool: 'guard' }), agenda('quiet', { tool: 'look' }, { show: () => false })],
};

describe('the hub slots (C17)', () => {
  it('B-AC-14 (negative): a desk, agenda item, map tool or banner that is absent, or whose show() says no, is not drawn', () => {
    const drawn = drawnSlots(slots, seat());
    expect(drawn.desks.map((d) => d.id)).toEqual(['colony', 'market']);
    expect(drawn.tools.map((t) => t.id)).toEqual(['look']);
    expect(drawn.banners).toEqual([]);
    expect(drawn.beneath.map((b) => b.id)).toEqual(['prices']);
    // A door into a desk or tool that isn't drawn is not drawn either; nor is a door whose own show() says no.
    expect(drawn.agenda.map((a) => a.key)).toEqual(['drone']);

    const tabs = renderToStaticMarkup(createElement(DeskTabs, { desks: drawn.desks, active: 'colony', onPick: () => {} }));
    expect(tabs).toContain('data-testid="desk-colony"');
    expect(tabs).toContain('data-testid="desk-market"');
    expect(tabs).not.toContain('desk-governor');
    const row = renderToStaticMarkup(createElement(AgendaRow, { items: drawn.agenda, seat: seat(), onOpen: () => {}, note: '' }));
    expect(row).toContain('data-testid="agenda-drone"');
    expect(row).not.toContain('agenda-governor');
    expect(row).not.toContain('agenda-council');
    expect(row).not.toContain('agenda-quiet');
    const tools = renderToStaticMarkup(createElement(MapTools, { tools: drawn.tools, active: 'look', onPick: () => {}, hint: null }));
    expect(tools).toContain('data-testid="tool-look"');
    expect(tools).not.toContain('tool-guard');
  });

  it("B-AC-14: the office holder's desk is drawn for its holder, with its door", () => {
    const drawn = drawnSlots(slots, seat('s9'));
    expect(drawn.desks.map((d) => d.id)).toEqual(['colony', 'governor', 'market']);
    expect(drawn.agenda.map((a) => a.key)).toEqual(['drone', 'governor']);
  });
});

/** A client with nothing said and a still clock: enough for the whole hub to render. */
const client = { subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: 's1' }), serverNow: () => 0, intent: () => {} } as unknown as TableClient;
const NO_GOODS = Object.fromEntries(GOODS.map((g) => [g, 0])) as MyView['stock'];
const player = (id: string, name: string, slot: number): PlayerView => ({ ...self, id, name, slot, isAi: false, ready: false, species: 'mollox', worth: 0 });
const PLAYERS = [player('s1', 'Lena', 0), player('s9', 'Ossa', 1)];

/** The whole hub, as `id` sees it in month 4's planning, from these slots. */
function hub(frame: HubSlots, id = 's1'): string {
  const view = { phase: 'planning', month: 4, maxMonths: 12, players: PLAYERS, tiles: [], listings: [], air: { level: 0, band: 'clean' }, ship: { inPort: false, arrives: 6 }, phaseEndsAt: null, politics: null } as unknown as MuleView;
  const me = { id, monthNeeds: NO_GOODS, stock: NO_GOODS } as MyView;
  const table = { code: 'ABCD', status: 'playing', hostId: 's1', boards: 1, seats: [], game: null } as TableView<MuleView>;
  const game = createElement(PhoneGameProvider, { value: { table, view, me, self: PLAYERS.find((p) => p.id === id)!, slot: 0 as Slot }, children: createElement(Hub, { slots: frame }) });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: game })).replaceAll('<!-- -->', '');
}

const marker = (testid: string) => () => createElement('p', { 'data-testid': testid });
const ELECTION_DAY: StageSlot = { id: 'election', show: (s) => s.view.month === 4, phase: () => 'Election day', Body: marker('day-card') };
const BALLOT_WORDS: ReadyBarWords = { ready: 'Cast my vote', done: 'You voted', waiting: 'Still waiting for', all: 'Everyone has voted.', confirm: (names) => `Close the ballot without ${names}?`, canReady: false, label: 'VOTED' };
const frame = (extra: Partial<HubSlots> = {}): HubSlots => ({
  nows: [],
  banners: [{ id: 'offices', Body: marker('offices') }],
  beneath: [],
  desks: [desk('colony', { Body: marker('colony-body') }), desk('governor', { first: (s) => s.self.id === 's9', Body: marker('governor-body') }), desk('market')],
  tools: [tool('look', { Map: marker('look-map'), Panel: marker('look-panel'), Action: marker('look-action') })],
  agenda: [agenda('drone', { tool: 'look' })],
  ...extra,
});

describe('the hub frame for a situation (C66)', () => {
  it('C66 (frame): the first stage slot shown takes the stage on a phone, in place of the banners, This month, the map tools, the map and the tool\'s panel and action; the shell\'s phase is its own', () => {
    const later: StageSlot = { id: 'later', Body: marker('later-card') };
    const drawn = drawnSlots(frame({ stage: [{ ...ELECTION_DAY, id: 'hidden', show: () => false }, ELECTION_DAY, later] }), seat());
    expect(drawn.stage?.[0]?.id, 'a hidden one gives way; of the rest, the first wins').toBe('election');

    const html = hub(frame({ stage: [ELECTION_DAY, later] }));
    expect(html).toContain('data-testid="day-card"');
    expect(html, 'only the first shown').not.toContain('later-card');
    for (const gone of ['offices', 'agenda', 'map-tools', 'hub-map', 'look-map', 'look-panel', 'look-action']) expect(html, gone).not.toContain(`data-testid="${gone}"`);
    expect(html).toMatch(/>Election day</);
  });

  it('C66 (frame): under a stage the rail holds only Now and the footer: no desk tabs, no desk body', () => {
    for (const id of ['s1', 's9']) {
      const html = hub(frame({ stage: [ELECTION_DAY] }), id);
      expect(html, id).not.toContain('data-testid="desks"');
      expect(html, id).not.toMatch(/data-testid="desk-[^"]*"/);
      expect(html, `${id}: the card whole, as no desk needs its room`).toMatch(/<section[^>]*data-testid="now"/);
      expect(html, id).toContain('data-testid="ready"');
    }
  });

  it("C66 (frame): a stage's Rail is drawn in the rail under the Now card; without one the rail stays empty", () => {
    const html = hub(frame({ stage: [{ ...ELECTION_DAY, Rail: marker('run-block') }] }));
    const guide = html.slice(html.indexOf('data-testid="guide"'));
    expect(guide).toContain('data-testid="run-block"');
    expect(guide.indexOf('data-testid="now"')).toBeLessThan(guide.indexOf('data-testid="run-block"'));
    expect(hub(frame({ stage: [ELECTION_DAY] }))).not.toContain('run-block');
  });

  it('C66 (frame, negative): with no stage slot shown the hub is today\'s, under planning\'s own title', () => {
    for (const stage of [undefined, [{ ...ELECTION_DAY, show: () => false }]]) {
      const html = hub(frame(stage ? { stage } : {}));
      for (const kept of ['offices', 'agenda', 'map-tools', 'hub-map', 'look-map', 'look-panel', 'look-action']) expect(html, kept).toContain(`data-testid="${kept}"`);
      expect(html).not.toContain('day-card');
      expect(html).toMatch(/>Planning</);
      expect(html).not.toMatch(/>Election day</);
    }
  });

  it('C66 (frame): the ready bar takes the first words a slot gives: its button, whether it is live, and what the count counts', () => {
    const html = hub(frame({ readyWords: [() => null, () => BALLOT_WORDS, () => ({ ...BALLOT_WORDS, ready: 'Not this one' })] }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="ready"[^>]*>Cast my vote</);
    expect(html).toMatch(/data-testid="ready-count"[^>]*>0 \/ 2 VOTED</);

    const plain = hub(frame({ readyWords: [() => null] }));
    expect(plain, "with none given, planning's own").toMatch(/<button(?![^>]*disabled="")[^>]*data-testid="ready"[^>]*>I&#x27;m ready</);
    expect(plain).toMatch(/data-testid="ready-count"[^>]*>0 \/ 2 READY</);
  });

  it("C66 (frame): a desk that asks to come first is drawn first and opens first, and the Now card folds to its title (E-9); for anyone else it keeps its place, and Now folds as in any month (H-7)", () => {
    expect(drawnSlots(frame(), seat('s9')).desks.map((d) => d.id)).toEqual(['governor', 'colony', 'market']);
    expect(drawnSlots(frame(), seat('s1')).desks.map((d) => d.id), 'in its place').toEqual(['colony', 'governor', 'market']);

    const governor = hub(frame(), 's9');
    const tabs = governor.slice(governor.indexOf('data-testid="desks"'));
    expect(tabs.indexOf('desk-governor')).toBeLessThan(tabs.indexOf('desk-colony'));
    expect(governor).toMatch(/aria-selected="true"[^>]*data-testid="desk-governor"/);
    expect(governor).toContain('data-testid="governor-body"');
    expect(governor, 'folded: one line, a button that opens it').toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="now"/);
    expect(governor).toContain('data-testid="now-title"');

    const lena = hub(frame(), 's1');
    expect(lena).toMatch(/aria-selected="true"[^>]*data-testid="desk-colony"/);
    expect(lena, 'H-7: folded too, once read, with no desk asking first').toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="now"/);
  });

  it('C66 (frame): a desk that comes to ask first mid-phase opens once; a tab away from it then stays', () => {
    const drawn = drawnSlots(frame(), seat('s9'));
    const before = settle({ desk: 'colony', tool: 'look', focus: null, first: null }, drawn, seat('s9'));
    expect(before.desk, 'the new Governor sees the desk open').toBe('governor');
    const away = goTo(before, { desk: 'market' }, drawn);
    expect(settle(away, drawn, seat('s9')).desk, 'and can leave it').toBe('market');
    expect(settle(away, drawnSlots(frame(), seat('s1')), seat('s1')), 'gone: nothing asks').toMatchObject({ desk: 'market', first: null });
  });

  it('C66 (frame): a door opens its desk with its focus, for the desk to read; a tab, a tool or a plain door clears it; desk and tool doors open as today', () => {
    const drawn = drawnSlots({ ...frame(), desks: [desk('colony'), desk('council'), desk('market', { tool: 'list' })], tools: [tool('look'), tool('list', { desk: 'market' })] }, seat());
    const start = { desk: 'colony', tool: 'look', focus: null, first: null };
    const run = goTo(start, { desk: 'council', focus: 'run' }, drawn);
    expect(run).toMatchObject({ desk: 'council', tool: 'look', focus: 'run' });
    expect(goTo(run, { desk: 'colony' }, drawn).focus, 'a tab').toBeNull();
    expect(goTo(run, { tool: 'look' }, drawn).focus, 'a tool').toBeNull();
    expect(goTo(start, { desk: 'market' }, drawn), "a desk's own tool comes with it").toMatchObject({ desk: 'market', tool: 'list' });
    expect(goTo(start, { tool: 'list' }, drawn), "a tool's own desk comes with it").toMatchObject({ desk: 'market', tool: 'list' });
    expect(drawnSlots({ ...frame(), agenda: [agenda('hat', { desk: 'council', focus: 'run' })] }, seat()).agenda, 'a focus door into a desk not drawn is not drawn').toEqual([]);
  });

  it('C66 (frame): the desk tabs sit on one row, however many', () => {
    const six = ['governor', 'colony', 'talk', 'council', 'market', 'secret'].map((id) => desk(id));
    const tabs = renderToStaticMarkup(createElement(DeskTabs, { desks: six, active: 'governor', onPick: () => {} }));
    expect(tabs).toMatch(/^<div[^>]*class="[^"]*\bflex\b[^"]*"/);
    expect(tabs, 'no grid of four to a row').not.toContain('grid-template-columns');
    expect(tabs).not.toContain('flex-wrap');
  });
});
