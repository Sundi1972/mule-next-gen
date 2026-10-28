import { cx } from '@mule/ui';
import { segmentSummary, segTitle, whoSeg } from '../copy';
import { effectsAt, sickAt, stageAt, type Segment } from '../events';
import { ME } from '../fixture';
import { Marks, Overlays, Shade, useLiveTiles, useLiving, Weather } from '../living';
import { EffectChip, SignBadge } from '../glyphs';
import { PhoneShow } from '../phone';
import { ColonyBar, Colonists, MapBox, SickTag, TvLayout, useShow } from '../stage';

/**
 * B · Living weather, Heiko's pick (28 Oct). The event is the hero: the map dims, a title card names it in the middle
 * of the TV, then flies to where the event comes from and becomes it. The weather itself is living.tsx, shared with
 * the phone that plays alone when no TV is in the room; this file is the TV's frame around it.
 */

export function TvB() {
  const { s, t, reduced } = useShow();
  const { shake, player, spot } = useLiving('tv');
  const tiles = useLiveTiles();
  const sick = sickAt(s, t, reduced);
  const fx = effectsAt(s, t, reduced);
  return (
    <TvLayout
      headerExtra={<Pips />}
      map={
        <MapBox
          tv
          tiles={tiles}
          shake={shake}
          under={
            <>
              <Weather size="tv" />
              <Shade size="tv" />
            </>
          }
          over={
            <>
              <Marks size="tv" />
              {s.phase === 'development' && <Colonists tv tag={(id) => sick.has(id) && <SickTag className="absolute -right-2 -top-2 animate-[ev-pop_0.4s_ease-out]" />} />}
            </>
          }
        />
      }
      banner={<Overlays size="tv" />}
      rail={<Log />}
      bar={
        <ColonyBar
          glowFor={player && spot > 0.5 ? player : undefined}
          extra={(id) => (
            <>
              {fx.filter((l) => l.effect.on === id && l.effect.what !== 'pace').map((l, i) => (
                <EffectChip key={i} f={l.effect} size="tv" className={cx(!reduced && 'animate-[ev-pop_0.3s_ease-out]')} />
              ))}
              {sick.has(id) && <SickTag className="animate-[ev-pop_0.4s_ease-out]" />}
            </>
          )}
        />
      }
    />
  );
}

/** The header's row of what this phase holds: one badge each, the current one lit, the done ones ticked. */
function Pips() {
  const { s, t } = useShow();
  return (
    <span className="flex items-center gap-2" data-testid="pips">
      {s.segments.map((g) => {
        const state = t >= g.endAt ? 'done' : t >= g.announceAt ? 'now' : 'next';
        return (
          <span key={g.n} className={cx('relative flex -space-x-3 transition-opacity', state === 'next' && 'opacity-40')}>
            {g.events.map((e, i) => (
              <SignBadge key={i} ev={e} size={34} className={state === 'now' ? 'animate-[ev-throb_1s_ease-in-out_infinite]' : ''} />
            ))}
            {state === 'done' && <span className="absolute -bottom-1 -right-1 rounded-full bg-ink px-1 font-mono text-[10px] font-bold text-void">✓</span>}
          </span>
        );
      })}
    </span>
  );
}

/** The rail keeps the phase's events: what is playing now, then what already happened, in words. */
function Log() {
  const { s, t } = useShow();
  const { seg } = stageAt(s, t);
  const done = s.segments.filter((g) => t >= g.settleAt);
  return (
    <div className="flex flex-col gap-3" data-testid="log">
      <span className="label-caps text-base!">This {s.phase === 'development' ? 'turn' : 'month'}</span>
      {seg && t >= seg.playAt && t < seg.settleAt && <NowCard seg={seg} />}
      {done.map((g) => (
        <div key={g.n} className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel p-3 animate-[ev-drop_0.35s_ease-out]">
          <SignBadge ev={g.events[0]!} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-xl font-semibold leading-tight">{segTitle(g)}</span>
            <span className="text-base leading-snug text-ink-2">{segmentSummary(g)}</span>
          </span>
        </div>
      ))}
      {s.segments.length === 0 && <span className="font-display text-xl text-ink-2">A quiet month: nothing happens.</span>}
    </div>
  );
}

function NowCard({ seg }: { seg: Segment }) {
  const ev = seg.events[0]!;
  const tone = seg.events.every((e) => e.sign === 'good') ? 'good' : seg.events.every((e) => e.sign === 'bad') ? 'bad' : 'news';
  return (
    <div className={cx('flex items-center gap-3 rounded-panel border-2 p-3 animate-[ev-drop_0.35s_ease-out]', tone === 'good' ? 'border-ok bg-holo-soft' : tone === 'bad' ? 'border-alert bg-alert-bg shadow-glow-alert' : 'border-holo bg-holo-soft')}>
      <SignBadge ev={ev} size={52} />
      <span className="flex flex-col">
        <span className={cx('label-caps', tone === 'good' ? 'text-ok!' : tone === 'bad' ? 'text-alert-ink!' : 'text-holo!')}>Now</span>
        <span className="font-display text-2xl font-bold leading-tight">{segTitle(seg)}</span>
        <span className="text-base text-ink-2">{whoSeg(seg)}</span>
      </span>
    </div>
  );
}

/** Lena's phone with a TV in the room: the light card, never the weather. */
export function PhoneB() {
  return <PhoneShow me={ME} />;
}
