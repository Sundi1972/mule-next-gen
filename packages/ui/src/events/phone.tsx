import { cx } from '../components/tokens';
import { eventMissLine, eventSegLabel, segTitle, eventWhoLine, eventYouSummary } from './copy';
import { signLook, useShow } from './frame';
import { EventBuzz, EventSignBadge } from './glyphs';
import { eventStageAt, type EventSegment } from './timing';

/**
 * The phone's rail through a phase, inside <EventShow>; the screen's shell places it. One small card at a time
 * enters, so the phase start carries no heavy paint.
 */

/**
 * The event's card. `news` is the moment it is announced (who, what, look at the TV); `you` is after it lands: what it
 * did to you, or where it went instead.
 */
export function EventPhoneCard({ seg, me, at, buzz = false }: { seg: EventSegment; me: string; at: 'news' | 'you'; buzz?: boolean }) {
  const { cast } = useShow();
  const ev = seg.events[0]!;
  const you = eventYouSummary(seg, me, cast);
  const sign = signLook(ev.sign);
  const mixed = sign === 'neutral';
  const tone = mixed ? 'border-holo bg-holo-soft' : sign === 'good' ? 'border-ok bg-holo-soft' : 'border-alert bg-alert-bg';
  const ink = mixed ? 'text-holo!' : sign === 'good' ? 'text-ok!' : 'text-alert-ink!';
  return (
    <div key={`${seg.n}-${at}`} className={cx('flex flex-col gap-1.5 rounded-panel border-2 p-2.5 animate-[ev-drop_0.3s_ease-out]', tone)} data-testid="phone-card" data-at={at} data-event={ev.key}>
      <div className="flex items-center gap-2">
        <EventSignBadge ev={ev} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className={cx('label-caps text-[10px]!', ink)}>{eventSegLabel(seg)}</span>
          <span className="font-display text-lg font-bold leading-tight">{segTitle(seg)}</span>
        </span>
        <span className="ml-auto">
          <EventBuzz on={buzz} />
        </span>
      </div>
      {at === 'news' && (
        <span className="text-xs leading-snug text-ink-2">
          {eventWhoLine(ev, cast)}. {ev.line}
        </span>
      )}
      {at === 'news' && ev.weight === 'headline' && <span className="w-fit rounded-chip bg-holo px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-holo">LOOK AT THE TV ▸</span>}
      {at === 'you' &&
        (you ? (
          <div className="flex flex-col gap-1 animate-[ev-pop_0.3s_ease-out]" data-testid="phone-you">
            <span className={cx('flex items-center gap-1.5 font-display text-base font-bold', sign === 'good' ? 'text-ok' : 'text-alert-ink')}>{you.headline}</span>
            <span className="text-xs leading-snug text-ink-2">{you.detail}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1" data-testid="phone-miss">
            <span className="text-xs leading-snug text-ink-2">{eventMissLine(seg, cast)}</span>
          </div>
        ))}
    </div>
  );
}

/** Before the first event, and after the last when nothing stays up. */
export function EventWaiting() {
  const { s, t } = useShow();
  const period = s.phase === 'development' ? 'turn' : 'month';
  return <span className="label-caps">{t < s.intro ? (s.segments.length ? `${s.events.length} event${s.events.length > 1 ? 's' : ''} this ${period}` : 'A quiet month') : 'That’s everything'}</span>;
}

/** On a phone alone, while the weather plays on the map: a small "now" line, so the rail doesn't repeat the card. */
export function EventNowPlaying({ seg, buzz }: { seg: EventSegment; buzz: boolean }) {
  const { cast } = useShow();
  const ev = seg.events[0]!;
  return (
    <div className="flex items-center gap-2 rounded-panel border border-holo-line bg-raised p-2 animate-[ev-drop_0.3s_ease-out]" data-testid="phone-now">
      <EventSignBadge ev={ev} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="label-caps text-[10px]!">{eventSegLabel(seg)}</span>
        <span className="font-display text-base font-bold leading-tight">{segTitle(seg)}</span>
        <span className="truncate text-[11px] text-ink-2">{eventWhoLine(ev, cast)}</span>
      </span>
      <span className="ml-auto">
        <EventBuzz on={buzz} />
      </span>
    </div>
  );
}

/** Under the current card: the phase's earlier events, one line each. */
export function EventRailTail({ me, current }: { me: string; current: EventSegment | null }) {
  const { s, t, cast } = useShow();
  const done = s.segments.filter((g) => t >= g.settleAt && g !== current);
  return (
    <>
      {done.map((g) => {
        const you = eventYouSummary(g, me, cast);
        const good = signLook(g.events[0]!.sign) === 'good';
        return (
          <div key={g.n} className="flex items-center gap-2 rounded-control bg-raised px-2 py-1">
            <EventSignBadge ev={g.events[0]!} size={22} />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{segTitle(g)}</span>
            <span className={cx('text-xs', you ? (good ? 'font-bold text-ok' : 'font-bold text-alert-ink') : 'text-ink-3')}>{you ? you.headline.replace(' for you', '') : 'not you'}</span>
          </div>
        );
      })}
    </>
  );
}

/**
 * With no TV in the room, the rail beside the phone's own show: what is playing, then what it did to you, the skip
 * hint (when the map can be tapped), and the phase's earlier events.
 */
export function EventSoloRail({ me, canSkip = false }: { me: string; canSkip?: boolean }) {
  const { s, t } = useShow();
  const { seg, stage } = eventStageAt(s, t);
  const shown = seg ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  const playing = seg !== null && t < seg.settleAt - 0.05;
  return (
    <>
      {!shown ? <EventWaiting /> : t < shown.settleAt - 0.2 ? <EventNowPlaying seg={shown} buzz={t - shown.announceAt < 1.2} /> : <EventPhoneCard seg={shown} me={me} at="you" />}
      {seg && canSkip && (
        <span className="mt-auto self-end rounded-chip bg-void/75 px-1.5 py-0.5 font-mono text-[10px] text-ink-2" data-testid="skip-hint">
          {playing ? 'tap the map to skip ›' : 'tap the map: next ›'}
        </span>
      )}
      <EventRailTail me={me} current={shown} />
    </>
  );
}
