import { useMemo, type CSSProperties } from 'react';
import type { MapTile } from '../components/HoloMap';
import { cx, type Slot } from '../components/tokens';
import { motionOf, offMap, STORY } from './catalogue';
import { hitText } from './copy';
import { signLook, useShow, type ShowFrame } from './frame';
import { band, clamp, Dim, EDGE, OnPlot, ramp, Spotlight, Swarm, Trail } from './fx';
import { accent, EventDeltaChip, EventGlyph } from './glyphs';
import { storeAt } from './scene';
import { eventHitAt, eventImpactAt, eventLanded, eventStageAt, eventFrontAt, isRollCall, type EventSegment } from './timing';
import type { ShowEventKey, ShowEventView, ShowHit, ShowSize } from './types';

/**
 * Living weather, one engine for the TV and for a phone with no TV in the room: the map's state and camera, each
 * event's motion, and the marks hit plots keep (the cards over the map are cards.tsx). Every layer is a pure function
 * of the show clock. Sizes are shares of the map box's width (cqw: the box is a container), so the show fits whatever
 * box the screen gives it. On a phone: no blur, only transform and opacity change.
 */

/** A length the gallery drew at `tv` px on its 820 px TV map and `phone` px on its 540 px phone map, as cqw. */
export const cq = (size: ShowSize, tv: number, phone: number) => (size === 'tv' ? tv / 8.2 : phone / 5.4);
const ease = (v: number) => v * v * (3 - 2 * v);

/** Where an event's story happens, in tiles: its origin or the store; null for the whole map. */
export function storyPlace(frame: Pick<ShowFrame, 'tiles'>, ev: ShowEventView): { x: number; y: number } | null {
  const focus = STORY[ev.key]?.focus;
  return focus === 'origin' ? ev.origin : focus === 'store' ? storeAt(frame, ev) : null;
}

/** When the camera pulls back from a segment's story and its card of what changed comes up: at its reveal, or as soon as it plays. */
export const cardAt = (seg: EventSegment) => seg.playAt + (STORY[seg.events[0]!.key]?.reveal ?? 0) * seg.pace;

// --- What the show does to the whole map --------------------------------------------------------------------------

/** The map's state at `t`: the segment, how dim it is, whose land is in the spotlight, and the camera. */
export function livingAt(frame: ShowFrame, size: ShowSize = 'tv') {
  const { s, t, reduced, grid, cast } = frame;
  const { stage, seg } = eventStageAt(s, t);
  // A phase of only bulletins is as quiet as one with none: no intro card and no dim, only its roll call.
  const quiet = s.segments.every(isRollCall);
  const ev = seg?.events[0];
  const player = ev && ev.weight === 'spotlight' ? cast.playerOf(ev) : undefined;
  const spot = player && seg ? ramp(t, seg.playAt - 0.5, 0.5) * (1 - ramp(t, seg.endAt - 0.5, 0.5)) : 0;
  const story = ev ? STORY[ev.key] : undefined;
  // A story's jolt, or a meteor's impact, shakes the camera for a moment, never with reduced motion.
  const jolts = (g: EventSegment, e: ShowEventView) => (motionOf(e.key) === 'strike' ? [eventImpactAt(g)] : STORY[e.key]?.jolt !== undefined ? [g.playAt + STORY[e.key]!.jolt! * g.pace] : []);
  const jolt = s.segments.flatMap((g) => g.events.flatMap((e) => jolts(g, e))).find((at) => t >= at && t < at + 0.6);
  const shake = jolt !== undefined && !reduced ? `translate(${Math.sin(t * 80) * cq(size, 5, 2.5) * (1 - (t - jolt) / 0.6)}cqw, ${Math.cos(t * 63) * cq(size, 3, 1.5)}cqw)` : undefined;
  // The map dims under the intro and each title card and clears as the card flies off; under a card of changes off
  // the map (money, goods, gauges) it stays half dim.
  const changesOffMap = !!ev && offMap(ev.key) && !!ev.effects?.length;
  const dim = quiet
    ? 0
    : stage === 'intro'
      ? ramp(t, s.start, 0.3)
      : seg && !isRollCall(seg) && stage === 'announce'
        ? ramp(t, seg.announceAt, 0.3) * (changesOffMap && !story ? 1 - 0.4 * ramp(t, seg.playAt - 0.5, 0.5) : 1 - ramp(t, seg.playAt - 0.5, 0.5))
        : seg && changesOffMap && (stage === 'play' || stage === 'settle') && t >= cardAt(seg)
          ? 0.6 * ramp(t, cardAt(seg), 0.3) * (1 - ramp(t, seg.endAt - 0.4, 0.4))
          : 0;
  // The camera flies in to where the story happens while it plays, and pulls back after its reveal. Never without motion.
  const place = ev && seg && !reduced ? storyPlace(frame, ev) : null;
  const lens = place && seg ? ease(ramp(t, seg.playAt - 0.3, 0.8)) * (1 - ease(ramp(t, cardAt(seg) - 0.2, 0.8))) : 0;
  const camera = (() => {
    if (!place || !seg || !story?.zoom) return undefined;
    const e = lens;
    if (e <= 0) return undefined;
    const k = 1 + (story.zoom - 1) * e;
    // The place, in percent of the map from its middle.
    const p = { x: ((place.x + 0.5) / grid.width) * 100 - 50, y: ((place.y + 0.5) / grid.height) * 100 - 50 };
    // Zoom about the place, then slide it toward the middle, never showing past the map's edge.
    const edge = (v: number) => Math.max(-(k - 1) * 50, Math.min((k - 1) * 50, v));
    return `translate(${edge(p.x * (1 - e - k))}%, ${edge(p.y * (1 - e - k))}%) scale(${k})`;
  })();
  const view = [camera, shake].filter(Boolean).join(' ') || undefined;
  return { stage, seg, dim, player, spot, quiet, view, place, lens };
}

/** The same, for a layer inside <EventShow>; the caller reads it to glow the spotlit player's slot. */
export function useEventLivingView() {
  return livingAt(useShow());
}

/**
 * The hits that change what a plot shows and have not landed by `t`: a cavern caves in, a meteor leaves a crater, a
 * MULE is taken or destroyed.
 */
export function hitsStanding({ s, t, reduced, grid }: ShowFrame): ShowHit[] {
  return s.segments.flatMap((seg) => seg.events.flatMap((ev) => ev.hits.filter((hit) => (hit.was || hit.becomes === 'crater' || (hit.muleLost && hit.good)) && t < eventHitAt(seg, ev, hit, reduced, grid))));
}

/**
 * The map as the show has it at `t`. The view's tiles are after the events, so until its hit lands a plot keeps what it
 * had: a caved-in cavern keeps its badge, a struck plot shows no crater yet (or what it had, when the view says), and a
 * plot whose MULE is taken or destroyed keeps that MULE, by the good the hit names.
 */
export function useLiveTiles(frame: ShowFrame): MapTile[] {
  const standing = hitsStanding(frame);
  const key = standing.map((h) => `${h.x},${h.y},${h.was ?? ''},${h.good ?? ''}`).join('|');
  const { tiles } = frame;
  // `standing` is a new array every frame; `key` names its hits, so the map repaints only when one lands.
  return useMemo(() => {
    if (standing.length === 0) return tiles;
    return tiles.map((tile) => {
      const hit = standing.find((h) => h.x === tile.x && h.y === tile.y);
      if (!hit) return tile;
      let before = tile;
      if (hit.was) before = { ...before, special: { kind: hit.was } };
      else if (hit.becomes === 'crater') {
        const { special: _crater, ...rest } = before;
        before = rest;
      }
      if (hit.muleLost && hit.good) before = { ...before, good: hit.good };
      return before;
    });
  }, [key, tiles]);
}

/** Each segment's own motion over the map, under the bars, from when it starts to play. */
export function Weather({ size }: { size: ShowSize }) {
  const { s, t } = useShow();
  return (
    <>
      {s.segments.map(
        (g) =>
          t >= g.playAt - 0.05 && (
            <div key={g.n}>
              {g.events.map((ev, i) => (
                <EventWeather key={i} ev={ev} seg={g} size={size} />
              ))}
            </div>
          ),
      )}
    </>
  );
}

function EventWeather({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  if (STORY[ev.key]) return null;
  switch (motionOf(ev.key)) {
    case 'sweep':
      return (
        <>
          {ev.key === 'cometPass' ? <Comet ev={ev} seg={seg} size={size} /> : <Front ev={ev} seg={seg} size={size} />}
          <HitTint ev={ev} seg={seg} />
        </>
      );
    case 'spread':
      return ev.key === 'pestSwarm' ? (
        <>
          <Trail ev={ev} seg={seg} colour="color-mix(in srgb, var(--color-g-food) 45%, var(--color-warn))" />
          <Swarm ev={ev} seg={seg} />
        </>
      ) : (
        <Fire ev={ev} seg={seg} />
      );
    case 'source':
      return ev.key === 'flood' ? <Flood ev={ev} seg={seg} /> : <Ash ev={ev} seg={seg} size={size} />;
    case 'strike':
      return <MeteorFall ev={ev} seg={seg} size={size} />;
    default:
      return null;
  }
}

// --- The motion families -----------------------------------------------------------------------------------------

/** Each sweep's texture, crossing the map in its band: dust streaks, heat shimmer, rain, sun rays. */
const TEXTURE: Partial<Record<ShowEventKey, (angle: number, c: string) => string>> = {
  dustStorm: (a, c) => `repeating-linear-gradient(${a + 10}deg, transparent 0 14px, color-mix(in srgb, ${c} 55%, white) 14px 16px, transparent 16px 30px)`,
  drought: (a, c) => `repeating-linear-gradient(${a + 90}deg, transparent 0 9px, color-mix(in srgb, ${c} 45%, white) 9px 10px, transparent 10px 20px)`,
  acidRain: (a, c) => `repeating-linear-gradient(${a + 70}deg, transparent 0 8px, color-mix(in srgb, ${c} 85%, white) 8px 9.5px, transparent 9.5px 16px)`,
  solarFlare: (_a, c) => `repeating-conic-gradient(from 0deg at 50% -30%, color-mix(in srgb, ${c} 45%, transparent) 0 3deg, transparent 3deg 11deg)`,
  coldSnap: (_a, c) => `radial-gradient(circle, color-mix(in srgb, ${c} 90%, white) 0 1.6px, transparent 2.2px) 0 0 / 16px 16px`,
};

/** Where a sweep blows in from: the view's edge, or the event's own (the cold snap's frost comes from the north). */
const edgeOf = (ev: ShowEventView) => ev.from ?? (ev.key === 'coldSnap' ? 'n' : 'w');

/** A front crosses the map from its edge, in the event's colour and texture: the production show's storm, generalised. */
function Front({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  const { t, reduced } = useShow();
  const p = eventFrontAt(seg, t);
  if (reduced || p < -0.2 || p > 1.3) return null;
  const c = accent(ev.key);
  const dir = edgeOf(ev);
  const front = -45 + p * 100;
  const texture = TEXTURE[ev.key];
  return (
    <>
      <div className="absolute inset-0" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, opacity: p > 1.1 ? 0 : clamp((p + 0.2) * 3) }} />
      <div
        className="absolute"
        style={{ ...band(dir, front, '50%'), background: `linear-gradient(${EDGE[dir].angle}deg, transparent, color-mix(in srgb, ${c} 75%, transparent) 40%, color-mix(in srgb, ${c} 60%, transparent) 70%, transparent)`, filter: size === 'tv' ? 'blur(5px)' : undefined }}
        data-testid={`front-${ev.key}`}
      />
      {texture && (
        <div
          className={cx('absolute', ev.key !== 'solarFlare' && ev.key !== 'coldSnap' && 'animate-[show-dust-drift_0.5s_linear_infinite]')}
          style={{ ...band(dir, front - 4, '58%'), background: texture(EDGE[dir].angle, c), maskImage: `linear-gradient(${EDGE[dir].angle}deg, transparent, black 30%, black 70%, transparent)`, opacity: 0.75 }}
        />
      )}
    </>
  );
}

/** The comet: a bright head and a long tail crossing the sky; each Water plot glints as it passes over. */
function Comet({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  const { t, reduced } = useShow();
  const p = eventFrontAt(seg, t);
  if (reduced || p < -0.1 || p > 1.2) return null;
  const c = accent(ev.key);
  const dir = ev.from ?? 'w';
  const along = -8 + p * 116;
  const pos: CSSProperties = dir === 'w' || dir === 'e' ? { left: `${dir === 'w' ? along : 100 - along}%`, top: '20%' } : { top: `${dir === 'n' ? along : 100 - along}%`, left: '28%' };
  const turn = { w: 0, e: 180, n: 90, s: 270 }[dir];
  return (
    <div
      className="absolute rounded-full"
      style={{
        ...pos,
        width: `${cq(size, 320, 150)}cqw`,
        height: `${cq(size, 14, 7)}cqw`,
        transform: `translate(-100%, -50%) rotate(${turn}deg)`,
        transformOrigin: '100% 50%',
        background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${c} 55%, transparent) 55%, white)`,
        boxShadow: `0 0 24px 6px color-mix(in srgb, ${c} 50%, transparent)`,
      }}
      data-testid="comet"
    />
  );
}

/** Where a sweep has landed, the plot keeps a mark: a tint for a loss, a glow for a gain. */
function HitTint({ ev, seg }: { ev: ShowEventView; seg: EventSegment }) {
  const { t, reduced, grid, cell } = useShow();
  const c = accent(ev.key);
  const good = signLook(ev.sign) === 'good';
  return (
    <>
      {ev.hits.map((h) => {
        const since = t - eventHitAt(seg, ev, h, reduced, grid);
        if (since < 0) return null;
        const glint = good && !reduced && since < 0.8;
        return (
          <div
            key={`${h.x},${h.y}`}
            className="absolute rounded-[10%]"
            style={{
              ...cell(h.x, h.y),
              background: good ? 'transparent' : `color-mix(in srgb, ${c} 30%, transparent)`,
              boxShadow: good ? `inset 0 0 0 2px ${c}, 0 0 ${glint ? 22 : 10}px ${glint ? 6 : 2}px color-mix(in srgb, ${c} 60%, transparent)` : undefined,
            }}
          >
            {glint && <span aria-hidden className="absolute left-[38%] top-[30%] size-[24%] animate-[show-twinkle_0.4s_ease-in-out_infinite_alternate] bg-white" style={{ clipPath: 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)' }} />}
          </div>
        );
      })}
    </>
  );
}

/** The wildfire: the first farm flares up and burns out to char; embers drift to the farms joined to it. */
function Fire({ ev, seg }: { ev: ShowEventView; seg: EventSegment }) {
  const { t, reduced, grid, cell } = useShow();
  const c = accent(ev.key);
  return (
    <>
      <Trail ev={ev} seg={seg} colour={c} width={0.05} />
      {ev.hits.map((h) => {
        const since = t - eventHitAt(seg, ev, h, reduced, grid);
        if (since < -0.3) return null;
        const first = h.order === 0;
        const burning = !reduced && since < 1.6;
        return (
          <div key={`${h.x},${h.y}`} className="absolute rounded-[10%]" data-testid={`fire-${h.x}-${h.y}`} style={{ ...cell(h.x, h.y), background: first ? `color-mix(in srgb, var(--color-void) ${clamp(since / 1.4) * 70}%, transparent)` : `color-mix(in srgb, ${c} ${clamp(since / 0.5) * 30}%, transparent)` }}>
            {burning &&
              (first ? [-14, 22, 56] : [26]).map((left, k) => (
                <span key={k} aria-hidden className="absolute bottom-[10%] animate-[show-flicker_0.25s_ease-in-out_infinite_alternate]" style={{ left: `${left}%`, width: first ? '58%' : '48%', color: c, opacity: first ? clamp(1.6 - since) : clamp(since * 3) * clamp(1.2 - since), animationDelay: `${k * 0.07}s`, transformOrigin: 'bottom' }}>
                  <EventGlyph k="wildfire" size={first ? 40 : 22} className="h-auto w-full drop-shadow-[0_0_6px_var(--color-warn)]" />
                </span>
              ))}
          </div>
        );
      })}
    </>
  );
}

/** The flood: the river swells from its source, ripples run out, water rises over each river farm in turn. */
function Flood({ ev, seg }: { ev: ShowEventView; seg: EventSegment }) {
  const { t, reduced, tiles, grid, cell, centre } = useShow();
  const c = accent(ev.key);
  const o = ev.origin;
  const since = t - seg.playAt;
  const river = tiles.filter((tile) => tile.terrain === 'river');
  const steps = (x: number, y: number) => Math.max(Math.abs(x - o.x), Math.abs(y - o.y));
  return (
    <>
      {river.map((r) => {
        const k = reduced ? 1 : clamp((since - steps(r.x, r.y) * 0.08 * seg.pace) / 0.4);
        return k > 0 && <div key={`${r.x},${r.y}`} className="absolute" style={{ ...cell(r.x, r.y), background: `color-mix(in srgb, ${c} 45%, transparent)`, opacity: k }} />;
      })}
      {!reduced &&
        [0, 0.3, 0.6]
          .map((d) => since - d)
          .filter((v) => v > 0 && v < 1.4)
          .map((v, i) => <span key={i} className="absolute rounded-full border-2" style={{ ...centre(o.x, o.y), borderColor: c, width: `${v * 22}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', opacity: 1 - v / 1.4 }} />)}
      {ev.hits.map((h) => {
        const k = clamp((t - eventHitAt(seg, ev, h, reduced, grid)) / 0.5);
        return (
          k > 0 && (
            <div key={`${h.x},${h.y}`} className="absolute overflow-hidden rounded-[10%]" style={cell(h.x, h.y)} data-testid={`flood-${h.x}-${h.y}`}>
              <div className="absolute inset-x-0 bottom-0" style={{ height: `${k * 100}%`, background: `linear-gradient(to top, color-mix(in srgb, ${c} 70%, transparent), color-mix(in srgb, ${c} 35%, transparent))` }} />
              <div className="absolute inset-x-0" style={{ bottom: `${k * 100 - 8}%`, height: '10%', background: `repeating-linear-gradient(90deg, color-mix(in srgb, white 70%, transparent) 0 6px, transparent 6px 12px)`, opacity: 0.7 }} />
            </div>
          )
        );
      })}
    </>
  );
}

/** Volcanic ash: the volcano puffs a plume, and grey ash settles on each plot in reach, nearest first. */
function Ash({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  const { t, reduced, grid, cell, centre } = useShow();
  const since = t - seg.playAt;
  const o = centre(ev.origin.x, ev.origin.y);
  // The gallery's phone drew the plume at 60% of the TV's pixels.
  const u = (n: number) => `${cq(size, n, n * 0.6)}cqw`;
  return (
    <>
      {!reduced &&
        since < 2.6 &&
        [0, 0.25, 0.5, 0.75, 1].map((d, i) => {
          const v = since - d;
          if (v < 0) return null;
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                ...o,
                width: u(24 + v * 30),
                height: u(24 + v * 30),
                transform: `translate(calc(-50% + ${u((i % 2 ? 1 : -1) * v * 8)}), calc(-50% - ${u(v * 60)}))`,
                background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-alloy) 80%, transparent), transparent 70%)',
                opacity: clamp(1 - v / 1.6),
              }}
            />
          );
        })}
      {ev.hits.map((h) => {
        const k = clamp((t - eventHitAt(seg, ev, h, reduced, grid)) / 0.5);
        return k > 0 && <div key={`${h.x},${h.y}`} className="absolute rounded-[10%]" data-testid={`ash-${h.x}-${h.y}`} style={{ ...cell(h.x, h.y), background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-alloy) 85%, transparent) 0 1.2px, transparent 1.8px) 0 0 / 7px 7px, color-mix(in srgb, var(--color-g-alloy) 25%, transparent)', opacity: k }} />;
      })}
    </>
  );
}

/** The meteor's fall and impact: a fireball streaks to the plot, its shadow grows there, a flash and rings, the crater. */
function MeteorFall({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  const { t, reduced, grid, centre } = useShow();
  const o = ev.origin;
  const since = t - seg.playAt;
  if (since < 0) return null;
  const impact = eventImpactAt(seg) - seg.playAt;
  const after = since - impact;
  const c = centre(o.x, o.y);
  const fall = clamp(since / impact);
  // It falls from high above, from the side of the map with more room, so the whole streak crosses the map.
  const dx = o.x >= grid.width / 2 ? -42 : 42;
  const dy = -75;
  const tail = (Math.atan2(dy * (grid.height / grid.width), dx) * 180) / Math.PI - 180;
  return (
    <>
      {!reduced && after < 0 && (
        <div
          className="absolute"
          style={{
            left: `calc(${c.left} + ${(1 - fall) * dx}%)`,
            top: `calc(${c.top} + ${(1 - fall) * dy}%)`,
            width: `${cq(size, 240, 80)}cqw`,
            height: `${cq(size, 18, 7)}cqw`,
            // The head sits on the falling point; the tail streams back the way it came.
            transform: `translate(-100%, -50%) rotate(${tail}deg)`,
            transformOrigin: '100% 50%',
            background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-alert) 55%, transparent) 40%, var(--color-warn) 78%, white)',
            borderRadius: 999,
            boxShadow: '0 0 26px 8px color-mix(in srgb, var(--color-warn) 50%, transparent)',
          }}
          data-testid="meteor-streak"
        />
      )}
      {/* Its shadow on the plot grows as it comes, so the table sees where it will land. */}
      {!reduced && after < 0 && (
        <div className="absolute rounded-full" style={{ ...c, width: `${(100 / grid.width) * (0.4 + fall * 1.2)}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle, color-mix(in srgb, var(--color-alert) 55%, transparent), transparent 70%)', opacity: 0.4 + fall * 0.6 }} />
      )}
      {/* Impact: a white flash over the map, rings running out from the plot. */}
      {!reduced && after >= 0 && after < 0.35 && <div className="absolute inset-0 bg-white" style={{ opacity: 0.75 * (1 - after / 0.35) }} />}
      {!reduced &&
        [0, 0.18, 0.36]
          .map((d) => after - d)
          .filter((v) => v > 0 && v < 1.2)
          .map((v, i) => <span key={i} className="absolute rounded-full border-warn" style={{ ...c, width: `${v * 46}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', borderWidth: size === 'tv' ? 4 : 2, opacity: 1 - v / 1.2 }} />)}
      {/* With reduced motion there is no fall: the bowl shows when the map's badge does, at the hit's own landing. */}
      {(reduced ? t >= eventHitAt(seg, ev, ev.hits[0] ?? null, true, grid) : after >= 0) && <Crater x={o.x} y={o.y} since={reduced ? 9 : after} />}
    </>
  );
}

/** The scorched bowl the meteor leaves, Crystite glinting in it, while its story plays; the map's crater badge stays after. */
function Crater({ x, y, since }: { x: number; y: number; since: number }) {
  const { cell } = useShow();
  const k = clamp(since / 0.6);
  return (
    <div className="absolute z-[2]" style={cell(x, y)} data-testid={`crater-${x}-${y}`}>
      <div className="absolute inset-[6%] rounded-full" style={{ background: 'radial-gradient(circle, var(--color-void) 0 38%, color-mix(in srgb, var(--color-t-crater) 100%, var(--color-void)) 55%, transparent 72%)', transform: `scale(${0.6 + k * 0.4})`, opacity: k }} />
      {[
        [38, 40],
        [58, 52],
        [46, 62],
      ].map(([l, tp], i) => (
        <span key={i} className="absolute size-[10%] rotate-45 rounded-[1px]" style={{ left: `${l}%`, top: `${tp}%`, background: 'var(--color-g-crystite)', opacity: k, boxShadow: '0 0 6px var(--color-g-crystite)' }} />
      ))}
    </div>
  );
}

// --- Over the map: what each plot lost, and what stays on it ------------------------------------------------------

/**
 * Each hit throws its change up off the plot, then the chip settles on the plot's top edge and stays. With `slot`,
 * only that player's plots: a phone beside a TV marks your own.
 */
export function Marks({ size, slot }: { size: ShowSize; slot?: Slot }) {
  const { s, t, reduced, grid, cast } = useShow();
  const lift = cq(size, 34, 16);
  return (
    <>
      {eventLanded(s, t, reduced, grid).map(({ ev, hit, at }) => {
        const text = hitText(hit);
        if (hit.delta === 0 && !text) return null;
        if (slot !== undefined && cast.slotOf(cast.ownerAt(hit.x, hit.y) ?? '') !== slot) return null;
        const since = t - at;
        const rise = reduced ? 0 : since < 0.45 ? (since / 0.45) * lift : since < 1.3 ? lift * (1 - (since - 0.45) / 0.85) : 0;
        return (
          <OnPlot key={`${hit.x},${hit.y},${ev.key}`} x={hit.x} y={hit.y} testId={`mark-${hit.x}-${hit.y}`} rise={`${rise}cqw`} className={cx(!reduced && 'animate-[ev-pop_0.35s_ease-out]')}>
            <span className="flex flex-col items-center gap-0.5">
              <EventDeltaChip delta={hit.delta} good={hit.good ?? cast.goodAt(hit.x, hit.y)} lost={!!text} text={text} size={size === 'tv' ? 'tv' : 'phone'} />
            </span>
          </OnPlot>
        );
      })}
    </>
  );
}

/** The player's spotlight and the dim, under the bars. */
export function Shade() {
  const { dim, player, spot, place, lens } = useEventLivingView();
  const { grid } = useShow();
  return (
    <>
      {player && <Spotlight id={player} amount={spot} />}
      {/* While a story plays, the map darkens round its place, so the eye goes where it happens. */}
      {place && lens > 0 && (
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${((place.x + 0.5) / grid.width) * 100}% ${((place.y + 0.5) / grid.height) * 100}%, transparent 0 16%, color-mix(in srgb, var(--color-void) 72%, transparent) 46%)`, opacity: lens }} data-testid="vignette" />
      )}
      <Dim amount={dim} />
    </>
  );
}
