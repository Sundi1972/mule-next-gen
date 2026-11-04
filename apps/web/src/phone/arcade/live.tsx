import { floorConfig, SPECIES_PERK } from '@mule/engine';
import type { DevFrame, MuleView, PlayerView } from '@mule/protocol';
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { TableClient } from '../../net/client';
import { useClient } from '../../net/react';
import { startControls, stickOf, type Controls } from './controls';
import { msPerTick, othersAt, pushFrame, startFrameLog, type Drawn, type FrameLog } from './frames';
import { advanceTo, assayTick, holdUntil, markStale, phoneTick, predictWorld, receiveFrame, shownAt, startPrediction, steerFrom, type ColonistBase, type Prediction, type Shown } from './predict';
import { gateSteer, startGate, type SteerGate } from './steer';
import { usePhoneGame } from '../game';

/**
 * The imperative shell under the arcade screens: frames in, positions out, once an animation frame. The phone predicts
 * its own colonist (predict.ts) and sends its stick and its presses; every screen draws everyone else from the frames
 * (frames.ts). What the screens read is one snapshot, Live, the same for every part of a screen.
 */

/** A frame's line on the TV, and when it was last in a frame. */
export interface Beat {
  text: string;
  at: number;
}

export interface Live {
  /** Your own colonist, as your prediction shows it; null on the TV and before the first frame. */
  me: Shown | null;
  /** Everyone else's, interpolateMs behind the newest frame. */
  others: ReadonlyMap<string, Drawn>;
  status: Prediction['status'];
  /** The frames' lines of the last few seconds. */
  beats: readonly Beat[];
}

interface LiveSource {
  subscribe(fn: () => void): () => void;
  get(): Live;
  /** The one button. */
  press(): void;
  controls: Controls;
}

const LiveCtx = createContext<LiveSource | null>(null);

function useSource(): LiveSource {
  const s = useContext(LiveCtx);
  if (!s) throw new Error('No arcade Live');
  return s;
}

/** This animation frame's positions. */
export function useLive(): Live {
  const s = useSource();
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}

/** The press, and the controls the keys, the joystick and the mouse write. */
export function useArcade(): Pick<LiveSource, 'press' | 'controls'> {
  return useSource();
}

/** A screen at one moment, for tests and fixtures: nothing moves, a press does nothing. */
export function StaticLive({ live, children }: { live: Live; children: ReactNode }) {
  const source = useMemo<LiveSource>(() => ({ subscribe: () => () => {}, get: () => live, press: () => {}, controls: startControls() }), [live]);
  return <LiveCtx.Provider value={source}>{children}</LiveCtx.Provider>;
}

/** How long a frame's line stays on the TV after it was last in a frame (the mock's BEAT_MS). */
export const BEAT_MS = 3_000;

const isFrame = (p: unknown): p is DevFrame => !!p && typeof p === 'object' && Array.isArray((p as DevFrame).colonists) && typeof (p as DevFrame).tick === 'number';

/** Where the view itself has a colonist, until the frames say: the server's latest full view (ColonistView v2). */
export function fromView(p: PlayerView): Drawn | null {
  const c = p.colonist;
  if (!c || c.x === undefined || c.y === undefined || !c.space) return null;
  return { id: p.id, x: c.x, y: c.y, space: c.space, facing: c.facing ?? 'right', moving: !!c.moving, lead: c.lead ?? null };
}

/** Your pace as the floor has it: the wire's, else hunger × sickness × the Zipwing's perk. */
export function paceOf(p: PlayerView): number {
  return p.colonist?.pace ?? (p.condition?.conditionPace ?? 1) * (p.species === 'zipwing' ? SPECIES_PERK.zipwingSpeed : 1);
}

/** A beat log: each line with the last time a frame carried it, dropped BEAT_MS after. */
function beatsOf(old: readonly Beat[], frame: DevFrame, now: number): Beat[] {
  const kept = old.filter((b) => now - b.at < BEAT_MS && !frame.beats.includes(b.text));
  return [...kept, ...frame.beats.map((text) => ({ text, at: now }))];
}

/** A source that runs an animation-frame loop while mounted, emitting a fresh Live on each. */
function useLoop(client: TableClient, frameIn: (frame: DevFrame, at: number) => void, tick: (now: number) => Live, initial: () => Live): LiveSource {
  const ref = useRef({ frameIn, tick });
  ref.current = { frameIn, tick };
  const source = useMemo(() => {
    const listeners = new Set<() => void>();
    let live = initial();
    return {
      controls: startControls(),
      press: () => {},
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      get: () => live,
      set: (next: Live) => {
        live = next;
        for (const fn of listeners) fn();
      },
    };
    // The source lives as long as the screen: its first Live comes from the view the screen mounted with.
  }, []);
  useEffect(() => {
    const stop = client.onFrame((payload, at) => {
      if (isFrame(payload)) ref.current.frameIn(payload, at);
    });
    let raf = 0;
    const loop = () => {
      source.set(ref.current.tick(Date.now()));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stop();
      cancelAnimationFrame(raf);
    };
  }, [client, source]);
  return source;
}

/**
 * The phone's and the laptop's: your colonist predicted and steered, everyone else from the frames. The stick is sent
 * on change, at most steerMaxPerSecond, stamped with the tick the copy applies it at; a press sends `act`.
 */
export function PhoneLive({ children }: { children: ReactNode }) {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const cfg = useMemo(() => floorConfig(), []);
  // The copy steps on the map and your MULE: a new world only when either changes, not on every view.
  const world = useMemo(() => predictWorld(view, me, cfg), [view.width, view.height, view.tiles, me.id, me.carriedMule, cfg]);
  const base: ColonistBase = { pace: paceOf(self), bitten: !!self.colonist?.bitten, pelts: self.colonist?.pelts ?? 0 };
  // `assaying`: the assay end (server ms) the copy already holds for, so each view's is applied once.
  const state = useRef<{ p: Prediction; log: FrameLog; gate: SteerGate; beats: Beat[]; assaying: number | null }>({ p: startPrediction(), log: startFrameLog(), gate: startGate(), beats: [], assaying: null });
  const ctx = useRef({ world, base, view, self });
  ctx.current = { world, base, view, self };
  const othersFrom = (log: FrameLog, now: number) => {
    const drawn = othersAt(log, now, cfg.steer);
    drawn.delete(me.id);
    return drawn;
  };
  const viewOthers = (v: MuleView) => new Map(v.players.filter((p) => p.id !== me.id).flatMap((p) => (fromView(p) ? [[p.id, fromView(p)!] as const] : [])));
  const source = useLoop(
    client,
    (frame, at) => {
      const s = state.current;
      s.log = pushFrame(s.log, frame, at);
      s.p = receiveFrame(s.p, frame, at, ctx.current.world, ctx.current.base);
      s.beats = beatsOf(s.beats, frame, at);
    },
    (now) => {
      const s = state.current;
      const { world } = ctx.current;
      s.p = markStale(s.p, now, cfg);
      const rtt = client.roundTripMs() ?? 0;
      // Your own view says you assay: the copy stands until then, as the server holds you (needs a frame to time it).
      const until = ctx.current.self.colonist?.assayUntil ?? null;
      if (until !== s.assaying && (until === null || s.p.frame)) {
        s.assaying = until;
        s.p = holdUntil(s.p, until === null ? null : assayTick(s.p, until, now, client.serverNow(), rtt, msPerTick(s.log, cfg.steer.tickMs)));
      }
      const target = phoneTick(s.p, now, rtt, cfg);
      if (target !== null) s.p = advanceTo(s.p, target, world);
      const shown = shownAt(s.p, now, cfg);
      const want = stickOf(source.controls, shown);
      // Only a live copy steers: the stamp is its tick, and a closed socket would only toast.
      if (s.p.status === 'live' && client.getState().status === 'open') {
        const r = gateSteer(s.gate, want, now);
        if (r.send) {
          s.gate = r.gate;
          s.p = steerFrom(s.p, r.send);
          client.intent({ type: 'steer', x: r.send.x, y: r.send.y, tick: s.p.tick });
        }
      }
      return { me: shownAt(s.p, now, cfg), others: s.log.frames.length ? othersFrom(s.log, now) : viewOthers(ctx.current.view), status: s.p.status, beats: s.beats.filter((b) => now - b.at < BEAT_MS) };
    },
    () => ({ me: fromView(self), others: viewOthers(view), status: 'waiting', beats: [] }),
  );
  source.press = () => {
    if (client.getState().status === 'open') client.intent({ type: 'act' });
  };
  return <LiveCtx.Provider value={source}>{children}</LiveCtx.Provider>;
}

/** The TV's: everyone from the frames; no colonist of its own, no controls. */
export function BoardLive({ view, children }: { view: MuleView; children: ReactNode }) {
  const client = useClient();
  const cfg = useMemo(() => floorConfig(), []);
  const state = useRef<{ log: FrameLog; beats: Beat[] }>({ log: startFrameLog(), beats: [] });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fromViews = (v: MuleView) => new Map(v.players.flatMap((p) => (fromView(p) ? [[p.id, fromView(p)!] as const] : [])));
  const source = useLoop(
    client,
    (frame, at) => {
      const s = state.current;
      s.log = pushFrame(s.log, frame, at);
      s.beats = beatsOf(s.beats, frame, at);
    },
    (now) => {
      const s = state.current;
      const newest = s.log.frames.at(-1);
      const status = !newest ? 'waiting' : now - newest.recvMs > cfg.steer.staleMs ? 'reconnecting' : 'live';
      return { me: null, others: newest ? othersAt(s.log, now, cfg.steer) : fromViews(viewRef.current), status, beats: s.beats.filter((b) => now - b.at < BEAT_MS) };
    },
    () => ({ me: null, others: fromViews(view), status: 'waiting', beats: [] }),
  );
  return <LiveCtx.Provider value={source}>{children}</LiveCtx.Provider>;
}
