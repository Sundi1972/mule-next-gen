import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  colonyPrestige,
  commission,
  createGame,
  PRESTIGE,
  repair,
  RuleError,
  runColony,
  storeQuotes,
  type GameState,
  type PrestigeId,
  type Project,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** A politics game in planning with Lena governing and no election open. */
function governedGame(fund = 0, politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id })), politics });
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
    projects: [{ id, stage: 'standing', funded: { credits: row.credits, goods: { ...row.goods } }, monthsLeft: null, plot: null, since: 1, plaque: {} }],
  };
}

describe('prestige objects: commissioned, funded, built, kept up', () => {
  it('B-AC-21: Lena commissions the hospital; the fund pays and buys its goods at upkeep, it builds, then stands, counts its prestige and pays upkeep each month after', () => {
    const row = PRESTIGE.hospital;
    const state = governedGame(1_200);
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
    runColony(state);
    expect(project(state, 'hospital').stage).toBe('closed');
    expect(colonyPrestige(state)).toBe(0);
    expect(state.treasury.money).toBe(row.upkeep - 1);

    state.treasury.money = row.upkeep;
    runColony(state);
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
    voting.politics = { ...voting.politics!, election: { ...createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id })) }).politics!.election!, stage: 'ballot' } };
    expect(refused(() => commission(voting, 'lena', 'hospital'))).toBe('Commission once the votes are over');
    const auction = governedGame();
    auction.phase = 'auction';
    expect(refused(() => commission(auction, 'lena', 'hospital'))).toBe('Commission once the votes are over');

    const state = governedGame();
    expect(refused(() => commission(state, 'kai', 'hospital'))).toBe('Only the Governor commissions for the colony');
    expect(refused(() => commission(state, 'lena', 'castle' as PrestigeId))).toBe("The colony can't build that");
    expect(refused(() => commission(state, 'lena', 'hospital'))).toBe('accepted');
    expect(refused(() => commission(state, 'lena', 'hospital'))).toBe('The colony already has a Hospital');
    expect(refused(() => commission(state, 'lena', 'park'))).toBe('The colony is already building the Hospital');
    expect(project(state, 'hospital')).toMatchObject({ stage: 'commissioned', funded: { credits: 0, goods: {} }, since: state.month, plaque: {} });
  });

  it('T-AC-25: an object that needs a plot waits commissioned with no site, however well funded, and never builds', () => {
    const state = governedGame(10_000);
    state.store.stock.alloy = 10;
    commission(state, 'lena', 'park');
    for (let i = 0; i < 3; i++) runColony(state);
    expect(project(state, 'park')).toMatchObject({ stage: 'commissioned', plot: null, funded: { credits: PRESTIGE.park.credits, goods: PRESTIGE.park.goods } });
  });
});
