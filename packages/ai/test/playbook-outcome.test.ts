import { describe, expect, it } from 'vitest';
import { createGame, type AuctionSide, type GameState, type Good, type GoodPlay, type Playbook } from '@mule/engine';
import { auctionOutcome, developmentOutcome, type DevelopmentLog, type OwnDeclare, type PhaseFact } from '../src/playbook/index.js';

const MONTH = 3;
/** A rival's holding no table could see: it must never reach an outcome. */
const PRIVATE = 917;

function playbook(parts: Pick<Playbook, 'development' | 'auction'>): Playbook {
  return {
    v: 1,
    seat: 'ai0',
    month: MONTH,
    phase: 'month',
    strategy: {
      kind: 'specialist',
      moneyMaker: 'food',
      monopolyTarget: null,
      cashFloor: 100,
      landTarget: { plots: 4, byMonth: 6 },
      stances: { ai1: 'neutral', ai2: 'rival', ai3: 'neutral' },
      reason: 'feed the colony',
    },
    by: 'engine',
    ...parts,
  };
}

function play(role: GoodPlay['role'], hold: number, walkAway: number, bluff = false): GoodPlay {
  return { role, hold, walkAway, start: walkAway, concedeCrPerS: 0, bluff, vsRival: 'undercut1' };
}

/** The auction's end on seed 11: ai0 holds its own goods, and ai1 sits on a private Smithore pile of `rivalSmithore`. */
function endOfAuction(rivalSmithore: number): GameState {
  const state = createGame({ seed: 11, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  Object.assign(state.players[0]!.stock, { food: 5, energy: 2, smithore: 3, crystite: 1, water: 0 });
  state.players[1]!.stock.smithore = rivalSmithore;
  return state;
}

const declare = (seat: string, good: Good, side: AuctionSide): PhaseFact => ({
  kind: 'declare', seat, good, side, month: MONTH, phase: 'auction',
});
const trade = (good: Good, buyer: string, seller: string, price: number): PhaseFact => ({
  kind: 'trade', good, buyer, seller, price, qty: 1, month: MONTH, phase: 'auction',
});

/**
 * The scripted goods auction. Food: ai0 buys from ai1 and the store. Energy: ai0 bluffs a sale and sells to ai1 and the
 * ship. Smithore: skipped, no screen. Crystite: ai0's default side was pass at status; it declared buyer late, so no
 * fact shows it. Water: its seller declare was refused.
 */
const AUCTION_FACTS: PhaseFact[] = [
  declare('ai0', 'food', 'buyer'),
  declare('ai1', 'food', 'seller'),
  declare('ai2', 'food', 'pass'),
  declare('ai3', 'food', 'buyer'),
  trade('food', 'ai0', 'ai1', 30),
  trade('food', 'ai0', 'ai1', 30),
  trade('food', 'ai0', 'ai1', 32),
  trade('food', 'ai0', 'store', 35),
  trade('food', 'store', 'ai1', 20),
  declare('ai0', 'energy', 'seller'),
  declare('ai1', 'energy', 'buyer'),
  declare('ai2', 'energy', 'buyer'),
  declare('ai3', 'energy', 'pass'),
  trade('energy', 'ai1', 'ai0', 28),
  trade('energy', 'ship', 'ai0', 26),
  declare('ai0', 'crystite', 'pass'),
  declare('ai1', 'crystite', 'pass'),
  declare('ai2', 'crystite', 'seller'),
  declare('ai3', 'crystite', 'pass'),
  trade('crystite', 'ai0', 'ai2', 90),
  // ai3 switched to buyer in the walk; only its trade is a fact.
  trade('crystite', 'ai3', 'store', 95),
  declare('ai0', 'water', 'pass'),
  // Not this auction's: another month's trade, and a claim.
  { kind: 'trade', good: 'food', buyer: 'ai0', seller: 'ai1', price: 99, qty: 1, month: MONTH - 1, phase: 'auction' },
  { kind: 'claim', seat: 'ai1', plot: 12, month: MONTH, phase: 'landGrant' },
];

const OWN_DECLARES: OwnDeclare[] = [
  { good: 'food', side: 'buyer' },
  { good: 'energy', side: 'seller' },
  { good: 'crystite', side: 'buyer' },
  { good: 'water', side: 'seller', refused: 'You have none to sell' },
];

const AUCTION = playbook({
  auction: {
    food: play('buyer', 6, 40),
    energy: play('seller', 2, 25, true),
    smithore: play('seller', 3, 18),
    crystite: play('buyer', 2, 100),
    water: play('seller', 0, 12),
  },
});

describe('RULE-11, the PhaseOutcome builders (pure)', () => {
  it('T-AC-9: from a scripted phase\'s facts, the items and the rivals (development)', () => {
    const route: NonNullable<Playbook['development']>['route'] = [
      { act: 'analyse', plot: 12 },
      { act: 'buyMule' },
      { act: 'outfit', outfit: 'food' },
      { act: 'install', plot: 5 },
      { act: 'buyMule' },
      { act: 'outfit', outfit: 'energy' },
      { act: 'install', plot: 6 },
      { act: 'filter', plot: 5 },
      { act: 'pub' },
    ];
    const log: DevelopmentLog = {
      steps: [
        { route: 0, outcome: 'done' },
        { route: 1, outcome: 'done' },
        { route: 2, outcome: 'done' },
        { route: 3, outcome: 'replaced', note: 'stale: plot 5' },
        { route: 4, outcome: 'refused', note: 'sold out' },
        { route: 5, outcome: 'skipped', note: 'sold out' },
        { route: 6, outcome: 'skipped', note: 'sold out' },
        { outcome: 'done', note: 'pub added' },
        { route: 7, outcome: 'not reached', note: 'hurry' },
      ],
      usedMs: 41_250,
    };

    const outcome = developmentOutcome(playbook({ development: { route, timeBudgetMs: 30_000, ifSoldOut: 'pub' } }), log);

    expect(outcome).toEqual({
      seat: 'ai0',
      month: MONTH,
      phase: 'development',
      items: [
        { path: '/development/route/0', expected: route[0], actual: 'done' },
        { path: '/development/route/1', expected: route[1], actual: 'done' },
        { path: '/development/route/2', expected: route[2], actual: 'done' },
        { path: '/development/route/3', expected: route[3], actual: 'replaced', note: 'stale: plot 5' },
        { path: '/development/route/4', expected: route[4], actual: 'refused', note: 'sold out' },
        { path: '/development/route/5', expected: route[5], actual: 'skipped', note: 'sold out' },
        { path: '/development/route/6', expected: route[6], actual: 'skipped', note: 'sold out' },
        { path: '/development/route/7', expected: route[7], actual: 'not reached', note: 'hurry' },
        { path: '/development/route/8', expected: route[8], actual: 'not reached' },
        { path: '/development/timeBudgetMs', expected: 30_000, actual: 41_250 },
      ],
      rivals: { ai1: {}, ai2: {}, ai3: {} },
    });
  });

  it('T-AC-9: from a scripted phase\'s facts, the items and the rivals (auction, with AM-23\'s edges)', () => {
    const outcome = auctionOutcome(AUCTION, endOfAuction(PRIVATE), AUCTION_FACTS, 'ai0', OWN_DECLARES);

    expect(outcome).toEqual({
      seat: 'ai0',
      month: MONTH,
      phase: 'auction',
      items: [
        { path: '/auction/food/role', expected: 'buyer', actual: 'buyer' },
        { path: '/auction/food/hold', expected: 6, actual: 5 },
        // The store's unit is the dearest it paid.
        { path: '/auction/food/walkAway', expected: 40, actual: 35 },
        { path: '/auction/energy/role', expected: 'seller', actual: 'seller', note: 'bluff' },
        { path: '/auction/energy/hold', expected: 2, actual: 2 },
        // The ship's unit is the cheapest it got.
        { path: '/auction/energy/walkAway', expected: 25, actual: 26 },
        { path: '/auction/smithore/role', expected: 'seller', actual: 'skipped' },
        { path: '/auction/smithore/hold', expected: 3, actual: 3 },
        { path: '/auction/smithore/walkAway', expected: 18, actual: null },
        // The status fact says pass; its own log has the late buyer declare.
        { path: '/auction/crystite/role', expected: 'buyer', actual: 'buyer' },
        { path: '/auction/crystite/hold', expected: 2, actual: 1 },
        { path: '/auction/crystite/walkAway', expected: 100, actual: 90 },
        { path: '/auction/water/role', expected: 'seller', actual: 'out', note: 'You have none to sell' },
        { path: '/auction/water/hold', expected: 0, actual: 0 },
        { path: '/auction/water/walkAway', expected: 12, actual: null },
      ],
      rivals: {
        ai1: {
          traded: [
            { good: 'food', side: 'seller', price: 30, qty: 2 },
            { good: 'food', side: 'seller', price: 32, qty: 1 },
            { good: 'food', side: 'seller', price: 20, qty: 1 },
            { good: 'energy', side: 'buyer', price: 28, qty: 1 },
          ],
        },
        ai2: {
          traded: [{ good: 'crystite', side: 'seller', price: 90, qty: 1 }],
          declaredButIdle: ['energy'],
        },
        // Its pass fact stands for crystite, so only food counts as idle.
        ai3: {
          traded: [{ good: 'crystite', side: 'buyer', price: 95, qty: 1 }],
          declaredButIdle: ['food'],
        },
      },
    });
  });

  it("T-AC-9 (negative, HC-7): a rival's private stock never reaches the outcome", () => {
    const planted = auctionOutcome(AUCTION, endOfAuction(PRIVATE), AUCTION_FACTS, 'ai0', OWN_DECLARES);
    const without = auctionOutcome(AUCTION, endOfAuction(0), AUCTION_FACTS, 'ai0', OWN_DECLARES);

    expect(JSON.stringify(planted)).not.toContain(String(PRIVATE));
    expect(planted).toEqual(without);
  });

  it('T-AC-9 (AM-23): with no log, the seat\'s side is its declare fact', () => {
    const outcome = auctionOutcome(AUCTION, endOfAuction(0), AUCTION_FACTS, 'ai0');

    expect(outcome.items.find((i) => i.path === '/auction/crystite/role')).toEqual({ path: '/auction/crystite/role', expected: 'buyer', actual: 'out' });
  });

  it("T-AC-9 (no Pass, #335): an 'out' play stood as the buyer everyone starts as is met as 'out' while it trades none of the good", () => {
    const outPlay = playbook({ auction: { food: play('out', 5, 40), energy: play('out', 2, 25), water: play('buyer', 2, 20) } });
    const facts: PhaseFact[] = [
      declare('ai0', 'food', 'buyer'),
      declare('ai0', 'energy', 'buyer'),
      trade('energy', 'ai0', 'store', 30),
      declare('ai0', 'water', 'buyer'),
    ];
    const role = (good: Good) => auctionOutcome(outPlay, endOfAuction(0), facts, 'ai0').items.find((i) => i.path === `/auction/${good}/role`)!.actual;

    expect(role('food'), 'sat out: a buyer that traded nothing').toBe('out');
    expect(role('energy'), 'it bought: not out').toBe('buyer');
    expect(role('water'), "a buyer's play that bought nothing is still a buyer").toBe('buyer');
  });
});
