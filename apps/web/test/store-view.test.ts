import { StoreInterior } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FillCard } from '../src/phone/Develop';

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

  it('B-AC-9: a hungry player sees 2 of 5 Food and an orange bar at her devSeconds', () => {
    const html = renderToStaticMarkup(createElement(FillCard, { elapsed: 2, seconds: 29, hungry: true, ate: 2, need: 5 }));
    const text = textFrom(html, 'fill-card');
    expect(text).toContain('You eat 2 Food of the 5 you need and fill up your time bar.');
    expect(text).toContain('29 s of 50: short of Food, so less time');
    const bar = html.match(/<div class="[^"]*\bbg-warn\b[^"]*" style="width:([\d.]+)%"/);
    expect(Number(bar?.[1])).toBeCloseTo((29 / 50) * 100);
    expect(html).toMatch(/class="[^"]*\btext-warn\b[^"]*"[^>]*>29 s/);
    expect(html).not.toMatch(/\bbg-holo\b/);
  });
});
