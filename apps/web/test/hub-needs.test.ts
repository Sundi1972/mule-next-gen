import { emptyStock, GAME, type Outfit, type Stock } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { needRows, planNow } from '../src/phone/hub/needs';

const stock = (s: Partial<Stock>): Stock => ({ ...emptyStock(), ...s });
const plots = (...outfits: (Outfit | null)[]) => outfits.map((outfit) => ({ outfit }));

describe("planning's This month you need (RULE-8)", () => {
  it('B-AC-14: Lena holds 3 Energy and her three farms and well burn 4: Energy SHORT 1, Food and Water OK', () => {
    const rows = needRows(stock({ food: 3, water: 2, energy: 4 }), stock({ food: 5, water: 2, energy: 3 }), plots('food', 'food', 'food', 'water', null));
    expect(rows).toEqual([
      { good: 'food', have: 5, need: 3, short: 0, why: 'upkeep' },
      { good: 'water', have: 2, need: 2, short: 0, why: 'upkeep' },
      { good: 'energy', have: 3, need: 4, short: 1, why: '3 farms and a well' },
    ]);
  });

  it('B-AC-14 (negative): a good she does not need this month has no row; the rest follow by need, with what needs them', () => {
    // An Alloy factory takes 2 Smithore, an Electronics one 1 Rare Earth and 1 Alloy; bad air asks Medicine, here 3,
    // so Medicine, last of the goods, leads the rest. Ties keep the goods' order. No Energy need: no Energy row.
    const need = stock({ food: 3, water: 2, smithore: 2, rareEarth: 1, alloy: 1, medicine: 3, energy: 0 });
    const rows = needRows(need, stock({ smithore: 2 }), plots('smithore', 'alloy', 'electronics', 'energy', 'greenBelt'));
    expect(rows.map((r) => r.good)).toEqual(['food', 'water', 'medicine', 'smithore', 'rareEarth', 'alloy']);
    expect(rows.find((r) => r.good === 'crystite')).toBeUndefined();
    expect(rows.find((r) => r.good === 'energy')).toBeUndefined();
    expect(Object.fromEntries(rows.map((r) => [r.good, r.why]))).toEqual({
      food: 'upkeep',
      water: 'upkeep',
      smithore: 'Alloy inputs',
      alloy: 'Electronics inputs',
      rareEarth: 'Electronics inputs',
      medicine: 'bad air',
    });
    expect(rows.find((r) => r.good === 'smithore')).toMatchObject({ have: 2, need: 2, short: 0 });
  });

  it('B-AC-14, H-1: Now says to plan and press Ready, names the land grant next with its claims from config, and lists the SHORT goods or says she has what she needs', () => {
    // Energy is burned by the farm and the mine (UPKEEP.energyUse) and the Alloy factory (its recipe), not the power plant.
    const rows = needRows(stock({ food: 3, water: 2, energy: 5 }), stock({ food: 1, water: 2, energy: 3 }), plots('food', 'energy', 'smithore', 'alloy'));
    expect(rows.find((r) => r.good === 'energy')).toMatchObject({ short: 2, why: 'a farm, a mine and a factory' });
    const short = planNow(rows);
    expect(short.title).toBe('Plan your month, then press Ready');
    // The land grant's claims are config's, the same number the roadmap's next line gives.
    expect(short.detail).toMatch(new RegExp(`^Next is the land grant: up to ${GAME.claimsPerGrant} free plots each\\. `));
    expect(short.detail).not.toMatch(/one free plot/);
    expect(short.detail).toMatch(/short of Food and Energy/);
    const fine = planNow(needRows(stock({ food: 3, water: 2 }), stock({ food: 3, water: 2 }), plots()));
    expect(fine.detail).toMatch(/land grant/);
    expect(fine.detail).toMatch(/you have what you need/i);
  });
});
