// A browser's document before react-dom loads: the month-end opener and the drift are decided in effects and timers.
import { document, FakeElement } from './fake-dom';
import type { ColonyProjectView, ColonyView, MuleView, MyView, PoliticsView, TableView } from '@mule/protocol';
import { COLONY_SCORE, EVENT_SHOW } from '@mule/engine';
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { GameOver } from '../src/phone/GameOver';
import { Results } from '../src/phone/Results';
import { ColonyPanel, LeagueTable } from '../src/components/MonthEnd';
import { TableApp, TvGameOver, TvHeader, TvMonthEnd } from '../src/table/TableApp';
import { BuildSite } from '../src/components/Colony';
import { aMuleView, aPlayer } from './fixtures/views';

// The theme reads the page's dataset, which the server renders below read too.
Object.assign(document.documentElement, { dataset: {} });

/**
 * The colony's screens (C34), from views the server could send: the four gauges in the TV header, the build site at the
 * month end, and the colony's score with who gave most at game over. Without politics every screen is today's.
 */

const PLAYERS = [
  aPlayer({ id: 's1', name: 'Heiko', slot: 0, worth: 6_420, lastWorth: 6_100 }),
  aPlayer({ id: 's2', name: 'Mia', slot: 1, species: 'bramblet', worth: 7_050, lastWorth: 6_600 }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, species: 'gearling', worth: 4_980, lastWorth: 5_020 }),
  aPlayer({ id: 's4', name: 'Ruth', slot: 3, species: 'mollox', isAi: true, worth: 5_610, lastWorth: 5_300 }),
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

function project(over: Partial<ColonyProjectView> & Pick<ColonyProjectView, 'id' | 'name' | 'stage'>): ColonyProjectView {
  return {
    cost: { credits: 1_400, goods: { alloy: 4, electronics: 2 } },
    funded: { credits: 1_400, goods: { alloy: 4, electronics: 2 } },
    buildMonths: 3,
    monthsLeft: null,
    place: null,
    prestige: 4,
    upkeep: 70,
    repairCost: null,
    plaque: [],
    ...over,
  };
}

const STADIUM = project({
  id: 'stadium',
  name: 'Stadium',
  stage: 'commissioned',
  funded: { credits: 860, goods: { alloy: 4, electronics: 1 } },
  plaque: [
    { playerId: 's2', value: 300 },
    { playerId: 's4', value: 120 },
  ],
});
const HOSPITAL = project({ id: 'hospital', name: 'Hospital', stage: 'building', buildMonths: 2, monthsLeft: 1, prestige: 3, plaque: [{ playerId: 's1', value: 200 }] });
const PARK = project({ id: 'park', name: 'Park', stage: 'standing', prestige: 2, upkeep: 30, plaque: [{ playerId: 's2', value: 150 }] });
const CLOSED = project({ id: 'observatory', name: 'Observatory', stage: 'closed', prestige: 3, upkeep: 50 });
const DAMAGED = project({ id: 'spaceport', name: 'Spaceport upgrade', stage: 'damaged', prestige: 5, repairCost: 500 });

const MIDGAME: ColonyView = {
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 64, band: 'content' },
  lastGauges: { wealth: 24_900, prestige: 2, happiness: 58 },
  fund: 2_340,
  ledger: null,
  projects: [STADIUM, HOSPITAL, PARK, CLOSED, DAMAGED],
  catalogue: [],
  score: null,
};

/** Game over: Heiko gave to the stadium and the hospital, Mia to the stadium and the park, Kai to nothing. */
const FINAL: ColonyView = {
  ...MIDGAME,
  gauges: { wealth: 31_200, environment: 38, prestige: 14, happiness: 71, band: 'content' },
  projects: [
    { ...STADIUM, stage: 'standing', plaque: [{ playerId: 's2', value: 300 }, { playerId: 's1', value: 250 }, { playerId: 's4', value: 120 }] },
    { ...HOSPITAL, stage: 'standing', monthsLeft: null },
    PARK,
  ],
  score: { wealth: 62, environment: 31, prestige: 14, factor: 1.08, total: 116 },
};

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

function game(colony: ColonyView | null | undefined, over: Partial<MuleView> = {}): MuleView {
  return aMuleView({
    players: PLAYERS,
    me: ME,
    politics: null,
    month: 7,
    phase: 'upkeep',
    air: { level: 38, band: 'smoggy' },
    lastAir: { level: 35, band: 'smoggy' },
    ...(colony === undefined ? {} : { colony }),
    ...over,
  });
}

const over = (colony: ColonyView | null | undefined, extra: Partial<MuleView> = {}) =>
  game(colony, { finished: true, phase: 'gameOver', month: 12, scores: PLAYERS.map((p) => ({ id: p.id, score: p.worth })), ...extra });

function onPhone(view: MuleView, boards = 1, screen: () => ReactElement = GameOver): string {
  const table = { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards, game: view } as TableView<MuleView>;
  const value = { table, view, me: view.me!, self: view.players[0]!, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(screen) }) }));
}

function onTv(view: MuleView, screen: (props: { game: MuleView }) => ReactElement): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(screen, { game: { ...view, me: null } }) }));
}

// The server renderer has no getServerSnapshot for the client's store, so the router reads its state from here (as hub-tv-rank does).
let boardState: unknown = null;
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => boardState }));

/** The router's state: a board's view of the room with this game. */
function onTvRouterState(view: MuleView): void {
  const game = { ...view, me: null };
  const table = { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards: 1, game } as unknown as TableView<MuleView>;
  boardState = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
}

/** The TV as the table drives it: TableApp's router over a board's view of the room. */
function onTvRouter(view: MuleView): string {
  onTvRouterState(view);
  return renderToStaticMarkup(createElement(ClientProvider, { client: { ...client, watch: () => {} } as unknown as TableClient, children: createElement(TableApp, { room: 'MULE' }) }));
}

const header = (view: MuleView) => onTv(view, ({ game: g }) => createElement(TvHeader, { game: g, title: 'Planning' }));

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

const COLONY_IDS = ['colony-gauges', 'colony-band', 'colony-score', 'colony-total', 'colony-score-pending', 'score-sum', 'plaque-board', 'phone-colony-score', 'build-site', 'your-plaques'];

describe('C34: the colony at game over', () => {
  it('UBER-AC-7 / B-AC-34-1: the TV shows the colony score, the sum that made it, and who gave most, largest first', () => {
    const tv = onTv(over(FINAL), TvGameOver);
    expect(said(tv, 'colony-total')).toBe('116');
    const sum = said(tv, 'score-sum');
    for (const term of ['62', '31', '14', '1.08', 'Content']) expect(sum).toContain(term);
    const rows = [...element(tv, 'plaque-board').matchAll(/data-testid="plaques-(s\d)"/g)].map((m) => m[1]);
    expect(rows).toEqual(['s1', 's2', 's4', 's3']);
    expect(said(tv, 'plaques-s1')).toContain('450 cr');
    expect(said(tv, 'plaques-s2')).toContain('450 cr');
    expect(said(tv, 'plaques-s3')).toContain('no plaques');
    expect(said(tv, 'tv-winner')).toMatch(/^The game goes to Mia wins with a Worth of 7,050 cr$/);
    // The verdict reads the score on its credit scale (RULE-25), at the thresholds engine config sets.
    const { proud, held } = COLONY_SCORE.verdict;
    const verdictAt = (total: number) => said(onTv(over({ ...FINAL, score: { ...FINAL.score!, total } }), TvGameOver), 'colony-verdict');
    for (const [total, verdict] of [
      [proud, 'A colony to be proud of'],
      [proud - 1, 'A colony that held together'],
      [held, 'A colony that held together'],
      [held - 1, 'A colony in ruins'],
      [116, 'A colony in ruins'], // a total on the placeholders' scale is no longer proud
    ] as const) expect(verdictAt(total), `score ${total}`).toBe(verdict);
  });

  it('UBER-AC-7 / B-AC-34-1: in Collapse the TV’s colony band carries the failed colony in alert above the score; passed, it has no verdict lines', () => {
    const band = element(onTv(over(FINAL, { air: { level: 86, band: 'collapse' } }), TvGameOver), 'colony-band');
    expect(band).toContain('data-failed="true"');
    expect(band).toContain('border-alert');
    expect(band).toContain('bg-alert-bg');
    expect(said(band, 'verdict-title')).toBe('The colony failed');
    expect(said(band, 'verdict-line')).toBe('The air ended in Collapse. The Federation cuts every score by a fifth.');
    expect(band.indexOf('data-testid="verdict-title"')).toBeLessThan(band.indexOf('data-testid="colony-total"'));
    // A failed colony is never also "a colony to be proud of": the score's own verdict goes, and its total is in alert.
    expect(has(band, 'colony-verdict')).toBe(false);
    expect(band).toMatch(/text-alert-ink[^"]*" data-testid="colony-total"/);
    const passed = element(onTv(over(FINAL), TvGameOver), 'colony-band');
    expect(passed).toContain('data-failed="false"');
    expect(passed).not.toContain('border-alert');
    expect(has(passed, 'verdict-title')).toBe(false);
    expect(has(passed, 'verdict-line')).toBe(false);
  });

  it('B-AC-34-2: beside a TV the phone shows the colony score card in the verdict card’s place, with your plaques', () => {
    const phone = onPhone(over(FINAL));
    expect(has(phone, 'phone-colony-score')).toBe(true);
    expect(element(phone, 'phone-colony-score')).toContain('data-failed="false"');
    expect(has(phone, 'verdict')).toBe(false);
    expect(said(phone, 'colony-total')).toBe('116');
    expect(said(phone, 'your-plaques')).toBe('Your plaques: Stadium, Hospital · 450 cr given');
  });

  it('B-AC-34-2: in Collapse the phone’s colony card carries the failed colony in alert, with the verdict’s title and line', () => {
    const phone = onPhone(over(FINAL, { air: { level: 86, band: 'collapse' } }));
    const card = element(phone, 'phone-colony-score');
    expect(card).toContain('data-failed="true"');
    expect(card).toContain('border-alert');
    expect(said(card, 'verdict-title')).toBe('The colony failed');
    expect(said(card, 'verdict-line')).toBe('The air ended in Collapse. The Federation cuts every score by a fifth.');
  });

  it('B-AC-34-6: before the score is counted, game over shows the pending line and the plaques, and no total', () => {
    const pending = { ...FINAL, score: null };
    const tv = onTv(over(pending), TvGameOver);
    const phone = onPhone(over(pending));
    for (const html of [tv, phone]) {
      expect(said(html, 'colony-score-pending')).toBe('The colony’s score is counted at game over');
      expect(has(html, 'colony-total')).toBe(false);
      expect(has(html, 'score-sum')).toBe(false);
    }
    expect(has(tv, 'colony-band')).toBe(true);
    expect(has(tv, 'plaque-board')).toBe(true);
  });

  it('B-AC-34-5 (negative): without politics game over on the TV and the phone is today’s, colony null or absent alike', () => {
    for (const colony of [null, undefined]) {
      const tv = onTv(over(colony), TvGameOver);
      const phone = onPhone(over(colony));
      for (const id of COLONY_IDS) {
        expect(has(tv, id), `the TV has no ${id}`).toBe(false);
        expect(has(phone, id), `the phone has no ${id}`).toBe(false);
      }
      expect(element(tv, 'tv-winner')).toContain('animate-pulse-glow');
      expect(has(tv, 'tv-verdict')).toBe(true);
      expect(said(phone, 'verdict')).toContain('The colony passed');
    }
    expect(onTv(over(null), TvGameOver)).toBe(onTv(over(undefined), TvGameOver));
    expect(onPhone(over(null))).toBe(onPhone(over(undefined)));
  });
});

describe('C34 / N-6: a shared win at game over, with the colony band', () => {
  const marks = (tv: string) => [...element(element(tv, 'tv-winner'), 'winner-marks').matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  const sizes = (tv: string) => [...element(element(tv, 'tv-winner'), 'winner-marks').matchAll(/role="img"[^>]*style="width:(\d+)px/g)].map((m) => Number(m[1]));
  /** Heiko catches Mia on 7,050: they share the win. */
  const level = (players: typeof PLAYERS) => over(FINAL, { players, scores: players.map((p) => ({ id: p.id, score: p.worth })) });

  it('N-6: the colony TV names both winners and draws a mark for each, as the TV without a colony does', () => {
    const tv = onTv(level(PLAYERS.map((p) => (p.id === 's1' ? { ...p, worth: 7_050 } : p))), TvGameOver);
    expect(said(element(tv, 'tv-winner'), 'winner-line')).toBe('Heiko and Mia share the win, each with a Worth of 7,050 cr');
    expect(marks(tv)).toEqual(['Heiko', 'Mia']);
    expect(sizes(tv), 'two marks, one size, smaller than a sole winner\'s').toEqual([64, 64]);
    expect(has(tv, 'colony-band'), 'the band stays under it').toBe(true);
  });

  it('N-6: three or more level winners get a mark each, smaller again, two abreast so they wrap inside the card', () => {
    const tv = onTv(level(PLAYERS.map((p) => (p.id === 's1' || p.id === 's3' ? { ...p, worth: 7_050 } : p))), TvGameOver);
    expect(marks(tv)).toEqual(['Heiko', 'Mia', 'Kai']);
    expect(sizes(tv)).toEqual([48, 48, 48]);
    const all = onTv(level(PLAYERS.map((p) => ({ ...p, worth: 7_050 }))), TvGameOver);
    expect(marks(all)).toEqual(['Heiko', 'Mia', 'Kai', 'Ruth']);
    // Two 48 px marks and their gap fit its 9rem; a third wraps, so four winners take two rows, never the line's width.
    expect(element(element(all, 'tv-winner'), 'winner-marks')).toMatch(/class="[^"]*\bmax-w-36\b[^"]*\bflex-wrap\b/);
  });

  it('N-6 (negative): a sole winner keeps one mark, at its full size', () => {
    const tv = onTv(over(FINAL), TvGameOver);
    expect(marks(tv)).toEqual(['Mia']);
    expect(sizes(tv)).toEqual([88]);
    expect(said(element(tv, 'tv-winner'), 'winner-line')).toBe('Mia wins with a Worth of 7,050 cr');
  });
});

describe('C34: the four gauges in the TV header', () => {
  it('B-AC-34-3: the header shows wealth, environment, prestige and happiness in the air gauge’s place', () => {
    const html = header(game(MIDGAME));
    const gauges = element(html, 'colony-gauges');
    expect(said(gauges, 'gauge-wealth')).toBe('Wealth 26,400 cr fund 2,340 cr');
    expect(said(gauges, 'gauge-environment')).toBe('Environment 34 Smoggy');
    expect(said(gauges, 'gauge-prestige')).toBe('Prestige 2 1 standing');
    expect(said(gauges, 'gauge-happiness')).toBe('Happiness 64 Content ↑ 6 this month');
    expect(text(html)).not.toContain('Colony air');
  });

  it('B-AC-34-3: before the colony has a mood, happiness reads "—" with no bar, and "not yet"', () => {
    const moodless = { ...MIDGAME, gauges: { ...MIDGAME.gauges, happiness: null, band: null }, lastGauges: { ...MIDGAME.lastGauges!, happiness: null } };
    const gauge = element(header(game(moodless)), 'gauge-happiness');
    expect(text(gauge)).toBe('Happiness — not yet');
    expect(gauge).not.toContain('style="width');
  });

  it('B-AC-34-3 (negative): without politics there are no gauges and today’s air gauge stays', () => {
    for (const colony of [null, undefined]) {
      const html = header(game(colony));
      expect(has(html, 'colony-gauges')).toBe(false);
      expect(text(html)).toContain('Colony air');
    }
  });
});

describe("C34: the build site on the phones' Colony desk", () => {
  const desk = renderToStaticMarkup(createElement(BuildSite, { colony: MIDGAME, players: PLAYERS, size: 'phone' }));
  const row = (id: string) => element(desk, `project-${id}`);

  it('B-AC-34-4: one row per project, each at its stage', () => {
    const stages = [...element(desk, 'build-site').matchAll(/data-testid="project-([a-z]+)" data-stage="([a-z]+)"/g)].map((m) => [m[1], m[2]]);
    expect(stages).toEqual([
      ['stadium', 'commissioned'],
      ['hospital', 'building'],
      ['park', 'standing'],
      ['observatory', 'closed'],
      ['spaceport', 'damaged'],
    ]);
  });

  it('B-AC-34-4: a collecting project shows its funding bar and each good against its need', () => {
    expect(has(row('stadium'), 'funding-stadium')).toBe(true);
    expect(said(row('stadium'), 'need-stadium-alloy')).toBe('4/4');
    expect(said(row('stadium'), 'need-stadium-electronics')).toBe('1/2');
    expect(said(row('stadium'), 'plaque-stadium')).toBe('Plaque Mia 300 cr Ruth 120 cr');
  });

  it('B-AC-34-4: a building project shows its months as pips', () => {
    expect(element(row('hospital'), 'build-hospital')).toContain('aria-label="1 of 2 months built"');
  });

  it('B-AC-34-4: a standing project shows its perk', () => {
    expect(text(row('park'))).toContain('Volunteer clean-ups come more often · upkeep 30 cr a month');
  });

  it('B-AC-34-4: a closed or damaged project is in alert, its prestige struck through; the damaged line names the repair cost', () => {
    for (const id of ['observatory', 'spaceport']) {
      expect(element(row(id), `stage-${id}`)).toContain('text-alert');
      expect(element(row(id), `prestige-${id}`)).toContain('line-through');
    }
    expect(text(row('spaceport'))).toContain('Damaged in the riot: counts 0 until the Governor repairs it (500 cr)');
  });

  it('B-AC-34-4: with nothing commissioned the build site says so', () => {
    const empty = onTv(game({ ...MIDGAME, projects: [], lastGauges: null }), TvMonthEnd);
    expect(has(empty, 'no-projects')).toBe(true);
    expect(has(empty, 'project-park')).toBe(false);
  });
});

describe('C34: the build site at the TV month end, one line a project (PM ruling 7 Nov, TV-FIT)', () => {
  const tv = (colony: ColonyView) => onTv(game(colony), TvMonthEnd);
  const line = (html: string, id: string) => text(element(html, `project-${id}`));
  const at = (over: Partial<ColonyProjectView>) => ({ ...MIDGAME, projects: MIDGAME.projects.map((p) => (p.id === over.id ? { ...p, ...over } : p)) });

  it("B-AC-34-4: each project is one line, name, stage and the figure its stage turns on; the funding bar, build pips and plaque are the phones'", () => {
    const html = tv(MIDGAME);
    expect([...element(html, 'build-site').matchAll(/<li[^>]*data-testid="project-([a-z]+)" data-stage="([a-z]+)"/g)].map((m) => m[1])).toEqual(['stadium', 'hospital', 'observatory', 'spaceport']);
    for (const id of ['stadium', 'hospital', 'park', 'observatory', 'spaceport']) expect(element(html, `project-${id}`)).not.toMatch(/data-testid="(funding|build|plaque)-/);
    expect(line(html, 'stadium')).toBe('Stadium Collecting 61% paid');
    expect(element(html, 'figure-spaceport')).toMatch(/line-through/);
  });

  it('PM ruling 7 Nov (five projects): the standing projects fold into one line after the rest, "Standing: Hospital · Park, +5 prestige"; collecting, building, closed and damaged keep their own', () => {
    const html = tv(at({ id: 'hospital', stage: 'standing', monthsLeft: null }));
    expect([...element(html, 'build-site').matchAll(/<li[^>]*data-testid="([a-z-]+)"/g)].map((m) => m[1])).toEqual(['project-stadium', 'project-observatory', 'project-spaceport', 'projects-standing']);
    expect(text(element(html, 'projects-standing'))).toBe('Standing: Hospital · Park +5 prestige');
    // Each standing project still answers to its own id and stage, inside the one line.
    for (const id of ['hospital', 'park']) expect(element(html, 'projects-standing')).toMatch(new RegExp(`data-testid="project-${id}" data-stage="standing"`));
    expect(text(element(html, 'figure-standing'))).toBe('+5 prestige');
  });

  it('PM ruling 7 Nov: one standing project folds the same way', () => {
    expect(text(element(tv(MIDGAME), 'projects-standing'))).toBe('Standing: Park +2 prestige');
  });

  it('PM ruling 7 Nov (negative): with nothing standing there is no standing line', () => {
    expect(has(tv({ ...MIDGAME, projects: MIDGAME.projects.filter((p) => p.stage !== 'standing') }), 'projects-standing')).toBe(false);
  });

  it('B-AC-34-4: a project paid in credits but short of goods names the goods it waits for, never "100% paid"', () => {
    const html = tv(at({ id: 'stadium', funded: { credits: 1_400, goods: { alloy: 4, electronics: 1 } } }));
    expect(line(html, 'stadium')).toBe('Stadium Collecting needs 1 Electronics');
  });

  it('B-AC-34-4: the month end has run the upkeep, so one month left stands next month, two in 2 months', () => {
    expect(line(tv(MIDGAME), 'hospital')).toBe('Hospital Building stands next month');
    expect(line(tv(at({ id: 'hospital', monthsLeft: 2 })), 'hospital')).toBe('Hospital Building stands in 2 months');
  });

  it('PM ruling 7 Nov (TV-FIT, five projects): beside the gauges the colony panel names the air\'s change in its header and leaves the level, band and fund to the Environment and Wealth gauges', () => {
    const panel = element(tv(MIDGAME), 'colony-panel');
    expect(text(element(panel, 'colony-air'))).toBe('Air ↓ worse than month 6 (35)');
    for (const id of ['air-level', 'air-band', 'colony-fund', 'fund-balance']) expect(has(panel, id)).toBe(false);
    expect(has(panel, 'colony-hungry')).toBe(true);
  });

  it('review of #672: a filtered plot leaves the air fractional; the Environment gauge reads it rounded, as the air trend does', () => {
    const half = { ...MIDGAME, gauges: { ...MIDGAME.gauges, environment: 35.5 } };
    expect(text(element(tv(half), 'gauge-environment'))).toMatch(/^Environment 36 /);
  });

  it('review of #672: five standing names wrap rather than cut', () => {
    expect(element(tv(MIDGAME), 'projects-standing')).not.toMatch(/truncate/);
  });

  it('B-AC-34-4 (negative): without politics the month end has no build site', () => {
    expect(has(onTv(game(null), TvMonthEnd), 'build-site')).toBe(false);
  });
});

describe('G-5 AM-12: the colony score at every month end (variant A)', () => {
  /** Month 7's end: (26,400 + 6,200 + 2,000) × 1.06 = 36,676; last month ended on 34,607, so ↑ +2,069 since month 6. */
  const MONTH_7: ColonyView = { ...MIDGAME, score: { wealth: 26_400, environment: 6_200, prestige: 2_000, factor: 1.06, total: 36_676 }, lastScore: 34_607 };
  const MONTH_1: ColonyView = { ...MONTH_7, lastGauges: null, lastScore: null };
  const end = (colony: ColonyView | null | undefined, extra: Partial<MuleView> = {}) => game(colony, extra);
  const firstEnd = (colony: ColonyView | null | undefined) => game(colony, { month: 1, players: PLAYERS.map((p) => ({ ...p, lastWorth: null })) });
  const COLLAPSE = { air: { level: 86, band: 'collapse' as const }, players: PLAYERS.map((p) => ({ ...p, worthBeforeCut: p.worth, worth: Math.round(p.worth * 0.8) })) };
  const MONTH_SCORE_IDS = ['colony-band', 'colony-score', 'colony-total', 'colony-score-change', 'score-sum', 'phone-month-score', 'colony-score-uncut'];

  it('B-AC-27-2: at a month end the TV shows the colony total, "+N since month M" from lastScore and the sum, under the league; no verdict, no plaques', () => {
    const tv = onTv(end(MONTH_7), TvMonthEnd);
    const band = element(tv, 'colony-band');
    expect(said(band, 'colony-total')).toBe('36,676');
    expect(said(band, 'colony-score-change')).toBe('↑ +2,069 since month 6');
    const sum = said(band, 'score-sum');
    for (const term of ['26,400', '6,200', '2,000', '1.06', 'Content']) expect(sum).toContain(term);
    expect(said(band, 'colony-score-words')).toBe('Wealth: everything the colony owns, 26,400 cr · Environment: air 34 · Prestige: 1 standing object · Content: × 1.06');
    expect(text(band)).toContain('counted again at game over');
    expect(has(band, 'colony-verdict')).toBe(false);
    expect(text(band)).not.toMatch(/A colony (to be proud of|that held together|in ruins)/);
    expect(has(band, 'plaque-board')).toBe(false);
    // Under the league, in its column; the build site beside it keeps the plaques.
    expect(tv.indexOf('data-testid="league-table"')).toBeLessThan(tv.indexOf('data-testid="colony-band"'));
    expect(tv.indexOf('data-testid="colony-band"')).toBeLessThan(tv.indexOf('data-testid="build-site"'));
    expect(has(tv, 'colony-score-uncut')).toBe(false);
  });

  it('B-AC-27-2: month 1’s end has no last month, so the TV shows the total and the sum with no change line', () => {
    const band = element(onTv(firstEnd(MONTH_1), TvMonthEnd), 'colony-band');
    expect(said(band, 'colony-total')).toBe('36,676');
    expect(has(band, 'score-sum')).toBe(true);
    expect(has(band, 'colony-score-change')).toBe(false);
    expect(text(band)).not.toContain('since month');
  });

  it('B-AC-27-6: at six seats the TV band shows the total and "+N" but no sum and no words; at four seats both lines are there', () => {
    const SIX = [...PLAYERS, aPlayer({ id: 's5', name: 'Ola', slot: 4, worth: 5_200, lastWorth: 5_000 }), aPlayer({ id: 's6', name: 'Ben', slot: 5, worth: 4_400, lastWorth: 4_300 })];
    const six = element(onTv(end(MONTH_7, { players: SIX }), TvMonthEnd), 'colony-band');
    expect(said(six, 'colony-total')).toBe('36,676');
    expect(said(six, 'colony-score-change')).toBe('↑ +2,069 since month 6');
    expect(has(six, 'score-sum')).toBe(false);
    expect(has(six, 'colony-score-words')).toBe(false);
    const four = element(onTv(end(MONTH_7), TvMonthEnd), 'colony-band');
    expect(said(four, 'colony-total')).toBe('36,676');
    expect(has(four, 'score-sum')).toBe(true);
    expect(has(four, 'colony-score-words')).toBe(true);
  });

  it('B-AC-27-6: five seats is where the band drops its sum and words', () => {
    const FIVE = [...PLAYERS, aPlayer({ id: 's5', name: 'Ola', slot: 4, worth: 5_200, lastWorth: 5_000 })];
    const five = element(onTv(end(MONTH_7, { players: FIVE }), TvMonthEnd), 'colony-band');
    expect(said(five, 'colony-total')).toBe('36,676');
    expect(has(five, 'score-sum')).toBe(false);
    expect(has(five, 'colony-score-words')).toBe(false);
  });

  it('B-AC-27-6: at six seats the phone beside the TV does not send players to a sum the TV no longer shows', () => {
    const SIX = [...PLAYERS, aPlayer({ id: 's5', name: 'Ola', slot: 4, worth: 5_200, lastWorth: 5_000 }), aPlayer({ id: 's6', name: 'Ben', slot: 5, worth: 4_400, lastWorth: 4_300 })];
    const foot = element(onPhone(end(MONTH_7, { players: SIX }), 1, Results), 'colony-on-tv');
    expect(said(foot, 'phone-month-score')).toBe('Colony score 36,676 ↑ +2,069 since month 6 Your own lines are beside, yours only.');
  });

  it('B-AC-27-2: in Collapse the TV keeps the CollapseBanner and still shows the score, saying the cut is not the score’s', () => {
    const tv = onTv(end(MONTH_7, COLLAPSE), TvMonthEnd);
    expect(has(tv, 'collapse-banner')).toBe(true);
    const band = element(tv, 'colony-band');
    expect(said(band, 'colony-total')).toBe('36,676');
    expect(said(band, 'colony-score-uncut')).toBe('The Collapse cuts each Worth, not the colony’s score.');
  });

  it('B-AC-27-3: beside a TV the phone’s month end shows one colony line with its change in the footnote’s place, under the whole league', () => {
    const phone = onPhone(end(MONTH_7), 1, Results);
    const foot = element(phone, 'colony-on-tv');
    expect(said(foot, 'phone-month-score')).toBe('Colony score 36,676 ↑ +2,069 since month 6 Its sum is on the TV; your own lines are beside, yours only.');
    expect(has(foot, 'score-sum')).toBe(false);
    expect(has(foot, 'colony-verdict')).toBe(false);
    for (const p of PLAYERS) expect(has(element(phone, 'league-table'), `league-row-${p.id}`), `the league keeps ${p.name}'s row`).toBe(true);
    expect(phone.indexOf('data-testid="league-table"')).toBeLessThan(phone.indexOf('data-testid="colony-on-tv"'));
    // The 10 px floor: no smaller type in the line.
    expect(foot).not.toMatch(/text-\[(\d|10\.\d)px\]|text-\[9/);
    const first = said(onPhone(firstEnd(MONTH_1), 1, Results), 'phone-month-score');
    expect(first).toMatch(/^Colony score 36,676 Its sum is on the TV/);
  });

  it('B-AC-27-3: with no TV the line heads the colony panel, the sum on it where the shell is wide; in Collapse it says the score is not cut', () => {
    const alone = element(onPhone(end(MONTH_7), 0, Results), 'phone-only-colony');
    expect(said(alone, 'colony-total')).toBe('36,676');
    expect(said(alone, 'colony-score-change')).toBe('↑ +2,069 since month 6');
    expect(said(alone, 'score-sum')).toBe('= 26,400 + 6,200 + 2,000 × 1.06');
    expect(element(alone, 'score-sum')).toContain('@min-[800px]/shell:inline');
    expect(alone.indexOf('data-testid="phone-month-score"')).toBeLessThan(alone.indexOf('data-testid="colony-panel"'));
    const collapse = onPhone(end(MONTH_7, COLLAPSE), 1, Results);
    expect(has(collapse, 'collapse-banner')).toBe(true);
    expect(said(collapse, 'colony-score-uncut')).toBe('The Collapse cuts each Worth, not the colony’s score.');
  });

  it('B-AC-27-4: game over is unchanged and prints its credits with thousands separators, on the TV and the phone', () => {
    const score = { wealth: 31_200, environment: 9_500, prestige: 11_000, factor: 1.08, total: 55_718 };
    const tv = onTv(over({ ...FINAL, score, lastScore: 52_000 }), TvGameOver);
    expect(said(tv, 'colony-total')).toBe('55,718');
    for (const [id, v] of [['term-wealth', '31,200'], ['term-environment', '9,500'], ['term-prestige', '11,000']]) expect(said(tv, id!)).toContain(v!);
    expect(has(tv, 'colony-verdict')).toBe(true);
    expect(has(tv, 'plaque-board')).toBe(true);
    const phone = onPhone(over({ ...FINAL, score, lastScore: 52_000 }));
    expect(said(phone, 'colony-total')).toBe('55,718');
    expect(said(phone, 'score-sum')).toContain('31,200');
    // Through the TV's own router, as the table reaches game over: C34's band once, no month-end band beside it.
    const routed = onTvRouter(over({ ...FINAL, score, lastScore: 52_000 }));
    expect(has(routed, 'tv-gameover')).toBe(true);
    expect(routed.match(/data-testid="colony-band"/g)).toHaveLength(1);
    expect(text(routed)).not.toContain('counted again at game over');
    expect(has(routed, 'colony-score-change')).toBe(false);
    // No month-end part leaks into game over.
    for (const html of [tv, phone]) for (const id of ['colony-score-change', 'phone-month-score', 'colony-score-uncut']) expect(has(html, id), `game over has no ${id}`).toBe(false);
  });

  it('B-AC-27-5 (negative): politics off, the month end is today’s on the TV and the phones; outside the month end there is no colony score line', () => {
    for (const colony of [null, undefined]) {
      const screens = [onTv(end(colony), TvMonthEnd), onPhone(end(colony), 1, Results), onPhone(end(colony), 0, Results)];
      for (const html of screens) for (const id of MONTH_SCORE_IDS) expect(has(html, id), `politics off has no ${id}`).toBe(false);
      expect(said(screens[1]!, 'colony-on-tv')).toBe('How the colony is doing is on the TV. Worth is cash + goods + land + MULEs + offices; your own lines are beside, for you only.');
    }
    expect(onTv(end(null), TvMonthEnd)).toBe(onTv(end(undefined), TvMonthEnd));
    // HC-22 to the tag: with no score, the footnote is today's bare <p>, and no wrapper sits around the league or the panel.
    for (const colony of [null, { ...MONTH_7, score: null }]) {
      const view = end(colony);
      // A game with a colony names donations in the rule (G-5 AM-12, #421); with none, today's words.
      const footnote = `<p class="mt-auto text-[11px] leading-snug text-ink-3" data-testid="colony-on-tv">How the colony is doing is on the TV. Worth is cash + goods + land + MULEs + offices${colony ? ' + donations' : ''}; your own lines are beside, for you only.</p>`;
      const phoneLeague = renderToStaticMarkup(createElement(LeagueTable, { view, density: 'phone', selfId: 's1' }));
      // The footnote is the month end's last child, straight after the league: no wrapper around it.
      expect(element(onPhone(view, 1, Results), 'phone-monthend').endsWith(`${phoneLeague}${footnote}</div>`)).toBe(true);
      const panel = renderToStaticMarkup(createElement(ColonyPanel, { view, density: 'compact' }));
      expect(element(onPhone(view, 0, Results), 'phone-only-colony')).toBe(`<div class="relative" data-testid="phone-only-colony">${panel}</div>`);
    }
    const unscoredView = end({ ...MONTH_7, score: null });
    const league = renderToStaticMarkup(createElement(LeagueTable, { view: { ...unscoredView, me: null }, density: 'tv' }));
    expect(onTv(unscoredView, TvMonthEnd)).toContain(`<div class="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] gap-6">${league}<div class="flex flex-col gap-4">`);
    // With the colony on but its score not counted, the month end is the screen before this change: no band, today's footnote.
    const unscored = onPhone(end({ ...MONTH_7, score: null }), 1, Results);
    expect(has(unscored, 'phone-month-score')).toBe(false);
    expect(said(unscored, 'colony-on-tv')).toContain('How the colony is doing is on the TV');
    expect(has(onTv(end({ ...MONTH_7, score: null }), TvMonthEnd), 'colony-band')).toBe(false);
    // Production's harvest on the phone, with a score in the view, carries no month-end score.
    const harvest = onPhone(end(MONTH_7, { phase: 'production' }), 1, Results);
    for (const id of ['phone-month-score', 'colony-score-change', 'colony-band']) expect(has(harvest, id), `production has no ${id}`).toBe(false);
  });
});

describe('HC-3: the grounds when the art manifest fails', () => {
  /** Month 12: the Park stands, the Stadium has 1 of its 3 months left, the Hospital is closed, the Spaceport only commissioned. */
  const MONTH_12: ColonyView = {
    ...MIDGAME,
    projects: [
      { ...PARK, place: { x: 1, y: 2, w: 1, h: 1 } },
      { ...STADIUM, stage: 'building', monthsLeft: 1, place: { x: 0, y: 0, w: 2, h: 2 } },
      { ...HOSPITAL, stage: 'closed', monthsLeft: null, place: { x: 3, y: 2, w: 1, h: 1 } },
      { ...DAMAGED, stage: 'commissioned', repairCost: null, place: { x: 3, y: 3, w: 2, h: 2 } },
    ],
  };
  const MANIFEST_URL = '/art/colony/manifest.json';
  const manifestFile = readFileSync(new URL('../public/art/colony/manifest.json', import.meta.url), 'utf8');
  /** The web server as the browser meets it: the manifest at its URL, nothing else. */
  const serveManifest = (body: () => Response | Promise<Response>) => vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === MANIFEST_URL ? body() : new Response('', { status: 404 }))));
  /** The shipped manifest with one part broken, as the server would send it. */
  const broken = (spoil: (m: { frame: Record<string, unknown>; pictures: Record<string, Record<string, Record<string, unknown>>> }) => void) => () => {
    const m = JSON.parse(manifestFile);
    spoil(m);
    return new Response(JSON.stringify(m));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<[string, () => Response | Promise<Response>]>([
    ['the network fails', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['the server answers 404', () => new Response('Not found', { status: 404 })],
    ['the file is not JSON', () => new Response('<!doctype html>')],
    ['the JSON is not a manifest', () => new Response('{"pictures":null}')],
    ['the frame is empty', broken((m) => void (m.frame = {}))],
    ['the frame has no number for its width', broken((m) => void (m.frame.width = 'wide'))],
    ['the frame centre is one number', broken((m) => void (m.frame.centre = [800]))],
    ['an entry has no day picture', broken((m) => void delete m.pictures.park!.standing!.day)],
    ["a kind's own frame is bad", broken((m) => void (m.pictures.stadium!.frame = {}))],
  ])('HC-3: when %s, the grounds draw every place as its SVG shape and nothing breaks', async (_, body) => {
    vi.resetModules();
    const fresh = await import('../src/components/Grounds');
    serveManifest(body);
    await expect(fresh.loadGroundsManifest()).resolves.toBeNull();
    const html = renderToStaticMarkup(createElement(fresh.Grounds, { colony: MONTH_12, size: 'phone' }));
    expect(has(html, 'colony-grounds')).toBe(true);
    expect(html).not.toContain('<image');
    for (const n of [1, 2, 3, 4]) expect(has(html, `shape-${n}`), `place ${n} is drawn`).toBe(true);
  });
});


describe('C5 / C7: the month-end opener on the TV, between the event show and TvMonthEnd', () => {
  const POLITICS: PoliticsView = {
    governor: 's1',
    sheriff: null,
    term: [1, 3],
    next: 4,
    baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 },
    fund: 0,
    pay: {},
    weights: [],
    candidates: {},
    promises: {},
    promise: null,
    promiseFrom: null,
    election: null,
  };
  const PARK_AT = { x: 1, y: 2, w: 1, h: 1 };
  const parkAt = (stage: ColonyProjectView['stage']): ColonyView => ({
    ...MIDGAME,
    lastGauges: null,
    projects: [project({ id: 'park', name: 'Park', stage, buildMonths: 1, monthsLeft: stage === 'building' ? 1 : null, place: PARK_AT })],
  });
  /** The TV's view of month `month` in `phase`; politics off sends neither politics nor a colony (HC-5). */
  const at = (phase: MuleView['phase'], month: number, colony: ColonyView | null) => ({ ...game(colony, { phase, month, politics: colony ? POLITICS : null }), me: null });

  let host: FakeElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  /** The page's frame clock, in ms: it moves only as the test lets time pass. */
  let pageMs = 0;
  /** The server's clock, as the TV reads it: it moves with the page's. */
  let serverMs = 0;

  beforeEach(() => {
    Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [] });
    Object.assign(document, { createElementNS: (_ns: string, tag: string) => document.createElement(tag) });
    Object.assign(window, { matchMedia: (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} }) });
    frames = new Map();
    pageMs = 0;
    serverMs = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(nextFrame, cb);
      return nextFrame++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    // No art on the test's server: the grounds draw their SVG shapes (HC-3).
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('no server')));
  });
  afterEach(() => {
    if (root) flushSync(() => root!.unmount());
    if (host) document.body.removeChild(host);
    root = null;
    host = null;
    delete (window as { matchMedia?: unknown }).matchMedia;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The TV mounted on TableApp's router; `send` is the server's next view. */
  function tv(first: MuleView) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host as unknown as HTMLElement);
    const show = (view: MuleView) => {
      onTvRouterState(view);
      const board = { ...client, watch: () => {}, serverNow: () => serverMs } as unknown as TableClient;
      flushSync(() => root!.render(createElement(ClientProvider, { client: board, children: createElement(TableApp, { room: 'MULE' }) })));
    };
    show(first);
    return {
      send: show,
      shows: (testid: string) => find(host!, testid) !== null,
      opener: () => find(host!, 'tv-grounds-opener'),
      happiness: () => Number(words(find(host!, 'gauge-happiness')!).match(/Happiness\s*(\d+)/)?.[1]),
    };
  }

  /** Lets `ms` pass on the page's timers and frames. */
  function pass(ms: number) {
    for (let t = 0; t < ms; t += 50) {
      flushSync(() => vi.advanceTimersByTime(50));
      const due = [...frames.values()];
      frames.clear();
      pageMs += 50;
      serverMs += 50;
      flushSync(() => due.forEach((cb) => cb(pageMs)));
    }
  }

  it('T-AC-8: at a politics-on month end the TV shows the opener first, TvMonthEnd once its 3 s still has run; the first month end this TV sees leans in on nothing', () => {
    const screen = tv(at('planning', 1, parkAt('building')));
    screen.send(at('upkeep', 1, parkAt('standing')));
    expect(screen.opener()?.getAttribute('data-opener')).toBe('still');
    expect(screen.opener()?.getAttribute('data-leaning')).toBeNull();
    expect(screen.shows('tv-monthend')).toBe(false);
    pass(2_900);
    expect(screen.shows('tv-grounds-opener')).toBe(true);
    pass(200);
    expect(screen.shows('tv-grounds-opener')).toBe(false);
    expect(screen.shows('tv-monthend')).toBe(true);
  });

  it('T-AC-8: a month whose Park came to stand plays the full 6 s opener, leaning in on the Park, then TvMonthEnd', () => {
    const screen = tv(at('planning', 1, parkAt('commissioned')));
    screen.send(at('upkeep', 1, parkAt('building')));
    pass(3_100);
    screen.send(at('planning', 2, parkAt('building')));
    screen.send(at('upkeep', 2, parkAt('standing')));
    expect(screen.opener()?.getAttribute('data-opener')).toBe('full');
    expect(screen.opener()?.getAttribute('data-leaning')).toBe('park');
    expect(words(find(host!, 'opener-caption')!)).toBe('New this month: the Park stands.');
    pass(5_900);
    expect(screen.shows('tv-grounds-opener')).toBe(true);
    pass(200);
    expect(screen.shows('tv-monthend')).toBe(true);
  });

  it('T-AC-8: the month end’s event show plays first: under it the opener waits, its clock still, no month end; its 3 s start when the show ends', () => {
    const screen = tv(at('planning', 1, parkAt('building')));
    // A colony event at the month end, its show on the server's clock for the next 4 s.
    const showMs = 4_000;
    const event = { key: 'festival', kind: 'festival', title: 'Festival', line: 'The colony celebrates.', sign: 'good', scope: 'colony', origin: null, hits: [], phase: 'upkeep', weight: 'spotlight', playMs: EVENT_SHOW.playMs.spotlight, objects: [], effects: [] };
    screen.send({ ...at('upkeep', 1, parkAt('standing')), events: [event], eventShow: { startsAt: serverMs, showMs, introMs: EVENT_SHOW.introMs, endsAt: serverMs + showMs, held: true } } as unknown as MuleView);
    expect(screen.shows('tv-grounds-opener')).toBe(true);
    pass(3_900);
    // Longer than the still's 3 s: had its clock run under the show, it would be over.
    expect(screen.shows('tv-grounds-opener')).toBe(true);
    expect(screen.shows('tv-monthend')).toBe(false);
    pass(300);
    // The show is over; the still now runs its whole 3 s, then the month end.
    pass(2_700);
    expect(screen.shows('tv-grounds-opener')).toBe(true);
    pass(400);
    expect(screen.shows('tv-grounds-opener')).toBe(false);
    expect(screen.shows('tv-monthend')).toBe(true);
  });

  it('T-AC-8: everyone Ready during the opener moves the phase on, and the planning screen shows at once', () => {
    const screen = tv(at('planning', 1, parkAt('building')));
    screen.send(at('upkeep', 1, parkAt('standing')));
    pass(1_000);
    expect(screen.shows('tv-grounds-opener')).toBe(true);
    screen.send(at('planning', 2, parkAt('standing')));
    expect(screen.shows('tv-grounds-opener')).toBe(false);
    expect(screen.shows('tv-monthend')).toBe(false);
  });

  it('T-AC-8: the phase moving on ends the full opener, on a page whose frame clock has no cancelAnimationFrame too', () => {
    const screen = tv(at('planning', 1, parkAt('commissioned')));
    screen.send(at('upkeep', 1, parkAt('building')));
    pass(3_100);
    screen.send(at('planning', 2, parkAt('building')));
    vi.stubGlobal('cancelAnimationFrame', undefined);
    screen.send(at('upkeep', 2, parkAt('standing')));
    pass(1_000);
    expect(screen.opener()?.getAttribute('data-opener')).toBe('full');
    expect(() => screen.send(at('planning', 3, parkAt('standing')))).not.toThrow();
    expect(screen.shows('tv-grounds-opener')).toBe(false);
  });

  it('T-AC-8: a TV that reloads into the month end shows TvMonthEnd at once, no opener (RULE-5)', () => {
    const screen = tv(at('upkeep', 2, parkAt('standing')));
    expect(screen.shows('tv-grounds-opener')).toBe(false);
    expect(screen.shows('tv-monthend')).toBe(true);
  });

  it('T-AC-9: the gauges count when TvMonthEnd mounts after the opener, not at the phase change: they open on last month’s mood and count to the server’s', () => {
    const mood = (happiness: number, last: number): ColonyView => ({ ...parkAt('standing'), gauges: { ...MIDGAME.gauges, happiness, band: 'restless' }, lastGauges: { ...MIDGAME.lastGauges!, happiness: last } });
    const screen = tv(at('planning', 3, mood(44, 50)));
    screen.send(at('upkeep', 3, mood(31, 44)));
    pass(3_000);
    expect(screen.shows('tv-monthend')).toBe(true);
    expect(screen.happiness()).toBe(44);
    pass(3_000);
    expect(screen.happiness()).toBe(31);
  });

  it('T-AC-5: politics off, the month end is TvMonthEnd at once: no opener and no grounds', () => {
    const screen = tv(at('planning', 1, null));
    screen.send(at('upkeep', 1, null));
    expect(screen.shows('tv-grounds-opener')).toBe(false);
    expect(screen.shows('colony-grounds')).toBe(false);
    expect(screen.shows('tv-monthend')).toBe(true);
  });
});

function find(node: FakeElement, testid: string): FakeElement | null {
  for (const c of node.childNodes) {
    if (!(c instanceof FakeElement)) continue;
    if (c.getAttribute('data-testid') === testid) return c;
    const deep = find(c, testid);
    if (deep) return deep;
  }
  return null;
}

/** The text under a node, as a screen reads it. */
const words = (node: FakeElement): string =>
  node.childNodes
    .map((c) => (c instanceof FakeElement ? words(c) : c.textContent))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
