import { describe, expect, it } from 'vitest';
import { partyTo, type DealCard } from '../src/index.js';

const STATUSES: DealCard['status'][] = ['offered', 'active', 'declined', 'withdrawn', 'expired', 'kept', 'broken'];

function card(status: DealCard['status']): DealCard {
  return { id: 'deal-abc123', from: 'lena', to: 'brix', terms: { kind: 'pact' }, offered: 1, until: 3, status, brokenBy: status === 'broken' ? 'lena' : null, settled: null };
}

describe('partyTo', () => {
  it('S3-T-AC-5: partyTo(viewer, card) is true for the card\'s two parties and for any broken card, and false for anyone else', () => {
    for (const status of STATUSES) {
      const c = card(status);
      expect(partyTo('lena', c), `from, ${status}`).toBe(true);
      expect(partyTo('brix', c), `to, ${status}`).toBe(true);
      expect(partyTo('ossa', c), `third player, ${status}`).toBe(status === 'broken');
    }
    expect(partyTo('ossa', card('active'))).toBe(false);
  });
});
