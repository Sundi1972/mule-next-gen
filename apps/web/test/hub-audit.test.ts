import { DEVELOPMENT, GAME, POLITICS, type TaxPromise } from '@mule/engine';
import type { ColonyView, ListingView, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { collapseCutWords } from '../src/game/month-end';
import { Planning } from '../src/phone/Planning';
import { roadmapSteps } from '../src/phone/hub/month-steps';
import { standingOf } from '../src/phone/hub/standing';
import { StandingsSheet } from '../src/phone/hub/Standings';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * The planning hub after the UX audit (WS6's approved mock HubAudit, H-1…H-9), as a player sees it rendered: the month's
 * steps (the roadmap, the needs and the ship are the "?" sheet's since SB-2: hub-help.test.ts), the drone's eye-slash, "2nd of 4" under the money and
 * the standings sheet, the ship in plain words, and the Now card folded. The static render has no width, so it draws
 * the phone's layout. What a tap does is hub-taps.test.ts; the TV's ranks are hub-tv-rank.test.ts.
 */

import { NO_GOODS, PLAYERS, LENAS_PARTS, OSSAS_PARTS, myView, CAP_4, POLITICS_4, LOT, month4 } from './fixtures/month4';

let state: unknown;
// The planning screen reads the table chat and the hub's shared state through useClientState, whose store has no
// server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function clientFor(game: MuleView, seatId: string): TableClient {
  state = { status: 'open', role: 'player', code: 'MULE', seatId, view: { game }, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  return {
    subscribe: () => () => {},
    getState: () => state,
    serverNow: () => 0,
    intent: () => {},
  } as unknown as TableClient;
}

/** A screen on `seatId`'s phone, as the game draws it there. */
function onPhone(game: MuleView, screen: ComponentType, seatId = 's1'): string {
  const self = game.players.find((p) => p.id === seatId)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  const value = { table, view: game, me: game.me!, self, slot: self.slot as Slot };
  return renderToStaticMarkup(createElement(ClientProvider, { client: clientFor(game, seatId), children: createElement(PhoneGameProvider, { value, children: createElement(screen) }) })).replaceAll('<!-- -->', '');
}

const hub = (game: MuleView, seatId = 's1') => onPhone(game, Planning, seatId);

/** The markup of the element carrying this data-testid, through its closing tag (the tags of its kind balanced). */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  const from = open!.index!;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = from + 1;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + m[0].length);
  }
  return html.slice(from);
}
/** Markup's text as the player reads it: tags stripped, the escaped characters back. */
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
const textOf = (html: string, testid: string) => plain(element(html, testid));
const has = (html: string, testid: string) => html.includes(`data-testid="${testid}"`);
/** "up to 2 free plots", "up to 1 free plot": the grant's claims, as config has them. */
const CLAIMS = `up to ${GAME.claimsPerGrant} free ${GAME.claimsPerGrant === 1 ? 'plot' : 'plots'}`;

describe("the month's steps (H-1)", () => {
  it('H-1: the month runs plan, land grant, land auction, develop, produce, goods auction, in that order, with a lot up', () => {
    expect(roadmapSteps({ listings: [LOT] }).map((s) => s.label)).toEqual(['Plan', 'Land grant', 'Land auction', 'Develop', 'Produce', 'Goods auction']);
  });

  it('H-1 (negative): a month with no lot has no land auction step', () => {
    expect(roadmapSteps({ listings: [] }).map((s) => s.id)).toEqual(['plan', 'grant', 'develop', 'produce', 'auction']);
  });

  it('H-1: an election month has the same steps: the vote is part of planning, not a step of its own', () => {
    const open = { ...POLITICS_4, election: { stage: 'ballot' as const, ceremony: null, candidates: { governor: [] }, promises: {}, voted: [], done: [], waitingFor: [], result: {} } };
    expect(roadmapSteps(month4({ politics: open }))).toEqual(roadmapSteps(month4()));
    expect(roadmapSteps(month4({ politics: open, listings: [LOT] })).map((s) => s.id)).toContain('land');
  });
});

describe('the planning hub, rendered (UX audit)', () => {





  it('H-3: "Only you" with the eye-slash marks the geo drone and My plots on the map tools; no lock is left on the screen', () => {
    const html = hub(month4());
    for (const id of ['tool-drone', 'tool-plots']) {
      expect(element(html, id), `${id}: said to a screen reader, in the one-row tool bar`).toContain('aria-label="Only you see this"');
      expect(element(html, id), `${id}: the eye-slash's strike`).toContain('d="M2 2l20 20"');
    }
    // The lock's body and shackle.
    expect(html).not.toMatch(/<rect x="5" y="11"/);
  });

  it('H-4: under your money the header says where you stand by Worth, "2nd of 4", not by money', () => {
    const html = hub(month4());
    const standing = element(html, 'standing');
    expect(standing).toMatch(/^<button/);
    expect(textOf(standing, 'money')).toBe('1,000 cr');
    expect(textOf(standing, 'standing-rank')).toBe('2nd of 4');
    expect(standing.replaceAll('&#x27;', "'")).toMatch(/aria-label="1,000 cr\. You're 2nd of 4\. Open the standings\."/);
    expect(textOf(hub(month4(), 's2'), 'standing-rank'), "Ossa's phone").toBe('1st of 4');
    // A tie: Lena level with Ossa, both lead, on both phones.
    const level = PLAYERS.map((p) => (p.id === 's1' ? { ...p, worth: 5_600 } : p));
    expect(textOf(hub(month4({ players: level })), 'standing-rank'), "Lena's phone, level").toBe('1st of 4');
    expect(textOf(hub(month4({ players: level }, myView('s2')), 's2'), 'standing-rank'), "Ossa's phone, level").toBe('1st of 4');
  });

  it("H-4: the standings sheet lists every player's Worth, best first, and your own Worth line by line", () => {
    const sheet = onPhone(month4(), () => createElement(StandingsSheet, { onClose: () => {} }));
    const rows = [...element(sheet, 'standings-table').matchAll(/data-testid="standing-(s\d)"/g)].map((m) => m[1]);
    expect(rows).toEqual(['s2', 's1', 's4', 's3']);
    expect(textOf(sheet, 'standing-s2')).toBe('1Ossa5,600 cr');
    expect(textOf(sheet, 'standing-s1')).toBe('2You (Lena)2,800 cr');
    expect(textOf(sheet, 'standings-rule'), 'out of Collapse, no cut').not.toContain('cut by');
    expect(textOf(sheet, 'standings-mine')).toBe(`Your worthOnly youCash1,000Goods · 6 units600Land · 3 × ${GAME.plotScore}900MULEs · 2 × 150300Offices · 0 terms × ${POLITICS.termScore}0Your worth2,800`);
  });

  it("H-4 (negative): another player's phone shows your Worth as one number and their own lines, never yours; nobody's goods show", () => {
    const ossas = onPhone(month4({}, myView('s2', { stock: NO_GOODS })), () => createElement(StandingsSheet, { onClose: () => {} }), 's2');
    expect(textOf(ossas, 'standing-s1')).toBe('2Lena2,800 cr');
    expect(textOf(ossas, 'standings-mine')).toContain('Cash4,000');
    expect(textOf(ossas, 'standings-mine')).not.toContain('6 units');
    expect(textOf(ossas, 'standings-mine')).toContain('Your worth5,600');
    // No good is named anywhere in the sheet: the goods line is a value, not what is held.
    expect(textOf(ossas, 'standings-sheet')).not.toMatch(/Food|Energy|Water|Smithore|Crystite/);
  });

  it('H-4: in Collapse your lines carry the cut, and they add up to your Worth', () => {
    // Before the cut: 1,000 + 600 + 900 + 300 = 2,800; the fifth off it, 560, leaves 2,240.
    const cut: MyView['worthParts'] = { ...LENAS_PARTS, cut: 560 };
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, worth: 2_240, worthBeforeCut: 2_800 } : p));
    const sheet = onPhone(month4({ players, air: { level: 97, band: 'collapse' } }, myView('s1', { worthParts: cut })), () => createElement(StandingsSheet, { onClose: () => {} }));
    const mine = element(sheet, 'standings-mine');
    const lines = [...mine.matchAll(/<span class="flex justify-between gap-3[^"]*"><span>(.*?)<\/span><span[^>]*>(.*?)<\/span><\/span>/g)].map((m) => [plain(m[1]!), plain(m[2]!)] as const);
    const labels = lines.map(([label]) => label);
    expect(labels).toEqual(['Cash', 'Goods · 6 units', `Land · 3 × ${GAME.plotScore}`, 'MULEs · 2 × 150', `Collapse cut · ${collapseCutWords()}`, `Offices · 0 terms × ${POLITICS.termScore}, cut too`, 'Your worth']);
    // The rule says why, in the month end's words.
    expect(textOf(sheet, 'standings-rule')).toContain(`Every Worth is cut by ${collapseCutWords()}, offices too: the scores if the game ended now.`);
    const cr = (s: string) => (s.startsWith('−') ? -1 : 1) * Number(s.replace(/[^0-9]/g, ''));
    const parts = lines.slice(0, -1).map(([, v]) => cr(v));
    expect(parts).toEqual([1_000, 600, 900, 300, -560, 0]);
    expect(element(mine, 'standings-cut')).toMatch(/text-alert/);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(cr(lines.at(-1)![1]));
    expect(cr(lines.at(-1)![1])).toBe(2_240);
  });

  /** A game with a colony (politics on): what the standings need of it is only that it exists. */
  const COLONY: ColonyView = {
    gauges: { wealth: 20_000, environment: 30, prestige: 2, happiness: 60, band: 'content' },
    lastGauges: null,
    fund: 400,
    ledger: null,
    projects: [],
    catalogue: [],
    score: null,
  };
  /** Each line of your Worth as the sheet draws it: label and credits. */
  const yourLinesIn = (sheet: string) =>
    [...element(sheet, 'standings-mine').matchAll(/<span class="flex justify-between gap-3[^"]*"><span>(.*?)<\/span><span[^>]*>(.*?)<\/span><\/span>/g)].map((m) => [plain(m[1]!), plain(m[2]!)] as const);
  const credits = (s: string) => (s.startsWith('−') ? -1 : 1) * Number(s.replace(/[^0-9]/g, ''));

  it('H-4 (G-5 AM-12): in a colony game your lines carry what you gave the colony, Donations, and they add up to your Worth', () => {
    // Lena gave 250 to the colony's projects: 2,800 + 250 = 3,050.
    const gave: MyView['worthParts'] = { ...LENAS_PARTS, donated: 250 };
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, worth: 3_050 } : p));
    const sheet = onPhone(month4({ players, colony: COLONY }, myView('s1', { worthParts: gave })), () => createElement(StandingsSheet, { onClose: () => {} }));
    const lines = yourLinesIn(sheet);
    expect(lines.map(([label]) => label)).toEqual(['Cash', 'Goods · 6 units', `Land · 3 × ${GAME.plotScore}`, 'MULEs · 2 × 150', `Offices · 0 terms × ${POLITICS.termScore}`, 'Donations', 'Your worth']);
    const parts = lines.slice(0, -1).map(([, v]) => credits(v));
    expect(parts.at(-1)).toBe(250);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(credits(lines.at(-1)![1]));
    expect(credits(lines.at(-1)![1])).toBe(3_050);
    expect(textOf(sheet, 'standings-rule')).toContain('donations to the colony');
  });

  it('H-4 (G-5 AM-12): in Collapse the Donations line is cut too, and the lines still add up', () => {
    // Before the cut: 2,800 + 250 = 3,050; the fifth off it, 610, leaves 2,440.
    const parts: MyView['worthParts'] = { ...LENAS_PARTS, donated: 250, cut: 610 };
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, worth: 2_440, worthBeforeCut: 3_050 } : p));
    const sheet = onPhone(month4({ players, colony: COLONY, air: { level: 97, band: 'collapse' } }, myView('s1', { worthParts: parts })), () => createElement(StandingsSheet, { onClose: () => {} }));
    const lines = yourLinesIn(sheet);
    expect(lines.map(([label]) => label).slice(-3)).toEqual([`Offices · 0 terms × ${POLITICS.termScore}, cut too`, 'Donations, cut too', 'Your worth']);
    expect(lines.slice(0, -1).reduce((sum, [, v]) => sum + credits(v), 0)).toBe(2_440);
    expect(textOf(sheet, 'standings-rule')).toContain('offices and donations too');
  });

  it('H-4 (G-5 AM-12, negative): a game without a colony has no Donations line: nobody can give', () => {
    const sheet = onPhone(month4({ colony: null }), () => createElement(StandingsSheet, { onClose: () => {} }));
    expect(textOf(sheet, 'standings-mine')).not.toContain('Donations');
    expect(textOf(sheet, 'standings-rule'), 'the rule names no line the sheet does not draw').not.toMatch(/donation/i);
  });


});

describe("your place, by Worth (H-4's rank)", () => {
  const at = (worths: number[]) => aMuleView({ players: worths.map((worth, i) => aPlayer({ id: `p${i}`, name: `P${i}`, slot: i, worth, money: 10_000 - i })), me: null, politics: null });
  it.each<[string, number[], string[]]>([
    ['no tie: each its own place', [2_000, 5_000, 1_000, 3_000], ['3rd of 4', '1st of 4', '4th of 4', '2nd of 4']],
    ['two share first: both 1st, the next is 3rd', [5_000, 5_000, 1_000, 3_000], ['1st of 4', '1st of 4', '4th of 4', '3rd of 4']],
    ['two share second: the next is 4th', [5_000, 3_000, 3_000, 1_000], ['1st of 4', '2nd of 4', '2nd of 4', '4th of 4']],
    ['everyone level: all 1st', [700, 700, 700], ['1st of 3', '1st of 3', '1st of 3']],
  ])('H-4: %s', (_, worths, labels) => {
    const view = at(worths);
    expect(view.players.map((p) => standingOf(view, p.id).label)).toEqual(labels);
  });
});
