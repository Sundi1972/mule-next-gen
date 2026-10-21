/**
 * Headless simulator: plays AI-only games and prints how prices and the
 * colony behaved. Used to balance the numbers in config.ts.
 *
 *   pnpm sim -- --games 200 --players 4
 */
import { aiClaim, aiDevelop, aiOrders } from './ai/simple.js';
import { GAME } from './config.js';
import { advanceGrant, advancePhase, colonyFailed, createGame, grantDone, score, settleAuction } from './game.js';
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
    }
    advancePhase(state);
  }
  return state;
}

function main() {
  const games = arg('games', 100);
  const players = arg('players', 4);
  const priceRange = Object.fromEntries(GOODS.map((g) => [g, { min: Infinity, max: 0, all: [] as number[] }]));
  let mulesShort = 0;
  let collapsed = 0;
  const airs: number[] = [];
  const factories = { alloy: 0, electronics: 0, medicine: 0 };
  let starved = 0;
  let months = 0;
  const scores: number[] = [];

  for (let seed = 1; seed <= games; seed++) {
    const state = playAiGame(seed, players);
    months += state.month;
    if (state.history.some((h) => h.shortages.includes('food'))) starved++;
    mulesShort += state.history.filter((h) => h.storeMules === 0).length;
    if (colonyFailed(state)) collapsed++;
    airs.push(Math.max(...state.history.map((h) => h.air)));
    for (const t of state.tiles) if (t.outfit === 'alloy' || t.outfit === 'electronics' || t.outfit === 'medicine') factories[t.outfit]++;
    for (const report of state.history) {
      for (const good of GOODS) {
        const r = priceRange[good]!;
        r.min = Math.min(r.min, report.prices[good]);
        r.max = Math.max(r.max, report.prices[good]);
        r.all.push(report.prices[good]);
      }
    }
    for (const p of state.players) scores.push(score(state, p.id));
  }

  console.log(`${games} games, ${players} AI players, average length ${(months / games).toFixed(1)} months`);
  console.log(`Colonies with a Food shortage at least once: ${((starved / games) * 100).toFixed(0)}%`);
  console.log(`Average final score: ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}`);
  console.log(`Months with no MULE for sale: ${((mulesShort / months) * 100).toFixed(0)}%`);
  const sortedAir = [...airs].sort((a, b) => a - b);
  console.log(`Colony air at its worst: median ${sortedAir[Math.floor(airs.length / 2)]}, max ${sortedAir.at(-1)}; ended in Collapse: ${((collapsed / games) * 100).toFixed(0)}%`);
  console.log(`Factories at game end, per game: Alloy ${(factories.alloy / games).toFixed(1)}, Electronics ${(factories.electronics / games).toFixed(1)}, Medicine ${(factories.medicine / games).toFixed(1)}`);
  console.log('Prices (min / median / 90th percentile / max):');
  for (const good of GOODS) {
    const r = priceRange[good]!;
    const sorted = [...r.all].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    console.log(`  ${good.padEnd(12)} ${r.min} / ${at(0.5)} / ${at(0.9)} / ${r.max}`);
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
