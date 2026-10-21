import { createContext, useContext } from 'react';
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

/** One clear perk per species. Numbers are placeholders until the balance sim has run. */
export const SPECIES_PERK: Record<Species, string> = {
  zipwing: 'Fast flyer. Moves twice as fast during development.',
  bramblet: 'Green thumb. Farms yield +1 Food.',
  gearling: 'Tinkerer. MULEs and outfits cost a quarter less.',
  mollox: 'Burrower. Mines yield +1, and geo analysis takes half the time.',
  glimmer: 'Seer. Sees next month’s event one month early.',
  quibbit: 'Born trader. First in line when the store hands out units in turns.',
};

/** Which species sits in which seat. Players pick their species; colour stays the main difference. */
const SeatSpecies = createContext<Record<Slot, Species>>({ 0: 'zipwing', 1: 'bramblet', 2: 'gearling', 3: 'mollox', 4: 'glimmer', 5: 'quibbit' });

export const SeatSpeciesProvider = SeatSpecies.Provider;

export function useSeatSpecies(slot: Slot): Species {
  return useContext(SeatSpecies)[slot];
}
