/**
 * Headless simulator: plays AI-only games with strategist seats (the
 * default TopPickDecider, no language model) and checks them against the
 * balance targets in the design doc's Economy model tab. Used to tune the
 * numbers in the engine's config.ts.
 *
 *   pnpm sim -- --games 100 --players 4 --level trader
 *   pnpm sim -- --persona cautious     (every seat the same persona; default: they rotate)
 */
import { AI_LEVELS, AI_PERSONAS, colonyFailed, GOOD_CONFIG, GOODS, score, type AiLevelId, type AiPersonaId } from '@mule/engine';
import { simSeats } from './lineup.js';
import { playGame } from './play.js';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

function argText(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const pct = (n: number, of: number) => `${((n / Math.max(1, of)) * 100).toFixed(0)}%`;
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

function main() {
  const games = arg('games', 100);
  const players = arg('players', 4);
  const first = arg('seed', 1);
  const level = (argText('level') ?? 'trader') as AiLevelId;
  const persona = argText('persona') as AiPersonaId | null;
  if (!(level in AI_LEVELS)) throw new Error(`Unknown level ${level}; use ${Object.keys(AI_LEVELS).join(', ')}`);
  if (persona && !(persona in AI_PERSONAS)) throw new Error(`Unknown persona ${persona}; use ${Object.keys(AI_PERSONAS).join(', ')}`);
  const byPersona: Record<string, number> = {};
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
  let eventMonths = 0;
  let distinctEvents = 0;
  const byEvent: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const auction = { between: 0, store: 0, ship: 0, ms: 0 };
  const lots = { sold: 0, unsold: 0, colonyOffered: 0, colonySold: 0, stalled: 0 };

  for (let seed = first; seed < first + games; seed++) {
    const specs = simSeats(players, level, seed, persona);
    const { state, broke, auction: a, lots: l } = playGame(seed, specs);
    for (const k of ['between', 'store', 'ship', 'ms'] as const) auction[k] += a[k];
    for (const k of Object.keys(lots) as (keyof typeof lots)[]) lots[k] += l[k];
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
    const keys = state.history.flatMap((h) => h.events ?? []).map((e) => e.key);
    eventMonths += state.history.filter((h) => (h.events ?? []).length > 0).length;
    distinctEvents += new Set(keys).size;
    for (const k of keys) byEvent[k] = (byEvent[k] ?? 0) + 1;
    const ranked = state.players.map((p, i) => ({ p, i })).sort((a, b) => score(state, b.p.id) - score(state, a.p.id));
    const winner = ranked[0]!;
    wins[winner.p.species] = (wins[winner.p.species] ?? 0) + 1;
    const wp = specs[winner.i]!.persona;
    byPersona[wp] = (byPersona[wp] ?? 0) + 1;
  }

  const check = (ok: boolean) => (ok ? 'ok  ' : 'MISS');
  const muleMedian = quantile(mulePrices, 0.5);
  const mule90 = quantile(mulePrices, 0.9);
  console.log(`${games} games (seeds ${first} to ${first + games - 1}), ${players} strategist seats at ${level}, ${(months / games).toFixed(1)} months on average\n`);
  console.log(`${check(muleMedian >= 150 && muleMedian <= 300)} MULE price median ${muleMedian} (target 150 to 300)`);
  console.log(`${check(mule90 < 500)} MULE price 90th percentile ${mule90} (target under 500)`);
  console.log(`${check(soldOut / months < 0.1)} Corral sold out in ${pct(soldOut, months)} of months (target under 10%)`);
  console.log(`${check(foodSpike / games >= 0.1 && foodSpike / games <= 0.5)} Food above 3x reference in ${pct(foodSpike, games)} of games (target 10% to 50%)`);
  console.log(`${check(hungry / months < 0.15)} Colonists short of Food or Water in ${pct(hungry, months)} of months (target under 15%)`);
  console.log(`${check(developed / owned >= 0.7)} Owned plots developed at the end: ${pct(developed, owned)} (target 70% or more)`);
  console.log(`${check(longBroke === 0)} Games with an AI broke for 3 months in a row: ${pct(longBroke, games)} (target none)`);
  console.log(`${check(minCapital >= 500)} Lowest store capital ${minCapital} (target 500 or more)`);
  console.log(`${check(minFund >= 0)} Lowest colony fund ${minFund} (target 0 or more)`);
  console.log(`${check(collapsed / games <= 0.1)} Ended in Collapse: ${pct(collapsed, games)} (target 10% or less)`);
  console.log(`     Wins by species: ${Object.entries(wins).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  console.log(`     Wins by persona: ${Object.entries(byPersona).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  console.log(
    `     Live auction a month: ${(auction.between / months).toFixed(1)} units between players, ${(auction.store / months).toFixed(1)} with the store, ${(auction.ship / months).toFixed(1)} to the ship; ${(auction.ms / months / 1000).toFixed(0)} s of auction time`,
  );
  console.log(`     Land auction: ${lots.sold} lots sold, ${lots.unsold} unsold; colony lots ${lots.colonyOffered} offered, ${lots.colonySold} sold, in ${months} months, stalled ${lots.stalled}`);
  console.log(
    `     Events in ${pct(eventMonths, months)} of months, ${(distinctEvents / games).toFixed(1)} different a game: ${
      Object.entries(byEvent)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }`,
  );
  console.log('\nPosted prices (min / median / 90th percentile / max):');
  for (const good of GOODS) {
    const all = prices[good]!;
    console.log(`  ${good.padEnd(12)} ${Math.min(...all)} / ${quantile(all, 0.5)} / ${quantile(all, 0.9)} / ${Math.max(...all)}`);
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
