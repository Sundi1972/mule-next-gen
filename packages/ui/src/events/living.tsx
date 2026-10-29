import type { CSSProperties } from 'react';
import { PlayerMark } from '../components/PlayerMark';
import { cx, type Slot } from '../components/tokens';
import { EVENT_ENTRY, STORY } from './catalogue';
import { introLine, eventSegLabel, eventWhoLine, phaseNoun } from './copy';
import { signLook, useShow, type ShowFrame } from './frame';
import { band, clamp, Dim, EDGE, OnPlot, ramp, Spotlight, Swarm, Trail } from './fx';
import { accent, EventDeltaChip, EventGlyph, EventSignBadge } from './glyphs';
import { eventHitAt, eventLanded, eventStageAt, eventFrontAt, type EventSegment } from './timing';
import type { ShowEventKey, ShowEventView, ShowSize } from './types';

/**
 * Living weather: one engine for the TV and for a phone with no TV in the room. The map dims,
 * a title card names the event, flies to where it starts and becomes it; hit plots throw up what they lost. Every
 * layer is a pure function of the show clock. Sizes are shares of the map box's width (cqw: the box is a container),
 * so the show fits whatever box the screen gives it. On a phone: no blur, only transform and opacity change.
 */

/** A length the gallery drew at `tv` px on its 820 px TV map and `phone` px on its 540 px phone map, as cqw. */
const cq = (size: ShowSize, tv: number, phone: number) => (size === 'tv' ? tv / 8.2 : phone / 5.4);
const ease = (v: number) => v * v * (3 - 2 * v);

/** Where an event's story happens, in tiles: its origin; null for the whole map. */
export function storyPlace(ev: ShowEventView): { x: number; y: number } | null {
  return STORY[ev.key]?.focus === 'origin' ? ev.origin : null;
}

/** When the camera pulls back from a segment's story: at its reveal, or as soon as it plays. */
export const cardAt = (seg: EventSegment) => seg.playAt + (STORY[seg.events[0]!.key]?.reveal ?? 0) * seg.pace;

// --- What the show does to the whole map --------------------------------------------------------------------------

/** The map's state at `t`: the segment, how dim it is, whose land is in the spotlight, and the camera. */
export function livingAt({ s, t, reduced, grid, cast }: ShowFrame) {
  const { stage, seg } = eventStageAt(s, t);
  const quiet = s.segments.length === 0;
  const ev = seg?.events[0];
  const player = ev && ev.weight === 'spotlight' ? cast.playerOf(ev) : undefined;
  const spot = player && seg ? ramp(t, seg.playAt - 0.5, 0.5) * (1 - ramp(t, seg.endAt - 0.5, 0.5)) : 0;
  // The map dims under the intro and each title card, and clears as the card flies off.
  const story = ev ? STORY[ev.key] : undefined;
  const dim = quiet ? 0 : stage === 'intro' ? ramp(t, s.start, 0.3) : seg && stage === 'announce' ? ramp(t, seg.announceAt, 0.3) * (1 - ramp(t, seg.playAt - 0.5, 0.5)) : 0;
  // The camera flies in to where the story happens while it plays, and pulls back after its reveal. Never without motion.
  const place = ev && seg && !reduced ? storyPlace(ev) : null;
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
  return { stage, seg, dim, player, spot, quiet, view: camera, place, lens };
}

/** The same, for a layer inside <EventShow>; the caller reads it to glow the spotlit player's slot. */
export function useEventLivingView() {
  return livingAt(useShow());
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
  switch (EVENT_ENTRY[ev.key].motion) {
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
};

/** A front crosses the map from its edge, in the event's colour and texture: the production show's storm, generalised. */
function Front({ ev, seg, size }: { ev: ShowEventView; seg: EventSegment; size: ShowSize }) {
  const { t, reduced } = useShow();
  const p = eventFrontAt(seg, t);
  if (reduced || p < -0.2 || p > 1.3) return null;
  const c = accent(ev.key);
  const dir = ev.from ?? 'w';
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
          className={cx('absolute', ev.key !== 'solarFlare' && 'animate-[show-dust-drift_0.5s_linear_infinite]')}
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
        if (hit.delta === 0) return null;
        if (slot !== undefined && cast.slotOf(cast.ownerAt(hit.x, hit.y) ?? '') !== slot) return null;
        const since = t - at;
        const rise = reduced ? 0 : since < 0.45 ? (since / 0.45) * lift : since < 1.3 ? lift * (1 - (since - 0.45) / 0.85) : 0;
        return (
          <OnPlot key={`${hit.x},${hit.y},${ev.key}`} x={hit.x} y={hit.y} testId={`mark-${hit.x}-${hit.y}`} rise={`${rise}cqw`} className={cx(!reduced && 'animate-[ev-pop_0.35s_ease-out]')}>
            <span className="flex flex-col items-center gap-0.5">
              <EventDeltaChip delta={hit.delta} good={cast.goodAt(hit.x, hit.y)} size={size === 'tv' ? 'tv' : 'phone'} />
            </span>
          </OnPlot>
        );
      })}
    </>
  );
}

// --- The cards over the map ---------------------------------------------------------------------------------------

const SIZES = {
  tv: { intro: 'text-5xl', badge: 120, introBadge: 72, title: 'text-7xl', who: 'text-3xl', line: 'text-2xl', label: 'text-lg!', mark: 40, width: 640, lineWidth: 560 },
  phone: { intro: 'text-2xl', badge: 64, introBadge: 40, title: 'text-4xl', who: 'text-lg', line: 'text-sm', label: 'text-[11px]!', mark: 22, width: 460, lineWidth: 400 },
} as const;
const BACKDROP = { background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-void) 85%, transparent), transparent)' };
const widthOf = (size: ShowSize, key: 'width' | 'lineWidth') => `${cq(size, SIZES.tv[key], SIZES.phone[key])}cqw`;

/** The phase opens on what fired: a centred card with one badge per event, the map dim behind it. */
export function IntroCard({ size }: { size: ShowSize }) {
  const { s, t } = useShow();
  const z = SIZES[size];
  const out = ramp(t, s.intro - 0.35, 0.35);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ opacity: 1 - out }} data-testid="intro-card">
      <div className={cx('flex flex-col items-center rounded-sheet text-center animate-[ev-pop_0.45s_ease-out]', size === 'tv' ? 'gap-4 px-10 py-8' : 'gap-2 px-6 py-4')} style={BACKDROP}>
        <span className={cx('label-caps', z.label)}>{`This ${phaseNoun(s.phase)}`}</span>
        <span className={cx('font-display font-bold', z.intro)}>{introLine(s.segments.length, s.phase)}</span>
        <span className={cx('flex', size === 'tv' ? 'gap-4' : 'gap-2')}>
          {s.segments.map((g) => (
            <span key={g.n} className="flex -space-x-3 animate-[ev-pop_0.4s_ease-out_both]" style={{ animationDelay: `${0.25 + g.n * 0.18}s` }}>
              {g.events.map((e, i) => (
                <EventSignBadge key={i} ev={e} size={z.introBadge} />
              ))}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** One event's title card: in the middle of the map, then off to where the event starts. */
export function TitleCard({ seg, size }: { seg: EventSegment; size: ShowSize }) {
  const { t, reduced, grid, cast } = useShow();
  const ev = seg.events[0]!;
  const z = SIZES[size];
  const k = ramp(t, seg.playAt - 0.5, 0.5);
  // It flies to where the event starts: in percent of the map, from its middle.
  const to = { x: ((ev.origin.x + 0.5) / grid.width - 0.5) * 100, y: ((ev.origin.y + 0.5) / grid.height - 0.5) * 100 };
  const fly = reduced ? 'none' : `translate(${to.x * k}%, ${to.y * k}%) scale(${1 - 0.85 * k})`;
  const player = cast.playerOf(ev);
  const slot = player ? cast.slotOf(player) : undefined;
  const sign = signLook(ev.sign);
  return (
    <div className="absolute inset-0 z-20" data-testid="title-card">
      <div key={seg.n} className="absolute inset-0 flex items-center justify-center" style={{ transform: fly, opacity: 1 - k }}>
        <div className="flex flex-col items-center text-center" style={{ width: widthOf(size, 'width') }}>
          <div className={cx('flex flex-col items-center rounded-sheet animate-[ev-pop_0.45s_ease-out]', size === 'tv' ? 'gap-3 px-10 py-6' : 'gap-1.5 px-6 py-3')} style={BACKDROP}>
            <EventSignBadge ev={ev} size={z.badge} />
            <span className={cx('label-caps', z.label, sign === 'good' ? 'text-ok!' : sign === 'neutral' ? 'text-holo!' : 'text-alert-ink!')}>{eventSegLabel(seg)}</span>
            <span className={cx('font-display font-bold leading-none', z.title)} style={{ textShadow: '0 4px 24px var(--color-void)' }}>
              {ev.title}
            </span>
            <span className={cx('flex items-center gap-2 font-display font-semibold', z.who)}>
              {slot !== undefined && <PlayerMark slot={slot} size={z.mark} />}
              {eventWhoLine(ev, cast)}
            </span>
            <span className={cx('leading-snug text-ink-2', z.line)} style={{ maxWidth: widthOf(size, 'lineWidth'), textShadow: '0 2px 12px var(--color-void)' }}>
              {ev.line}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Everything that goes over the map: the intro and the title card. */
export function Overlays({ size }: { size: ShowSize }) {
  const { stage, seg, quiet } = useEventLivingView();
  return (
    <>
      {!quiet && stage === 'intro' && <IntroCard size={size} />}
      {seg && stage === 'announce' && <TitleCard seg={seg} size={size} />}
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
