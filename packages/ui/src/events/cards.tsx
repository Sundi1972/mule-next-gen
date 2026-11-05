import type { ReactNode } from 'react';
import { PlayerMark } from '../components/PlayerMark';
import { cx } from '../components/tokens';
import { motionOf, offMap, STORY } from './catalogue';
import { eventSegLabel, eventWhoLine, introLine, objectWords, phaseNoun } from './copy';
import { signLook, useShow } from './frame';
import { ramp } from './fx';
import { EventDeltaChip, EventEffectChip, EventSignBadge } from './glyphs';
import { cardAt, cq, useEventLivingView } from './living';
import { RollCall } from './rollcall';
import { eventEffectsAt, eventHitAt, isRollCall, type EventSegment } from './timing';
import type { ShowEffect, ShowEventView, ShowSize } from './types';

/** The cards over the map, outside its camera: the phase's intro card and each event's title card. */

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
        <span className={cx('font-display font-bold', z.intro)}>{introLine(s.segments.length, s.phase, s.events)}</span>
        <span className={cx('flex', size === 'tv' ? 'gap-4' : 'gap-2')}>
          {s.segments.map((g) => (
            <span key={g.n} className="flex -space-x-3 animate-[ev-pop_0.4s_ease-out_both]" style={{ animationDelay: `${0.25 + g.n * 0.18}s` }}>
              {g.events.map((e, i) => (
                <EventSignBadge key={i} ev={e} size={isRollCall(g) && g.events.length > 1 ? z.introBadge * 0.7 : z.introBadge} />
              ))}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * Where the title card flies to as the event begins, in percent of the map from its middle: where it starts on the
 * map (off-map events start at the store), or down to the players' slots for the ledger; null: the colony's own news,
 * which swells where it is.
 */
function flyTo(ev: ShowEventView, grid: { width: number; height: number }): { x: number; y: number } | null {
  // A story flies the card to where it plays; without one (a ledger bulletin played as a headline, if EVENT_SHOW's
  // weights change), the card goes where the change lands.
  if (!STORY[ev.key]) {
    if (motionOf(ev.key) === 'ledger') return { x: 0, y: 65 };
    if (motionOf(ev.key) === 'colony') return null;
  }
  return { x: ((ev.origin.x + 0.5) / grid.width - 0.5) * 100, y: ((ev.origin.y + 0.5) / grid.height - 0.5) * 100 };
}

/** One event's title card: in the middle of the map, then off to where the event starts. */
export function TitleCard({ seg, size }: { seg: EventSegment; size: ShowSize }) {
  const { t, reduced, grid, cast } = useShow();
  const ev = seg.events[0]!;
  const z = SIZES[size];
  const k = ramp(t, seg.playAt - 0.5, 0.5);
  const to = flyTo(ev, grid);
  const fly = reduced ? 'none' : to ? `translate(${to.x * k}%, ${to.y * k}%) scale(${1 - 0.85 * k})` : `scale(${1 + 0.15 * k})`;
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

/**
 * Changes off the map (money, held goods, the store, the colony's gauges) as a card over the dimmed map, from the
 * story's reveal: each change lands in turn, a row per player in seat order, then the colony's and the store's.
 */
export function EffectsCard({ seg, size }: { seg: EventSegment; size: ShowSize }) {
  const { s, t, reduced, grid, cast } = useShow();
  const ev = seg.events[0]!;
  const fx = ev.effects ?? [];
  const objects = objectWords(ev);
  if ((!fx.length && !objects.length) || t < cardAt(seg) || t > seg.endAt) return null;
  const seen = eventEffectsAt(s, t, reduced, grid)
    .filter((l) => l.seg === seg)
    .map((l) => l.effect);
  const tv = size === 'tv';
  const rows: { key: string; head: ReactNode; items: ShowEffect[] }[] = [
    ...cast.players.filter((p) => fx.some((f) => f.on === p.id)).map((p) => ({ key: p.id, head: <SeatHead id={p.id} size={size} />, items: fx.filter((f) => f.on === p.id) })),
    ...(['colony', 'store'] as const)
      .filter((on) => fx.some((f) => f.on === on) || (on === 'colony' && objects.length > 0))
      .map((on) => ({ key: on, head: <span className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>{on === 'colony' ? 'The colony' : 'The store'}</span>, items: fx.filter((f) => f.on === on) })),
  ];
  const out = ramp(t, seg.endAt - 0.4, 0.4);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ opacity: 1 - out }} data-testid="effects-card">
      <div className={cx('flex flex-col rounded-panel border-2 bg-panel/95 shadow-chip', !reduced && 'animate-[ev-pop_0.35s_ease-out]', tv ? 'gap-3 p-5' : 'gap-1.5 p-2.5')} style={{ width: `${cq(size, 520, 300)}cqw`, borderColor: signLook(ev.sign) === 'good' ? 'var(--color-ok)' : 'var(--color-alert)' }}>
        <span className="flex items-center gap-2">
          <EventSignBadge ev={ev} size={tv ? 44 : 26} />
          <span className={cx('font-display font-bold', tv ? 'text-3xl' : 'text-lg')}>{ev.title}</span>
        </span>
        {rows.map((r) => (
          <span key={r.key} className="flex items-center justify-between gap-3">
            {r.head}
            <span className="flex flex-wrap justify-end gap-1">
              {/* A damaged object counts 0 until repaired: the riot's loss to the colony, as it lands. */}
              {r.key === 'colony' &&
                t >= eventHitAt(seg, ev, ev.hits[0] ?? null, reduced, grid) &&
                objects.map((w) => <EventDeltaChip key={w} delta={-1} text={w} size={tv ? 'tv' : 'phone'} className={cx(!reduced && 'animate-[ev-pop_0.3s_ease-out]', tv && 'text-xl!')} />)}
              {r.items
                .filter((f) => seen.includes(f))
                .map((f, i) => (
                  <EventEffectChip key={i} f={f} size={tv ? 'tv' : 'phone'} className={cx(!reduced && 'animate-[ev-pop_0.3s_ease-out]', tv && 'text-xl!')} />
                ))}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SeatHead({ id, size }: { id: string; size: ShowSize }) {
  const { cast } = useShow();
  const slot = cast.slotOf(id);
  return (
    <span className={cx('flex items-center gap-2 font-display font-semibold', size === 'tv' ? 'text-2xl' : 'text-sm')}>
      {slot !== undefined && <PlayerMark slot={slot} size={size === 'tv' ? 34 : 18} />}
      {cast.name(id)}
    </span>
  );
}

/** Whether an event on the map also moved a colony gauge (a MULE theft's mood): its card says so. */
const movesGauge = (ev: ShowEventView) => (ev.effects ?? []).some((f) => f.on === 'colony' && (f.what === 'mood' || f.what === 'prestige' || f.what === 'air'));

/** Everything that goes over the map: the intro, the title card, a card of changes off the map, the roll call. */
export function Overlays({ size }: { size: ShowSize }) {
  const { t } = useShow();
  const { stage, seg, quiet } = useEventLivingView();
  return (
    <>
      {!quiet && stage === 'intro' && <IntroCard size={size} />}
      {seg && stage === 'announce' && !isRollCall(seg) && <TitleCard seg={seg} size={size} />}
      {seg && (offMap(seg.events[0]!.key) || movesGauge(seg.events[0]!)) && !isRollCall(seg) && t >= seg.playAt && <EffectsCard seg={seg} size={size} />}
      <RollCall size={size} />
    </>
  );
}
