import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GridPlace } from '../src/grounds/layout';
import { WalkingScene, type Placed } from '../src/grounds/LiveLayer';
import { behindAny } from '../src/grounds/occlusion';
import type { Spot } from '../src/grounds/walks';

/** The town hall's block and the Hospital's, on the block south of it: the case Heiko saw (8 Nov). */
const HALL: GridPlace = { x: 2, y: 2, w: 1, h: 1 };
const HOSPITAL: GridPlace = { x: 2, y: 3, w: 1, h: 1 };
/** On the path along the Hospital's west side, halfway down it: behind the Hospital as the camera sees it. */
const BEHIND: Spot = [-0.5, 1];
/** On the path along its east side, halfway down: in front of it. */
const IN_FRONT: Spot = [0.5, 1];

const building = (id: string, depth: number): Placed => ({ depth, node: <g key={id} data-testid={id} /> });
const SCENE: Placed[] = [building('the-hall', 0), building('the-hospital', 1)];

/** The layer's markup with one colonist standing at `spot`, the buildings in their painter's order. */
function layer(spot: Spot): string {
  const scene: ReactElement = <WalkingScene scene={SCENE} walkers={1} rim={2.85} blocks={[HOSPITAL]} occluders={[HALL, HOSPITAL]} routes={[[spot, spot]]} />;
  return renderToStaticMarkup(<svg>{scene}</svg>);
}
const at = (html: string, testid: string) => html.indexOf(`data-testid="${testid}"`);

describe('T-AC-13: a colonist behind a building is hidden by it, with a faint outline; one in front draws over it', () => {
  it('T-AC-13: behind the Hospital, the colonist is drawn before it (so its picture hides the figure) and its faint outline after it', () => {
    const html = layer(BEHIND);
    expect(at(html, 'walker')).toBeGreaterThan(-1);
    expect(at(html, 'walker')).toBeLessThan(at(html, 'the-hospital'));
    expect(at(html, 'walker-ghost')).toBeGreaterThan(at(html, 'the-hospital'));
  });

  it('T-AC-13 (negative): in front of the Hospital, the colonist is drawn after it and has no outline', () => {
    const html = layer(IN_FRONT);
    expect(at(html, 'walker')).toBeGreaterThan(at(html, 'the-hospital'));
    expect(at(html, 'walker-ghost')).toBe(-1);
  });

  it('T-AC-13 (negative): out on the open paths, behind nothing, there is no outline', () => {
    expect(at(layer([2.5, 2.5]), 'walker-ghost')).toBe(-1);
  });
});

describe('behindAny', () => {
  it('T-AC-13: a ground point is behind a block when the line from it toward the camera crosses the block', () => {
    expect(behindAny(BEHIND, [HOSPITAL])).toBe(true);
    expect(behindAny([0, 0.5], [HOSPITAL])).toBe(true); // its north side
    expect(behindAny(IN_FRONT, [HOSPITAL])).toBe(false);
    expect(behindAny([0, 1.5], [HOSPITAL])).toBe(false); // its south side, facing the camera
    expect(behindAny([-2.5, 1], [HOSPITAL])).toBe(false); // far off to the side: the line never meets it
    expect(behindAny([-0.5, -0.5], [HALL])).toBe(true); // the hall's back corner
  });
});
