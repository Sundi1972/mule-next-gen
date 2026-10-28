import { cx, PlayerMark } from '@mule/ui';
import { label, introLine, missLine, name, segmentSummary, who, whoSeg, youSummary } from '../copy';
import { BEAT, hitAt, landed, METEOR_FALL, sickAt, stageAt, TIER, type Segment } from '../events';
import { H, ME, ownerAt, seat, W } from '../fixture';
import { Crater, Dim, DustWall, MeteorFall, OnPlot, ramp, Spotlight, Swarm, Trail } from '../fx';
import { Buzz, DeltaChip, SignBadge } from '../glyphs';
import { cell, ColonyBar, Colonists, MapBox, PhoneLayout, SickTag, TvLayout, useShow } from '../stage';

/**
 * B · Living weather. The event is the hero: the map dims, a title card names it in the middle of the TV, then flies
 * to where the event comes from and becomes it: a wall of dust, a swarm, a falling meteor. Hit plots throw up their
 * loss. Grows out of today's production show (its nine event layers), so the build reuses most of what ships.
 */

const MAP = { w: 820, h: 492 };

export function TvB() {
  const { s, t, reduced } = useShow();
  const { stage, seg } = stageAt(s, t);
  const quiet = s.segments.every((g) => TIER[g.events[0]!.key] === 'bulletin');
  const current = seg?.events[0];
  const personal = current?.scope === 'personal' && TIER[current.key] === 'spotlight' ? current.player : undefined;
  const spot = personal && seg ? ramp(t, seg.playAt - 0.6, 0.5) * (1 - ramp(t, seg.endAt - 0.5, 0.5)) : 0;
  // The map dims under the intro and each title card, and clears as the card flies off to the event.
  const dim = quiet ? 0 : stage === 'intro' ? ramp(t, 0, 0.3) : stage === 'announce' && seg ? ramp(t, seg.announceAt, 0.3) * (1 - ramp(t, seg.playAt - 0.5, 0.5)) : 0;
  const impact = s.segments.flatMap((g) => g.events.filter((e) => e.key === 'meteorStrike').map(() => g.playAt + METEOR_FALL)).find((at) => t >= at && t < at + 0.6);
  const shake = impact !== undefined && !reduced ? `translate(${Math.sin(t * 80) * 5 * (1 - (t - impact) / 0.6)}px, ${Math.cos(t * 63) * 3}px)` : undefined;
  const sick = sickAt(s, t, reduced);

  return (
    <TvLayout
      headerExtra={<Pips />}
      map={
        <MapBox
          tv
          shake={shake}
          under={
            <>
              {s.segments.map((g) => (
                <SegmentLayers key={g.n} seg={g} />
              ))}
              {personal && <Spotlight id={personal} amount={spot} />}
              <Dim amount={dim} />
            </>
          }
          over={
            <>
              <RisingDeltas />
              {s.phase === 'development' && <Colonists tv tag={(id) => sick.has(id) && <SickTag className="absolute -right-2 -top-2 animate-[ev-pop_0.4s_ease-out]" />} />}
            </>
          }
        />
      }
      banner={
        <>
          {!quiet && stage === 'intro' && <IntroCard />}
          {seg && stage === 'announce' && TIER[seg.events[0]!.key] !== 'bulletin' && <TitleCard seg={seg} />}
          {s.segments.some((g) => TIER[g.events[0]!.key] === 'bulletin') && <LowerThird />}
        </>
      }
      rail={<Log />}
      bar={<ColonyBar glowFor={personal && spot > 0.5 ? personal : undefined} extra={(id) => sick.has(id) && <SickTag className="animate-[ev-pop_0.4s_ease-out]" />} />}
    />
  );
}

/** Each event's own motion over the map, from when it starts to play. */
function SegmentLayers({ seg }: { seg: Segment }) {
  const { t, reduced } = useShow();
  if (t < seg.playAt - 0.05) return null;
  return (
    <>
      {seg.events.map((ev, i) => {
        switch (ev.key) {
          case 'dustStorm':
            return (
              <div key={i}>
                {!reduced && <DustWall ev={ev} seg={seg} />}
                {ev.plots.map((h) => t >= hitAt(seg, ev, h, reduced) && <div key={`${h.x},${h.y}`} className="absolute rounded-[10%] bg-warn/30" style={cell(h.x, h.y)} />)}
              </div>
            );
          case 'pestSwarm':
            return (
              <div key={i}>
                <Trail ev={ev} seg={seg} colour="color-mix(in srgb, var(--color-g-food) 45%, var(--color-warn))" />
                <Swarm ev={ev} seg={seg} />
              </div>
            );
          case 'meteorStrike':
            return <MeteorFall key={i} ev={ev} seg={seg} tv look="fireball" />;
          default:
            return null;
        }
      })}
    </>
  );
}

/** Each hit throws its loss up off the plot, then the chip settles on the plot's corner and stays. */
function RisingDeltas() {
  const { s, t, reduced } = useShow();
  return (
    <>
      {landed(s, t, reduced).map(({ hit, at }) => {
        const since = t - at;
        const rise = reduced ? 0 : since < 0.45 ? (since / 0.45) * 34 : since < 1.3 ? 34 * (1 - (since - 0.45) / 0.85) : 0;
        return (
          <OnPlot key={`${hit.x},${hit.y},${at}`} x={hit.x} y={hit.y} rise={rise} className={cx(!reduced && 'animate-[ev-pop_0.35s_ease-out]')}>
            <DeltaChip delta={hit.delta} good={hit.good} lost={hit.muleLost} size="tv" />
          </OnPlot>
        );
      })}
      {/* The crater outlives the meteor's own layer. */}
      {s.segments.flatMap((g) => g.events.filter((e) => e.key === 'meteorStrike').map((e) => ({ g, e }))).map(({ g, e }) => t >= g.endAt && <Crater key={g.n} x={e.origin.x} y={e.origin.y} since={9} tv />)}
    </>
  );
}

/** The phase opens on what fired: a centred card with one badge per event, the map dim behind it. */
function IntroCard() {
  const { s, t } = useShow();
  const out = ramp(t, BEAT.intro - 0.35, 0.35);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ opacity: 1 - out }} data-testid="intro-card">
      <div className="flex flex-col items-center gap-4 rounded-sheet px-10 py-8 text-center animate-[ev-pop_0.45s_ease-out]" style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-void) 85%, transparent), transparent)' }}>
        <span className="label-caps text-lg!">{s.phase === 'production' ? 'Production' : 'Development'} · this month</span>
        <span className="font-display text-5xl font-bold">{introLine(s.segments.length, s.phase, s.events)}</span>
        <span className="flex gap-4">
          {s.segments.map((g) => (
            <span key={g.n} className="animate-[ev-pop_0.4s_ease-out_both]" style={{ animationDelay: `${0.25 + g.n * 0.18}s` }}>
              <SignBadge ev={g.events[0]!} size={72} />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** One event's title card: in the middle of the map, then off to where the event starts. */
function TitleCard({ seg }: { seg: Segment }) {
  const { t, reduced } = useShow();
  const ev = seg.events[0]!;
  const k = ramp(t, seg.playAt - 0.5, 0.5);
  const o = { x: ((ev.origin.x + 0.5) / W) * MAP.w, y: ((ev.origin.y + 0.5) / H) * MAP.h };
  const fly = reduced ? 'none' : `translate(${(o.x - MAP.w / 2) * k}px, ${(o.y - MAP.h / 2) * k}px) scale(${1 - 0.85 * k})`;
  const p = ev.player ? seat(ev.player) : null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" data-testid="title-card">
      <div key={seg.n} className="flex w-[640px] flex-col items-center gap-3 text-center" style={{ transform: fly, opacity: 1 - k }}>
        <div className="flex flex-col items-center gap-3 rounded-sheet px-10 py-6 animate-[ev-pop_0.45s_ease-out]" style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-void) 85%, transparent), transparent)' }}>
          <SignBadge ev={ev} size={120} />
          <span className={cx('label-caps text-lg!', ev.sign === 'good' ? 'text-ok!' : 'text-alert-ink!')}>{label(seg)}</span>
          <span className="font-display text-7xl font-bold leading-none" style={{ textShadow: '0 4px 24px var(--color-void)' }}>
            {ev.title}
          </span>
          <span className="flex items-center gap-2 font-display text-3xl font-semibold">
            {p && <PlayerMark slot={p.slot} size={40} />}
            {who(ev)}
          </span>
          <span className="max-w-[560px] text-2xl leading-snug text-ink-2" style={{ textShadow: '0 2px 12px var(--color-void)' }}>
            {ev.line}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Bulletins never take the screen: a lower third rises over the foot of the map, names who, and goes. */
function LowerThird() {
  const { s, t } = useShow();
  const seg = s.segments.find((g) => TIER[g.events[0]!.key] === 'bulletin')!;
  const from = seg.announceAt - (s.segments.length === 1 ? BEAT.intro : 0);
  if (t < from || t > seg.endAt) return null;
  const out = ramp(t, seg.endAt - 0.4, 0.4);
  return (
    <div className="absolute inset-x-6 bottom-5 z-20 animate-[ev-rise_0.4s_ease-out]" style={{ opacity: 1 - out }} data-testid="lower-third">
      <div className="flex items-center gap-5 rounded-panel border-2 bg-panel/95 px-5 py-3 shadow-chip" style={{ borderColor: 'var(--color-g-medicine)' }}>
        <SignBadge ev={seg.events[0]!} size={56} />
        <span className="flex flex-col">
          <span className="font-display text-3xl font-bold leading-tight">Sick this turn</span>
          <span className="text-lg text-ink-2">Sickness halves your walking pace.</span>
        </span>
        <span className="ml-auto flex gap-4">
          {seg.events.map((e) => (
            <span key={e.player} className="flex items-center gap-2">
              <span className="relative">
                <PlayerMark slot={seat(e.player!).slot} size={40} />
                <SickTag className="absolute -right-2 -top-2" />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-display text-xl font-semibold">{name(e.player!)}</span>
                <span className="font-mono text-base text-ink-2">50% pace</span>
              </span>
            </span>
          ))}
        </span>
      </div>
    </div>
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
          <span key={g.n} className={cx('relative transition-opacity', state === 'next' && 'opacity-40')}>
            <SignBadge ev={g.events[0]!} size={34} className={state === 'now' ? 'animate-[ev-throb_1s_ease-in-out_infinite]' : ''} />
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
      <span className="label-caps text-base!">This {s.phase === 'production' ? 'month' : 'turn'}</span>
      {seg && t >= seg.playAt && t < seg.settleAt && (
        <div className="flex items-center gap-3 rounded-panel border-2 border-alert bg-alert-bg p-3 shadow-glow-alert animate-[ev-drop_0.35s_ease-out]">
          <SignBadge ev={seg.events[0]!} size={52} />
          <span className="flex flex-col">
            <span className="label-caps text-alert-ink!">Now</span>
            <span className="font-display text-2xl font-bold leading-tight">{seg.events[0]!.title}</span>
            <span className="text-base text-ink-2">{whoSeg(seg)}</span>
          </span>
        </div>
      )}
      {done.map((g) => (
        <div key={g.n} className="flex items-center gap-3 rounded-panel border border-holo-line bg-panel p-3 animate-[ev-drop_0.35s_ease-out]">
          <SignBadge ev={g.events[0]!} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-xl font-semibold leading-tight">{g.events.length > 1 ? `${g.events[0]!.title} ×${g.events.length}` : g.events[0]!.title}</span>
            <span className="text-base leading-snug text-ink-2">{segmentSummary(g)}</span>
          </span>
        </div>
      ))}
      {s.segments.length === 0 && <span className="font-display text-xl text-ink-2">A quiet month: nothing happens.</span>}
    </div>
  );
}

// --- Lena's phone ---------------------------------------------------------------------------------------------------

/**
 * The phone never plays the weather: it buzzes, says what the event is and what it did to YOU, and marks your own hit
 * plots. A headline event says "Look at the TV". One small card per event, no full-screen paint at the phase start.
 */
export function PhoneB() {
  const { s, t, reduced } = useShow();
  const { seg: now, stage } = stageAt(s, t);
  // At the end the last card stays up, so the phone still says what happened to you.
  const seg = now ?? (stage === 'outro' ? (s.segments.at(-1) ?? null) : null);
  const sick = sickAt(s, t, reduced);
  const mineLanded = landed(s, t, reduced).filter((l) => ownerAt(l.hit.x, l.hit.y) === ME);
  const done = s.segments.filter((g) => t >= g.settleAt && g !== seg);
  return (
    <PhoneLayout
      map={
        <MapBox
          tv={false}
          focusSlot={0}
          over={
            <>
              {mineLanded.map((l) => (
                <OnPlot key={`${l.hit.x},${l.hit.y}`} x={l.hit.x} y={l.hit.y}>
                  <DeltaChip delta={l.hit.delta} good={l.hit.good} size="phone" />
                </OnPlot>
              ))}
              {s.phase === 'development' && <Colonists tv={false} only={ME} tag={(id) => sick.has(id) && <SickTag size="phone" className="absolute -right-1.5 -top-1.5 animate-[ev-pop_0.4s_ease-out]" />} />}
            </>
          }
        />
      }
      rail={
        <>
          {seg ? <PhoneCard seg={seg} /> : <span className="label-caps">{t < BEAT.intro ? (s.segments.length ? `${s.segments.length} event${s.segments.length > 1 ? 's' : ''} this ${s.phase === 'production' ? 'month' : 'turn'}` : 'A quiet month') : 'That’s everything'}</span>}
          {done.map((g) => {
            const you = youSummary(g, ME);
            return (
              <div key={g.n} className="flex items-center gap-2 rounded-control bg-raised px-2 py-1">
                <SignBadge ev={g.events[0]!} size={22} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{g.events[0]!.title}</span>
                <span className={cx('text-xs', you ? 'font-bold text-alert-ink' : 'text-ink-3')}>{you ? you.headline.replace(' for you', '') : 'missed you'}</span>
              </div>
            );
          })}
        </>
      }
    />
  );
}

function PhoneCard({ seg }: { seg: Segment }) {
  const { t } = useShow();
  const ev = seg.events[0]!;
  const after = t >= seg.settleAt - 0.2;
  const you = youSummary(seg, ME);
  const headline = TIER[ev.key] === 'headline';
  return (
    <div key={seg.n} className={cx('flex flex-col gap-1.5 rounded-panel border-2 p-2.5 animate-[ev-drop_0.3s_ease-out]', ev.sign === 'good' ? 'border-ok bg-holo-soft' : 'border-alert bg-alert-bg')} data-testid="phone-card">
      <div className="flex items-center gap-2">
        <SignBadge ev={ev} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className={cx('label-caps text-[10px]!', ev.sign === 'good' ? 'text-ok!' : 'text-alert-ink!')}>{label(seg)}</span>
          <span className="font-display text-lg font-bold leading-tight">{seg.events.length > 1 ? `${ev.title} ×${seg.events.length}` : ev.title}</span>
        </span>
        <span className="ml-auto">
          <Buzz on={t - seg.announceAt < 1.2} />
        </span>
      </div>
      {!after && <span className="text-xs leading-snug text-ink-2">{ev.key === 'sickness' ? 'As the turn starts, some colonists fall sick.' : `${who(ev)}. ${ev.line}`}</span>}
      {!after && headline && <span className="w-fit rounded-chip bg-holo px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-holo">LOOK AT THE TV ▸</span>}
      {after &&
        (you ? (
          <div className="flex flex-col gap-1 animate-[ev-pop_0.3s_ease-out]" data-testid="phone-you">
            <span className="flex items-center gap-1.5 font-display text-base font-bold text-alert-ink">
              {you.sick && <SickTag size="phone" />}
              {you.headline}
            </span>
            <span className="text-xs leading-snug text-ink-2">{you.detail}</span>
          </div>
        ) : (
          <span className="text-xs leading-snug text-ink-2" data-testid="phone-miss">
            {missLine(seg)}
          </span>
        ))}
    </div>
  );
}
