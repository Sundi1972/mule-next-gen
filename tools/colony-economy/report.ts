/**
 * The colony-economy report: the base every price change in the colony-economy plan is judged against.
 * Plays the sim's 10 seed-1 games (politics off, then on) and prints one row per metric; add a row by appending to METRICS.
 *   pnpm --filter @mule/ai exec tsx ../../tools/colony-economy/report.ts <label> [--json <file>] [--games N] [--seed S]
 */
import { writeFileSync } from 'node:fs';
// Relative, not @mule/engine: that name resolves only from inside packages/ai.
import { GOODS, GOOD_CONFIG, SHIP_ID, STORE_ID, storeForSale, type Good, type GameState } from '../../packages/engine/src/index.ts';
import { simSeats } from '../../packages/ai/src/lineup.ts';
import { playGameAsync } from '../../packages/ai/src/play.ts';

const CEILING_TIMES = 12;
const WATCHED: Good[] = ['food', 'water', 'energy', 'electronics'];

function flag(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const perGood = <T>(make: () => T) => Object.fromEntries(GOODS.map((g) => [g, make()])) as Record<Good, T>;

interface GameRecord {
  seed: number;
  months: number;
  colonistsEnd: number;
  prices: Record<Good, number>[];
  shortages: Good[][];
  colonistsHungryMonths: number;
  plotMonthsOffForEnergy: number;
  farmMonths: number;
  farmMonthsOffForEnergy: number;
  made: Record<Good, number>;
  hungrySeatMonths: number;
  soldOutMonths: Record<Good, number>;
  between: Record<Good, number>;
  traded: Record<Good, number>;
  spreads: Record<Good, number[]>;
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
    // Any tick of the good's auction, the close stage included (as the sim's supplyHooks read the shelf).
    if (!soldOutSeen.has(good) && storeForSale(s, good) === 0) {
      soldOutSeen.add(good);
      soldOutMonths[good]++;
    }
  };
  const played = await playGameAsync(seed, specs, {
    politics,
    walking: true,
    // `hungry` is set by the month's upkeep and read at development, as the sim reads it.
    onPhase: (s: GameState) => {
      if (s.phase === 'development') hungrySeatMonths += s.players.filter((p) => p.hungry).length;
    },
    // Wrapping seat 0's tick sees the board before every step; it reads and changes nothing.
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
  let plotMonthsOffForEnergy = 0;
  let farmMonths = 0;
  let farmMonthsOffForEnergy = 0;
  for (const h of state.history) {
    for (const x of Object.values(h.produced)) for (const g of GOODS) made[g] += x[g];
    for (const l of h.lines ?? []) {
      const off = l.parts.some((x) => x.why === 'energyOff');
      if (off) plotMonthsOffForEnergy++;
      if (state.tiles[l.tile]!.outfit === 'food') {
        farmMonths++;
        if (off) farmMonthsOffForEnergy++;
      }
    }
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
    plotMonthsOffForEnergy,
    farmMonths,
    farmMonthsOffForEnergy,
    made,
    hungrySeatMonths,
    soldOutMonths,
    between,
    traded,
    spreads,
    worksEnd,
  };
}

const sum = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0);
/** The sim's quantile (sim.ts): the sorted value at floor(q * n), so medians match its table. */
const quantile = (xs: readonly number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const fmt = (n: number, d = 0) => (Number.isNaN(n) ? '-' : n.toFixed(d));
const share = (n: number, of: number) => `${n} of ${of} (${of === 0 ? '-' : fmt((100 * n) / of, 1)}%)`;
const ceilingOf = (g: Good) => Math.round(CEILING_TIMES * GOOD_CONFIG[g].refPrice);
const monthsWhere = (gs: GameRecord[], test: (price: number, g: Good) => boolean) =>
  sum(gs.map((x) => x.prices.filter((m) => GOODS.some((g) => test(m[g], g))).length));

interface Metric {
  name: string;
  value: (games: GameRecord[]) => string;
}

const LABELS: Record<string, string> = { rareEarth: 'Rare earth' };
const label = (g: Good) => LABELS[g] ?? g[0]!.toUpperCase() + g.slice(1);

const METRICS: Metric[] = [
  { name: 'games / months played', value: (gs) => `${gs.length} / ${sum(gs.map((g) => g.months))}` },
  ...GOODS.map((g): Metric => ({
    name: `posted price ${label(g)} min / median / max`,
    value: (gs) => {
      const p = gs.flatMap((x) => x.prices.map((m) => m[g]));
      return `${fmt(Math.min(...p))} / ${fmt(quantile(p, 0.5))} / ${fmt(Math.max(...p))}`;
    },
  })),
  { name: `months with a posted price above ${CEILING_TIMES}x ref (any good)`, value: (gs) => String(monthsWhere(gs, (p, g) => p > CEILING_TIMES * GOOD_CONFIG[g].refPrice)) },
  { name: `months with a posted price at the ${CEILING_TIMES}x ceiling (any good)`, value: (gs) => String(monthsWhere(gs, (p, g) => p >= ceilingOf(g))) },
  ...WATCHED.map((g): Metric => ({ name: `store sold out of ${label(g)} at some point (goods that came up), months`, value: (gs) => String(sum(gs.map((x) => x.soldOutMonths[g]))) })),
  ...(['food', 'water', 'medicine'] as Good[]).map((g): Metric => ({ name: `colonists short of ${label(g)} (months)`, value: (gs) => String(sum(gs.map((x) => x.shortages.filter((m) => m.includes(g)).length))) })),
  { name: "colonists short of Food or Water (months, the sim's figure)", value: (gs) => String(sum(gs.map((x) => x.colonistsHungryMonths))) },
  { name: 'hungry seat-months', value: (gs) => String(sum(gs.map((x) => x.hungrySeatMonths))) },
  { name: 'colonists at the end (mean)', value: (gs) => fmt(sum(gs.map((x) => x.colonistsEnd)) / gs.length, 1) },
  { name: 'farm-months switched off for Energy', value: (gs) => share(sum(gs.map((x) => x.farmMonthsOffForEnergy)), sum(gs.map((x) => x.farmMonths))) },
  { name: 'plot-months switched off for Energy (all plots)', value: (gs) => String(sum(gs.map((x) => x.plotMonthsOffForEnergy))) },
  ...(['food', 'water', 'energy'] as Good[]).map((g): Metric => ({
    name: `between-player share of ${label(g)} units traded`,
    value: (gs) => share(sum(gs.map((x) => x.between[g])), sum(gs.map((x) => x.traded[g]))),
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

async function main() {
  const name = flag('label') ?? process.argv[2] ?? '?';
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
  process.stderr.write(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  const rows = METRICS.map((m) => [m.name, m.value(columns.off), m.value(columns.on)] as const);
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w1 = Math.max('politics off'.length, ...rows.map((r) => r[1].length));
  console.log(`colony-economy report: ${name} (${games} games from seed ${first}, 4 trader seats, walking on)\n`);
  console.log(`${''.padEnd(w0)}  ${'politics off'.padStart(w1)}  politics on`);
  for (const [n, a, b] of rows) console.log(`${n.padEnd(w0)}  ${a.padStart(w1)}  ${b}`);
  if (json) writeFileSync(json, JSON.stringify({ label: name, games, firstSeed: first, off: columns.off, on: columns.on }, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
