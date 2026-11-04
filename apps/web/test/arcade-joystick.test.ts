import { document, FakeElement } from './fake-dom';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StickAt } from '@mule/ui';

/**
 * C11, WS4's review: the thumb that took the stick steers it. A second finger crossing the pad is another pointer, and
 * moves nothing. Mounted into the fake DOM; the pointer events are React's handlers called as a browser would.
 */

let Joystick: ComponentType<{ onStick: (at: StickAt) => void; size?: number }>;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ Joystick } = await import('@mule/ui'));
  // A 128 px pad at the page's corner.
  (FakeElement.prototype as unknown as { getBoundingClientRect(): object }).getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 128, bottom: 128, width: 128, height: 128 });
});

let root: Root | null = null;
const host = document.createElement('div');

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function find(testid: string, node: FakeElement = host): FakeElement | undefined {
  if (node.getAttribute('data-testid') === testid) return node;
  for (const c of node.childNodes) {
    const hit = c instanceof FakeElement ? find(testid, c) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** The handlers React gave a mounted element. */
function handlers(el: FakeElement): Record<string, (e: object) => void> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'))!;
  return (el as unknown as Record<string, Record<string, (e: object) => void>>)[key]!;
}

describe('C11: the joystick', () => {
  it('C11: it follows only the pointer that took it: a second finger crossing the pad moves nothing, and only its own lift lets go', () => {
    const seen: StickAt[] = [];
    root = createRoot(host as unknown as HTMLElement);
    act(() => root!.render(createElement(Joystick, { onStick: (at) => seen.push(at) })));
    const pad = find('joystick')!;
    const on = handlers(pad);
    const at = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, clientX, clientY, altKey: false, currentTarget: { setPointerCapture: () => {} } });
    act(() => on.onPointerDown!(at(1, 128, 64)));
    expect(seen.at(-1)).toEqual({ x: 1, y: 0 });
    // Finger 2 crosses the pad: ignored, moving or lifting.
    act(() => on.onPointerMove!(at(2, 64, 0)));
    act(() => on.onPointerUp!(at(2, 64, 0)));
    expect(seen).toHaveLength(1);
    // Finger 1 moves: followed; lifts: let go.
    act(() => on.onPointerMove!(at(1, 64, 128)));
    expect(seen.at(-1)).toEqual({ x: 0, y: 1 });
    act(() => on.onPointerUp!(at(1, 64, 128)));
    expect(seen.at(-1)).toBeNull();
  });
});
