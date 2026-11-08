import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  createGame,
  castVote,
  createRng,
  electionDone,
  guardsMax,
  observe,
  POLITICS,
  runFor,
  score,
  stepElection,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type DealCard,
  type GameState,
  type Good,
  type Office,
  type Rng,
  type SabotageOrder,
  type SabotageTarget,
} from '@mule/engine';
import type { Act, AiAction } from '../src/actions.js';
import { SabotageHand } from '../src/hands/sabotage.js';
import { SheriffHand } from '../src/hands/sheriff.js';
import { ownVote, VoteHand } from '../src/hands/vote.js';
import { captureCost, guardValue, investigateValue, sabotageGain } from '../src/politics-value.js';
import { AiSeat } from '../src/seat.js';
import { cashReserve, type Mind } from '../src/value.js';

// WS1's four values are 0 stubs until S4-PR-3, so each row sets what it compares: they are doubles here, and no row asserts on a stub's 0.
vi.mock('../src/politics-value.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/politics-value.js')>()),
  sabotageGain: vi.fn(() => 0),
  captureCost: vi.fn(() => 0),
  guardValue: vi.fn(() => 0),
  investigateValue: vi.fn(() => 0),
}));

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const gain = vi.mocked(sabotageGain);
const capture = vi.mocked(captureCost);
const guardWorth = vi.mocked(guardValue);
const investigateWorth = vi.mocked(investigateValue);

// Defaults are off (AM-2): every test sets the switch and both offices, and what it changed comes back.
const SAVED = {
  on: POLITICS.sabotage.on,
  offices: [...POLITICS.offices],
  ai: structuredClone(POLITICS.ai.sabotage),
};
beforeEach(() => {
  POLITICS.sabotage.on = true;
  POLITICS.offices = ['governor', 'sheriff'];
  for (const m of [gain, capture, guardWorth, investigateWorth]) m.mockReset().mockReturnValue(0);
});
afterEach(() => {
  POLITICS.sabotage.on = SAVED.on;
  POLITICS.offices = [...SAVED.offices];
  Object.assign(POLITICS.ai.sabotage, structuredClone(SAVED.ai));
});

function mindOf(me: string, persona: AiPersonaId, level: AiLevelId = 'trader', seed = 1): Mind {
  return new AiSeat({ id: me, name: me, persona, level, seed }).mind;
}

/**
 * Month 3's planning, ai0 Governor, ai1 Sheriff, the council over. ai1 owns tiles A and B and ai2 tile C and ai3 tile D, each
 * working (a crystite, a food, a water and an energy plot); ai0 owns none.
 */
function table(seed = 7): { state: GameState; plots: Record<'A' | 'B' | 'C' | 'D', number> } {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 3;
  state.phase = 'planning';
  const free = state.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.terrain !== 'store' && t.owner === null);
  const give = (owner: string, outfit: Good) => {
    const { t, i } = free.shift()!;
    Object.assign(t, { owner, outfit });
    return i;
  };
  const plots = { A: give('ai1', 'crystite'), B: give('ai1', 'food'), C: give('ai2', 'water'), D: give('ai3', 'energy') };
  state.politics = { ...state.politics!, governor: 'ai0', sheriff: 'ai1', election: null, council: null, baron: null };
  return { state, plots };
}

/** A recording act: every move a hand sends, answered true. */
function recorder(): { sent: AiAction[]; act: Act } {
  const sent: AiAction[] = [];
  return { sent, act: (action) => (sent.push(action), true) };
}

function caseOf(partial: Partial<SabotageOrder> & { id: string }): SabotageOrder {
  return { by: 'ai2', month: 2, target: { kind: 'rumour', good: 'food', dir: 'up' }, cost: 0, outcome: 'done', culpritPublic: false, ...partial };
}

function withOrders(state: GameState, orders: SabotageOrder[]): void {
  state.politics = { ...state.politics!, sabotage: orders };
}

const cut = (tile: number): SabotageTarget => ({ kind: 'powerCut', tile });

/** The gain a row gives each target; 0 for any other. */
function gains(by: (target: SabotageTarget) => number): void {
  gain.mockImplementation((_obs, _me, order) => by(order.target));
}

describe('S4-T-AC-9: SabotageHand per S4-RULE-13 (order)', () => {
  const run = (state: GameState, mind: Mind) => {
    const { sent, act } = recorder();
    new SabotageHand(mind).order(observe(state, mind.me), act);
    return sent;
  };
  const SABOTEUR = () => mindOf('ai0', 'saboteur');

  beforeEach(() => {
    POLITICS.ai.sabotage.orderChance.saboteur = 1;
  });

  it("S4-T-AC-9 row 1: a Tycoon Saboteur takes the target with the best net, 1.5 x 240 - 120 - 0.3 x 300 = 150, over a dearer-looking worse one", () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 240 : t.kind === 'powerCut' && t.tile === plots.C ? 200 : 0));
    capture.mockReturnValue(300);
    expect(run(state, SABOTEUR())).toEqual([{ type: 'sabotage', target: cut(plots.A) }]);
    // It asks WS1's values about the seat itself and a pending order literal (id '', outcome 'pending', the kind's cost).
    expect(gain).toHaveBeenCalledWith(expect.anything(), 'ai0', expect.objectContaining({ id: '', by: 'ai0', outcome: 'pending', cost: POLITICS.sabotage.orders.powerCut.cost }));
  });

  it('S4-T-AC-9 row 1: a rumour is a candidate too, on each good, up and down, and is paid its own crew cost', () => {
    const { state } = table();
    gains((t) => (t.kind === 'rumour' && t.good === 'crystite' && t.dir === 'down' ? 500 : 0));
    expect(run(state, SABOTEUR())).toEqual([{ type: 'sabotage', target: { kind: 'rumour', good: 'crystite', dir: 'down' } }]);
  });

  it('S4-T-AC-9 row 2: a best net below minEdge orders nothing; at minEdge it orders', () => {
    const { state, plots } = table();
    capture.mockReturnValue(300);
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 240 : 0));
    POLITICS.ai.sabotage.minEdge = 151;
    expect(run(state, SABOTEUR())).toEqual([]);
    POLITICS.ai.sabotage.minEdge = 150;
    expect(run(state, SABOTEUR())).toHaveLength(1);
  });

  it('S4-T-AC-9 row 1: the captureOdds term counts: the same gain, a dearer capture, no order', () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 240 : 0));
    POLITICS.ai.sabotage.minEdge = 150; // net 1.5 x 240 - 120 - 0.3 x capture
    capture.mockReturnValue(300);
    expect(run(state, SABOTEUR())).toHaveLength(1);
    capture.mockReturnValue(301);
    expect(run(state, SABOTEUR())).toEqual([]);
  });

  it('S4-T-AC-9 row 1: the crew must be affordable above the cash reserve: one credit short, nothing; exactly enough, an order', () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 1_000 : 0));
    const mind = SABOTEUR();
    const need = POLITICS.sabotage.orders.powerCut.cost + cashReserve(observe(state, 'ai0'), mind);
    state.players.find((p) => p.id === 'ai0')!.money = need - 1;
    expect(run(state, mind)).toEqual([]);
    state.players.find((p) => p.id === 'ai0')!.money = need;
    expect(run(state, mind)).toHaveLength(1);
  });

  it("S4-T-AC-9 row 1: the persona's chance gates the order: 0 never orders", () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 1_000 : 0));
    POLITICS.ai.sabotage.orderChance.saboteur = 0;
    expect(run(state, SABOTEUR())).toEqual([]);
  });

  it("S4-T-AC-9 row 1: a victim who was caught sabotaging this seat counts grudge times: of two equal plots it picks the grudge's", () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' ? 100 : 0));
    // Without the grudge the first of two equal plots (ai1's A) wins.
    expect(run(state, SABOTEUR())).toEqual([{ type: 'sabotage', target: cut(plots.A) }]);
    withOrders(state, [caseOf({ id: 'sab-aaaaaa', by: 'ai2', target: cut(plots.C), outcome: 'caught', culpritPublic: true, victim: 'ai0' })]);
    expect(run(state, SABOTEUR())).toEqual([{ type: 'sabotage', target: cut(plots.C) }]);
  });

  it('S4-T-AC-9 row 1: a grudge is only for a culprit who is public: a hidden culprit against this seat earns none', () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' ? 100 : 0));
    withOrders(state, [caseOf({ id: 'sab-aaaaaa', by: 'ai2', target: cut(plots.C), outcome: 'done', culpritPublic: false, victim: 'ai0' })]);
    expect(run(state, SABOTEUR())).toEqual([{ type: 'sabotage', target: cut(plots.A) }]);
  });

  it("S4-T-AC-9 row 1: never a plot of its own, and never a plot the observe copy shows guarded", () => {
    const { state, plots } = table();
    Object.assign(state.tiles[plots.C]!, { owner: 'ai0' });
    gains((t) => (t.kind === 'powerCut' ? (t.tile === plots.C ? 900 : t.tile === plots.A ? 500 : 100) : 0));
    expect(run(state, SABOTEUR())).toEqual([{ type: 'sabotage', target: cut(plots.A) }]);
    const obs = observe(state, 'ai0');
    obs.politics!.guards = [plots.A];
    const { sent, act } = recorder();
    new SabotageHand(SABOTEUR()).order(obs, act);
    expect(sent).toEqual([{ type: 'sabotage', target: cut(plots.B) }]);
  });

  it('S4-T-AC-9 row 2: with an order of its own already pending this month it orders nothing more', () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' ? 100 : 0));
    withOrders(state, [caseOf({ id: 'sab-bbbbbb', by: 'ai0', month: 3, target: cut(plots.A), outcome: 'pending', cost: 120 })]);
    expect(run(state, SABOTEUR())).toEqual([]);
  });

  it('S4-T-AC-9 B-AC-9: a Rookie never orders, whatever the value says', () => {
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 1e6 : 0));
    POLITICS.ai.sabotage.orderChance.saboteur = 1;
    expect(run(state, mindOf('ai0', 'saboteur', 'rookie'))).toEqual([]);
  });

  it.each(['trader', 'cautious'] as const)('S4-T-AC-9 B-AC-9: a %s (spite 0) never orders, whatever the value and the chance say', (persona) => {
    expect(AI_PERSONAS[persona].spite).toBe(0);
    const { state, plots } = table();
    gains((t) => (t.kind === 'powerCut' && t.tile === plots.A ? 1e6 : 0));
    POLITICS.ai.sabotage.orderChance[persona] = 1;
    expect(run(state, mindOf('ai0', persona))).toEqual([]);
  });
});

describe('S4-T-AC-9: SheriffHand per S4-RULE-13 (guard, investigate, fine)', () => {
  const run = (state: GameState, mind: Mind = mindOf('ai1', 'cautious')) => {
    const { sent, act } = recorder();
    new SheriffHand(mind).run(observe(state, mind.me), act);
    return sent;
  };
  const guards = (sent: AiAction[]) => sent.filter((a) => a.type === 'guard');

  it('S4-T-AC-9 guard: the guardsMax plots with the highest guardValue, the highest first', () => {
    const { state, plots } = table();
    const worth: Record<number, number> = { [plots.A]: 10, [plots.B]: 30, [plots.C]: 20, [plots.D]: 5 };
    guardWorth.mockImplementation((_obs, _me, plot) => worth[plot] ?? 0);
    expect(guardsMax(observe(state, 'ai1'))).toBe(POLITICS.sheriff.guards);
    expect(guards(run(state))).toEqual([{ type: 'guard', tiles: [plots.B, plots.C] }]);
  });

  it('S4-T-AC-9 guard: a tie at the cut is a draw from its own stream, the same every time it is asked', () => {
    const { state, plots } = table();
    guardWorth.mockReturnValue(5);
    const first = guards(run(state))[0];
    expect(first?.type === 'guard' && first.tiles).toHaveLength(POLITICS.sheriff.guards);
    for (const tile of first?.type === 'guard' ? first.tiles : []) expect(Object.values(plots)).toContain(tile);
    expect(guards(run(state))).toEqual(guards(run(state)));
  });

  it('S4-T-AC-9 guard: a plot worth nothing to guard is not posted', () => {
    const { state, plots } = table();
    guardWorth.mockImplementation((_obs, _me, plot) => (plot === plots.C ? 40 : 0));
    expect(guards(run(state))).toEqual([{ type: 'guard', tiles: [plots.C] }]);
  });

  it("S4-T-AC-9 guard: a Rookie posts a seeded pick among the players' working plots, asking no value", () => {
    const { state, plots } = table();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sent = guards(run(state, mindOf('ai1', 'cautious', 'rookie', seed)));
      expect(sent).toHaveLength(1);
      const posted = sent[0]!.type === 'guard' ? sent[0]!.tiles : [];
      expect(posted).toHaveLength(POLITICS.sheriff.guards);
      expect(new Set(posted).size, `seed ${seed} posts distinct plots`).toBe(posted.length);
      for (const tile of posted) expect(Object.values(plots)).toContain(tile);
    }
    expect(guardWorth).not.toHaveBeenCalled();
  });

  const hidden = (id: string, extra: Partial<SabotageOrder> = {}) => caseOf({ id, by: null, outcome: 'done', culpritPublic: false, ...extra });

  it('S4-T-AC-9 investigate: the public case with the culprit unknown and the highest investigateValue, if above 0', () => {
    const { state } = table();
    withOrders(state, [hidden('sab-aaaaaa'), hidden('sab-bbbbbb'), hidden('sab-cccccc')]);
    const worth: Record<string, number> = { 'sab-aaaaaa': 5, 'sab-bbbbbb': 9, 'sab-cccccc': 2 };
    investigateWorth.mockImplementation((_obs, _me, suspect) => worth[suspect.id] ?? 0);
    expect(run(state).filter((a) => a.type === 'investigate')).toEqual([{ type: 'investigate', order: 'sab-bbbbbb' }]);
  });

  it('S4-T-AC-9 investigate: a solved case or one already investigated is skipped; a value of 0 or less investigates nothing', () => {
    const { state } = table();
    withOrders(state, [
      hidden('sab-aaaaaa', { culpritPublic: true, by: 'ai2' }),
      hidden('sab-bbbbbb', { investigated: 2 }),
      hidden('sab-cccccc'),
    ]);
    investigateWorth.mockReturnValue(9);
    expect(run(state).filter((a) => a.type === 'investigate')).toEqual([{ type: 'investigate', order: 'sab-cccccc' }]);
    investigateWorth.mockReturnValue(0);
    expect(run(state).filter((a) => a.type === 'investigate')).toEqual([]);
  });

  it('S4-T-AC-9 investigate: a Rookie takes the newest eligible case, asking no value', () => {
    const { state } = table();
    withOrders(state, [hidden('sab-aaaaaa'), hidden('sab-bbbbbb'), hidden('sab-cccccc', { investigated: 2 })]);
    expect(run(state, mindOf('ai1', 'cautious', 'rookie')).filter((a) => a.type === 'investigate')).toEqual([{ type: 'investigate', order: 'sab-bbbbbb' }]);
    expect(investigateWorth).not.toHaveBeenCalled();
  });

  /** A revealed, unfined case against `culprit`. */
  const revealed = (id: string, culprit: string) => caseOf({ id, by: culprit, outcome: 'caught', culpritPublic: true, victim: 'ai3' });
  const fines = (sent: AiAction[]) => sent.flatMap((a) => (a.type === 'fine' ? [{ order: a.order, amount: a.amount }] : []));

  it('S4-T-AC-9 fine: the leader pays the leader base, a pact partner the partner base, anyone else the standard', () => {
    const { state } = table();
    state.players.find((p) => p.id === 'ai2')!.money = 90_000; // the Worth leader
    const obs = observe(state, 'ai1');
    expect(obs.players.reduce((best, p) => (score(obs, p.id) > score(obs, best.id) ? p : best)).id).toBe('ai2');
    const pact: DealCard = { id: 'deal-pact', from: 'ai1', to: 'ai0', terms: { kind: 'pact' }, offered: 1, until: 9, status: 'active', brokenBy: null, settled: null };
    // The leader is a pact partner too: the leader rule wins.
    const leaderPact: DealCard = { ...pact, id: 'deal-pact-2', to: 'ai2' };
    state.politics = { ...state.politics!, deals: [pact, leaderPact] };
    withOrders(state, [revealed('sab-aaaaaa', 'ai2'), revealed('sab-bbbbbb', 'ai0'), revealed('sab-cccccc', 'ai3')]);
    expect(fines(run(state))).toEqual([
      { order: 'sab-aaaaaa', amount: POLITICS.ai.sheriff.fine.leader },
      { order: 'sab-bbbbbb', amount: POLITICS.ai.sheriff.fine.partner },
      { order: 'sab-cccccc', amount: POLITICS.sheriff.fine.standard },
    ]);
    for (const amount of [POLITICS.ai.sheriff.fine.leader, POLITICS.ai.sheriff.fine.partner, POLITICS.sheriff.fine.standard]) expect(POLITICS.sheriff.fine.steps).toContain(amount);
  });

  it('S4-T-AC-9 fine: a Rookie levies the standard fine on every case', () => {
    const { state } = table();
    state.players.find((p) => p.id === 'ai2')!.money = 90_000;
    withOrders(state, [revealed('sab-aaaaaa', 'ai2'), revealed('sab-cccccc', 'ai3')]);
    expect(fines(run(state, mindOf('ai1', 'cautious', 'rookie')))).toEqual([
      { order: 'sab-aaaaaa', amount: POLITICS.sheriff.fine.standard },
      { order: 'sab-cccccc', amount: POLITICS.sheriff.fine.standard },
    ]);
  });

  it('S4-T-AC-9 fine: a case already fined is left alone', () => {
    const { state } = table();
    withOrders(state, [{ ...revealed('sab-aaaaaa', 'ai3'), fine: { base: 150, due: 150, paid: 0, toVictim: 0, by: 'sheriff', month: 2 } }]);
    expect(fines(run(state))).toEqual([]);
  });

  it('S4-T-AC-9: a seat that is not the Sheriff does nothing; nor does the Sheriff while the votes are open', () => {
    const { state } = table();
    withOrders(state, [revealed('sab-aaaaaa', 'ai3')]);
    guardWorth.mockReturnValue(9);
    expect(run(state, mindOf('ai2', 'cautious'))).toEqual([]);
    expect(run(state).length).toBeGreaterThan(0);
    state.politics = { ...state.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 'ai0', ballots: {}, done: [], result: null } };
    expect(run(state)).toEqual([]);
  });

  it('S4-T-AC-9: it fines a culprit an investigation of its own just named, in the same turn', () => {
    const { state } = table();
    withOrders(state, [hidden('sab-aaaaaa')]);
    investigateWorth.mockReturnValue(9);
    const { sent, act } = recorder();
    const solved = withOrderSolved(state);
    new SheriffHand(mindOf('ai1', 'cautious')).run(observe(state, 'ai1'), (action) => {
      act(action);
      if (action.type === 'investigate') solved();
      return true;
    }, () => observe(state, 'ai1'));
    expect(sent.map((a) => a.type).filter((t) => t !== 'guard')).toEqual(['investigate', 'fine']);
    expect(fines(sent)).toEqual([{ order: 'sab-aaaaaa', amount: POLITICS.sheriff.fine.standard }]);
  });

  function withOrderSolved(state: GameState): () => void {
    return () => withOrders(state, [{ ...state.politics!.sabotage[0]!, by: 'ai3', culpritPublic: true, victim: 'ai2' }]);
  }
});

describe('S4-T-AC-9: VoteHand votes on the sabotage ban by lawWorth (S4-RULE-13)', () => {
  const BAN = { kind: 'enact', law: 'sabotageBan', setting: 2 } as const;
  /** Month 3: ai2 stands revealed twice in the two months played, ai3 clean; ai0 governs. */
  function banTable(): GameState {
    const { state, plots } = table();
    withOrders(state, [
      caseOf({ id: 'sab-aaaaaa', by: 'ai2', target: cut(plots.A), outcome: 'caught', culpritPublic: true, month: 1 }),
      caseOf({ id: 'sab-bbbbbb', by: 'ai2', target: cut(plots.B), outcome: 'caught', culpritPublic: true, month: 2 }),
    ]);
    return state;
  }
  const voteOf = (state: GameState, me: string, level: AiLevelId = 'trader') => ownVote(observe(state, me), mindOf(me, 'cautious', level), { proposal: BAN });

  it('S4-T-AC-9: a seat the ban would fine votes no; a seat it costs nothing votes yes', () => {
    const state = banTable();
    expect(voteOf(state, 'ai2')).toBe(false);
    expect(voteOf(state, 'ai3')).toBe(true);
  });

  it("S4-T-AC-9 (AM-6): the ban's tie goes to the law in force: seats it costs nothing vote yes on the ban and no on its repeal, so one seat caught twice cannot repeal it", () => {
    const state = banTable();
    const enact = ['ai1', 'ai2', 'ai3'].map((id) => voteOf(state, id));
    expect(enact.filter(Boolean)).toHaveLength(2); // 2 to 1: ai2 is fined by it
    state.politics = { ...state.politics!, laws: { sabotageBan: { setting: 2, since: 1 } } };
    const repeal = (id: string) => ownVote(observe(state, id), mindOf(id, 'cautious'), { proposal: { kind: 'repeal', law: 'sabotageBan' } });
    expect(repeal('ai2')).toBe(true); // the ban costs it, so it saves by repealing
    expect(repeal('ai1')).toBe(false);
    expect(repeal('ai3')).toBe(false);
  });

  it('S4-T-AC-9: the Governor votes yes whatever it costs, and a Rookie leaves the vote to the council coin', () => {
    const state = banTable();
    state.politics = { ...state.politics!, governor: 'ai2' };
    expect(voteOf(state, 'ai2')).toBe(true);
    state.politics = { ...state.politics!, governor: 'ai0' };
    expect(voteOf(state, 'ai3', 'rookie')).toBeNull();
  });
});

describe('S4-T-AC-10: the new hands change no draw and read no seed', () => {
  /** A rng counted at every draw. */
  function counted(seed: number): Rng & { draws: () => number } {
    const rng = createRng(seed);
    let draws = 0;
    const tally = <F extends (...args: never[]) => unknown>(f: F) => ((...args: Parameters<F>) => (draws++, f(...args))) as F;
    return { next: tally(rng.next), int: tally(rng.int), pick: tally(rng.pick), chance: tally(rng.chance), weighted: tally(rng.weighted), draws: () => draws } as Rng & { draws: () => number };
  }

  /** Every value says yes and every coin lands, so the hands act as much as they can. */
  function eager(): void {
    gain.mockReturnValue(1e6);
    guardWorth.mockReturnValue(50);
    investigateWorth.mockReturnValue(50);
    POLITICS.ai.sabotage.orderChance.saboteur = 1;
  }

  /** Three planning ticks of ai0's (saboteur) and ai1's (Sheriff, a Rookie, so it draws) hands on one game; what each sent and each election stream's draws. */
  function planning(on: boolean) {
    POLITICS.sabotage.on = on;
    const { state } = table();
    withOrders(state, [caseOf({ id: 'sab-aaaaaa', by: null, outcome: 'done' })]);
    const rngs = [counted(11), counted(12)];
    const hands = [new VoteHand(mindOf('ai0', 'saboteur'), rngs[0]!), new VoteHand(mindOf('ai1', 'cautious', 'rookie'), rngs[1]!)];
    const sent: (AiAction & { by: string })[] = [];
    for (let i = 0; i < 3; i++) for (const h of hands) h.tick(state, WALK.tickMs, (a) => (sent.push({ ...a, by: h.mind.me }), false));
    return { sent, draws: rngs.map((r) => r.draws()) };
  }

  it("S4-T-AC-10: with the hands active, VoteHand's own stream draws exactly as often as with sabotage off, and its other moves are the same", () => {
    eager();
    const off = planning(false);
    const on = planning(true);
    const sabotageMoves = (m: { type: string }) => ['sabotage', 'guard', 'investigate', 'fine'].includes(m.type);
    expect(on.sent.some(sabotageMoves), 'the hands did act, so the comparison is not vacuous').toBe(true);
    expect(on.draws).toEqual(off.draws);
    expect(on.sent.filter((m) => !sabotageMoves(m))).toEqual(off.sent);
  });

  it('S4-T-AC-10: with sabotage off the hands send nothing, ask no value and draw nothing, the Sheriff and the orderer alike', () => {
    eager();
    POLITICS.sabotage.on = false;
    const { state } = table();
    withOrders(state, [caseOf({ id: 'sab-aaaaaa', by: null, outcome: 'done' })]);
    const { sent, act } = recorder();
    new SabotageHand(mindOf('ai0', 'saboteur')).order(observe(state, 'ai0'), act);
    new SheriffHand(mindOf('ai1', 'cautious', 'rookie')).run(observe(state, 'ai1'), act);
    new SheriffHand(mindOf('ai1', 'cautious')).run(observe(state, 'ai1'), act);
    expect(sent).toEqual([]);
    for (const m of [gain, capture, guardWorth, investigateWorth]) expect(m).not.toHaveBeenCalled();
  });

  it('S4-T-AC-10: with politics off the hands send nothing', () => {
    eager();
    const { state } = table();
    state.politics = null;
    const { sent, act } = recorder();
    new SabotageHand(mindOf('ai0', 'saboteur')).order(observe(state, 'ai0'), act);
    new SheriffHand(mindOf('ai1', 'cautious')).run(observe(state, 'ai1'), act);
    expect(sent).toEqual([]);
  });

  it('S4-T-AC-10: an election run with the hands active ends on the ballots and candidates it ends on with sabotage off (slice 1)', () => {
    eager();
    const play = (on: boolean) => {
      POLITICS.sabotage.on = on;
      const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
      const hands = SEATS.map((id, i) => new VoteHand(mindOf(id, (['trader', 'cautious', 'aggressive', 'saboteur'] as const)[i]!, 'trader', i + 1), createRng(100 + i)));
      for (let t = 0; t < 120_000 && state.politics!.election!.stage !== 'over'; t += WALK.tickMs) {
        for (const h of hands) h.tick(state, WALK.tickMs, (a) => applyElection(state, h.mind.me, a));
        stepElection(state, WALK.tickMs);
      }
      const election = state.politics!.election!;
      return { stage: election.stage, ballots: election.ballots, candidates: election.candidates, promises: state.politics!.promises };
    };
    expect(play(true)).toEqual(play(false));
  });

  /** A seat's election move applied the way play.ts does; false on a refusal. */
  function applyElection(state: GameState, id: string, a: AiAction): boolean {
    try {
      if (a.type === 'run') runFor(state, id, a.office as Office, a.promise);
      else if (a.type === 'vote') castVote(state, id, a.office, a.candidate);
      else if (a.type === 'done') electionDone(state, id);
      return true;
    } catch {
      return false;
    }
  }

  it("S4-T-AC-10: the council's fixture: a Rookie's yes on a law ballot is the same coin with the hands active", () => {
    eager();
    const vote = (on: boolean) => {
      POLITICS.sabotage.on = on;
      const { state } = table();
      state.politics = { ...state.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 'ai0', ballots: { ai0: true }, done: [], result: null } };
      const { sent, act } = recorder();
      new VoteHand(mindOf('ai2', 'cautious', 'rookie'), createRng(5)).tick(state, 0, act);
      return sent;
    };
    expect(vote(true)).toEqual(vote(false));
  });

  it('S4-T-AC-10 HC-9: neither hand reads state.seed: run on an observe copy whose seed throws when read', () => {
    eager();
    const { state } = table();
    withOrders(state, [caseOf({ id: 'sab-aaaaaa', by: null, outcome: 'done' })]);
    const guarded = (me: string): GameState =>
      new Proxy(observe(state, me), {
        get(target, key, receiver) {
          if (key === 'seed') throw new Error('a hand read state.seed');
          return Reflect.get(target, key, receiver);
        },
      });
    const { sent, act } = recorder();
    new SabotageHand(mindOf('ai0', 'saboteur')).order(guarded('ai0'), act);
    new SheriffHand(mindOf('ai1', 'cautious')).run(guarded('ai1'), act);
    new SheriffHand(mindOf('ai1', 'cautious', 'rookie')).run(guarded('ai1'), act);
    expect(sent.length).toBeGreaterThan(0);
  });

  it("S4-T-AC-10: the hands' streams are the seat's own: two seats' ties break from their own salts, and one seat's is the same twice", () => {
    const { state } = table();
    guardWorth.mockReturnValue(5);
    const post = (seed: number) => {
      const { sent, act } = recorder();
      new SheriffHand(mindOf('ai1', 'cautious', 'trader', seed)).run(observe(state, 'ai1'), act);
      return JSON.stringify(sent);
    };
    expect(post(3)).toBe(post(3));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(post)).size, 'the seats do not all share one coin').toBeGreaterThan(1);
  });
});

