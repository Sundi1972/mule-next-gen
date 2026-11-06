import { describe, expect, it } from 'vitest';
import { COLONY, DEFAULT_SPECIES, DEV_STEER, type GameState } from '@mule/engine';
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
 * The report's deal was played with the Federation's grant at 150 a month. At 450 (Heiko, 6 Nov) the fund's money
 * shifts the game and ai2 no longer buys two MULEs in month 7 (no MULE is lost either), so the case holds the grant
 * at the report's 150 to keep replaying the reported turn.
 */
/** The Federation's grant a month when WS3's report was dealt. */
const REPORT_GRANT = 150;
function sixSpeciesDeal(seed: number) {
  return (_seats: unknown, state: GameState) => {
    state.players.forEach((p, i) => (p.species = DEFAULT_SPECIES[(i + seed) % DEFAULT_SPECIES.length]!));
  };
}

describe('FM-pub-lead: a MULE bought is installed, not walked into the pub on its lead', () => {
  it('FM-pub-lead: seed 8 dealt over six species (ai2 a hungry Glimmer in month 7): no AI colonist presses PUB leading a MULE it bought, but where a pack met it leading that MULE', { timeout: 60_000 }, () => {
    const seed = 8;
    const saved = DEV_STEER.on;
    const savedGrant = COLONY.grant.perMonth;
    DEV_STEER.on = true;
    COLONY.grant.perMonth = REPORT_GRANT;
    try {
      // The sim's own table: its seats, politics on, on the arcade floor.
      const { state, turns } = playGame(seed, simSeats(4, 'trader', seed, null), { politics: true, onSeats: sixSpeciesDeal(seed) });
      // The case is the report's: ai2 is the Glimmer and bought its two MULEs in month 7.
      expect(state.players[2]!.species).toBe('glimmer');
      const reported = turns.find((t) => t.month === 7 && t.id === 'ai2')!;
      expect(reported.bought, 'month 7, ai2: MULEs bought').toBe(2);
      // The promise: a MULE bought ends the turn installed, at the pub or when the clock runs out. A pack met while
      // leading it is the one excuse (FM-hurry-margin).
      const ended = (t: (typeof turns)[number]) => (t.pubAt === null ? 'the clock ran out' : `PUB at ${t.pubAt} s`);
      const lost = turns.flatMap((t) =>
        t.lostMules.filter((m) => !m.packLeading).map(() => `month ${t.month}, ${t.id}: bought ${t.bought}, installed ${t.installs}, ${ended(t)}`),
      );
      expect(lost, 'MULEs bought and left on the lead with no pack met').toEqual([]);
    } finally {
      DEV_STEER.on = saved;
      COLONY.grant.perMonth = savedGrant;
    }
  });
});
