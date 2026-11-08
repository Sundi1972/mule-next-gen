import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  COLONY,
  colonyPrestige,
  commission,
  createGame,
  exportDemand,
  monthlyDemand,
  payGrant,
  PRESTIGE,
  repair,
  RuleError,
  runColony,
  storeQuotes,
  stillToPay,
  UPKEEP,
  type GameState,
  type PrestigeId,
  type Project,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** A politics game in planning with Lena governing and no election open. */
function governedGame(fund = 0, politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  state.treasury.money = fund;
  return state;
}

function nextUpkeep(state: GameState): void {
  do advancePhase(state);
  while (state.phase !== 'upkeep');
}

function project(state: GameState, id: PrestigeId): Project {
  return state.colony!.projects.find((p) => p.id === id)!;
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'accepted';
}

/** A project already standing, as if built. */
function standing(state: GameState, id: PrestigeId): void {
  const row = PRESTIGE[id];
  state.colony = {
    ...state.colony!,
    projects: [{ id, stage: 'standing', funded: { credits: row.credits, goods: { ...row.goods } }, monthsLeft: null, since: 1, plaque: {} }],
  };
}

describe('prestige objects: commissioned, funded, built, kept up', () => {
  it('B-AC-21: Lena commissions the hospital; the fund pays and buys its goods at upkeep, it builds, then stands, counts its prestige and pays upkeep each month after', () => {
    const row = PRESTIGE.hospital;
    // Enough over the credits and the reserve to buy the Electronics at the store's selling price.
    const state = governedGame(2_000);
    state.store.stock.electronics = 5;
    commission(state, 'lena', 'hospital');
    expect(project(state, 'hospital').stage).toBe('commissioned');

    nextUpkeep(state);
    const price = state.history.at(-1)!.ledger!.out.project! - row.credits;
    expect(price).toBe(storeQuotes(state, 'electronics').sell);
    expect(project(state, 'hospital')).toMatchObject({ stage: 'building', monthsLeft: row.buildMonths, funded: { credits: row.credits, goods: row.goods } });
    expect(state.store.stock.electronics).toBe(5 - row.goods.electronics);

    for (let left = row.buildMonths - 1; left > 0; left--) {
      nextUpkeep(state);
      expect(project(state, 'hospital')).toMatchObject({ stage: 'building', monthsLeft: left });
    }
    nextUpkeep(state);
    expect(project(state, 'hospital').stage).toBe('standing');
    expect(colonyPrestige(state)).toBe(row.prestige);
    expect(state.history.at(-1)!.ledger!.out.upkeep).toBeUndefined();

    nextUpkeep(state);
    expect(state.history.at(-1)!.ledger!.out.upkeep).toBe(row.upkeep);
    expect(project(state, 'hospital').stage).toBe('standing');
  });

  it('T-AC-23: unpaid upkeep closes an object and its prestige counts 0; a paid one reopens; a damaged one counts 0 and its repair is refused while the fund is short', () => {
    const row = PRESTIGE.hospital;
    const state = governedGame(row.upkeep - 1);
    standing(state, 'hospital');
    runColony(state, []);
    expect(project(state, 'hospital').stage).toBe('closed');
    expect(colonyPrestige(state)).toBe(0);
    expect(state.treasury.money).toBe(row.upkeep - 1);

    state.treasury.money = row.upkeep;
    runColony(state, []);
    expect(project(state, 'hospital').stage).toBe('standing');
    expect(state.treasury.money).toBe(0);

    state.colony = { ...state.colony!, projects: [{ ...project(state, 'hospital'), stage: 'damaged' }] };
    expect(colonyPrestige(state)).toBe(0);
    state.treasury.money = row.repairCost - 1;
    expect(refused(() => repair(state, 'lena', 'hospital'))).toBe(`The fund has ${row.repairCost - 1} cr; the repair costs ${row.repairCost} cr`);
    state.treasury.money = row.repairCost;
    repair(state, 'lena', 'hospital');
    expect(project(state, 'hospital').stage).toBe('standing');
    expect(state.colony!.ledger.out.repair).toBe(row.repairCost);
  });

  it("T-AC-24: each of RULE-22's rows refuses with its message, or commissions", () => {
    expect(refused(() => commission(governedGame(0, false), 'lena', 'hospital'))).toBe("This game plays without the colony's council");

    const voting = governedGame();
    voting.politics = { ...voting.politics!, election: { ...createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) }).politics!.election!, stage: 'ballot' } };
    expect(refused(() => commission(voting, 'lena', 'hospital'))).toBe('Commission once the votes are over');
    const lawBallot = governedGame();
    lawBallot.politics = { ...lawBallot.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 'lena', ballots: { lena: true }, done: [], result: null } };
    expect(refused(() => commission(lawBallot, 'lena', 'hospital')), 'the law ballot is a vote too').toBe('Commission once the votes are over');
    const auction = governedGame();
    auction.phase = 'auction';
    expect(refused(() => commission(auction, 'lena', 'hospital'))).toBe('Commission once the votes are over');

    const state = governedGame();
    expect(refused(() => commission(state, 'kai', 'hospital'))).toBe('Only the Governor commissions for the colony');
    expect(refused(() => commission(state, 'lena', 'castle' as PrestigeId))).toBe("The colony can't build that");
    expect(refused(() => commission(state, 'lena', 'hospital'))).toBe('accepted');
    expect(refused(() => commission(state, 'lena', 'hospital'))).toBe('The colony already has a Hospital');
    // COLONY.maxOpen objects may be open at once (3, pace set C, Heiko 6 Nov): the next one is refused.
    const others: PrestigeId[] = ['observatory', 'stadium', 'spaceport'];
    for (const id of others.slice(0, COLONY.maxOpen - 1)) expect(refused(() => commission(state, 'lena', id)), id).toBe('accepted');
    expect(refused(() => commission(state, 'lena', 'park'))).toBe(`The colony already has ${COLONY.maxOpen} buildings under way`);
    const vowel = governedGame();
    commission(vowel, 'lena', 'observatory');
    expect(refused(() => commission(vowel, 'lena', 'observatory')), 'a name with a vowel sound takes "an"').toBe('The colony already has an Observatory');
    expect(project(state, 'hospital')).toMatchObject({ stage: 'commissioned', funded: { credits: 0, goods: {} }, since: state.month, plaque: {} });
  });

  it('T-AC-25 (C48): every object, the Park and the Spaceport upgrade included, builds at the first upkeep that funds it in full, with no wait for land', () => {
    for (const id of ['park', 'stadium', 'spaceport'] as const) {
      const state = governedGame(10_000);
      state.store.stock.alloy = 10;
      state.store.stock.electronics = 10;
      commission(state, 'lena', id);
      runColony(state, []);
      expect(project(state, id), id).toMatchObject({ stage: 'building', monthsLeft: PRESTIGE[id].buildMonths, funded: { credits: PRESTIGE[id].credits, goods: PRESTIGE[id].goods } });
    }
  });

  /** A colony with no goods to buy at the store, so only credits move. */
  function noGoods(fund: number): GameState {
    const state = governedGame(fund);
    for (const good of ['alloy', 'electronics', 'crystite'] as const) state.store.stock[good] = 0;
    return state;
  }

  it('T-AC-24b (pace set C): a front project paid in credits but waiting for its goods does not starve the ones behind it', () => {
    const state = noGoods(2_000);
    commission(state, 'lena', 'spaceport');
    commission(state, 'lena', 'hospital');
    for (let i = 0; i < 4; i++) {
      payGrant(state);
      runColony(state, []);
    }
    expect(project(state, 'spaceport'), 'the Spaceport is paid in credits and waits for its goods').toMatchObject({ stage: 'commissioned', funded: { credits: PRESTIGE.spaceport.credits } });
    expect(project(state, 'hospital').funded.credits, 'the Hospital behind it is paid too').toBe(PRESTIGE.hospital.credits);
    expect(state.treasury.money).toBe(2_000 + 4 * COLONY.grant.perMonth - PRESTIGE.spaceport.credits - PRESTIGE.hospital.credits);
  });

  it('RULE-21 row 4 (pace set C): every open project paid in credits and goods starts building at that upkeep, not only the oldest', () => {
    const state = noGoods(0);
    commission(state, 'lena', 'spaceport');
    commission(state, 'lena', 'hospital');
    // The Hospital has every credit and good in before the month end; the Spaceport in front of it has no goods.
    project(state, 'hospital').funded = { credits: PRESTIGE.hospital.credits, goods: { ...PRESTIGE.hospital.goods } };
    runColony(state, []);
    expect(project(state, 'spaceport'), 'the Spaceport still waits for its goods').toMatchObject({ stage: 'commissioned' });
    expect(project(state, 'hospital'), 'the Hospital starts behind it').toMatchObject({ stage: 'building', monthsLeft: PRESTIGE.hospital.buildMonths });
  });

  it('T-AC-24b (pace set C): with too little for both, the fund pays the earlier project first and keeps its reserve', () => {
    const spare = PRESTIGE.spaceport.credits - 40;
    const state = noGoods(COLONY.reserve + spare);
    commission(state, 'lena', 'spaceport');
    commission(state, 'lena', 'hospital');
    runColony(state, []);
    expect(project(state, 'spaceport').funded.credits, 'the earlier project takes all the fund can spare').toBe(spare);
    expect(project(state, 'hospital').funded.credits, 'nothing is left for the later one').toBe(0);
    expect(state.treasury.money, 'the reserve stays').toBe(COLONY.reserve);
    state.treasury.money += 100;
    runColony(state, []);
    expect(project(state, 'spaceport').funded.credits, 'the earlier one is topped up first').toBe(PRESTIGE.spaceport.credits);
    expect(project(state, 'hospital').funded.credits, 'the rest goes to the later one').toBe(60);
    expect(state.treasury.money).toBe(COLONY.reserve);
  });
});

describe('C49: a waiting building pulls on the store (G-5 AM-17)', () => {
  /** The Hospital, open, with its credits paid and its goods short by `missing` Electronics. */
  function hospitalAt(state: GameState, stage: Project['stage'], missing: number): void {
    const row = PRESTIGE.hospital;
    const goods = { electronics: (row.goods.electronics ?? 0) - missing };
    state.colony = {
      ...state.colony!,
      projects: [{ id: 'hospital', stage, funded: { credits: row.credits, goods }, monthsLeft: null, since: 1, plaque: {} }],
    };
  }

  it("C49: an open commissioned Hospital missing 1 Electronics adds 1 to the store's monthly Electronics demand", () => {
    const state = governedGame();
    const base = monthlyDemand(state).electronics;
    hospitalAt(state, 'commissioned', 1);
    expect(monthlyDemand(state).electronics).toBe(base + 1);
  });

  it('C49: a fully funded or building Hospital adds nothing', () => {
    const state = governedGame();
    const base = monthlyDemand(state);
    hospitalAt(state, 'commissioned', 0);
    expect(monthlyDemand(state)).toEqual(base);
    hospitalAt(state, 'building', 1);
    expect(monthlyDemand(state)).toEqual(base);
  });

  it('C49: politics off, no colony, the demand is unchanged', () => {
    const off = governedGame(0, false);
    expect(off.colony).toBeFalsy();
    // Without a colony, Electronics' buyers are the colonists' want (the lane's needs AM-2) and the export ship: no building adds to them.
    expect(monthlyDemand(off).electronics).toBe(off.colonists / UPKEEP.colonistsPerElectronics + exportDemand(off).electronics);
  });
});

describe('AM-15: stillToPay is what the fund would spend', () => {
  /** A commissioned Park with `paid` credits funded and the fund at 1e6, so neither reserve nor limit binds. */
  function parked(paid: number, buys: boolean) {
    const state = governedGame(1_000_000);
    commission(state, 'lena', 'park');
    project(state, 'park').funded.credits = paid;
    COLONY.fundBuysGoods = buys;
    return state;
  }

  it('S5-T-AC-13: AM-15: stillToPay equals the project spend runColony makes, goods and credits, in each starting state', () => {
    const saved = COLONY.fundBuysGoods;
    try {
      for (const [paid, buys] of [[0, true], [PRESTIGE.park.credits, true], [0, false], [PRESTIGE.park.credits, false]] as const) {
        const state = parked(paid, buys);
        const want = stillToPay(state, project(state, 'park'));
        runColony(state, []);
        expect(state.colony!.ledger.out.project ?? 0, `paid ${paid}, buys ${buys}`).toBe(want);
      }
      const goodsOnly = parked(PRESTIGE.park.credits, true);
      expect(stillToPay(goodsOnly, project(goodsOnly, 'park')), 'goods alone are not 0').toBeGreaterThan(0);
      const notBought = parked(PRESTIGE.park.credits, false);
      expect(stillToPay(notBought, project(notBought, 'park')), 'goods not bought: nothing to pay').toBe(0);
    } finally {
      COLONY.fundBuysGoods = saved;
    }
  });
});
