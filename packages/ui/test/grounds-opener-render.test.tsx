import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColonyGrounds, type ColonyGroundsProps, type GroundsColony, type GroundsManifest, type PictureStage } from '../src/index';
import { GroundsOpener, type OpenerState } from '../src/grounds/GroundsOpener';
import type { GroundsChange } from '../src/grounds/useGroundsChange';

const FRAME: GroundsManifest['frame'] = { width: 1600, height: 1600, place: 1293, centre: [800, 1000] };
const ALL: PictureStage[] = ['site', 'build1', 'build2', 'standing', 'closed', 'damaged'];
const MANIFEST: GroundsManifest = {
  frame: FRAME,
  pictures: Object.fromEntries(
    ['hall', 'park', 'hospital', 'stadium', 'spaceport'].map((kind) => [kind, Object.fromEntries(ALL.map((s) => [s, { day: `${kind}/${s}-day@800.webp`, dusk: `${kind}/${s}-dusk@800.webp`, glow: null }]))]),
  ),
  sizes: [800, 400],
};

const STADIUM_PLACE = { x: 3, y: 2, w: 2, h: 2 };
/** Month 12: the Stadium has just come to stand on its 2×2 east of the hall; the Park stands, the Hospital is closed. */
const MONTH_12: GroundsColony = {
  gauges: { happiness: 72, wealth: 2_000 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', buildMonths: 1, monthsLeft: null, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'closed', buildMonths: 2, monthsLeft: null, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'standing', buildMonths: 3, monthsLeft: null, place: STADIUM_PLACE },
  ],
};
const STADIUM_STANDS: GroundsChange = { id: 'stadium', name: 'Stadium', from: 'building', to: 'standing', place: STADIUM_PLACE };

const Scene = (props: Omit<ColonyGroundsProps, 'manifest'>) => <ColonyGrounds {...props} manifest={MANIFEST} />;
const opener = (state: OpenerState) => renderToStaticMarkup(<GroundsOpener opener={state} colony={MONTH_12} month={12} Scene={Scene} />);

/** What a screen reads: the markup's words, with the apostrophe React's server render escapes. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const root = (html: string) => html.match(/<[a-z]+[^>]*data-testid="tv-grounds-opener"[^>]*>/)?.[0] ?? '';
const caption = (html: string) => text(html.match(/<p[^>]*data-testid="opener-caption"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '');
const viewBox = (html: string) => {
  const [x, y, w, h] = html.match(/<svg[^>]*data-testid="colony-grounds"[^>]*>/)![0].match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number);
  return { x: x!, y: y!, w: w!, h: h! };
};
/** How large the scene is drawn on the 1280 × 720 TV canvas: the viewBox fitted inside it. */
const drawnAt = (vb: { w: number; h: number }) => Math.min(1280 / vb.w, 720 / vb.h);

describe('B-AC-6: the month-end opener on the TV, full-screen at dusk', () => {
  it('B-AC-6: a month the Stadium came to stand shows "New this month: the Stadium stands", leaning in on it, at dusk, no chips', () => {
    const html = opener({ kind: 'full', ms: 6_000, changes: [STADIUM_STANDS], baseline: true, playing: true });
    expect(root(html)).toContain('data-opener="full"');
    expect(root(html)).toContain('data-leaning="stadium"');
    expect(text(html)).toContain('End of month 12');
    expect(caption(html)).toBe('New this month: the Stadium stands.');
    expect(html).toContain('stadium/standing-dusk@800.webp');
    expect(html).not.toContain('-day@800.webp');
    expect(html).not.toContain('data-testid="callout-');
  });

  it('B-AC-6: full-screen, the built area fills the 16:9 canvas larger than the grounds’ own framing', () => {
    const html = opener({ kind: 'full', ms: 6_000, changes: [STADIUM_STANDS], baseline: true, playing: false });
    const framed = viewBox(html);
    expect(framed.w / framed.h).toBeCloseTo(1280 / 720, 3);
    const own = viewBox(renderToStaticMarkup(<Scene colony={MONTH_12} size="tv" />));
    expect(drawnAt(framed)).toBeGreaterThan(1.2 * drawnAt(own));
  });

  it('B-AC-6: leaning in, the view closes on the changed place and back out restores the built area', () => {
    const at = (lean: number) => viewBox(renderToStaticMarkup(<Scene colony={MONTH_12} size="tv" light="dusk" framing={{ aspect: 1280 / 720, leanOn: [STADIUM_PLACE], lean }} />));
    const out = at(0);
    const closed = at(1);
    expect(closed.w).toBeLessThan(0.7 * out.w);
    // The Stadium's 2×2 centre is one cell right and two cells down the screen from the hall's: (60, 60) in scene units.
    const centre = (b: typeof out) => [b.x + b.w / 2, b.y + b.h / 2];
    const [ox, oy] = centre(out);
    const [cx, cy] = centre(closed);
    expect(Math.hypot(cx! - 60, cy! - 60)).toBeLessThan(Math.hypot(ox! - 60, oy! - 60));
    expect(at(0)).toEqual(out);
  });

  it('T-AC-8: a quiet month shows the still: the grounds at dusk, no lean-in, its caption says nothing changed', () => {
    const html = opener({ kind: 'still', ms: 3_000, changes: [], baseline: true, playing: true });
    expect(root(html)).toContain('data-opener="still"');
    expect(root(html)).not.toContain('data-leaning');
    expect(caption(html)).toBe('Nothing new on the grounds this month.');
    expect(html).toContain('data-testid="colony-grounds"');
  });

  it('T-AC-7: the first month end a screen sees has no month end to diff: a neutral caption, not "nothing new", and no lean-in', () => {
    const html = opener({ kind: 'still', ms: 3_000, changes: [], baseline: false, playing: true });
    expect(root(html)).toContain('data-opener="still"');
    expect(root(html)).not.toContain('data-leaning');
    expect(caption(html)).toBe("The colony grounds at the month's end.");
  });

  it('T-AC-8: with reduced motion a changed month is the still: it names the change and does not lean in', () => {
    const html = opener({ kind: 'still', ms: 3_000, changes: [STADIUM_STANDS, { id: 'hospital', name: 'Hospital', from: 'standing', to: 'closed', place: null }], baseline: true, playing: true });
    expect(root(html)).toContain('data-opener="still"');
    expect(root(html)).not.toContain('data-leaning');
    expect(caption(html)).toBe('New this month: the Stadium stands and the Hospital closes.');
  });
});
