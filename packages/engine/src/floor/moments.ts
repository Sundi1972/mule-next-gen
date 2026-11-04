/**
 * Paying the moments (arcade C4): what a step decided that changes the game. stepFloor stays pure, so it leaves the
 * glint's winner and a lost fight's bolted MULE on the floor as due; the tick's runner (the server, the sim) calls
 * settleMoments straight after stepFloor and before the presses (RULE-1 step 3), and it pays each through game.ts's
 * rules (awardGlint, boltMule). The floor never writes money or stock itself (spec R-2).
 */
import { boltMule, player } from '../game.js';
import type { GameState } from '../types.js';
import type { DevFloor, FloorBeat } from './floor.js';
import { payGlint } from './glint.js';

/** Pays what the last step left due and clears it; a seat at the pub, or past development, is paid nothing. */
export function settleMoments(state: GameState, floor: DevFloor): DevFloor {
  const { due } = floor.moments;
  if (due.length === 0) return floor;
  const beats: FloorBeat[] = [...floor.moments.beats];
  for (const d of due) {
    const p = player(state, d.who);
    if (state.phase !== 'development' || p.doneDeveloping) continue;
    if (d.kind === 'glint') beats.push(payGlint(state, d.who));
    else if (p.carriedMule && !p.muleBolted) boltMule(state, d.who);
  }
  return { ...floor, moments: { ...floor.moments, beats, due: [] } };
}
