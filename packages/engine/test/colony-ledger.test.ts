import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  applyEvents,
  buildEvent,
  createGame,
  createRng,
  fundOut,
  payOffices,
  POLITICS,
  taxSale,
  type FundLedger,
  type GameState,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

function newGame(politics = true): GameState {
  return createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id })), politics });
}

function governedBy(state: GameState, id: string): void {
  state.politics = { ...state.politics!, governor: id };
}

function advanceTo(state: GameState, phase: GameState['phase']): void {
  while (state.phase !== phase) advancePhase(state);
}

const total = (side: Partial<Record<string, number>>) => Object.values(side).reduce<number>((sum, n) => sum + (n ?? 0), 0);
const net = (ledger: FundLedger) => total(ledger.in) - total(ledger.out);

describe('the colony fund keeps a ledger', () => {
  it("B-AC-20: the month report's ledger shows the sales tax, the Federation tax and office pay by source and line, and in - out is the fund's change", () => {
    const state = newGame();
    governedBy(state, 'lena');
    const fundAtStart = state.treasury.money;
    advanceTo(state, 'auction');

    const kept = taxSale(state, 'brix', 200);
    const salesTax = 200 - kept;
    const levy = buildEvent(state, 'federationTax', createRng(1), undefined, 'planning')!;
    const before = state.treasury.money;
    applyEvents(state, [levy]);
    const federationTax = state.treasury.money - before;
    advanceTo(state, 'upkeep');

    const ledger = state.history.at(-1)!.ledger!;
    expect(salesTax).toBeGreaterThan(0);
    expect(federationTax).toBeGreaterThan(0);
    expect(ledger.in).toEqual({ salesTax, federationTax });
    expect(ledger.out).toEqual({ officePay: Math.min(POLITICS.pay.governor, salesTax + federationTax) });
    expect(net(ledger)).toBe(state.treasury.money - fundAtStart);
  });

  it('T-AC-21: fundOut never takes the fund below 0 and returns what it paid; office pay short of money pays what there is', () => {
    const state = newGame();
    state.treasury.money = 25;
    expect(fundOut(state, 'project', 60)).toBe(25);
    expect(state.treasury.money).toBe(0);
    expect(fundOut(state, 'project', 10)).toBe(0);
    expect(state.colony!.ledger.out).toEqual({ project: 25 });

    state.treasury.money = 20;
    governedBy(state, 'lena');
    const lena = state.players.find((p) => p.id === 'lena')!;
    const cash = lena.money;
    payOffices(state);
    expect(state.players.find((p) => p.id === 'lena')!.money - cash).toBe(20);
    expect(state.treasury.money).toBe(0);
    expect(state.colony!.ledger.out.officePay).toBe(20);
  });

  it('T-AC-22: politics off, there is no colony and no ledger in the report, and the fund moves exactly as the tax says', () => {
    const state = newGame(false);
    expect(state.colony).toBeNull();
    advanceTo(state, 'auction');
    const kept = taxSale(state, 'brix', 200);
    expect(state.treasury.money).toBe(200 - kept);
    advanceTo(state, 'upkeep');
    expect(state.history.at(-1)!).not.toHaveProperty('ledger');
  });

  it("INV-whatif (HC-21): a what-if copy's sale never reaches the real game's ledger", () => {
    const state = newGame();
    advanceTo(state, 'auction');
    const copy = { ...state, treasury: { ...state.treasury, paid: { ...state.treasury.paid } } };
    taxSale(copy, 'brix', 200);
    expect(state.colony!.ledger.in).toEqual({});
  });
});
