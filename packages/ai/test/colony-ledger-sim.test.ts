import { describe, expect, it } from 'vitest';
import type { FundLedger } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';

/** Twenty games locally (MULE_FULL=1), two in the normal suite: each month of each must balance. */
const SEEDS = process.env.MULE_FULL === '1' ? Array.from({ length: 20 }, (_, i) => 101 + i) : [101, 102];

const sum = (side: Partial<Record<string, number>>) => Object.values(side).reduce<number>((total, n) => total + (n ?? 0), 0);
const net = (ledger: FundLedger) => sum(ledger.in) - sum(ledger.out);

describe("the colony fund's ledger over whole AI games", () => {
  it.each(SEEDS)("T-AC-20: seed %i, politics on: every month the ledger's in − out equals the change in the colony fund", (seed) => {
    const { state } = playGame(seed, simSeats(4, 'trader', seed));
    expect(state.history.length).toBeGreaterThan(0);
    let fund = 0;
    for (const report of state.history) {
      expect(report.ledger, `month ${report.month} has a ledger`).toBeDefined();
      expect(net(report.ledger!), `month ${report.month}: in − out against the fund ${fund} → ${report.colonyFund}`).toBe(report.colonyFund - fund);
      fund = report.colonyFund;
    }
  }, 60_000);
});
