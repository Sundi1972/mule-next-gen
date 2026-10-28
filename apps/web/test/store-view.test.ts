import { DEV_WALK } from '@mule/engine';
import { PaceList, SharedClock, StoreInterior, type Condition } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FillCard } from '../src/phone/Develop';

/** Lena on 2 of the 5 Food she needs: the server's condition for her (engine hungerPace 0.52). */
const HUNGRY: Condition = { foodShare: 0.4, sick: false, conditionPace: 0.52 };
const SICK: Condition = { foodShare: 1, sick: true, conditionPace: 0.5 };
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
    expect(text).toContain('one clock for everyone');
    expect(text).toContain('You eat 2 of the 5 Food you need.');
    expect(text).toContain('Hungry: 52% pace');
    expect(text).not.toMatch(/less time|time bar/);
  });

  it('B-AC-9: a fed but sick player is told the sickness strikes now and slows her, never full pace', () => {
    const html = renderToStaticMarkup(createElement(FillCard, { condition: SICK, rule: DEV_WALK, food: { ate: 5, need: 5 } }));
    const text = textFrom(html, 'fill-card');
    expect(text).toContain('You eat the 5 Food you need.');
    expect(textFrom(html, 'sick-strikes')).toMatch(/^ ✚ Sick: the air is toxic\. It strikes now and slows you this turn\./);
    expect(text).toContain('Sick: 50% pace');
    expect(text).not.toContain('full pace');
  });

  it('B-AC-9: your colonist carries no time bar; hungry, it wears the hunger tag at its level and waddles at its pace', () => {
    const hall = (condition: Condition, moving = false) =>
      renderToStaticMarkup(createElement(StoreInterior, { mules: 4, mulePrice: 142, prices: {}, paceRule: DEV_WALK, me: { id: 'lena', slot: 0, leading: null, condition, food: { ate: 2, need: 5 }, moving } }));
    const hungry = hall(HUNGRY, true);
    expect(tagOf(hungry, 'condition-lena')).toContain('data-hunger="2"');
    expect(tagOf(hungry, 'condition-lena')).not.toContain('data-sick');
    expect(hungry).toContain('data-testid="hunger-lena"');
    expect(hungry).toContain('animation-duration:0.6923');
    expect(tagOf(hall(SICK), 'condition-lena')).toContain('data-sick="true"');
    const fed = hall(FED);
    expect(fed).not.toContain('data-testid="condition-lena"');
    expect(fed).not.toContain('animation-duration');
    // The bar over the head is gone: nothing in the colonist is a width.
    expect(fed.slice(fed.indexOf(tagOf(fed, 'visitor-lena')))).not.toMatch(/style="width:/);
  });

  it('T-AC-25: the clock is one for everyone, and the TV lists each pace and why', () => {
    expect(textFrom(renderToStaticMarkup(createElement(SharedClock, { seconds: 31, total: 50 })), 'shared-clock')).toMatch(/^ Everyone(&#x27;|')s time · one clock 31s/);
    const list = renderToStaticMarkup(
      createElement(PaceList, {
        rule: DEV_WALK,
        rows: [
          { id: 'lena', name: 'Lena', slot: 0, condition: HUNGRY },
          { id: 'kai', name: 'Kai', slot: 1, condition: FED },
        ],
      }),
    );
    expect(textFrom(list, 'pace-lena')).toMatch(/^ Lena 52%/);
    expect(tagOf(list, 'condition-lena')).toContain('data-hunger="2"');
    expect(textFrom(list, 'pace-kai')).toMatch(/^ Kai 100%/);
    expect(list).not.toContain('data-testid="condition-kai"');
  });
});
