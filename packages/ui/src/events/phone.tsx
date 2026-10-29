import { PlayerMark } from '../components/PlayerMark';
import { cx } from '../components/tokens';
import { eventMissLine, eventSegWho, eventSegLabel, phaseNoun, segTitle, eventWhoLine, eventYouSummary } from './copy';
import { signLook, useShow } from './frame';
import { EventBuzz, EventSignBadge } from './glyphs';
import { EventSickTag } from './rollcall';
import { eventStageAt, isBuzzing, isPlaying, isRollCall, type EventSegment } from './timing';

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
  const roll = isRollCall(seg);
  const sign = signLook(ev.sign);
  const mixed = sign === 'neutral' || seg.events.some((e) => e.sign !== ev.sign);
  const tone = mixed ? 'border-holo bg-holo-soft' : sign === 'good' ? 'border-ok bg-holo-soft' : 'border-alert bg-alert-bg';
  const ink = mixed ? 'text-holo!' : sign === 'good' ? 'text-ok!' : 'text-alert-ink!';
  return (
    <div key={`${seg.n}-${at}`} className={cx('flex flex-col gap-1.5 rounded-panel border-2 p-2.5 animate-[ev-drop_0.3s_ease-out]', tone)} data-testid="phone-card" data-at={at} data-event={ev.key}>
      <div className="flex items-center gap-2">
        {roll && seg.events.length > 1 ? (
          <span className="flex -space-x-2">
            {seg.events.map((e, i) => (
              <EventSignBadge key={i} ev={e} size={30} />
            ))}
          </span>
        ) : (
          <EventSignBadge ev={ev} size={40} />
        )}
        <span className="flex min-w-0 flex-col">
          <span className={cx('label-caps whitespace-nowrap text-[10px]! max-[700px]:tracking-[0.06em]', ink)}>{eventSegLabel(seg)}</span>
          <span className="font-display text-lg font-bold leading-tight">{segTitle(seg)}</span>
        </span>
        <span className="ml-auto">
          <EventBuzz on={buzz} />
        </span>
      </div>
      {at === 'news' &&
        (roll ? (
          <ul className="flex flex-col gap-0.5 text-xs leading-snug text-ink-2">
            {seg.events.map((e, i) => {
              const id = cast.playerOf(e) ?? '';
              const slot = cast.slotOf(id);
              return (
                <li key={i} className="flex items-center gap-1">
                  {slot !== undefined && <PlayerMark slot={slot} size={12} />}
                  <span className={cx(id === me && 'font-bold text-ink')}>{id === me ? 'You' : cast.name(id)}</span>: {e.title.toLowerCase()}
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="text-xs leading-snug text-ink-2">
            {eventWhoLine(ev, cast)}. {ev.line}
          </span>
        ))}
      {at === 'news' && ev.weight === 'headline' && <span className="w-fit rounded-chip bg-holo px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-holo">LOOK AT THE TV ▸</span>}
      {at === 'you' &&
        (you ? (
          <div className="flex flex-col gap-1 animate-[ev-pop_0.3s_ease-out]" data-testid="phone-you">
            <span className={cx('flex items-center gap-1.5 font-display text-base font-bold', sign === 'good' ? 'text-ok' : 'text-alert-ink')}>
              {you.sick && <EventSickTag size="phone" />}
              {you.headline}
            </span>
            <span className="text-xs leading-snug text-ink-2 max-[700px]:truncate" title={you.detail}>{you.detail}</span>
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
  return <span className="label-caps">{t < s.intro ? (s.segments.length ? `${s.events.length} event${s.events.length > 1 ? 's' : ''} this ${phaseNoun(s.phase)}` : 'A quiet month') : 'That’s everything'}</span>;
}

/** On a phone alone, while the weather plays on the map: a small "now" line, so the rail doesn't repeat the card. */
export function EventNowPlaying({ seg, buzz }: { seg: EventSegment; buzz: boolean }) {
  const { cast } = useShow();
  const ev = seg.events[0]!;
  return (
    <div className="flex items-center gap-2 rounded-panel border border-holo-line bg-raised p-2 animate-[ev-drop_0.3s_ease-out]" data-testid="phone-now">
      <EventSignBadge ev={ev} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="label-caps whitespace-nowrap text-[10px]!">{eventSegLabel(seg)}</span>
        <span className="font-display text-base font-bold leading-tight">{segTitle(seg)}</span>
        <span className="truncate text-[11px] text-ink-2">{eventSegWho(seg, cast)}</span>
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
            <span className={cx('text-xs', you ? (good ? 'font-bold text-ok' : 'font-bold text-alert-ink') : 'text-ink-3')}>{you ? you.short : 'not you'}</span>
          </div>
        );
      })}
    </>
  );
}

/**
 * With a TV in the room, the rail beside the phone's map, on the TV's clock: the light card, never the weather. The
 * card names the event as it is announced and buzzes, says what it did to you as it settles, and the last card
 * stays up after the last event, so the phone still says what happened to you.
 */
export function EventTvPhoneRail({ me }: { me: string }) {
  const { s, t } = useShow();
  const { seg: now, stage } = eventStageAt(s, t);
  const seg = now ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  return (
    <>
      {seg ? <EventPhoneCard seg={seg} me={me} at={isPlaying(seg, t) ? 'news' : 'you'} buzz={isBuzzing(seg, t)} /> : <EventWaiting />}
      <EventRailTail me={me} current={seg} />
    </>
  );
}

/**
 * On a phone alone, what a tap on the map does now: skip to the event's result while it plays, or, from a result,
 * go to the next event; nothing while no event is on. Inside <EventShow>; the screen places it (by its actions).
 */
export function EventSkipHint({ className }: { className?: string }) {
  const { s, t } = useShow();
  const { seg } = eventStageAt(s, t);
  if (!seg) return null;
  return (
    <span className={cx('rounded-chip bg-void/75 px-1.5 py-0.5 font-mono text-[10px] text-ink-2', className)} data-testid="skip-hint">
      {isPlaying(seg, t) ? 'tap the map to skip ›' : 'tap the map: next ›'}
    </span>
  );
}

/**
 * With no TV in the room, the rail beside the phone's own show: what is playing, then what it did to you, and the
 * phase's earlier events. The skip hint is the screen's to place (EventSkipHint).
 */
export function EventSoloRail({ me }: { me: string }) {
  const { s, t } = useShow();
  const { seg, stage } = eventStageAt(s, t);
  const shown = seg ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  return (
    <>
      {!shown ? <EventWaiting /> : isPlaying(shown, t) ? <EventNowPlaying seg={shown} buzz={isBuzzing(shown, t)} /> : <EventPhoneCard seg={shown} me={me} at="you" />}
      <EventRailTail me={me} current={shown} />
    </>
  );
}
