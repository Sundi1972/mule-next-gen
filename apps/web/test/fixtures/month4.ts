import { GAME, type TaxPromise } from '@mule/engine';
import type { ListingView, MuleView, MyView, PlayerView, PoliticsView } from '@mule/protocol';
import { aMuleView, aPlayer } from './views';

/** Month 4's planning after its election, as the UX audit's tests see it on Lena's phone (hub-audit, hub-help). */

export const NO_GOODS = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

/** Ossa leads by Worth, Lena is second, then the two AIs: Lena's money (1,000) is not what ranks her. */
export const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, money: 1_000, worth: 2_800, plots: 3 }),
  aPlayer({ id: 's2', name: 'Ossa', slot: 1, money: 4_000, worth: 5_600, plots: 4 }),
  aPlayer({ id: 's3', name: 'Kai', slot: 2, isAi: true, money: 1_500, worth: 1_900 }),
  aPlayer({ id: 's4', name: 'Brix', slot: 3, isAi: true, money: 900, worth: 2_100 }),
];

/** Lena's own lines: 1,000 cash + 600 of goods (6 units) + 3 plots + 2 MULEs, no office. They add up to her 2,800. */
export const LENAS_PARTS: MyView['worthParts'] = { money: 1_000, goods: 600, plots: 3, land: 3 * GAME.plotScore, mules: 2, muleValue: 300, office: 0, donated: 0, cut: 0 };
/** Ossa's, on her own phone: they add up to her 5,600. */
export const OSSAS_PARTS: MyView['worthParts'] = { money: 4_000, goods: 0, plots: 4, land: 4 * GAME.plotScore, mules: 2, muleValue: 400, office: 0, donated: 0, cut: 0 };

export function myView(id: string, extra: Partial<MyView> = {}): MyView {
  return {
    id,
    species: 'zipwing',
    // Short of Food (2 of 5), enough Energy (3 of 2) and Water (1 of 1).
    stock: { ...NO_GOODS, food: 2, energy: 3, water: 1 },
    carriedMule: null,
    installedThisTurn: false,
    worthParts: id === 's1' ? LENAS_PARTS : OSSAS_PARTS,
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 5, water: 1 },
    monthNeeds: { ...NO_GOODS, food: 5, energy: 2, water: 1 },
    devEndsAt: null,
    devSeconds: 50,
    produced: null,
    mulePrice: 150,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
    droneOrder: [],
    politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, paid: 0, reputation: 50 },
    ...extra,
  };
}

export const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };
/** Month 4 after its election: Ossa Governor until month 6 on a promise of up to 4%, the tax at 4%. */
export const POLITICS_4: PoliticsView = {
  governor: 's2',
  sheriff: null,
  term: [4, 6],
  next: 7,
  baron: null,
  tax: { percent: 4, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50, sheriff: 30 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: [], sheriff: [] },
  promises: {},
  promise: CAP_4,
  promiseFrom: 5,
  election: null,
};

export const LOT: ListingView = { id: 'plot-3-4', seller: 's4', item: { kind: 'plot', x: 3, y: 4 }, minimum: 160, unsold: 'store', storePays: 100 };

export function month4(extra: Partial<MuleView> = {}, me: MyView = myView('s1')): MuleView {
  return aMuleView({ month: 4, players: PLAYERS, me, mulePrice: 150, treasury: { money: 0, salesTax: 0.04 }, politics: POLITICS_4, ...extra });
}

