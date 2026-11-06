import { SPECIES_PERK as PERK } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { SPECIES_PERK } from '../src/index';

/**
 * SPECIES-PERKS (WS4, PM ruling 5 Nov, rulebook #species-perks): the lobby's species cards say the game's own numbers,
 * read from the balance settings, so the words follow when the numbers are tuned.
 */
describe('SPECIES-PERKS (WS4): the lobby cards say the numbers the game plays', () => {
  it(`the Zipwing card says it walks ${PERK.zipwingSpeed}× as fast in development, not twice as fast`, () => {
    expect(SPECIES_PERK.zipwing).toContain(`${PERK.zipwingSpeed}×`);
    expect(SPECIES_PERK.zipwing).not.toMatch(/twice/i);
  });

  it(`the Gearling card says it pays ${Math.round(PERK.gearlingPrice * 100)}% of the price for MULEs and outfits, not a quarter less`, () => {
    expect(SPECIES_PERK.gearling).toContain(`${Math.round(PERK.gearlingPrice * 100)}%`);
    expect(SPECIES_PERK.gearling).not.toMatch(/quarter/i);
  });

  it('the Bramblet and Mollox cards say their extra output, and the Mollox its geo analysis time, from the same settings', () => {
    expect(SPECIES_PERK.bramblet).toContain(`+${PERK.brambletFood} Food`);
    expect(SPECIES_PERK.mollox).toContain(`+${PERK.molloxMine}`);
    expect(SPECIES_PERK.mollox).toContain(`${Math.round(PERK.molloxAnalysis * 100)}%`);
  });
});
