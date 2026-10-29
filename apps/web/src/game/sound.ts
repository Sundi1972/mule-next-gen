import { WALK } from '@mule/engine';
import type { AuctionView } from '@mule/protocol';
import { useEffect, useRef } from 'react';

/**
 * The auction's sounds, made with Web Audio so there are no files to load:
 * a soft tick-tock clock that speeds up as time runs out and slows while a
 * trade slows the clock, a click per unit that changes hands (so it follows
 * the trade speed-up), and a bell struck three times when a good's walk ends.
 * Browsers only play sound after a tap or key press, so the context starts
 * on the first one.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  return ctx && ctx.state === 'running' ? ctx : null;
}

function unlock() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // No audio on this device.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

let tock = false;

/** One tick of the clock: louder as time runs out. `f` is the fraction of time left. */
export function clockTick(f: number) {
  const a = audio();
  if (!a) return;
  tock = !tock;
  try {
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    const bp = a.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = tock ? 1250 : 1650;
    bp.type = 'bandpass';
    bp.frequency.value = o.frequency.value;
    bp.Q.value = 6;
    g.gain.setValueAtTime(f > 0.5 ? 0.05 : f > 0.25 ? 0.09 : 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(bp).connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.035);
  } catch {
    // Ignore: sound is a nicety.
  }
}

/** One unit changing hands. The pitch moves a little with the price. */
export function unitClick(price: number, delay = 0) {
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'square';
    o.frequency.value = 900 + (Math.round(price) % 7) * 40;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.05);
  } catch {
    // Ignore.
  }
}

/** The end of a good: a bell, struck three times. */
export function bell() {
  const a = audio();
  if (!a) return;
  try {
    const out = a.createGain();
    out.gain.value = 0.22;
    out.connect(a.destination);
    const partials: [number, number, number][] = [
      [1, 1, 2.6],
      [2.0, 0.5, 1.8],
      [2.76, 0.35, 1.4],
      [5.4, 0.18, 0.8],
      [8.9, 0.08, 0.5],
    ];
    for (const at of [0, 0.6, 1.2]) {
      for (const [ratio, gain, decay] of partials) {
        const t = a.currentTime + at;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'sine';
        o.frequency.value = 520 * ratio;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
    }
  } catch {
    // Ignore.
  }
}

/** Gap between clock ticks: about 1 s while green, 0.5 s amber, then faster; slower during a trade. */
export function tickGap(f: number, slowed: boolean): number {
  return (f > 0.5 ? 1000 : f > 0.25 ? 500 : f > 0.12 ? 250 : 160) / (slowed ? WALK.tradeClockRate : 1);
}

/** Plays the auction's sounds from the live view, on a phone or the TV. */
export function useAuctionSound(auction: AuctionView | null) {
  const live = useRef(auction);
  live.current = auction;
  const last = useRef<{ good: string; stage: string; units: number } | null>(null);

  // Clicks per unit traded, and the bell when a good's walk ends.
  useEffect(() => {
    const prev = last.current;
    last.current = auction ? { good: auction.good, stage: auction.stage, units: auction.units } : null;
    // The walk ends into the good's close stage (A-5), or straight into the next good: ring once, as it leaves the walk.
    if (prev?.stage === 'walk' && (!auction || auction.good !== prev.good || auction.stage !== 'walk')) bell();
    if (!auction || auction.stage !== 'walk' || !prev || prev.good !== auction.good) return;
    const n = Math.min(6, auction.units - prev.units);
    const price = auction.deals[0]?.price ?? 0;
    // Several units can arrive in one update: spread their clicks over it.
    for (let i = 0; i < n; i++) unitClick(price, (i * 0.1) / n);
  }, [auction]);

  // The clock's tick-tock: the status countdown and the walk.
  useEffect(() => {
    let next = 0;
    const timer = window.setInterval(() => {
      const a = live.current;
      if (!a || (a.stage !== 'status' && a.stage !== 'walk') || a.seconds <= 0) {
        next = 0;
        return;
      }
      const now = performance.now();
      const f = a.total > 0 ? a.seconds / a.total : 0;
      if (next === 0 || now - next > 2_000) next = now + 200;
      if (now >= next) {
        clockTick(f);
        next = now + tickGap(f, a.slowed);
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, []);
}
