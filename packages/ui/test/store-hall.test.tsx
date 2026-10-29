import { DEV_STEER, HALL, WOLVES, type HallRect } from '@mule/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cycleSeconds, StoreInterior, type Condition, type GaitInput, type StoreInteriorProps, type Visitor } from '../src/index';

/** A box in % of the hall: left, top, width, height. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const hall = (props: Partial<StoreInteriorProps> = {}) => renderToStaticMarkup(<StoreInterior mules={4} mulePrice={142} prices={{}} {...props} />);

/** The opening tag of the one element carrying this attribute, such as data-testid="booth-pub". */
function tagWith(html: string, attr: string): string {
  const tags = html.match(new RegExp(`<[a-z]+[^>]*\\s${attr}[^>]*>`, 'g')) ?? [];
  expect(tags, `one element with ${attr}`).toHaveLength(1);
  return tags[0]!;
}

/** A tag's inline style as numbers, for the properties given in % (left, right, top, width, height). */
function pctStyle(tag: string): Record<string, number> {
  const style = tag.match(/\sstyle="([^"]*)"/)?.[1] ?? '';
  const out: Record<string, number> = {};
  for (const decl of style.split(';')) {
    const m = decl.match(/^\s*([a-z-]+)\s*:\s*(-?[\d.e-]+)%\s*$/);
    if (m) out[m[1]!] = Number(m[2]);
  }
  return out;
}

/**
 * A positioned box from its style, in % of its parent; a box anchored on the right has its left worked out. A row's
 * band spans the hall's width (inset-x-0) and gives only its top and height.
 */
function boxOf(tag: string, across = false): Box {
  const s = pctStyle(tag);
  if (across) return { left: 0, top: s.top!, width: 100, height: s.height! };
  expect(s.width, `a width in % on ${tag}`).toBeDefined();
  const left = s.left ?? 100 - s.right! - s.width!;
  return { left, top: s.top ?? 0, width: s.width!, height: s.height ?? 100 };
}

/** A box inside another, both in % of their parents, as % of the outer one's parent. */
const within = (outer: Box, inner: Box): Box => ({
  left: outer.left + (inner.left * outer.width) / 100,
  top: outer.top + (inner.top * outer.height) / 100,
  width: (inner.width * outer.width) / 100,
  height: (inner.height * outer.height) / 100,
});

/** HALL's box in hall units, mapped to % of the hall as StoreInterior draws it. */
const pctOf = (r: HallRect): Box => ({ left: (r.x0 / HALL.w) * 100, top: (r.y0 / HALL.h) * 100, width: ((r.x1 - r.x0) / HALL.w) * 100, height: ((r.y1 - r.y0) / HALL.h) * 100 });

function expectBox(actual: Box, expected: Box, what: string) {
  for (const k of ['left', 'top', 'width', 'height'] as const) expect(Math.abs(actual[k] - expected[k]), `${what}: ${k} ${actual[k]} vs ${expected[k]}`).toBeLessThan(0.01);
}

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const;
const FRONT = ['works', 'greenBelt', 'corral', 'pub'] as const;
const BAYS = ['alloy', 'electronics', 'medicine'] as const;

/** Where the hall draws each room, bay and door, in % of the hall. */
function drawn(html: string) {
  const top = boxOf(tagWith(html, 'data-testid="row-outfitters"'), true);
  const bottom = boxOf(tagWith(html, 'data-testid="row-services"'), true);
  const room = (r: string) => within((OUTFITTERS as readonly string[]).includes(r) ? top : bottom, boxOf(tagWith(html, `data-testid="booth-${r}"`)));
  // A bay's columns are cut across the works; its depth is the works' body under the label.
  const bay = (b: string) => {
    const works = room('works');
    const col = boxOf(tagWith(html, `data-bay="${b}"`));
    return { left: works.left + (col.left * works.width) / 100, width: (col.width * works.width) / 100 };
  };
  const door = (d: 'L' | 'R') => within(bottom, boxOf(tagWith(html, `data-testid="door-${d}"`)));
  return { room, bay, door };
}

describe('C2: the store hall draws the engine’s one plan', () => {
  it("C2: StoreInterior's rooms stand where the hall plan puts them", () => {
    const { room, bay, door } = drawn(hall());
    for (const r of [...OUTFITTERS, ...FRONT]) expectBox(room(r), pctOf(HALL.rooms[r]), `room ${r}`);
    for (const b of BAYS) {
      const want = pctOf(HALL.bays[b]);
      const got = bay(b);
      expect(Math.abs(got.left - want.left), `bay ${b} left`).toBeLessThan(0.01);
      expect(Math.abs(got.width - want.width), `bay ${b} width`).toBeLessThan(0.01);
    }
    expectBox(door('L'), pctOf(HALL.doors.doorL), 'doorL');
    expectBox(door('R'), pctOf(HALL.doors.doorR), 'doorR');

    // The approved hall's own numbers (WS6 PR-4/PR-10), not re-derived: the plan moved nothing.
    expectBox(room('pub'), { left: 74, top: 60, width: 17, height: 37 }, 'the pub as approved');
    expectBox(room('food'), { left: 9.4, top: 3, width: 82 / 6 - 0.8, height: 36 }, 'the Food outfitter as approved');
    expect(bay('alloy').left).toBeCloseTo(9, 2);
    expect(bay('electronics').left).toBeCloseTo(18, 2);
    expect(bay('medicine').left).toBeCloseTo(27, 2);
    for (const b of BAYS) expect(bay(b).width).toBeCloseTo(9, 2);
    expectBox(door('L'), { left: 0.6, top: 30, width: 7, height: 40 }, 'the left airlock as approved');
    expectBox(door('R'), { left: 92.4, top: 30, width: 7, height: 40 }, 'the right airlock as approved');
  });

  it('C2: a visitor with no position stands at its place’s spot; with x, y it stands there', () => {
    const me = (v: Partial<Visitor>): Visitor => ({ id: 'lena', slot: 0, leading: null, ...v });
    const at = (v: Visitor) => {
      const s = pctStyle(tagWith(hall({ me: v }), 'data-testid="visitor-lena"'));
      return { x: s.left!, y: s.top! };
    };
    const spot = (p: keyof typeof HALL.spots) => ({ x: (HALL.spots[p].x / HALL.w) * 100, y: (HALL.spots[p].y / HALL.h) * 100 });
    const cases: [string, Visitor, { x: number; y: number }, { x: number; y: number }][] = [
      ['no MULE: in the left door', me({ leading: null }), spot('doorL'), { x: 4.5, y: 50 }],
      ['an empty MULE: at the corral', me({ leading: 'empty' }), spot('corral'), { x: 60, y: 54 }],
      ['a Water MULE: at its outfitter', me({ leading: 'water' }), spot('water'), { x: 9 + (82 / 6) * 1.5, y: 46 }],
      ['a green belt: at the green belt', me({ leading: 'greenBelt' }), spot('greenBelt'), { x: 41.5, y: 54 }],
      // A factory MULE stands at its own bay now, no longer mid-works (22.5 %).
      ['a Medicine MULE: at the medicine bay', me({ leading: 'medicine' }), spot('medicine'), { x: 31.5, y: 54 }],
      ['a free position wins over the place', me({ leading: 'medicine', x: 8, y: 6 }), { x: 50, y: 50 }, { x: 50, y: 50 }],
      ['a free position at the hall’s corner', me({ leading: null, x: 0, y: 12 }), { x: 0, y: 100 }, { x: 0, y: 100 }],
    ];
    for (const [what, v, plan, literal] of cases) {
      const got = at(v);
      expect(Math.abs(got.x - plan.x), `${what}: x ${got.x} vs the plan's ${plan.x}`).toBeLessThan(0.01);
      expect(Math.abs(got.y - plan.y), `${what}: y ${got.y} vs the plan's ${plan.y}`).toBeLessThan(0.01);
      expect(Math.abs(got.x - literal.x), `${what}: x ${got.x} vs ${literal.x}`).toBeLessThan(0.01);
      expect(Math.abs(got.y - literal.y), `${what}: y ${got.y} vs ${literal.y}`).toBeLessThan(0.01);
    }
  });
});

describe('AM-16: the hall walks with the gait', () => {
  /** Lena on 2 of the 5 Food she needs (engine hungerPace 0.52), leading an empty MULE. */
  const HUNGRY: Condition = { foodShare: 0.4, sick: false, conditionPace: 0.52 };
  const lena = (moving: boolean, x?: number): Visitor => ({ id: 'lena', slot: 0, leading: 'empty', condition: HUNGRY, moving, ...(x === undefined ? {} : { x, y: 6 }) });
  const gait: GaitInput = { moving: true, encounter: null, pace: 0.52, terrain: 1, lead: true, bitten: false, leadPace: DEV_STEER.leadPace, bittenPace: WOLVES.bittenPace, lungeSeconds: WOLVES.lungeEverySeconds };

  /** The creature's motion wrapper and every timed part of the MULE it leads. */
  function walker(html: string) {
    const start = html.indexOf(tagWith(html, 'data-testid="visitor-lena"'));
    const visitor = html.slice(start);
    const creature = visitor.match(/<span[^>]*class="cm [^"]*"[^>]*>/)?.[0];
    const mule = visitor.match(/<svg[^>]*data-mule-state="[^"]*"[^>]*>/)?.[0];
    const strides = [...visitor.matchAll(/animation-duration:([\d.]+)s/g)].map((m) => Number(m[1]));
    return { visitor, creature, mule, strides };
  }

  it('AM-16: the walking colonist and its MULE share one stride, from the gait', () => {
    const stride = cycleSeconds(gait);
    // 0.5 s at full speed, slowed by hunger (0.52) and the lead (0.9): one stride covers the same ground.
    expect(stride).toBeCloseTo(0.5 / (0.52 * 0.9), 6);

    const moving = walker(hall({ me: lena(true) }));
    expect(moving.creature, 'the creature walks in its motion wrappers').toBeDefined();
    expect(moving.creature).toContain('data-motion="walk"');
    expect(Number(moving.creature!.match(/--cycle:([\d.]+)s/)?.[1])).toBeCloseTo(stride, 3);
    expect(moving.mule).toContain('data-mule-state="walk"');
    expect(moving.strides.length, 'the MULE strides on the colonist’s cycle').toBeGreaterThan(0);
    for (const s of moving.strides) expect(s).toBeCloseTo(stride, 6);
    expect(moving.visitor).not.toContain('store-waddle');

    // Walking on the hall's right half it faces left, the way it heads back to the doors.
    expect(walker(hall({ me: lena(true, 12) })).creature).toContain('data-facing="left"');
    expect(walker(hall({ me: lena(true, 2) })).creature).toContain('data-facing="right"');

    // Standing, nothing walks: no walk motion, the MULE idle, no stride, no waddle.
    const idle = walker(hall({ me: lena(false) }));
    expect(idle.visitor).not.toContain('data-motion="walk"');
    expect(idle.mule).toContain('data-mule-state="idle"');
    expect(idle.strides).toEqual([]);
    expect(idle.visitor).not.toContain('store-waddle');
  });
});
