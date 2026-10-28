import { DEV_WALK } from '@mule/engine';
import { PaceList, SharedClock, StoreInterior, TimeBar, type Condition } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FillCard } from '../src/phone/Develop';

/** Lena on 2 of the 5 Food she needs: the server's condition for her (engine hungerPace 0.52). */
const HUNGRY: Condition = { foodShare: 0.4, sick: false, conditionPace: 0.52 };
/** Sick in clean air, with no pollution of her own: by chance. */
const SICK: Condition = { foodShare: 1, sick: true, sickBecause: 'chance', conditionPace: 0.5 };
const FED: Condition = { foodShare: 1, sick: false, conditionPace: 1 };

/** The opening tag of the element carrying this data-testid. */
function tagOf(html: string, testid: string): string {
  const tag = html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];
  expect(tag, `an element with data-testid="${testid}"`).toBeDefined();
  return tag!;
}

/** The text from the element carrying this data-testid to the end of the markup, tags stripped. */
function textFrom(html: string, testid: string): string {
  return html.slice(html.indexOf(tagOf(html, testid))).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('the store at a glance', () => {
  it('B-AC-10: a sold-out corral is disabled and says SOLD OUT', () => {
    const html = renderToStaticMarkup(createElement(StoreInterior, { mules: 0, mulePrice: 142, prices: {}, open: ['corral', 'pub'], onShop: () => {} }));
    const corral = tagOf(html, 'booth-corral');
    expect(corral).toMatch(/^<button/);
    expect(corral).toContain('data-shop="corral"');
    expect(corral).toMatch(/\sdisabled=""/);
    expect(textFrom(html, 'booth-corral')).toMatch(/^ SOLD OUT /);
    expect(tagOf(html, 'booth-pub')).not.toMatch(/\sdisabled=""/);
  });

  it('B-AC-9: a hungry player is told what she ate and her pace, never less time', () => {
    const text = textFrom(renderToStaticMarkup(createElement(FillCard, { condition: HUNGRY, rule: DEV_WALK, food: { ate: 2, need: 5 } })), 'fill-card');
    expect(text).toMatch(/^ One clock for everyone · 50 s You eat 2 of the 5 Food you need\./);
    expect(text).toContain('Hungry: 52% pace');
    expect(text).not.toMatch(/less time|time bar/);
  });

  it('B-AC-9: a fed but sick player is told the sickness strikes now and slows her, never full pace', () => {
    const html = renderToStaticMarkup(createElement(FillCard, { condition: SICK, rule: DEV_WALK, food: { ate: 5, need: 5 } }));
    const text = textFrom(html, 'fill-card');
    expect(text).toContain('You eat the 5 Food you need.');
    expect(textFrom(html, 'sick-strikes')).toMatch(/^ ✚ Sick this month\. It strikes now and slows you this turn\./);
    expect(text).not.toContain('toxic');
    expect(text).toContain('Sick: 50% pace');
    expect(text).not.toContain('full pace');
  });

  it('B-AC-9: your colonist carries no time bar; hungry, it wears the hunger tag at its level', () => {
    const hall = (condition: Condition) =>
      renderToStaticMarkup(createElement(StoreInterior, { mules: 4, mulePrice: 142, prices: {}, paceRule: DEV_WALK, me: { id: 'lena', slot: 0, leading: null, condition, food: { ate: 2, need: 5 } } }));
    const hungry = hall(HUNGRY);
    expect(tagOf(hungry, 'condition-lena')).toContain('data-hunger="2"');
    expect(tagOf(hungry, 'condition-lena')).not.toContain('data-sick');
    expect(hungry).toContain('data-testid="hunger-lena"');
    expect(tagOf(hall(SICK), 'condition-lena')).toContain('data-sick="true"');
    const fed = hall(FED);
    expect(fed).not.toContain('data-testid="condition-lena"');
    // The bar over the head is gone: nothing in the colonist is a width.
    expect(fed.slice(fed.indexOf(tagOf(fed, 'visitor-lena')))).not.toMatch(/style="width:/);
  });

  it('T-AC-12: the clock is one for everyone, and the TV lists each pace and why on the roster rows', () => {
    expect(textFrom(renderToStaticMarkup(createElement(SharedClock, { seconds: 31, total: 50 })), 'shared-clock')).toMatch(/^ Everyone(&#x27;|')s time · one clock 31s/);
    expect(textFrom(renderToStaticMarkup(createElement(SharedClock, { seconds: 31, total: 50, size: 'tv' })), 'shared-clock')).toMatch(/^ Everyone(&#x27;|')s time 31s/);
    // A small phone's rail has room for one line above the bar: your pace rides on the clock's label there.
    const rail = renderToStaticMarkup(createElement(SharedClock, { seconds: 31, total: 50, pace: { title: 'Hungry: 52% pace', tone: 'warn' } }));
    expect(rail).toMatch(/<span class="[^"]*@min-\[1100px\]\/shell:hidden[^"]*">Everyone(&#x27;|')s time · <span class="text-warn">Hungry: 52% pace<\/span><\/span>/);
    expect(rail).toMatch(/<span class="hidden[^"]*@min-\[1100px\]\/shell:inline[^"]*">Everyone(&#x27;|')s time · one clock<\/span>/);
    const list = renderToStaticMarkup(
      createElement(PaceList, {
        rule: DEV_WALK,
        columns: 1,
        rows: [
          { id: 'lena', name: 'Lena', slot: 0, condition: HUNGRY, note: 'BUILDING' },
          { id: 'kai', name: 'The Good Neighbour', slot: 1, condition: FED, note: 'PUB', done: true },
        ],
      }),
    );
    expect(tagOf(list, 'pace-list')).toMatch(/^<ul[^>]*grid-cols-1/);
    // Each row stays a roster row: an li with the player's mark, the full name, the pace and what they are doing.
    expect(tagOf(list, 'pace-lena')).toMatch(/^<li/);
    expect(textFrom(list, 'pace-lena')).toMatch(/^ Lena 52% BUILDING/);
    expect(list.slice(list.indexOf(tagOf(list, 'pace-lena')))).toMatch(/^<li[^>]*>\s*<span role="img" data-slot="0"/);
    expect(tagOf(list, 'condition-lena')).toContain('data-hunger="2"');
    expect(textFrom(list, 'pace-kai')).toMatch(/^ The Good Neighbour 100% PUB/);
    expect(tagOf(list, 'pace-kai')).toContain('opacity-50');
    expect(list).not.toContain('data-testid="condition-kai"');
  });

  it("T-AC-12: the one clock is big, and turns alert red and pulses in its last 10 s, not at 11; the auction's bar keeps its tones", () => {
    const clock = (seconds: number, size: 'phone' | 'tv') => renderToStaticMarkup(createElement(SharedClock, { seconds, total: 50, size }));
    const fill = (html: string) => html.match(/<i class="([^"]*)"/)![1]!;
    const number = (html: string) => html.match(/<span[^>]*class="([^"]*)"[^>]*>\d+s<\/span>/)![1]!;
    for (const size of ['phone', 'tv'] as const) {
      const urgent = clock(10, size);
      const calm = clock(11, size);
      expect(fill(urgent)).toMatch(/\bbg-alert\b.*motion-safe:animate-pulse|motion-safe:animate-pulse.*\bbg-alert\b/);
      expect(number(urgent)).toMatch(/\btext-alert\b.*motion-safe:animate-pulse|motion-safe:animate-pulse.*\btext-alert\b/);
      expect(fill(calm)).not.toMatch(/bg-alert|animate-pulse|bg-rise/);
      expect(number(calm)).not.toMatch(/text-alert|animate-pulse|text-rise/);
    }
    // On the TV a 24 px bar beside 48 px seconds; in a rail 18 px seconds, 24 px from a laptop up.
    expect(clock(30, 'tv')).toMatch(/class="[^"]*\bh-6\b[^"]*"/);
    expect(number(clock(30, 'tv'))).toContain('text-5xl');
    expect(number(clock(30, 'phone'))).toMatch(/\btext-lg\b.*@min-\[1100px\]\/shell:text-2xl/);
    // The auction's bar is unchanged: at 10 s of 50 it is red by its share and says Hurry.
    const auction = renderToStaticMarkup(createElement(TimeBar, { seconds: 10, total: 50 }));
    expect(fill(auction)).toContain('bg-rise');
    expect(auction).toContain('Hurry');
  });
});
