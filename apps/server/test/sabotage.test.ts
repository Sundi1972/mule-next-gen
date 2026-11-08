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
function world() {
  const notices: Notice[] = [];
  const fake = fakeContext({ table: TABLE });
  const game = new MuleGame(fake.ctx, 10, { politics: true, notice: (n) => notices.push(n) });
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
      expect(text, `${viewer}: the 120 cr crew`).not.toContain('"owed":120');
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
      if (viewer !== 'lena') {
        expect(text, `${viewer}: no culprit anywhere`).not.toContain('"culprit":"lena"');
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
  });

  it('S4-B-AC-4: a cold trail shows on every screen at once and names nobody; a second investigation that month is refused', () => {
    const { w, id } = unsolved(0);
    const rep = reputation(w.game, null, 'lena');
    w.game.handle('brix', { type: 'investigate', order: id });
    for (const viewer of VIEWERS) {
      const view = w.game.viewFor(viewer);
      expect(view.politics!.sabotage!.incidents, String(viewer)).toMatchObject([{ id, culprit: null, how: null, investigated: true }]);
      expect(view.news[0], String(viewer)).toBe("The trail went cold on the power cut on Ossa's Food plot.");
      expect(reputation(w.game, viewer, 'lena'), String(viewer)).toBe(rep);
      if (viewer !== 'lena') expect(JSON.stringify(view), String(viewer)).not.toContain('"culprit":"lena"');
    }
    expect(w.notices.filter((n) => n.kind === 'investigation')).toEqual([expect.objectContaining({ order: id, solved: false, culprit: null })]);
    expect(() => w.game.handle('brix', { type: 'investigate', order: id })).toThrow(new RuleError('One investigation a month'));
    // A refusal changes nothing: still one investigation recorded.
    expect(orders(w)[0]!.investigated).toBe(2);
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
      expect(view.politics!.sabotage!.incidents[0]!.fine, String(viewer)).toEqual({ due: 100, paid: 100, toVictim: 50, by: 'sheriff' });
      expect(view.news[0], String(viewer)).toBe('Lena was fined 100 for sabotage; 50 to Brix.');
    }
    expect(money(w.game, 'lena')).toBe(lena - 100);
    expect(money(w.game, 'brix'), 'the victim gets half through the fund').toBe(brix + 50);
    expect(w.game.viewFor('brix').me!.politics!.sheriff!.fineable).toEqual([]);
    expect(w.notices.filter((n) => n.kind === 'fine')).toEqual([expect.objectContaining({ kind: 'fine', order: id, culprit: 'lena', due: 100, paid: 100, toVictim: 50 })]);
    expect(w.notices.find((n) => n.kind === 'fine')).not.toHaveProperty('parties');
  });

  it('S4-T-AC-8: the notices of a month: a done order is public with culprit null, a caught one names her, a failed one is private to its orderer; none is made for an order placed or a guard posted', () => {
    const w = world();
    force('powerCut', true, false);
    force('rumour', false, false);
    w.game.handle('lena', cut(w.ossaPlot));
    w.game.handle('ossa', { type: 'sabotage', target: { kind: 'rumour', good: 'food', dir: 'down' } });
    w.game.handle('brix', { type: 'guard', tiles: [w.brixPlot] });
    expect(w.notices.filter((n) => ['sabotage', 'investigation', 'fine'].includes(n.kind)), 'nothing yet').toEqual([]);
    until(w, 'production');
    const [lena, ossa] = orders(w);
    const sab = w.notices.filter((n) => n.kind === 'sabotage');
    expect(sab).toContainEqual({ kind: 'sabotage', order: lena!.id, target: 'powerCut', victim: 'ossa', outcome: 'done', culprit: null, month: 1, phase: 'production' });
    expect(sab).toContainEqual({ kind: 'sabotage', order: ossa!.id, target: 'rumour', victim: null, outcome: 'failed', culprit: 'ossa', parties: ['ossa'], month: 1, phase: 'production' });
    expect(sab).toHaveLength(2);
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

  it('S4-C13: an AI Sheriff\'s guard lands in the engine; a refused AI move returns false', () => {
    const w = world();
    w.state.politics = { ...w.state.politics!, sheriff: 'ai1' };
    expect(aiAct(w.game, 'ai1', { type: 'guard', tiles: [w.ossaPlot] })).toBe(true);
    expect(w.state.politics!.guards, 'the guard landed').toEqual([w.ossaPlot]);
    expect(w.game.viewFor('ai1').me!.politics!.sheriff!.guards).toEqual([w.ossaPlot]);
    expect(aiAct(w.game, 'ai1', { type: 'investigate', order: 'sab-nothing' }), 'a refused move').toBe(false);
    expect(aiAct(w.game, 'lena', { type: 'guard', tiles: [w.ossaPlot] }), 'a non-Sheriff\'s guard').toBe(false);
  });

  it('S4-C13: an AI seat\'s order lands in the engine under its own id', () => {
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
  it('S4-RULE-12: a recorded game with an order, a guard and a fine replays to the same state hash with the key unset', { timeout: 120_000 }, async () => {
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
      expect(accepted('sabotage'), 'the order is in the record').toHaveLength(1);
      expect(accepted('guard'), 'the guard is in the record').toHaveLength(1);
      expect(accepted('fine'), 'the fine is in the record').toHaveLength(1);
      const order = (final! as GameState).politics!.sabotage[0]!;
      expect(order).toMatchObject({ by: 's1', outcome: 'caught', culpritPublic: true, fine: { by: 'sheriff', base: 100 } });

      const result = await replay(record);
      expect(result.stateHash.replayed).toBe(record.outcome!.stateHash);
      expect(result.identical).toBe(true);
    } finally {
      if (savedKey !== undefined) process.env[KEY_VAR] = savedKey;
    }
  });
});
