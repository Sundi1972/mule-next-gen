import { DEV_STEER, floorConfig } from '@mule/engine';
import type { DevFrame, FrameMoments } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { ownFrame, ownTick, startOwn, type OwnWorld } from '../src/phone/arcade/own';
import { predictWorld } from '../src/phone/arcade/predict';
import { at, TILES } from './fixtures/arcade';

/**
 * C11 (RULE-10, RULE-4): the phone's own loop, frames in and your colonist out, as PhoneLive runs it each frame: the
 * server's hold (a pack or a stun in the frame) draws you from the frames, and a MULE the frame says bolted leaves the
 * copy free of it.
 */

const TICK = DEV_STEER.tickMs;
const NONE: FrameMoments = { packs: [], glint: null, scramble: null, bolted: [], stunned: [] };
const cfg = floorConfig();

function own(carriedMule: 'food' | null = null): OwnWorld {
  const world = predictWorld({ width: 15, height: 9, tiles: TILES }, { id: 's1', carriedMule }, cfg);
  return { world, base: { pace: 1, bitten: false, pelts: 0 }, id: 's1', cfg, assayUntil: null };
}

/** Lena at x on the plains of row 6, leading a Food MULE or not; the frame's moments as given. */
function lenaAt(tick: number, x: number, moments: Partial<FrameMoments> | null = null, lead = false): DevFrame {
  const lena = at('s1', x, 6.5, lead ? { lead: { good: 'food', x: x - 0.6, y: 6.5 } } : {});
  return { tick, at: tick * TICK, colonists: [lena], beats: [], ...(moments ? { moments: { ...NONE, ...moments } } : {}) };
}

const clock = { rttMs: 0, serverNow: 0 };

describe('C11: your own colonist, frame by frame', () => {
  it('C11: stunned in the newest frame, the copy is held and you are drawn where the frames have you; free again, from your own copy', () => {
    const w = own();
    let o = startOwn();
    // The server moves her on through the stun's frames (a stun stands, but a frame's place is the truth either way).
    [[100, 4], [101, 4.2], [102, 4.4], [103, 4.6]].forEach(([tick, x]) => (o = ownFrame(o, lenaAt(tick!, x!, { stunned: [{ who: 's1', untilTick: 200 }] }), tick! * TICK, w)));
    const now = 103 * TICK;
    const held = ownTick(o, now, w, clock);
    expect(held.own.p.wolves).toBe(true);
    // interpolateMs (two ticks) behind the newest: where the frames had her at tick 101.
    expect(held.me!.x).toBeCloseTo(4.2, 6);
    expect(held.me!.x).not.toBeCloseTo(held.own.p.me!.x, 2);
    const free = ownTick(ownFrame(held.own, lenaAt(104, 4.6), 104 * TICK, w), 104 * TICK, w, clock);
    expect(free.own.p.wolves).toBe(false);
    // Let go, she eases from where the frames draw her at that moment (tick 102) to her copy over correctMs, then is the copy.
    expect(free.me!.x).toBeCloseTo(4.4, 6);
    const later = ownTick(free.own, 104 * TICK + DEV_STEER.correctMs, w, clock);
    expect(later.me!.x).toBeCloseTo(later.own.p.me!.x, 6);
  });

  it('C11: a pack round you in the frame holds the copy, whatever your view says yet', () => {
    const w = own();
    const lenas = { who: 's1', stage: 'chase' as const, sinceTick: 100, centre: { x: 4, y: 6.5 }, strikes: 0, bites: 0, wolves: [] };
    let o = startOwn();
    o = ownFrame(o, lenaAt(100, 4, { packs: [lenas] }), 100 * TICK, w);
    expect(ownTick(o, 100 * TICK, w, clock).own.p.wolves).toBe(true);
  });

  it('C11: the first frame that says your MULE bolted starts the copy free of it', () => {
    const w = own('food');
    const o = ownFrame(startOwn(), lenaAt(100, 4, { bolted: ['s1'] }, true), 100 * TICK, w);
    expect(o.p.me!.bolt).not.toBeNull();
  });

  it('C11: a MULE that bolts while the copy runs: the next moment the copy walks free of it; caught, it leads it again', () => {
    const w = own('food');
    let o = ownFrame(startOwn(), lenaAt(100, 4, null, true), 100 * TICK, w);
    expect(o.p.me!.bolt ?? null).toBeNull();
    o = ownFrame(o, lenaAt(101, 4, { bolted: ['s1'] }, true), 101 * TICK, w);
    const loose = ownTick(o, 101 * TICK, w, clock).own;
    expect(loose.p.me!.bolt).not.toBeNull();
    const caught = ownTick(ownFrame(loose, lenaAt(102, 4, null, true), 102 * TICK, w), 102 * TICK, w, clock).own;
    expect(caught.p.me!.bolt ?? null).toBeNull();
  });
});
