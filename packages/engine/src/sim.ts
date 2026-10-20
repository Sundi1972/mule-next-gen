/**
 * Headless simulator: plays AI-only games and prints how prices and the
 * colony behaved. Used to balance the numbers in config.ts.
 *
 *   pnpm sim -- --games 200 --players 4
 */
import { aiClaim, aiDevelop, aiOrders } from './ai/simple.js';
import { advancePhase, createGame, score, settleAuction } from './game.js';
import type { Order } from './auction.js';
import { GOODS, type GameState, type Good } from './types.js';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

export function playAiGame(seed: number, players: number): GameState {
  const state = createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })),
  });
  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 500) {
    switch (state.phase) {
      case 'landGrant':
        for (let round = 0; round < 2; round++) for (const p of state.players) aiClaim(state, p.id);
        break;
      case 'development':
        for (const p of state.players) aiDevelop(state, p.id);
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
    }
    advancePhase(state);
  }
  return state;
}

function main() {
  const games = arg('games', 100);
  const players = arg('players', 4);
  const priceRange = Object.fromEntries(GOODS.map((g) => [g, { min: Infinity, max: 0, sum: 0, n: 0 }]));
  let starved = 0;
  let months = 0;
  const scores: number[] = [];

  for (let seed = 1; seed <= games; seed++) {
    const state = playAiGame(seed, players);
    months += state.month;
    if (state.history.some((h) => h.shortages.includes('food'))) starved++;
    for (const report of state.history) {
      for (const good of GOODS) {
        const r = priceRange[good]!;
        r.min = Math.min(r.min, report.prices[good]);
        r.max = Math.max(r.max, report.prices[good]);
        r.sum += report.prices[good];
        r.n++;
      }
    }
    for (const p of state.players) scores.push(score(state, p.id));
  }

  console.log(`${games} games, ${players} AI players, average length ${(months / games).toFixed(1)} months`);
  console.log(`Colonies with a Food shortage at least once: ${((starved / games) * 100).toFixed(0)}%`);
  console.log(`Average final score: ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}`);
  console.log('Prices (min / avg / max):');
  for (const good of GOODS) {
    const r = priceRange[good]!;
    console.log(`  ${good.padEnd(12)} ${r.min} / ${Math.round(r.sum / r.n)} / ${r.max}`);
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
