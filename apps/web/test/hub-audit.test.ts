import { DEVELOPMENT, GAME, POLITICS, type TaxPromise } from '@mule/engine';
import type { ListingView, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { Planning } from '../src/phone/Planning';
import { roadmapSteps } from '../src/phone/hub/month-steps';
import { standingOf } from '../src/phone/hub/standing';
import { StandingsSheet } from '../src/phone/hub/Standings';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * The planning hub after the UX audit (WS6's approved mock HubAudit, H-1…H-9), as a player sees it rendered: the month
 * roadmap with the offices folded in under it, the needs strip, the drone's eye-slash, "2nd of 4" under the money and
 * the standings sheet, the ship in plain words, and the Now card folded. The static render has no width, so it draws
 * the phone's layout. What a tap does is hub-taps.test.ts; the TV's ranks are hub-tv-rank.test.ts.
 */

const NO_GOODS = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

/** Ossa leads by Worth, Lena is second, then the two AIs: Lena's money (1,000) is not what ranks her. */
const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, money: 1_000, worth: 2_800, plots: 3 }),
  aPlayer({ id: 's2', name: 'Ossa', slot: 1, money: 4_000, worth: 5_600, plots: 4 }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, isAi: true, money: 1_500, worth: 1_900 }),
  aPlayer({ id: 's4', name: 'Brix', slot: 3, isAi: true, money: 900, worth: 2_100 }),
];

/** Lena's own lines: 1,000 cash + 600 of goods (6 units) + 3 plots + 2 MULEs, no office. They add up to her 2,800. */
const LENAS_PARTS: MyView['worthParts'] = { money: 1_000, goods: 600, plots: 3, land: 3 * GAME.plotScore, mules: 2, muleValue: 300, office: 0, cut: 0 };
/** Ossa's, on her own phone: they add up to her 5,600. */
const OSSAS_PARTS: MyView['worthParts'] = { money: 4_000, goods: 0, plots: 4, land: 4 * GAME.plotScore, mules: 2, muleValue: 400, office: 0, cut: 0 };

function myView(id: string, extra: Partial<MyView> = {}): MyView {
  return {
    id,
    species: 'zipwing',
    // Short of Food (2 of 5), enough Energy (3 of 2) and Water (1 of 1).
    stock: { ...NO_GOODS, food: 2, energy: 3, water: 1 },
    carriedMule: null,
    installedThisTurn: false,
    worthParts: id === 's1' ? LENAS_PARTS : OSSAS_PARTS,
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 5, water: 1 },
    monthNeeds: { ...NO_GOODS, food: 5, energy: 2, water: 1 },
    devEndsAt: null,
    devSeconds: 50,
    produced: null,
    mulePrice: 150,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
    droneOrder: [],
    politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, paid: 0, reputation: 50 },
    ...extra,
  };
}

const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };
/** Month 4 after its election: Ossa Governor until month 6 on a promise of up to 4%, the tax at 4%. */
const POLITICS_4: PoliticsView = {
  governor: 's2',
  sheriff: null,
  term: [4, 6],
  next: 7,
  baron: null,
  tax: { percent: 4, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50, sheriff: 30 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: [], sheriff: [] },
  promises: {},
  promise: CAP_4,
  promiseFrom: 5,
  election: null,
};

const LOT: ListingView = { id: 'plot-3-4', seller: 's4', item: { kind: 'plot', x: 3, y: 4 }, minimum: 160, unsold: 'store', storePays: 100 };

function month4(extra: Partial<MuleView> = {}, me: MyView = myView('s1')): MuleView {
  return aMuleView({ month: 4, players: PLAYERS, me, mulePrice: 150, treasury: { money: 0, salesTax: 0.04 }, politics: POLITICS_4, ...extra });
}

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
  it("H-1: the stage opens on the month's roadmap: its steps in order with Plan lit, one now/next line, the offices line under it", () => {
    const html = hub(month4({ listings: [LOT] }));
    const roadmap = element(html, 'roadmap');
    const steps = [...roadmap.matchAll(/data-testid="step-([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['plan', 'grant', 'land', 'develop', 'produce', 'auction']);
    expect(element(roadmap, 'step-plan')).toMatch(/aria-current="step"/);
    expect(roadmap.match(/aria-current="step"/g), 'only this step is lit').toHaveLength(1);
    expect(roadmap).toMatch(/aria-label="Month 4: step 1 of 6, planning"/);
    expect(textOf(roadmap, 'roadmap-now')).toBe(`Now: look around, scout land if you like, then press Ready. Next: you claim up to ${GAME.claimsPerGrant} free plots.`);
    // WS7's offices line, its words as it builds them, folded in under the roadmap rather than a banner of its own.
    expect(textOf(roadmap, 'roadmap-offices')).toBe('Governor: Ossa, until month 6 · promised up to 4% · tax 4%, kept · Next election: month 7');
    expect(html.match(/data-testid="roadmap-offices"/g), 'drawn once').toHaveLength(1);
    // The roadmap comes first on the stage, then the needs, then This month.
    const stage = element(html, 'stage');
    expect(stage.indexOf('data-testid="roadmap"')).toBeLessThan(stage.indexOf('data-testid="needs-strip"'));
    expect(stage.indexOf('data-testid="needs-strip"')).toBeLessThan(stage.indexOf('data-testid="agenda"'));
  });

  it('H-1 (negative): with no lot this month the roadmap draws no land auction step', () => {
    const roadmap = element(hub(month4()), 'roadmap');
    expect(roadmap).not.toContain('data-testid="step-land"');
    expect(roadmap).not.toContain('Land auction');
    expect(roadmap).toMatch(/aria-label="Month 4: step 1 of 5, planning"/);
  });

  it("H-1: once you're ready the now line says the rest are still planning", () => {
    const ready = PLAYERS.map((p) => (p.id === 's1' ? { ...p, ready: true } : p));
    expect(textOf(hub(month4({ players: ready })), 'roadmap-now')).toBe(`Now: you're ready; the rest are still planning. Next: the land grant, where you claim up to ${GAME.claimsPerGrant} free plots.`);
  });

  it('H-2: the stage says "This month you need" with each of Food, Energy and Water against what you hold, red where short', () => {
    const strip = element(hub(month4()), 'needs-strip');
    expect(strip).toMatch(/^<button/);
    expect(textOf(strip, 'needs-strip')).toMatch(/^This month you need/);
    expect([...strip.matchAll(/data-testid="strip-([a-z]+)"/g)].map((m) => m[1])).toEqual(['food', 'energy', 'water']);
    expect(textOf(strip, 'strip-food')).toBe('Food2 of 5short 3');
    expect(element(strip, 'strip-food')).toMatch(/text-alert/);
    expect(textOf(strip, 'strip-energy')).toBe('Energy3 of 2✓');
    expect(element(strip, 'strip-energy')).not.toMatch(/text-alert/);
    expect(strip.match(/<button[^>]*>/)![0]).toMatch(/border-alert/);
    expect(strip).toMatch(/aria-label="This month you need: Food, 2 of 5, short 3; Energy, 3 of 2; Water, 1 of 1\. Opens the Colony desk\."/);
  });

  it('H-2 (negative): with nothing short the strip shows no red', () => {
    const fed = myView('s1', { stock: { ...NO_GOODS, food: 5, energy: 3, water: 1 } });
    const strip = element(hub(month4({}, fed)), 'needs-strip');
    expect(strip).not.toMatch(/alert/);
    expect(strip).not.toContain('short');
    expect(strip.match(/✓/g)).toHaveLength(3);
  });

  it('H-3: "Only you" with the eye-slash marks the geo drone, in This month and on the map tools; no lock is left on the screen', () => {
    const html = hub(month4());
    for (const id of ['agenda-drone', 'tool-drone']) {
      expect(textOf(html, id), id).toContain('Only you');
      expect(element(html, id), `${id}: the eye-slash's strike`).toContain('d="M2 2l20 20"');
    }
    // The lock's body and shackle.
    expect(html).not.toMatch(/<rect x="5" y="11"/);
    expect(textOf(html, 'agenda-drone')).toContain(`${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`);
  });

  it('H-4: under your money the header says where you stand by Worth, "2nd of 4", not by money', () => {
    const html = hub(month4());
    const standing = element(html, 'standing');
    expect(standing).toMatch(/^<button/);
    expect(textOf(standing, 'money')).toBe('1,000 cr');
    expect(textOf(standing, 'standing-rank')).toBe('2nd of 4');
    expect(standing.replaceAll('&#x27;', "'")).toMatch(/aria-label="1,000 cr\. You're 2nd of 4\. Open the standings\."/);
    expect(textOf(hub(month4(), 's2'), 'standing-rank'), "Ossa's phone").toBe('1st of 4');
  });

  it("H-4: the standings sheet lists every player's Worth, best first, and your own Worth line by line", () => {
    const sheet = onPhone(month4(), () => createElement(StandingsSheet, { onClose: () => {} }));
    const rows = [...element(sheet, 'standings-table').matchAll(/data-testid="standing-(s\d)"/g)].map((m) => m[1]);
    expect(rows).toEqual(['s2', 's1', 's4', 's3']);
    expect(textOf(sheet, 'standing-s2')).toBe('1Ossa5,600 cr');
    expect(textOf(sheet, 'standing-s1')).toBe('2You (Lena)2,800 cr');
    expect(textOf(sheet, 'standings-mine')).toBe(`Your worthOnly youCash1,000Goods · 6 units600Land · 3 × ${GAME.plotScore}900MULEs · 2 × 150300Offices · 0 × ${POLITICS.termScore}0Your worth2,800`);
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

  it("H-6: the ship's line is plain words, and no code is left on this screen", () => {
    const html = hub(month4({ ship: { arrives: 6, inPort: false, wants: null } }));
    expect(textOf(html, 'ship-line')).toBe('Export ship in month 6: it buys the colony’s leftovers');
    expect(html).not.toMatch(/EXPORT SHIP|export ship in month|· month 4</);
    expect(html).not.toMatch(/\bM\d+–\d+\b|NEXT ELECTION M\d/);
  });
});

describe('room on the phone (H-7, H-9)', () => {
  it('H-7: the desk tabs sit on one row', () => {
    const tabs = element(hub(month4()), 'desks');
    expect(tabs.match(/<div[^>]*>/)![0]).toMatch(/class="flex /);
    expect(tabs.match(/<div[^>]*>/)![0]).not.toMatch(/flex-wrap|grid-cols-[1-3]\b/);
  });

  it("H-7: on a phone the map's tools stand beside the map, in one row with it", () => {
    const html = hub(month4());
    const row = element(html, 'tools-and-map');
    expect(row).toContain('data-testid="map-tools"');
    expect(row).toContain('data-testid="hub-map"');
    expect(row.match(/<div[^>]*>/)![0]).toMatch(/class="flex [^"]*@min-\[1100px\]\/shell:flex-col/);
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
