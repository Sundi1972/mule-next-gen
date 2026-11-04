import type { ColonyProjectView, ColonyView, MuleView, MyView, TableView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { GameOver } from '../src/phone/GameOver';
import { TvGameOver, TvHeader, TvMonthEnd } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

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
  worthParts: { money: 2_900, goods: 220, plots: 7, land: 2_100, mules: 6, muleValue: 900, office: 300, cut: 0 },
};

function project(over: Partial<ColonyProjectView> & Pick<ColonyProjectView, 'id' | 'name' | 'stage'>): ColonyProjectView {
  return {
    cost: { credits: 1_400, goods: { alloy: 4, electronics: 2 } },
    funded: { credits: 1_400, goods: { alloy: 4, electronics: 2 } },
    buildMonths: 3,
    monthsLeft: null,
    plot: null,
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

function onPhone(view: MuleView, boards = 1): string {
  const table = { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards, game: view } as TableView<MuleView>;
  const value = { table, view, me: view.me!, self: view.players[0]!, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(GameOver) }) }));
}

function onTv(view: MuleView, screen: (props: { game: MuleView }) => ReactElement): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(screen, { game: { ...view, me: null } }) }));
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
  });

  it('UBER-AC-7 / B-AC-34-1: in Collapse the TV’s colony band carries the failed colony in alert above the score; passed, it has no verdict lines', () => {
    const band = element(onTv(over(FINAL, { air: { level: 86, band: 'collapse' } }), TvGameOver), 'colony-band');
    expect(band).toContain('data-failed="true"');
    expect(band).toContain('border-alert');
    expect(band).toContain('bg-alert-bg');
    expect(said(band, 'verdict-title')).toBe('The colony failed');
    expect(said(band, 'verdict-line')).toBe('The air ended in Collapse. The Federation cuts every score by a fifth.');
    expect(band.indexOf('data-testid="verdict-title"')).toBeLessThan(band.indexOf('data-testid="colony-total"'));
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

describe('C34: the build site at the month end', () => {
  const tv = onTv(game(MIDGAME), TvMonthEnd);
  const row = (id: string) => element(tv, `project-${id}`);

  it('B-AC-34-4: one row per project, each at its stage', () => {
    const stages = [...element(tv, 'build-site').matchAll(/data-testid="project-([a-z]+)" data-stage="([a-z]+)"/g)].map((m) => [m[1], m[2]]);
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
    expect(text(row('park'))).toContain('Calms the colony in a riot · upkeep 30 cr a month');
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

  it('B-AC-34-4 (negative): without politics the month end has no build site', () => {
    expect(has(onTv(game(null), TvMonthEnd), 'build-site')).toBe(false);
  });
});
