import { Mule, SLOT_COLOR, StoreInterior, type StoreInteriorProps } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/** Every opening <svg> tag that is a Mule, in document order. */
const mulesIn = (html: string) => html.match(/<svg[^>]*data-mule-state="[^"]*"[^>]*>/g) ?? [];

/** The markup of the element carrying this data-testid, up to its matching close (the elements here do not nest their own tag). */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const start = open!.index!;
  const tag = open![1]!;
  // Walk to the matching close, counting nested elements of the same tag.
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = start + open![0].length;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`no close for ${testid}`);
}

const SADDLE = 'data-part="saddle"';

const store = (props: Partial<StoreInteriorProps>) =>
  renderToStaticMarkup(createElement(StoreInterior, { mules: 4, mulePrice: 142, prices: {}, open: ['corral', 'pub'], onShop: () => {}, ...props }));

describe('the MULE as a character (C19)', () => {
  it('B-AC-16: a Mule shows its state and its good, and an empty one says empty', () => {
    const lit = renderToStaticMarkup(createElement(Mule, { state: 'installed', good: 'energy', owner: SLOT_COLOR[0] }));
    expect(lit).toMatch(/^<svg[^>]*data-mule-state="installed"[^>]*data-good="energy"/);
    const empty = renderToStaticMarkup(createElement(Mule, {}));
    expect(empty).toMatch(/^<svg[^>]*data-mule-state="idle"[^>]*data-good="empty"/);
  });

  it('B-AC-16: an owned MULE wears a saddle cloth in its owner colour; a store MULE has none', () => {
    const owned = renderToStaticMarkup(createElement(Mule, { owner: SLOT_COLOR[2] }));
    expect(owned).toContain(SADDLE);
    const cloth = owned.match(/<path[^>]*data-part="saddle"[^>]*>/)?.[0];
    expect(cloth).toContain(`fill="${SLOT_COLOR[2]}"`);
    const stock = renderToStaticMarkup(createElement(Mule, {}));
    expect(stock).not.toContain(SADDLE);
  });

  it('B-AC-16: the corral is a pen of MULE characters, none of them saddled', () => {
    const corral = element(store({}), 'booth-corral');
    const mules = mulesIn(corral);
    expect(mules.length).toBeGreaterThan(0);
    for (const m of mules) expect(m).toContain('data-good="empty"');
    expect(corral).not.toContain(SADDLE);
  });

  it('B-AC-16: the MULE you lead is empty, then lit with its good, and wears your colour', () => {
    const me = { id: 'lena', slot: 0 as const, time: 1 };
    const empty = mulesIn(element(store({ me: { ...me, leading: 'empty' } }), 'visitor-lena'));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toContain('data-good="empty"');
    const lit = element(store({ me: { ...me, leading: 'energy' } }), 'visitor-lena');
    expect(mulesIn(lit)[0]).toContain('data-good="energy"');
    expect(lit).toContain(SADDLE);
    // With no MULE in tow your colonist leads none.
    expect(mulesIn(element(store({ me: { ...me, leading: null } }), 'visitor-lena'))).toHaveLength(0);
  });
});

describe('the hall says what to do next (C18)', () => {
  it('B-AC-15: the room RULE-7 names glows with a TAP tag; the others do not', () => {
    const html = store({ next: ['corral'] });
    expect(element(html, 'booth-corral')).toMatch(/^<button[^>]*data-next="true"/);
    expect(element(html, 'booth-corral')).toContain('data-testid="tap-here"');
    expect(html.match(/data-next="true"/g)).toHaveLength(1);
  });

  it('B-AC-15: a closed room stays legible and says why; with no MULE the outfitters say "needs a MULE"', () => {
    const html = store({ locks: { food: 'needs a MULE', works: 'needs a MULE' } });
    const food = element(html, 'booth-food');
    expect(food).toMatch(/^<button[^>]*data-shop="food"[^>]*disabled=""/);
    expect(food).toContain('needs a MULE');
    expect(element(html, 'booth-works')).toContain('needs a MULE');
  });

  it('B-AC-15 (negative): a glow on a closed room is not drawn', () => {
    const html = store({ next: ['food'] });
    expect(html).not.toContain('data-next');
  });

  it('B-AC-15: both doors glow when RULE-7 names them', () => {
    const html = store({ next: ['doorL', 'doorR'], onDoor: () => {} });
    expect(element(html, 'door-L')).toMatch(/data-next="true"/);
    expect(element(html, 'door-R')).toMatch(/data-next="true"/);
  });
});
