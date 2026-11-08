import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  castLawVote,
  closeVotes,
  councilDone,
  createGame,
  fineable,
  banMultiplier as banMultiplierOf,
  fineCulprit,
  investigate,
  lawImpact,
  lawOffered,
  openPlanning,
  orderSabotage,
  POLITICS,
  proposeLaw,
  reputationReasons,
  RuleError,
  setGuards,
  sheriffCanAct,
  START,
  stepVotes,
  type GameState,
  type LawId,
  type LawProposal,
  type SabotageOrder,
} from '../src/index.js';
import { createRng, seedOf } from '../src/rng.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const BAN: LawProposal = { kind: 'enact', law: 'sabotageBan', setting: POLITICS.laws.sabotageBan.settings[0]! };
const LAND_10: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

/** Month 2's planning, no election, Lena governing. */
function governed(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'lena', election: null, laws: {} };
  return state;
}

/** Sabotage switched on (or off) and both offices elected, for each test of the calling block; the config's values come back after it (AM-2: both defaults are off). */
function sabotage(on: boolean): void {
  let saved: boolean;
  let savedOffices: typeof POLITICS.offices;
  beforeEach(() => {
    saved = POLITICS.sabotage.on;
    savedOffices = POLITICS.offices;
    POLITICS.sabotage.on = on;
    POLITICS.offices = ['governor', 'sheriff'];
  });
  afterEach(() => {
    POLITICS.sabotage.on = saved;
    POLITICS.offices = savedOffices;
  });
}

describe('S4-B-AC-8 (off-switch): the sabotage ban exists only while sabotage is on', () => {
  describe('sabotage off, the default', () => {
    sabotage(false);

    it('S4-B-AC-8: S4-RULE-2 row 1 words: proposeLaw refuses the ban, enact or repeal, and changes nothing', () => {
      expect(POLITICS.sabotage.on).toBe(false);
      for (const proposal of [BAN, { kind: 'repeal', law: 'sabotageBan' } as LawProposal]) {
        const state = governed();
        const before = structuredClone(state.politics);
        expect(() => proposeLaw(state, 'lena', proposal)).toThrow(new RuleError('This game plays without sabotage'));
        expect(state.politics).toEqual(before);
      }
    });

    it('S4-B-AC-8: lawOffered lists the four older laws and not the ban', () => {
      const offered = (Object.keys(POLITICS.laws) as LawId[]).filter(lawOffered);
      expect(offered).toEqual(['exportTax', 'landTax', 'pollutionTax', 'emissionCap']);
    });

    it('S4-B-AC-8: the other laws are proposed as before', () => {
      const state = governed();
      proposeLaw(state, 'lena', LAND_10);
      expect(state.politics!.proposal).toMatchObject({ proposal: { law: 'landTax' } });
    });
  });

  describe('sabotage on', () => {
    sabotage(true);

    it('S4-B-AC-8: the ban is offered and proposable with sabotage on', () => {
      expect(lawOffered('sabotageBan')).toBe(true);
      const state = governed();
      proposeLaw(state, 'lena', BAN);
      expect(state.politics!.proposal).toMatchObject({ proposal: { law: 'sabotageBan' } });
    });
  });
});

// --- The Sheriff's powers (Task S4-1.7) ---------------------------------------------------------------------------

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'valid';
}

/** Month 4's planning, Ossa the Sheriff, Lena the Governor; Brix owns a Food plot and Kai a Smithore one; Lena owns one too. */
function sheriffed(): { state: GameState; food: number; ore: number; own: number; bare: number } {
  const state = governed();
  state.month = 4;
  state.politics = { ...state.politics!, sheriff: 'ossa' };
  const [food, ore, own, bare] = state.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain !== 'store' && t.owner === null).map(([, i]) => i) as [number, number, number, number];
  Object.assign(state.tiles[food]!, { owner: 'brix', outfit: 'food' });
  Object.assign(state.tiles[ore]!, { owner: 'kai', outfit: 'smithore' });
  Object.assign(state.tiles[own]!, { owner: 'ossa', outfit: 'smithore' });
  return { state, food, ore, own, bare };
}

let caseNo = 0;
/** A resolved order of month 3 filed straight in the list (the contract tests start from the case, not from its resolution). */
function addCase(state: GameState, part: Partial<SabotageOrder> = {}): SabotageOrder {
  const order: SabotageOrder = {
    id: `sab-case${++caseNo}`,
    by: 'lena',
    month: 3,
    target: { kind: 'rumour', good: 'food', dir: 'up' },
    cost: POLITICS.sabotage.orders.rumour.cost,
    outcome: 'done',
    culpritPublic: false,
    victim: null,
    worked: true,
    investigated: null,
    fine: null,
    ...part,
  };
  state.politics = { ...state.politics!, sabotage: [...state.politics!.sabotage, order] };
  return order;
}
const orderOf = (state: GameState, id: string) => state.politics!.sabotage.find((o) => o.id === id)!;
const moneyOf = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.money;
const { steps, standard } = POLITICS.sheriff.fine;
const caught = () => POLITICS.reputation.moves.caught;

describe('S4-T-AC-5: the Sheriff, S4-RULE-6 guards', () => {
  sabotage(true);

  it('S4-T-AC-5: S4-RULE-6 rows 1-3: the refusals, in the published words, change nothing', () => {
    const rows: { row: string; make: () => GameState; by: string; then: string }[] = [
      { row: '1 sabotage off', make: () => { POLITICS.sabotage.on = false; return sheriffed().state; }, by: 'ossa', then: 'This game plays without sabotage' },
      { row: '1 politics off', make: () => Object.assign(sheriffed().state, { politics: null }), by: 'ossa', then: 'This game plays without sabotage' },
      { row: '2 not planning', make: () => Object.assign(sheriffed().state, { phase: 'production' }), by: 'ossa', then: 'Guards are posted once the votes are over' },
      { row: '2 a vote is open', make: () => { const s = sheriffed().state; s.politics = { ...s.politics!, election: { ...createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) }).politics!.election!, stage: 'ballot' } }; return s; }, by: 'ossa', then: 'Guards are posted once the votes are over' },
      { row: '3 not the Sheriff', make: () => sheriffed().state, by: 'lena', then: 'Only the Sheriff posts guards' },
    ];
    for (const { make, by, then } of rows) {
      POLITICS.sabotage.on = true; // a row may switch it off
      const state = make();
      const before = structuredClone(state.politics);
      expect(refused(() => setGuards(state, by, [0]))).toBe(then);
      expect(state.politics).toEqual(before);
    }
  });

  it('S4-T-AC-5: S4-RULE-6 rows 4-6: a plot owned by nobody, more than the maximum, then the list replaces the earlier one', () => {
    const { state, food, ore, own, bare } = sheriffed();
    const before = structuredClone(state.politics);
    expect(refused(() => setGuards(state, 'ossa', [food, bare]))).toBe("Guards watch players' plots");
    expect(POLITICS.sheriff.guards).toBe(2);
    // A third plot of another player's: AM-11 refuses the Sheriff's own plot before the count, so it can't make up the third.
    Object.assign(state.tiles[bare]!, { owner: 'lena', outfit: 'food' });
    expect(refused(() => setGuards(state, 'ossa', [food, ore, bare]))).toBe('You have 2 guards');
    Object.assign(state.tiles[bare]!, { owner: null, outfit: null });
    expect(state.politics).toEqual(before);
    setGuards(state, 'ossa', [food, ore]);
    expect(state.politics!.guards).toEqual([food, ore]);
    // AM-11 reversed the old "own plot is allowed": the Sheriff's own plot is refused (S4-T-AC-17); a new list replaces the old one whole.
    expect(refused(() => setGuards(state, 'ossa', [own]))).toBe("You can't guard your own plots");
    setGuards(state, 'ossa', [ore]);
    expect(state.politics!.guards).toEqual([ore]);
    setGuards(state, 'ossa', []);
    expect(state.politics!.guards).toEqual([]);
  });

  it('S4-T-AC-5: S4-RULE-6 row 5: counts distinct plots, so a plot listed twice is one guard', () => {
    const { state, food, ore } = sheriffed();
    setGuards(state, 'ossa', [food, food, ore]);
    expect(state.politics!.guards).toEqual([food, ore]);
  });

  it('S4-T-AC-5: S4-RULE-6: sheriffCanAct names the reason', () => {
    const { state } = sheriffed();
    expect(sheriffCanAct(state, 'ossa')).toBe(true);
    expect(sheriffCanAct(state, 'lena')).toBe('notSheriff');
    state.phase = 'auction';
    expect(sheriffCanAct(state, 'ossa')).toBe('notPlanning');
    POLITICS.sabotage.on = false;
    expect(sheriffCanAct(state, 'ossa')).toBe('off');
  });
});

describe('S4-T-AC-5: the Sheriff, S4-RULE-7 investigations', () => {
  sabotage(true);

  it('S4-T-AC-5: S4-RULE-7 row 1: refused as the guard rows, "investigates", in the published words', () => {
    const rows: { row: string; make: () => GameState; by: string; then: string }[] = [
      { row: 'sabotage off', make: () => { POLITICS.sabotage.on = false; return sheriffed().state; }, by: 'ossa', then: 'This game plays without sabotage' },
      { row: 'not planning', make: () => Object.assign(sheriffed().state, { phase: 'upkeep' }), by: 'ossa', then: 'Investigations are made once the votes are over' },
      { row: 'not the Sheriff', make: () => sheriffed().state, by: 'lena', then: 'Only the Sheriff investigates' },
    ];
    for (const { make, by, then } of rows) {
      POLITICS.sabotage.on = true; // a row may switch it off
      const state = make();
      const order = addCase(state);
      const before = structuredClone(state.politics);
      expect(refused(() => investigate(state, by, order.id))).toBe(then);
      expect(state.politics).toEqual(before);
    }
  });

  it('S4-T-AC-5: S4-RULE-7 rows 3-5: an unknown or private incident, a solved one and one gone cold are refused and unchanged', () => {
    const { state } = sheriffed();
    const failed = addCase(state, { outcome: 'failed', worked: false });
    const solved = addCase(state, { outcome: 'caught', culpritPublic: true });
    const cold = addCase(state, { investigated: 3 });
    const before = structuredClone(state.politics);
    expect(refused(() => investigate(state, 'ossa', 'sab-nothing'))).toBe('No such incident');
    expect(refused(() => investigate(state, 'ossa', failed.id))).toBe('No such incident');
    expect(refused(() => investigate(state, 'ossa', solved.id))).toBe('That one is solved');
    expect(refused(() => investigate(state, 'ossa', cold.id))).toBe('The trail went cold on that one');
    expect(state.politics).toEqual(before);
  });

  /** Two public unsolved incidents from month 3, Lena's the first in the list (so the draw keys on 1) and Kai's the second (2). */
  function twoIncidents(seed: number): { state: GameState; first: SabotageOrder; second: SabotageOrder } {
    const { state } = sheriffed();
    state.seed = seed;
    const first = addCase(state, { by: 'lena' });
    const second = addCase(state, { by: 'kai' });
    return { state, first, second };
  }

  it('S4-T-AC-5: S4-RULE-7 row 6 and row 2: investigating solves (names the culprit, moves reputation once) or goes cold, at once; a second one that month is refused', () => {
    let solved = 0;
    let cold = 0;
    for (let seed = 1; seed <= 80 && (!solved || !cold); seed++) {
      const { state, first, second } = twoIncidents(seed);
      const before = state.players.find((p) => p.id === 'lena')!.reputation;
      const result = investigate(state, 'ossa', first.id);
      expect(result.investigated).toBe(state.month);
      expect(orderOf(state, first.id).investigated).toBe(state.month);
      if (result.culpritPublic) {
        solved++;
        expect(state.players.find((p) => p.id === 'lena')!.reputation).toBe(before + caught());
        expect(reputationReasons(state, 'lena')).toEqual([{ kind: 'caught', month: state.month }]);
      } else {
        cold++;
        expect(state.players.find((p) => p.id === 'lena')!.reputation).toBe(before);
      }
      expect(refused(() => investigate(state, 'ossa', second.id))).toBe('One investigation a month');
      expect(orderOf(state, second.id).investigated).toBe(null);
    }
    expect(solved).toBeGreaterThan(0);
    expect(cold).toBeGreaterThan(0);
  });

  it('S4-T-AC-5: S4-RULE-7 row 6: the draw keys on the order\'s position, never the id\'s text (AM-1), and is the same on a replay', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = twoIncidents(seed);
      const b = twoIncidents(seed);
      b.state.politics!.sabotage = b.state.politics!.sabotage.map((o, i) => ({ ...o, id: `sab-other${i}` }));
      const x = investigate(a.state, 'ossa', a.second.id).culpritPublic;
      const y = investigate(b.state, 'ossa', 'sab-other1').culpritPublic;
      expect(y).toBe(x);
    }
  });

  it('S4-T-AC-5: S4-RULE-7 row 6 (AM-1): the draw is createRng(seedOf(seed, position, "investigate", salt)).chance(odds), position 1-based, so two positions can differ', () => {
    let differ = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = twoIncidents(seed);
      const b = twoIncidents(seed);
      const first = investigate(a.state, 'ossa', a.first.id).culpritPublic;
      const second = investigate(b.state, 'ossa', b.second.id).culpritPublic;
      const draw = (n: number) => createRng(seedOf(seed, n, 'investigate', String(POLITICS.sabotage.streamSalt))).chance(POLITICS.sheriff.investigateOdds);
      expect(first).toBe(draw(1));
      expect(second).toBe(draw(2));
      if (first !== second) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('S4-T-AC-5: S4-RULE-7 row 6: the odds are POLITICS.sheriff.investigateOdds: at 1 every investigation solves, at 0 none does', () => {
    const saved = POLITICS.sheriff.investigateOdds;
    try {
      for (const [odds, want] of [[1, true], [0, false]] as const) {
        POLITICS.sheriff.investigateOdds = odds;
        for (let seed = 1; seed <= 10; seed++) {
          const { state, first } = twoIncidents(seed);
          expect(investigate(state, 'ossa', first.id).culpritPublic).toBe(want);
        }
      }
    } finally {
      POLITICS.sheriff.investigateOdds = saved;
    }
  });

  it('S4-T-AC-5: S4-RULE-7: the month\'s count is read off investigated, so next month the Sheriff may investigate again', () => {
    const { state, first, second } = twoIncidents(3);
    investigate(state, 'ossa', first.id);
    state.month++;
    expect(refused(() => investigate(state, 'ossa', second.id))).toBe('valid');
  });
});

describe('S4-T-AC-5: the Sheriff, S4-RULE-8 fines', () => {
  sabotage(true);

  it('S4-T-AC-5: S4-RULE-8 row 1: refused as the guard rows, "fines", in the published words', () => {
    const rows: { make: () => GameState; by: string; then: string }[] = [
      { make: () => { POLITICS.sabotage.on = false; return sheriffed().state; }, by: 'ossa', then: 'This game plays without sabotage' },
      { make: () => Object.assign(sheriffed().state, { phase: 'auction' }), by: 'ossa', then: 'Fines are levied once the votes are over' },
      { make: () => sheriffed().state, by: 'lena', then: 'Only the Sheriff fines' },
    ];
    for (const { make, by, then } of rows) {
      POLITICS.sabotage.on = true; // a row may switch it off
      const state = make();
      const order = addCase(state, { culpritPublic: true });
      const before = structuredClone(state.politics);
      expect(refused(() => fineCulprit(state, by, order.id, 150))).toBe(then);
      expect(state.politics).toEqual(before);
    }
  });

  it('S4-T-AC-5: S4-RULE-8 rows 2-5: an unrevealed case, a fined one, the Sheriff himself and a base off the steps are refused and nothing moves', () => {
    const { state } = sheriffed();
    const hidden = addCase(state);
    const done = addCase(state, { culpritPublic: true, fine: { base: 100, due: 100, paid: 100, toVictim: 0, by: 'sheriff', month: 4 } });
    const own = addCase(state, { by: 'ossa', culpritPublic: true });
    const open = addCase(state, { culpritPublic: true });
    const before = structuredClone(state);
    expect(refused(() => fineCulprit(state, 'ossa', hidden.id, 150))).toBe('Only a revealed culprit is fined');
    expect(refused(() => fineCulprit(state, 'ossa', 'sab-nothing', 150))).toBe('Only a revealed culprit is fined');
    expect(refused(() => fineCulprit(state, 'ossa', done.id, 150))).toBe('Already fined');
    expect(refused(() => fineCulprit(state, 'ossa', own.id, 150))).toBe("You can't fine yourself");
    for (const base of [0, 75, steps[0]! - 1, steps.at(-1)! + steps[0]!, Number.NaN]) {
      expect(refused(() => fineCulprit(state, 'ossa', open.id, base))).toBe('A fine is 50 to 300 cr, in steps of 50');
    }
    expect(state.politics).toEqual(before.politics);
    expect(state.players).toEqual(before.players);
    expect(state.treasury).toEqual(before.treasury);
  });

  it('S4-T-AC-5: S4-RULE-8 row 6: the culprit pays, the victim gets the share, the fund keeps the rest, and treasury.paid does not move', () => {
    const { state } = sheriffed();
    const order = addCase(state, { culpritPublic: true, victim: 'brix' });
    state.players.find((p) => p.id === 'lena')!.money = 500;
    const fund = state.treasury.money;
    const brix = moneyOf(state, 'brix');
    const paidBefore = structuredClone(state.treasury.paid);
    fineCulprit(state, 'ossa', order.id, 150);
    const toVictim = Math.round(150 * POLITICS.sheriff.victimShare);
    expect(moneyOf(state, 'lena')).toBe(350);
    expect(moneyOf(state, 'brix')).toBe(brix + toVictim);
    expect(state.treasury.money).toBe(fund + 150 - toVictim);
    expect(state.treasury.paid).toEqual(paidBefore);
    expect(orderOf(state, order.id).fine).toEqual({ base: 150, due: 150, paid: 150, toVictim, by: 'sheriff', month: 4 });
    expect(state.colony!.ledger.in.fine).toBe(150);
    expect(state.colony!.ledger.out.restitution).toBe(toVictim);
  });

  it('S4-T-AC-5: S4-RULE-8: a short culprit pays what they have, the victim\'s share is of what was paid, and the rest is waived', () => {
    const { state } = sheriffed();
    const order = addCase(state, { culpritPublic: true, victim: 'brix' });
    state.players.find((p) => p.id === 'lena')!.money = 81;
    const brix = moneyOf(state, 'brix');
    fineCulprit(state, 'ossa', order.id, 300);
    expect(moneyOf(state, 'lena')).toBe(0);
    // An odd payment: the victim's half is rounded (40.5 -> 41), not floored.
    expect(Math.round(81 * POLITICS.sheriff.victimShare)).toBe(41);
    expect(moneyOf(state, 'brix')).toBe(brix + 41);
    expect(orderOf(state, order.id).fine).toMatchObject({ base: 300, due: 300, paid: 81, toVictim: 41 });
  });

  it('S4-T-AC-5: S4-RULE-8: a rumour has no victim, so the whole fine stays in the fund', () => {
    const { state } = sheriffed();
    const order = addCase(state, { culpritPublic: true, victim: null });
    state.players.find((p) => p.id === 'lena')!.money = 500;
    const fund = state.treasury.money;
    fineCulprit(state, 'ossa', order.id, 100);
    expect(state.treasury.money).toBe(fund + 100);
    expect(orderOf(state, order.id).fine).toMatchObject({ paid: 100, toVictim: 0 });
    expect(state.colony!.ledger.out.restitution).toBeUndefined();
  });

  it('S4-T-AC-5: S4-RULE-8: fineable lists the Sheriff\'s open revealed cases, never his own, never a fined or hidden one, and nothing for anyone else', () => {
    const { state } = sheriffed();
    addCase(state);
    const open = addCase(state, { culpritPublic: true });
    addCase(state, { by: 'ossa', culpritPublic: true });
    addCase(state, { culpritPublic: true, fine: { base: 50, due: 50, paid: 50, toVictim: 0, by: 'standard', month: 3 } });
    expect(fineable(state, 'ossa')).toEqual([open.id]);
    expect(fineable(state, 'lena')).toEqual([]);
    state.phase = 'production';
    expect(fineable(state, 'ossa')).toEqual([]);
  });

  it('S4-T-AC-5: S4-RULE-8 standard: closeVotes levies the standard fine on every revealed unfined case, the Sheriff\'s own too, once; fines never enter treasury.paid', () => {
    const { state } = sheriffed();
    state.players.find((p) => p.id === 'lena')!.money = 500;
    state.players.find((p) => p.id === 'ossa')!.money = 500;
    const lena = addCase(state, { culpritPublic: true, victim: 'brix' });
    const ossa = addCase(state, { by: 'ossa', culpritPublic: true, victim: null });
    const hidden = addCase(state);
    const fined = addCase(state, { by: 'kai', culpritPublic: true, fine: { base: 50, due: 50, paid: 50, toVictim: 0, by: 'sheriff', month: 4 } });
    const paidBefore = structuredClone(state.treasury.paid);
    closeVotes(state);
    expect(orderOf(state, lena.id).fine).toMatchObject({ base: standard, due: standard, paid: standard, by: 'standard' });
    expect(orderOf(state, ossa.id).fine).toMatchObject({ paid: standard, by: 'standard' });
    expect(orderOf(state, hidden.id).fine ?? null).toBe(null);
    expect(orderOf(state, fined.id).fine).toMatchObject({ base: 50, by: 'sheriff' });
    expect(moneyOf(state, 'lena')).toBe(500 - standard);
    expect(moneyOf(state, 'ossa')).toBe(500 - standard);
    expect(state.treasury.paid).toEqual(paidBefore);
    const money = state.players.map((p) => p.money);
    closeVotes(state);
    expect(state.players.map((p) => p.money)).toEqual(money);
  });

  it('S4-T-AC-5: S4-RULE-8 standard: at the last upkeep an open case pays the standard fine, once', () => {
    const { state } = sheriffed();
    state.maxMonths = 4;
    state.phase = 'auction';
    state.players.find((p) => p.id === 'lena')!.money = 500;
    const order = addCase(state, { month: 4, culpritPublic: true, victim: null });
    advancePhase(state);
    expect(state.phase).toBe('gameOver');
    expect(orderOf(state, order.id).fine).toMatchObject({ paid: standard, by: 'standard' });
  });

  it('S4-T-AC-5: S4-RULE-8 standard: at the last upkeep the crew is paid first, and the fine takes only what is left', () => {
    const { state } = sheriffed();
    state.maxMonths = 4;
    state.phase = 'auction';
    const crew = POLITICS.sabotage.orders.rumour.cost;
    state.players.find((p) => p.id === 'lena')!.money = crew + 50;
    const order = addCase(state, { month: 4, culpritPublic: true, victim: null });
    advancePhase(state);
    expect(state.phase).toBe('gameOver');
    expect(orderOf(state, order.id).fine).toMatchObject({ due: standard, paid: 50 });
  });
});

describe('S4-B-AC-3: a revealed case is fined; an unfined one pays when the next planning ends', () => {
  sabotage(true);

  /** Month 3's planning after Lena's power cut on Brix's Food plot was caught at a guard in month 2's production; Ossa is the Sheriff. */
  function caughtInMonth2() {
    const { state, food } = sheriffed();
    state.month = 2;
    for (const p of state.players) p.money = 1_000;
    orderSabotage(state, 'lena', { kind: 'powerCut', tile: food });
    setGuards(state, 'ossa', [food]);
    while (!(state.phase === 'planning' && state.month === 3)) advancePhase(state);
    const order = state.politics!.sabotage[0]!;
    expect(order).toMatchObject({ by: 'lena', victim: 'brix', outcome: 'caught', culpritPublic: true });
    expect(order.fine ?? null).toBe(null);
    return { state, order };
  }

  it('S4-B-AC-3: the Sheriff fines 150: the culprit pays 150, the victim gets 75, the fund keeps 75, and the ledger shows fine 150 and restitution 75', () => {
    const { state, order } = caughtInMonth2();
    const [lena, brix, fund] = [moneyOf(state, 'lena'), moneyOf(state, 'brix'), state.treasury.money];
    fineCulprit(state, 'ossa', order.id, 150);
    expect(moneyOf(state, 'lena')).toBe(lena - 150);
    expect(moneyOf(state, 'brix')).toBe(brix + 75);
    expect(state.treasury.money).toBe(fund + 75);
    while (state.phase !== 'upkeep') advancePhase(state);
    const report = state.history.at(-1)!;
    expect(report.month).toBe(3);
    expect(report.ledger!.in.fine).toBe(150);
    expect(report.ledger!.out.restitution).toBe(75);
    // The fine was levied once: planning's end did not take the standard fine on top.
    expect(state.politics!.sabotage[0]!.fine).toMatchObject({ by: 'sheriff', paid: 150 });
  });

  it('S4-B-AC-3: a case left unfined pays the standard 150 when that planning ends, the same split, in that month\'s ledger', () => {
    const { state, order } = caughtInMonth2();
    const control = structuredClone(state);
    control.politics!.sabotage[0]!.fine = { base: 0, due: 0, paid: 0, toVictim: 0, by: 'sheriff', month: 3 };
    const [lena, brix] = [moneyOf(state, 'lena'), moneyOf(state, 'brix')];
    advancePhase(state);
    advancePhase(control);
    expect(state.phase).not.toBe('planning');
    expect(moneyOf(state, 'lena')).toBe(moneyOf(control, 'lena') - standard);
    expect(moneyOf(state, 'brix')).toBe(moneyOf(control, 'brix') + Math.round(standard * POLITICS.sheriff.victimShare));
    expect(moneyOf(state, 'lena')).toBeLessThanOrEqual(lena - standard);
    expect(moneyOf(state, 'brix')).toBeGreaterThanOrEqual(brix);
    while (state.phase !== 'upkeep') advancePhase(state);
    expect(state.history.at(-1)!.ledger!.in.fine).toBe(standard);
    expect(state.history.at(-1)!.ledger!.out.restitution).toBe(Math.round(standard * POLITICS.sheriff.victimShare));
    expect(state.politics!.sabotage.find((o) => o.id === order.id)!.fine).toMatchObject({ by: 'standard', paid: standard });
  });

  it('S4-B-AC-3 negative: a fine on an unrevealed case is refused', () => {
    const { state } = sheriffed();
    const hidden = addCase(state);
    expect(refused(() => fineCulprit(state, 'ossa', hidden.id, 150))).toBe('Only a revealed culprit is fined');
  });
});

describe('S4-B-AC-6 (engine): the crew is paid at the month end', () => {
  sabotage(true);
  const cost = POLITICS.sabotage.orders.powerCut.cost;

  /** Month 2's planning, Lena orders a cut on Brix's Food plot (guarded, so the outcome never depends on a draw); the control is the same month with no order. */
  function twoMonths(): { ordered: GameState; control: GameState; food: number } {
    const { state: control, food } = sheriffed();
    control.month = 2;
    for (const p of control.players) p.money = 1_000;
    setGuards(control, 'ossa', [food]);
    const ordered = structuredClone(control);
    orderSabotage(ordered, 'lena', { kind: 'powerCut', tile: food });
    return { ordered, control, food };
  }

  it('S4-B-AC-6: Lena\'s money does not move when she orders in planning, nor in any phase before upkeep; at upkeep it falls by the crew cost', () => {
    const { ordered, control } = twoMonths();
    expect(moneyOf(ordered, 'lena')).toBe(moneyOf(control, 'lena'));
    while (ordered.phase !== 'upkeep') {
      advancePhase(ordered);
      advancePhase(control);
      if ((ordered.phase as string) !== 'upkeep') expect(moneyOf(ordered, 'lena')).toBe(moneyOf(control, 'lena'));
    }
    expect(ordered.phase).toBe('upkeep');
    expect(moneyOf(ordered, 'lena')).toBe(moneyOf(control, 'lena') - cost);
    for (const id of ['brix', 'ossa', 'kai']) expect(moneyOf(ordered, id)).toBe(moneyOf(control, id));
  });

  it('S4-B-AC-6: S4-RULE-9: a player with less than the cost pays what they have, to nobody; the rest is waived', () => {
    const { ordered, control } = twoMonths();
    while (ordered.phase !== 'auction') {
      advancePhase(ordered);
      advancePhase(control);
    }
    const short = cost - 30;
    ordered.players.find((p) => p.id === 'lena')!.money = short;
    control.players.find((p) => p.id === 'lena')!.money = short;
    advancePhase(ordered);
    advancePhase(control);
    expect(ordered.phase).toBe('upkeep');
    expect(moneyOf(ordered, 'lena')).toBe(moneyOf(control, 'lena') - short);
    expect(moneyOf(ordered, 'lena')).toBeGreaterThanOrEqual(0);
  });

  it('S4-B-AC-6: S4-RULE-9: a player short for both a law tax and a crew pays the law tax first; the crew gets what is left', () => {
    const { ordered } = twoMonths();
    while (ordered.phase !== 'auction') advancePhase(ordered);
    const plot = ordered.tiles.find((t) => t.terrain !== 'store' && t.owner === null)!;
    plot.owner = 'lena';
    const tax = 30;
    const own = ordered.tiles.filter((t) => t.owner === 'lena').length;
    ordered.politics = { ...ordered.politics!, laws: { landTax: { setting: tax / own, since: 1 } } };
    ordered.players.find((p) => p.id === 'lena')!.money = cost + 10;
    advancePhase(ordered);
    expect(ordered.phase).toBe('upkeep');
    // The tax is collected whole (30, in treasury.paid); the crew's cost is then short and takes what is left.
    expect(ordered.treasury.paid.lena).toBe(tax);
  });

  it('S4-B-AC-6: S4-RULE-9: an order that went void (the plot lost its MULE) costs nothing', () => {
    const { ordered, control, food } = twoMonths();
    ordered.tiles[food]!.outfit = null;
    control.tiles[food]!.outfit = null;
    while (ordered.phase !== 'upkeep') {
      advancePhase(ordered);
      advancePhase(control);
    }
    expect(ordered.politics!.sabotage).toEqual([]);
    expect(moneyOf(ordered, 'lena')).toBe(moneyOf(control, 'lena'));
  });

  it('S4-B-AC-6: S4-RULE-9: a crew is charged once: the next month\'s upkeep takes nothing for last month\'s order', () => {
    const { ordered, control } = twoMonths();
    while (!(ordered.phase === 'upkeep' && ordered.month === 3)) {
      advancePhase(ordered);
      advancePhase(control);
    }
    const diff = moneyOf(control, 'lena') - moneyOf(ordered, 'lena');
    expect(diff).toBeGreaterThanOrEqual(cost);
    // Last month's fine aside (the case was caught), month 3 held no second crew charge.
    const fine = ordered.politics!.sabotage[0]!.fine;
    expect(diff).toBe(cost + (fine?.paid ?? 0));
  });
});

describe('S4-B-AC-8 / S4-T-AC-12: the sabotage ban', () => {
  sabotage(true);

  /** The ban at `setting`, passed the way the colony passes a law: proposed, voted yes by all four, closed. Month 5's planning, Ossa the Sheriff. */
  function banned(setting: number): GameState {
    const { state } = sheriffed();
    proposeLaw(state, 'lena', { kind: 'enact', law: 'sabotageBan', setting });
    state.month++;
    openPlanning(state);
    for (const id of SEATS) castLawVote(state, id, true);
    for (const id of SEATS) councilDone(state, id);
    stepVotes(state, 0);
    closeVotes(state);
    expect(state.politics!.laws.sabotageBan?.setting).toBe(setting);
    expect(state.phase).toBe('planning');
    return state;
  }
  /** The Sheriff solves the case (the odds at 1), so it is revealed by the real route, under whatever ban is in force now; the odds come back after. */
  function revealed(state: GameState, id: string): void {
    const saved = POLITICS.sheriff.investigateOdds;
    POLITICS.sheriff.investigateOdds = 1;
    try {
      investigate(state, 'ossa', id);
    } finally {
      POLITICS.sheriff.investigateOdds = saved;
    }
  }
  const reputationOf = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.reputation;

  it('S4-B-AC-8: with the ban at 2 in force, a case revealed and fined 150 owes 300 and costs 20 reputation; a fine levied before the ban passed was x1', () => {
    const { state: before } = sheriffed();
    const early = addCase(before, { culpritPublic: true, victim: 'brix' });
    before.players.find((p) => p.id === 'lena')!.money = 1_000;
    fineCulprit(before, 'ossa', early.id, 150);
    expect(orderOf(before, early.id).fine).toMatchObject({ due: 150, paid: 150 });

    // The same game, the ban passing next: the earlier fine keeps its x1, and a new case pays double.
    const state = structuredClone(before);
    proposeLaw(state, 'lena', { kind: 'enact', law: 'sabotageBan', setting: 2 });
    state.month++;
    openPlanning(state);
    for (const id of SEATS) castLawVote(state, id, true);
    for (const id of SEATS) councilDone(state, id);
    stepVotes(state, 0);
    closeVotes(state);
    expect(banMultiplierOf(state)).toBe(2);
    expect(orderOf(state, early.id).fine).toMatchObject({ base: 150, due: 150, paid: 150 });

    const fresh = addCase(state, { by: 'kai', culpritPublic: true, victim: 'brix' });
    state.players.find((p) => p.id === 'kai')!.money = 1_000;
    const brix = moneyOf(state, 'brix');
    fineCulprit(state, 'ossa', fresh.id, 150);
    expect(orderOf(state, fresh.id).fine).toMatchObject({ base: 150, due: 300, paid: 300, toVictim: 150 });
    expect(moneyOf(state, 'kai')).toBe(700);
    expect(moneyOf(state, 'brix')).toBe(brix + 150);

    // The reputation: an investigation that names Lena under the ban costs 2 x the caught move.
    const open = addCase(state, { by: 'lena', victim: null });
    const rep = reputationOf(state, 'lena');
    const saved = POLITICS.sheriff.investigateOdds;
    POLITICS.sheriff.investigateOdds = 1;
    try {
      investigate(state, 'ossa', open.id);
    } finally {
      POLITICS.sheriff.investigateOdds = saved;
    }
    expect(reputationOf(state, 'lena')).toBe(rep - 20);
    expect(-POLITICS.reputation.moves.caught * 2).toBe(20);
  });

  it('S4-B-AC-8: the standard fine at planning\'s end reads the ban that planning\'s votes have just put in force', () => {
    const { state } = sheriffed();
    const incident = addCase(state, { victim: null });
    state.players.find((p) => p.id === 'lena')!.money = 1_000;
    revealed(state, incident.id);
    expect(orderOf(state, incident.id).culpritPublic).toBe(true);
    proposeLaw(state, 'lena', { kind: 'enact', law: 'sabotageBan', setting: 3 });
    state.month++;
    openPlanning(state);
    for (const id of SEATS) castLawVote(state, id, true);
    for (const id of SEATS) councilDone(state, id);
    stepVotes(state, 0);
    closeVotes(state);
    expect(state.politics!.sabotage[0]!.fine).toMatchObject({ base: standard, due: standard * 3, by: 'standard' });
  });

  it('S4-B-AC-8: the multiplier is never stored on a case; repealing the ban puts the next fine back to x1', () => {
    const state = banned(2);
    const first = addCase(state);
    revealed(state, first.id); // revealed under x2
    expect(orderOf(state, first.id).culpritPublic).toBe(true);
    expect(JSON.stringify(orderOf(state, first.id))).not.toContain('ultiplier');
    state.politics = { ...state.politics!, laws: {} };
    state.players.find((p) => p.id === 'lena')!.money = 1_000;
    fineCulprit(state, 'ossa', first.id, 100);
    expect(orderOf(state, first.id).fine).toMatchObject({ due: 100 });
  });

  it('S4-T-AC-12: the ban\'s preview is attributed / months played x the standard fine x (setting - 1), from revealed cases only', () => {
    const { state } = sheriffed();
    state.month = 5;
    addCase(state, { by: 'lena', culpritPublic: true });
    addCase(state, { by: 'lena', month: 2, outcome: 'caught', culpritPublic: true });
    const monthsPlayed = state.month - 1;
    for (const setting of POLITICS.laws.sabotageBan.settings) {
      const impact = lawImpact(state, { kind: 'enact', law: 'sabotageBan', setting });
      expect(impact.lena!.cost).toBe(Math.round((2 / monthsPlayed) * standard * (setting - 1)));
      expect(impact.brix!.cost).toBe(0);
    }
    expect(lawImpact(state, { kind: 'enact', law: 'sabotageBan', setting: 2 }).lena!.cost).toBe(75);
  });

  it('S4-T-AC-12: in month 1, before any month is played and with no incident, the preview is 0 for everyone, never NaN', () => {
    const { state } = sheriffed();
    state.month = 1;
    for (const setting of POLITICS.laws.sabotageBan.settings) {
      const impact = lawImpact(state, { kind: 'enact', law: 'sabotageBan', setting });
      for (const id of SEATS) expect(impact[id]!.cost).toBe(0);
    }
  });

  it('S4-T-AC-12 negative: an unrevealed incident adds nothing; a repeal shows the same figure as a saving', () => {
    const { state } = sheriffed();
    state.month = 5;
    addCase(state, { by: 'lena', culpritPublic: true });
    addCase(state, { by: 'lena' });
    addCase(state, { by: 'brix', outcome: 'failed', worked: false });
    const enact = lawImpact(state, { kind: 'enact', law: 'sabotageBan', setting: 2 });
    expect(enact.lena!.cost).toBe(Math.round((1 / 4) * standard));
    expect(enact.brix!.cost).toBe(0);
    state.politics = { ...state.politics!, laws: { sabotageBan: { setting: 2, since: 4 } } };
    const repeal = lawImpact(state, { kind: 'repeal', law: 'sabotageBan' });
    expect(repeal.lena!.cost).toBe(-enact.lena!.cost);
    expect(repeal.brix!.cost).toBe(0);
  });
});
