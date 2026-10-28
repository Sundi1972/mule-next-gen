import { cx, MuleIcon, PlayerMark, type MapTile } from '@mule/ui';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { ENTRY, type EventKey } from './catalogue';
import { effectWords, hitText, introLine, label, name, segTitle, who } from './copy';
import { effectsAt, frontAt, hitAt, impactAt, isRollCall, landed, stageAt, TIER, type Effect, type Segment, type ShowEvent } from './events';
import { H, SEATS, seat, TILES, W } from './fixture';
import { band, clamp, Crater, Dim, EDGE, MeteorFall, OnPlot, ramp, Spotlight, Swarm, Trail } from './fx';
import { accent, DeltaChip, EffectChip, EventGlyph, SignBadge } from './glyphs';
import { cell, centre, useShow } from './stage';
import { STORY } from './story';

/**
 * B · Living weather, Heiko's pick (28 Oct). One engine for the TV and for a phone with no TV in the room: the map
 * dims, a title card names the event, flies to where it starts and becomes it; hit plots throw up what they lost.
 * Every layer is a pure function of the show clock, sized by `size`. On a phone: no blur, one motion at a time, only
 * transform and opacity change from frame to frame.
 */

export type Size = 'tv' | 'phone';
export const MAP: Record<Size, { w: number; h: number }> = { tv: { w: 820, h: 492 }, phone: { w: 540, h: 324 } };
export const STORE = { x: 6, y: 4 };
const ease = (v: number) => v * v * (3 - 2 * v);

/** Where an event's story happens, in tiles: the store, its origin, or a point of its own; null for the whole map. */
export function storyPlace(ev: ShowEvent): { x: number; y: number } | null {
  const f = STORY[ev.key]?.focus;
  return !f ? null : f === 'store' ? STORE : f === 'origin' ? ev.origin : f;
}

/** When a segment's card of what was lost comes up: at its story's reveal, or as soon as it plays. */
export const cardAt = (seg: Segment) => seg.playAt + (STORY[seg.events[0]!.key]?.reveal ?? 0) * seg.pace;

// --- What the show does to the whole map --------------------------------------------------------------------------

/** The map's state at `t`: the segment, how dim it is, whose land is in the spotlight, and whether it shakes. */
export function useLiving(size: Size) {
  const { s, t, reduced } = useShow();
  const { stage, seg } = stageAt(s, t);
  const quiet = s.segments.every(isRollCall);
  const ev = seg?.events[0];
  const motion = ev ? ENTRY[ev.key].motion : null;
  const player = ev && TIER[ev.key] === 'spotlight' && ev.player ? ev.player : undefined;
  const spot = player && seg ? ramp(t, seg.playAt - 0.5, 0.5) * (1 - ramp(t, seg.endAt - 0.5, 0.5)) : 0;
  // The map dims under the intro and each title card, clears as the card flies off, and stays half dim under a
  // card of changes off the map (money, goods, gauges).
  const story = ev ? STORY[ev.key] : undefined;
  const offMap = (motion === 'ledger' || motion === 'colony' || motion === 'store') && !!ev?.effects?.length;
  const dim = quiet
    ? 0
    : stage === 'intro'
      ? ramp(t, 0, 0.3)
      : seg && !isRollCall(seg) && stage === 'announce'
        ? ramp(t, seg.announceAt, 0.3) * (offMap && !story ? 1 - 0.4 * ramp(t, seg.playAt - 0.5, 0.5) : 1 - ramp(t, seg.playAt - 0.5, 0.5))
        : seg && offMap && (stage === 'play' || stage === 'settle') && t >= cardAt(seg)
          ? 0.6 * ramp(t, cardAt(seg), 0.3) * (1 - ramp(t, seg.endAt - 0.4, 0.4))
          : 0;
  const amp = size === 'tv' ? 1 : 0.5;
  const jolt = s.segments.flatMap((g) => g.events.flatMap((e) => (e.key === 'meteorStrike' ? [impactAt(g)] : STORY[e.key]?.jolt !== undefined ? [g.playAt + STORY[e.key]!.jolt! * g.pace] : []))).find((at) => t >= at && t < at + 0.6);
  const shake = jolt !== undefined && !reduced ? `translate(${Math.sin(t * 80) * 5 * amp * (1 - (t - jolt) / 0.6)}px, ${Math.cos(t * 63) * 3 * amp}px)` : undefined;
  // The camera flies in to where the story happens while it plays, and pulls back for the card of what was lost.
  const place = ev && seg && !reduced ? storyPlace(ev) : null;
  const lens = place && seg ? ease(ramp(t, seg.playAt - 0.3, 0.8)) * (1 - ease(ramp(t, cardAt(seg) - 0.2, 0.8))) : 0;
  const camera = (() => {
    if (!place || !seg || !story?.zoom) return undefined;
    const e = lens;
    if (e <= 0) return undefined;
    const m = MAP[size];
    const k = 1 + (story.zoom - 1) * e;
    const p = { x: ((place.x + 0.5) / W) * m.w - m.w / 2, y: ((place.y + 0.5) / H) * m.h - m.h / 2 };
    // Zoom about the place, then slide it toward the middle, never showing past the map's edge.
    const edge = (v: number, half: number) => Math.max(-(k - 1) * half, Math.min((k - 1) * half, v));
    return `translate(${edge(p.x * (1 - e - k), m.w / 2)}px, ${edge(p.y * (1 - e - k), m.h / 2)}px) scale(${k})`;
  })();
  const view = [camera, shake].filter(Boolean).join(' ') || undefined;
  return { stage, seg, dim, player, spot, shake, quiet, view, place, lens };
}

/** The map as it changes: a cavern caves in, a MULE is taken, a plot is flagged for sale, once each lands. */
export function useLiveTiles(): MapTile[] {
  const { s, t, reduced, tiles = TILES } = useShow();
  const changed = landed(s, t, reduced).filter((l) => l.hit.becomes || l.ev.key === 'colonyPlot');
  const key = changed.map((l) => `${l.hit.x},${l.hit.y}`).join('|');
  const offered = s.events.filter((e) => e.key === 'colonyPlot').flatMap((e) => e.plots);
  return useMemo(() => {
    const at = (x: number, y: number) => changed.find((l) => l.hit.x === x && l.hit.y === y);
    return tiles.map((tile) => {
      const l = at(tile.x, tile.y);
      const forSale = offered.some((h) => h.x === tile.x && h.y === tile.y);
      if (!l) return forSale ? { ...tile, flag: undefined } : tile;
      if (l.ev.key === 'colonyPlot') return { ...tile, flag: 'sale' as const };
      const { special: _special, good: _good, ...rest } = tile;
      if (l.hit.becomes === 'plain') return tile.good ? { ...rest, good: tile.good } : rest;
      return tile.special ? { ...rest, special: tile.special } : rest;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names exactly the changes that have landed
  }, [key, tiles]);
}

/** Each segment's own motion over the map, under the bars, from when it starts to play. */
export function Weather({ size }: { size: Size }) {
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

function EventWeather({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  if (STORY[ev.key]) return null;
  switch (ENTRY[ev.key].motion) {
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
      return <MeteorFall ev={ev} seg={seg} tv={size === 'tv'} look="fireball" />;
    case 'plot':
      return <PlotFx ev={ev} seg={seg} size={size} />;
    case 'plots':
      return <HitTint ev={ev} seg={seg} stripes />;
    case 'colonists':
      return ev.key === 'epidemic' ? <Haze ev={ev} seg={seg} /> : null;
    case 'store':
      return <StoreFx ev={ev} seg={seg} size={size} />;
    default:
      return null;
  }
}

// --- The motion families -----------------------------------------------------------------------------------------

/** Each sweep's texture, crossing the map in its band: dust streaks, heat shimmer, rain, sun rays, frost. */
const TEXTURE: Partial<Record<EventKey, (angle: number, c: string) => string>> = {
  dustStorm: (a, c) => `repeating-linear-gradient(${a + 10}deg, transparent 0 14px, color-mix(in srgb, ${c} 55%, white) 14px 16px, transparent 16px 30px)`,
  drought: (a, c) => `repeating-linear-gradient(${a + 90}deg, transparent 0 9px, color-mix(in srgb, ${c} 45%, white) 9px 10px, transparent 10px 20px)`,
  acidRain: (a, c) => `repeating-linear-gradient(${a + 70}deg, transparent 0 8px, color-mix(in srgb, ${c} 85%, white) 8px 9.5px, transparent 9.5px 16px)`,
  solarFlare: (_a, c) => `repeating-conic-gradient(from 0deg at 50% -30%, color-mix(in srgb, ${c} 45%, transparent) 0 3deg, transparent 3deg 11deg)`,
  coldSnap: (_a, c) => `radial-gradient(circle, color-mix(in srgb, ${c} 90%, white) 0 1.6px, transparent 2.2px) 0 0 / 16px 16px`,
};

/** A front crosses the map from its edge, in the event's colour and texture: the production show's storm, generalised. */
function Front({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const p = frontAt(seg, t);
  if (reduced || p < -0.2 || p > 1.3) return null;
  const c = accent(ev.key);
  const dir = ev.direction ?? 'w';
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
function Comet({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const p = frontAt(seg, t);
  if (reduced || p < -0.1 || p > 1.2) return null;
  const c = accent(ev.key);
  const dir = ev.direction ?? 'w';
  const along = -8 + p * 116;
  const pos: CSSProperties = dir === 'w' || dir === 'e' ? { left: `${dir === 'w' ? along : 100 - along}%`, top: '20%' } : { top: `${dir === 'n' ? along : 100 - along}%`, left: '28%' };
  const turn = { w: 0, e: 180, n: 90, s: 270 }[dir];
  return (
    <div
      className="absolute rounded-full"
      style={{
        ...pos,
        width: size === 'tv' ? 320 : 150,
        height: size === 'tv' ? 14 : 7,
        transform: `translate(-100%, -50%) rotate(${turn}deg)`,
        transformOrigin: '100% 50%',
        background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${c} 55%, transparent) 55%, white)`,
        boxShadow: `0 0 24px 6px color-mix(in srgb, ${c} 50%, transparent)`,
      }}
      data-testid="comet"
    />
  );
}

/** Where a sweep or a placard has landed, the plot keeps a mark: a tint for a loss, a glow for a gain, stripes for a strike. */
function HitTint({ ev, seg, stripes }: { ev: ShowEvent; seg: Segment; stripes?: boolean }) {
  const { t, reduced } = useShow();
  const c = accent(ev.key);
  return (
    <>
      {ev.plots.map((h) => {
        const since = t - hitAt(seg, ev, h, reduced);
        if (since < 0) return null;
        const glint = ev.sign === 'good' && !reduced && since < 0.8;
        return (
          <div
            key={`${h.x},${h.y}`}
            className="absolute rounded-[10%]"
            style={{
              ...cell(h.x, h.y),
              background: stripes
                ? `repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-alert) 34%, transparent) 0 5px, transparent 5px 11px)`
                : ev.sign === 'good'
                  ? 'transparent'
                  : `color-mix(in srgb, ${c} 30%, transparent)`,
              boxShadow: ev.sign === 'good' ? `inset 0 0 0 2px ${c}, 0 0 ${glint ? 22 : 10}px ${glint ? 6 : 2}px color-mix(in srgb, ${c} 60%, transparent)` : undefined,
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
function Fire({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t, reduced } = useShow();
  const c = accent(ev.key);
  return (
    <>
      <Trail ev={ev} seg={seg} colour={c} width={0.05} />
      {ev.plots.map((h) => {
        const since = t - hitAt(seg, ev, h, reduced);
        if (since < -0.3) return null;
        const first = h.order === 0;
        const burning = !reduced && since < 1.6;
        return (
          <div key={`${h.x},${h.y}`} className="absolute rounded-[10%]" style={{ ...cell(h.x, h.y), background: first ? `color-mix(in srgb, var(--color-void) ${clamp(since / 1.4) * 70}%, transparent)` : `color-mix(in srgb, ${c} ${clamp(since / 0.5) * 30}%, transparent)` }}>
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
function Flood({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t, reduced, tiles = TILES } = useShow();
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
        [0, 0.3, 0.6].map((d) => since - d).filter((v) => v > 0 && v < 1.4).map((v, i) => <span key={i} className="absolute rounded-full border-2" style={{ ...centre(o.x, o.y), borderColor: c, width: `${v * 22}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', opacity: 1 - v / 1.4 }} />)}
      {ev.plots.map((h) => {
        const k = clamp((t - hitAt(seg, ev, h, reduced)) / 0.5);
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
function Ash({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const since = t - seg.playAt;
  const o = centre(ev.origin.x, ev.origin.y);
  const unit = size === 'tv' ? 1 : 0.6;
  return (
    <>
      {!reduced &&
        since < 2.6 &&
        [0, 0.25, 0.5, 0.75, 1].map((d, i) => {
          const v = since - d;
          if (v < 0) return null;
          return <span key={i} className="absolute rounded-full" style={{ ...o, width: (24 + v * 30) * unit, height: (24 + v * 30) * unit, transform: `translate(calc(-50% + ${(i % 2 ? 1 : -1) * v * 8 * unit}px), calc(-50% - ${v * 60 * unit}px))`, background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-alloy) 80%, transparent), transparent 70%)', opacity: clamp(1 - v / 1.6) }} />;
        })}
      {ev.plots.map((h) => {
        const k = clamp((t - hitAt(seg, ev, h, reduced)) / 0.5);
        return k > 0 && <div key={`${h.x},${h.y}`} className="absolute rounded-[10%]" style={{ ...cell(h.x, h.y), background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-alloy) 85%, transparent) 0 1.2px, transparent 1.8px) 0 0 / 7px 7px, color-mix(in srgb, var(--color-g-alloy) 25%, transparent)', opacity: k }} />;
      })}
    </>
  );
}

/** Something happens to one plot, without travel: a glow, a crack, a theft, a flag. */
function PlotFx({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const c = accent(ev.key);
  return (
    <>
      {ev.plots.map((h) => {
        const at = hitAt(seg, ev, h, reduced);
        const since = t - at;
        if (since < -0.6) return null;
        const ring = (colour: string, pulse: boolean) => <div className={cx('absolute rounded-[12%]', pulse && !reduced && 'animate-[pulse-glow_1.2s_ease-in-out_infinite]')} style={{ ...cell(h.x, h.y), boxShadow: `inset 0 0 0 ${size === 'tv' ? 3 : 2}px ${colour}, 0 0 18px 4px color-mix(in srgb, ${colour} 60%, transparent)`, opacity: clamp((since + 0.6) / 0.4) }} />;
        switch (ev.key) {
          case 'bumperHarvest':
          case 'loyalCrew':
            return <div key={`${h.x},${h.y}`}>{ring(c, since < 1.6)}</div>;
          case 'colonyPlot':
            return <div key={`${h.x},${h.y}`}>{ring('var(--color-holo)', true)}</div>;
          case 'cavernCollapse':
            return (
              <div key={`${h.x},${h.y}`} className="absolute" style={cell(h.x, h.y)}>
                <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden>
                  <path d="M20 3 17 13l6 5-5 8 4 11M17 13l-8 4M23 18l9-2" fill="none" stroke="var(--color-ink)" strokeWidth={2.2} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={reduced ? 0 : 1 - clamp((since + 0.5) / 0.5)} />
                </svg>
                {!reduced && since > 0 && since < 1 && <span className="absolute left-1/2 top-1/2 rounded-full border-2 border-g-alloy" style={{ width: `${60 + since * 140}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', opacity: 1 - since }} />}
              </div>
            );
          case 'muleTheft':
            return (
              <div key={`${h.x},${h.y}`} className="absolute overflow-visible" style={cell(h.x, h.y)}>
                {!reduced && since < 0 && <span className="absolute top-[20%] h-[60%] w-[70%] rounded-full bg-void/70" style={{ left: `${-60 + (since + 0.6) * 230}%`, filter: size === 'tv' ? 'blur(3px)' : undefined }} />}
                {!reduced && since >= 0 && since < 1 && (
                  <span className="absolute left-1/2 top-1/2 text-mule-metal" style={{ transform: `translate(-50%, calc(-50% - ${since * (size === 'tv' ? 60 : 30)}px))`, opacity: 1 - since }}>
                    <MuleIcon size={size === 'tv' ? 34 : 18} />
                  </span>
                )}
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

/** The epidemic: a pink haze rolls out from the store over the colonists. */
function Haze({ ev, seg }: { ev: ShowEvent; seg: Segment }) {
  const { t, reduced } = useShow();
  const since = t - seg.playAt;
  if (reduced || since > 2.2) return null;
  return <div className="absolute rounded-full" style={{ ...centre(ev.origin.x, ev.origin.y), width: `${clamp(since / 1.2) * 90}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', background: `radial-gradient(circle, color-mix(in srgb, ${accent(ev.key)} 40%, transparent), transparent 70%)`, opacity: 1 - clamp((since - 1.2) / 1) }} />;
}

/** At the store: a strike placard, flames and smoke, a riot's smoke. */
function StoreFx({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const since = t - hitAt(seg, ev, null, reduced);
  if (since < 0 || t > seg.endAt) return null;
  const smoke = ev.key !== 'storeStrike';
  const u = size === 'tv' ? 1 : 0.6;
  return (
    <div className="absolute" style={cell(STORE.x, STORE.y)} data-testid={`store-${ev.key}`}>
      {ev.key === 'storeStrike' && <div className="absolute inset-0 rounded-[10%]" style={{ background: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-alert) 45%, transparent) 0 5px, transparent 5px 11px)' }} />}
      {ev.key === 'storeFire' && (
        // Bigger than the store's tile, rising above it, so the fire reads from the couch.
        <div className="absolute -inset-x-[45%] bottom-[15%] h-[150%]">
          {[0, 30, 58].map((left, k) => (
            <span key={k} aria-hidden className={cx('absolute bottom-0 w-[44%] text-alert', !reduced && 'animate-[show-flicker_0.22s_ease-in-out_infinite_alternate]')} style={{ left: `${left}%`, animationDelay: `${k * 0.06}s`, transformOrigin: 'bottom' }}>
              <EventGlyph k="wildfire" size={30 * u} className="h-auto w-full drop-shadow-[0_0_6px_var(--color-warn)]" />
            </span>
          ))}
        </div>
      )}
      {smoke &&
        !reduced &&
        [0, 0.35, 0.7, 1.05].map((d, i) => {
          const v = (since - d) % 1.4;
          if (since < d) return null;
          return <span key={i} className="absolute left-1/2 top-0 rounded-full" style={{ width: (30 + v * 40) * u, height: (30 + v * 40) * u, transform: `translate(calc(-50% + ${(i % 2 ? 1 : -1) * 8 * u}px), calc(-50% - ${v * 70 * u}px))`, background: 'radial-gradient(circle, color-mix(in srgb, var(--color-ink-3) 85%, transparent), transparent 70%)', opacity: clamp(1 - v / 1.4) }} />;
        })}
    </div>
  );
}

// --- Over the map: what each plot lost, and what stays on it ------------------------------------------------------

/** Each hit throws its change up off the plot, then the chip settles on the plot's top edge and stays. */
export function Marks({ size }: { size: Size }) {
  const { s, t, reduced } = useShow();
  const lift = size === 'tv' ? 34 : 16;
  return (
    <>
      {landed(s, t, reduced).map(({ ev, hit, at }) => {
        const text = hitText(ev, hit);
        if (hit.delta === 0 && !text) return null;
        const since = t - at;
        const rise = reduced ? 0 : since < 0.45 ? (since / 0.45) * lift : since < 1.3 ? lift * (1 - (since - 0.45) / 0.85) : 0;
        const placard = ENTRY[ev.key].motion === 'plots' || ev.key === 'loyalCrew';
        return (
          <OnPlot key={`${hit.x},${hit.y},${ev.key}`} x={hit.x} y={hit.y} rise={rise} className={cx(!reduced && 'animate-[ev-pop_0.35s_ease-out]')}>
            <span className="flex flex-col items-center gap-0.5">
              {placard && <SignBadge ev={ev} size={size === 'tv' ? 30 : 18} />}
              <DeltaChip delta={hit.delta} good={hit.good} lost={hit.muleLost} text={text} size={size === 'tv' ? 'tv' : 'phone'} />
            </span>
          </OnPlot>
        );
      })}
      {/* The crater outlives the meteor's own layer. */}
      {s.segments.flatMap((g) => g.events.filter((e) => e.key === 'meteorStrike').map((e) => ({ g, e }))).map(({ g, e }) => t >= g.endAt && <Crater key={g.n} x={e.origin.x} y={e.origin.y} since={9} tv={size === 'tv'} />)}
    </>
  );
}

// --- The cards over the map ---------------------------------------------------------------------------------------

const SIZES = {
  tv: { intro: 'text-5xl', badge: 120, introBadge: 72, title: 'text-7xl', who: 'text-3xl', line: 'text-2xl', label: 'text-lg!', mark: 40, width: 640, lineWidth: 560 },
  phone: { intro: 'text-2xl', badge: 64, introBadge: 40, title: 'text-4xl', who: 'text-lg', line: 'text-sm', label: 'text-[11px]!', mark: 22, width: 460, lineWidth: 400 },
} as const;
const BACKDROP = { background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-void) 85%, transparent), transparent)' };

/** The phase opens on what fired: a centred card with one badge per event, the map dim behind it. */
export function IntroCard({ size }: { size: Size }) {
  const { s, t } = useShow();
  const z = SIZES[size];
  const out = ramp(t, s.intro - 0.35, 0.35);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ opacity: 1 - out }} data-testid="intro-card">
      <div className={cx('flex flex-col items-center rounded-sheet text-center animate-[ev-pop_0.45s_ease-out]', size === 'tv' ? 'gap-4 px-10 py-8' : 'gap-2 px-6 py-4')} style={BACKDROP}>
        <span className={cx('label-caps', z.label)}>{s.phase === 'development' ? 'This turn' : 'This month'}</span>
        <span className={cx('font-display font-bold', z.intro)}>{introLine(s.segments.length, s.phase, s.events)}</span>
        <span className={cx('flex', size === 'tv' ? 'gap-4' : 'gap-2')}>
          {s.segments.map((g) => (
            <span key={g.n} className="flex -space-x-3 animate-[ev-pop_0.4s_ease-out_both]" style={{ animationDelay: `${0.25 + g.n * 0.18}s` }}>
              {g.events.map((e, i) => (
                <SignBadge key={i} ev={e} size={isRollCall(g) && g.events.length > 1 ? z.introBadge * 0.7 : z.introBadge} />
              ))}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Where the title card flies to as the event begins: where it starts on the map, the store, or down to the slots. */
function target(ev: ShowEvent, size: Size): { x: number; y: number } | null {
  const m = MAP[size];
  const at = (p: { x: number; y: number }) => ({ x: ((p.x + 0.5) / W) * m.w, y: ((p.y + 0.5) / H) * m.h });
  if (STORY[ev.key]) return at(STORY[ev.key]!.focus === 'store' ? STORE : ev.origin);
  switch (ENTRY[ev.key].motion) {
    case 'ledger':
      return { x: m.w / 2, y: m.h * 1.15 };
    case 'colony':
      return null;
    case 'store':
    case 'colonists':
      return at(STORE);
    default:
      return at(ev.origin);
  }
}

/** One event's title card: in the middle of the map, then off to where the event starts. */
export function TitleCard({ seg, size }: { seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const ev = seg.events[0]!;
  const z = SIZES[size];
  const m = MAP[size];
  const k = ramp(t, seg.playAt - 0.5, 0.5);
  const to = target(ev, size);
  const fly = reduced ? 'none' : to ? `translate(${(to.x - m.w / 2) * k}px, ${(to.y - m.h / 2) * k}px) scale(${1 - 0.85 * k})` : `scale(${1 + 0.15 * k})`;
  const p = ev.player ? seat(ev.player) : null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" data-testid="title-card">
      <div key={seg.n} className="flex flex-col items-center text-center" style={{ width: z.width, transform: fly, opacity: 1 - k }}>
        <div className={cx('flex flex-col items-center rounded-sheet animate-[ev-pop_0.45s_ease-out]', size === 'tv' ? 'gap-3 px-10 py-6' : 'gap-1.5 px-6 py-3')} style={BACKDROP}>
          <SignBadge ev={ev} size={z.badge} />
          <span className={cx('label-caps', z.label, ev.sign === 'good' ? 'text-ok!' : ev.sign === 'neutral' ? 'text-holo!' : 'text-alert-ink!')}>{label(seg)}</span>
          <span className={cx('font-display font-bold leading-none', z.title)} style={{ textShadow: '0 4px 24px var(--color-void)' }}>
            {ev.title}
          </span>
          <span className={cx('flex items-center gap-2 font-display font-semibold', z.who)}>
            {p && <PlayerMark slot={p.slot} size={z.mark} />}
            {who(ev)}
          </span>
          <span className={cx('leading-snug text-ink-2', z.line)} style={{ maxWidth: z.lineWidth, textShadow: '0 2px 12px var(--color-void)' }}>
            {ev.line}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Changes off the map (money, held goods, the store, the colony's gauges) as a card over the dimmed map: each line
 * lands in turn, and on the TV the same chips land on the players' slots in the colony bar.
 */
export function EffectsCard({ seg, size }: { seg: Segment; size: Size }) {
  const { s, t, reduced } = useShow();
  const ev = seg.events[0]!;
  const fx = ev.effects ?? [];
  if (!fx.length || t < cardAt(seg) || t > seg.endAt) return null;
  const seen = effectsAt(s, t, reduced).filter((l) => l.seg === seg).map((l) => l.effect);
  const rows: { key: string; head: ReactNode; items: Effect[] }[] = [
    ...SEATS.filter((p) => fx.some((f) => f.on === p.id)).map((p) => ({ key: p.id, head: <SeatHead id={p.id} size={size} />, items: fx.filter((f) => f.on === p.id) })),
    ...(['colony', 'store'] as const).filter((on) => fx.some((f) => f.on === on)).map((on) => ({ key: on, head: <span className={cx('label-caps', size === 'tv' ? 'text-base!' : 'text-[10px]!')}>{on === 'colony' ? 'The colony' : 'The store'}</span>, items: fx.filter((f) => f.on === on) })),
  ];
  const out = ramp(t, seg.endAt - 0.4, 0.4);
  // At the store, the card sits at the map's foot so the flames and smoke on the store stay in view.
  const atStore = ENTRY[ev.key].motion === 'store' && !STORY[ev.key];
  return (
    <div className={cx('absolute inset-0 z-20 flex justify-center', atStore ? (size === 'tv' ? 'items-end pb-4' : 'items-end pb-1.5') : 'items-center')} style={{ opacity: 1 - out }} data-testid="effects-card">
      <div className={cx('flex flex-col rounded-panel border-2 bg-panel/95 shadow-chip animate-[ev-pop_0.35s_ease-out]', size === 'tv' ? 'w-[520px] gap-3 p-5' : 'w-[300px] gap-1.5 p-2.5')} style={{ borderColor: ev.sign === 'good' ? 'var(--color-ok)' : 'var(--color-alert)' }}>
        <span className="flex items-center gap-2">
          <SignBadge ev={ev} size={size === 'tv' ? 44 : 26} />
          <span className={cx('font-display font-bold', size === 'tv' ? 'text-3xl' : 'text-lg')}>{ev.title}</span>
        </span>
        {rows.map((r) => (
          <span key={r.key} className="flex items-center justify-between gap-3">
            {r.head}
            <span className="flex flex-wrap justify-end gap-1">
              {r.items.filter((f) => seen.includes(f) && f.what !== 'fund').map((f, i) => (
                <EffectChip key={i} f={f} size={size === 'tv' ? 'tv' : 'phone'} className={cx(!reduced && 'animate-[ev-pop_0.3s_ease-out]', size === 'tv' && 'text-xl!')} />
              ))}
            </span>
          </span>
        ))}
        {fx.some((f) => f.what === 'fund') && seen.some((f) => f.what === 'fund') && (
          <span className={cx('text-ink-2', size === 'tv' ? 'text-lg' : 'text-[11px]')}>Colony fund {effectWords(fx.find((f) => f.what === 'fund')!)}</span>
        )}
      </div>
    </div>
  );
}

function SeatHead({ id, size }: { id: string; size: Size }) {
  const p = seat(id);
  return (
    <span className={cx('flex items-center gap-2 font-display font-semibold', size === 'tv' ? 'text-2xl' : 'text-sm')}>
      <PlayerMark slot={p.slot} size={size === 'tv' ? 34 : 18} />
      {p.name}
    </span>
  );
}

/** The roll call: every bulletin of the phase in one lower third that never covers the map's middle. */
export function RollCall({ size }: { size: Size }) {
  const { s, t } = useShow();
  const seg = s.segments.find(isRollCall);
  if (!seg) return null;
  const from = seg.announceAt - (s.segments.length === 1 ? s.intro : 0);
  if (t < from || t > seg.endAt) return null;
  const out = ramp(t, seg.endAt - 0.4, 0.4);
  const sick = seg.events.every((e) => e.key === 'sickness');
  const tv = size === 'tv';
  return (
    <div className={cx('absolute z-20 animate-[ev-rise_0.4s_ease-out]', tv ? 'inset-x-6 bottom-5' : 'inset-x-2 bottom-2')} style={{ opacity: 1 - out }} data-testid="roll-call">
      <div className={cx('flex items-center rounded-panel border-2 bg-panel/95 shadow-chip', tv ? 'gap-5 px-5 py-3' : 'gap-2 px-2 py-1.5')} style={{ borderColor: sick ? 'var(--color-g-medicine)' : 'var(--color-holo)' }}>
        {tv && <SignBadge ev={seg.events[0]!} size={52} />}
        <span className="flex shrink-0 flex-col">
          <span className={cx('font-display font-bold leading-tight', tv ? 'text-3xl' : 'text-sm')}>{sick ? 'Sick this turn' : segTitle(seg)}</span>
          {tv && <span className="text-lg text-ink-2">{sick ? 'Sickness halves your walking pace.' : 'News for some of you.'}</span>}
        </span>
        <span className={cx('ml-auto flex flex-wrap justify-end', tv ? 'gap-4' : 'gap-2')}>
          {seg.events.map((e, i) => (
            <span key={i} className={cx('flex items-center', tv ? 'gap-2' : 'gap-1')}>
              <span className="relative">
                <PlayerMark slot={seat(e.player!).slot} size={tv ? 40 : 18} />
                <SignBadge ev={e} size={tv ? 24 : 13} className="absolute -bottom-1.5 -right-2" />
              </span>
              <span className="flex flex-col leading-tight">
                <span className={cx('font-display font-semibold', tv ? 'text-xl' : 'text-[11px]')}>{name(e.player!)}</span>
                <span className={cx('font-mono text-ink-2', tv ? 'text-base' : 'text-[9px]')}>{e.key === 'sickness' ? '50% pace' : (e.effects ?? []).filter((f) => f.on === e.player).map(effectWords).join(', ') || e.title}</span>
              </span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Everything that goes over the map: the intro, the title card, a card of changes off the map, the roll call. */
export function Overlays({ size }: { size: Size }) {
  const { s, t } = useShow();
  const { stage, seg, quiet } = useLiving(size);
  const offMap = seg && ['ledger', 'colony', 'store'].includes(ENTRY[seg.events[0]!.key].motion);
  return (
    <>
      {!quiet && stage === 'intro' && <IntroCard size={size} />}
      {seg && stage === 'announce' && !isRollCall(seg) && <TitleCard seg={seg} size={size} />}
      {seg && offMap && !isRollCall(seg) && t >= seg.playAt && <EffectsCard seg={seg} size={size} />}
      {s.segments.some(isRollCall) && <RollCall size={size} />}
    </>
  );
}

/** The player's spotlight and the dim, under the bars. */
export function Shade({ size }: { size: Size }) {
  const { dim, player, spot, place, lens } = useLiving(size);
  return (
    <>
      {player && <Spotlight id={player} amount={spot} />}
      {/* While a story plays, the map darkens round its place, so the eye goes where it happens. */}
      {place && lens > 0 && <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${((place.x + 0.5) / W) * 100}% ${((place.y + 0.5) / H) * 100}%, transparent 0 16%, color-mix(in srgb, var(--color-void) 72%, transparent) 46%)`, opacity: lens }} data-testid="vignette" />}
      <Dim amount={dim} />
    </>
  );
}
