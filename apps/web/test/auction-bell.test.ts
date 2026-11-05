// A browser's document before react-dom loads; the fake window gets listeners and a fake AudioContext below.
import { document } from './fake-dom';
import type { AuctionView } from '@mule/protocol';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

/** Every oscillator started, by its wave: the bell is the only sound made of sine waves, 5 partials struck 3 times. */
const started: string[] = [];
const BELL_SINES = 15;
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect: (next: unknown) => next });
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return { ...node(), gain: param() };
  }
  createBiquadFilter() {
    return { ...node(), type: '', frequency: param(), Q: param() };
  }
  createOscillator() {
    const o = { ...node(), type: '', frequency: param(), start: () => started.push(o.type), stop() {} };
    return o;
  }
}

const listeners: Record<string, (() => void)[]> = {};
Object.assign(globalThis.window, {
  AudioContext: FakeAudioContext,
  addEventListener: (type: string, l: () => void) => (listeners[type] ??= []).push(l),
  setInterval: () => 0,
  clearInterval: () => {},
});
const { useAuctionSound } = await import('../src/game/sound');
// The first key press unlocks the sound, as in a browser.
listeners.keydown?.forEach((l) => l());

function view(good: AuctionView['good'], stage: AuctionView['stage']): AuctionView {
  return {
    good,
    stage,
    seconds: 1,
    total: 2,
    slowed: false,
    next: [],
    storeBuys: null,
    storeSells: null,
    storeForSale: 0,
    shipPays: null,
    lo: 0,
    hi: 100,
    speed: 1,
    walkers: [],
    deals: [],
    units: 0,
    status: [],
    skipped: [],
    upNext: null,
    receipt: null,
    tally: null,
  };
}

function Probe({ auction }: { auction: AuctionView | null }) {
  useAuctionSound(auction);
  return null;
}

const bells = () => started.filter((t) => t === 'sine').length / BELL_SINES;

describe("the end-of-walk bell with A-5's close stage", () => {
  it('T-AC-A5-10: walk to close rings the bell once; close to the next good does not ring it again', () => {
    const root = createRoot(document.createElement('div') as unknown as HTMLElement);
    const show = (a: AuctionView | null) => flushSync(() => root.render(createElement(Probe, { auction: a })));
    show(view('food', 'status'));
    show(view('food', 'walk'));
    expect(bells()).toBe(0);
    show(view('food', 'close'));
    expect(bells(), 'the walk ended: the bell').toBe(1);
    show(view('water', 'status'));
    expect(bells(), 'the next good comes up: no second bell').toBe(1);
    // The last good: walk, close, then the auction is over.
    show(view('water', 'walk'));
    show(view('water', 'close'));
    show(null);
    expect(bells()).toBe(2);
    root.unmount();
  });
});
