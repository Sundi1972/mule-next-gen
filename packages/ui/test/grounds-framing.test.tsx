import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type GroundsColony, type GroundsManifest, type PictureStage } from '../src/index';
import type { GridPlace } from '../src/grounds/layout';
import { iso, W, type Pt } from '../src/grounds/projection';
import { METRE } from '../src/grounds/walks';

type Frame = GroundsManifest['frame'];
type Box = { x: number; y: number; w: number; h: number };

const FRAME: Frame = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
/** The 2×2 kinds' own frames, as the renderer publishes them: the Spaceport's is tall enough for its rocket. */
const STADIUM_FRAME: Frame = { width: 3200, height: 2600, place: 1293, centre: [1600, 1900] };
const SPACEPORT_FRAME: Frame = { width: 3200, height: 3500, place: 1293, centre: [1600, 2800] };
const FRAMES: Record<string, Frame> = { stadium: STADIUM_FRAME, spaceport: SPACEPORT_FRAME };
const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];
/** Scene units per picture pixel. */
const K = W / FRAME.place;

const PLATE_5 = { width: 10240, height: 5760, hall: [5120, 3853] as [number, number] };
const PLATE = {
  '3': { day: 'plate/3-day@800.webp', dusk: 'plate/3-dusk@800.webp', glow: null, frame: { width: 6144, height: 3456, hall: [3072, 2074] as [number, number] } },
  '5': { day: 'plate/5-day@800.webp', dusk: 'plate/5-dusk@800.webp', glow: 'plate/5-glow@800.webp', frame: PLATE_5 },
};
const PLATE_BOX: Box = { x: -PLATE_5.hall[0] * K, y: -PLATE_5.hall[1] * K, w: PLATE_5.width * K, h: PLATE_5.height * K };

const PICTURES: GroundsManifest['pictures'] = Object.fromEntries(
  ['hall', 'park', 'hospital', 'observatory', 'stadium', 'spaceport'].map((kind) => [
    kind,
    { ...Object.fromEntries(ALL.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: null }])), ...(FRAMES[kind] && { frame: FRAMES[kind] }) },
  ]),
);
const WITHOUT_PLATE: GroundsManifest = { frame: FRAME, pictures: PICTURES, sizes: [800, 400] };
const WITH_PLATE = { ...WITHOUT_PLATE, plate: PLATE } as GroundsManifest;

/** The month-12 colony of design/mocks/colony-grounds/src/tvbeat/TvBeat.tsx. */
const MONTH_12: GroundsColony = {
  gauges: { happiness: 72, wealth: 2_000 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', monthsLeft: null, buildMonths: 1, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'standing', monthsLeft: null, buildMonths: 2, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'standing', monthsLeft: null, buildMonths: 3, place: { x: 3, y: 2, w: 2, h: 2 } },
    { id: 'spaceport', name: 'Spaceport', stage: 'building', monthsLeft: 1, buildMonths: 3, place: { x: 2, y: 0, w: 2, h: 2 } },
    { id: 'observatory', name: 'Observatory', stage: 'commissioned', monthsLeft: null, buildMonths: 2, place: { x: 1, y: 1, w: 1, h: 1 } },
  ],
};
const HALL: GridPlace = { x: 2, y: 2, w: 1, h: 1 };

/** look.html's whole-colony render at 1280 wide: its hall and Hospital are each about 200 px across. */
const LOOK_PX_PER_M = 17.5;
const TV = 16 / 9;

const render = (props: Partial<Parameters<typeof ColonyGrounds>[0]> = {}) =>
  renderToStaticMarkup(<ColonyGrounds colony={MONTH_12} size="tv" manifest={WITH_PLATE} light="dusk" chips={false} framing={{ aspect: TV }} {...props} />);

function tagsWith(html: string, attr: string): string[] {
  return html.match(new RegExp(`<[a-zA-Z]+[^>]*\\s${attr}[^>]*>`, 'g')) ?? [];
}
const attrOf = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
function viewBoxOf(html: string): Box {
  const [x, y, w, h] = attrOf(tagsWith(html, 'data-testid="colony-grounds"')[0]!, 'viewBox')!.split(' ').map(Number);
  return { x: x!, y: y!, w: w!, h: h! };
}
const pxPerMetre = (vb: Box, screenWidth: number) => (screenWidth / vb.w) * METRE;

const blocksOf = (colony: GroundsColony) => [HALL, ...colony.projects.flatMap((p) => (p.place ? [p.place] : []))];
const kindAt = (colony: GroundsColony, block: GridPlace) => colony.projects.find((p) => p.place === block)?.id ?? 'hall';

/** A block's ground corners on screen: back, right, front, left. */
function footprint({ x, y, w, h }: GridPlace): Pt[] {
  const [c0, r0, c1, r1] = [x - 2.5, y - 2.5, x + w - 2.5, y + h - 2.5];
  return [iso(c0, r0), iso(c1, r0), iso(c1, r1), iso(c0, r1)];
}
const centre = ({ x, y, w, h }: GridPlace): Pt => iso(x + w / 2 - 2.5, y + h / 2 - 2.5);
/** How high a kind's picture can reach above its block's centre: its frame's top edge. */
function topOf(kind: string, block: GridPlace): number {
  const frame = FRAMES[kind] ?? FRAME;
  return centre(block)[1] - frame.centre[1] * (W / frame.place);
}

const inside = ([x, y]: Pt, b: Box, eps = 1e-6) => x >= b.x - eps && x <= b.x + b.w + eps && y >= b.y - eps && y <= b.y + b.h + eps;
const within = (a: Box, b: Box, eps = 1e-6) => a.x >= b.x - eps && a.y >= b.y - eps && a.x + a.w <= b.x + b.w + eps && a.y + a.h <= b.y + b.h + eps;

/** The polygon's part inside the box (Sutherland–Hodgman), and a polygon's area. */
function clip(poly: Pt[], b: Box): Pt[] {
  const edges: [(p: Pt) => boolean, (p: Pt, q: Pt) => Pt][] = [
    [(p) => p[0] >= b.x, (p, q) => [b.x, p[1] + ((q[1] - p[1]) * (b.x - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= b.x + b.w, (p, q) => [b.x + b.w, p[1] + ((q[1] - p[1]) * (b.x + b.w - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= b.y, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y - p[1])) / (q[1] - p[1]), b.y]],
    [(p) => p[1] <= b.y + b.h, (p, q) => [p[0] + ((q[0] - p[0]) * (b.y + b.h - p[1])) / (q[1] - p[1]), b.y + b.h]],
  ];
  return edges.reduce((pts, [keep, cross]) => {
    const out: Pt[] = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      if (keep(p)) out.push(p);
      if (keep(p) !== keep(q)) out.push(cross(p, q));
    });
    return out;
  }, poly);
}
const area = (poly: Pt[]) => Math.abs(poly.reduce((s, [x, y], i) => s + x * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * y, 0)) / 2;

/** The share of the view taken by the 5×5 grid's places that no block covers. */
function emptyShare(colony: GroundsColony, vb: Box): number {
  const taken = (gx: number, gy: number) => blocksOf(colony).some((b) => gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h);
  let empty = 0;
  for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 5; gy++) if (!taken(gx, gy)) empty += area(clip(footprint({ x: gx, y: gy, w: 1, h: 1 }), vb));
  return empty / (vb.w * vb.h);
}

function expectWhole(colony: GroundsColony, vb: Box) {
  for (const block of blocksOf(colony)) {
    const kind = kindAt(colony, block);
    for (const corner of footprint(block)) expect(inside(corner, vb), `${kind}'s footprint`).toBe(true);
    expect(inside([centre(block)[0], topOf(kind, block)], vb), `${kind}'s top`).toBe(true);
  }
}

describe('T-AC-11: the grounds frame the occupied extent like look.html (spec AM-7 iv)', () => {
  it("T-AC-11: at 1280×720 the month-12 colony draws at look.html's scale", () => {
    const vb = viewBoxOf(render());
    expect(vb.w / vb.h).toBeCloseTo(TV, 6);
    // The rocket's frame top to the Stadium's front corner is 410 units; a quarter place above and below leaves 0.9× in
    // reach at 16:9, half a place would not (0.876×).
    expect(pxPerMetre(vb, 1280)).toBeGreaterThanOrEqual(0.9 * LOOK_PX_PER_M);
    expect(pxPerMetre(vb, 1280)).toBeLessThanOrEqual(1.1 * LOOK_PX_PER_M);
  });

  it('T-AC-11: empty places fill at most a third of the framed view', () => {
    expect(emptyShare(MONTH_12, viewBoxOf(render()))).toBeLessThanOrEqual(1 / 3);
  });

  it('T-AC-11: the rocket and every building stay whole', () => {
    expectWhole(MONTH_12, viewBoxOf(render()));
  });

  it('T-AC-11: the view never leaves the plate', () => {
    for (const aspect of [TV, 4 / 3, 21 / 9]) {
      const vb = viewBoxOf(render({ framing: { aspect } }));
      expect(vb.w / vb.h, `aspect ${aspect}`).toBeCloseTo(aspect, 6);
      expect(within(vb, PLATE_BOX), `aspect ${aspect}`).toBe(true);
    }
    // The Spaceport on the back 2×2 and the Stadium on the front one reach past the plate's top and bottom.
    const spread: GroundsColony = {
      ...MONTH_12,
      projects: [
        { ...MONTH_12.projects[2]!, place: { x: 3, y: 3, w: 2, h: 2 } },
        { ...MONTH_12.projects[3]!, place: { x: 0, y: 0, w: 2, h: 2 } },
      ],
    };
    const vb = viewBoxOf(render({ colony: spread }));
    expect(within(vb, PLATE_BOX)).toBe(true);
    expect(vb.h, 'shrunk to the plate').toBeCloseTo(PLATE_BOX.h, 6);
    expect(tagsWith(render({ colony: spread }), 'data-testid="grounds-vignette"'), "the plate's own vignette shows").toHaveLength(0);
  });

  it("T-AC-11: the opener's lean-in stays inside the framed view", () => {
    const framed = viewBoxOf(render());
    const leaned = viewBoxOf(render({ framing: { aspect: TV, leanOn: [MONTH_12.projects[2]!.place!], lean: 1 } }));
    expect(leaned.w).toBeCloseTo(framed.w / 1.55, 6);
    expect(within(leaned, framed)).toBe(true);
  });

  it("T-AC-11: on the phone the same colony, at the phone card's aspect, stays whole and inside the plate", () => {
    const vb = viewBoxOf(render({ size: 'phone', framing: undefined, light: 'day', chips: true }));
    expect(vb.w / vb.h, "the card keeps the plate's aspect").toBeCloseTo(PLATE_BOX.w / PLATE_BOX.h, 6);
    expectWhole(MONTH_12, vb);
    expect(within(vb, PLATE_BOX)).toBe(true);
    expect(emptyShare(MONTH_12, vb)).toBeLessThanOrEqual(1 / 3);
  });

  it("T-AC-11: a soft elliptical vignette fades the framed view's ground to the page background, under every building", () => {
    const html = render();
    const vb = viewBoxOf(html);
    const veil = tagsWith(html, 'data-testid="grounds-vignette"');
    expect(veil).toHaveLength(1);
    expect(attrOf(veil[0]!, 'pointer-events')).toBe('none');
    expect([attrOf(veil[0]!, 'x'), attrOf(veil[0]!, 'y'), attrOf(veil[0]!, 'width'), attrOf(veil[0]!, 'height')].map(Number)).toEqual([vb.x, vb.y, vb.w, vb.h]);
    const at = (testid: string) => html.indexOf(`data-testid="${testid}"`);
    expect(at('plate'), 'over the plate').toBeLessThan(at('glow-plate'));
    expect(at('glow-plate'), "over the plate's glow").toBeLessThan(at('grounds-vignette'));
    expect(at('grounds-vignette'), 'under every building').toBeLessThan(html.indexOf('data-testid="picture-'));
    expect(at('grounds-vignette'), 'under every colonist').toBeLessThan(at('walker'));

    const id = attrOf(veil[0]!, 'fill')!.match(/^url\(#(.+)\)$/)![1]!;
    const gradient = html.match(new RegExp(`<radialGradient[^>]*id="${id}"[^>]*>([\\s\\S]*?)</radialGradient>`))!;
    expect([attrOf(gradient[0], 'cx'), attrOf(gradient[0], 'cy')]).toEqual(['0.5', '0.5']);
    const stops = (gradient[1]!.match(/<stop[^>]*>/g) ?? []).map((s) => ({ opacity: Number(attrOf(s, 'stop-opacity')), colour: attrOf(s, 'stop-color') }));
    for (const s of stops) expect(s.colour, 'the page background token').toBe('var(--color-table)');
    expect(stops[0]!.opacity, 'clear in the middle').toBe(0);
    expect(stops.at(-1)!.opacity, 'opaque at the rim').toBe(1);
  });

  it('T-AC-11: with chips the vignette stays under them', () => {
    const html = render({ chips: true });
    expect(html.indexOf('data-testid="grounds-vignette"')).toBeLessThan(html.indexOf('data-testid="callout-'));
  });

  it('HC-3: without a plate, framing is unchanged', () => {
    const cases = [{ framing: undefined }, { framing: { aspect: TV } }, { framing: { aspect: TV, leanOn: [MONTH_12.projects[2]!.place!], lean: 1 } }];
    cases.forEach((props, i) => {
      const html = render({ manifest: WITHOUT_PLATE, ...props });
      expect(tagsWith(html, 'data-testid="grounds-vignette"')).toHaveLength(0);
      const vb = viewBoxOf(html);
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(vb[k], `case ${i} ${k}`).toBeCloseTo(PINNED[i]![k], 6);
    });
  });
});

/** Today's no-plate viewBoxes for the month-12 colony: the land; the built area at 16:9; leaned in on the Stadium. */
const PINNED: Box[] = [
  { x: -384, y: -324, w: 768, h: 528 },
  { x: -433.0194379994844, y: -312.0038283062645, w: 866.0388759989688, h: 487.14686774942 },
  { x: -219.36737935450606, y: -139.14526233066385, w: 558.7347587090121, h: 314.28830177381934 },
];
