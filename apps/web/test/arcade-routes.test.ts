import { document, FakeElement } from './fake-dom';
import { DEV_STEER } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { devView, NOW, tableOf } from './fixtures/arcade';

/**
 * C11, C12, §5: the arcade's screens are behind DEV_STEER.on, and only there. With the flag off (the default, until
 * Heiko's OK on the rig) development on the phone and the TV is today's; with it on, the arcade's. Mounted (the phone
 * and the TV read the client's store, which a static render cannot), into the fake DOM.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneApp: ComponentType<{ room: string }>;
let TableApp: ComponentType<{ room: string }>;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // react-dom/client, imported after the fake DOM, mounts into it; the screens come after both.
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneApp } = await import('../src/phone/PhoneApp'));
  ({ TableApp } = await import('../src/table/TableApp'));
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  // What these screens reach for that the fake DOM has no need of elsewhere: focus, a box, a mutation observer, and
  // animation frames (none run: the screens draw from the view).
  const element = FakeElement.prototype as unknown as { focus(): void; getBoundingClientRect(): object };
  element.focus = () => {};
  element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  class Observer {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.assign(globalThis, { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, MutationObserver: Observer });
});

function clientFor(view: MuleView, role: 'player' | 'board'): TableClient {
  const state = { status: 'open', role, code: 'MULE', seatId: role === 'player' ? 's1' : null, view: tableOf(view), chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  return {
    subscribe: () => () => {},
    getState: () => state,
    serverNow: () => NOW,
    savedSeat: () => null,
    join: () => {},
    watch: () => {},
    intent: () => {},
    onFrame: () => () => {},
    roundTripMs: () => null,
  } as unknown as TableClient;
}

let root: Root | null = null;
const host = document.createElement('div');

function mount(app: ComponentType<{ room: string }>, role: 'player' | 'board'): FakeElement {
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(createElement(ClientProvider, { client: clientFor(devView(), role), children: createElement(app, { room: 'MULE' }) })));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  DEV_STEER.on = false;
});

function has(testid: string, node: FakeElement = host): boolean {
  if (node.getAttribute('data-testid') === testid) return true;
  return node.childNodes.some((c) => c instanceof FakeElement && has(testid, c));
}
function phaseShown(node: FakeElement = host): string | null {
  const own = node.getAttribute('data-phase');
  if (own) return own;
  for (const c of node.childNodes) {
    const hit = c instanceof FakeElement ? phaseShown(c) : null;
    if (hit) return hit;
  }
  return null;
}

describe('C11, C12: behind DEV_STEER.on, and only there', () => {
  it('C11: with the flag off (the default) development on the phone is today\'s screen', () => {
    expect(DEV_STEER.on).toBe(false);
    mount(PhoneApp, 'player');
    expect(phaseShown()).toBe('development');
    expect(has('phone-game')).toBe(false);
  });

  it('C11: with the flag on, development on the phone is the arcade\'s landscape screen', () => {
    DEV_STEER.on = true;
    mount(PhoneApp, 'player');
    expect(has('phone-game')).toBe(true);
    expect(has('action-button')).toBe(true);
  });

  it('C12: with the flag off the TV\'s development is today\'s', () => {
    mount(TableApp, 'board');
    expect(phaseShown()).toBe('development');
    expect(has('tv-game')).toBe(false);
  });

  it('C12: with the flag on, the TV\'s development draws every colonist live', () => {
    DEV_STEER.on = true;
    mount(TableApp, 'board');
    expect(has('tv-game')).toBe(true);
    expect(has('tv-map-stage')).toBe(true);
  });
});
