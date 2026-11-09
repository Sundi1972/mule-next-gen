import { document, FakeElement } from './fake-dom';
import type { MuleView, PlayerView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import type { PhoneGame } from '../src/phone/game';

let Chat: typeof import('../src/phone/parts').Chat;
let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;

const player = (id: string, name: string, slot: number): PlayerView =>
  ({ id, name, isAi: false, color: '', slot, species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false }) as PlayerView;
const game = { view: { players: [player('s1', 'Heiko', 0), player('s2', 'Mia', 1)] } as unknown as MuleView } as PhoneGame;
const state = { chat: [{ id: 1, from: 's2', text: 'Who takes the crystite?' }], seatId: 's1' };
const client = { subscribe: () => () => undefined, getState: () => state, chat: () => undefined } as unknown as TableClient;

afterEach(() => {
  vi.restoreAllMocks();
  delete (FakeElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('Chat on the hub', () => {
  it('FM-23: leaving the Talk desk unmounts Chat cleanly where scrollIntoView returns a Promise, as Chrome 152 does', async () => {
    ({ Chat } = await import('../src/phone/parts'));
    ({ ClientProvider } = await import('../src/net/react'));
    ({ PhoneGameProvider } = await import('../src/phone/game'));
    const scrolled = vi.fn(() => Promise.resolve());
    (FakeElement.prototype as { scrollIntoView?: unknown }).scrollIntoView = scrolled;
    // The fake document makes no SVG namespace; a PlayerMark's svg is an element like any other here.
    const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
    doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host as unknown as HTMLElement);
    const desk = (screen: ReactElement) => createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: game, children: screen }) });

    flushSync(() => root.render(desk(createElement(Chat))));
    expect(scrolled, 'the newest line is scrolled into view').toHaveBeenCalled();
    // Another desk takes the Talk desk's place, so React runs Chat's clean-ups.
    expect(() => flushSync(() => root.render(desk(createElement('p', null, 'Store'))))).not.toThrow();
    expect(host.textContent).toBe('Store');
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/not a function|must not return anything besides a function/);
    root.unmount();
  });
});
