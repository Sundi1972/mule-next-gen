import { PlayerMark } from '../components/PlayerMark';
import { cx } from '../components/tokens';
import { eventSegLabel, eventWhoLine, introLine, phaseNoun } from './copy';
import { signLook, useShow } from './frame';
import { ramp } from './fx';
import { EventSignBadge } from './glyphs';
import { cq, useEventLivingView } from './living';
import type { EventSegment } from './timing';
import type { ShowSize } from './types';

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
