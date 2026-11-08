import { plotEvent, POLITICS, RuleError, guardsMax, type GameState, type Office, type SabotageOrder } from '@mule/engine';
import type { MuleIntent } from '@mule/protocol';
import type { SeatInfo } from '@tabletop/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { MuleGame, type Notice } from '../src/mule-game.js';
import { Recorder } from '../src/record.js';
import { replay } from '../src/replay.js';
import { fakeContext, seats, throughSidePicks } from './fake-context.js';

/**
 * Slice 4's server (S4-C13): what each screen is told of sabotage and the Sheriff (S4-RULE-12). Every test arranges the
 * ground truth in the engine's state (Brix the Sheriff, Ossa's and Brix's plots), forces the order's draws through the
 * config (success 1 or 0, detect 1 or 0), and then reads what each connection would receive: viewFor(seat) for a phone,
 * viewFor(null) for the TV and the board.
 */

const TABLE: SeatInfo[] = [
  { id: 'lena', name: 'Lena', isAi: false, color: 0 },
  { id: 'brix', name: 'Brix', isAi: false, color: 1 },
  { id: 'ossa', name: 'Ossa', isAi: false, color: 2 },
  { id: 'ai1', name: 'The Accountant', isAi: true, color: 3 },
];
const SEATS = ['lena', 'brix', 'ossa', 'ai1'] as const;
/** Every connection: the four phones, and the TV and the board (the same view, no seat). */
const VIEWERS: (string | null)[] = [...SEATS, null];

/** Sabotage on, both offices, no election in the way and the AI quiet, for each test; the config's own values come back after it (AM-2: the defaults are off). */
let saved: {
  on: boolean;
  offices: Office[];
  electionMonths: number[];
  orders: typeof POLITICS.sabotage.orders;
  odds: number;
  orderChance: typeof POLITICS.ai.sabotage.orderChance;
};
beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
  saved = {
    on: POLITICS.sabotage.on,
    offices: POLITICS.offices,
    electionMonths: POLITICS.electionMonths,
    orders: structuredClone(POLITICS.sabotage.orders),
    odds: POLITICS.sheriff.investigateOdds,
    orderChance: { ...POLITICS.ai.sabotage.orderChance },
  };
  POLITICS.sabotage.on = true;
  POLITICS.offices = ['governor', 'sheriff'];
  POLITICS.electionMonths = [];
  Object.assign(POLITICS.ai.sabotage.orderChance, { trader: 0, cautious: 0, aggressive: 0, saboteur: 0 });
});
afterEach(() => {
  POLITICS.sabotage.on = saved.on;
  POLITICS.offices = saved.offices;
  POLITICS.electionMonths = saved.electionMonths;
  Object.assign(POLITICS.sabotage.orders.powerCut, saved.orders.powerCut);
  Object.assign(POLITICS.sabotage.orders.rumour, saved.orders.rumour);
  POLITICS.sheriff.investigateOdds = saved.odds;
  Object.assign(POLITICS.ai.sabotage.orderChance, saved.orderChance);
  vi.restoreAllMocks();
});

/** The order's two draws, forced: it works (or not), and it is seen (or not). */
function force(kind: 'powerCut' | 'rumour', works: boolean, seen: boolean): void {
  POLITICS.sabotage.orders[kind].success = works ? 1 : 0;
  POLITICS.sabotage.orders[kind].detect = seen ? 1 : 0;
}

const stateOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Month 1's planning, the votes over: Brix is the Sheriff, Ossa the Governor; Ossa and Brix each own a Food plot. */
function world(maxMonths?: number) {
  const notices: Notice[] = [];
  const fake = fakeContext({ table: TABLE });
  const game = new MuleGame(fake.ctx, 10, { politics: true, ...(maxMonths ? { maxMonths } : {}), notice: (n) => notices.push(n) });
  game.start(TABLE);
  const state = stateOf(game);
  state.politics = { ...state.politics!, election: null, council: null, governor: 'ossa', sheriff: 'brix' };
  const free = state.tiles.flatMap((t, i) => (t.terrain !== 'store' && t.owner === null ? [i] : []));
  const [ossaPlot, brixPlot] = free as [number, number];
  Object.assign(state.tiles[ossaPlot]!, { owner: 'ossa', outfit: 'food' });
  Object.assign(state.tiles[brixPlot]!, { owner: 'brix', outfit: 'food' });
  const advance = throughSidePicks(game, fake.advance);
  return { game, state, notices, ossaPlot, brixPlot, advance, now: fake.ctx.now };
}
type World = ReturnType<typeof world>;

/** Plays on until the phase (and, with `month`, the month) is the one asked for. Planning is pressed through by every human. */
function until(w: World, phase: string, month?: number): void {
  for (let i = 0; i < 100_000 && !(w.state.phase === phase && (month === undefined || w.state.month === month)); i++) {
    const open = w.state.phase;
    if (open === 'planning' || open === 'upkeep') for (const id of ['lena', 'brix', 'ossa']) if (w.state.phase === open) w.game.handle(id, { type: 'ready' });
    w.advance(100);
  }
  expect(w.state.phase).toBe(phase);
}

const cut = (tile: number) => ({ type: 'sabotage' as const, target: { kind: 'powerCut' as const, tile } });
/** Everything the connection `viewer` would be sent. */
const wire = (game: MuleGame, viewer: string | null) => JSON.stringify(game.viewFor(viewer));
const money = (game: MuleGame, id: string) => game.viewFor(null).players.find((p) => p.id === id)!.money;
const reputation = (game: MuleGame, viewer: string | null, id: string) => game.viewFor(viewer).players.find((p) => p.id === id)!.reputation!;
/** Every JSON path where `value` appears as a value or a key. */
function where(view: unknown, value: string, path = ''): string[] {
  if (typeof view === 'string') return view === value ? [path] : [];
  if (typeof view !== 'object' || view === null) return [];
  return Object.entries(view).flatMap(([key, v]) => [...(key === value ? [`${path}.${key}`] : []), ...where(v, value, `${path}.${Array.isArray(view) ? '*' : key}`)]);
}
const SEAT_LISTS = ['.players.*.id', '.politics.weights.*.id', '.politics.reputationReasons.lena'];
const orders = (w: World): SabotageOrder[] => w.state.politics!.sabotage;

describe('S4-B-AC-6: a pending order and the guards reach nobody but their party', () => {
  it('S4-B-AC-6: with Lena\'s order and Brix\'s guards in planning, no other phone and not the board gets either; Lena\'s money does not move before upkeep', () => {
    const w = world();
    const before = money(w.game, 'lena');
    w.game.handle('lena', cut(w.ossaPlot));
    w.game.handle('brix', { type: 'guard', tiles: [w.ossaPlot, w.brixPlot] });
    const id = orders(w)[0]!.id;
    expect(w.state.politics!.guards, 'the engine holds the guards').toEqual([w.ossaPlot, w.brixPlot]);

    for (const viewer of ['brix', 'ossa', 'ai1', null]) {
      const text = wire(w.game, viewer);
      expect(text, `${viewer}: the order id`).not.toContain(id);
      expect(text, `${viewer}: the order's target`).not.toContain('"kind":"powerCut"');
      expect(text, `${viewer}: the order's tile`).not.toContain(`"tile":${w.ossaPlot}`);
      expect(text, `${viewer}: the crew's cost`).not.toContain(`"owed":${POLITICS.sabotage.orders.powerCut.cost}`);
      const view = w.game.viewFor(viewer);
      expect(view.politics!.sabotage!.incidents, `${viewer}: no incident yet`).toEqual([]);
      if (viewer !== null) expect(view.me!.politics!.sabotage, `${viewer}: nothing of their own`).toMatchObject({ order: null, owed: 0, mine: [] });
    }
    // The guards: a list of tiles on the Sheriff's view only; every other screen holds the count he may post.
    for (const viewer of ['lena', 'ossa', 'ai1', null]) {
      expect(wire(w.game, viewer), `${viewer}: the guards`).not.toMatch(/"guards":\[/);
      expect(w.game.viewFor(viewer).me?.politics?.sheriff ?? null, `${viewer}: no Sheriff's desk`).toBeNull();
    }
    expect(w.game.viewFor('brix').me!.politics!.sheriff).toMatchObject({ canAct: true, guards: [w.ossaPlot, w.brixPlot], max: guardsMax(w.state) });
    // Negative case: Lena's own view has her order, Brix's has the guards (checked above), and her money has not moved.
    expect(w.game.viewFor('lena').me!.politics!.sabotage).toMatchObject({ order: { kind: 'powerCut', tile: w.ossaPlot }, canOrder: true, owed: POLITICS.sabotage.orders.powerCut.cost });
    expect(w.game.viewFor('lena').me!.politics!.sabotage!.mine.map((o) => [o.id, o.public, o.outcome, o.culprit])).toEqual([[id, false, 'pending', 'lena']]);
    expect(money(w.game, 'lena'), 'no crew charged in planning').toBe(before);
    // A pending order's plot loses its MULE: building any view still must not throw.
    w.state.tiles[w.ossaPlot]!.outfit = null;
    for (const viewer of VIEWERS) expect(() => wire(w.game, viewer), String(viewer)).not.toThrow();
    expect(w.game.viewFor('lena').me!.politics!.sabotage!.mine[0], 'a pending cut with no crop to name sends null, not a missing field').toHaveProperty('good', null);
    w.state.tiles[w.ossaPlot]!.outfit = 'food';

    // Production resolves it; the crew is still owed, not paid, until upkeep.
    until(w, 'production');
    expect(money(w.game, 'lena'), 'no crew charged in production').toBe(before);
    until(w, 'upkeep');
    expect(money(w.game, 'lena')).toBe(before - POLITICS.sabotage.orders.powerCut.cost);
  });
});

describe('S4-B-AC-1 (server): a guarded cut is caught and named on every screen', () => {
  it('S4-B-AC-1: Brix guards his Food plot and Lena\'s cut on it resolves: every phone\'s and the TV\'s production events carry the culprit, and her reputation falls by 10', () => {
    const w = world();
    force('powerCut', true, false);
    const rep = reputation(w.game, null, 'lena');
    w.game.handle('lena', cut(w.brixPlot));
    w.game.handle('brix', { type: 'guard', tiles: [w.brixPlot] });
    until(w, 'production');

    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      const events = view.production!.events.filter((e) => e.kind === 'sabotage');
      expect(events, String(viewer)).toHaveLength(1);
      expect(events[0]!.sabotage, String(viewer)).toMatchObject({ culprit: 'lena', worked: false, guarded: true });
      expect(events[0]!.title, String(viewer)).toMatch(/^Sabotage/);
      expect(reputation(w.game, viewer, 'lena'), `${viewer}: Lena's reputation`).toBe(rep - 10);
      expect(view.politics!.reputationReasons!.lena, String(viewer)).toEqual([{ kind: 'caught', month: 1 }]);
      expect(view.politics!.sabotage!.incidents).toMatchObject([{ kind: 'powerCut', victim: 'brix', worked: false, culprit: 'lena', how: 'guard', investigated: false, fine: null }]);
      expect(view.news.join(' '), `${viewer}: the news names her`).toMatch(/Caught! Lena tried to cut the power to Brix's Food plot; a guard stopped it\./);
    }
    // The plot makes its normal output: the engine filed no dark plot.
    expect(w.game.viewFor(null).production!.events.find((e) => e.kind === 'sabotage')!.hits).toEqual([]);
  });

  it('S4-B-AC-1: under a pact with Brix the same catch costs her 30', () => {
    const w = world();
    force('powerCut', true, false);
    w.game.handle('lena', { type: 'offerDeal', offer: { to: 'brix', terms: { kind: 'pact' }, months: 3 } });
    w.game.handle('brix', { type: 'answerDeal', id: w.state.politics!.deals.at(-1)!.id, accept: true });
    const rep = reputation(w.game, null, 'lena');
    w.game.handle('lena', cut(w.brixPlot));
    w.game.handle('brix', { type: 'guard', tiles: [w.brixPlot] });
    until(w, 'production');
    for (const viewer of VIEWERS) expect(reputation(w.game, viewer, 'lena'), String(viewer)).toBe(rep - 30);
  });

  it('S4-B-AC-1: a worked cut that is seen names her too; the plot goes dark on every screen', () => {
    const w = world();
    force('powerCut', true, true);
    w.game.handle('lena', cut(w.ossaPlot));
    until(w, 'production');
    for (const viewer of VIEWERS) {
      const event = w.game.viewFor(viewer).production!.events.find((e) => e.kind === 'sabotage')!;
      expect(event.sabotage, String(viewer)).toMatchObject({ culprit: 'lena', worked: true, guarded: false });
      expect(event.hits.length, `${viewer}: the plot is hit`).toBe(1);
      expect(w.game.viewFor(viewer).politics!.sabotage!.incidents[0], String(viewer)).toMatchObject({ victim: 'ossa', culprit: 'lena', how: 'caught', worked: true });
    }
  });
});

describe('S4-B-AC-2 (server): an unseen cut names nobody but its orderer', () => {
  it('S4-B-AC-2: an unguarded order that works and is not seen: every view says "someone", and only Lena\'s names her', () => {
    const w = world();
    force('powerCut', true, false);
    w.game.handle('lena', cut(w.ossaPlot));
    until(w, 'production');
    const id = orders(w)[0]!.id;

    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      const event = view.production!.events.find((e) => e.kind === 'sabotage')!;
      expect(event.sabotage, String(viewer)).toMatchObject({ order: id, culprit: null, worked: true, guarded: false });
      expect(event.line, String(viewer)).toMatch(/^Someone cut the power/);
      expect(event.hits, `${viewer}: the plot is dark`).toHaveLength(1);
      expect(view.news, String(viewer)).toContain("Sabotage: someone cut the power to Ossa's Food plot.");
      expect(view.news.join(' '), String(viewer)).not.toMatch(/Caught|tried to cut|Lena (cut|was)/);
      const text = JSON.stringify(view);
      // The news line goes to every phone: it names the victim's seat and never the orderer's.
      expect(view.newsLines!.find((l) => l.text.startsWith('Sabotage: someone'))!.who, String(viewer)).toEqual(['ossa']);
      if (viewer !== 'lena') {
        expect(text, `${viewer}: no culprit anywhere`).not.toContain('"culprit":"lena"');
        expect(where(view, 'lena'), `${viewer}: Lena only where a seat is listed`).toEqual(SEAT_LISTS);
        expect(view.politics!.sabotage!.incidents[0], String(viewer)).toMatchObject({ id, victim: 'ossa', worked: true, culprit: null, how: null });
      }
    }
    const mine = w.game.viewFor('lena').me!.politics!.sabotage!.mine;
    expect(mine).toMatchObject([{ id, public: true, outcome: 'done', culprit: 'lena', worked: true }]);
    // The culprit is nobody's but the orderer's.
    expect(w.game.viewFor('brix').me!.politics!.sabotage!.mine).toEqual([]);
    expect(w.game.viewFor(null).politics!.reputationReasons!.lena).toEqual([]);
  });

  it('S4-B-AC-2: a failed, unseen order files no event, no news and no public notice, and is Lena\'s alone', () => {
    const w = world();
    force('powerCut', false, false);
    w.game.handle('lena', cut(w.ossaPlot));
    until(w, 'production');
    const id = orders(w)[0]!.id;
    expect(orders(w)[0]!.outcome).toBe('failed');

    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      expect(view.production!.events.filter((e) => e.kind === 'sabotage'), String(viewer)).toEqual([]);
      expect(view.news.join(' '), String(viewer)).not.toMatch(/Sabotage|cut the power|Caught|rumour/);
      expect(view.politics!.sabotage!.incidents, String(viewer)).toEqual([]);
      if (viewer !== 'lena') expect(JSON.stringify(view), `${viewer}: the id`).not.toContain(id);
    }
    expect(w.game.viewFor('lena').me!.politics!.sabotage!.mine).toMatchObject([{ id, public: false, outcome: 'failed', worked: false, culprit: 'lena' }]);
    const notice = w.notices.filter((n) => n.kind === 'sabotage');
    expect(notice).toMatchObject([{ kind: 'sabotage', order: id, outcome: 'failed', culprit: 'lena', parties: ['lena'] }]);
  });
});

describe('S4-B-AC-4: an investigation is public at once, and once only', () => {
  /** Month 1: Lena's cut works unseen. Month 2's planning: the incident stands, culprit unknown. */
  function unsolved(odds: number) {
    const w = world();
    force('powerCut', true, false);
    POLITICS.sheriff.investigateOdds = odds;
    w.game.handle('lena', cut(w.ossaPlot));
    until(w, 'planning', 2);
    return { w, id: orders(w)[0]!.id };
  }

  it('S4-B-AC-4: a solved investigation shows the name on every screen at once, and Lena\'s reputation falls', () => {
    const { w, id } = unsolved(1);
    const rep = reputation(w.game, null, 'lena');
    w.game.handle('brix', { type: 'investigate', order: id });
    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      expect(view.politics!.sabotage!.incidents, String(viewer)).toMatchObject([{ id, culprit: 'lena', how: 'investigation', investigated: true }]);
      expect(view.politics!.sabotage!.sheriff.investigationsLeft, String(viewer)).toBe(0);
      expect(reputation(w.game, viewer, 'lena'), String(viewer)).toBe(rep - 10);
      expect(view.news[0], String(viewer)).toBe("Solved by the Sheriff: it was Lena, behind the power cut on Ossa's Food plot.");
    }
    expect(w.notices.filter((n) => n.kind === 'investigation')).toEqual([expect.objectContaining({ kind: 'investigation', order: id, solved: true, culprit: 'lena' })]);
    expect(w.notices.find((n) => n.kind === 'investigation')).not.toHaveProperty('parties');
    // Negative: it cannot be investigated again, and the phone receives the RuleError's text.
    expect(() => w.game.handle('brix', { type: 'investigate', order: id })).toThrow(new RuleError('One investigation a month'));
    // A month later the cap no longer refuses first: the rules' own words do.
    until(w, 'planning', 3);
    expect(() => w.game.handle('brix', { type: 'investigate', order: id })).toThrow(new RuleError('That one is solved'));
  });

  it('S4-B-AC-4: a cold trail shows on every screen at once and names nobody; a second investigation that month is refused', () => {
    const { w, id } = unsolved(0);
    const rep = reputation(w.game, null, 'lena');
    // The MULE comes off Ossa's plot (a theft, a sale, a swap) before the Sheriff looks: no line or view may throw.
    w.state.tiles[w.ossaPlot]!.outfit = null;
    expect(() => w.game.handle('brix', { type: 'investigate', order: id })).not.toThrow();
    expect(() => w.game.handle('lena', { type: 'ready' }), 'the next intent still lands').not.toThrow();
    expect(w.game.viewFor(null).players.find((p) => p.id === 'lena')!.ready).toBe(true);
    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      expect(view.politics!.sabotage!.incidents, String(viewer)).toMatchObject([{ id, good: 'food', culprit: null, how: null, investigated: true }]);
      expect(view.news[0], String(viewer)).toBe("The trail went cold on the power cut on Ossa's Food plot.");
      expect(reputation(w.game, viewer, 'lena'), String(viewer)).toBe(rep);
      if (viewer !== 'lena') expect(JSON.stringify(view), String(viewer)).not.toContain('"culprit":"lena"');
    }
    expect(w.notices.filter((n) => n.kind === 'investigation')).toEqual([expect.objectContaining({ order: id, solved: false, culprit: null })]);
    expect(() => w.game.handle('brix', { type: 'investigate', order: id })).toThrow(new RuleError('One investigation a month'));
    // A refusal changes nothing: still one investigation recorded.
    expect(orders(w)[0]!.investigated).toBe(2);
    // A month later the cap no longer refuses first: the rules' own words do, and the case is not reopened.
    until(w, 'planning', 3);
    expect(() => w.game.handle('brix', { type: 'investigate', order: id })).toThrow(new RuleError('The trail went cold on that one'));
    expect(orders(w)[0]!.investigated, 'still the month it was looked at').toBe(2);
  });

  it('S4-B-AC-4: only the Sheriff investigates; the others are refused in words and no view changes', () => {
    const { w, id } = unsolved(1);
    const before = wire(w.game, null);
    expect(() => w.game.handle('lena', { type: 'investigate', order: id })).toThrow(new RuleError('Only the Sheriff investigates'));
    expect(wire(w.game, null)).toBe(before);
  });
});

describe('S4-T-AC-8: the TV, the board and each phone follow S4-RULE-12', () => {
  it('S4-T-AC-8: the board\'s sabotage keys are exactly terms, incidents and sheriff; sheriff.guards is guardsMax, never the count posted (AM-1)', () => {
    const w = world();
    w.game.handle('brix', { type: 'guard', tiles: [w.brixPlot] });
    const sabotage = w.game.viewFor(null).politics!.sabotage!;
    expect(Object.keys(sabotage).sort()).toEqual(['incidents', 'sheriff', 'terms']);
    expect(Object.keys(sabotage.sheriff).sort()).toEqual(['guards', 'investigations', 'investigationsLeft']);
    expect(sabotage.sheriff).toEqual({ guards: guardsMax(w.state), investigations: POLITICS.sheriff.investigations, investigationsLeft: POLITICS.sheriff.investigations });
    expect(w.state.politics!.guards, 'one guard posted').toHaveLength(1);
    expect(sabotage.sheriff.guards, 'the public count is what he may post, not what he did').toBe(POLITICS.sheriff.guards);
    const { powerCut, rumour } = POLITICS.sabotage.orders;
    expect(sabotage.terms).toEqual({ powerCut: { cost: powerCut.cost, success: powerCut.success, detect: powerCut.detect }, rumour: { cost: rumour.cost, success: rumour.success, detect: rumour.detect } });
    expect(w.game.viewFor(null).me).toBeNull();
  });

  it('S4-T-AC-8: a rumour order: a phone other than Ossa\'s never sees it; her own view carries direction and good but never the price it moves from', () => {
    const w = world();
    force('rumour', true, false);
    w.game.handle('ossa', { type: 'sabotage', target: { kind: 'rumour', good: 'food', dir: 'up' } });
    const id = orders(w)[0]!.id;
    expect(w.game.viewFor('ossa').me!.politics!.sabotage).toMatchObject({ order: { kind: 'rumour', good: 'food', dir: 'up' }, owed: POLITICS.sabotage.orders.rumour.cost });
    for (const viewer of ['lena', 'brix', 'ai1', null]) expect(wire(w.game, viewer), String(viewer)).not.toContain(id);
    until(w, 'auction');
    // The auction is on: the rumour has shifted the posted price and the engine holds the price it moved from.
    expect(w.state.politics!.rumoured, 'a rumour is working').toHaveLength(1);
    const from = w.state.politics!.rumoured[0]!.from;
    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      const text = JSON.stringify(view);
      expect(text, `${viewer}: no rumoured`).not.toContain('"rumoured"');
      expect(text, `${viewer}: no from`).not.toContain('"from":' + from + ',');
      const own = view.me?.politics?.sabotage?.mine ?? [];
      for (const item of own) expect(Object.keys(item), `${viewer}`).not.toContain('from');
    }
  });

  it('S4-T-AC-8: after a fine every screen has it: due, paid, to the victim and by whom; the Sheriff\'s desk loses it from fineable', () => {
    const w = world();
    const share = Math.round(100 * POLITICS.sheriff.victimShare);
    force('powerCut', true, true);
    w.game.handle('lena', cut(w.brixPlot));
    until(w, 'planning', 2);
    const id = orders(w)[0]!.id;
    expect(w.game.viewFor('brix').me!.politics!.sheriff).toMatchObject({ canAct: true, fineable: [id], steps: [...POLITICS.sheriff.fine.steps], multiplier: 1 });
    expect(w.game.viewFor('lena').me?.politics?.sheriff ?? null, 'only the Sheriff has a desk').toBeNull();
    const lena = money(w.game, 'lena');
    const brix = money(w.game, 'brix');
    expect(() => w.game.handle('lena', { type: 'fine', order: id, amount: 100 })).toThrow(new RuleError('Only the Sheriff fines'));
    expect(() => w.game.handle('brix', { type: 'fine', order: id, amount: 75 })).toThrow(RuleError);
    w.game.handle('brix', { type: 'fine', order: id, amount: 100 });

    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      expect(view.politics!.sabotage!.incidents[0]!.fine, String(viewer)).toEqual({ due: 100, paid: 100, toVictim: share, by: 'sheriff' });
      expect(view.news[0], String(viewer)).toBe(`Lena was fined 100 for sabotage; ${share} to Brix.`);
    }
    expect(money(w.game, 'lena')).toBe(lena - 100);
    expect(money(w.game, 'brix'), 'the victim gets their share through the fund').toBe(brix + share);
    expect(w.game.viewFor('brix').me!.politics!.sheriff!.fineable).toEqual([]);
    expect(w.notices.filter((n) => n.kind === 'fine')).toEqual([expect.objectContaining({ kind: 'fine', order: id, culprit: 'lena', due: 100, paid: 100, toVictim: share })]);
    expect(w.notices.find((n) => n.kind === 'fine')).not.toHaveProperty('parties');
  });

  it('S4-T-AC-8: the notices of a month: a done order is public with culprit null, a failed one is private to its orderer, a void one is private and says nothing; none is made for an order placed, withdrawn or a guard posted', () => {
    const w = world();
    force('powerCut', true, false);
    force('rumour', false, false);
    w.game.handle('lena', cut(w.brixPlot));
    // Ossa places an order and takes it back in planning: nobody's business.
    w.game.handle('ossa', cut(w.brixPlot));
    w.game.handle('ossa', { type: 'sabotage', target: null });
    w.game.handle('ossa', { type: 'sabotage', target: { kind: 'rumour', good: 'food', dir: 'down' } });
    w.game.handle('brix', cut(w.ossaPlot));
    w.game.handle('brix', { type: 'guard', tiles: [w.ossaPlot] });
    expect(w.notices.filter((n) => ['sabotage', 'investigation', 'fine'].includes(n.kind)), 'nothing yet, not even a withdrawal').toEqual([]);
    // Ossa's plot loses its MULE before production: Brix's cut on it is void.
    w.state.tiles[w.ossaPlot]!.outfit = null;
    until(w, 'production');
    expect(orders(w), 'the void order is gone').toHaveLength(2);
    const [lena, ossa] = orders(w);
    const sab = w.notices.filter((n) => n.kind === 'sabotage');
    expect(sab).toHaveLength(3);
    expect(sab).toContainEqual({ kind: 'sabotage', order: lena!.id, target: 'powerCut', victim: 'brix', outcome: 'done', culprit: null, month: 1, phase: 'production' });
    expect(sab).toContainEqual({ kind: 'sabotage', order: ossa!.id, target: 'rumour', victim: null, outcome: 'failed', culprit: 'ossa', parties: ['ossa'], month: 1, phase: 'production' });
    const voided = sab.find((n) => n.kind === 'sabotage' && n.outcome === 'void')!;
    expect(voided).toMatchObject({ target: 'powerCut', victim: null, culprit: 'brix', parties: ['brix'] });
    // The void is on the orderer's own list and nowhere else: not the public incidents, no other phone, not the board.
    const voidId = (voided as { order: string }).order;
    for (const viewer of VIEWERS) {
      expect(where(w.game.viewFor(viewer), voidId), String(viewer)).toEqual(viewer === 'brix' ? ['.me.politics.sabotage.mine.*.id'] : []);
    }
    const { x, y } = { x: w.ossaPlot % w.state.width, y: Math.floor(w.ossaPlot / w.state.width) };
    expect(w.game.viewFor('brix').me!.politics!.sabotage!.mine).toContainEqual({
      id: voidId, month: 1, kind: 'powerCut', victim: null, at: { x, y }, good: null, worked: false, culprit: 'brix', how: null, investigated: false, fine: null, public: false, outcome: 'void',
    });
    expect(w.game.viewFor('brix').me!.politics!.sabotage!.owed, 'a void order is not charged').toBe(0);
    for (const viewer of VIEWERS) expect(w.game.viewFor(viewer).news.join(' '), String(viewer)).not.toMatch(/Ossa's .* plot\.$|void/);
  });

  it('S4-T-AC-8: when planning closes on an unfined caught case, the standard fine is the first news line of the phase that opens (the land grant writes none of its own)', () => {
    const w = world();
    force('powerCut', true, true);
    w.game.handle('lena', cut(w.brixPlot));
    until(w, 'planning', 2);
    expect(w.state.politics!.sabotage[0]).toMatchObject({ culpritPublic: true });
    for (const id of ['lena', 'brix', 'ossa']) w.game.handle(id, { type: 'ready' });
    expect(w.state.phase, 'planning closed').not.toBe('planning');
    for (const viewer of VIEWERS) expect(w.game.viewFor(viewer).news[0], String(viewer)).toBe(`Lena was fined ${POLITICS.sheriff.fine.standard} for sabotage; ${Math.round(POLITICS.sheriff.fine.standard * POLITICS.sheriff.victimShare)} to Brix.`);
  });

  it('S4-T-AC-8: the news is a ring of three with the phase headline first: three caught cases never push out the harvest line, and three fines at the last upkeep never push out the game-over line', () => {
    const w = world(1);
    force('powerCut', true, true);
    force('rumour', true, true);
    w.game.handle('lena', cut(w.ossaPlot));
    w.game.handle('brix', { type: 'sabotage', target: { kind: 'rumour', good: 'food', dir: 'up' } });
    w.game.handle('ossa', cut(w.brixPlot));
    until(w, 'production');
    for (const viewer of VIEWERS) {
      const news = w.game.viewFor(viewer).news;
      expect(news, String(viewer)).toHaveLength(3);
      expect(news[0], String(viewer)).toMatch(/^Harvest is in/);
      expect(news.slice(1).every((line) => line.startsWith('Caught!')), String(viewer)).toBe(true);
    }
    until(w, 'gameOver');
    expect(w.state.politics!.sabotage.filter((o) => o.fine)).toHaveLength(3);
    for (const viewer of VIEWERS) {
      const news = w.game.viewFor(viewer).news;
      expect(news[0], String(viewer)).toMatch(/^Game over\./);
      expect(news.slice(1).every((line) => /was fined \d+ for sabotage/.test(line)), String(viewer)).toBe(true);
    }
  });
});

describe('S4-T-AC-14 (server): only sabotage is an incident', () => {
  it('S4-T-AC-14: only sabotage incidents are in the incidents list; a walkout files its event but is not investigable', () => {
    const w = world();
    force('powerCut', true, false);
    w.game.handle('lena', cut(w.ossaPlot));
    until(w, 'production');
    // A walkout through the events path: filed in production like any colony event.
    const walkout = plotEvent(w.state, 'walkout', w.ossaPlot);
    w.state.monthEvents.push(walkout);
    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      const events = view.production!.events;
      const shown = events.find((e) => e.key === 'walkout')!;
      expect(shown.kind, String(viewer)).not.toBe('sabotage');
      expect(shown.title, String(viewer)).not.toMatch(/^Sabotage/);
      expect(shown.sabotage, `${viewer}: a walkout carries no sabotage`).toBeUndefined();
      const sab = events.filter((e) => e.kind === 'sabotage');
      expect(sab.every((e) => e.sabotage !== undefined && e.title.startsWith('Sabotage')), String(viewer)).toBe(true);
      expect(view.politics!.sabotage!.incidents.map((i) => i.id), String(viewer)).toEqual([orders(w)[0]!.id]);
    }
    until(w, 'planning', 2);
    expect(() => w.game.handle('brix', { type: 'investigate', order: 'walkout' })).toThrow(new RuleError('No such incident'));
    expect(() => w.game.handle('brix', { type: 'investigate', order: 'sab-zzzzzz' })).toThrow(new RuleError('No such incident'));
  });

  it('S4-T-AC-14: a sabotage event reaches the screen with its sabotage field copied field by field (order, culprit, worked, guarded)', () => {
    const w = world();
    force('powerCut', true, false);
    w.game.handle('lena', cut(w.ossaPlot));
    until(w, 'production');
    const event = w.game.viewFor(null).production!.events.find((e) => e.kind === 'sabotage')!;
    expect(Object.keys(event.sabotage!).sort()).toEqual(['culprit', 'guarded', 'order', 'worked']);
  });
});

describe('S4-C13: an AI seat\'s moves reach the same handle as a phone\'s', () => {
  const aiAct = (game: MuleGame, seat: string, action: object) => (game as unknown as { aiAct(seat: string, action: object): boolean }).aiAct(seat, action);

  it('S4-T-AC-8 (AI seats): an AI Sheriff\'s guard lands in the engine; a refused AI move returns false', () => {
    const w = world();
    w.state.politics = { ...w.state.politics!, sheriff: 'ai1' };
    expect(aiAct(w.game, 'ai1', { type: 'guard', tiles: [w.ossaPlot] })).toBe(true);
    expect(w.state.politics!.guards, 'the guard landed').toEqual([w.ossaPlot]);
    expect(w.game.viewFor('ai1').me!.politics!.sheriff!.guards).toEqual([w.ossaPlot]);
    expect(aiAct(w.game, 'ai1', { type: 'investigate', order: 'sab-nothing' }), 'a refused move').toBe(false);
    expect(aiAct(w.game, 'lena', { type: 'guard', tiles: [w.ossaPlot] }), 'a non-Sheriff\'s guard').toBe(false);
  });

  it('S4-T-AC-8 (AI seats): an AI seat\'s order lands in the engine under its own id', () => {
    const w = world();
    expect(aiAct(w.game, 'ai1', cut(w.ossaPlot))).toBe(true);
    expect(orders(w).map((o) => [o.by, o.outcome])).toEqual([['ai1', 'pending']]);
    expect(wire(w.game, 'lena')).not.toContain(orders(w)[0]!.id);
  });
});

/** Every seat plays Classic: no Claude call to record. */
const classic: BrainService = { deciderFor: () => null, writerFor: () => null, chatter: (seat, say) => chatter(seat.id, say), finish: () => {} };
const KEY_VAR = 'ANTHROPIC_API_KEY';
const SEED = 21;

describe('S4-RULE-12 (the record): orders and guards are in the record and replay', () => {
  it('S4-T-AC-8 (record): a recorded game with an order, a guard and a fine replays to the same state hash with the key unset', { timeout: 120_000 }, async () => {
    const savedKey = process.env[KEY_VAR];
    delete process.env[KEY_VAR];
    try {
      // Month 1 has its election, and the order is caught for sure: the case can be fined.
      POLITICS.electionMonths = [1];
      force('rumour', true, true);
      // As createRecordedGame builds it, keeping the game itself so the test can read the state at game over.
      const fake = fakeContext({});
      const options = { maxMonths: 3, politics: true };
      const recorder = new Recorder(fake.ctx, SEED, options, classic, null);
      let final: GameState | null = null;
      const inner = new MuleGame(recorder.ctx, SEED, {
        ...options,
        brain: recorder.brain,
        recordPlaybook: (entry) => recorder.playbook(entry),
        onGameOver: (state) => {
          final = structuredClone(state);
          recorder.gameOver(state);
        },
      });
      const game = recorder.wrap(inner);
      const state = () => (inner as unknown as { state: GameState }).state;
      const send = (seat: string, intent: MuleIntent) => {
        try {
          game.handle(seat, intent);
        } catch (err) {
          if (!(err instanceof RuleError)) throw err;
        }
      };
      const sent = new Set<string>();
      const once = (key: string, seat: string, intent: MuleIntent) => {
        if (sent.has(key)) return;
        sent.add(key);
        send(seat, intent);
      };

      // The plot changes hands to the orderer after the order is given (a sale, a swap): the same fixture in the game and in
      // its replay (the replay plays the intents, not this), so the order is void at production in both.
      const realHandle = MuleGame.prototype.handle;
      vi.spyOn(MuleGame.prototype, 'handle').mockImplementation(function (this: MuleGame, seat: string, intent: MuleIntent) {
        realHandle.call(this, seat, intent);
        if (seat === 's1' && intent.type === 'sabotage' && intent.target?.kind === 'powerCut') (this as unknown as { state: GameState }).state.tiles[intent.target.tile]!.owner = 's1';
      });
      // The replayed game's view of Heiko at its end: the replay disposes the game it ran, and the spy reads it first.
      let replayedMine: unknown = null;
      const realDispose = MuleGame.prototype.dispose;
      vi.spyOn(MuleGame.prototype, 'dispose').mockImplementation(function (this: MuleGame) {
        if (inReplay) replayedMine = this.viewFor('s1').me!.politics!.sabotage!.mine;
        return realDispose.call(this);
      });
      let inReplay = false;
      game.start(seats);
      for (let i = 0; i < 200_000 && !final; i++) {
        const view = game.viewFor(null);
        const election = view.politics?.election ?? null;
        if (view.phase === 'planning' && election?.stage === 'announce') {
          once('run-gov', 's1', { type: 'run', office: 'governor', promise: { kind: 'hold' } });
          once('run-sheriff', 's2', { type: 'run', office: 'sheriff' });
        }
        if (view.phase === 'planning' && election?.stage === 'ballot') {
          for (const seat of ['s1', 's2']) {
            once(`gov-${seat}`, seat, { type: 'vote', office: 'governor', candidate: 's1' });
            once(`sheriff-${seat}`, seat, { type: 'vote', office: 'sheriff', candidate: 's2' });
          }
        }
        const votesOver = !election || election.stage === 'over';
        // Month 1, the votes over: Heiko orders a rumour. Land grant: he claims a plot.
        if (view.phase === 'planning' && view.month === 1 && votesOver) once('order', 's1', { type: 'sabotage', target: { kind: 'rumour', good: 'food', dir: 'up' } });
        if (view.phase === 'landGrant') {
          const lit = game.viewFor('s1').lit;
          if (lit) once('claim', 's1', { type: 'claim', ...lit });
        }
        // Month 2's planning: Heiko orders a power cut on a worked plot of another seat, which changes hands to him before production.
        if (view.phase === 'planning' && view.month === 2 && votesOver) {
          const target = state().tiles.findIndex((t) => t.owner !== null && t.owner !== 's1' && ['food', 'energy', 'smithore', 'crystite'].includes(t.outfit ?? ''));
          if (target >= 0) once('cut', 's1', { type: 'sabotage', target: { kind: 'powerCut', tile: target } });
        }
        // Month 2's planning: if Mia is the Sheriff she guards that plot and fines the caught order.
        if (view.phase === 'planning' && view.month === 2 && votesOver && view.politics?.sheriff === 's2') {
          const plot = state().tiles.findIndex((t) => t.owner === 's1');
          if (plot >= 0) once('guard', 's2', { type: 'guard', tiles: [plot] });
          const caught = state().politics!.sabotage.find((o) => o.culpritPublic && !o.fine);
          if (caught) once('fine', 's2', { type: 'fine', order: caught.id, amount: 100 });
        }
        const phase = game.viewFor(null).phase;
        if (phase === 'planning' || phase === 'upkeep') for (const s of seats) if (!s.isAi && game.viewFor(null).phase === phase) game.handle(s.id, { type: 'ready' });
        const now = game.viewFor(null);
        const pick = now.phase === 'auction' && now.auction?.stage === 'status' ? now.auction : null;
        if (pick && !(now.eventShow?.held && fake.ctx.now() < now.eventShow.endsAt))
          for (const s of seats) if (!s.isAi && !pick.walkers.find((w) => w.id === s.id)?.done) game.handle(s.id, { type: 'ready' });
        fake.advance(100);
      }
      expect(final, 'the game reached game over').not.toBeNull();
      await new Promise((resolve) => setImmediate(resolve));
      const record = JSON.parse(JSON.stringify(recorder.finished)) as NonNullable<typeof recorder.finished>;

      const accepted = (type: string) => record.events.filter((e) => e.type === 'intent' && e.intent.type === type && e.refused === undefined);
      expect(accepted('sabotage'), 'the rumour and the cut are in the record').toHaveLength(2);
      expect(accepted('guard'), 'the guard is in the record').toHaveLength(1);
      expect(accepted('fine'), 'the fine is in the record').toHaveLength(1);
      const order = (final! as GameState).politics!.sabotage[0]!;
      expect(order).toMatchObject({ by: 's1', outcome: 'caught', culpritPublic: true, fine: { by: 'sheriff', base: 100 } });

      // Heiko's void order (month 2) is on his own list at the end, and nowhere else.
      const voidedOrder = (inner.viewFor('s1').me!.politics!.sabotage!.mine).find((o) => o.outcome === 'void');
      expect(voidedOrder, 'the void order is on his list').toMatchObject({ month: 2, kind: 'powerCut', culprit: 's1', public: false, how: null });
      for (const viewer of ['s2', 's3', null]) expect(JSON.stringify(inner.viewFor(viewer)), String(viewer)).not.toContain(voidedOrder!.id);

      inReplay = true;
      const result = await replay(record);
      inReplay = false;
      expect(replayedMine, 'the replayed game tells Heiko the same list').toEqual(inner.viewFor('s1').me!.politics!.sabotage!.mine);
      expect(result.stateHash.replayed).toBe(record.outcome!.stateHash);
      expect(result.identical).toBe(true);
    } finally {
      if (savedKey !== undefined) process.env[KEY_VAR] = savedKey;
    }
  });
});
