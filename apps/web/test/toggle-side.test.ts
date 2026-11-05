import type { AuctionRole, AuctionSide } from '@mule/engine';
import { expect, it } from 'vitest';
import { toggleSide } from '../src/components/AuctionParts';

/** The auto-trade amendment's RULE-2: everyone takes part, so a tap on your own side keeps it; there is no Pass. */
const TAPS: [held: AuctionSide, tapped: AuctionRole, gives: AuctionSide][] = [
  ['buyer', 'buyer', 'buyer'],
  ['buyer', 'seller', 'seller'],
  ['seller', 'buyer', 'buyer'],
  ['seller', 'seller', 'seller'],
];

it.each(TAPS)('RULE-2: holding %s, a tap on %s gives %s', (held, tapped, gives) => {
  expect(toggleSide(held, tapped)).toBe(gives);
});
