import type { ColonyHealthView, ColonyView, MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { Results } from '../src/phone/Results';
import { ReadyCount } from '../src/phone/hub/ReadyBar';
import { TvHeader, TvMonthEnd } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * PR-11, the colony health gauge (WS8; Heiko's option A, 7 Nov; mock design/mocks/colony-health @ b2470c60; rulebook
 * #colony-health-gauge-look). What the table sees from MuleView.colonyHealth: Health, a fifth gauge after Happiness, on
 * the TV header's own row and on the TV month end's 3 + 2 grid; on a phone with no TV, the end of the colonists line.
 * Null or absent (politics off, health switched off, an older server): no gauge, every screen as today.
 */

const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Heiko', slot: 0, worth: 6_420, lastWorth: 6_100 }),
  aPlayer({ id: 's2', name: 'Mia', slot: 1, species: 'bramblet', worth: 7_050, lastWorth: 6_600 }),
];

const stock = { food: 4, water: 2, energy: 3, smithore: 0, crystite: 0, rareEarth: 0, alloy: 1, electronics: 0, medicine: 0 };
const ME: MyView = {
  id: 's1',
  species: 'zipwing',
  stock,
  carriedMule: null,
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 3, water: 2 },
  monthNeeds: { ...stock, food: 3, water: 2, energy: 2 },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: null,
  installedThisTurn: false,
  worthParts: { money: 2_900, goods: 220, plots: 7, land: 2_100, mules: 6, muleValue: 900, office: 300, donated: 0, cut: 0 },
};

const COLONY: ColonyView = {
  gauges: { wealth: 26_400, environment: 38, prestige: 2, happiness: 52, band: 'restless' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 57 },
  fund: 2_340,
  ledger: null,
  projects: [],
  catalogue: [],
  score: null,
};

/** The three states of the mock's fixture: Well, a Sick spell and At the limit (4 in 10 sick, the most there can be). */
const health = (h: number, shortMonths = 0): ColonyHealthView => ({ health: h, medicineShort: shortMonths > 0, shortMonths });
const WELL = health(95);
const SICK = health(78, 1);
const LIMIT = health(60, 3);

function game({ colony = COLONY, colonyHealth }: { colony?: ColonyView | null; colonyHealth?: ColonyHealthView | null } = {}, over: Partial<MuleView> = {}): MuleView {
  return aMuleView({
    players: PLAYERS,
    me: null,
    politics: null,
    month: 7,
    phase: 'upkeep',
    colonists: 412,
    colonistsFed: true,
    air: { level: 38, band: 'smoggy' },
    lastAir: { level: 35, band: 'smoggy' },
    ...(colony === null ? {} : { colony }),
    ...(colonyHealth === undefined ? {} : { colonyHealth }),
    ...over,
  });
}

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

const render = (el: ReactElement) => renderToStaticMarkup(createElement(ClientProvider, { client, children: el }));
const header = (view: MuleView, props: Partial<Parameters<typeof TvHeader>[0]> = {}) => render(createElement(TvHeader, { game: view, title: 'Land auction · 2 of 4', ...props }));
const monthEnd = (view: MuleView) => render(createElement(TvMonthEnd, { game: view }));

/** The phone at the month end: with no TV at the table (boards 0) or beside one. */
function phone(view: MuleView, boards: number): string {
  const v = { ...view, me: ME };
  const table = { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards, game: v } as TableView<MuleView>;
  const value = { table, view: v, me: ME, self: v.players[0]!, slot: 0 as const };
  return render(createElement(PhoneGameProvider, { value, children: createElement(Results) }));
}

/** The markup of the element carrying this data-testid, through its matching closing tag; null when there is none. */
function element(html: string, testid: string): string | null {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  if (!open) return null;
  const tag = open[1]!;
  const from = open.index!;
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + m[0].length);
  }
  throw new Error(`no closing tag for ${testid}`);
}

const text = (html: string | null) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const said = (html: string, testid: string) => text(element(html, testid));
/** The gauge cells the viewer counts: every gauge-* inside the colony's gauges. */
const cells = (html: string) => [...(element(html, 'colony-gauges') ?? '').matchAll(/data-testid="gauge-([a-z]+)"/g)].map((m) => m[1]);
/** The opening tag of the element with this testid. */
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';

describe('PR-11: Health, a fifth gauge after Happiness (option A)', () => {
  it('with colonyHealth the colony shows five gauges, Health after Happiness; without it, the four of today', () => {
    expect(cells(header(game({ colonyHealth: SICK })))).toEqual(['wealth', 'environment', 'prestige', 'happiness', 'health']);
    expect(cells(header(game({ colonyHealth: null })))).toEqual(['wealth', 'environment', 'prestige', 'happiness']);
    expect(cells(header(game()))).toEqual(['wealth', 'environment', 'prestige', 'happiness']);
  });

  it('null or absent colonyHealth draws exactly today’s header, no health cell', () => {
    const today = header(game());
    expect(header(game({ colonyHealth: null }))).toBe(today);
    expect(today).not.toContain('health');
  });

  it('politics off (no colony, colonyHealth null): no gauges and no health anywhere on the TV', () => {
    const off = game({ colony: null, colonyHealth: null });
    expect(element(header(off), 'colony-gauges')).toBeNull();
    expect(monthEnd(off)).not.toContain('health');
  });

  it('the Health cell reads the share of colonists who are well, as a percentage', () => {
    expect(said(header(game({ colonyHealth: SICK })), 'health-value')).toBe('78%');
    expect(said(header(game({ colonyHealth: WELL })), 'health-value')).toBe('95%');
  });

  it.each([
    [95, 'Well', 'text-ok'],
    [90, 'Well', 'text-ok'],
    [89, 'Sick spell', 'text-warn'],
    [75, 'Sick spell', 'text-warn'],
    [61, 'Sick spell', 'text-warn'],
    [60, 'At the limit', 'text-alert'],
  ])('at %i the band word under the bar is “%s”', (h, word, tone) => {
    const html = header(game({ colonyHealth: health(h, h < 90 ? 1 : 0) }));
    expect(said(html, 'health-band')).toBe(word);
    expect(tagOf(html, 'health-band')).toContain(tone);
  });

  it('the bar fills 0 to 100 by the well share, with ticks at 60 (the floor) and 80 (crews fall sick below it)', () => {
    const cell = element(header(game({ colonyHealth: SICK })), 'gauge-health')!;
    expect(cell).toMatch(/class="absolute inset-y-0 left-0 rounded-full bg-warn" style="width:78%"/);
    expect(tagOf(cell, 'health-floor')).toContain('left:60%');
    expect(tagOf(cell, 'health-crews')).toContain('left:80%');
    expect(tagOf(cell, 'health-floor')).toMatch(/title="The floor: health never goes below 60"/);
    expect(tagOf(cell, 'health-crews')).toMatch(/title="Below 80 crews start falling sick"/);
  });

  it('at the limit the note says how many are sick: “4 in 10 sick”', () => {
    expect(said(header(game({ colonyHealth: LIMIT })), 'health-note')).toBe('4 in 10 sick');
  });

  it('above the limit the note is the month’s move, from lastHealth: “↓ 14 this month”, “↑ 6 this month”', () => {
    expect(said(header(game({ colonyHealth: { ...SICK, lastHealth: 92 } })), 'health-note')).toBe('↓ 14 this month');
    expect(said(header(game({ colonyHealth: { ...WELL, lastHealth: 89 } })), 'health-note')).toBe('↑ 6 this month');
  });

  it('no move this month reads “± 0”, as the Happiness gauge does', () => {
    expect(said(header(game({ colonyHealth: { ...SICK, lastHealth: 78 } })), 'health-note')).toBe('± 0');
  });

  it('month 1 (lastHealth null or absent): no note, the band word alone', () => {
    for (const h of [{ ...SICK, lastHealth: null }, SICK]) {
      const html = header(game({ colonyHealth: h }));
      expect(element(html, 'health-note')).toBeNull();
      expect(said(html, 'gauge-health')).toBe('Health 78% Sick spell');
    }
  });

  it('at the limit “4 in 10 sick” wins over the move', () => {
    expect(said(header(game({ colonyHealth: { ...LIMIT, lastHealth: 63 } })), 'health-note')).toBe('4 in 10 sick');
  });

  it('the move shares the band word’s line, so the cell is no taller: three lines, as every gauge', () => {
    const cell = element(header(game({ colonyHealth: { ...SICK, lastHealth: 92 } })), 'gauge-health')!;
    const bottom = cell.match(/<span class="flex items-baseline justify-between gap-2 whitespace-nowrap[^"]*">(.*?)<\/span><\/div>$/)?.[1] ?? '';
    expect(text(bottom)).toBe('Sick spell ↓ 14 this month');
    expect(said(cell, 'gauge-health')).toBe('Health 78% Sick spell ↓ 14 this month');
  });
});

describe('PR-11: the TV header puts the five gauges on a row of their own (rulebook: “five cells beside the title would cut text”)', () => {
  /** Where the gauges are: inside the header row, on a row of their own after it, and their width class. */
  function where(html: string): { where: 'header' | 'own row' | 'none'; width: string | null } {
    const at = html.indexOf('data-testid="colony-gauges"');
    if (at < 0) return { where: 'none', width: null };
    const width = tagOf(html, 'colony-gauges').match(/\bw-(full|\[\d+px\])/)?.[0] ?? null;
    return { where: at < html.indexOf('</header>') ? 'header' : 'own row', width };
  }

  it('with health and no clock or ready chip (land auction, election), the gauges leave the title’s line: own row, full width', () => {
    expect(where(header(game({ colonyHealth: SICK })))).toEqual({ where: 'own row', width: 'w-full' });
  });

  it('with health, development’s gauges=“beside” takes the own row too (production, development: PM ruling 7 Nov)', () => {
    expect(where(header(game({ colonyHealth: SICK }), { title: 'Development', gauges: 'beside' }))).toEqual({ where: 'own row', width: 'w-full' });
  });

  it('with health and a ready chip (planning), the own row as before', () => {
    const ready = createElement(ReadyCount, { players: PLAYERS, tv: true });
    expect(where(header(game({ colonyHealth: SICK }), { title: 'Planning', ready }))).toEqual({ where: 'own row', width: 'w-full' });
  });

  it('without health a header with no clock or chip keeps today’s four beside the title, and development keeps “beside”', () => {
    expect(where(header(game({ colonyHealth: null })))).toEqual({ where: 'header', width: 'w-[760px]' });
    expect(where(header(game(), { title: 'Development', gauges: 'beside' }))).toEqual({ where: 'header', width: 'w-[760px]' });
  });
});

describe('PR-11: the TV month end lays the five gauges out 3 + 2, Health across two columns', () => {
  it('with health: three columns, Wealth, Environment, Prestige over Happiness and Health, Health spanning two', () => {
    const html = monthEnd(game({ colonyHealth: SICK }));
    expect(tagOf(html, 'colony-gauges')).toContain('grid-cols-3!');
    expect(tagOf(html, 'health-cell')).toContain('col-span-2');
    expect(cells(html)).toEqual(['wealth', 'environment', 'prestige', 'happiness', 'health']);
    expect(said(html, 'health-value')).toBe('78%');
  });

  it('without health: today’s two by two, four gauges', () => {
    const html = monthEnd(game({ colonyHealth: null }));
    expect(tagOf(html, 'colony-gauges')).toContain('grid-cols-2!');
    expect(cells(html)).toEqual(['wealth', 'environment', 'prestige', 'happiness']);
    expect(monthEnd(game())).toBe(html);
  });

  it('the TV month end’s colonists line carries no health: the gauge above carries it', () => {
    expect(said(monthEnd(game({ colonyHealth: SICK })), 'colonists')).toBe('The store fed the colony’s 412 colonists');
  });
});

describe('PR-11: a phone with no TV ends the colonists line with health', () => {
  it('in a Sick spell: “… 412 colonists · health 78% · Sick spell”, the figure and word in the band’s tone', () => {
    const html = phone(game({ colonyHealth: SICK }), 0);
    expect(said(html, 'colonists')).toBe('The store fed the colony’s 412 colonists · health 78% · Sick spell');
    expect(tagOf(element(html, 'colony-health')!, 'health-value')).toContain('text-warn');
    expect(tagOf(html, 'health-band')).toContain('text-warn');
  });

  it('at the limit: “· health 60% · At the limit”', () => {
    expect(said(phone(game({ colonyHealth: LIMIT }), 0), 'colonists')).toBe('The store fed the colony’s 412 colonists · health 60% · At the limit');
  });

  it('while Well, the figure alone: “· health 95%”, no band word', () => {
    const html = phone(game({ colonyHealth: WELL }), 0);
    expect(said(html, 'colonists')).toBe('The store fed the colony’s 412 colonists · health 95%');
    expect(element(html, 'health-band')).toBeNull();
  });

  it('beside a TV the phone does not change: no health on it', () => {
    const beside = phone(game({ colonyHealth: SICK }), 1);
    expect(beside).not.toContain('health');
    expect(beside).toBe(phone(game({ colonyHealth: null }), 1));
  });

  it('null, absent or politics off: today’s colonists line', () => {
    expect(said(phone(game({ colonyHealth: null }), 0), 'colonists')).toBe('The store fed the colony’s 412 colonists');
    expect(phone(game({ colonyHealth: null }), 0)).toBe(phone(game(), 0));
    expect(said(phone(game({ colony: null, colonyHealth: null }), 0), 'colonists')).toBe('The store fed the colony’s 412 colonists');
  });
});
