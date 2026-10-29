import { DEVELOPMENT } from '@mule/engine';
import type { MuleView, PlayerView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hostMayContinue } from '../src/phone/hub/ready';
import { ClockWaits, FirstMules } from '../src/table/TableApp';

const seat = (id: string, name: string, slot: number): PlayerView => ({
  id,
  name,
  isAi: id === 'ossa',
  color: '',
  slot,
  species: 'zipwing',
  money: 1_000,
  worth: 0,
  plots: 2,
  ready: false,
  doneDeveloping: false,
  colonist: null,
  condition: null,
});

const PLAYERS = [seat('lena', 'Lena', 0), seat('ossa', 'Ossa', 1), seat('brix', 'Brix', 2), seat('kai', 'Kai', 3)];

/** Month 1's development, the clock waiting for `waitsFor`, or running when it is undefined. */
const firstMonth = (waitsFor?: string[]) =>
  ({ phase: 'development', month: 1, politics: null, players: PLAYERS, ...(waitsFor ? { clockWaitsFor: waitsFor } : {}) }) as unknown as MuleView;

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const rows = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => text(m[1]!));

describe("A-1: month 1's development clock waits for every first MULE (the TV and the host)", () => {
  it("A-1: the TV lists every seat's first MULE as in or still to come, in seat order, under the mock's words", () => {
    const html = renderToStaticMarkup(createElement(FirstMules, { game: firstMonth(['lena', 'brix']) }));
    expect(text(html)).toMatch(/^First MULEs in/);
    expect(rows(html)).toEqual(['Lena still to come', 'Ossa ✓ in', 'Brix still to come', 'Kai ✓ in']);
  });

  it('A-1: while it waits the TV clock stands full and says what starts it', () => {
    const html = renderToStaticMarkup(createElement(ClockWaits));
    expect(text(html), 'the label, then the bar at its full time').toBe(`First month: the clock starts when every first MULE is in ${DEVELOPMENT.fullSeconds}s`);
  });

  it("A-1: the host may Continue in development only while month 1's clock waits", () => {
    expect(hostMayContinue(firstMonth(['lena']))).toBe(true);
    expect(hostMayContinue(firstMonth()), 'once the clock runs, Continue has nothing to start').toBe(false);
    expect(hostMayContinue({ ...firstMonth(), month: 2 } as MuleView)).toBe(false);
  });
});
