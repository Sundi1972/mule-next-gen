import {
  advanceGrant,
  advancePhase,
  analysePlot,
  auctionDone,
  buyMule,
  claimPlot,
  COLONY_SELLER,
  createGame,
  createRng,
  declareRole,
  fitFilter,
  GAME,
  grantDone,
  installMule,
  litPlot,
  lotDone,
  outfitMule,
  RuleError,
  setLotWalk,
  setWalk,
  SHIP_ID,
  stepAuction,
  stepLandAuction,
  STORE_ID,
  visitPub,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
} from '@mule/engine';
import type { Act, AiAction } from './actions.js';
import type { DecisionRecord } from './brain.js';
import type { Decider } from './decider.js';
import { LotHand } from './hands/lot.js';
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
  /** Per month, the ids of players who were broke (under 100 credits) with idle land. */
  broke: string[][];
  /** Units traded at the live auction: between players, with the store (both ways) and to the ship; and its game-time in ms. */
  auction: { between: number; store: number; ship: number; ms: number };
  /** Lots at the land auction: sold and unsold, and of those the colony's offered and sold; stalled counts land auctions cut off by the tick limit. */
  lots: { sold: number; unsold: number; colonyOffered: number; colonySold: number; stalled: number };
  decisions: number;
}

const DEV_TICK_MS = 100;
const rot = (i: number, k: number, n = 6) => (((i - k) % n) + n) % n;

/** Applies a seat's action with the engine's own checks; a RuleError means the rules refused it. */
export function applyAction(state: GameState, id: string, action: AiAction, clock?: { left: number }): boolean {
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
        if (clock) clock.left -= seconds;
        break;
      }
      case 'filter':
        fitFilter(state, id, action.x, action.y);
        break;
      case 'pub':
        visitPub(state, id, clock?.left ?? 0);
        break;
      case 'declare':
        declareRole(state, id, action.side);
        break;
      case 'walk':
        if (state.phase === 'landAuction') setLotWalk(state, id, action.dir);
        else setWalk(state, id, action.dir);
        break;
      case 'done':
        if (state.phase === 'landAuction') lotDone(state, id, action.done);
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
  /** The decider for a seat; null or absent plays the default pick. */
  deciderFor?(seatId: string, spec: SeatSpec, index: number): Decider | null;
  /** Awaited by playGameAsync at every tick step and at the end of every phase; playGame ignores it. */
  between?(): Promise<void> | void;
}

/** Plays one game to the end; the same game, step for step, as playGameAsync without hooks. */
export function playGame(seed: number, specs: SeatSpec[], options: PlayOptions = {}): PlayedGame {
  const steps = playSteps(seed, specs, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** Plays one game, awaiting `options.between` at every step so a decider's answer can arrive before simulated time moves on. */
export async function playGameAsync(seed: number, specs: SeatSpec[], options: PlayOptions = {}): Promise<PlayedGame> {
  const steps = playSteps(seed, specs, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    await options.between?.();
  }
}

/** The game loop, yielding after every tick of every phase and once at the end of each phase. */
function* playSteps(seed: number, specs: SeatSpec[], options: PlayOptions): Generator<void, PlayedGame, void> {
  const state = createGame({ seed, players: specs.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  let decisions = 0;
  const seats = specs.map(
    (s, i) =>
      new AiSeat({
        id: `ai${i}`,
        name: `AI ${i + 1}`,
        persona: s.persona,
        level: s.level,
        seed: (seed * 7_919 + i * 104_729 + 17) >>> 0,
        decider: options.deciderFor?.(`ai${i}`, s, i) ?? null,
        onDecision: (r) => {
          decisions++;
          options.onDecision?.(r);
        },
      }),
  );
  const broke: string[][] = [];
  const auction = { between: 0, store: 0, ship: 0, ms: 0 };
  const lotHands = seats.map((s) => new LotHand(s.mind, createRng((s.options.seed ^ 0xc2b2ae35) >>> 0)));
  const lots = { sold: 0, unsold: 0, colonyOffered: 0, colonySold: 0, stalled: 0 };
  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 500) {
    switch (state.phase) {
      case 'planning':
        for (const s of seats) s.planMonth(state);
        break;
      case 'landGrant': {
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
          yield;
        }
        break;
      }
      case 'development': {
        const clocks = new Map(state.players.map((p) => [p.id, { left: p.devSeconds }]));
        for (let t = 0; t < 120_000; t += DEV_TICK_MS) {
          const active = seats.filter((s) => !state.players.find((p) => p.id === s.id)!.doneDeveloping && clocks.get(s.id)!.left > 0);
          if (active.length === 0) break;
          // Rotate who acts first in a tick, so nobody always reaches the corral first.
          const start = (t / DEV_TICK_MS + state.month) % seats.length;
          for (let k = 0; k < seats.length; k++) {
            const s = seats[(start + k) % seats.length]!;
            const clock = clocks.get(s.id)!;
            if (clock.left <= 0) continue;
            const act: Act = (a) => applyAction(state, s.id, a, clock);
            s.developTick(state, DEV_TICK_MS, clock.left, act);
            clock.left -= DEV_TICK_MS / 1_000;
          }
          yield;
        }
        break;
      }
      case 'auction': {
        for (let ticks = 0; state.auction && state.auction.stage !== 'over' && ticks < 100_000; ticks++) {
          for (const s of seats) s.auctionTick(state, WALK.tickMs, (a) => applyAction(state, s.id, a));
          for (const t of stepAuction(state, WALK.tickMs)) {
            if (t.buyer === SHIP_ID) auction.ship++;
            else if (t.buyer === STORE_ID || t.seller === STORE_ID) auction.store++;
            else auction.between++;
          }
          auction.ms += WALK.tickMs;
          yield;
        }
        break;
      }
      case 'landAuction': {
        for (let ticks = 0; state.landAuction && state.landAuction.stage !== 'over' && ticks < 100_000; ticks++) {
          seats.forEach((s, i) => lotHands[i]!.tick(state, WALK.tickMs, (a) => applyAction(state, s.id, a)));
          const lot = state.landAuction.lot;
          const result = stepLandAuction(state, WALK.tickMs);
          if (lot && result) {
            const colony = lot.seller === COLONY_SELLER;
            if (result.kind === 'sold') lots.sold++;
            else lots.unsold++;
            if (colony) lots.colonyOffered++;
            if (colony && result.kind === 'sold') lots.colonySold++;
          }
          yield;
        }
        if (state.landAuction && state.landAuction.stage !== 'over') lots.stalled++;
        break;
      }
      case 'upkeep':
        broke.push(state.players.filter((p) => p.money < 100 && state.tiles.some((t) => t.owner === p.id && !t.outfit)).map((p) => p.id));
        break;
    }
    yield;
    options.onPhase?.(state);
    advancePhase(state);
  }
  return { state, seats, broke, auction, lots, decisions };
}
