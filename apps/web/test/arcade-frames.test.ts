import { DEV_STEER } from '@mule/engine';
import type { DevFrame } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { TableClient, type SocketLike } from '../src/net/client';
import { msPerTick, othersAt, pushFrame, startFrameLog } from '../src/phone/arcade/frames';

/**
 * C8 on the client, and RULE-10's others: a screen hears every frame the room sends, without a render per frame, and
 * draws every other colonist DEV_STEER.interpolateMs behind the newest frame, interpolated between frames.
 */

const TICK = DEV_STEER.tickMs;

const colonist = (id: string, x: number, y = 2, space: 'map' | 'hall' = 'map') => ({ id, x, y, space, facing: 'right' as const, moving: true, lead: null });
const frame = (tick: number, ...colonists: DevFrame['colonists']): DevFrame => ({ tick, at: tick * TICK, colonists, beats: [] });

class Socket implements SocketLike {
  readyState = 1;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

describe('C11/C12: frames reach the screens', () => {
  it('C11: every frame the room sends reaches the screen, and the client state (what React renders from) never changes for one', () => {
    let now = 5_000;
    const socket = new Socket();
    const client = new TableClient({ url: 'ws://t/ws', socket: () => socket, now: () => now, monotonic: () => now, setTimeout: () => 0, clearTimeout: () => {} });
    client.watch('MULE');
    socket.onopen?.({});
    const heard: { frame: DevFrame; at: number }[] = [];
    const stop = client.onFrame((f, at) => heard.push({ frame: f as DevFrame, at }));
    let renders = 0;
    client.subscribe(() => renders++);
    const one = frame(3, colonist('s1', 1));
    socket.onmessage?.({ data: JSON.stringify({ t: 'frame', payload: one }) });
    now += 50;
    socket.onmessage?.({ data: JSON.stringify({ t: 'frame', payload: frame(4, colonist('s1', 1.1)) }) });
    expect(heard.map((h) => [h.frame.tick, h.at])).toEqual([[3, 5_000], [4, 5_050]]);
    expect(renders).toBe(0);
    stop();
    socket.onmessage?.({ data: JSON.stringify({ t: 'frame', payload: frame(5, colonist('s1', 1.2)) }) });
    expect(heard).toHaveLength(2);
  });

  it('C11: the round trip the clock pings measured, for the phone to run ahead by half of it; none before a pong', () => {
    let now = 1_000;
    const socket = new Socket();
    const client = new TableClient({ url: 'ws://t/ws', socket: () => socket, now: () => now, monotonic: () => now, setTimeout: () => 0, clearTimeout: () => {} });
    client.join('MULE', 'Lena');
    expect(client.roundTripMs()).toBeNull();
    client.receive({ t: 'pong', clientTime: 900, serverTime: 9_000 });
    expect(client.roundTripMs()).toBe(100);
    now = 1_180;
    client.receive({ t: 'pong', clientTime: 1_100, serverTime: 9_200 });
    // The shortest round trip of those kept wins, as the clock's offset does: a slow pong does not lengthen it.
    now = 2_000;
    client.receive({ t: 'pong', clientTime: 1_700, serverTime: 9_900 });
    expect(client.roundTripMs()).toBe(80);
  });
});

describe('RULE-10: everyone else, interpolateMs behind the newest frame', () => {
  it('C12: between two frames a colonist is drawn where it was interpolateMs ago, interpolated', () => {
    let log = startFrameLog();
    log = pushFrame(log, frame(10, colonist('kai', 2), colonist('brix', 5, 1)), 1_000);
    log = pushFrame(log, frame(11, colonist('kai', 2.1), colonist('brix', 5, 1.2)), 1_050);
    log = pushFrame(log, frame(12, colonist('kai', 2.2), colonist('brix', 5, 1.4)), 1_100);
    // At 1 100 the newest frame (tick 12, 600 ms in) came just now: interpolateMs (100) back is tick 10's 500 ms.
    expect(othersAt(log, 1_100, DEV_STEER).get('kai')!.x).toBeCloseTo(2, 6);
    // 25 ms on: half of the 50 ms from tick 10 to tick 11.
    expect(othersAt(log, 1_125, DEV_STEER).get('kai')!.x).toBeCloseTo(2.05, 6);
    expect(othersAt(log, 1_125, DEV_STEER).get('brix')!.y).toBeCloseTo(1.1, 6);
    // Never ahead of the newest frame: no frame for a while and everyone stands where it last was.
    expect(othersAt(log, 2_000, DEV_STEER).get('kai')!.x).toBeCloseTo(2.2, 6);
  });

  it('C12 (negative): a colonist through a door is not drawn sliding across: the newer space is drawn at once', () => {
    let log = startFrameLog();
    log = pushFrame(log, frame(10, colonist('kai', 5.8, 4.5, 'map')), 1_000);
    log = pushFrame(log, frame(11, colonist('kai', 0.7, 6, 'hall')), 1_050);
    log = pushFrame(log, frame(12, colonist('kai', 0.8, 6, 'hall')), 1_100);
    const between = othersAt(log, 1_125, DEV_STEER).get('kai')!;
    expect(between).toMatchObject({ space: 'map', x: 5.8 });
    expect(othersAt(log, 1_150, DEV_STEER).get('kai')).toMatchObject({ space: 'hall', x: 0.7 });
  });

  it('C12 (negative): an away seat stands still: the same place in every frame draws the same place', () => {
    let log = startFrameLog();
    for (let t = 0; t < 5; t++) log = pushFrame(log, frame(t, { ...colonist('ossa', 3, 3), moving: false }), 1_000 + t * TICK);
    const seen = [1_150, 1_175, 1_190, 1_400].map((now) => othersAt(log, now, DEV_STEER).get('ossa')!);
    expect(seen.every((c) => c.x === 3 && c.y === 3 && !c.moving)).toBe(true);
  });

  it('C11: the frames\' own pace times an assay: a table that plays its phases quicker sends its ticks quicker', () => {
    expect(msPerTick(startFrameLog(), TICK)).toBe(TICK);
    let log = startFrameLog();
    for (let t = 0; t < 5; t++) log = pushFrame(log, frame(t, colonist('kai', 1)), 1_000 + t * 25);
    expect(msPerTick(log, TICK)).toBe(25);
  });
});
