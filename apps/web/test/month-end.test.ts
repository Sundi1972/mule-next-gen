import { POLLUTION } from '@mule/engine';
import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { GameOver } from '../src/phone/GameOver';
import { Results } from '../src/phone/Results';
import { TvGameOver, TvMonthEnd } from '../src/table/TableApp';

/**
 * The month end as the phone and the TV draw it, from a view the server could send (C20). The browser step at month
 * 2's end is smoke's; these cover the states a two-month browser game can't reach on demand: Collapse, a hungry
 * player who isn't the phone's, the table with no TV, and game over.
 */

type Condition = NonNullable<PlayerView['condition']>;
const FED: Condition = { foodShare: 1, foodNeed: 2, sick: false, sickBecause: null, conditionPace: 1 };
/** Kai's household needs 3 Food this month, as the view says (its crew is on plots this fixture doesn't draw); he held 1. */
const KAI_NEED = 3;
const KAI_SHORT: Condition = { foodShare: 1 / KAI_NEED, foodNeed: KAI_NEED, sick: false, sickBecause: null, conditionPace: 0.6 };

const row = (id: string, name: string, slot: number, money: number, worth: number, lastWorth: number | null, condition: Condition | null = FED): PlayerView => ({
  id,
  name,
  isAi: false,
  color: '',
  slot,
  species: 'zipwing',
  money,
  worth,
  lastWorth,
  worthBeforeCut: null,
  plots: 0,
  ready: false,
  doneDeveloping: false,
  colonist: null,
  condition,
});

/** Heiko (the phone) leads on cash; Mia's goods, land and MULEs make her the Worth leader. Kai went hungry. */
const HEIKO = row('s1', 'Heiko', 0, 3_000, 3_400, 3_500);
const MIA = row('s2', 'Mia', 1, 900, 5_200, 4_800);
const KAI = row('s3', 'Kai', 2, 1_500, 2_100, 2_100, KAI_SHORT);
const PLAYERS = [HEIKO, MIA, KAI];

const stock = { food: 4, water: 2, energy: 3, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const me: MyView = {
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
  worthParts: { money: 3_000, goods: 100, plots: 1, land: 300, mules: 0, muleValue: 0, office: 0, cut: 0 },
};

function view(extra: Partial<MuleView> = {}): MuleView {
  return {
    finished: false,
    month: 4,
    maxMonths: 12,
    phase: 'upkeep',
    phaseEndsAt: null,
    width: 1,
    height: 1,
    tiles: [],
    lit: null,
    players: PLAYERS,
    me,
    market: [],
    storeMules: 0,
    mulePrice: 150,
    colonists: 1_240,
    air: { level: 34, band: 'smoggy' },
    lastAir: { level: 27, band: 'clean' },
    colonistsFed: true,
    ship: { arrives: 6, inPort: false, wants: null },
    treasury: { money: 640, salesTax: 0.05 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production: null,
    politics: null,
    ...extra,
  };
}

/**
 * The air in Collapse: every worth is cut, and the view carries each before the cut; Heiko's own lines show the cut.
 * Mia's 5,202 cuts to 4,162, which over collapseScore reads 5,203: only the view's number is right.
 */
const MIA_BEFORE_CUT = 5_202;
function collapse(): MuleView {
  const cutOf = (n: number) => Math.round(n * POLLUTION.collapseScore);
  const parts = { ...me.worthParts, cut: 3_400 - cutOf(3_400) };
  return view({
    air: { level: 84, band: 'collapse' },
    lastAir: { level: 77, band: 'toxic' },
    players: PLAYERS.map((p) => {
      const before = p.id === 's2' ? MIA_BEFORE_CUT : p.worth;
      return { ...p, worth: cutOf(before), worthBeforeCut: before };
    }),
    me: { ...me, worthParts: parts },
  });
}

/** Game over as the server sends it: `scores` in seat order, each player's worth equal to their score. */
const OVER = view({ finished: true, phase: 'gameOver', month: 12, scores: PLAYERS.map((p) => ({ id: p.id, score: p.worth })) });

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

/** A screen as Heiko's phone draws it, at a table with a TV (`boards` 1) or without; Heiko hosts unless `hostId` says otherwise. */
function onPhone(game: MuleView, screen: () => ReactElement, boards = 1, hostId = 's1'): string {
  const table = { code: 'MULE', status: 'playing', hostId, seats: [], boards, game } as TableView<MuleView>;
  const value = { table, view: game, me: game.me!, self: game.players[0]!, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(screen) }) }));
}

/** The TV, which gets the board's view: no `me`. */
function onTv(game: MuleView, screen: (props: { game: MuleView }) => ReactElement): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(screen, { game: { ...game, me: null } }) }));
}

/** The markup of the element carrying this data-testid, through its matching closing tag. */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  const from = open!.index!;
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + m[0].length);
  }
  throw new Error(`no closing tag for ${testid}`);
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const said = (html: string, testid: string) => text(element(html, testid));
const has = (html: string, testid: string) => html.includes(`data-testid="${testid}"`);
/** The league table's rows, top to bottom, as player ids. */
const order = (html: string) => [...element(html, 'league-table').matchAll(/data-testid="league-row-([^"]+)"/g)].map((m) => m[1]);
/** A number as the screens print it: thousands separators, and a minus sign when negative. */
const num = (shown: string) => (/^[−-]/.test(shown) ? -1 : 1) * Number(shown.replace(/[^\d]/g, ''));

describe('B-AC-12 (WS4, month end): the league table and the colony, on the phone and the TV', () => {
  const phone = onPhone(view(), Results);
  const tv = onTv(view(), TvMonthEnd);

  it('B-AC-12 (WS4, month end): both rank by Worth, the Worth leader first, with the lead line', () => {
    for (const html of [phone, tv]) expect(order(html)).toEqual(['s2', 's1', 's3']);
    expect(said(tv, 'leader-line')).toBe('Mia leads by 1,800 cr');
    expect(said(phone, 'leader-line')).toBe('Mia leads by 1,800 cr');
    expect(said(phone, 'leader-you')).toBe('You’re 2nd, 1,800 behind');
    expect(said(phone, 'name-s1')).toBe('You (Heiko)');
    expect(said(tv, 'name-s1')).toBe('Heiko');
  });

  it("B-AC-12 (WS4, month end): each change is this month's Worth against the Worth shown at last month's end", () => {
    for (const html of [phone, tv]) {
      expect(said(html, 'change-head')).toBe('Since month 3');
      expect(said(html, 'change-s2')).toBe('↑ +400');
      expect(said(html, 'change-s1')).toBe('↓ −100');
      expect(said(html, 'change-s3')).toBe('± 0');
    }
  });

  it('B-AC-12 (WS4, month end): in month 1 there is no last month, so neither screen draws a change column', () => {
    const first = view({ month: 1, lastAir: null, players: PLAYERS.map((p) => ({ ...p, lastWorth: null })) });
    for (const html of [onPhone(first, Results), onTv(first, TvMonthEnd)]) {
      expect(text(html)).not.toContain('Since month 0');
      expect(has(html, 'change-head')).toBe(false);
      for (const p of PLAYERS) expect(has(html, `change-${p.id}`)).toBe(false);
    }
  });

  it('B-AC-12 (WS4, month end): the TV names who went hungry, from the month’s condition, and the air against last month', () => {
    expect(said(tv, 'hungry-s3')).toBe(`Kai went hungry: ate 1 of ${KAI_NEED} Food`);
    expect(has(tv, 'hungry-s1')).toBe(false);
    expect(has(tv, 'nobody-hungry')).toBe(false);
    expect(said(tv, 'air-level')).toBe('34');
    expect(said(tv, 'air-trend')).toBe('↓ worse than month 3 (27 · Clean)');
    expect(said(tv, 'fund-balance')).toBe('640 cr');
    const fed = onTv(view({ players: PLAYERS.map((p) => ({ ...p, condition: FED })) }), TvMonthEnd);
    expect(said(fed, 'nobody-hungry')).toBe('✓ Nobody went hungry');
  });

  it('B-AC-12 (WS4, month end): the colony panel says whether the colonists were fed or went short', () => {
    expect(said(tv, 'colonists')).toBe('Colonists fed · 1,240');
    const short = onTv(view({ colonistsFed: false }), TvMonthEnd);
    expect(said(short, 'colonists')).toBe('Colonists went short · 1,240');
    expect(element(short, 'colonists')).toContain('text-alert');
  });

  it('B-AC-12 (WS4, month end): your phone alone shows your own lines, and they add up to your Worth', () => {
    const lines = ['cash', 'goods', 'land', 'mules', 'offices'].map((k) => num(said(phone, `worth-cr-${k}`)));
    expect(lines.reduce((a, b) => a + b, 0)).toBe(HEIKO.worth);
    expect(num(said(phone, 'worth-total-cr'))).toBe(HEIKO.worth);
    for (const testid of ['your-worth', 'worth-line-', 'worth-cr-', 'part-']) expect(tv, `the TV carries no ${testid}`).not.toContain(`data-testid="${testid}`);
  });

  it('B-AC-12 (WS4, month end): beside a TV the phone leaves the colony to it; with no TV the phone carries the colony panel too', () => {
    expect(has(phone, 'phone-monthend')).toBe(true);
    expect(has(phone, 'colony-on-tv')).toBe(true);
    expect(has(phone, 'colony-panel')).toBe(false);
    const alone = onPhone(view(), Results, 0);
    expect(has(alone, 'phone-only-monthend')).toBe(true);
    expect(said(alone, 'hungry-short-s3')).toBe(`Kai: ate 1 of ${KAI_NEED} Food`);
    expect(said(alone, 'hungry-full-s3')).toBe(`Kai went hungry: ate 1 of ${KAI_NEED} Food`);
    expect(element(alone, 'hungry-short-s3')).toContain(`title="Kai went hungry: ate 1 of ${KAI_NEED} Food"`);
    expect(said(alone, 'air-trend')).toBe('↓ worse than month 3 (27 · Clean)');
  });

  it('B-AC-11 (WS4, month end): under 1100 px a phone’s hunger line is the short form on one line, the full sentence only from 1100 px; the TV keeps the sentence', () => {
    const alone = onPhone(view(), Results, 0);
    expect(element(alone, 'hungry-short-s3')).toMatch(/class="[^"]*\btruncate\b[^"]*@min-\[1100px\]\/shell:hidden/);
    expect(element(alone, 'hungry-full-s3')).toMatch(/class="[^"]*\bhidden\b[^"]*@min-\[1100px\]\/shell:inline/);
    expect(has(tv, 'hungry-short-s3')).toBe(false);
  });

  it('B-AC-11 (WS4, month end): in the final standings under 1100 px your row reads just "You"; your name shows from 1100 px', () => {
    const over = onPhone(OVER, GameOver);
    expect(said(over, `you-name-${OVER.me!.id}`)).toBe('You');
    expect(element(over, `you-full-${OVER.me!.id}`)).toMatch(/class="[^"]*\bhidden\b[^"]*@min-\[1100px\]\/shell:inline/);
  });

  it('B-AC-12 (WS4, month end): no screen shows a line that is not built yet: no fund in and out, no G-5 slots, no Donations', () => {
    const screens = [phone, tv, onPhone(view(), Results, 0), onPhone(OVER, GameOver), onPhone(OVER, GameOver, 0), onTv(OVER, TvGameOver)];
    for (const html of screens) {
      expect(text(html)).not.toMatch(/comes with|Prestige|Mood|Colony score|Donations/);
      for (const testid of ['fund-month', 'g5-', 'worth-line-donations']) expect(html).not.toContain(`data-testid="${testid}`);
    }
    for (const html of [tv, onPhone(view(), Results, 0)]) expect(said(html, 'fund-balance')).toBe('640 cr');
  });

  it("B-AC-13 (WS4, month end): the TV's month end carries planning's ready count, the AI seats counted on", () => {
    const on = view({ players: [{ ...HEIKO, ready: true }, MIA, { ...KAI, isAi: true }] });
    expect(said(onTv(on, TvMonthEnd), 'ready-count')).toBe('2 / 3 READY');
    expect(has(onTv(on, TvMonthEnd), 'waiting-for')).toBe(false);
  });

  it('B-AC-12 (WS4, month end): with no TV and four players hungry, the colony names two and counts the rest', () => {
    const DEV = row('s4', 'Dev', 3, 700, 1_900, 1_800, KAI_SHORT);
    const starving = view({ players: [...PLAYERS, DEV].map((p) => ({ ...p, condition: KAI_SHORT })) });
    const alone = onPhone(starving, Results, 0);
    const lines = [...element(alone, 'colony-hungry').matchAll(/data-testid="hungry-(s\d)"/g)].map((m) => m[1]);
    expect(lines).toEqual(['s1', 's2']);
    expect(said(alone, 'hungry-more')).toBe('+2 more went hungry');
    const tv4 = onTv(starving, TvMonthEnd);
    expect([...tv4.matchAll(/data-testid="hungry-s\d"/g)]).toHaveLength(4);
    expect(has(tv4, 'hungry-more')).toBe(false);
  });

  it('B-AC-13 (WS4, month end): the phone moves on with "On to month 5", which is Ready', () => {
    expect(said(phone, 'ready')).toBe('On to month 5');
    expect(has(phone, 'continue')).toBe(false);
  });

  it("B-AC-13 (WS4, month end): once on, the host's phone names who the table waits for and offers Continue; a phone that isn't the host's never does", () => {
    const on = view({ players: PLAYERS.map((p) => (p.id === 's1' ? { ...p, ready: true } : p)) });
    const host = onPhone(on, Results);
    expect(said(host, 'ready')).toBe('Waiting for the others');
    expect(said(host, 'waiting-for')).toBe('Waiting for Mia Kai');
    expect(said(host, 'continue')).toBe('Continue without them');
    const guest = onPhone(on, Results, 1, 's2');
    expect(said(guest, 'waiting-for')).toBe('Waiting for Mia Kai');
    expect(has(guest, 'continue')).toBe(false);
  });
});

describe('B-AC-12 (WS4, month end): Collapse', () => {
  const v = collapse();
  const phone = onPhone(v, Results);
  const tv = onTv(v, TvMonthEnd);

  it('B-AC-12 (WS4, month end): in Collapse each Worth is the cut one, under "If the game ended now", the uncut beside it', () => {
    expect(said(tv, 'worth-head')).toBe('If the game ended now');
    expect(said(phone, 'worth-head')).toBe('If it ended now');
    expect(has(tv, 'collapse-banner')).toBe(true);
    for (const html of [phone, tv]) {
      expect(order(html)).toEqual(['s2', 's1', 's3']);
      expect(said(html, 'worth-s2')).toBe('4,162');
      expect(said(html, 'uncut-s2')).toBe('5,202');
      expect(said(html, 'uncut-s1')).toBe('3,400');
    }
  });

  it("B-AC-12 (WS4, month end): in Collapse the change is against last month's shown Worth, one rule", () => {
    for (const html of [phone, tv]) expect(said(html, 'change-s2')).toBe(`↓ −${(4_800 - 4_162).toLocaleString('en')}`);
  });

  it('B-AC-12 (WS4, month end): in Collapse your phone shows the cut as its own line, and the lines still add up', () => {
    const cut = num(said(phone, 'worth-cr-cut'));
    expect(cut, 'what Collapse took off 3,400').toBe(-(3_400 - 2_720));
    const lines = ['cash', 'goods', 'land', 'mules', 'cut', 'offices'].map((k) => num(said(phone, `worth-cr-${k}`)));
    expect(lines.reduce((a, b) => a + b, 0)).toBe(2_720);
    expect(num(said(phone, 'worth-total-cr'))).toBe(2_720);
    expect(text(element(phone, 'worth-uncut'))).toBe('Without the cut 3,400');
  });
});

describe('B-AC-12 (WS4, month end): game over in credits', () => {
  it('B-AC-12 (WS4, month end): the TV calls the winner out in credits, over the final table by Worth; never points', () => {
    const tv = onTv(OVER, TvGameOver);
    expect(said(tv, 'winner-line')).toBe('Mia wins with a Worth of 5,200 cr');
    expect(order(element(tv, 'tv-scores'))).toEqual(['s2', 's1', 's3']);
    expect(has(tv, 'tv-verdict')).toBe(true);
    expect(text(tv)).not.toMatch(/points/i);
    expect(tv).not.toContain('data-testid="your-worth"');
  });

  it('B-AC-12 (WS4, month end): your phone gives your place and Worth in credits and the winner line; never points', () => {
    const phone = onPhone(OVER, GameOver);
    expect(said(phone, 'my-place')).toBe('You finished 2nd of 3');
    expect(has(phone, 'my-rank')).toBe(true);
    expect(said(phone, 'winner-worth')).toBe('Worth 3,400 cr');
    expect(said(phone, 'winner-line')).toBe('Mia wins with a Worth of 5,200 cr');
    expect(order(element(phone, 'scores'))).toEqual(['s2', 's1', 's3']);
    expect(text(phone)).not.toMatch(/points/i);
    expect(num(said(phone, 'part-total'))).toBe(HEIKO.worth);
  });
});
