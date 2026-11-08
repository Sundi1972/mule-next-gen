import { EVENT_SHOW } from '@mule/engine';
import type { EventSabotageSeat } from '../src/index';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EVENT_ENTRY, EventLivingMap, EventShow, EventSoloRail, EventTvPhoneRail, eventScript, type MapTile, type ShowEventView, type ShowPlayer } from '../src/index';
import { stampAnchor } from '../src/events/stories-sabotage';

/**
 * S4-C17 (S4-PR-7, WS8): sabotage on the production show, as the viewer sees it. The approved mock is
 * design/mocks/politics-p2 @ d6977e1a (src/show/SabotageFx.tsx, P10Page.tsx), approved by Heiko on 8 Nov.
 * The events are sabotage.ts::sabotageEvents's: one per order done or caught, `sabotage {order, culprit, worked, guarded}`.
 */

const W = 9;
const H = 5;
const OSSA_PLOT = { x: 7, y: 1 };
const CORNER = { x: 8, y: 0 };
const STORE = { x: 4, y: 2 };
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  if (x === STORE.x && y === STORE.y) return { x, y, terrain: 'store', owner: null };
  if ((x === OSSA_PLOT.x && y === OSSA_PLOT.y) || (x === CORNER.x && y === CORNER.y)) return { x, y, terrain: 'plains', owner: 1, good: 'smithore' };
  return { x, y, terrain: 'plains', owner: null };
});
const players: ShowPlayer[] = [
  { id: 'lena', name: 'Lena', slot: 0 },
  { id: 'ossa', name: 'Ossa', slot: 1 },
  { id: 'brix', name: 'Brix', slot: 2 },
];
const INTRO = 1800;
type Sab = NonNullable<ShowEventView['sabotage']>;

/** A power cut as the server sends it (sabotage.ts: a plotEvent; a cut that did not work has no hits). */
const cut = (sabotage: Sab, at = OSSA_PLOT): ShowEventView => ({
  key: 'powerCut',
  kind: 'sabotage',
  title: 'Sabotage: power cut',
  line: sabotage.worked ? 'Someone cut the power to a Smithore plot: it makes nothing this month.' : sabotage.guarded ? 'Caught at a guarded plot: the power stays on.' : 'Caught! The saboteur is named.',
  sign: 'bad',
  scope: 'personal',
  origin: at,
  hits: sabotage.worked ? [{ ...at, order: 0, delta: -3 }] : [],
  phase: 'production',
  weight: EVENT_SHOW.weight.powerCut!,
  playMs: 7000,
  sabotage,
});

/** A market rumour (a storeEvent at the store); `good` and `dir` as the mock's fixture carries them. */
const rumour = (sabotage: Sab, dir: 'up' | 'down' = 'up'): ShowEventView => ({
  key: 'marketRumour',
  kind: 'sabotage',
  title: 'Sabotage: market rumour',
  line: sabotage.worked ? `A rumour: Food opens 25% ${dir === 'up' ? 'higher' : 'lower'} at the auction.` : 'Caught! The saboteur is named.',
  sign: 'bad',
  scope: 'colony',
  origin: STORE,
  hits: [],
  phase: 'production',
  weight: EVENT_SHOW.weight.marketRumour!,
  playMs: 7000,
  good: 'food',
  dir,
  sabotage,
});

const WORKED: Sab = { order: 'sab-a', culprit: null, worked: true, guarded: false };
const GUARDED: Sab = { order: 'sab-b', culprit: 'lena', worked: false, guarded: true };
const SEEN: Sab = { order: 'sab-c', culprit: 'lena', worked: true, guarded: false };
const RUMOUR: Sab = { order: 'sab-d', culprit: null, worked: true, guarded: false };
const RUMOUR_SEEN: Sab = { order: 'sab-e', culprit: 'lena', worked: false, guarded: false };

/** The segment's clock: `p` is the share of its play, as the mock's thresholds read it. */
function clock(ev: ShowEventView) {
  const s = eventScript({ events: [ev], introMs: INTRO }, 0, 'tv');
  const g = s.segments[0]!;
  return { at: (p: number) => g.playAt + p * (g.settleAt - g.playAt), before: g.playAt - 0.2, after: g.endAt + 2, end: s.end };
}

const tvMap = (ev: ShowEventView, t: number, reduced = false) =>
  renderToStaticMarkup(h(EventShow, { events: [ev], introMs: INTRO, t, mode: 'tv', reduced, width: W, height: H, tiles, players, children: h(EventLivingMap, { size: 'tv' }) }));

const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);
/** The words on the map, tags stripped. */
const words = (html: string) => html.replace(/<[^>]+>/g, ' ');

describe('S4-C17 · the catalogue and the weights', () => {
  it('powerCut moves on its plot and marketRumour at the store, each with the mock’s look in words', () => {
    expect(EVENT_ENTRY.powerCut.motion).toBe('plot');
    expect(EVENT_ENTRY.marketRumour.motion).toBe('store');
    expect(EVENT_ENTRY.powerCut.look).toMatch(/dark/);
    expect(EVENT_ENTRY.marketRumour.look).toMatch(/whisper/);
  });

  it('both play as headlines (EVENT_SHOW.weight, the spec’s line near 1140)', () => {
    expect(EVENT_SHOW.weight.powerCut).toBe('headline');
    expect(EVENT_SHOW.weight.marketRumour).toBe('headline');
  });
});

describe('S4-B-AC-2 · a cut that worked, unseen: the TV shows the plot dark and names nobody', () => {
  const ev = cut(WORKED);
  const c = clock(ev);

  it('nothing is drawn before the cut plays', () => {
    expect(has(tvMap(ev, c.before), 'fx-dark')).toBe(false);
  });

  it('a spark runs into the plot as the cut lands, then the plot is dark', () => {
    const early = tvMap(ev, c.at(0.2));
    expect(has(early, 'fx-spark')).toBe(true);
    const late = tvMap(ev, c.at(0.8));
    expect(has(late, 'fx-spark')).toBe(false);
    expect(has(late, 'fx-dark')).toBe(true);
  });

  it('the dark wash sits on the cut plot, and stays after its event, for the rest of production', () => {
    const after = tvMap(ev, c.after);
    expect(has(after, 'fx-dark')).toBe(true);
    // The plot's box on the map: x 7 of 9, y 1 of 5.
    expect(after).toContain(`left:${(7 / 9) * 100}%;top:20%`);
  });

  it('no guard, no searchlight, no stamp, and never a name, at any moment of the show', () => {
    for (const t of [c.at(0), c.at(0.2), c.at(0.5), c.at(0.9), c.after]) {
      const html = tvMap(ev, t);
      for (const id of ['fx-guard', 'fx-seen', 'fx-caught']) expect(has(html, id)).toBe(false);
      for (const name of ['Lena', 'Ossa', 'Brix']) expect(words(html)).not.toContain(name);
    }
  });
});

describe('S4-B-AC-1 · caught at a guarded plot: the shield, then "Caught!" with the saboteur’s name; the power stays on', () => {
  const ev = cut(GUARDED);
  const c = clock(ev);

  it('the guard’s shield flashes on the plot, never the searchlight, and no spark runs (the guard stops it)', () => {
    const html = tvMap(ev, c.at(0.3));
    expect(has(html, 'fx-guard')).toBe(true);
    expect(has(html, 'fx-seen')).toBe(false);
    expect(has(tvMap(ev, c.at(0.1)), 'fx-spark')).toBe(false);
  });

  it('then the stamp: "Caught!" and Lena', () => {
    const html = tvMap(ev, c.at(0.6));
    expect(has(html, 'fx-caught')).toBe(true);
    const stamp = html.slice(html.indexOf('data-testid="fx-caught"'));
    expect(words(stamp)).toContain('Caught!');
    expect(words(stamp)).toContain('Lena');
  });

  it('the plot never goes dark, and the stamp goes when its event is over', () => {
    for (const t of [c.at(0.3), c.at(0.8), c.after]) expect(has(tvMap(ev, t), 'fx-dark')).toBe(false);
    expect(has(tvMap(ev, c.after), 'fx-caught')).toBe(false);
  });
});

describe('S4-B-AC-1 · a cut that worked but was seen: dark, the searchlight and the stamp', () => {
  const ev = cut(SEEN);
  const c = clock(ev);

  it('the searchlight, not the shield, then the stamp naming Lena, over a dark plot', () => {
    const html = tvMap(ev, c.at(0.6));
    expect(has(html, 'fx-seen')).toBe(true);
    expect(has(html, 'fx-guard')).toBe(false);
    expect(has(html, 'fx-dark')).toBe(true);
    expect(words(html)).toContain('Lena');
  });
});

describe('S4-C17 · a market rumour: the whisper at the store, the price tag only when it took', () => {
  it('a rumour that took: the whisper, then the good’s tag tipping 25% up', () => {
    const ev = rumour(RUMOUR);
    const c = clock(ev);
    expect(has(tvMap(ev, c.at(0.2)), 'fx-whisper')).toBe(true);
    expect(has(tvMap(ev, c.at(0.2)), 'fx-price-tip')).toBe(false);
    const html = tvMap(ev, c.at(0.6));
    expect(has(html, 'fx-price-tip')).toBe(true);
    expect(words(html)).toContain('▲ +25%');
    expect(words(html)).not.toContain('Lena');
  });

  it('a rumour down tips the tag 25% down', () => {
    const ev = rumour(RUMOUR, 'down');
    expect(words(tvMap(ev, clock(ev).at(0.6)))).toContain('▼ −25%');
  });

  it('a rumour seen did not take: the whisper, no tag, and the stamp names Lena', () => {
    const ev = rumour(RUMOUR_SEEN);
    const html = tvMap(ev, clock(ev).at(0.6));
    expect(has(html, 'fx-whisper')).toBe(true);
    expect(has(html, 'fx-price-tip')).toBe(false);
    expect(has(html, 'fx-caught')).toBe(true);
    expect(words(html)).toContain('Lena');
  });

  it('the whisper is gone after its event', () => {
    const ev = rumour(RUMOUR);
    expect(has(tvMap(ev, clock(ev).after), 'fx-whisper')).toBe(false);
  });

  it('a rumour with no good in the view still whispers, with no tag (nothing to draw it from)', () => {
    const { good: _g, dir: _d, ...bare } = rumour(RUMOUR);
    const html = tvMap(bare, clock(bare).at(0.6));
    expect(has(html, 'fx-whisper')).toBe(true);
    expect(has(html, 'fx-price-tip')).toBe(false);
  });
});

describe('S4-C17 · reduced motion: end states only', () => {
  it('no flicker, no ping: the dark plot, the shield and the stamp as they end, from the start of the play', () => {
    for (const ev of [cut(WORKED), cut(GUARDED), cut(SEEN), rumour(RUMOUR), rumour(RUMOUR_SEEN)]) {
      const c = clock(ev);
      for (const t of [c.at(0.01), c.at(0.3), c.at(0.9)]) {
        const html = tvMap(ev, t, true);
        expect(html).not.toMatch(/animate-pulse|animate-ping/);
        expect(has(html, 'fx-spark')).toBe(false);
      }
    }
    const start = (ev: ShowEventView) => tvMap(ev, clock(ev).at(0.01), true);
    expect(has(start(cut(WORKED)), 'fx-dark')).toBe(true);
    expect(has(start(cut(GUARDED)), 'fx-guard')).toBe(true);
    expect(has(start(cut(GUARDED)), 'fx-caught')).toBe(true);
    expect(has(start(rumour(RUMOUR)), 'fx-price-tip')).toBe(true);
  });

  it('with motion, the dark plot flickers while the cut lands and is steady after', () => {
    const ev = cut(WORKED);
    const c = clock(ev);
    const dark = (t: number) => {
      const html = tvMap(ev, t);
      return html.slice(html.lastIndexOf('<', html.indexOf('data-testid="fx-dark"')), html.indexOf('data-testid="fx-dark"'));
    };
    expect(dark(c.at(0.3))).toContain('animate-pulse');
    expect(dark(c.after)).not.toContain('animate-pulse');
  });
});

describe('S4-C17 · the stamp stays inside the map (the mock’s overflowed near x = 14)', () => {
  it('a plot at the right or top edge draws its stamp on the map', () => {
    const ev = cut(GUARDED, CORNER);
    const html = tvMap(ev, clock(ev).at(0.6));
    expect(has(html, 'fx-caught')).toBe(true);
  });

  it('for every plot of every map width, a stamp up to the map’s width lies inside it, across its own plot', () => {
    for (const w of [9, 12, 15, 21]) {
      for (let x = 0; x < w; x++) {
        const a = stampAnchor(x, 0, w, 5);
        for (const share of [0.1, 0.4, 1]) {
          const left = a.left - a.shift * share;
          expect(left).toBeGreaterThanOrEqual(-1e-9);
          expect(left + share).toBeLessThanOrEqual(1 + 1e-9);
          // Some part of the stamp is over the plot it names.
          expect(left).toBeLessThanOrEqual((x + 1) / w + 1e-9);
          expect(left + share).toBeGreaterThanOrEqual(x / w - 1e-9);
        }
      }
    }
  });

  it('the top row’s stamp goes under its plot, every other row’s over it', () => {
    expect(stampAnchor(3, 0, 9, 5).below).toBe(true);
    for (let y = 1; y < 5; y++) expect(stampAnchor(3, y, 9, 5).below).toBe(false);
  });
});

describe('S4-C17 · each phone’s private line after the show (P10Page PHONE_LINES)', () => {
  /** The phone's rail once the event has settled, as `me` sees it; `seat` says which orders are theirs and whether they are Sheriff. */
  const rail = (ev: ShowEventView, me: string, seat?: EventSabotageSeat, solo = false) => {
    const t = clock(ev).at(1) + 0.1;
    const Rail = solo ? EventSoloRail : EventTvPhoneRail;
    return words(renderToStaticMarkup(h(EventShow, { events: [ev], introMs: INTRO, t, mode: solo ? 'solo' : 'tv', width: W, height: H, tiles, players, children: h(Rail, { me, ...(seat ? { sabotage: seat } : {}) }) })));
  };
  const lena: EventSabotageSeat = { mine: ['sab-a', 'sab-b', 'sab-c', 'sab-d', 'sab-e'], sheriff: false, reputation: { ban: 1, pacts: [] } };
  const brix = { mine: [], sheriff: true };
  const ossa = { mine: [], sheriff: false };

  it('a cut that worked, unseen: Lena’s crew, Ossa’s dark plot, Brix’s new case', () => {
    const ev = cut(WORKED);
    expect(rail(ev, 'lena', lena)).toContain('Your crew cut the power to Ossa’s smithore plot. Nobody saw. 120 cr at the month end.');
    expect(rail(ev, 'ossa', ossa)).toContain('Your smithore plot went dark: sabotage. It makes nothing this month.');
    expect(rail(ev, 'brix', brix)).toContain('A new case: a power cut on Ossa’s smithore plot. Investigate it in planning.');
  });

  it('the victim’s line needs nothing but the event: Ossa owns the plot', () => {
    expect(rail(cut(WORKED), 'ossa')).toContain('Your smithore plot went dark: sabotage.');
  });

  it('caught at a guarded plot', () => {
    const ev = cut(GUARDED);
    expect(rail(ev, 'lena', lena)).toContain('Caught by a guard at Ossa’s plot. −10 reputation; the Sheriff can fine you.');
    expect(rail(ev, 'ossa', ossa)).toContain('A guard caught Lena at your smithore plot. The power stayed on.');
    expect(rail(ev, 'brix', brix)).toContain('Your guard caught Lena at Ossa’s plot. Fine Lena in planning.');
  });

  it('a cut that worked but was seen', () => {
    const ev = cut(SEEN);
    expect(rail(ev, 'lena', lena)).toContain('The cut worked, but you were seen. −10 reputation; the Sheriff can fine you.');
    expect(rail(ev, 'ossa', ossa)).toContain('Your smithore plot went dark. Lena was seen doing it.');
    expect(rail(ev, 'brix', brix)).toContain('Lena was seen cutting Ossa’s power. Fine Lena in planning.');
  });

  it('rumours: Lena’s and the Sheriff’s lines; nobody else’s phone is told whose', () => {
    expect(rail(rumour(RUMOUR), 'lena', lena)).toContain('Your rumour took: Food opens 25% higher at the auction. Nobody saw.');
    expect(rail(rumour(RUMOUR), 'brix', brix)).toContain('A new case: a rumour on Food. Investigate it in planning.');
    expect(rail(rumour(RUMOUR_SEEN), 'lena', lena)).toContain('Your rumour was seen and did not take. −10 reputation; the Sheriff can fine you.');
    expect(rail(rumour(RUMOUR_SEEN), 'brix', brix)).toContain('Lena was seen starting a rumour on Food. Fine Lena in planning; it all goes to the fund.');
  });

  it('an unseen order never names its orderer on any other phone, nor on the orderer’s own without its seat', () => {
    for (const ev of [cut(WORKED), rumour(RUMOUR)]) {
      for (const [me, seat] of [['ossa', ossa], ['brix', brix], ['lena', undefined]] as const) {
        expect(rail(ev, me, seat)).not.toContain('Lena');
        expect(rail(ev, me, seat, true)).not.toContain('Lena');
      }
    }
  });

  it('a cut seen that did not work: the owner’s line, its good capitalised (WS6, 8 Nov)', () => {
    const ev = cut({ order: 'sab-f', culprit: 'lena', worked: false, guarded: false });
    expect(rail(ev, 'ossa', ossa)).toContain('Lena was seen at your Smithore plot. The power stayed on.');
  });

  it('the caught line counts the sabotage ban: ×2 doubles the loss', () => {
    const banned = { ...lena, reputation: { ban: 2, pacts: [] } };
    expect(rail(cut(GUARDED), 'lena', banned)).toContain('Caught by a guard at Ossa’s plot. −20 reputation; the Sheriff can fine you.');
    expect(rail(rumour(RUMOUR_SEEN), 'lena', banned)).toContain('Your rumour was seen and did not take. −20 reputation; the Sheriff can fine you.');
  });

  it('a pact with the victim costs its own 20 more, named; a rumour has no victim, so no pact', () => {
    const pact = { ...lena, reputation: { ban: 1, pacts: ['ossa'] } };
    expect(rail(cut(GUARDED), 'lena', pact)).toContain('Caught by a guard at Ossa’s plot. −10 reputation, and 20 more: your pact with Ossa; the Sheriff can fine you.');
    expect(rail(cut(SEEN), 'lena', { ...lena, reputation: { ban: 3, pacts: ['ossa'] } })).toContain('The cut worked, but you were seen. −30 reputation, and 20 more: your pact with Ossa; the Sheriff can fine you.');
    expect(rail(rumour(RUMOUR_SEEN), 'lena', pact)).toContain('−10 reputation; the Sheriff can fine you.');
    expect(rail(cut(GUARDED), 'lena', { ...lena, reputation: { ban: 1, pacts: ['brix'] } })).toContain('−10 reputation; the Sheriff');
  });

  it('a pact whose break the phone cannot place (an investigation broke it this month too): no number, never "20 more"', () => {
    const line = rail(cut(GUARDED), 'lena', { ...lena, reputation: { ban: 1, pacts: ['ossa'], unsure: ['ossa'] } });
    expect(line).toContain('Caught by a guard at Ossa’s plot. You lost reputation; the Sheriff can fine you.');
    expect(line).not.toContain('20 more');
  });

  it('a phone that cannot know the loss gives no number', () => {
    const { reputation: _r, ...unknown } = lena;
    const line = rail(cut(GUARDED), 'lena', unknown);
    expect(line).toContain('Caught by a guard at Ossa’s plot. You lost reputation; the Sheriff can fine you.');
    expect(line).not.toMatch(/−\d+ reputation/);
  });

  it('the phone alone says the same after the show', () => {
    expect(rail(cut(GUARDED), 'brix', brix, true)).toContain('Your guard caught Lena at Ossa’s plot. Fine Lena in planning.');
  });
});
