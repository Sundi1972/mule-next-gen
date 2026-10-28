import { describe, expect, it } from 'vitest';
import { SPECIES_PERK } from '@mule/engine';
import { applySets } from '../src/sim.js';

describe('a sweep sets config without editing it', () => {
  it('T-AC-26: sim --set sets a config number, names it in the header, and refuses an unknown path', () => {
    const saved = SPECIES_PERK.zipwingSpeed;
    try {
      expect(applySets(['SPECIES_PERK.zipwingSpeed=2'])).toEqual(['SPECIES_PERK.zipwingSpeed=2']);
      expect(SPECIES_PERK.zipwingSpeed).toBe(2);
    } finally {
      SPECIES_PERK.zipwingSpeed = saved;
    }
    // Refused, naming the path: a key that isn't there, a whole block, a value that isn't a number, a table.
    for (const bad of ['SPECIES_PERK.nope=1', 'SPECIES_PERK=1', 'SPECIES_PERK.zipwingSpeed=fast', 'GOOD_CONFIG.food=3']) {
      expect(() => applySets([bad]), bad).toThrow(bad.split('=')[0]);
    }
    expect(SPECIES_PERK.zipwingSpeed).toBe(saved);
  });
});
