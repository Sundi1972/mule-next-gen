/**
 * Headless simulator: plays AI-only games and checks them against the
 * balance targets in the design doc's Economy model tab. Used to tune the
 * numbers in config.ts.
 *
 *   pnpm sim -- --games 200 --players 4
 */
import { aiClaim, aiDevelop, aiOrders } from './ai/simple.js';
import { GAME, GOOD_CONFIG } from './config.js';
import { advanceGrant, advancePhase, colonyFailed, createGame, grantDone, score, settleAuction } from './game.js';
import type { Order } from './auction.js';
import { GOODS, type GameState, type Good } from './types.js';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

export interface SimGame {
  state: GameState;
  /** Per month, the ids of players who were broke (under 100 credits) with idle land. */
  broke: string[][];
}

export function playAiGame(seed: number, players: number): GameState {
  return simulate(seed, players).state;
}

export function simulate(seed: number, players: number): SimGame {
  const state = createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })),
  });
  const broke: string[][] = [];
  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 500) {
    switch (state.phase) {
      case 'landGrant': {
        // Walk the light across the free plots; the first AI that wants the lit plot takes it.
        let steps = 0;
        while (!grantDone(state) && steps++ < 2_000) {
          const order = state.players.filter((p) => p.claimsThisGrant < GAME.claimsPerGrant);
          const start = steps % order.length;
          for (let i = 0; i < order.length; i++) if (aiClaim(state, order[(start + i) % order.length]!.id)) break;
          advanceGrant(state);
        }
        break;
      }
      case 'development':
        // Everyone develops at once in the real game; rotate who reaches the corral first.
        state.players.forEach((_, i) => aiDevelop(state, state.players[(i + state.month) % state.players.length]!.id));
        break;
      case 'auction': {
        const orders: Partial<Record<Good, Order[]>> = {};
        for (const p of state.players) {
          for (const [good, list] of Object.entries(aiOrders(state, p.id)) as [Good, Order[]][]) {
            (orders[good] ??= []).push(...list);
          }
        }
        settleAuction(state, orders);
        break;
      }
      case 'upkeep':
        broke.push(
          state.players
            .filter((p) => p.money < 100 && state.tiles.some((t) => t.owner === p.id && !t.outfit))
            .map((p) => p.id),
        );
        break;
    }
    advancePhase(state);
  }
  return { state, broke };
}

const pct = (n: number, of: number) => `${((n / Math.max(1, of)) * 100).toFixed(0)}%`;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

function main() {
  const games = arg('games', 100);
  const players = arg('players', 4);
  const prices = Object.fromEntries(GOODS.map((g) => [g, [] as number[]]));
  const mulePrices: number[] = [];
  let months = 0;
  let soldOut = 0;
  let foodSpike = 0;
  let hungry = 0;
  let developed = 0;
  let owned = 0;
  let longBroke = 0;
  let minCapital = Infinity;
  let minFund = Infinity;
  let collapsed = 0;
  const wins: Record<string, number> = {};

  for (let seed = 1; seed <= games; seed++) {
    const { state, broke } = simulate(seed, players);
    months += state.history.length;
    soldOut += state.history.filter((h) => h.corralSoldOut).length;
    if (state.history.some((h) => h.prices.food > 3 * GOOD_CONFIG.food.refPrice)) foodSpike++;
    hungry += state.history.filter((h) => h.colonistsHungry).length;
    for (const h of state.history) {
      mulePrices.push(h.mulePrice);
      for (const g of GOODS) prices[g]!.push(h.prices[g]);
      minCapital = Math.min(minCapital, h.storeCapital);
      minFund = Math.min(minFund, h.colonyFund);
    }
    const mine = state.tiles.filter((t) => t.owner);
    owned += mine.length;
    developed += mine.filter((t) => t.outfit).length;
    if (state.players.some((p) => broke.some((_, m) => [0, 1, 2].every((k) => broke[m + k]?.includes(p.id))))) longBroke++;
    if (colonyFailed(state)) collapsed++;
    const winner = [...state.players].sort((a, b) => score(state, b.id) - score(state, a.id))[0]!;
    wins[winner.species] = (wins[winner.species] ?? 0) + 1;
  }

  const check = (ok: boolean) => (ok ? 'ok  ' : 'MISS');
  const muleMedian = quantile(mulePrices, 0.5);
  const mule90 = quantile(mulePrices, 0.9);
  console.log(`${games} games, ${players} AI players, ${(months / games).toFixed(1)} months on average\n`);
  console.log(`${check(muleMedian >= 150 && muleMedian <= 300)} MULE price median ${muleMedian} (target 150 to 300)`);
  console.log(`${check(mule90 < 500)} MULE price 90th percentile ${mule90} (target under 500)`);
  console.log(`${check(soldOut / months < 0.1)} Corral sold out in ${pct(soldOut, months)} of months (target under 10%)`);
  console.log(`${check(foodSpike / games >= 0.33 && foodSpike / games <= 0.5)} Food above 3x reference in ${pct(foodSpike, games)} of games (target 33% to 50%)`);
  console.log(`${check(hungry / months < 0.15)} Colonists short of Food or Water in ${pct(hungry, months)} of months (target under 15%)`);
  console.log(`${check(developed / owned >= 0.7)} Owned plots developed at the end: ${pct(developed, owned)} (target 70% or more)`);
  console.log(`${check(longBroke === 0)} Games with an AI broke for 3 months in a row: ${pct(longBroke, games)} (target none)`);
  console.log(`${check(minCapital >= 500)} Lowest store capital ${minCapital} (target 500 or more)`);
  console.log(`${check(minFund >= 0)} Lowest colony fund ${minFund} (target 0 or more)`);
  console.log(`${check(collapsed / games <= 0.1)} Ended in Collapse: ${pct(collapsed, games)} (target 10% or less)`);
  console.log(`     Wins by species: ${Object.entries(wins).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  console.log('\nPosted prices (min / median / 90th percentile / max):');
  for (const good of GOODS) {
    const all = prices[good]!;
    console.log(`  ${good.padEnd(12)} ${Math.min(...all)} / ${quantile(all, 0.5)} / ${quantile(all, 0.9)} / ${Math.max(...all)}`);
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
