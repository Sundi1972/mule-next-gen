import { SPECIES_PERK as PERK } from '@mule/engine';
import { createContext, useContext, type ReactNode } from 'react';
import type { Slot } from './tokens';

export type Species = 'zipwing' | 'bramblet' | 'gearling' | 'mollox' | 'glimmer' | 'quibbit';

export const SPECIES: Species[] = ['zipwing', 'bramblet', 'gearling', 'mollox', 'glimmer', 'quibbit'];

export const SPECIES_NAME: Record<Species, string> = {
  zipwing: 'Zipwing',
  bramblet: 'Bramblet',
  gearling: 'Gearling',
  mollox: 'Mollox',
  glimmer: 'Glimmer',
  quibbit: 'Quibbit',
};

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** One clear perk per species, in the numbers the game plays: read from the balance settings, so the words follow a tuning. */
export const SPECIES_PERK: Record<Species, string> = {
  zipwing: `Fast flyer. Walks ${PERK.zipwingSpeed}× as fast during development.`,
  bramblet: `Green thumb. Farms yield +${PERK.brambletFood} Food.`,
  gearling: `Tinkerer. Pays ${pct(PERK.gearlingPrice)} of the price for MULEs and outfits.`,
  mollox: `Burrower. Mines yield +${PERK.molloxMine}, and geo analysis takes ${pct(PERK.molloxAnalysis)} of the time.`,
  glimmer: 'Seer. Sees next month’s event one month early.',
  quibbit: 'Born trader. First in line when the store hands out units in turns.',
};

/** Which species sits in which seat. Players pick their species; colour stays the main difference. */
const SeatSpecies = createContext<Record<Slot, Species>>({ 0: 'zipwing', 1: 'bramblet', 2: 'gearling', 3: 'mollox', 4: 'glimmer', 5: 'quibbit' });

export const SeatSpeciesProvider = SeatSpecies.Provider;

/** Wraps a seat's drawn creature: the screen's hook to anchor something at it. */
export type CreatureWrap = (seatId: string, creature: ReactNode) => ReactNode;

export function useSeatSpecies(slot: Slot): Species {
  return useContext(SeatSpecies)[slot];
}
