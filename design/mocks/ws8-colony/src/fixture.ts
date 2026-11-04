import type { MuleView, MyView } from '@mule/protocol';
import { airBandStyle } from '@mule/ui';
import { aMuleView, aPlayer } from '../../../../apps/web/test/fixtures/views';
import type { ColonyView } from './colony';

/** Four seats: Heiko is the phone in every screen; Mia leads on Worth; Kai is the Governor. */
export const PLAYERS = [
  aPlayer({ id: 's1', name: 'Heiko', slot: 0, money: 2_900, worth: 6_420, lastWorth: 6_100 }),
  aPlayer({ id: 's2', name: 'Mia', slot: 1, species: 'bramblet', money: 1_100, worth: 7_050, lastWorth: 6_600 }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, species: 'gearling', money: 1_800, worth: 4_980, lastWorth: 5_020 }),
  aPlayer({ id: 's4', name: 'Ruth', slot: 3, species: 'mollox', isAi: true, money: 2_200, worth: 5_610, lastWorth: 5_300 }),
];

const stock = { food: 4, water: 2, energy: 3, smithore: 0, crystite: 0, rareEarth: 0, alloy: 1, electronics: 0, medicine: 0 };
export const ME: MyView = {
  id: 's1',
  species: 'zipwing',
  stock,
  carriedMule: null,
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 3, water: 2 },
  monthNeeds: { ...stock, food: 3, water: 2, energy: 2 },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: null,
  installedThisTurn: false,
  worthParts: { money: 2_900, goods: 220, plots: 7, land: 2_100, mules: 6, muleValue: 900, office: 300, cut: 0 },
};

/** A game as the server sends it, with the colony's air taken from the colony view so the two never disagree. */
export function game(colony: ColonyView, over: Partial<MuleView> = {}): MuleView {
  return aMuleView({
    players: PLAYERS,
    me: ME,
    politics: null,
    month: 7,
    phase: 'upkeep',
    colonists: 1_480,
    colonistsFed: true,
    air: { level: colony.gauges.environment, band: airBandStyle(colony.gauges.environment).name },
    lastAir: { level: colony.gauges.environment - 3, band: airBandStyle(colony.gauges.environment - 3).name },
    treasury: { money: colony.fund, salesTax: 0.05 },
    ...over,
  });
}

export function finalGame(colony: ColonyView): MuleView {
  return game(colony, { finished: true, phase: 'gameOver', month: 12, scores: PLAYERS.map((p) => ({ id: p.id, score: p.worth })) });
}

export const NAME: Record<string, string> = Object.fromEntries(PLAYERS.map((p) => [p.id, p.name]));
export const SLOT: Record<string, 0 | 1 | 2 | 3> = Object.fromEntries(PLAYERS.map((p) => [p.id, p.slot as 0 | 1 | 2 | 3]));
export const SPECIES = Object.fromEntries(PLAYERS.map((p) => [p.id, p.species]));
