import { describe, expect, it } from 'vitest';
import { DEV_STEER, SPECIES_PERK } from '@mule/engine';
import { applySets } from '../src/sim.js';

describe('a sweep sets config without editing it', () => {
  it('T-AC-26: sim --set sets a config number or switch, names it in the header, and refuses an unknown path', () => {
    const saved = { zip: SPECIES_PERK.zipwingSpeed, on: DEV_STEER.on, waits: DEV_STEER.month1WaitsForFirstMule };
    try {
      expect(applySets(['SPECIES_PERK.zipwingSpeed=2'])).toEqual(['SPECIES_PERK.zipwingSpeed=2']);
      expect(SPECIES_PERK.zipwingSpeed).toBe(2);
      // A switch takes true or false (arcade PR-4: the sim plays the floor with DEV_STEER.on=true).
      expect(applySets(['DEV_STEER.on=true', 'DEV_STEER.month1WaitsForFirstMule=false'])).toEqual(['DEV_STEER.on=true', 'DEV_STEER.month1WaitsForFirstMule=false']);
      expect([DEV_STEER.on, DEV_STEER.month1WaitsForFirstMule]).toEqual([true, false]);
      applySets(['DEV_STEER.on=false']);
      expect(DEV_STEER.on).toBe(false);
    } finally {
      SPECIES_PERK.zipwingSpeed = saved.zip;
      DEV_STEER.on = saved.on;
      DEV_STEER.month1WaitsForFirstMule = saved.waits;
    }
    // Refused, naming the path: a key that isn't there, a whole block, a value that isn't a number, a table; a switch
    // set to anything but true or false, or a number set to a switch's word.
    for (const bad of ['SPECIES_PERK.nope=1', 'SPECIES_PERK=1', 'SPECIES_PERK.zipwingSpeed=fast', 'GOOD_CONFIG.food=3', 'DEV_STEER.on=1', 'DEV_STEER.on=yes', 'DEV_STEER.on=', 'DEV_STEER.tickMs=true']) {
      expect(() => applySets([bad]), bad).toThrow(bad.split('=')[0]);
    }
    expect([SPECIES_PERK.zipwingSpeed, DEV_STEER.on]).toEqual([saved.zip, saved.on]);
  });
});
