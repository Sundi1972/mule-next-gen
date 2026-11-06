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
 *   pnpm sim -- --set DEV_STEER.on=true   (a switch: true or false; this one plays development on the arcade floor)
 *   pnpm sim -- --air smoggy           (also counts each month's events as if the air were Smoggy; the games play on unforced)
 *   pnpm sim -- --plays pair           (seats' paths: playbook, today or pair, RULE-15; adds the plan lines. Unset: as config says)
 */
import * as engine from '@mule/engine';
import {
  AI_LEVELS,
  AI_PERSONAS,
  AI_VALUE,
  COLONY_SELLER,
  colonyFailed,
  colonyScore,
  emptyStock,
  GOOD_CONFIG,
  GOODS,
  HAPPINESS,
  moodBand,
  MS_PER_SECOND,
  observe,
  PRICE,
  POLLUTION,
  rollPhase,
  rollPlayerEvent,
  score,
  SIM_TARGETS,
  STORE_ID,
  storeForSale,
  WALK,
  WOLVES,
  type AiLevelId,
  type AiPersonaId,
  type AirBand,
  type Playbook,
  type EventKey,
  type GameState,
  type MonthReport,
  type MoodBand,
} from '@mule/engine';
import { simSeats, type TablePlays } from './lineup.js';
import type { FloorMomentCounts } from './floor-turn.js';
import { playGame, type DevTurn, type PlayedGame, type SeatSpec } from './play.js';
import type { AiSeat } from './seat.js';
import { unitNeed, type Mind } from './value.js';

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
 * the report's header. A path that names no number or switch (true or false) in config is refused.
 */
export function applySets(sets: readonly string[]): string[] {
  for (const set of sets) {
    const [path = '', text = ''] = set.split('=');
    const keys = path.split('.');
    const key = keys.pop()!;
    const block = keys.reduce<unknown>((at, k) => (at as Record<string, unknown> | undefined)?.[k], engine) as Record<string, unknown> | undefined;
    // A switch takes true or false, as written: `--set DEV_STEER.on=true`.
    if (keys.length > 0 && typeof block?.[key] === 'boolean') {
      if (text !== 'true' && text !== 'false') throw new Error(`--set ${set}: ${path} is a switch, so true or false, not ${text}`);
      block[key] = text === 'true';
      continue;
    }
    const value = Number(text);
    if (keys.length === 0 || typeof block?.[key] !== 'number' || text.trim() === '' || !Number.isFinite(value)) {
      throw new Error(`--set ${set}: ${path} names no number or switch in config, or ${text} is not one`);
    }
    block[key] = value;
  }
  return [...sets];
}

const PLAYS: readonly TablePlays[] = ['playbook', 'today', 'pair'];

/** `--plays`: one of PLAYS, or null without the flag; anything else is refused, naming it. */
export function playsArg(text: string | null): TablePlays | null {
  if (text === null) return null;
  if (!(PLAYS as readonly string[]).includes(text)) throw new Error(`Unknown --plays ${text}; use ${PLAYS.join(', ')}`);
  return text as TablePlays;
}

/** The winner's seat: the best engine score, a tie to the lower seat (a stable sort). */
export function winnerOf(state: GameState): number {
  return state.players.map((p, i) => ({ p, i })).sort((a, b) => score(state, b.p.id) - score(state, a.p.id))[0]!.i;
}

/** What the plan lines count over a run. See C14. */
export interface PlanTally {
  games: number;
  /** Wins, and seats sat, by seat kind: a seat's `plays`. */
  wins: Record<'playbook' | 'today', number>;
  seats: Record<'playbook' | 'today', number>;
  /** Planning playbooks written, and those with a monopolyTarget. */
  plans: number;
  monopolyPlans: number;
  /** Land-auction lots AI sellers listed; their sales by item and buyer, and the credits they fetched. */
  listed: number;
  sold: { plot: number; mule: number; toStore: number; cr: number };
  /** Route steps played from a part, and those that fell back, by reason. See RULE-9, RULE-11. */
  steps: number;
  fallbacks: Record<string, number>;
}

export function newPlanTally(): PlanTally {
  return { games: 0, wins: { playbook: 0, today: 0 }, seats: { playbook: 0, today: 0 }, plans: 0, monopolyPlans: 0, listed: 0, sold: { plot: 0, mule: 0, toStore: 0, cr: 0 }, steps: 0, fallbacks: {} };
}

const kindOf = (spec: SeatSpec): 'playbook' | 'today' => (spec.plays === 'playbook' ? 'playbook' : 'today');

/** Adds one played game to the tally; `winner` is its winner's seat (winnerOf). */
export function tallyGame(t: PlanTally, specs: readonly SeatSpec[], played: PlayedGame, winner: number): void {
  t.games++;
  t.wins[kindOf(specs[winner]!)]++;
  for (const s of specs) t.seats[kindOf(s)]++;
  const plans = played.playbooks.filter((pb: Playbook) => pb.phase === 'planning');
  t.plans += plans.length;
  t.monopolyPlans += plans.filter((pb) => pb.strategy.monopolyTarget !== null).length;
  t.listed += played.lots.sold + played.lots.unsold - played.lots.colonyOffered;
  for (const f of played.facts) {
    if (f.kind !== 'sale' || f.seller === COLONY_SELLER) continue;
    t.sold[f.item]++;
    if (f.buyer === STORE_ID) t.sold.toStore++;
    t.sold.cr += f.price;
  }
  for (const o of played.outcomes) {
    for (const item of o.items) {
      if (!item.path.startsWith('/development/route/')) continue;
      t.steps++;
      if (item.actual === 'done') continue;
      // The reason's kind, without the plot or the numbers after its colon.
      const reason = (item.note ?? String(item.actual)).split(':')[0]!;
      t.fallbacks[reason] = (t.fallbacks[reason] ?? 0) + 1;
    }
  }
}

/** The plan lines: wins by seat kind, monopoly plans at the level, AI listings and their sales, route fallbacks. See C14. */
export function planLines(t: PlanTally, level: AiLevelId): string[] {
  const seats = t.seats.playbook + t.seats.today;
  const sales = t.sold.plot + t.sold.mule;
  const reasons = Object.entries(t.fallbacks).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [
    `     Wins by seat kind: playbook ${pct(t.wins.playbook, t.games)}, today ${pct(t.wins.today, t.games)} of ${t.games} games (fair share ${pct(t.seats.playbook, seats)} for playbook seats; no check)`,
    `     Monopoly plans at ${level}: ${t.monopolyPlans} of ${t.plans} planning playbooks (no check)`,
    `     AI listings: ${t.listed} lots listed by AI sellers; ${sales} sold (${t.sold.plot} plots, ${t.sold.mule} MULEs; ${t.sold.toStore} to the store) for ${t.sold.cr} cr (no check)`,
    `     Route fallbacks: ${reasons.reduce((n, [, k]) => n + k, 0)} of ${t.steps} route steps${reasons.length > 0 ? `; ${reasons.map(([r, n]) => `${r} ${n}`).join(', ')}` : ''} (no check)`,
  ];
}

const pct = (n: number, of: number) => `${((n / Math.max(1, of)) * 100).toFixed(0)}%`; // literal-ok: a share shown in percent, display only
/** A player hungry this many months in a row is in the hunger spiral the report counts (Heiko's question). */
const SPIRAL_MONTHS = 3; // literal-ok: the report's definition of the spiral, not a game rule
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

/**
 * One game's colony score total (the engine's colonyScore, RULE-25) at each month's end, month 1 first: read as each
 * upkeep ends, and the last month's from the final state, since its upkeep moves straight to game over. Empty when the
 * game plays without the council.
 */
export function colonyScoreRecorder(): { onPhase: (s: GameState) => void; end: (state: GameState) => number[] } {
  const totals: number[] = [];
  return {
    onPhase: (s) => {
      const score = s.phase === 'upkeep' ? colonyScore(s) : null;
      if (score) totals.push(score.total);
    },
    end: (state) => {
      const score = colonyScore(state);
      return score ? [...totals, score.total] : [];
    },
  };
}

/**
 * The colony score lines (C29's baseline; no check, no target yet): the median and 90th percentile at game end, and the
 * median across games at each month's end. None when no game had a colony (politics off), so that report is unchanged.
 */
export function colonyScoreLines(games: readonly (readonly number[])[]): string[] {
  const played = games.filter((g) => g.length > 0);
  if (played.length === 0) return [];
  const ends = played.map((g) => g.at(-1)!);
  const months = Math.max(...played.map((g) => g.length));
  const path = Array.from({ length: months }, (_, m) => quantile(played.flatMap((g) => (m < g.length ? [g[m]!] : [])), 0.5)); // literal-ok: the median the line names
  return [
    // literal-ok: the median and 90th percentile the line names
    `     Colony score at game end: median ${quantile(ends, 0.5)}, 90th percentile ${quantile(ends, 0.9)} over ${played.length} games (no check)`,
    `     Colony score by month (median across games), months 1-${months}: ${path.join(' / ')} (no check)`,
  ];
}

/**
 * The arcade floor's report lines (spec §4), only when development played on it: MULEs installed and pub times a turn,
 * the pub payout, the presses the referee refused, the moments (packs, glints, scrambles),
 * and the AI's lake analyses.
 */
function floorLines(turns: readonly DevTurn[], moments: readonly FloorMomentCounts[], seats: number): string[] {
  if (turns.length === 0) return [];
  const m = moments.reduce((sum, c) => {
    for (const k of Object.keys(sum) as (keyof FloorMomentCounts)[]) sum[k] += c[k];
    return sum;
  });
  const reached = turns.filter((t) => t.pubAt !== null);
  const installs = turns.reduce((n, t) => n + t.installs, 0);
  const paid = reached.reduce((n, t) => n + t.payout!, 0);
  const refused = turns.reduce((n, t) => n + t.refused, 0);
  const at = reached.map((t) => t.pubAt!);
  // literal-ok: the median and 90th percentile the line names
  const [median, ninetieth] = [quantile(at, 0.5), quantile(at, 0.9)];
  const lakeFailed = turns.reduce((n, t) => n + t.lakeAnalyses.failed, 0);
  const packMonths = moments.filter((c) => c.packs > 0).length;
  const lakeNoTime = turns.reduce((n, t) => n + t.lakeAnalyses.noTime, 0);
  return [
    // literal-ok: two decimals for the MULEs a turn, display only
    `     Development on the floor: ${(installs / turns.length).toFixed(2)} MULEs installed a seat a turn; the pub reached in ${pct(reached.length, turns.length)} of ${turns.length} AI turns, at ${median.toFixed(1)} / ${ninetieth.toFixed(1)} s on the clock (median / 90th percentile); ${(paid / Math.max(1, seats)).toFixed(0)} cr pub payout a seat a game; ${refused} presses refused (no check)`,
    `     Floor moments: packs met ${m.packs} (fought ${m.fights}: won ${m.won}, lost ${m.lost}; ran ${m.runs}: bitten ${m.bitten}); MULEs bolted ${m.bolted}, caught ${m.caught}; pelts sold ${m.peltsSold}; glints lit ${m.glints}, raced ${m.raced} (${pct(m.raced, m.glints)}), won ${m.glintsWon}; scrambles ${m.scrambles}, AI racers ${m.scrambleRacers}, left out ${m.leftOut} (no check)`,
    `${packMonths / Math.max(1, moments.length) >= WOLVES.simMonthsWithPack ? 'ok  ' : 'MISS'} Months with an AI wolf encounter: ${packMonths} of ${moments.length}, ${pct(packMonths, moments.length)} (AM-27: target ${pct(WOLVES.simMonthsWithPack, 1)} or more, on each of seeds 1, 101 and 201)`,
    `     Lake plots: ${lakeFailed} analyses failed on the way, ${lakeNoTime} dropped as not fitting the clock (no check)`,
  ];
}

/** A month's events by the phase they fire in: sickness at development's start, the rest in production. */
interface PhaseEvents {
  development: number;
  production: number;
}

/** The wave-2 events (WS8 wave-2 spec UBER-AC-1): the report gives each one's rate a month and what it moved a game. */
const WAVE_TWO: readonly EventKey[] = [
  'federationTax',
  'federationGrant',
  'immigrationWave',
  'inheritance',
  'muleTheft',
  'epidemic',
  'coldSnap',
  'meteorStrike',
  'pirateRaid',
  'storeFire',
  'ratsInSilo',
  'crookedAccountant',
  'packageFromHome',
];

/** G-5 C26's planning social events (C29: the sim reports them by mood band). */
const SOCIAL: readonly EventKey[] = ['festival', 'generalStrike', 'emigrationWave', 'immigrationWave', 'blamedForUnrest'];
const MOOD_BANDS: readonly MoodBand[] = ['thriving', 'content', 'restless', 'unhappy', 'unrest'];

/** The mood a month's planning roll read: last month's month end, or HAPPINESS.start in month 1; null without a colony. */
function rollMood(state: GameState): MoodBand | null {
  if (!state.colony) return null;
  const last = state.colony.monthEnds.find((g) => g.month === state.month - 1);
  return moodBand(last?.happiness ?? HAPPINESS.start);
}

/** Months with this many events or more share the report's last column. */
const EVENT_COLUMNS = 4; // literal-ok: the report's last column, 4 or more events a month; presentation only

/** The band `--air` names, or null without the flag; an unknown name is refused. */
function forcedBand(name: string | null): AirBand | null {
  if (name === null) return null;
  const band = POLLUTION.bands.find((b) => b.name === name);
  if (!band) throw new Error(`Unknown --air ${name}; use ${POLLUTION.bands.map((b) => b.name).join(', ')}`);
  return band;
}

/**
 * An unflagged copy of the state, to roll this month's events on without touching the game. With a band, its air is
 * that band's and every player's plots caused SIM_TARGETS.forcedAirPoints last month; without, it rolls as the game
 * did. Take it once development is played: sickness then reads what it read at development's start, and production's
 * rolls what they will read.
 */
function rollingCopy(state: GameState, band: AirBand | null): GameState {
  const copy = structuredClone(state);
  delete copy.whatIf; // a what-if copy rolls nothing
  if (!band) return copy;
  copy.air = band.from;
  const caused = Object.fromEntries(copy.players.map((p) => [p.id, SIM_TARGETS.forcedAirPoints]));
  const last = copy.history.at(-1);
  if (last) last.pollutionBy = caused;
  else copy.history.push(standInReport(copy, caused));
  return copy;
}

const sicknessRolls = (copy: GameState) => copy.players.filter((p) => rollPlayerEvent(copy, 'sickness', 'development', p.id)).length;

/** This month's events in `band`'s air, sickness counted as in the plain count; collapses are the caller's (the air doesn't move them). */
function forcedEvents(state: GameState, band: AirBand): PhaseEvents {
  const copy = rollingCopy(state, band);
  return { development: sicknessRolls(copy), production: rollPhase(copy, 'production').length };
}

/** Month 1 has no last month: a report with nothing in it but the air points each player caused. */
function standInReport(state: GameState, pollutionBy: Record<string, number>): MonthReport {
  return {
    month: state.month - 1,
    before: {},
    produced: {},
    prices: emptyStock(),
    shortages: [],
    storeMules: 0,
    pollutionBy,
    air: state.air,
    mulePrice: 0,
    corralSoldOut: false,
    storeCapital: 0,
    colonyFund: 0,
    colonistsHungry: false,
  };
}

/** Events a month by phase and for the month, then the share of months at each count, the last EVENT_COLUMNS or more. */
function eventLines(months: readonly PhaseEvents[], label: string, note: string): string[] {
  const total = (m: PhaseEvents) => m.development + m.production;
  // literal-ok: two decimals, display only
  const mean = (f: (m: PhaseEvents) => number) => (months.reduce((sum, m) => sum + f(m), 0) / Math.max(1, months.length)).toFixed(2);
  const columns = Array.from({ length: EVENT_COLUMNS + 1 }, (_, c) => c);
  const inColumn = (c: number) => (m: PhaseEvents) => (c === EVENT_COLUMNS ? total(m) >= c : total(m) === c);
  return [
    `     Events a month${label}: development ${mean((m) => m.development)}, production ${mean((m) => m.production)}, month ${mean(total)} (${note})`,
    `     Months with ${columns.map((c) => (c === EVENT_COLUMNS ? `${c}+` : `${c}`)).join(' / ')} events${label}: ${columns.map((c) => pct(months.filter(inColumn(c)).length, months.length)).join(' / ')}`,
  ];
}

/** Why a seat short of a good when the auction opened ended it still short. */
const SHORT_WHY = ['soldOut', 'skipped', 'fewer', 'couldNotPay', 'other'] as const;
type ShortWhy = (typeof SHORT_WHY)[number];
const SHORT_WHY_LABEL: Record<ShortWhy, string> = {
  soldOut: 'store sold out mid-auction',
  skipped: 'good skipped by the engine',
  fewer: 'decided fewer than the shortfall',
  couldNotPay: 'could not pay at the good',
  other: 'other',
};

/**
 * What the resource-utility model's proof counts (UBER-AC-1, T-AC-12). UBER-AC-1 (a): at each good's status screen,
 * the seats short of what they need with the store selling it and the cash for the whole shortfall at the store's ask
 * then, and how many left that good still short; a good the engine skips holds no auction and counts none. Beside it,
 * why each seat short of a good when the auction opened (with the store selling and the cash then) ended still short.
 * (b) and T-AC-12: the seat-months that lost output for want of Energy, those while the store had Energy for it and it
 * could pay, and plants and wells at each game's end.
 */
interface SupplyTally {
  entered: number;
  leftShort: number;
  why: Partial<Record<engine.Good, Record<ShortWhy, number>>>;
  seatMonths: number;
  cut: number;
  cutCouldBuy: number;
  plants: number;
  wells: number;
}

const newSupplyTally = (): SupplyTally => ({ entered: 0, leftShort: 0, why: {}, seatMonths: 0, cut: 0, cutCouldBuy: 0, plants: 0, wells: 0 });

interface Short {
  target: number;
  /** Short with the store selling it and the cash for the whole shortfall at the store's ask. */
  canBuy: boolean;
}

/** Each seat's shortfall of a good, by the model's target, at the store's ask `ask`. */
function shortOf(s: GameState, mind: Mind, good: engine.Good, ask: number): Short {
  const p = s.players.find((q) => q.id === mind.me)!;
  const target = unitNeed(observe(s, p.id), mind, good).target;
  const short = target - p.stock[good];
  return { target, canBuy: short > 0 && storeForSale(s, good) > 0 && p.money >= short * ask };
}

/**
 * The tally's hooks for one game: `phase` after each phase, `seats` once the seats sit down. It watches the auction
 * through the first seat's tick, which runs before every step: it reads and changes nothing.
 */
function supplyHooks(tally: SupplyTally): { phase: (s: GameState) => void; seats: (seats: readonly AiSeat[]) => void } {
  let seats: readonly AiSeat[] = [];
  /** When the auction opens: per seat and good, its shortfall at the posted price. */
  let opened: Map<string, Map<engine.Good, Short>> | null = null;
  /** At each good's status screen, per seat; at its close, per seat: the stock, the trade it chose, the shelf. */
  let atStatus = new Map<engine.Good, Map<string, Short>>();
  let atClose = new Map<engine.Good, Map<string, { stock: number; buyTo: number | null; soldOut: boolean }>>();
  const watch = (s: GameState) => {
    const a = s.auction;
    if (!opened || !a?.good) return;
    const good = a.good;
    if (a.stage === 'status' && !atStatus.has(good)) atStatus.set(good, new Map(seats.map((seat) => [seat.mind.me, shortOf(s, seat.mind, good, a.storeSell)])));
    if (a.stage === 'close' && atStatus.has(good) && !atClose.has(good)) {
      const close = new Map<string, { stock: number; buyTo: number | null; soldOut: boolean }>();
      for (const seat of seats) {
        const d = seat.debug().auction;
        const buyTo = d?.good === good && d.side === 'buyer' ? d.goal : null;
        close.set(seat.mind.me, { stock: s.players.find((p) => p.id === seat.mind.me)!.stock[good], buyTo, soldOut: storeForSale(s, good) === 0 });
      }
      atClose.set(good, close);
    }
  };
  const phase = (s: GameState) => {
    if (s.phase === 'production') {
      if (opened) {
        const lines = s.history.at(-1)?.lines ?? [];
        for (const p of s.players) {
          tally.seatMonths++;
          const cut = lines.some((l) => s.tiles[l.tile]!.owner === p.id && l.parts.some((x) => x.why === 'energyOff'));
          const could = atStatus.get('energy')?.get(p.id)?.canBuy ?? opened.get(p.id)?.get('energy')?.canBuy ?? false;
          if (cut) tally.cut++;
          if (cut && could) tally.cutCouldBuy++;
        }
      }
      opened = new Map(seats.map((seat) => [seat.mind.me, new Map(WALK.order.map((g) => [g, shortOf(s, seat.mind, g, Math.ceil(s.store.posted[g] * (1 + PRICE.storeSpread)))]))]));
      atStatus = new Map();
      atClose = new Map();
    }
    if (s.phase !== 'auction' || !opened) return;
    for (const p of s.players) {
      for (const good of WALK.order) {
        const status = atStatus.get(good)?.get(p.id);
        const end = atClose.get(good)?.get(p.id)?.stock ?? p.stock[good];
        if (status?.canBuy) {
          tally.entered++;
          if (end < status.target) tally.leftShort++;
        }
        const start = opened.get(p.id)!.get(good)!;
        if (!start.canBuy || end >= start.target) continue;
        const close = atClose.get(good)?.get(p.id);
        let why: ShortWhy = 'other';
        if (!status) why = 'skipped';
        else if (!status.canBuy) why = 'couldNotPay';
        else if (close && (close.buyTo === null || close.buyTo < status.target)) why = 'fewer';
        else if (close?.soldOut) why = 'soldOut';
        const row = (tally.why[good] ??= Object.fromEntries(SHORT_WHY.map((w) => [w, 0])) as Record<ShortWhy, number>);
        row[why]++;
      }
    }
  };
  return {
    phase,
    seats: (all) => {
      seats = all;
      const first = all[0];
      if (!first) return;
      const tick = first.auctionTick.bind(first);
      first.auctionTick = (state, dt, act) => {
        watch(state);
        tick(state, dt, act);
      };
    },
  };
}

/** The model's proof rows, beside the colony's own Food and Water shortage (HC-6). */
function supplyLines(t: SupplyTally, playerGames: number, colonyShort: string): string[] {
  const perSeat = (n: number) => (n / Math.max(1, playerGames)).toFixed(2); // literal-ok: two decimals, display only
  const why = (Object.entries(t.why) as [engine.Good, Record<ShortWhy, number>][]).map(
    ([good, row]) => `       ${good}: ${SHORT_WHY.filter((w) => row[w] > 0).map((w) => `${SHORT_WHY_LABEL[w]} ${row[w]}`).join(', ')}`,
  );
  return [
    `     Resource utility (UBER-AC-1 a): ${pct(t.leftShort, t.entered)} of ${t.entered} goods a seat came to short, with the store selling and cash at its status screen for the whole shortfall at the store's ask, it left still short (target under 5%); colonists short of Food or Water in ${colonyShort} of months`,
    `     Resource utility (UBER-AC-1 a, why): short when the auction opened, with the store selling and the cash then, and still short after the good:`,
    ...why,
    `     Resource utility (UBER-AC-1 b): Energy cut while the store had Energy and the seat could pay in ${pct(t.cutCouldBuy, t.seatMonths)} of ${t.seatMonths} seat-months (target under 5%); colonists short of Food or Water in ${colonyShort} of months`,
    `     Resource utility (T-AC-12): ${perSeat(t.plants)} plants and ${perSeat(t.wells)} wells a seat-game at the end; a cut for want of Energy in ${pct(t.cut, t.seatMonths)} of seat-months; colonists short of Food or Water in ${colonyShort} of months`,
  ];
}

function main() {
  const overrides = applySets(process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1] ?? ''] : [])));
  const games = arg('games', 100); // literal-ok: the sim's default run length, a command-line default
  const players = arg('players', 4); // literal-ok: the sim's default table size, a command-line default
  const first = arg('seed', 1);
  const level = (argText('level') ?? 'trader') as AiLevelId;
  const persona = argText('persona') as AiPersonaId | null;
  const plays = playsArg(argText('plays'));
  // Under --plays playbook or pair the report adds the plan lines; --plays today and no flag print today's report.
  const plan = plays === 'playbook' || plays === 'pair' ? newPlanTally() : null;
  if (!(level in AI_LEVELS)) throw new Error(`Unknown level ${level}; use ${Object.keys(AI_LEVELS).join(', ')}`);
  if (persona && !(persona in AI_PERSONAS)) throw new Error(`Unknown persona ${persona}; use ${Object.keys(AI_PERSONAS).join(', ')}`);
  // `--walking off` plays the game as it was before walking cost development time.
  const walking = argText('walking') !== 'off';
  let mulesLost = 0;
  // On the arcade floor (DEV_STEER.on): every seat's development turn.
  const floorTurns: DevTurn[] = [];
  const floorMoments: FloorMomentCounts[] = [];
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
  /** Each wave-2 key's events, and the sum of its effects' deltas by what they moved, over every game. */
  const wave2 = Object.fromEntries(WAVE_TWO.map((k) => [k, { fired: 0, moved: {} as Record<string, number> }]));
  /** The month after each store fire: its MULE price and the plots developed at its production; and every month's. */
  const afterFire = { mulePrices: [] as number[], developed: [] as number[] };
  const everyDeveloped: number[] = [];
  const wins: Record<string, number> = {};
  const auction = { between: 0, store: 0, ship: 0, ms: 0 };
  const lots = { sold: 0, unsold: 0, colonyOffered: 0, colonySold: 0, stalled: 0 };
  const band = forcedBand(argText('air'));
  const monthEvents: PhaseEvents[] = [];
  const forcedMonthEvents: PhaseEvents[] = [];
  const politics = argText('politics') !== 'off';
  const pol = { elections: 0, filled: 0, taxes: [] as number[], taxPaid: 0, terms: 0 };
  /** Planning months by the mood their roll read, each social event's count by that band, and the strikes production felt. */
  const zero = () => Object.fromEntries(MOOD_BANDS.map((b) => [b, 0])) as Record<MoodBand, number>;
  const mood = { months: zero(), events: Object.fromEntries(SOCIAL.map((k) => [k, zero()])) as Record<string, Record<MoodBand, number>>, strikesFelt: 0 };
  /** Each game's colony score at each month's end; empty games without the council. */
  const colonyPaths: number[][] = [];
  const supply = AI_VALUE.unit ? newSupplyTally() : null;
  // Read once the land grant opens: by then the month's election is closed and the Governor has set the tax.
  const onPhase = (s: Parameters<NonNullable<Parameters<typeof playGame>[2]>['onPhase'] & {}>[0]) => {
    if (s.phase === 'planning') {
      const band = rollMood(s);
      if (band) {
        mood.months[band]++;
        for (const e of s.monthEvents) if (e.phase === 'planning' && mood.events[e.key]) mood.events[e.key]![band]++;
      }
    }
    if (s.phase === 'production') mood.strikesFelt += (s.history.at(-1)?.events ?? []).filter((e) => e.key === 'generalStrike').length;
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
    const specs = simSeats(players, level, seed, persona, plays);
    // Who starts each development hungry, for the spiral: a player hungry SPIRAL_MONTHS months running.
    const hungryRun = new Map<string, { run: number; spiral: boolean }>();
    // This month's sickness and forced counts, read once development is played; production completes them.
    let pending: { sickness: number; forced: PhaseEvents | null } | null = null;
    /** Plots developed as each month's production runs, by month. */
    const developedAt = new Map<number, number>();
    const colony = colonyScoreRecorder();
    const supplyAt = supply ? supplyHooks(supply) : null;
    const onEachPhase = (s: GameState) => {
      onPhase(s);
      colony.onPhase(s);
      supplyAt?.phase(s);
      if (s.phase === 'production') developedAt.set(s.month, s.tiles.filter((t) => t.owner && t.outfit).length);
      if (s.phase === 'production' && pending) {
        const events = s.history.at(-1)!.events ?? [];
        monthEvents.push({ development: pending.sickness, production: events.length });
        const collapses = events.filter((e) => e.key === 'cavernCollapse').length;
        if (pending.forced) forcedMonthEvents.push({ development: pending.forced.development, production: pending.forced.production + collapses });
        pending = null;
      }
      if (s.phase !== 'development') return;
      // Every sickness roll that hits counts: a Medicine cure is the event's effect, and Player.sick shows only the uncured.
      pending = { sickness: sicknessRolls(rollingCopy(s, null)), forced: band && forcedEvents(s, band) };
      for (const p of s.players) {
        const h = hungryRun.get(p.id) ?? { run: 0, spiral: false };
        h.run = p.hungry ? h.run + 1 : 0;
        h.spiral ||= h.run >= SPIRAL_MONTHS;
        hungryRun.set(p.id, h);
      }
    };
    const played = playGame(seed, specs, { politics, walking, onPhase: onEachPhase, ...(supplyAt ? { onSeats: supplyAt.seats } : {}) });
    const { state, broke, auction: a, lots: l, mulesLost: lost, turns, moments } = played;
    mulesLost += lost;
    colonyPaths.push(colony.end(state));
    floorTurns.push(...turns);
    floorMoments.push(...moments);
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
    if (supply) {
      supply.plants += mine.filter((t) => t.outfit === 'energy').length;
      supply.wells += mine.filter((t) => t.outfit === 'water').length;
    }
    developed += mine.filter((t) => t.outfit).length;
    if (state.players.some((p) => broke.some((_, m) => brokeRun.every((k) => broke[m + k]?.includes(p.id))))) longBroke++;
    if (colonyFailed(state)) collapsed++;
    const keys = state.history.flatMap((h) => h.events ?? []).map((e) => e.key);
    eventMonths += state.history.filter((h) => (h.events ?? []).length > 0).length;
    distinctEvents += new Set(keys).size;
    for (const k of keys) byEvent[k] = (byEvent[k] ?? 0) + 1;
    for (const e of state.history.flatMap((h) => h.events ?? [])) {
      const row = wave2[e.key];
      if (!row) continue;
      row.fired++;
      for (const f of e.effects ?? []) row.moved[f.what] = (row.moved[f.what] ?? 0) + f.delta;
    }
    everyDeveloped.push(...developedAt.values());
    state.history.forEach((h, i) => {
      const next = state.history[i + 1];
      if (!next || !(h.events ?? []).some((e) => e.key === 'storeFire')) return;
      afterFire.mulePrices.push(next.mulePrice);
      afterFire.developed.push(developedAt.get(next.month) ?? 0);
    });
    const winner = winnerOf(state);
    const species = state.players[winner]!.species;
    wins[species] = (wins[species] ?? 0) + 1;
    const wp = specs[winner]!.persona;
    byPersona[wp] = (byPersona[wp] ?? 0) + 1;
    if (plan) tallyGame(plan, specs, played, winner);
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
  for (const line of floorLines(floorTurns, floorMoments, playerGames)) console.log(line);
  console.log(`     Players hungry ${SPIRAL_MONTHS} or more months running: ${pct(spirals, playerGames)} (no check)`);
  if (supply) for (const line of supplyLines(supply, playerGames, pct(hungry, months))) console.log(line);
  console.log(`     Wins by species:${Object.entries(wins).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  console.log(`     Wins by persona: ${Object.entries(byPersona).map(([s, n]) => `${s} ${pct(n, games)}`).join(', ')}`);
  if (plan) for (const line of planLines(plan, level)) console.log(line);
  console.log(
    `     Live auction a month: ${(auction.between / months).toFixed(1)} units between players, ${(auction.store / months).toFixed(1)} with the store, ${(auction.ship / months).toFixed(1)} to the ship; ${(auction.ms / months / MS_PER_SECOND).toFixed(0)} s of auction time`,
  );
  console.log(`     Land auction: ${lots.sold} lots sold, ${lots.unsold} unsold; colony lots ${lots.colonyOffered} offered, ${lots.colonySold} sold, in ${months} months, stalled ${lots.stalled}`);
  console.log(
    `     Production events in ${pct(eventMonths, months)} of months, ${(distinctEvents / games).toFixed(1)} different a game: ${
      Object.entries(byEvent)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }`,
  );
  for (const line of eventLines(monthEvents, '', 'no check')) console.log(line);
  // literal-ok: three decimals for a rate a month, display only
  const rate = (n: number) => (n / Math.max(1, months)).toFixed(3);
  for (const key of WAVE_TWO) {
    const { fired, moved } = wave2[key]!;
    const perGame = Object.entries(moved).map(([what, d]) => `${what} ${(d / games).toFixed(1)}`);
    console.log(`     Wave 2 ${key}: ${rate(fired)} a month (${fired} in all); a game: ${perGame.join(', ') || 'nothing off the map'} (no check)`);
  }
  // literal-ok: the median, the statistic the line is named for
  const median = (values: number[]) => quantile(values, 0.5);
  console.log(
    `     The month after a store fire (${afterFire.mulePrices.length}): MULE price median ${median(afterFire.mulePrices)} (every month ${muleMedian}), plots developed median ${median(afterFire.developed)} (every month ${median(everyDeveloped)}) (no check)`,
  );
  if (band) {
    const note = `measure only, as if each player had caused ${SIM_TARGETS.forcedAirPoints} air points last month`;
    for (const line of eventLines(forcedMonthEvents, ` in forced ${band.name} air`, note)) console.log(line);
  }
  console.log(
    politics
      ? `     Politics: ${pol.elections} elections, ${pct(pol.filled, pol.elections * 2)} of offices filled; Governor's tax ${quantile(pol.taxes, 0)} / ${quantile(pol.taxes, 0.5)} / ${quantile(pol.taxes, 1)}% (min / median / max); ${(pol.taxPaid / games).toFixed(0)} cr sales tax and ${(pol.terms / games).toFixed(1)} terms a game` // literal-ok: an election fills two offices (Governor, Sheriff); 0.5 is the median tax
      : '     Politics: off',
  );
  if (politics) {
    const bands = (counts: Record<MoodBand, number>) => MOOD_BANDS.map((b) => counts[b]).join(' / ');
    console.log(`     Social events by the mood their roll read (${MOOD_BANDS.join(' / ')}): planning months ${bands(mood.months)} (no check)`);
    for (const key of SOCIAL) {
      const rates = MOOD_BANDS.map((b) => pct(mood.events[key]![b], mood.months[b])).join(' / ');
      console.log(`       ${key}: ${bands(mood.events[key]!)}, a month ${rates}`);
    }
    const called = MOOD_BANDS.reduce((n, b) => n + mood.events.generalStrike![b], 0);
    console.log(`       general strikes called ${called}, felt unpaid in production ${mood.strikesFelt}`);
  }
  for (const line of colonyScoreLines(colonyPaths)) console.log(line);
  console.log('\nPosted prices (min / median / 90th percentile / max):');
  for (const good of GOODS) {
    const all = prices[good]!;
    // literal-ok: the column width, and the median and 90th percentile the heading names
    console.log(`  ${good.padEnd(12)} ${Math.min(...all)} / ${quantile(all, 0.5)} / ${quantile(all, 0.9)} / ${Math.max(...all)}`);
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
