/**
 * The corral scramble (arcade RULE-6): when a sale leaves the corral with SCRAMBLE.mulesLeft or fewer and a seat still
 * needs a MULE, every screen is told "2 MULEs left! Race to the corral". Buying is the corral's normal BUY MULE, first
 * there first served (the tick's press order breaks a tie). Each sale is told; the last in one line, "X got the last
 * one: the corral is empty", then who is left without. It ends on its clock, or once every needer has a MULE. One a
 * turn. Pure: applyReach calls afterSale after buyMule, and stepFloor steps its clock.
 */
import { mulePriceFor, player } from '../game.js';
import type { GameState } from '../types.js';
import { nameOf } from './chance.js';
import { ticksOf, type DevFloor, type FloorBeat, type FloorConfig, type FloorScramble, type MomentsOut } from './floor.js';

/** A seat still needs a MULE: not at the pub, none on its lead (or bolted), a free plot of its own, and the money. */
export function needsMule(state: GameState, id: string): boolean {
  const p = player(state, id);
  return !p.doneDeveloping && !p.carriedMule && state.tiles.some((t) => t.owner === id && !t.outfit) && p.money >= mulePriceFor(state, id);
}

const mules = (n: number) => `${n} MULE${n === 1 ? '' : 's'}`;
const beat = (who: string | null, text: string): FloorBeat => ({ kind: 'scramble', who, text });

/** The needers who went without, as the scramble ends: no MULE from it, and none led otherwise (AM-28). */
const wentWithout = (state: GameState, s: FloorScramble, got: readonly string[]): string[] =>
  s.needers.filter((id) => !got.includes(id) && !player(state, id).carriedMule);

/** After a sale at the corral: the scramble on counts it down (or ends, empty); none yet, the sale may call one. */
export function afterSale(state: GameState, floor: DevFloor, buyer: string, cfg: FloorConfig): DevFloor {
  const m = floor.moments;
  const left = state.store.mules;
  const s = m.scramble;
  const beats = [...m.beats];
  let scramble = s;
  let scrambled = m.scrambled;
  if (s && !s.over) {
    const got = [...s.got, buyer];
    if (left <= 0) {
      // The last sale and the empty corral are one line, so a burst of beats at the end never hides who got it.
      const leftOut = wentWithout(state, s, got);
      beats.push(beat(buyer, `${nameOf(state, buyer)} got the last one: the corral is empty`));
      if (leftOut.length > 0) beats.push(beat(null, `No MULE this turn for ${leftOut.map((id) => nameOf(state, id)).join(', ')}`));
      scramble = { ...s, got, over: 'empty', leftOut };
    } else {
      beats.push(beat(buyer, `${nameOf(state, buyer)} got one: ${left} left`));
      scramble = { ...s, got };
    }
  } else if (cfg.scramble.on && !m.scrambled && left > 0 && left <= cfg.scramble.mulesLeft) {
    const needers = state.players.filter((p) => needsMule(state, p.id)).map((p) => p.id);
    // Nobody left needing one: no race to call.
    if (needers.length > 0) {
      beats.push(beat(null, `${mules(left)} left! Race to the corral`));
      scramble = { sinceTick: floor.tick, untilTick: floor.tick + ticksOf(cfg.scramble.maxSeconds, cfg), needers, got: [], over: null, leftOut: [] };
      scrambled = true;
    }
  }
  if (scramble === s) return floor;
  return { ...floor, moments: { ...m, scramble, scrambled, beats } };
}

/** Each tick: a scramble on ends on its clock, told, or once every needer has a MULE or is at the pub. */
export function stepScramble(state: GameState, s: FloorScramble | null, tick: number, out: MomentsOut): FloorScramble | null {
  if (!s || s.over) return s;
  if (tick >= s.untilTick) {
    out.beats.push(beat(null, `The scramble is over: ${mules(state.store.mules)} left`));
    return { ...s, over: 'time', leftOut: wentWithout(state, s, s.got) };
  }
  const waiting = s.needers.filter((id) => {
    const p = player(state, id);
    return !p.carriedMule && !p.doneDeveloping;
  });
  return waiting.length === 0 ? { ...s, over: 'everyone', leftOut: wentWithout(state, s, s.got) } : s;
}
