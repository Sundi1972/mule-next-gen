import { cx, PlayerMark, SLOT_COLOR } from '@mule/ui';
import type { ReactNode } from 'react';
import { PHASE_NAME } from './catalogue';
import { colonyNews, hitText, label, missLine, name, segTitle, who, youSummary } from './copy';
import { effectsAt, isRollCall, landed, sickAt, stageAt, TIER, type Segment } from './events';
import { Marks, Overlays, Shade, useLiveTiles, useLiving, Weather } from './living';
import { ownerAt, seat } from './fixture';
import { OnPlot } from './fx';
import { Buzz, DeltaChip, EffectChip, SignBadge } from './glyphs';
import { Colonists, MapBox, SickTag, useShow } from './stage';

/**
 * The phone, the same in every direction (the PM's ruling, 28 Oct): it never plays the event. It buzzes, names it,
 * says what it did to YOU or that it passed you by, and marks your own hit plots. One small card at a time enters, so
 * the phase start carries no heavy paint (the 152 ms stall budget).
 */

/** One player's phone, sideways (844 × 390): their map on the left, the event rail on the right. */
export function PhoneShell({ me, map, rail }: { me: string; map: ReactNode; rail: ReactNode }) {
  const { s } = useShow();
  const p = seat(me);
  return (
    <div className="relative flex h-full w-full gap-2 p-2 text-ink" data-testid={`phone-${me}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 px-1">
          <span className="font-display text-sm font-bold">{PHASE_NAME[s.phase]}</span>
          <span className="label-caps text-[10px]!">Month 5</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-ink-2">
            <PlayerMark slot={p.slot} size={14} />
            {p.name}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="w-[540px]">{map}</div>
        </div>
      </div>
      <aside className="relative flex w-[268px] shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2.5">{rail}</aside>
    </div>
  );
}

/**
 * The event's card. `news` is the moment it is announced (who, what, look at the TV); `you` is after it lands: what it
 * did to you, or the colony's news, or where it went instead.
 */
export function EventPhoneCard({ seg, me, at, buzz = false }: { seg: Segment; me: string; at: 'news' | 'you'; buzz?: boolean }) {
  const ev = seg.events[0]!;
  const you = youSummary(seg, me);
  const roll = isRollCall(seg);
  const mixed = seg.events.some((e) => e.sign !== ev.sign) || ev.sign === 'neutral';
  const tone = mixed ? 'border-holo bg-holo-soft' : ev.sign === 'good' ? 'border-ok bg-holo-soft' : 'border-alert bg-alert-bg';
  const ink = mixed ? 'text-holo!' : ev.sign === 'good' ? 'text-ok!' : 'text-alert-ink!';
  const mine = (you ? seg.events.find((e) => youSummary({ ...seg, events: [e] }, me)) : null) ?? ev;
  return (
    <div key={`${seg.n}-${at}`} className={cx('flex flex-col gap-1.5 rounded-panel border-2 p-2.5 animate-[ev-drop_0.3s_ease-out]', tone)} data-testid="phone-card" data-at={at} data-event={ev.key}>
      <div className="flex items-center gap-2">
        {roll && seg.events.length > 1 ? (
          <span className="flex -space-x-2">
            {seg.events.map((e, i) => (
              <SignBadge key={i} ev={e} size={30} />
            ))}
          </span>
        ) : (
          <SignBadge ev={ev} size={40} />
        )}
        <span className="flex min-w-0 flex-col">
          <span className={cx('label-caps text-[10px]!', ink)}>{label(seg)}</span>
          <span className="font-display text-lg font-bold leading-tight">{segTitle(seg)}</span>
        </span>
        <span className="ml-auto">
          <Buzz on={buzz} />
        </span>
      </div>
      {at === 'news' &&
        (roll ? (
          <ul className="flex flex-col gap-0.5 text-xs leading-snug text-ink-2">
            {seg.events.map((e, i) => (
              <li key={i} className="flex items-center gap-1">
                <PlayerMark slot={seat(e.player!).slot} size={12} />
                <span className={cx(e.player === me && 'font-bold text-ink')}>{e.player === me ? 'You' : name(e.player!)}</span>: {e.title.toLowerCase()}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs leading-snug text-ink-2">
            {who(ev)}. {ev.line}
          </span>
        ))}
      {at === 'news' && TIER[ev.key] === 'headline' && <span className="w-fit rounded-chip bg-holo px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-holo">LOOK AT THE TV ▸</span>}
      {at === 'you' &&
        (you ? (
          <div className="flex flex-col gap-1 animate-[ev-pop_0.3s_ease-out]" data-testid="phone-you">
            <span className={cx('flex items-center gap-1.5 font-display text-base font-bold', mine.sign === 'good' ? 'text-ok' : 'text-alert-ink')}>
              {you.sick && <SickTag size="phone" />}
              {you.headline}
            </span>
            <span className="text-xs leading-snug text-ink-2">{you.detail}</span>
            {(mine.effects ?? []).some((f) => f.on === me) && (
              <span className="flex flex-wrap gap-1">
                {mine.effects!.filter((f) => f.on === me && f.what !== 'pace').map((f, i) => (
                  <EffectChip key={i} f={f} size="phone" />
                ))}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1" data-testid="phone-miss">
            <span className="text-xs leading-snug text-ink-2">{missLine(seg)}</span>
            {(ev.effects ?? []).some((f) => f.on === 'colony' || f.on === 'store') && (
              <span className="flex flex-wrap gap-1">
                {ev.effects!.filter((f) => (f.on === 'colony' || f.on === 'store') && f.what !== 'fund').map((f, i) => (
                  <EffectChip key={i} f={f} size="phone" />
                ))}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

/** With a TV in the room: one player's phone through a phase, on the TV's clock. The light card, never the weather. */
export function PhoneShow({ me }: { me: string }) {
  const { s, t, reduced } = useShow();
  const { seg: now, stage } = stageAt(s, t);
  // At the end the last card stays up, so the phone still says what happened to you.
  const seg = now ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  const sick = sickAt(s, t, reduced);
  const tiles = useLiveTiles();
  const mineLanded = landed(s, t, reduced).filter((l) => ownerAt(l.hit.x, l.hit.y) === me || (l.ev.key === 'colonyPlot' && !ownerAt(l.hit.x, l.hit.y)));
  return (
    <PhoneShell
      me={me}
      map={
        <MapBox
          tv={false}
          focusSlot={seat(me).slot}
          tiles={tiles}
          over={
            <>
              {mineLanded.map((l) => {
                const text = hitText(l.ev, l.hit);
                return (
                  (l.hit.delta !== 0 || text) && (
                    <OnPlot key={`${l.hit.x},${l.hit.y},${l.ev.key}`} x={l.hit.x} y={l.hit.y}>
                      <DeltaChip delta={l.hit.delta} good={l.hit.good} lost={l.hit.muleLost} text={text} size="phone" />
                    </OnPlot>
                  )
                );
              })}
              {s.phase === 'development' && <Colonists tv={false} only={me} tag={(id) => sick.has(id) && <SickTag size="phone" className="absolute -right-1.5 -top-1.5 animate-[ev-pop_0.4s_ease-out]" />} />}
            </>
          }
        />
      }
      rail={
        <>
          {seg ? <EventPhoneCard seg={seg} me={me} at={t >= seg.settleAt - 0.2 ? 'you' : 'news'} buzz={t - seg.announceAt < 1.2} /> : <Waiting />}
          <RailTail me={me} current={seg} />
        </>
      }
    />
  );
}

/**
 * With no TV in the room (TableView.boards === 0, the count WS4's lobby reads for B-AC-4): the phone plays Living
 * weather itself on its own map, on the shorter solo clock. A tap on the map skips to what the event did to you.
 */
export function PhoneSolo({ me }: { me: string }) {
  const { s, t, reduced, seek } = useShow();
  const { seg, stage, shake } = useLiving('phone');
  const tiles = useLiveTiles();
  const sick = sickAt(s, t, reduced);
  const shown = seg ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  const playing = seg !== null && t < seg.settleAt - 0.05;
  // A tap jumps to the event's result; tapped again, to the next event.
  const skip = () => seg && seek?.(t < seg.settleAt - 0.05 ? seg.settleAt : seg.endAt);
  return (
    <PhoneShell
      me={me}
      map={
        <div className="relative">
          <MapBox
            tv={false}
            focusSlot={seat(me).slot}
            tiles={tiles}
            shake={shake}
            under={
              <>
                <Weather size="phone" />
                <Shade size="phone" />
              </>
            }
            over={
              <>
                <Marks size="phone" />
                {s.phase === 'development' && <Colonists tv={false} tag={(id) => sick.has(id) && <SickTag size="phone" className="absolute -right-1.5 -top-1.5 animate-[ev-pop_0.4s_ease-out]" />} />}
              </>
            }
          />
          <Overlays size="phone" />
          {seg && seek && (
            <button type="button" onClick={skip} className="absolute inset-0 z-30 flex items-start justify-end p-1.5" aria-label={playing ? 'Tap to skip to what it did to you' : 'Tap for the next event'} data-testid="skip">
              <span className="rounded-chip bg-void/75 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{playing ? 'tap to skip ›' : 'tap: next ›'}</span>
            </button>
          )}
        </div>
      }
      rail={
        <>
          {!shown ? (
            <Waiting />
          ) : t < shown.settleAt - 0.2 ? (
            <NowPlaying seg={shown} buzz={t - shown.announceAt < 1.2} />
          ) : (
            <EventPhoneCard seg={shown} me={me} at="you" />
          )}
          <RailTail me={me} current={shown} />
        </>
      }
    />
  );
}

/** Before the first event, and after the last when nothing stays up. */
function Waiting() {
  const { s, t } = useShow();
  return <span className="label-caps">{t < s.intro ? (s.segments.length ? `${s.events.length} event${s.events.length > 1 ? 's' : ''} this ${s.phase === 'development' ? 'turn' : 'month'}` : 'A quiet month') : 'That’s everything'}</span>;
}

/** On a phone alone, while the weather plays on the map: a small "now" line, so the rail doesn't repeat the card. */
function NowPlaying({ seg, buzz }: { seg: Segment; buzz: boolean }) {
  const ev = seg.events[0]!;
  return (
    <div className="flex items-center gap-2 rounded-panel border border-holo-line bg-raised p-2 animate-[ev-drop_0.3s_ease-out]" data-testid="phone-now">
      <SignBadge ev={ev} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="label-caps text-[10px]!">{label(seg)}</span>
        <span className="font-display text-base font-bold leading-tight">{segTitle(seg)}</span>
        <span className="truncate text-[11px] text-ink-2">{who(ev)}</span>
      </span>
      <span className="ml-auto">
        <Buzz on={buzz} />
      </span>
    </div>
  );
}

/** Under the current card: the phase's earlier events, one line each, and the off-map changes that are yours. */
function RailTail({ me, current }: { me: string; current: Segment | null }) {
  const { s, t, reduced } = useShow();
  const done = s.segments.filter((g) => t >= g.settleAt && g !== current);
  const mineFx = effectsAt(s, t, reduced).filter((l) => l.effect.on === me && l.effect.what !== 'pace');
  return (
    <>
      {done.map((g) => {
        const you = youSummary(g, me);
        const good = g.events.find((e) => youSummary({ ...g, events: [e] }, me))?.sign === 'good';
        return (
          <div key={g.n} className="flex items-center gap-2 rounded-control bg-raised px-2 py-1">
            <SignBadge ev={g.events[0]!} size={22} />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{segTitle(g)}</span>
            <span className={cx('text-xs', you ? (good ? 'font-bold text-ok' : 'font-bold text-alert-ink') : 'text-ink-3')}>{you ? you.headline.replace(' for you', '') : colonyNews(g) ? 'everyone' : 'not you'}</span>
          </div>
        );
      })}
      {mineFx.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-holo-line pt-1.5" data-testid="phone-ledger">
          <span className="label-caps text-[10px]!" style={{ color: SLOT_COLOR[seat(me).slot] }}>
            Yours
          </span>
          {mineFx.map((l, i) => (
            <EffectChip key={i} f={l.effect} size="phone" />
          ))}
        </div>
      )}
    </>
  );
}
