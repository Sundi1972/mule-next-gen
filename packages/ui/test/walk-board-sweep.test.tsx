import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BOARD_TYPE, labelLines, spreadLabels, tickCovered } from '../src/components/board-layout';
import { WalkBoard, type BoardWalker } from '../src/index';

/** The TV goods auction's board, as the 6 Nov screen sweep found it: one gap number, readable line labels, a clear axis. */

const walker = (id: string, side: BoardWalker['side'], price: number, units = 3): BoardWalker => ({ id, name: id, slot: 0, side, price, at: price, units });

/** Month 6's Alloy walk (m06-136): The Big Spender asks 115, everyone else bids 66; the store sells at 100 (1 left) and buys at 81; the ship pays 99. */
const alloy = (size: 'tv' | 'phone' = 'tv') =>
  renderToStaticMarkup(
    <WalkBoard
      size={size}
      lo={56}
      hi={125}
      walkers={[walker('heiko', 'buyer', 66, 0), walker('acc', 'buyer', 66, 0), walker('big', 'seller', 115, 5), walker('grudge', 'buyer', 66, 0)]}
      deals={[]}
      storeBuys={81}
      storeSells={100}
      shipPays={99}
      shipCaption="The ship buys Alloy at 99"
      storeStock={1}
      marks={{ ask: true, bid: true }}
    />,
  );

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const gapChip = (html: string) => textOf(html.match(/data-testid="gap-label"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');

/** Where a line's label sits, in px from the top of the board's price area, as the board draws it at its nominal size. */
function labelAt(html: string, key: string, size: 'tv' | 'phone' = 'tv'): number {
  const m = html.match(new RegExp(`top:([\\d.]+)%"[^>]*data-testid="limit-${key}"><span[^>]*style="[^"]*top:(-?[\\d.]+)px`));
  expect(m, `the ${key} line's label`).not.toBeNull();
  return (Number(m![1]) / 100) * BOARD_TYPE[size].room + Number(m![2]);
}

describe('SWEEP-C1: the chart chip and the side panel show the same gap', () => {
  it('SWEEP-C1: with the store selling at 100 and the ship paying 99, the chip says 1 APART, not the players’ 49', () => {
    expect(gapChip(alloy())).toBe('1 APART');
  });

  it('SWEEP-C1: a player asking under the store and the store buying over every player: the chip counts both (90 against 81)', () => {
    const html = renderToStaticMarkup(
      <WalkBoard lo={56} hi={125} walkers={[walker('big', 'seller', 90), walker('heiko', 'buyer', 66)]} deals={[]} storeBuys={81} storeSells={100} shipPays={null} storeStock={4} marks={{ ask: true, bid: true }} />,
    );
    expect(gapChip(html)).toBe('9 APART');
  });

  it('SWEEP-C1: a store with nothing left to sell is no ask: the chip measures from the lowest player', () => {
    const html = renderToStaticMarkup(
      <WalkBoard lo={56} hi={125} walkers={[walker('big', 'seller', 110), walker('heiko', 'buyer', 70)]} deals={[]} storeBuys={60} storeSells={100} shipPays={null} storeStock={0} marks={{ ask: true, bid: true }} />,
    );
    expect(gapChip(html)).toBe('40 APART');
  });

  it('SWEEP-C1: lines that meet show no chip', () => {
    const html = renderToStaticMarkup(
      <WalkBoard lo={56} hi={125} walkers={[walker('big', 'seller', 99), walker('heiko', 'buyer', 70)]} deals={[]} storeBuys={60} storeSells={100} shipPays={99} storeStock={1} marks={{ ask: true, bid: true }} />,
    );
    expect(html).not.toContain('data-testid="gap-label"');
  });
});

describe('SWEEP-C2: price-line labels that would overlap are pushed apart, in order', () => {
  it('SWEEP-C2: two labels 4 px apart move apart to clear each other, about their middle, the upper one staying on top', () => {
    const [a, b] = spreadLabels([{ at: 100, size: 40 }, { at: 104, size: 40 }], 2);
    expect(b! - a!).toBeCloseTo(42);
    expect((a! + b!) / 2).toBeCloseTo(102);
  });

  it('SWEEP-C2: labels with room between them stay on their lines', () => {
    expect(spreadLabels([{ at: 300, size: 40 }, { at: 100, size: 40 }], 2)).toEqual([300, 100]);
  });

  it('SWEEP-C2: a third label pushed into by a cluster joins it, and the order holds', () => {
    const at = spreadLabels([{ at: 100, size: 40 }, { at: 102, size: 40 }, { at: 140, size: 40 }], 2);
    expect(at[1]! - at[0]!).toBeCloseTo(42);
    expect(at[2]! - at[1]!).toBeCloseTo(42);
  });

  it('SWEEP-C2: a label wraps where its words do: "SELLS 100 · 1 LEFT" takes two lines in the TV gutter', () => {
    expect(labelLines('SELLS 100 · 1 LEFT', BOARD_TYPE.tv.perLine)).toBe(2);
    expect(labelLines('PAYS 99', BOARD_TYPE.tv.perLine)).toBe(1);
  });

  for (const size of ['tv', 'phone'] as const) {
    it(`SWEEP-C2: on the ${size} board, "STORE SELLS 100 · 1 LEFT" and "SHIP PAYS 99" no longer print over each other`, () => {
      const html = alloy(size);
      const sells = labelAt(html, 'sells', size);
      const ship = labelAt(html, 'ship', size);
      const { lineBox } = BOARD_TYPE[size];
      // STORE + two lines over SHIP + one line, half of each.
      expect(ship - sells).toBeGreaterThanOrEqual((3 * lineBox + 2 * lineBox) / 2);
      expect(sells).toBeLessThan(ship);
    });
  }
});

describe('SWEEP-C9: a price tag on the axis hides the tick number under it', () => {
  it('SWEEP-C9: the tick is covered only within reach of a tag', () => {
    expect(tickCovered(100, [108], 16)).toBe(true);
    expect(tickCovered(100, [120], 16)).toBe(false);
    expect(tickCovered(100, [], 16)).toBe(false);
  });

  it('SWEEP-C9: The Big Spender asking 1113 hides the 1100 tick (m12-251); the 1000 tick still shows', () => {
    const html = renderToStaticMarkup(
      <WalkBoard
        size="tv"
        lo={640}
        hi={1140}
        walkers={[walker('big', 'seller', 1113), walker('heiko', 'buyer', 651)]}
        deals={[]}
        storeBuys={793}
        storeSells={null}
        shipPays={null}
        storeStock={0}
        marks={{ ask: true, bid: true }}
      />,
    );
    const axis = textOf(html.slice(0, html.indexOf('data-testid="tag-ask"')));
    expect(axis.split(' ')).not.toContain('1100');
    expect(axis.split(' ')).toContain('1000');
    expect(html).toContain('data-testid="tag-ask"');
  });
});
