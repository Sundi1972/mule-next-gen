import { document, FakeElement } from './fake-dom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isMoment, TV_MOMENT_MS, useMoment } from '../src/table/moments';

/*
 * A TV moment (moments.ts; WS6 ruling 8 Nov, PM ruling 8 Nov): an event the screen sees arrive holds it for TV_MOMENT_MS
 * of server time, then folds. The event the screen opens on is old news, and one that leaves the screen has had its moment.
 */

describe('a TV moment (moments.ts)', () => {
  it(`is a moment for ${TV_MOMENT_MS} ms of server time from when the screen first saw it; never when it was there already`, () => {
    expect(TV_MOMENT_MS).toBe(8000);
    expect(isMoment(1000, 1000)).toBe(true);
    expect(isMoment(1000, 1000 + TV_MOMENT_MS - 1)).toBe(true);
    expect(isMoment(1000, 1000 + TV_MOMENT_MS)).toBe(false);
    expect(isMoment(null, 1000)).toBe(false);
    expect(isMoment(undefined, 1000)).toBe(false);
  });

  describe('useMoment, mounted', () => {
    let root: Root | null = null;
    const host = document.createElement('div') as unknown as FakeElement;
    beforeAll(() => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });
    afterEach(() => {
      const r = root;
      if (r) act(() => r.unmount());
      root = null;
    });
    const seen: boolean[] = [];
    function Probe({ k, now }: { k: string | null; now: number }) {
      seen.push(useMoment(k, now));
      return null;
    }
    const show = (k: string | null, now: number) => act(() => root!.render(createElement(Probe, { k, now })));

    it('an event that arrives while the screen is up is a moment until its time is up; one it opened on never is', () => {
      root = createRoot(host as unknown as Element);
      seen.length = 0;
      show('break:4:deal-k', 0);
      show('break:4:deal-k', 100);
      expect(seen.every((m) => !m), 'opened on: old news').toBe(true);
      seen.length = 0;
      show(null, 200);
      show('break:5:deal-o', 1000);
      show('break:5:deal-o', 1000 + TV_MOMENT_MS - 1);
      show('break:5:deal-o', 1000 + TV_MOMENT_MS);
      expect(seen).toEqual([false, true, true, false]);
    });

    it('an event that leaves the screen and comes back is not a moment twice, even inside its time', () => {
      root = createRoot(host as unknown as Element);
      seen.length = 0;
      show(null, 0);
      show('break:4:deal-k', 1000);
      show(null, 2000);
      // Back inside its first time, and again after it: neither is a moment.
      show('break:4:deal-k', 3000);
      show(null, 4000);
      show('break:4:deal-k', 20_000);
      // Another event is a moment of its own.
      show(null, 21_000);
      show('break:4:deal-o', 22_000);
      expect(seen).toEqual([false, true, false, false, false, false, false, true]);
    });
  });
});
