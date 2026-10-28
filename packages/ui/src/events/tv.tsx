import type { Good } from '../components/tokens';
import { cx } from '../components/tokens';
import { eventSegmentSummary, eventWhoLine, segTitle } from './copy';
import { signLook, useShow } from './frame';
import { EventDeltaChip, EventSignBadge } from './glyphs';
import { eventStageAt, plotUnitsAt, type EventScript, type EventSegment, type ShowGrid, type ShowPlot } from './timing';

/**
 * The TV's rail through a phase, inside <EventShow>: the gallery's TvB (design/mocks/ws8-events directions/B.tsx at
 * de9d6b7). The screen's shell places each part.
 */

/** The phase's row of events: one badge each, the current one lit, the done ones ticked. */
export function EventPips() {
  const { s, t } = useShow();
  return (
    <span className="flex items-center gap-2" data-testid="pips">
      {s.segments.map((g) => {
        const state = t >= g.endAt ? 'done' : t >= g.announceAt ? 'now' : 'next';
        return (
          <span key={g.n} className={cx('relative flex -space-x-3 transition-opacity', state === 'next' && 'opacity-40')} data-pip={g.events[0]!.key} data-state={state}>
            {g.events.map((e, i) => (
              <EventSignBadge key={i} ev={e} size={34} className={state === 'now' ? 'animate-[ev-throb_1s_ease-in-out_infinite]' : ''} />
            ))}
            {state === 'done' && <span className="absolute -bottom-1 -right-1 rounded-full bg-ink px-1 font-mono text-[10px] font-bold text-void">✓</span>}
          </span>
        );
      })}
    </span>
  );
}

/** The rail keeps the phase's events: what is playing now, then what already happened, in words. */
export function EventTvLog() {
  const { s, t, cast } = useShow();
  const { seg } = eventStageAt(s, t);
  const done = s.segments.filter((g) => t >= g.settleAt);
  return (
    <div className="flex flex-col gap-3" data-testid="log">
      <span className="label-caps text-base!">This {s.phase === 'development' ? 'turn' : 'month'}</span>
      {seg && t >= seg.playAt && t < seg.settleAt && <NowCard seg={seg} />}
      {done.map((g) => (
        <div key={g.n} className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel p-3 animate-[ev-drop_0.35s_ease-out]" data-log={g.events[0]!.key}>
          <EventSignBadge ev={g.events[0]!} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-xl font-semibold leading-tight">{segTitle(g)}</span>
            <span className="text-base leading-snug text-ink-2">{eventSegmentSummary(g, cast)}</span>
          </span>
        </div>
      ))}
      {s.segments.length === 0 && <span className="font-display text-xl text-ink-2">A quiet month: nothing happens.</span>}
    </div>
  );
}

function NowCard({ seg }: { seg: EventSegment }) {
  const { cast } = useShow();
  const ev = seg.events[0]!;
  const signs = seg.events.map((e) => signLook(e.sign));
  const tone = signs.every((v) => v === 'good') ? 'good' : signs.every((v) => v === 'bad') ? 'bad' : 'news';
  return (
    <div
      className={cx('flex items-center gap-3 rounded-panel border-2 p-3 animate-[ev-drop_0.35s_ease-out]', tone === 'good' ? 'border-ok bg-holo-soft' : tone === 'bad' ? 'border-alert bg-alert-bg shadow-glow-alert' : 'border-holo bg-holo-soft')}
      data-now={ev.key}
    >
      <EventSignBadge ev={ev} size={52} />
      <span className="flex flex-col">
        <span className={cx('label-caps', tone === 'good' ? 'text-ok!' : tone === 'bad' ? 'text-alert-ink!' : 'text-holo!')}>Now</span>
        <span className="font-display text-2xl font-bold leading-tight">{segTitle(seg)}</span>
        <span className="text-base text-ink-2">{eventWhoLine(ev, cast)}</span>
      </span>
    </div>
  );
}

/** A working plot as the caller knows it: who owns it, its good, and what it made before any event. */
export interface EventPlotOutput extends ShowPlot {
  owner: string;
  good: Good;
}

/** One player's change from the phase's events by `t`, per good: RULE-2 on each of their plots, as the map's bars. */
export function eventPlayerChange(s: EventScript, t: number, reduced: boolean, grid: ShowGrid, plots: readonly EventPlotOutput[], id: string): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  for (const o of plots.filter((p) => p.owner === id)) {
    const now = plotUnitsAt(s.segments, o, t, reduced, grid);
    if (now !== o.made) out[o.good] = (out[o.good] ?? 0) + now - o.made;
  }
  return out;
}

/** The colony bar's chips for one player: what this phase's events have done to them so far. */
export function EventColonyChips({ id, plots }: { id: string; plots: readonly EventPlotOutput[] }) {
  const { s, t, reduced, grid } = useShow();
  const change = eventPlayerChange(s, t, reduced, grid, plots, id);
  return (
    <>
      {(Object.entries(change) as [Good, number][]).map(([g, n]) => (
        <EventDeltaChip key={g} delta={n} good={g} size="tv" />
      ))}
    </>
  );
}
