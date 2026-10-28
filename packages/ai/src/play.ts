import {
  advanceGrant,
  advancePhase,
  AI_HANDS,
  analysePlot,
  auctionDone,
  buyMule,
  castVote,
  claimPlot,
  COLONY_SELLER,
  createGame,
  createRng,
  declareRole,
  electionDone,
  fitFilter,
  GAME,
  grantDone,
  installMule,
  litPlot,
  lotDone,
  MS_PER_SECOND,
  outfitMule,
  RuleError,
  runFor,
  setLotWalk,
  setSalesTax,
  setWalk,
  SHIP_ID,
  SIM_TARGETS,
  stepAuction,
  stepElection,
  stepLandAuction,
  STORE_ID,
  tileIndex,
  visitPub,
  walkSeconds,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type DevPlace,
  type GameState,
} from '@mule/engine';
import type { Act, AiAction } from './actions.js';
import type { DecisionRecord } from './brain.js';
import { LotHand } from './hands/lot.js';
import { VoteHand } from './hands/vote.js';
import { AiSeat } from './seat.js';

/**
 * Plays AI-only games headless, with the same seats, hands and timing the
 * server uses: the land grant's light moves every GAME.grantTickMs and the
 * quickest seat that wants the lit plot inside that time claims it;
 * development runs every seat's own clock in 100 ms ticks, all at once, so
 * they race for the corral; both auctions run tick by tick exactly as live.
 */

export interface SeatSpec {
  persona: AiPersonaId;
  level: AiLevelId;
}

export interface PlayedGame {
  state: GameState;
  seats: AiSeat[];
  /** Per month, the ids of players who were broke (under SIM_TARGETS.broke.below credits) with idle land. */
  broke: string[][];
  /** Units traded at the live auction: between players, with the store (both ways) and to the ship; and its game-time in ms. */
  auction: { between: number; store: number; ship: number; ms: number };
  /** Lots at the land auction: sold and unsold, and of those the colony's offered and sold; stalled counts land auctions cut off by the tick limit. */
  lots: { sold: number; unsold: number; colonyOffered: number; colonySold: number; stalled: number };
  /** MULEs still led when a seat's development time ran out: they ran off. */
  mulesLost: number;
  decisions: number;
}

/** Seat i's place when the order is rotated by k; the period is the most seats a game has. */
const rot = (i: number, k: number, n = GAME.maxPlayers) => (((i - k) % n) + n) % n;

/**
 * A seat's development clock: seconds left, and, when the game walks, where it stands (or is walking to) and, while it
 * is walking or assaying, the seconds left when it is done and the action it takes on arrival.
 */
export interface DevClock {
  left: number;
  at?: DevPlace;
  busy?: { until: number; then?: AiAction };
}

/** Where a development action happens, if it takes a walk: the corral for a MULE, the plot, or the store for the pub. */
function walkTarget(state: GameState, action: AiAction): DevPlace | null {
  if (action.type === 'buyMule') return 'corral';
  if (action.type === 'pub') return 'store';
  if (action.type === 'install' || action.type === 'analyse' || action.type === 'filter') return tileIndex(state.width, action.x, action.y);
  return null;
}

/**
 * Applies a seat's action with the engine's own checks; a RuleError means the rules refused it. Where the game walks,
 * as on the server, a tap names where to go and what to do there: the colonist is busy until it arrives, and the
 * action applies on arrival (arrive). A tap while busy is refused, and so is a walk that would arrive after the clock
 * ends, except to the pub, which ends the turn and pays for whatever time is left when the colonist gets there.
 */
export function applyAction(state: GameState, id: string, action: AiAction, clock?: DevClock): boolean {
  const walking = clock?.at !== undefined && state.phase === 'development';
  if (walking && clock!.busy) return false;
  const to = walking ? walkTarget(state, action) : null;
  if (clock?.at === undefined || to === null) return applyRule(state, id, action, clock);
  const walk = walkSeconds(state, id, clock.at, to);
  if (walk > clock.left && action.type !== 'pub') return false;
  clock.at = to;
  clock.busy = { until: clock.left - walk, then: action };
  arrive(state, id, clock);
  return true;
}

/** Ends a walk or an assay once the clock reaches its end: the walk's action applies where the colonist arrived. */
export function arrive(state: GameState, id: string, clock: DevClock): void {
  if (!clock.busy || clock.left > clock.busy.until) return;
  const { then } = clock.busy;
  clock.busy = undefined;
  if (then) applyRule(state, id, then, clock);
}

/** The engine's own checks for one action; a RuleError means the rules refused it. */
function applyRule(state: GameState, id: string, action: AiAction, clock?: DevClock): boolean {
  try {
    switch (action.type) {
      case 'claim':
        claimPlot(state, id, action.x, action.y);
        break;
      case 'buyMule':
        buyMule(state, id);
        break;
      case 'outfit':
        outfitMule(state, id, action.outfit);
        break;
      case 'install':
        installMule(state, id, action.x, action.y);
        break;
      case 'analyse': {
        const seconds = analysePlot(state, id, action.x, action.y);
        // Where the game walks the colonist stands on the plot for the assay; elsewhere the time comes off at once.
        if (clock?.at !== undefined) clock.busy = { until: clock.left - seconds };
        else if (clock) clock.left -= seconds;
        break;
      }
      case 'filter':
        fitFilter(state, id, action.x, action.y);
        break;
      case 'pub':
        visitPub(state, id, Math.max(0, clock?.left ?? 0));
        break;
      case 'declare':
        declareRole(state, id, action.side);
        break;
      case 'walk':
        if (state.phase === 'landAuction') setLotWalk(state, id, action.dir);
        else setWalk(state, id, action.dir);
        break;
      case 'run':
        runFor(state, id, action.office, action.promise);
        break;
      case 'vote':
        castVote(state, id, action.office, action.candidate);
        break;
      case 'setTax':
        setSalesTax(state, id, action.percent);
        break;
      case 'done':
        if (state.phase === 'landAuction') lotDone(state, id, action.done);
        else if (state.phase === 'planning' && state.politics?.election) electionDone(state, id, action.done);
        else auctionDone(state, id, action.done);
        break;
    }
    return true;
  } catch (err) {
    if (err instanceof RuleError) return false;
    throw err;
  }
}

export interface PlayOptions {
  onDecision?: (r: DecisionRecord) => void;
  /** Called after each phase is played, before the game moves on: for diagnostics. */
  onPhase?: (state: GameState) => void;
  /** The host option: false plays without offices, elections or a moving tax. On by default, as in createGame. */
  politics?: boolean;
  /** Whether walking costs development time (DEV_WALK). On unless set false, to compare with the game before walking. */
  walking?: boolean;
}

export function playGame(seed: number, specs: SeatSpec[], options: PlayOptions = {}): PlayedGame {
  const state = createGame({ seed, players: specs.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })), politics: options.politics });
  // Read per game, so a sim run's --set reaches it.
  const DEV_TICK_MS = AI_HANDS.devTickMs;
  let decisions = 0;
  const seats = specs.map(
    (s, i) =>
      new AiSeat({
        id: `ai${i}`,
        name: `AI ${i + 1}`,
        persona: s.persona,
        level: s.level,
        // literal-ok: hash constants (primes) that give each seat its own seed from the game's
        seed: (seed * 7_919 + i * 104_729 + 17) >>> 0,
        onDecision: (r) => {
          decisions++;
          options.onDecision?.(r);
        },
      }),
  );
  const broke: string[][] = [];
  const auction = { between: 0, store: 0, ship: 0, ms: 0 };
  const lotHands = seats.map((s) => new LotHand(s.mind, createRng((s.options.seed ^ 0xc2b2ae35) >>> 0))); // literal-ok: a hash salt for the lot hand's rng stream
  const voteHands = seats.map((s) => new VoteHand(s.mind, createRng((s.options.seed ^ 0x165667b1) >>> 0))); // literal-ok: a hash salt for the vote hand's rng stream
  const lots = { sold: 0, unsold: 0, colonyOffered: 0, colonySold: 0, stalled: 0 };
  let mulesLost = 0;
  let guard = 0;
  // A runaway guard that can never bind before a game of any length ends: it follows the months this game plays.
  // literal-ok: a month has seven phases, so eight a month bounds the loop: a guard, not balance
  const maxSteps = (state.maxMonths + 1) * 8;
  while (state.phase !== 'gameOver' && guard++ < maxSteps) {
    switch (state.phase) {
      case 'planning': {
        // The election comes first: hands act before each step, with the same dt, until it is over;
        // one more tick lets the Governor set the tax (every month, with or without an election).
        const vote = (i: number) => voteHands[i]!.tick(state, WALK.tickMs, (a) => applyAction(state, seats[i]!.id, a));
        // literal-ok: a runaway guard on the election's ticks, not a game clock
        for (let ticks = 0; state.politics?.election && state.politics.election.stage !== 'over' && ticks < 100_000; ticks++) {
          seats.forEach((_, i) => vote(i));
          stepElection(state, WALK.tickMs);
        }
        seats.forEach((_, i) => vote(i));
        for (const s of seats) s.planMonth(state);
        break;
      }
      case 'landGrant': {
        // literal-ok: a runaway guard on the grant's steps, not a game clock
        for (let steps = 0; !grantDone(state) && steps < 2_000; steps++) {
          const lit = litPlot(state);
          if (lit) {
            const bids = seats
              .map((s, i) => ({ s, i, ms: s.onLit(state) }))
              .filter((b): b is { s: AiSeat; i: number; ms: number } => b.ms !== null && b.ms < GAME.grantTickMs)
              .sort((a, b) => a.ms - b.ms || rot(a.i, steps) - rot(b.i, steps));
            for (const b of bids) if (applyAction(state, b.s.id, { type: 'claim', x: lit.x, y: lit.y })) break;
          }
          if (!grantDone(state)) advanceGrant(state);
        }
        break;
      }
      case 'development': {
        // Everyone starts the month in the store.
        const startAt: DevPlace | undefined = options.walking === false ? undefined : 'store';
        const clocks = new Map(state.players.map((p): [string, DevClock] => [p.id, { left: p.devSeconds, at: startAt }]));
        // The loop ends when every clock has run out; the cap only bounds it, at the longest clock plus one tick (the
        // clocks count down in floating point, so the last tick can land one late), so it never cuts development short.
        const capMs = Math.max(...state.players.map((p) => p.devSeconds)) * MS_PER_SECOND + DEV_TICK_MS;
        for (let t = 0; t < capMs; t += DEV_TICK_MS) {
          const active = seats.filter((s) => !state.players.find((p) => p.id === s.id)!.doneDeveloping && clocks.get(s.id)!.left > 0);
          if (active.length === 0) break;
          // Rotate who acts first in a tick, so nobody always reaches the corral first.
          const start = (t / DEV_TICK_MS + state.month) % seats.length;
          for (let k = 0; k < seats.length; k++) {
            const s = seats[(start + k) % seats.length]!;
            const clock = clocks.get(s.id)!;
            if (clock.left <= 0) continue;
            const act: Act = (a) => applyAction(state, s.id, a, clock);
            arrive(state, s.id, clock);
            s.developTick(state, DEV_TICK_MS, clock.left, act, clock.at === undefined ? undefined : { at: clock.at, busy: !!clock.busy });
            clock.left -= DEV_TICK_MS / MS_PER_SECOND;
          }
        }
        // The clock has run out: a walk that arrives on its last tick still counts, and a colonist on its way to the
        // pub gets there with no time left.
        for (const [id, clock] of clocks) {
          const then = clock.busy?.then;
          if (then?.type === 'pub') applyRule(state, id, then, { left: 0 });
          else if (then && clock.busy!.until >= 0) applyRule(state, id, then, clock);
        }
        // A MULE still led when time runs out runs off.
        mulesLost += state.players.filter((p) => p.carriedMule !== null).length;
        break;
      }
      case 'auction': {
        // literal-ok: a runaway guard on the goods auction's ticks, not a game clock
        for (let ticks = 0; state.auction && state.auction.stage !== 'over' && ticks < 100_000; ticks++) {
          for (const s of seats) s.auctionTick(state, WALK.tickMs, (a) => applyAction(state, s.id, a));
          for (const t of stepAuction(state, WALK.tickMs)) {
            if (t.buyer === SHIP_ID) auction.ship++;
            else if (t.buyer === STORE_ID || t.seller === STORE_ID) auction.store++;
            else auction.between++;
          }
          auction.ms += WALK.tickMs;
        }
        break;
      }
      case 'landAuction': {
        // literal-ok: a runaway guard on the land auction's ticks (a cut-off one counts as stalled), not a game clock
        for (let ticks = 0; state.landAuction && state.landAuction.stage !== 'over' && ticks < 100_000; ticks++) {
          seats.forEach((s, i) => lotHands[i]!.tick(state, WALK.tickMs, (a) => applyAction(state, s.id, a)));
          const lot = state.landAuction.lot;
          const result = stepLandAuction(state, WALK.tickMs);
          if (!lot || !result) continue;
          const colony = lot.seller === COLONY_SELLER;
          if (result.kind === 'sold') lots.sold++;
          else lots.unsold++;
          if (colony) lots.colonyOffered++;
          if (colony && result.kind === 'sold') lots.colonySold++;
        }
        if (state.landAuction && state.landAuction.stage !== 'over') lots.stalled++;
        break;
      }
      case 'upkeep':
        broke.push(state.players.filter((p) => p.money < SIM_TARGETS.broke.below && state.tiles.some((t) => t.owner === p.id && !t.outfit)).map((p) => p.id));
        break;
    }
    options.onPhase?.(state);
    advancePhase(state);
  }
  return { state, seats, broke, auction, lots, mulesLost, decisions };
}
