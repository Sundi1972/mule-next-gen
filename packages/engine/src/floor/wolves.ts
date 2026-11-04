/**
 * Wolves (arcade RULE-4): on wolf land (WOLVES.lands) a pack may come for a colonist, a seeded roll each tick. Then one
 * choice with the two controls there are: push the stick and RUN (they chase; caught, you are bitten and slowed till
 * the store or your own plot), or press and FIGHT (WOLVES.fightSeconds in place: dodge the lunges with the stick,
 * strike with the button at a wolf that stands open). Win and you carry pelts the store buys (SELL n PELTS); lose and
 * the MULE on your lead bolts (game.ts boltMule, paid by settleMoments) till you catch it, or with none you are stunned.
 * Pure, and stepped by stepFloor; every draw is momentRng's.
 */
import type { WolfFightLevel } from '../config.js';
import { tileAt } from '../grid.js';
import type { GameState, Terrain } from '../types.js';
import { MS_PER_SECOND } from '../units.js';
import { momentRng, nameOf, TURN } from './chance.js';
import {
  IDLE_INPUT,
  isAssaying,
  isStunned,
  ticksOf,
  type DevFloor,
  type FloorColonist,
  type FloorConfig,
  type FloorEncounter,
  type FloorInput,
  type FloorPoint,
  type FloorWolf,
  type MomentsOut,
} from './floor.js';
import { speedOf, terrainShare } from './speed.js';

const HALF = 0.5; // literal-ok: geometry, the middle of a range
const ROUNDING = 1e-9; // literal-ok: float rounding, not balance: a point put on the arena's edge may land a hair past it
const dist = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const secondsPerTick = (cfg: FloorConfig) => cfg.steer.tickMs / MS_PER_SECOND;
/** A chasing wolf's speed: a share of the walking pace (AM-32), so the chase's odds do not hang on the pace. */
const chaseSpeed = (cfg: FloorConfig) => cfg.wolves.chaseShare * cfg.steer.mapTilesPerSecond;

/** A point `r` from `centre` at `angle`, kept on the map. */
function ring(state: GameState, centre: FloorPoint, angle: number, r: number): FloorPoint {
  return { x: clamp(centre.x + Math.cos(angle) * r, 0, state.width), y: clamp(centre.y + Math.sin(angle) * r, 0, state.height) };
}

/** A vector scaled to length 1; null for none. */
const unit = (v: FloorPoint): FloorPoint | null => toward({ x: 0, y: 0 }, v);

/** A unit vector from `from` towards `to`; null when they are one point. */
function toward(from: FloorPoint, to: FloorPoint): FloorPoint | null {
  const d = dist(from, to);
  return d > 0 ? { x: (to.x - from.x) / d, y: (to.y - from.y) / d } : null;
}

const isWolfLand = (terrain: Terrain, cfg: FloorConfig) => (cfg.wolves.lands as readonly Terrain[]).includes(terrain);

/** A pack round a colonist, from one side (packArcRadians), packRingTiles off, choosing. */
function packFor(state: GameState, c: FloorColonist, tick: number, cfg: FloorConfig): FloorEncounter {
  const W = cfg.wolves;
  const rng = momentRng(state, tick, 'pack', c.id);
  const n = Math.max(1, Math.round(W.packSize));
  const from = rng.next() * TURN;
  const wolves = Array.from({ length: n }, (_, i): FloorWolf => {
    const angle = from + (n === 1 ? 0 : (i / (n - 1) - HALF) * W.packArcRadians);
    return { ...ring(state, c, angle, W.packRingTiles), angle, state: 'prowl', sinceTick: tick, untilTick: tick, from: null, target: null };
  });
  return { stage: 'choose', sinceTick: tick, centre: { x: c.x, y: c.y }, wolves, strikes: 0, bites: 0, nextLungeTick: tick, recoverUntilTick: tick };
}

/** A pack comes for this seat's colonist now, wherever it stands on the map: the roll's outcome, for tests and forcing. */
export function meetWolves(floor: DevFloor, state: GameState, seat: string, cfg: FloorConfig): DevFloor {
  const beats = [...floor.moments.beats];
  const colonists = floor.colonists.map((c) => {
    if (c.id !== seat) return c;
    beats.push({ kind: 'wolves', who: seat, text: `Wolves! ${nameOf(state, seat)}: run or fight?` });
    return { ...c, encounter: packFor(state, c, floor.tick, cfg), moving: false };
  });
  return { ...floor, colonists, moments: { ...floor.moments, beats } };
}

/** After a colonist's move on wolf land: the tick's seeded roll for a pack, past its cooldown, out of the store. */
export function rollWolves(state: GameState, c: FloorColonist, tick: number, cfg: FloorConfig, out: MomentsOut): FloorColonist {
  const W = cfg.wolves;
  if (!W.on || c.space !== 'map' || c.encounter || isAssaying(c, tick) || isStunned(c, tick) || tick < (c.wolvesAfterTick ?? 0)) return c;
  const land = tileAt(state.tiles, state.width, Math.floor(c.x), Math.floor(c.y))?.terrain;
  if (!land || !isWolfLand(land, cfg)) return c;
  if (momentRng(state, tick, 'wolves', c.id).next() >= W.chancePerSecond * secondsPerTick(cfg)) return c;
  out.beats.push({ kind: 'wolves', who: c.id, text: `Wolves! ${nameOf(state, c.id)}: run or fight?` });
  return { ...c, encounter: packFor(state, c, tick, cfg), moving: false };
}

/** The wolf a strike lands on now: the nearest within strikeTiles, one standing open first; -1 for none. */
export function strikeTarget(c: Pick<FloorColonist, 'x' | 'y' | 'encounter'>, cfg: FloorConfig): number {
  const e = c.encounter;
  if (!e || e.stage !== 'fight') return -1;
  let best = -1;
  let score = Infinity;
  e.wolves.forEach((w, i) => {
    if (w.state === 'hurt' || w.state === 'lunge') return;
    const d = dist(c, w);
    if (d > cfg.wolves.strikeTiles) return;
    const s = d - (w.state === 'open' ? 1 : 0);
    if (s < score) {
      score = s;
      best = i;
    }
  });
  return best;
}

/** How a colonist walks a tick: stepFloor's own step, handed in so a fight moves it by the same rules. */
export type Walk = (c: FloorColonist, input: FloorInput) => FloorColonist;

/** The pack gone: what it ended with, the cooldown started, and the line everyone sees. */
function end(state: GameState, c: FloorColonist, tick: number, cfg: FloorConfig, out: MomentsOut, line: string, patch: Partial<FloorColonist> = {}): FloorColonist {
  out.beats.push({ kind: 'wolves', who: c.id, text: `${nameOf(state, c.id)} ${line}` });
  return { ...c, ...patch, encounter: null, wolvesAfterTick: tick + ticksOf(cfg.wolves.cooldownSeconds, cfg) };
}

function fight(state: GameState, c: FloorColonist, e: FloorEncounter, tick: number, cfg: FloorConfig, out: MomentsOut): FloorColonist {
  out.beats.push({ kind: 'wolves', who: c.id, text: `${nameOf(state, c.id)} fights the wolves!` });
  return {
    ...c,
    moving: false,
    encounter: { ...e, stage: 'fight', sinceTick: tick, centre: { x: c.x, y: c.y }, nextLungeTick: tick + ticksOf(cfg.wolves.firstLungeSeconds, cfg), recoverUntilTick: tick },
  };
}

/** One tick of a colonist meeting wolves: the choice, the chase or the fight. `walk` moves it as stepFloor does. */
export function stepEncounter(state: GameState, c0: FloorColonist, input: FloorInput, tick: number, cfg: FloorConfig, walk: Walk, out: MomentsOut): FloorColonist {
  const W = cfg.wolves;
  let e = c0.encounter!;
  let c = c0;
  if (e.stage === 'choose') {
    if (input.act) return fight(state, c, e, tick, cfg, out);
    if (Math.hypot(input.x, input.y) === 0) {
      if (tick - e.sinceTick >= ticksOf(W.chooseSeconds, cfg)) return fight(state, c, e, tick, cfg, out);
      // They close in while you make up your mind.
      const k = Math.min(1, (tick - e.sinceTick) / ticksOf(W.chooseSeconds, cfg));
      const r = W.packRingTiles - (W.packRingTiles - W.fightRingTiles) * k;
      return { ...c, moving: false, encounter: { ...e, wolves: e.wolves.map((w) => ({ ...w, ...ring(state, c, w.angle, r) })) } };
    }
    out.beats.push({ kind: 'wolves', who: c.id, text: `${nameOf(state, c.id)} runs!` });
    e = { ...e, stage: 'chase', sinceTick: tick, centre: { x: c.x, y: c.y } };
    c = { ...c, encounter: e };
  }
  if (e.stage === 'chase') {
    const moved = walk(c, input);
    if (moved.space !== 'map') return end(state, moved, tick, cfg, out, 'reached the store: the wolves gave up');
    const step = tick - e.sinceTick < ticksOf(W.headStartSeconds, cfg) ? 0 : chaseSpeed(cfg) * secondsPerTick(cfg);
    const wolves = e.wolves.map((w) => {
      const d = toward(w, moved);
      return d ? { ...w, x: w.x + d.x * Math.min(step, dist(w, moved)), y: w.y + d.y * Math.min(step, dist(w, moved)) } : w;
    });
    const now = { ...moved, encounter: { ...e, wolves } };
    if (wolves.some((w) => dist(w, now) < W.chaseCatchTiles)) return end(state, now, tick, cfg, out, 'was bitten: slowed till the store or a plot of their own', { bitten: true });
    if (tick - e.sinceTick >= ticksOf(W.giveUpSeconds, cfg) || dist(now, e.centre) > W.giveUpTiles) return end(state, now, tick, cfg, out, 'got away from the wolves');
    return now;
  }
  return stepFight(state, c, e, input, tick, cfg, walk, out);
}

/**
 * Within arenaTiles of the fight's middle: a step that would leave it ends on its edge, walked there by the walk itself
 * (a stick pushed short of full), so it ends only where a walk may: never on closed land, nor in the band a body's
 * width round the store's walls (FM-arena-wall). Where the walk, sliding along a wall, would leave the arena, it stands.
 */
function inArena(state: GameState, from: FloorColonist, to: FloorColonist, centre: FloorPoint, cfg: FloorConfig, walk: Walk): FloorColonist {
  const R = cfg.wolves.arenaTiles;
  const d = dist(to, centre);
  if (d <= R) return to;
  const edge = { x: centre.x + ((to.x - centre.x) / d) * R, y: centre.y + ((to.y - centre.y) / d) * R };
  // The edge is nearer `from` than `to` was, so the push is a full one's share, at most: the walk scales nothing.
  const step = (speedOf(from, state, cfg) * cfg.steer.tickMs) / MS_PER_SECOND;
  const walked = step > 0 ? walk(from, { x: (edge.x - from.x) / step, y: (edge.y - from.y) / step, act: false }) : from;
  const kept = walked.space === 'map' && dist(walked, centre) <= R + ROUNDING;
  // The push is the edge's, not the stick's: the colonist still faces the way the stick points.
  return kept ? { ...walked, facing: to.facing } : { ...from, moving: false };
}

function stepFight(state: GameState, c0: FloorColonist, e: FloorEncounter, input: FloorInput, tick: number, cfg: FloorConfig, walk: Walk, out: MomentsOut): FloorColonist {
  const W = cfg.wolves;
  const walked = walk(c0, input);
  if (walked.space !== 'map') return end(state, walked, tick, cfg, out, 'reached the store: the wolves gave up');
  const c = inArena(state, c0, walked, e.centre, cfg, walk);
  const turn = W.prowlRadiansPerSecond * secondsPerTick(cfg);
  let { strikes, bites, nextLungeTick, recoverUntilTick } = e;
  let wolves = e.wolves.map((w, i): FloorWolf => {
    switch (w.state) {
      case 'prowl':
      case 'hurt': {
        // literal-ok: every other wolf circles the other way, so the pack does not move as one
        const angle = w.angle + (i % 2 ? -turn : turn);
        const next = { ...w, angle, ...ring(state, e.centre, angle, W.fightRingTiles) };
        return w.state === 'hurt' && tick >= w.untilTick ? { ...next, state: 'prowl', sinceTick: tick } : next;
      }
      case 'tell':
        return tick >= w.untilTick ? { ...w, state: 'lunge', sinceTick: tick, untilTick: tick + Math.max(1, ticksOf(W.lungeSeconds, cfg)), from: { x: w.x, y: w.y } } : w;
      case 'lunge': {
        const k = Math.min(1, (tick - w.sinceTick) / (w.untilTick - w.sinceTick));
        const at = { x: w.from!.x + (w.target!.x - w.from!.x) * k, y: w.from!.y + (w.target!.y - w.from!.y) * k };
        if (tick < w.untilTick) return { ...w, ...at };
        // The lunge is over, bitten or missed: it aims at nothing now (AM-28: the TV draws the aim only while it is one).
        if (dist(c, w.target!) < W.biteTiles) {
          bites++;
          return { ...w, ...at, state: 'hurt', sinceTick: tick, untilTick: tick + ticksOf(W.hurtSeconds, cfg), target: null };
        }
        return { ...w, ...at, state: 'open', sinceTick: tick, untilTick: tick + ticksOf(W.openSeconds, cfg), target: null };
      }
      case 'open':
        // It overshot and stands exposed; then back to circling, from where it stands.
        return tick >= w.untilTick ? { ...w, state: 'prowl', sinceTick: tick, angle: Math.atan2(w.y - e.centre.y, w.x - e.centre.x) } : w;
    }
  });
  if (tick >= nextLungeTick && !wolves.some((w) => w.state === 'tell' || w.state === 'lunge')) {
    const ready = wolves.flatMap((w, i) => (w.state === 'prowl' ? [i] : []));
    if (ready.length > 0) {
      const pick = ready[Math.floor(momentRng(state, tick, 'lunge', c.id).next() * ready.length)]!;
      wolves = wolves.map((w, i) => (i === pick ? { ...w, state: 'tell', sinceTick: tick, untilTick: tick + ticksOf(W.warnSeconds, cfg), target: { x: c.x, y: c.y } } : w));
      nextLungeTick = tick + ticksOf(W.lungeEverySeconds, cfg);
    }
  }
  let now: FloorColonist = { ...c, encounter: { ...e, wolves, strikes, bites, nextLungeTick, recoverUntilTick } };
  if (input.act && tick >= recoverUntilTick) {
    const i = strikeTarget(now, cfg);
    if (i >= 0) {
      strikes++;
      // Struck, crouching or not, it aims at nothing (AM-28: a target only while it crouches and lunges).
      wolves = wolves.map((w, j) => (j === i ? { ...w, state: 'hurt', sinceTick: tick, untilTick: tick + ticksOf(W.hurtSeconds, cfg), target: null } : w));
    } else recoverUntilTick = tick + ticksOf(W.whiffSeconds, cfg);
    now = { ...now, encounter: { ...now.encounter!, wolves, strikes, recoverUntilTick } };
  }
  if (strikes >= W.strikesToWin) return end(state, now, tick, cfg, out, `beat the wolves: ${W.pelts} pelts`, { pelts: now.pelts + W.pelts });
  if (bites >= W.bitesToLose) return lose(state, now, tick, cfg, out);
  if (tick - e.sinceTick >= ticksOf(W.fightSeconds, cfg)) return end(state, now, tick, cfg, out, 'held them off: the wolves slunk away');
  return now;
}

/** A lost fight: the MULE on the lead bolts (paid by settleMoments through boltMule), or with none led, a stun. */
function lose(state: GameState, c: FloorColonist, tick: number, cfg: FloorConfig, out: MomentsOut): FloorColonist {
  const p = state.players.find((x) => x.id === c.id)!;
  // A MULE already bolted is not led: it cannot bolt twice, so its colonist is stunned like one with none.
  if (c.lead && p.carriedMule && !p.muleBolted) {
    const heading = momentRng(state, tick, 'bolt', c.id).next() * TURN;
    out.due.push({ kind: 'bolt', who: c.id });
    return end(state, c, tick, cfg, out, 'lost the fight: the MULE bolted!', { bolt: { dx: Math.cos(heading), dy: Math.sin(heading), left: cfg.wolves.boltTiles } });
  }
  return end(state, c, tick, cfg, out, 'lost the fight: stunned', { stunnedUntilTick: tick + ticksOf(cfg.wolves.stunSeconds, cfg) });
}

/** A bolting MULE runs straight, turning off land it cannot cross, till its run is spent; then it stands. */
export function stepBolt(state: GameState, c: FloorColonist, tick: number, cfg: FloorConfig): FloorColonist {
  const b = c.bolt;
  if (!b || b.left <= 0 || !c.lead) return c;
  const s = Math.min(b.left, cfg.wolves.boltSpeed * secondsPerTick(cfg));
  const next = { x: c.lead.x + b.dx * s, y: c.lead.y + b.dy * s };
  const tile = tileAt(state.tiles, state.width, Math.floor(next.x), Math.floor(next.y));
  if (!tile || terrainShare(tile.terrain, cfg) <= 0) {
    const heading = momentRng(state, tick, 'bolt', c.id).next() * TURN;
    return { ...c, bolt: { ...b, dx: Math.cos(heading), dy: Math.sin(heading) } };
  }
  return { ...c, lead: { ...c.lead, ...next }, bolt: { ...b, left: b.left - s } };
}

/**
 * How an AI colonist plays a pack: its level's dodge and strike delay, and whether it fights or runs; running, it heads
 * for `refuge` (the store's door: the hall ends a chase) unless the pack stands that way, else straight away from it.
 */
export interface WolfPlay {
  level: WolfFightLevel;
  fights: boolean;
  refuge?: FloorPoint;
  /**
   * In a hurry: it sets off at once and heads for the refuge even with the pack that way, round it: the heading to the
   * refuge less its part towards the pack, so it neither runs off nor into the wolves.
   */
  through?: boolean;
}

/** Whether a colonist of this level dodges the lunge a wolf crouched for at `sinceTick`: one seeded roll a lunge. */
function dodges(state: GameState, seat: string, w: FloorWolf, play: WolfPlay, cfg: FloorConfig): boolean {
  return momentRng(state, w.sinceTick, 'dodge', seat).next() < cfg.wolves.levels[play.level].dodge;
}

/**
 * An AI colonist's input for the tick it meets wolves (RULE-4's AI line): after botChooseSeconds it fights or runs
 * away from the pack; in a fight it dodges a crouched wolf's lunge by its level's chance, and strikes at a wolf
 * standing open once its level's delay has passed. Idle when it meets none. An input, like a phone's: stepFloor moves it.
 */
export function wolfInput(floor: DevFloor, state: GameState, seat: string, cfg: FloorConfig, play: WolfPlay): FloorInput {
  const c = floor.colonists.find((x) => x.id === seat);
  const e = c?.encounter;
  if (!c || !e) return IDLE_INPUT;
  const tick = floor.tick;
  const middle = { x: e.wolves.reduce((n, w) => n + w.x, 0) / e.wolves.length, y: e.wolves.reduce((n, w) => n + w.y, 0) / e.wolves.length };
  const flee = toward(middle, c) ?? { x: 1, y: 0 };
  const refuge = play.refuge && toward(c, play.refuge);
  // To the refuge if the pack is not that way (it lies behind or beside the line there), else away from the pack.
  const towards = refuge ? -(refuge.x * flee.x + refuge.y * flee.y) : 0;
  const round = refuge && play.through && towards > 0 ? unit({ x: refuge.x + towards * flee.x, y: refuge.y + towards * flee.y }) ?? { x: -flee.y, y: flee.x } : null;
  const away = round ?? (refuge && (play.through || towards <= 0) ? refuge : flee);
  if (e.stage === 'choose') {
    // In a hurry it does not stop to think.
    if (!play.through && tick - e.sinceTick < ticksOf(cfg.wolves.botChooseSeconds, cfg)) return IDLE_INPUT;
    return play.fights ? { x: 0, y: 0, act: true } : { ...away, act: false };
  }
  if (e.stage === 'chase') return { ...away, act: false };
  const tell = e.wolves.find((w) => w.state === 'tell' && w.target && dodges(state, seat, w, play, cfg));
  if (tell && dist(c, tell.target!) < cfg.wolves.biteTiles + cfg.wolves.botDodgeMarginTiles) {
    // Off the spot it aims at; standing on it, sideways to the wolf's line.
    const off = toward(tell.target!, c) ?? toward({ x: 0, y: 0 }, { x: -(tell.target!.y - tell.y), y: tell.target!.x - tell.x }) ?? { x: 1, y: 0 };
    return { ...off, act: false };
  }
  const i = strikeTarget(c, cfg);
  const w = i >= 0 ? e.wolves[i]! : null;
  const ready = w?.state === 'open' && tick - w.sinceTick >= ticksOf(cfg.wolves.levels[play.level].strikeDelaySeconds, cfg);
  return ready && tick >= e.recoverUntilTick ? { x: 0, y: 0, act: true } : IDLE_INPUT;
}
