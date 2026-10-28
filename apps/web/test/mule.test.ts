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
  it('B-AC-16: a Mule shows its state and its good, in its attributes and in its drawing', () => {
    const lit = renderToStaticMarkup(createElement(Mule, { state: 'installed', good: 'energy', owner: 0 }));
    expect(lit).toMatch(/^<svg[^>]*data-mule-state="installed"[^>]*data-good="energy"/);
    const empty = renderToStaticMarkup(createElement(Mule, {}));
    expect(empty).toMatch(/^<svg[^>]*data-mule-state="idle"[^>]*data-good="empty"/);
    // The drawing, not only the attributes: lit, the pod glows in the good's colour and shows its glyph.
    const stops = (html: string) => html.match(/<stop[^>]*>/g) ?? [];
    const energy = renderToStaticMarkup(createElement(Mule, { good: 'energy' }));
    expect(stops(energy)).toHaveLength(2);
    for (const s of stops(energy)) expect(s).toContain('stop-color="var(--color-g-energy)"');
    // The glyph is the good's own icon, nested in the MULE's drawing; an empty pod is dark and bare.
    expect(energy.match(/<svg/g)).toHaveLength(2);
    for (const s of stops(empty)) expect(s).toContain('stop-color="var(--color-mule-pod)"');
    expect(empty.match(/<svg/g)).toHaveLength(1);
    // Idle it breathes and blinks, legs still and straight.
    expect(energy).toContain('animate-[mule-breathe');
    expect(energy).toContain('animate-[mule-blink');
    expect(energy).not.toContain('animate-[mule-step');
    expect(energy).toContain('d="M11 26 L10.2 31 L11 35.5"');
    // Walking, its four legs swing in pairs and the body bobs.
    const walk = renderToStaticMarkup(createElement(Mule, { good: 'energy', state: 'walk' }));
    expect(walk.match(/animate-\[mule-step/g)).toHaveLength(4);
    expect(walk).toContain('animate-[mule-bob');
    expect(walk).not.toContain('animate-[mule-breathe');
    // Installed, it kneels (legs folded), its eye a closed curve, the pod pulsing; no breathing, no blinking.
    const kneel = renderToStaticMarkup(createElement(Mule, { good: 'energy', state: 'installed' }));
    expect(kneel).toContain('d="M11 27 l-3 4 l5 1"');
    expect(kneel).not.toContain('d="M11 26 L10.2 31 L11 35.5"');
    expect(kneel).toContain('d="M37.2 7.4 Q39.5 6.2 41.8 7.4"');
    expect(kneel).toContain('animate-[mule-work');
    expect(kneel).not.toMatch(/animate-\[mule-(breathe|blink|step|bob)/);
  });

  it('B-AC-16: an owned MULE wears a saddle cloth in its owner seat colour; a store MULE has none', () => {
    const owned = renderToStaticMarkup(createElement(Mule, { owner: 2 }));
    expect(owned).toContain(SADDLE);
    const cloth = owned.match(/<path[^>]*data-part="saddle"[^>]*>/)?.[0];
    expect(cloth).toContain(`fill="${SLOT_COLOR[2]}"`);
    expect(cloth).toContain('data-slot="2"');
    // Its antenna tips wear the seat's colour too.
    expect(owned.match(new RegExp(`<circle[^>]*fill="${SLOT_COLOR[2].replace(/[()]/g, '\\$&')}"`, 'g'))).toHaveLength(2);
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
    const me = { id: 'lena', slot: 0 as const };
    const empty = mulesIn(element(store({ me: { ...me, leading: 'empty' } }), 'visitor-lena'));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toContain('data-good="empty"');
    const lit = element(store({ me: { ...me, leading: 'energy' } }), 'visitor-lena');
    expect(mulesIn(lit)[0]).toContain('data-good="energy"');
    expect(lit).toContain('stop-color="var(--color-g-energy)"');
    expect(lit).toContain(SADDLE);
    // Your seat's colour: the cloth names your slot.
    expect(lit.match(/<path[^>]*data-part="saddle"[^>]*>/)?.[0]).toContain('data-slot="0"');
    expect(element(store({ me: { ...me, slot: 3, leading: 'energy' } }), 'visitor-lena').match(/<path[^>]*data-part="saddle"[^>]*>/)?.[0]).toContain('data-slot="3"');
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
