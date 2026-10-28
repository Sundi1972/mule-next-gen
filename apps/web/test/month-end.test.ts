import { POLLUTION, UPKEEP } from '@mule/engine';
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
const FED: Condition = { foodShare: 1, sick: false, sickBecause: null, conditionPace: 1 };
/** A household with no working plot needs UPKEEP.baseFood; Kai held one unit of it. */
const KAI_NEED = UPKEEP.baseFood;
const KAI_SHORT: Condition = { foodShare: 1 / KAI_NEED, sick: false, sickBecause: null, conditionPace: 0.6 };

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
    lastAir: 27,
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

/** The air in Collapse: every worth is cut; Heiko's own lines show the cut. */
function collapse(): MuleView {
  const cutOf = (n: number) => Math.round(n * POLLUTION.collapseScore);
  const parts = { ...me.worthParts, cut: 3_400 - cutOf(3_400) };
  return view({
    air: { level: 84, band: 'collapse' },
    lastAir: 77,
    players: PLAYERS.map((p) => ({ ...p, worth: cutOf(p.worth) })),
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

/** A screen as Heiko's phone draws it, at a table with a TV (`boards` 1) or without. */
function onPhone(game: MuleView, screen: () => ReactElement, boards = 1): string {
  const table = { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards, game } as TableView<MuleView>;
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

  it("B-AC-12 (WS4, month end): in month 1 there is no last month, so no change is shown", () => {
    const first = view({ month: 1, lastAir: null, players: PLAYERS.map((p) => ({ ...p, lastWorth: null })) });
    for (const html of [onPhone(first, Results), onTv(first, TvMonthEnd)]) for (const p of PLAYERS) expect(said(html, `change-${p.id}`)).toBe('—');
  });

  it('B-AC-12 (WS4, month end): the TV names who went hungry, from the month’s condition, and the air against last month', () => {
    expect(said(tv, 'hungry-s3')).toBe(`Kai went hungry: ate 1 of ${KAI_NEED} Food`);
    expect(has(tv, 'hungry-s1')).toBe(false);
    expect(has(tv, 'nobody-hungry')).toBe(false);
    expect(said(tv, 'air-level')).toBe('34');
    expect(said(tv, 'air-trend')).toBe('↓ worse than month 3 (27 · Clean)');
    expect(said(tv, 'fund-balance')).toBe('640 cr');
    expect(said(tv, 'fund-month')).toContain('comes with the colony fund’s month');
    const fed = onTv(view({ players: PLAYERS.map((p) => ({ ...p, condition: FED })) }), TvMonthEnd);
    expect(said(fed, 'nobody-hungry')).toBe('✓ Nobody went hungry');
  });

  it('B-AC-12 (WS4, month end): your phone alone shows your own lines, and they add up to your Worth', () => {
    const lines = ['cash', 'goods', 'land', 'mules', 'offices'].map((k) => num(said(phone, `worth-cr-${k}`)));
    expect(lines.reduce((a, b) => a + b, 0)).toBe(HEIKO.worth);
    expect(num(said(phone, 'worth-total-cr'))).toBe(HEIKO.worth);
    expect(said(phone, 'worth-line-donations')).toContain('comes with G-5');
    for (const testid of ['your-worth', 'worth-line-', 'worth-cr-', 'part-']) expect(tv, `the TV carries no ${testid}`).not.toContain(`data-testid="${testid}`);
  });

  it('B-AC-12 (WS4, month end): beside a TV the phone leaves the colony to it; with no TV the phone carries the colony panel too', () => {
    expect(has(phone, 'phone-monthend')).toBe(true);
    expect(has(phone, 'colony-on-tv')).toBe(true);
    expect(has(phone, 'colony-panel')).toBe(false);
    const alone = onPhone(view(), Results, 0);
    expect(has(alone, 'phone-only-monthend')).toBe(true);
    expect(said(alone, 'hungry-s3')).toBe(`Kai went hungry: ate 1 of ${KAI_NEED} Food`);
    expect(said(alone, 'air-trend')).toBe('↓ worse than month 3 (27 · Clean)');
  });

  it('B-AC-13 (WS4, month end): the phone moves on with "On to month 5", which is Ready', () => {
    expect(text(element(phone, 'actions'))).toContain('On to month 5');
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
      expect(said(html, 'worth-s2')).toBe('4,160');
      expect(said(html, 'uncut-s2')).toBe('5,200');
      expect(said(html, 'uncut-s1')).toBe('3,400');
    }
  });

  it("B-AC-12 (WS4, month end): in Collapse the change is against last month's shown Worth, one rule", () => {
    for (const html of [phone, tv]) expect(said(html, 'change-s2')).toBe(`↓ −${(4_800 - 4_160).toLocaleString('en')}`);
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
