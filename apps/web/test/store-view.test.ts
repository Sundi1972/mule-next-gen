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

  it('B-AC-9: a fed but sick player is told sickness cost them time, never full time', () => {
    const html = renderToStaticMarkup(createElement(FillCard, { seconds: 45, hungry: false, sick: true, ate: 5, need: 5 }));
    const text = textFrom(html, 'fill-card');
    expect(text).toContain('You eat 5 Food and fill up your time bar.');
    expect(text).toContain('45 s of 50: Sickness cost you time.');
    expect(text).not.toContain('full time');
  });
});
