import type { MuleView, PlayerView } from '@mule/protocol';

/**
 * One place for a whole PlayerView and MuleView in tests: a field trunk adds is defaulted here once, so it doesn't break
 * every test that builds a view by hand. Pass only the fields the test is about.
 */

export function aPlayer(over: Partial<PlayerView> & Pick<PlayerView, 'id' | 'name' | 'slot'>): PlayerView {
  return {
    isAi: false,
    color: '',
    species: 'zipwing',
    money: 1000,
    worth: 0,
    lastWorth: null,
    worthBeforeCut: null,
    plots: 0,
    ready: false,
    doneDeveloping: false,
    condition: null,
    colonist: null,
    ...over,
  };
}

export function aMuleView(over: Partial<MuleView> & Pick<MuleView, 'players' | 'me' | 'politics'>): MuleView {
  return {
    finished: false,
    month: 1,
    maxMonths: 12,
    phase: 'planning',
    phaseEndsAt: null,
    width: 1,
    height: 1,
    tiles: [],
    lit: null,
    market: [],
    storeMules: 0,
    mulePrice: 0,
    colonists: 0,
    air: { level: 22, band: 'clean' },
    lastAir: null,
    colonistsFed: null,
    ship: { arrives: 6, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0.05 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production: null,
    ...over,
  };
}
