import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  COLONY,
  commission,
  createGame,
  POLITICS,
  PRESTIGE,
  runColony,
  WELL_MONTH,
  storeQuotes,
  stableJson,
  welfareRecipient,
  type BudgetLine,
  type FundLedger,
  type GameState,
  type PrestigeId,
  type Project,
} from '../src/index.js';
import { healthOffInTest } from './health-switch.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const B = POLITICS.budget;

/** A politics game in planning with Lena governing and no election open. */
function governed(fund = 0, seed = 7): GameState {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  state.treasury.money = fund;
  return state;
}

const shares = (projects: number, welfare: number): Record<BudgetLine, number> => ({ projects, welfare, security: 0 });

function withBudget(state: GameState, s: Record<BudgetLine, number>): void {
  state.politics = { ...state.politics!, budget: { month: state.month, setBy: 'lena', shares: s } };
}

function advanceTo(state: GameState, phase: GameState['phase']): void {
  for (let steps = 0; state.phase !== phase && state.phase !== 'gameOver'; steps++) {
    if (steps > 20) throw new Error(`stuck in ${state.phase} on the way to ${phase}`);
    advancePhase(state);
  }
}

function money(state: GameState, id: string): number {
  return state.players.find((p) => p.id === id)!.money;
}

/** Sets each player's Worth by their money alone (their goods, land and MULEs are the same at the start). */
function worth(state: GameState, byId: Record<string, number>): void {
  for (const p of state.players) p.money = byId[p.id] ?? p.money;
}

function projectOf(id: PrestigeId, stage: Project['stage'], extra: Partial<Project> = {}): Project {
  const row = PRESTIGE[id];
  const funded = stage === 'standing' || stage === 'building' ? { credits: row.credits, goods: { ...row.goods } } : { credits: 0, goods: {} };
  return { id, stage, funded, monthsLeft: stage === 'building' ? row.buildMonths : null, since: 1, plaque: {}, ...extra };
}

function withProjects(state: GameState, projects: Project[]): void {
  state.colony = { ...state.colony!, projects };
}

/** The fund runColony starts with when `spare` credits lie above the reserve, after upkeep, the grant and the Governor's pay. */
function fundForSpare(spare: number): number {
  return COLONY.reserve + spare - COLONY.grant.perMonth + POLITICS.pay.governor;
}

const total = (side: Partial<Record<string, number>>) => Object.values(side).reduce<number>((sum, n) => sum + (n ?? 0), 0);
const net = (ledger: FundLedger) => total(ledger.in) - total(ledger.out);

/** Lena commissions two buildings that between them need more credits than any fund here holds. */
function commissioned(fund: number, s: Record<BudgetLine, number> | null): GameState {
  const state = governed();
  commission(state, 'lena', 'stadium');
  commission(state, 'lena', 'spaceport');
  state.treasury.money = fund;
  if (s) withBudget(state, s);
  return state;
}

function project(state: GameState, id: PrestigeId): Project {
  return state.colony!.projects.find((p) => p.id === id)!;
}

describe('S5-C2: upkeep pays Welfare and caps building funding by the Projects share', () => {
  it("S5-T-AC-3: with budget null, runColony's output on a fixed state equals today's", () => {
    // Health off: the golden is the colony before budgets; health adds its sick share and Medicine run to the output.
    healthOffInTest();
    const state = governed(800);
    withProjects(state, [projectOf('hospital', 'standing'), projectOf('park', 'building'), projectOf('stadium', 'commissioned'), projectOf('observatory', 'commissioned')]);
    worth(state, { lena: 9_000, brix: 14_000, ossa: 16_000, kai: 10_500 });
    // Half the colonists' Food missing: the memory of hardship and the month's shock land in the colony's output too.
    runColony(state, { ...WELL_MONTH, short: { ...WELL_MONTH.short, food: 0.5 } });
    const seen = stableJson({ colony: state.colony, fund: state.treasury.money, players: state.players.map((p) => [p.id, p.money]) });
    expect(seen).toBe(GOLDEN);
  });

  it('S5-B-AC-2: with 540 spare and shares Projects 80 / Welfare 10, upkeep pays Welfare 54, buildings take at most 432, the rest stays; with 6,000 spare Welfare pays its cap', () => {
    const state = commissioned(fundForSpare(540), shares(80, 10));
    const before = new Map(state.players.map((p) => [p.id, p.money]));
    advanceTo(state, 'upkeep');
    const ledger = state.history.at(-1)!.ledger!;
    expect(ledger.out.welfare, 'Welfare is 10% of 540').toBe(54);
    expect(ledger.out.project, 'buildings take the Projects share and no more').toBe(432);
    expect(state.treasury.money, 'the reserve and the 54 nobody took stay in the fund').toBe(COLONY.reserve + 54);
    const to = state.colony!.welfare!;
    expect(to).toEqual({ month: 1, to: to.to, paid: 54 });
    expect(to.to).not.toBe('lena');
    expect(money(state, to.to) - before.get(to.to)!).toBe(54);

    // Only the Observatory is open (350 credits, 2 Crystite) and the store has no Crystite: the buildings take 350 of
    // the 432 the Projects share allows, and the fund keeps the rest (AM-7).
    const small = governed();
    commission(small, 'lena', 'observatory');
    small.store.stock.crystite = 0;
    small.treasury.money = fundForSpare(540);
    withBudget(small, shares(80, 10));
    advanceTo(small, 'upkeep');
    const needed = PRESTIGE.observatory.credits;
    expect(small.history.at(-1)!.ledger!.out.project, 'buildings take what they need, under the limit').toBe(needed);
    expect(project(small, 'observatory').funded.credits, 'the project holds exactly the credits it asked for').toBe(needed);
    expect(small.treasury.money, 'the reserve, the 54 nobody took and the 82 the buildings did not need stay in the fund').toBe(COLONY.reserve + 540 - 54 - needed);

    const rich = commissioned(fundForSpare(6_000), shares(80, 10));
    advanceTo(rich, 'upkeep');
    expect(rich.history.at(-1)!.ledger!.out.welfare, 'a tenth of 6,000 is 600; the cap holds it').toBe(B.welfare.maxCredits);

    const plain = commissioned(fundForSpare(540), null);
    advanceTo(plain, 'upkeep');
    const today = plain.history.at(-1)!.ledger!;
    expect(today.out.welfare, 'no budget set: nothing for Welfare').toBeUndefined();
    expect(today.out.project, 'no budget set: buildings take all 540, as today').toBe(540);
    expect(plain.treasury.money).toBe(COLONY.reserve);
  });

  it("S5-T-AC-2: S5-RULE-3's examples, and the ledger balances in every month of a seeded game with shares set", () => {
    // Credits and goods count together against the Projects limit. The fund holds reserve + 2,000; the store sells
    // Electronics at a price the fund could pay from its spare but the limit leaves no room for.
    const priced = (share: number): GameState => {
      const state = governed(COLONY.reserve + 2_000);
      commission(state, 'lena', 'hospital');
      state.store.stock.electronics = 5;
      withBudget(state, shares(share, 0));
      return state;
    };
    const tight = priced(70);
    const price = storeQuotes(tight, 'electronics').sell!;
    const hospital = PRESTIGE.hospital;
    expect(price, 'the fund could buy it').toBeLessThan(2_000 - hospital.credits);
    expect(price, 'the 70% limit (1,400) leaves less than that after the credits').toBeGreaterThan(Math.floor(0.7 * 2_000) - hospital.credits);
    runColony(tight);
    expect(project(tight, 'hospital').funded).toEqual({ credits: hospital.credits, goods: {} });
    expect(tight.colony!.ledger.out.project).toBe(hospital.credits);

    const roomy = priced(80);
    runColony(roomy);
    expect(project(roomy, 'hospital').funded.goods).toEqual({ electronics: 1 });
    expect(roomy.colony!.ledger.out.project, 'the goods count in the Projects line').toBe(hospital.credits + price);

    // Flooring: 545 spare is not a multiple of 20. Every line pays its floor, so the fund keeps at least the reserve.
    const odd = commissioned(COLONY.reserve + 545, shares(80, 10));
    runColony(odd);
    expect(odd.colony!.ledger.out).toEqual({ welfare: 54, project: 436 });
    expect(odd.treasury.money, '545 - 54 - 436 = 55 stays').toBe(COLONY.reserve + 55);
    const thin = commissioned(COLONY.reserve + 545, shares(85, 5));
    runColony(thin);
    expect(thin.colony!.ledger.out).toEqual({ welfare: 27, project: 463 });

    const poor = commissioned(90, shares(80, 10));
    runColony(poor);
    expect(poor.colony!.ledger.out).toEqual({});
    expect(poor.colony!.welfare).toBeNull();
    expect(poor.treasury.money).toBe(90);

    const game = governed(0, 11);
    commission(game, 'lena', 'stadium');
    withBudget(game, shares(80, 10));
    let months = 0;
    let paid = 0;
    while (game.phase !== 'gameOver') {
      const start = game.treasury.money;
      advanceTo(game, 'upkeep');
      const ledger = game.history.at(-1)!.ledger!;
      expect(net(ledger), `month ${game.month}`).toBe(game.treasury.money - start);
      paid += ledger.out.welfare ?? 0;
      months++;
      advancePhase(game);
      if (game.phase === 'planning') game.treasury.money += 700;
    }
    expect(months).toBe(game.maxMonths);
    expect(paid, 'Welfare was paid in the months the fund had spare').toBeGreaterThan(0);
  });

  it('S5-T-AC-4: S5-RULE-4\'s rows; the Governor is never the recipient; a tie draws from its own stream and moves no election draw', () => {
    const base = governed(1_000);
    withBudget(base, shares(80, 10));
    worth(base, { lena: 9_000, kai: 10_500, brix: 14_000, ossa: 16_000 });
    expect(welfareRecipient(base), 'Lena is last but governs: the next-lowest gets it').toBe('kai');
    worth(base, { lena: 20_000 });
    expect(welfareRecipient(base)).toBe('kai');

    const none = governed(1_000);
    withBudget(none, shares(100, 0));
    worth(none, { lena: 9_000, kai: 10_500, brix: 14_000, ossa: 16_000 });
    expect(welfareRecipient(none), 'row 1 names the recipient at a 0% share too (AM-8)').toBe('kai');
    const before = money(none, 'kai');
    runColony(none);
    expect(money(none, 'kai'), 'and a 0% share pays nothing').toBe(before);
    expect(none.colony!.welfare, 'and records no payment').toBeNull();
    const off = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    expect(welfareRecipient(off), 'row 1: politics off').toBeNull();
    const alone = governed(1_000);
    withBudget(alone, shares(80, 10));
    alone.players = alone.players.filter((p) => p.id === 'lena');
    expect(welfareRecipient(alone), 'row 2: no player but the Governor').toBeNull();
    const pair = governed(1_000);
    withBudget(pair, shares(80, 10));
    pair.players = pair.players.filter((p) => p.id === 'lena' || p.id === 'ossa');
    worth(pair, { lena: 1, ossa: 99_999 });
    expect(welfareRecipient(pair), 'two players, the Governor last: the other one').toBe('ossa');

    // Row 4: a tie among the non-Governors is drawn, the same every time, and either of them can win it.
    const winners = new Set<string | null>();
    for (let seed = 1; seed <= 30; seed++) {
      const tie = governed(1_000, seed);
      withBudget(tie, shares(80, 10));
      worth(tie, { lena: 50_000, kai: 10_000, brix: 10_000, ossa: 99_000 });
      const first = welfareRecipient(tie);
      expect(welfareRecipient(tie), 'the same draw each time it is asked').toBe(first);
      expect(['kai', 'brix']).toContain(first);
      winners.add(first);
    }
    expect([...winners].sort()).toEqual(['brix', 'kai']);

    // The draw is replay-stable: the same seed and month give the same pick; another month can differ.
    const tiedIn = (seed: number, month: number): string | null => {
      const tie = governed(1_000, seed);
      tie.month = month;
      withBudget(tie, shares(80, 10));
      worth(tie, { lena: 50_000, kai: 10_000, brix: 10_000, ossa: 99_000 });
      return welfareRecipient(tie);
    };
    const byMonth = Array.from({ length: 12 }, (_, i) => tiedIn(7, i + 1));
    expect(byMonth, 'replaying the same seed and months gives the same picks').toEqual(Array.from({ length: 12 }, (_, i) => tiedIn(7, i + 1)));
    expect(new Set(byMonth).size, 'the month is in the draw: across a year of one seed both tied players are picked').toBe(2);
    expect([...new Set(byMonth)].sort()).toEqual(['brix', 'kai']);
  });
});

/** Recorded on the base before S5-C2 (trunk 7ecddae5): the colony, the fund and every player's money after one runColony. Its mood and memory of hardship re-recorded for needs C3 (the month half short of Food). */
const GOLDEN = '{"colony":{"happiness":53,"hardship":0.29629629629629634,"ledger":{"in":{},"month":1,"out":{"project":677,"upkeep":23}},"monthEnds":[{"air":0,"happiness":53,"month":1,"prestige":5,"wealth":50704}],"permanentPrestige":0,"projects":[{"funded":{"credits":340,"goods":{"electronics":1}},"id":"hospital","monthsLeft":null,"plaque":{},"since":1,"stage":"standing"},{"funded":{"credits":210,"goods":{"alloy":1}},"id":"park","monthsLeft":null,"plaque":{},"since":1,"stage":"standing"},{"funded":{"credits":500,"goods":{"alloy":1}},"id":"stadium","monthsLeft":null,"plaque":{},"since":1,"stage":"commissioned"},{"funded":{"credits":73,"goods":{}},"id":"observatory","monthsLeft":null,"plaque":{},"since":1,"stage":"commissioned"}],"promises":[],"strike":null,"welfare":null},"fund":100,"players":[["lena",9000],["brix",14000],["ossa",16000],["kai",10500]]}';
