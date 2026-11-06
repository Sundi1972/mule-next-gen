/**
 * The colony-economy report: the base every price change in the colony-economy plan is judged against.
 *
 * The same 10 seed-1 games as `pnpm sim -- --games 10 --seed 1` (seeds 1..10, 4 trader-level seats, personas rotating
 * by seat and seed, walking on), played twice: politics off, politics on. Run from packages/ai, as the ws5-health-sim
 * harness did:
 *
 *   pnpm --filter @mule/ai exec tsx ../../tools/colony-economy/report.ts <label> [--json <file>] [--games N] [--seed S]
 *
 * Measurement only, not product code and not in CI. It reads the game state, the history and the public facts the sim
 * already returns, and changes nothing. Later PRs add rows by appending to METRICS.
 */
import { writeFileSync } from 'node:fs';
import { GOODS, GOOD_CONFIG, SHIP_ID, STORE_ID, storeForSale, type Good, type GameState } from '../../packages/engine/src/index.ts';
import { simSeats } from '../../packages/ai/src/lineup.ts';
import { playGameAsync } from '../../packages/ai/src/play.ts';

const CEILING_TIMES = 12; // the plan's 12x ceiling over a good's reference price
const WATCHED: Good[] = ['food', 'water', 'energy', 'electronics'];

function flag(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const perGood = <T>(make: () => T) => Object.fromEntries(GOODS.map((g) => [g, make()])) as Record<Good, T>;

/** One played game, reduced to the raw numbers the metrics read. */
export interface GameRecord {
  seed: number;
  months: number;
  colonistsEnd: number;
  /** Per month, from the history: the posted price of each good. */
  prices: Record<Good, number>[];
  /** Per month: the goods the colonists were short of. */
  shortages: Good[][];
  /** Months the colonists were short of Food or Water (the history's colonistsHungry: what the sim counts). */
  colonistsHungryMonths: number;
  /** Plot-months a plot made less for want of Energy (a production line with an 'energyOff' part). */
  energyOffPlotMonths: number;
  /** Total units made, by good. */
  made: Record<Good, number>;
  /** Seat-months a player started development hungry (the game's own `hungry` flag). */
  hungrySeatMonths: number;
  /** By good: months in which the store had nothing to sell players at some point in that good's auction. */
  soldOutMonths: Record<Good, number>;
  /** By good: units traded between players, and in all (between players, with the store, to the ship). */
  between: Record<Good, number>;
  traded: Record<Good, number>;
  /** By good: (storeSell - storeBuy) / posted each time the good came up. */
  spreads: Record<Good, number[]>;
  /** Works standing at the end, by outfit. */
  worksEnd: Record<string, number>;
}

async function playOne(seed: number, politics: boolean): Promise<GameRecord> {
  const specs = simSeats(4, 'trader', seed, null, null);
  const soldOutMonths = perGood(() => 0);
  const spreads = perGood<number[]>(() => []);
  let hungrySeatMonths = 0;
  let month = -1;
  let soldOutSeen = new Set<Good>();
  let cameUp = new Set<Good>();
  const watch = (s: GameState) => {
    const a = s.auction;
    if (!a?.good) return;
    if (s.month !== month) {
      month = s.month;
      soldOutSeen = new Set();
      cameUp = new Set();
    }
    const good = a.good;
    if (a.stage === 'status' && !cameUp.has(good)) {
      cameUp.add(good);
      spreads[good].push((a.storeSell - a.storeBuy) / s.store.posted[good]);
    }
    if (!soldOutSeen.has(good) && storeForSale(s, good) === 0) {
      soldOutSeen.add(good);
      soldOutMonths[good]++;
    }
  };
  const played = await playGameAsync(seed, specs, {
    politics,
    walking: true,
    onPhase: (s: GameState) => {
      if (s.phase === 'development') hungrySeatMonths += s.players.filter((p) => p.hungry).length;
    },
    // The first seat's auction tick runs before every step, as the sim's supplyHooks use it: it reads, changes nothing.
    onSeats: (seats) => {
      const first = seats[0];
      if (!first) return;
      const tick = first.auctionTick.bind(first);
      first.auctionTick = (state, dt, act) => {
        watch(state);
        tick(state, dt, act);
      };
    },
  });
  const { state, facts } = played;
  const between = perGood(() => 0);
  const traded = perGood(() => 0);
  for (const f of facts) {
    if (f.kind !== 'trade') continue;
    traded[f.good] += f.qty;
    if (f.buyer !== STORE_ID && f.seller !== STORE_ID && f.buyer !== SHIP_ID && f.seller !== SHIP_ID) between[f.good] += f.qty;
  }
  const made = perGood(() => 0);
  let energyOffPlotMonths = 0;
  for (const h of state.history) {
    for (const x of Object.values(h.produced)) for (const g of GOODS) made[g] += x[g];
    energyOffPlotMonths += (h.lines ?? []).filter((l) => l.parts.some((x) => x.why === 'energyOff')).length;
  }
  const worksEnd: Record<string, number> = {};
  for (const t of state.tiles) if (t.owner && t.outfit) worksEnd[t.outfit] = (worksEnd[t.outfit] ?? 0) + 1;
  return {
    seed,
    months: state.history.length,
    colonistsEnd: state.colonists,
    prices: state.history.map((h) => ({ ...h.prices })),
    shortages: state.history.map((h) => [...h.shortages]),
    colonistsHungryMonths: state.history.filter((h) => h.colonistsHungry).length,
    energyOffPlotMonths,
    made,
    hungrySeatMonths,
    soldOutMonths,
    between,
    traded,
    spreads,
    worksEnd,
  };
}

// ---------------------------------------------------------------- the rows

const sum = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0);
/** The sim's own quantile (packages/ai/src/sim.ts): the sorted value at floor(q * n), so medians reproduce its table. */
const quantile = (xs: readonly number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const fmt = (n: number, d = 0) => (Number.isNaN(n) ? '-' : n.toFixed(d));
const monthsTotal = (gs: GameRecord[]) => sum(gs.map((g) => g.months));

/** One named row: the text for one column (one politics setting) from that setting's games. Append to add a row. */
export interface Metric {
  name: string;
  value: (games: GameRecord[]) => string;
}

const GOOD_LABEL: Record<string, string> = { food: 'Food', water: 'Water', energy: 'Energy', smithore: 'Smithore', crystite: 'Crystite', rareEarth: 'Rare earth', medicine: 'Medicine', electronics: 'Electronics', alloy: 'Alloy' };
const label = (g: Good) => GOOD_LABEL[g] ?? g;

export const METRICS: Metric[] = [
  { name: 'games / months played', value: (gs) => `${gs.length} / ${monthsTotal(gs)}` },
  ...GOODS.map((g): Metric => ({
    name: `posted price ${label(g)} min / median / max`,
    value: (gs) => {
      const p = gs.flatMap((x) => x.prices.map((m) => m[g]));
      return `${fmt(Math.min(...p))} / ${fmt(quantile(p, 0.5))} / ${fmt(Math.max(...p))}`;
    },
  })),
  {
    name: `months at the ${CEILING_TIMES}x ceiling (any good)`,
    value: (gs) => String(sum(gs.map((x) => x.prices.filter((m) => GOODS.some((g) => m[g] > CEILING_TIMES * GOOD_CONFIG[g].refPrice)).length))),
  },
  ...WATCHED.map((g): Metric => ({ name: `store sold out of ${label(g)} (months)`, value: (gs) => String(sum(gs.map((x) => x.soldOutMonths[g]))) })),
  ...(['food', 'water', 'medicine'] as Good[]).map((g): Metric => ({ name: `colonists short of ${label(g)} (months)`, value: (gs) => String(sum(gs.map((x) => x.shortages.filter((m) => m.includes(g)).length))) })),
  { name: 'colonists short of Food or Water (months, the sim\'s figure)', value: (gs) => String(sum(gs.map((x) => x.colonistsHungryMonths))) },
  { name: 'hungry seat-months', value: (gs) => String(sum(gs.map((x) => x.hungrySeatMonths))) },
  { name: 'colonists at the end (mean)', value: (gs) => fmt(sum(gs.map((x) => x.colonistsEnd)) / gs.length, 1) },
  { name: 'farm-months switched off for Energy', value: (gs) => String(sum(gs.map((x) => x.energyOffPlotMonths))) },
  ...(['food', 'water', 'energy'] as Good[]).map((g): Metric => ({
    name: `between-player share of ${label(g)} units traded`,
    value: (gs) => {
      const all = sum(gs.map((x) => x.traded[g]));
      return all === 0 ? '-' : `${fmt((100 * sum(gs.map((x) => x.between[g]))) / all, 1)}% of ${all}`;
    },
  })),
  ...WATCHED.map((g): Metric => ({
    name: `quoted spread p50 ${label(g)} (n)`,
    value: (gs) => {
      const s = gs.flatMap((x) => x.spreads[g]);
      return `${fmt(quantile(s, 0.5) * 100, 1)}% (${s.length})`;
    },
  })),
  { name: 'Electronics works standing at the end (all games)', value: (gs) => String(sum(gs.map((x) => x.worksEnd.electronics ?? 0))) },
  { name: 'Rare earth made (all games)', value: (gs) => String(sum(gs.map((x) => x.made.rareEarth))) },
  { name: 'Alloy made (all games)', value: (gs) => String(sum(gs.map((x) => x.made.alloy))) },
];

// ---------------------------------------------------------------- run

async function main() {
  const [name = '?'] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1]!.startsWith('--')));
  const games = Number(flag('games', '10'));
  const first = Number(flag('seed', '1'));
  const json = flag('json');
  const columns: Record<'off' | 'on', GameRecord[]> = { off: [], on: [] };
  const t0 = Date.now();
  for (const politics of [false, true]) {
    for (let seed = first; seed < first + games; seed++) {
      const rec = await playOne(seed, politics);
      columns[politics ? 'on' : 'off'].push(rec);
      process.stderr.write(`${name} politics ${politics ? 'on ' : 'off'} seed ${seed}: ${rec.months} months, colonists ${rec.colonistsEnd}\n`);
    }
  }
  const width = Math.max(...METRICS.map((m) => m.name.length));
  const rows = METRICS.map((m) => [m.name, m.value(columns.off), m.value(columns.on)] as const);
  const w1 = Math.max('politics off'.length, ...rows.map((r) => r[1].length));
  console.log(`colony-economy report: ${name}  (${games} games from seed ${first}, 4 trader seats, walking on; ${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
  console.log(`${''.padEnd(width)}  ${'politics off'.padStart(w1)}  politics on`);
  for (const [n, a, b] of rows) console.log(`${n.padEnd(width)}  ${a.padStart(w1)}  ${b}`);
  if (json) writeFileSync(json, JSON.stringify({ label: name, games, firstSeed: first, off: columns.off, on: columns.on }, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
