import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EVENT_ENTRY, EventLivingMap, EventShow, EventSoloRail, EventTvLog, EventTvPhoneRail, eventScript, eventStageAt, type MapTile, type ShowEventView, type ShowPlayer } from '../src/index';

/**
 * C11's display, at the show's own level: development's sick players are bulletins, and every bulletin of a phase
 * gathers into ONE roll call (RULE-1), played after the headlines and spotlights, as long as their shares together.
 */

const W = 9;
const H = 7;
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: i % W === 4 && Math.floor(i / W) === 3 ? 'store' : 'plains', owner: null }));
const players: ShowPlayer[] = [
  { id: 'lena', name: 'Lena', slot: 0 },
  { id: 'ossa', name: 'Ossa', slot: 1 },
  { id: 'brix', name: 'Brix', slot: 2 },
];

/** A sick player as the server sends one (the lead's contract): a bulletin with its share of the one roll call. */
const sick = (player: string, name: string, playMs: number): ShowEventView => ({
  key: 'sickness',
  kind: 'sickness',
  title: 'Sickness',
  line: `${name} fell sick: the air is Smoggy.`,
  sign: 'bad',
  scope: 'personal',
  player,
  origin: { x: 4, y: 3 },
  hits: [],
  phase: 'development',
  weight: 'bulletin',
  playMs,
});
const { player: _none, ...anyone } = sick('lena', 'Lena', 7000);
const headline: ShowEventView = { ...anyone, key: 'dustStorm', kind: 'storm', title: 'Dust storm', line: 'Dust.', scope: 'colony', weight: 'headline', from: 'w' };

const two = [sick('lena', 'Lena', 2000), sick('brix', 'Brix', 2000)];

describe('C11 · the roll call: every sick player in one segment (RULE-1)', () => {
  it('sickness is in the catalogue, moving on the colonists', () => {
    expect(EVENT_ENTRY.sickness.motion).toBe('colonists');
  });

  it('two sick players make ONE segment, as long as their shares together', () => {
    const s = eventScript({ events: two, introMs: 1800 }, 0, 'tv');
    expect(s.segments).toHaveLength(1);
    expect(s.segments[0]!.events.map((e) => e.player)).toEqual(['lena', 'brix']);
    expect(s.segments[0]!.startAt).toBeCloseTo(1.8);
    expect(s.segments[0]!.endAt).toBeCloseTo(5.8);
    expect(s.end).toBeCloseTo(5.8);
  });

  it('the roll call closes the phase: a bulletin fired before a headline still plays after it', () => {
    const s = eventScript({ events: [sick('lena', 'Lena', 2000), headline, sick('brix', 'Brix', 2000)], introMs: 1800 }, 0, 'tv');
    expect(s.segments.map((g) => g.events.map((e) => e.key))).toEqual([['dustStorm'], ['sickness', 'sickness']]);
    expect(s.segments.map((g) => [g.n, g.count])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(s.segments[0]!.endAt).toBeCloseTo(8.8);
    expect(s.segments[1]!.endAt).toBeCloseTo(12.8);
  });

  const show = (child: ReturnType<typeof h>, t: number, mode: 'tv' | 'solo' = 'tv', reduced = false) =>
    renderToStaticMarkup(h(EventShow, { events: two, introMs: 1800, t, mode, reduced, width: W, height: H, tiles, players, children: child }));

  it('the TV names each sick player once, in one roll call, with the sick tag on each colonist', () => {
    const s = eventScript({ events: two, introMs: 1800 }, 0, 'tv');
    const t = s.segments[0]!.settleAt + 0.01;
    const html = show(h(EventLivingMap, { size: 'tv' }), t);
    const roll = html.match(/data-testid="roll-call"[\s\S]*$/)?.[0] ?? '';
    expect(html.match(/data-testid="roll-call"/g)).toHaveLength(1);
    expect(roll.match(/>Lena</g)).toHaveLength(1);
    expect(roll.match(/>Brix</g)).toHaveLength(1);
    expect(roll).not.toContain('>Ossa<');
    expect(html).toContain('Sick this turn');
    // The sick tag pops onto the sick colonists only.
    expect(html).toMatch(/data-testid="colonist-lena"[^]*?data-testid="sick-tag"/);
    expect(html.match(/data-testid="colonist-[a-z]+"/g)).toEqual(['data-testid="colonist-lena"', 'data-testid="colonist-ossa"', 'data-testid="colonist-brix"']);
    expect(html.match(/data-testid="sick-tag"/g)).toHaveLength(2);
  });

  it('the TV log says the roll call in one line', () => {
    const s = eventScript({ events: two, introMs: 1800 }, 0, 'tv');
    const html = show(h(EventTvLog), s.end - 0.01);
    expect(html).toContain('Sickness ×2');
    expect(html).toContain('Lena and Brix walk at half pace');
  });

  it('a sick player’s phone says it is them; a well one says who is sick', () => {
    const s = eventScript({ events: two, introMs: 1800 }, 0, 'tv');
    const at = s.segments[0]!.settleAt + 0.01;
    const lena = show(h(EventTvPhoneRail, { me: 'lena' }), at);
    expect(lena).toContain('data-testid="phone-you"');
    expect(lena).toContain('You’re sick');
    expect(lena).toContain('You walk at half pace this turn. Why: the air is Smoggy.');
    const ossa = show(h(EventTvPhoneRail, { me: 'ossa' }), at);
    expect(ossa).toContain('data-testid="phone-miss"');
    expect(ossa).toContain('You’re well. Lena and Brix walk at half pace.');
    // While it is announced, the card names everyone in the roll call, once each.
    const news = show(h(EventTvPhoneRail, { me: 'ossa' }), s.segments[0]!.announceAt + 0.1);
    expect(news.match(/>Lena</g)).toHaveLength(1);
    expect(news.match(/>Brix</g)).toHaveLength(1);
  });

  it('HC-6: with reduced motion the roll call shows, the tags are on, and nothing sneezes or travels', () => {
    const s = eventScript({ events: two, introMs: 1800 }, 0, 'solo');
    const g = s.segments[0]!;
    for (const t of [g.playAt + 0.05, (g.playAt + g.settleAt) / 2, g.settleAt + 0.01]) {
      const html = show(h(EventLivingMap, { size: 'phone' }), t, 'solo', true);
      expect(html).toContain('data-testid="roll-call"');
      expect(html).not.toContain('vignette-sickness');
      expect(html).not.toContain('achoo');
      expect(html).not.toMatch(/animate-\[ev-/);
      expect(html.match(/data-testid="sick-tag"/g)?.length ?? 0).toBe(t > g.playAt + 0.2 * g.pace ? 2 : 0);
    }
    const solo = show(h(EventSoloRail, { me: 'brix' }), g.settleAt + 0.01, 'solo', true);
    expect(solo).toContain('You’re sick');
  });

  it('without reduced motion the colonist sneezes as its sickness lands', () => {
    const s = eventScript({ events: two, introMs: 1800 }, 0, 'tv');
    const g = s.segments[0]!;
    const frames = Array.from({ length: 40 }, (_, i) => g.playAt + ((g.settleAt - g.playAt) * i) / 40);
    expect(frames.some((t) => show(h(EventLivingMap, { size: 'tv' }), t).includes('achoo'))).toBe(true);
    expect(eventStageAt(s, g.playAt + 0.01).stage).toBe('play');
  });
});
