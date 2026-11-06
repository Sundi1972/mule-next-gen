import { describe, expect, it } from 'vitest';
import { colonyScore, DEV_STEER, score, SPECIES_PERK, type GameState } from '@mule/engine';
import { ROTATION, simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';
import { applySets, colonyScoreLines, foodBandLine, colonyScoreRecorder, newPlanTally, planLines, playsArg, tallyGame, winnerOf } from '../src/sim.js';

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

describe("the sim reports the colony score (C29's baseline, RULE-25)", () => {
  it("T-AC-22, C29: the colony score lines read the engine's colony score at each month's end; politics off prints none", { timeout: 60_000 }, () => {
    const paths: number[][] = [];
    const truth: number[][] = [];
    for (const seed of [1, 2, 3]) {
      const recorder = colonyScoreRecorder();
      // Ground truth from the engine: a copy of the state as each upkeep ends, scored after the game.
      const monthEnds: GameState[] = [];
      const onPhase = (s: GameState) => {
        recorder.onPhase(s);
        if (s.phase === 'upkeep') monthEnds.push(structuredClone(s));
      };
      const { state } = playGame(seed, simSeats(4, 'trader', seed), { politics: true, maxMonths: 2, onPhase });
      // The last month ends the game: its upkeep moves straight to game over, so the final state is its month end.
      truth.push([...monthEnds, state].map((s) => colonyScore(s)!.total));
      paths.push(recorder.end(state));
    }
    expect(paths).toEqual(truth);
    expect(truth.every((t) => t.length === 2)).toBe(true);
    // Three games: the median is the middle one, the 90th percentile the top one.
    const sorted = (month: number) => truth.map((t) => t[month]!).sort((a, b) => a - b);
    const [end, first] = [sorted(1), sorted(0)];
    expect(end[1]).toBeLessThan(end[2]!);
    expect(colonyScoreLines(paths)).toEqual([
      `     Colony score at game end: median ${end[1]}, 90th percentile ${end[2]} over 3 games (no check)`,
      `     Colony score by month (median across games), months 1-2: ${first[1]} / ${end[1]} (no check)`,
    ]);

    // HC-22: politics off, no colony, so no score and no line.
    const recorder = colonyScoreRecorder();
    const off = playGame(1, simSeats(4, 'trader', 1), { politics: false, maxMonths: 1, onPhase: recorder.onPhase });
    expect(recorder.end(off.state)).toEqual([]);
    expect(colonyScoreLines([recorder.end(off.state)])).toEqual([]);
  });
});

describe('the sim reports the surplus when cheap (C6, UBER-AC-2)', () => {
  const ROW = "     Resource utility (UBER-AC-2): Food held after its auction ÷ next month's need, the median seat by the ask against Food's reference:";
  const TAIL = ' (target over 1.0 at ask ≤ ref, at most 1.0 at ask ≥ 2× ref); colonists short of Food or Water in 40% of months';
  /** A seat at a Food auction with Food's reference at 30. */
  const at = (ask: number, held: number, need = 10) => ({ ask, reference: 30, held, need });

  it("UBER-AC-2 row: median Food held ÷ need by ask band", () => {
    const samples = [
      // ask ≤ ref, the reference itself included: 0.5, 1.5, 2.0.
      at(10, 5), at(30, 15), at(20, 20),
      // ref < ask < 2× ref, from just above the reference to just below twice it: 1.0, 0.8, 1.2.
      at(31, 10), at(59, 8), at(45, 12),
      // ask ≥ 2× ref, twice the reference itself included: 0.4.
      at(60, 4),
    ];

    expect(foodBandLine(samples, '40%')).toBe(`${ROW} ask ≤ ref 1.50 (n 3), ref < ask < 2× ref 1.00 (n 3), ask ≥ 2× ref 0.40 (n 1)${TAIL}`);
  });

  it('UBER-AC-2 row negative: a band with no auctions prints n 0 and no median, never NaN; a seat needing no Food has no ratio', () => {
    const row = foodBandLine([at(20, 15), at(70, 3, 0)], '40%');

    expect(row).toBe(`${ROW} ask ≤ ref 1.50 (n 1), ref < ask < 2× ref no median (n 0), ask ≥ 2× ref no median (n 0)${TAIL}`);
    expect(row).not.toMatch(/NaN|Infinity/);
  });
});
