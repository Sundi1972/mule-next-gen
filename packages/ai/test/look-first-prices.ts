import { monthlyDemand, PRICE, type GameState } from '@mule/engine';

/**
 * Prices a few months into a game, where looking at unknown ground before buying a MULE pays: Water, Energy and the
 * metals cheap, with their normal and off-world prices fallen with them (the store never posts under its normal price),
 * and Food, Crystite, Electronics and Medicine dear. Every price is one the store's bands can post, under 12 × its
 * reference. The colony holds normalCover months of Electronics: with none, its colonists' want makes a works the
 * clear best buy on any ground, and no ground is worth a look. The month-1 development tests that need a seat to
 * analyse first stage this; month 1's own opening (every good at its normal price or its band's) makes a MULE on known
 * ground the better buy.
 */
export function lookFirstPrices(state: GameState): void {
  const cheap = { water: 7, energy: 7, smithore: 13, rareEarth: 20, alloy: 30 };
  for (const prices of [state.store.posted, state.store.refPrice, state.store.offWorld]) Object.assign(prices, cheap);
  state.store.stock.electronics = Math.ceil(PRICE.normalCover * monthlyDemand(state).electronics);
  Object.assign(state.store.posted, { food: 55, crystite: 283, electronics: 622, medicine: 150 });
}
