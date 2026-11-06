import { describe, expect, it } from 'vitest';
import { DEFAULT_SPECIES, DEV_STEER, type GameState } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';

/**
 * WS3's report (via the PM), from an earlier deal of #488 over all six species: seed 8, month 7, ai2, a hungry Glimmer,
 * bought 2 MULEs, installed 1 and pressed PUB at 56.15 s with the second still on its lead, no pack met, no step
 * refused. The MULE was paid for and lost.
 *
 * The deal that showed it: a seat with no pick plays DEFAULT_SPECIES[(chair + seed) % 6]. The shipped deal plays a
 * 4-seat game's first four species only, so the case deals them itself, before the first phase, changing no config.
 *
 * The colony's numbers move the game (pace set C, Heiko 6 Nov, moved the reported turn from month 7 to months 10-12),
 * so the case asks for the report's shape, not its month: ai2, the Glimmer, buys two MULEs in a turn.
 */
function sixSpeciesDeal(seed: number) {
  return (_seats: unknown, state: GameState) => {
    state.players.forEach((p, i) => (p.species = DEFAULT_SPECIES[(i + seed) % DEFAULT_SPECIES.length]!));
  };
}

describe('FM-pub-lead: a MULE bought is installed, not walked into the pub on its lead', () => {
  it('FM-pub-lead: seed 8 dealt over six species (ai2 a hungry Glimmer buying two MULEs in a turn): no AI colonist presses PUB leading a MULE it bought, but where a pack met it leading that MULE', { timeout: 60_000 }, () => {
    const seed = 8;
    const saved = DEV_STEER.on;
    DEV_STEER.on = true;
    try {
      // The sim's own table: its seats, politics on, on the arcade floor.
      const { state, turns } = playGame(seed, simSeats(4, 'trader', seed, null), { politics: true, onSeats: sixSpeciesDeal(seed) });
      // The case is the report's: ai2 is the Glimmer and buys two MULEs in a turn.
      expect(state.players[2]!.species).toBe('glimmer');
      expect(turns.filter((t) => t.id === 'ai2' && t.bought >= 2).map((t) => t.month), 'ai2: months it bought two MULEs').not.toEqual([]);
      // The promise: a MULE bought ends the turn installed, at the pub or when the clock runs out. A pack met while
      // leading it is the one excuse (FM-hurry-margin).
      const ended = (t: (typeof turns)[number]) => (t.pubAt === null ? 'the clock ran out' : `PUB at ${t.pubAt} s`);
      const lost = turns.flatMap((t) =>
        t.lostMules.filter((m) => !m.packLeading).map(() => `month ${t.month}, ${t.id}: bought ${t.bought}, installed ${t.installs}, ${ended(t)}`),
      );
      expect(lost, 'MULEs bought and left on the lead with no pack met').toEqual([]);
    } finally {
      DEV_STEER.on = saved;
    }
  });
});
