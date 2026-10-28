/**
 * Headless simulator: plays AI-only games with strategist seats (the
 * default TopPickDecider, no language model) and checks them against the
 * balance targets in the design doc's Economy model tab (SIM_TARGETS in config.ts). Used to tune the
 * numbers in the engine's config.ts.
 *
 *   pnpm sim -- --games 100 --players 4 --level trader
 *   pnpm sim -- --persona cautious     (every seat the same persona; default: they rotate)
 *   pnpm sim -- --politics off         (no offices, elections or Governor's tax; default: on, as at real tables)
 *   pnpm sim -- --set SPECIES_PERK.zipwingSpeed=1.5   (a config number for this run; repeatable; the header lists them)
 */
import * as engine from '@mule/engine';
import { AI_LEVELS, AI_PERSONAS, colonyFailed, GOOD_CONFIG, GOODS, MS_PER_SECOND, score, SIM_TARGETS, type AiLevelId, type AiPersonaId, type GameState } from '@mule/engine';
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

/**
 * Sets each `BLOCK.key=value` on the engine's config before the games, so a sweep edits no file; returns them for
 * the report's header. A path that names no number in config is refused.
 */
export function applySets(sets: readonly string[]): string[] {
  for (const set of sets) {
    const [path = '', text = ''] = set.split('=');
    const keys = path.split('.');
    const key = keys.pop()!;
    const block = keys.reduce<unknown>((at, k) => (at as Record<string, unknown> | undefined)?.[k], engine) as Record<string, unknown> | undefined;
    const value = Number(text);
    if (keys.length === 0 || typeof block?.[key] !== 'number' || text.trim() === '' || !Number.isFinite(value)) {
      throw new Error(`--set ${set}: ${path} names no number in config, or ${text} is not one`);
    }
    block[key] = value;
  }
  return [...sets];
}

const pct = (n: number, of: number) => `${((n / Math.max(1, of)) * 100).toFixed(0)}%`; // literal-ok: a share shown in percent, display only
/** A player hungry this many months in a row is in the hunger spiral the report counts (Heiko's question). */
const SPIRAL_MONTHS = 3; // literal-ok: the report's definition of the spiral, not a game rule
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

function main() {
  const overrides = applySets(process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1] ?? ''] : [])));
  const games = arg('games', 100); // literal-ok: the sim's default run length, a command-line default
  const players = arg('players', 4); // literal-ok: the sim's default table size, a command-line default
  const first = arg('seed', 1);
  const level = (argText('level') ?? 'trader') as AiLevelId;
  const persona = argText('persona') as AiPersonaId | null;
  if (!(level in AI_LEVELS)) throw new Error(`Unknown level ${level}; use ${Object.keys(AI_LEVELS).join(', ')}`);
  if (persona && !(persona in AI_PERSONAS)) throw new Error(`Unknown persona ${persona}; use ${Object.keys(AI_PERSONAS).join(', ')}`);
  // `--walking off` plays the game as it was before walking cost development time.
  const walking = argText('walking') !== 'off';
  let mulesLost = 0;
  let playerGames = 0;
  let spirals = 0;
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
  const politics = argText('politics') !== 'off';
  const pol = { elections: 0, filled: 0, taxes: [] as number[], taxPaid: 0, terms: 0 };
  // Read once the land grant opens: by then the month's election is closed and the Governor has set the tax.
  const onPhase = (s: Parameters<NonNullable<Parameters<typeof playGame>[2]>['onPhase'] & {}>[0]) => {
    if (s.phase !== 'landGrant' || !s.politics) return;
    pol.taxes.push(Math.round(s.treasury.salesTax * 100)); // literal-ok: the tax in whole percent for the report, display only
    if (s.politics.election) {
      pol.elections++;
      pol.filled += (s.politics.governor ? 1 : 0) + (s.politics.sheriff ? 1 : 0);
    }
  };

  // Month offsets of a broke run: the check looks for SIM_TARGETS.broke.months in a row.
  const brokeRun = Array.from({ length: SIM_TARGETS.broke.months }, (_, k) => k);
  for (let seed = first; seed < first + games; seed++) {
    const specs = simSeats(players, level, seed, persona);
    // Who starts each development hungry, for the spiral: a player hungry SPIRAL_MONTHS months running.
    const hungryRun = new Map<string, { run: number; spiral: boolean }>();
    const onEachPhase = (s: GameState) => {
      onPhase(s);
      if (s.phase !== 'development') return;
      for (const p of s.players) {
        const h = hungryRun.get(p.id) ?? { run: 0, spiral: false };
        h.run = p.hungry ? h.run + 1 : 0;
        h.spiral ||= h.run >= SPIRAL_MONTHS;
        hungryRun.set(p.id, h);
      }
    };
    const { state, broke, auction: a, lots: l, mulesLost: lost } = playGame(seed, specs, { politics, walking, onPhase: onEachPhase });
    mulesLost += lost;
    playerGames += state.players.length;
    spirals += [...hungryRun.values()].filter((h) => h.spiral).length;
    pol.taxPaid += Object.values(state.treasury.paid).reduce((n, x) => n + x, 0);
    pol.terms += Object.values(state.politics?.terms ?? {}).reduce((n, x) => n + x, 0);
    for (const k of ['between', 'store', 'ship', 'ms'] as const) auction[k] += a[k];
    for (const k of Object.keys(lots) as (keyof typeof lots)[]) lots[k] += l[k];
    months += state.history.length;
    soldOut += state.history.filter((h) => h.corralSoldOut).length;
    if (state.history.some((h) => h.prices.food > SIM_TARGETS.foodSpike.factor * GOOD_CONFIG.food.refPrice)) foodSpike++;
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
    if (state.players.some((p) => broke.some((_, m) => brokeRun.every((k) => broke[m + k]?.includes(p.id))))) longBroke++;
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
  const share = (target: number) => pct(target, 1);
  // literal-ok: the median, the statistic its check is named for
  const muleMedian = quantile(mulePrices, 0.5);
  // literal-ok: the 90th percentile, the statistic its check is named for
  const mule90 = quantile(mulePrices, 0.9);
  if (overrides.length > 0) console.log(`config: ${overrides.join(' ')}`);
  console.log(`${games} games (seeds ${first} to ${first + games - 1}), ${players} strategist seats at ${level}, ${(months / games).toFixed(1)} months on average\n`);
  console.log(`${check(muleMedian >= SIM_TARGETS.muleMedian.min && muleMedian <= SIM_TARGETS.muleMedian.max)} MULE price median ${muleMedian} (target ${SIM_TARGETS.muleMedian.min} to ${SIM_TARGETS.muleMedian.max})`);
  console.log(`${check(mule90 < SIM_TARGETS.mule90th)} MULE price 90th percentile ${mule90} (target under ${SIM_TARGETS.mule90th})`);
  console.log(`${check(soldOut / months < SIM_TARGETS.corralSoldOut)} Corral sold out in ${pct(soldOut, months)} of months (target under ${share(SIM_TARGETS.corralSoldOut)})`);
  console.log(
    `${check(foodSpike / games >= SIM_TARGETS.foodSpike.min && foodSpike / games <= SIM_TARGETS.foodSpike.max)} Food above ${SIM_TARGETS.foodSpike.factor}x reference in ${pct(foodSpike, games)} of games (target ${share(SIM_TARGETS.foodSpike.min)} to ${share(SIM_TARGETS.foodSpike.max)})`,
  );
  console.log(`${check(hungry / months < SIM_TARGETS.colonistsShort)} Colonists short of Food or Water in ${pct(hungry, months)} of months (target under ${share(SIM_TARGETS.colonistsShort)})`);
  console.log(`${check(developed / owned >= SIM_TARGETS.developed)} Owned plots developed at the end: ${pct(developed, owned)} (target ${share(SIM_TARGETS.developed)} or more)`);
  console.log(`${check(longBroke === 0)} Games with an AI broke for ${SIM_TARGETS.broke.months} months in a row: ${pct(longBroke, games)} (target none)`);
  console.log(`${check(minFund >= 0)} Lowest colony fund ${minFund} (target 0 or more)`);
  console.log(`${check(collapsed / games <= SIM_TARGETS.collapsed)} Ended in Collapse: ${pct(collapsed, games)} (target ${share(SIM_TARGETS.collapsed)} or less)`);
  console.log(`     Store capital: lowest ${minCapital} (no check: the store never runs out of money)`);
  console.log(`     MULEs lost to the clock: ${(mulesLost / games).toFixed(1)} a game (walking ${walking ? 'on' : 'off'}; no check)`);
  console.log(`     Players hungry ${SPIRAL_MONTHS} or more months running: ${pct(spirals, playerGames)} (no check)`);
  console.log(`     Wins by species:${Object.entries(wins).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  console.log(`     Wins by persona: ${Object.entries(byPersona).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  console.log(
    `     Live auction a month: ${(auction.between / months).toFixed(1)} units between players, ${(auction.store / months).toFixed(1)} with the store, ${(auction.ship / months).toFixed(1)} to the ship; ${(auction.ms / months / MS_PER_SECOND).toFixed(0)} s of auction time`,
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
  console.log(
    politics
      ? `     Politics: ${pol.elections} elections, ${pct(pol.filled, pol.elections * 2)} of offices filled; Governor's tax ${quantile(pol.taxes, 0)} / ${quantile(pol.taxes, 0.5)} / ${quantile(pol.taxes, 1)}% (min / median / max); ${(pol.taxPaid / games).toFixed(0)} cr sales tax and ${(pol.terms / games).toFixed(1)} terms a game` // literal-ok: an election fills two offices (Governor, Sheriff); 0.5 is the median tax
      : '     Politics: off',
  );
  console.log('\nPosted prices (min / median / 90th percentile / max):');
  for (const good of GOODS) {
    const all = prices[good]!;
    // literal-ok: the column width, and the median and 90th percentile the heading names
    console.log(`  ${good.padEnd(12)} ${Math.min(...all)} / ${quantile(all, 0.5)} / ${quantile(all, 0.9)} / ${Math.max(...all)}`);
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
