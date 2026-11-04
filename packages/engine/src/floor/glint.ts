/**
 * The glint race (arcade RULE-5): now and then, a seeded roll each tick, a Crystite sparkle lights one tile for
 * GLINT.showSeconds on every screen at once. The first colonist onto it wins the prize (game.ts awardGlint, paid by
 * settleMoments), racing or not: the floor knows no racers, the AI decides for itself whether to race. GRAB THE GLINT
 * (RULE-3 row 3) wins it from a step away. Nobody there in time: it fades. Pure, and stepped by stepFloor.
 */
import { awardGlint } from '../game.js';
import type { GameState, Tile } from '../types.js';
import { MS_PER_SECOND } from '../units.js';
import { momentRng, nameOf } from './chance.js';
import { ticksOf, type DevFloor, type FloorBeat, type FloorColonist, type FloorConfig, type FloorGlint, type FloorMoments, type FloorPoint, type MomentsOut } from './floor.js';
import { terrainShare } from './speed.js';

const HALF = 0.5; // literal-ok: geometry, the middle of a tile

/** The middle of the glint's tile, where GRAB THE GLINT measures from. */
export const glintMiddle = (g: Pick<FloorGlint, 'x' | 'y'>): FloorPoint => ({ x: g.x + HALF, y: g.y + HALF });

/** The words for a tile everyone can find: column·row, from 1. */
export const tileWords = (g: Pick<FloorGlint, 'x' | 'y'>) => `${g.x + 1}·${g.y + 1}`;

const onTile = (c: FloorColonist, g: Pick<FloorGlint, 'x' | 'y'>) => c.space === 'map' && Math.floor(c.x) === g.x && Math.floor(c.y) === g.y;

/** Tiles a glint may light: land a colonist can stand on, never a lake or the store, owned only if GLINT.onOwnedPlots, and under nobody's feet. */
function glintTiles(state: GameState, colonists: readonly FloorColonist[], cfg: FloorConfig): Tile[] {
  return state.tiles.filter(
    (t) =>
      t.terrain !== 'store' &&
      t.terrain !== 'lake' &&
      terrainShare(t.terrain, cfg) > 0 &&
      (cfg.glint.onOwnedPlots || !t.owner) &&
      !colonists.some((c) => onTile(c, t)),
  );
}

type GlintState = Pick<FloorMoments, 'glint' | 'glintAfterTick'>;

/**
 * After every colonist has moved: the first onto the lit tile, in the tick's press order, wins it (due for
 * settleMoments to pay); past its time it fades; with none lit and the pause over, the roll for the next.
 */
export function stepGlint(state: GameState, colonists: readonly FloorColonist[], order: readonly string[], tick: number, was: GlintState, cfg: FloorConfig, out: MomentsOut): GlintState {
  const g = was.glint;
  const pause = tick + ticksOf(cfg.glint.pauseSeconds, cfg);
  if (g) {
    const done = (id: string) => state.players.find((p) => p.id === id)?.doneDeveloping === true;
    const winner = order.find((id) => !done(id) && onTile(colonists.find((c) => c.id === id)!, g));
    if (winner) {
      out.due.push({ kind: 'glint', who: winner });
      return { glint: null, glintAfterTick: pause };
    }
    if (tick < g.untilTick) return was;
    out.beats.push({ kind: 'glint', who: null, text: 'The glint faded' });
    return { glint: null, glintAfterTick: pause };
  }
  if (!cfg.glint.on || tick <= was.glintAfterTick) return was;
  const rng = momentRng(state, tick, 'glint');
  if (rng.next() >= cfg.steer.tickMs / (Math.max(1, cfg.glint.meanGapSeconds) * MS_PER_SECOND)) return was;
  const tiles = glintTiles(state, colonists, cfg);
  if (tiles.length === 0) return was;
  const t = tiles[Math.floor(rng.next() * tiles.length)]!;
  out.beats.push({ kind: 'glint', who: null, text: `A Crystite glint at ${tileWords(t)}! First there wins` });
  return { glint: { x: t.x, y: t.y, sinceTick: tick, untilTick: tick + ticksOf(cfg.glint.showSeconds, cfg) }, glintAfterTick: was.glintAfterTick };
}

/** The glint's prize to a seat through game.ts's awardGlint, and the line everyone sees. */
export function payGlint(state: GameState, who: string): FloorBeat {
  const won = awardGlint(state, who);
  const prize = won.prize === 'crystite' ? `+${won.amount} Crystite` : `+${won.amount} cr`;
  return { kind: 'glint', who, text: `${nameOf(state, who)} got the glint: ${prize}` };
}

/** GRAB THE GLINT: the prize to the seat, and the glint gone, with the pause before the next. */
export function grabGlint(state: GameState, floor: DevFloor, who: string, cfg: FloorConfig): DevFloor {
  const beat = payGlint(state, who);
  const m = floor.moments;
  return { ...floor, moments: { ...m, glint: null, glintAfterTick: floor.tick + ticksOf(cfg.glint.pauseSeconds, cfg), beats: [...m.beats, beat] } };
}

/** Whether a colonist stands within GLINT.grabReach of the lit glint. */
export function inGrabReach(floor: DevFloor, c: FloorColonist, cfg: FloorConfig): FloorGlint | null {
  const g = floor.moments.glint;
  if (!g || c.space !== 'map') return null;
  const m = glintMiddle(g);
  return Math.hypot(c.x - m.x, c.y - m.y) <= cfg.glint.grabReach ? g : null;
}

