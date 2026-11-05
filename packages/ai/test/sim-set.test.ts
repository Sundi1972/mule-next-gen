import { describe, expect, it } from 'vitest';
import { DEV_STEER, score, SPECIES_PERK } from '@mule/engine';
import { ROTATION, simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';
import { applySets, newPlanTally, planLines, playsArg, tallyGame, winnerOf } from '../src/sim.js';

describe('a sweep sets config without editing it', () => {
  it('T-AC-26: sim --set sets a config number or switch, names it in the header, and refuses an unknown path', () => {
    const saved = { zip: SPECIES_PERK.zipwingSpeed, on: DEV_STEER.on };
    try {
      expect(applySets(['SPECIES_PERK.zipwingSpeed=2'])).toEqual(['SPECIES_PERK.zipwingSpeed=2']);
      expect(SPECIES_PERK.zipwingSpeed).toBe(2);
      // A switch takes true or false (arcade PR-4: the sim plays the floor with DEV_STEER.on=true).
      expect(applySets(['DEV_STEER.on=true'])).toEqual(['DEV_STEER.on=true']);
      expect(DEV_STEER.on).toBe(true);
      applySets(['DEV_STEER.on=false']);
      expect(DEV_STEER.on).toBe(false);
    } finally {
      SPECIES_PERK.zipwingSpeed = saved.zip;
      DEV_STEER.on = saved.on;
    }
    // Refused, naming the path: a key that isn't there, a whole block, a value that isn't a number, a table; a switch
    // set to anything but true or false, or a number set to a switch's word.
    for (const bad of ['SPECIES_PERK.nope=1', 'SPECIES_PERK=1', 'SPECIES_PERK.zipwingSpeed=fast', 'GOOD_CONFIG.food=3', 'DEV_STEER.on=1', 'DEV_STEER.on=yes', 'DEV_STEER.on=', 'DEV_STEER.tickMs=true']) {
      expect(() => applySets([bad]), bad).toThrow(bad.split('=')[0]);
    }
    expect([SPECIES_PERK.zipwingSpeed, DEV_STEER.on]).toEqual([saved.zip, saved.on]);
  });
});

describe('the sim seats mixed tables (C14, RULE-15)', () => {
  it('T-AC-14: over 40 seeds each persona sits as a playbook seat 20 times', () => {
    const sits = Object.fromEntries(ROTATION.map((p) => [p, { playbook: 0, today: 0 }]));
    for (let seed = 1; seed <= 40; seed++) {
      const specs = simSeats(4, 'trader', seed, null, 'pair');
      // RULE-15: the persona rotates as today; even seats play their playbook, odd seats today's path.
      specs.forEach((s, i) => {
        expect(s.persona).toBe(ROTATION[(i + seed) % ROTATION.length]);
        expect(s.plays).toBe(i % 2 === 0 ? 'playbook' : 'today');
        sits[s.persona]![s.plays!]++;
      });
    }
    for (const p of ROTATION) expect(sits[p], p).toEqual({ playbook: 20, today: 20 });
    // One kind for the whole table; and none named without the flag, so every caller of simSeats builds the seats it built.
    expect(simSeats(4, 'trader', 3, null, 'playbook').map((s) => s.plays)).toEqual(['playbook', 'playbook', 'playbook', 'playbook']);
    expect(simSeats(4, 'trader', 3, null, 'today').map((s) => s.plays)).toEqual(['today', 'today', 'today', 'today']);
    expect(simSeats(4, 'trader', 3)).toEqual(ROTATION.map((_, i) => ({ level: 'trader', persona: ROTATION[(i + 3) % ROTATION.length] })));
    // --plays names one of the three, or nothing; anything else is refused, naming it.
    expect([playsArg(null), playsArg('pair'), playsArg('today'), playsArg('playbook')]).toEqual([null, 'pair', 'today', 'playbook']);
    expect(() => playsArg('mixed')).toThrow('mixed');
  });

  it("T-AC-14: the report counts the winners by seat kind, from each game's final engine score", { timeout: 60_000 }, () => {
    const tally = newPlanTally();
    const kinds: string[] = [];
    for (const seed of [1, 2]) {
      const specs = simSeats(4, 'trader', seed, null, 'pair');
      const played = playGame(seed, specs, { politics: false, maxMonths: 1 });
      // The winner: the best engine score, a tie to the lower seat.
      const scores = played.state.players.map((p) => score(played.state, p.id));
      const best = scores.indexOf(Math.max(...scores));
      expect(winnerOf(played.state)).toBe(best);
      kinds.push(specs[best]!.plays!);
      tallyGame(tally, specs, played, best);
    }
    const share = (k: string) => `${(kinds.filter((x) => x === k).length / kinds.length) * 100}%`;
    expect(planLines(tally, 'trader')).toContain(`     Wins by seat kind: playbook ${share('playbook')}, today ${share('today')} of 2 games (fair share 50% for playbook seats; no check)`);
  });
});
