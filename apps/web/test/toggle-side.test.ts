import type { AuctionRole, AuctionSide } from '@mule/engine';
import { expect, it } from 'vitest';
import { toggleSide } from '../src/components/AuctionParts';

const TAPS: [held: AuctionSide, tapped: AuctionRole, gives: AuctionSide][] = [
  ['buyer', 'buyer', 'pass'],
  ['buyer', 'seller', 'seller'],
  ['seller', 'buyer', 'buyer'],
  ['seller', 'seller', 'pass'],
  ['pass', 'buyer', 'buyer'],
  ['pass', 'seller', 'seller'],
];

it.each(TAPS)('B-AC-4 (RULE-2 row 1): holding %s, a tap on %s gives %s', (held, tapped, gives) => {
  expect(toggleSide(held, tapped)).toBe(gives);
});
