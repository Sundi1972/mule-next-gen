import { document, FakeElement } from './fake-dom';
import { DEV_STEER } from '@mule/engine';
import type { MuleView, MyView } from '@mule/protocol';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { devView, lenasMe, NOW, PLAYERS, tableOf } from './fixtures/arcade';

/**
 * C11, C12, §5, AM-20: the arcade's screens show when the server steers, and only then: the view carries the floor
 * (your Reach, the colonists' places). An ordinary server (DEV_STEER.on false, the default until Heiko's OK on the
 * rig) sends neither, so development on the phone and the TV is today's, whatever the browser's own copy of the flag
 * says. Mounted (the phone and the TV read the client's store, which a static render cannot), into the fake DOM.
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

/** What an ordinary server sends in development: no Reach for the seat, no places for the colonists. */
function ordinary(): MuleView {
  const { reach: _none, ...me } = lenasMe();
  return devView(me as MyView);
}
/** What a steering server sends: the seat's Reach, and every colonist's place on the floor. */
function steered(role: 'player' | 'board'): MuleView {
  const players = PLAYERS.map((p, i) => ({ ...p, colonist: { ...p.colonist!, x: 2 + i, y: 3, space: 'map' as const, facing: 'right' as const, moving: false, lead: null } }));
  return role === 'player' ? devView(lenasMe(), { players }) : devView(lenasMe(), { players, me: null });
}

function mount(app: ComponentType<{ room: string }>, role: 'player' | 'board', view: MuleView): FakeElement {
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(createElement(ClientProvider, { client: clientFor(view, role), children: createElement(app, { room: 'MULE' }) })));
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

describe('C11, C12 (AM-20): the route follows the server, not the bundle', () => {
  it('C11: an ordinary server: development on the phone is today\'s screen, even with the browser\'s own flag on', () => {
    mount(PhoneApp, 'player', ordinary());
    expect(phaseShown()).toBe('development');
    expect(has('phone-game')).toBe(false);
    act(() => root?.unmount());
    DEV_STEER.on = true;
    mount(PhoneApp, 'player', ordinary());
    expect(has('phone-game')).toBe(false);
  });

  it('C11: a steering server (its Reach in the view): development on the phone is the arcade\'s landscape screen', () => {
    expect(DEV_STEER.on).toBe(false);
    mount(PhoneApp, 'player', steered('player'));
    expect(has('phone-game')).toBe(true);
    expect(has('action-button')).toBe(true);
  });

  it('C12: an ordinary server: the TV\'s development is today\'s, even with the browser\'s own flag on', () => {
    DEV_STEER.on = true;
    mount(TableApp, 'board', ordinary());
    expect(phaseShown()).toBe('development');
    expect(has('tv-game')).toBe(false);
  });

  it('C12: a steering server (the colonists\' places in the view): the TV draws every colonist live', () => {
    mount(TableApp, 'board', steered('board'));
    expect(has('tv-game')).toBe(true);
    expect(has('tv-map-stage')).toBe(true);
  });
});
