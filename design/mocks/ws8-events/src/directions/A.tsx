import { cx, PlayerMark, SLOT_COLOR } from '@mule/ui';
import { introLine, missLine, name, segmentSummary, who, whoSeg, youSummary } from '../copy';
import { BEAT, landed, sickAt, stageAt, TIER, type Segment } from '../events';
import { ME, ownerAt, seat } from '../fixture';
import { Brackets, Crater, HitHatch, MeteorFall, OnPlot, ramp, ScanLine, Spotlight, Trail } from '../fx';
import { Buzz, DeltaChip, SignBadge } from '../glyphs';
import { ColonyBar, Colonists, MapBox, PhoneLayout, SickTag, TvLayout, useShow } from '../stage';

/**
 * A · Alert broadcast. The TV is a colony control room: an alert bar drops over the top of the map and names the
 * event, then a scan line or a targeting reticle marks every plot it hits with brackets and hazard stripes. Nothing
 * dims and nothing flies: the calmest of the three, the cheapest to draw, the easiest to read.
 */

const HAZARD = 'repeating-linear-gradient(135deg, var(--color-alert) 0 10px, var(--color-void) 10px 20px)';

export function TvA() {
  const { s, t, reduced } = useShow();
  const { stage, seg } = stageAt(s, t);
  const current = seg?.events[0];
  const personal = current?.scope === 'personal' && TIER[current.key] === 'spotlight' ? current.player : undefined;
  const spot = personal && seg ? ramp(t, seg.playAt - 0.4, 0.4) * (1 - ramp(t, seg.endAt - 0.4, 0.4)) : 0;
  const sick = sickAt(s, t, reduced);
  return (
    <TvLayout
      headerExtra={<Ticker />}
      map={
        <MapBox
          tv
          under={
            <>
              {landed(s, t, reduced).map(({ hit, at }) => (
                <HitHatch key={`${hit.x},${hit.y},${at}`} x={hit.x} y={hit.y} />
              ))}
              {s.segments.map((g) => (
                <Layers key={g.n} seg={g} />
              ))}
              {personal && <Spotlight id={personal} amount={spot} />}
            </>
          }
          over={
            <>
              {landed(s, t, reduced).map(({ hit, at, ev }) => (
                <div key={`${hit.x},${hit.y},${at}`}>
                  <Brackets x={hit.x} y={hit.y} colour={ev.player ? SLOT_COLOR[seat(ev.player).slot] : 'var(--color-alert)'} since={reduced ? 1 : t - at} />
                  <OnPlot x={hit.x} y={hit.y}>
                    <DeltaChip delta={hit.delta} good={hit.good} lost={hit.muleLost} />
                  </OnPlot>
                </div>
              ))}
              {s.phase === 'development' && <Colonists tv tag={(id) => sick.has(id) && <SickTag className="absolute -right-2 -top-2 animate-[ev-pop_0.4s_ease-out]" />} />}
            </>
          }
        />
      }
      banner={
        <>
          {stage === 'intro' && <IntroStrip />}
          {seg && stage === 'announce' && TIER[seg.events[0]!.key] !== 'bulletin' && <AlertBar seg={seg} />}
          {seg && TIER[seg.events[0]!.key] === 'bulletin' && <BulletinToast seg={seg} />}
        </>
      }
      rail={<Board />}
      bar={<ColonyBar glowFor={personal && spot > 0.5 ? personal : undefined} extra={(id) => sick.has(id) && <SickTag className="animate-[ev-pop_0.4s_ease-out]" />} />}
    />
  );
}

function Layers({ seg }: { seg: Segment }) {
  const { t, reduced } = useShow();
  if (t < seg.playAt - 0.05) return null;
  return (
    <>
      {seg.events.map((ev, i) =>
        ev.key === 'dustStorm' ? (
          !reduced && <ScanLine key={i} ev={ev} seg={seg} colour="var(--color-warn)" />
        ) : ev.key === 'pestSwarm' ? (
          <Trail key={i} ev={ev} seg={seg} colour="var(--color-holo-strong)" width={0.06} />
        ) : ev.key === 'meteorStrike' ? (
          t < seg.endAt ? <MeteorFall key={i} ev={ev} seg={seg} tv look="lock" /> : <Crater key={i} x={ev.origin.x} y={ev.origin.y} since={9} tv />
        ) : null,
      )}
    </>
  );
}

/** The phase opens with one strip over the top of the map: how many alerts, and their badges. */
function IntroStrip() {
  const { s, t } = useShow();
  const out = ramp(t, BEAT.intro - 0.3, 0.3);
  return (
    <div className="absolute inset-x-0 top-0 z-20 overflow-hidden rounded-t-panel animate-[ev-drop_0.35s_ease-out]" style={{ opacity: 1 - out }} data-testid="intro-strip">
      <div className="flex h-[76px] items-center gap-4 bg-panel/95 pr-5 shadow-chip">
        <span className="h-full w-4 animate-[ev-stripes_0.6s_linear_infinite]" style={{ background: HAZARD, backgroundSize: '28px 28px' }} />
        <span className="font-mono text-xl font-bold uppercase tracking-widest text-alert-ink">{s.phase} · {introLine(s.segments.length, s.phase, s.events)}</span>
        <span className="ml-auto flex gap-2">
          {s.segments.map((g) => (
            <SignBadge key={g.n} ev={g.events[0]!} size={48} />
          ))}
        </span>
      </div>
    </div>
  );
}

/** The alert: drops over the top of the map, names the event and who it hits, and pulls back up as it plays. */
function AlertBar({ seg }: { seg: Segment }) {
  const { t, reduced } = useShow();
  const ev = seg.events[0]!;
  const k = ramp(t, seg.playAt - 0.35, 0.35);
  const p = ev.player ? seat(ev.player) : null;
  const good = ev.sign === 'good';
  return (
    <div className="absolute inset-x-0 top-0 z-20 overflow-hidden rounded-t-panel" data-testid="alert-bar">
      <div key={seg.n} className="flex items-stretch bg-panel/95 shadow-chip animate-[ev-drop_0.35s_ease-out]" style={{ transform: reduced ? 'none' : `translateY(${-110 * k}%)`, opacity: reduced ? 1 - k : 1 }}>
        <span className="w-5 shrink-0 animate-[ev-stripes_0.6s_linear_infinite]" style={{ background: good ? 'var(--color-ok)' : HAZARD, backgroundSize: '28px 28px' }} />
        <div className="flex flex-1 items-center gap-5 px-5 py-4">
          <SignBadge ev={ev} size={96} />
          <span className="flex min-w-0 flex-col gap-1">
            <span className={cx('font-mono text-lg font-bold uppercase tracking-widest', good ? 'text-ok' : 'text-alert-ink')}>
              {good ? 'Good news' : 'Alert'} {seg.count > 1 && `${seg.n}/${seg.count}`} · {who(ev)}
            </span>
            <span className="font-display text-6xl font-bold leading-none">{ev.title}</span>
            <span className="text-xl leading-snug text-ink-2">{ev.line}</span>
          </span>
          {p && (
            <span className="ml-auto flex flex-col items-center gap-1 rounded-panel border-2 px-3 py-2" style={{ borderColor: SLOT_COLOR[p.slot] }}>
              <PlayerMark slot={p.slot} size={56} />
              <span className="font-display text-xl font-semibold">{p.name}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Bulletins don't interrupt: a small toast in the map's corner lists who, while the tags land on the colonists. */
function BulletinToast({ seg }: { seg: Segment }) {
  const { s, t } = useShow();
  const from = seg.announceAt - (s.segments.length === 1 ? BEAT.intro - 0.4 : 0);
  if (t < from || t > seg.endAt) return null;
  return (
    <div className="absolute right-3 top-[92px] z-20 flex w-[300px] flex-col gap-2 rounded-panel border-2 bg-panel/95 p-3 shadow-chip animate-[ev-drop_0.35s_ease-out]" style={{ borderColor: 'var(--color-g-medicine)' }} data-testid="bulletin-toast">
      <span className="flex items-center gap-2 font-mono text-base font-bold uppercase tracking-widest text-ink">
        <SickTag /> Sick this turn
      </span>
      {seg.events.map((e) => (
        <span key={e.player} className="flex items-center gap-2 text-lg">
          <PlayerMark slot={seat(e.player!).slot} size={28} />
          <span className="font-display font-semibold">{name(e.player!)}</span>
          <span className="ml-auto font-mono text-base text-ink-2">50% pace</span>
        </span>
      ))}
    </div>
  );
}

/** The header's ticker: one chip per alert; the one playing has moving hazard stripes, the done ones a tick. */
function Ticker() {
  const { s, t } = useShow();
  return (
    <span className="flex items-center gap-2" data-testid="ticker">
      {s.segments.map((g) => {
        const state = t >= g.endAt ? 'done' : t >= g.announceAt ? 'now' : 'next';
        const ev = g.events[0]!;
        return (
          <span
            key={g.n}
            className={cx('flex items-center gap-1.5 rounded-control border-2 py-0.5 pl-0.5 pr-2.5 font-mono text-sm font-bold uppercase', state === 'next' ? 'border-holo-line text-ink-3' : state === 'now' ? 'border-alert text-ink' : 'border-holo-line text-ink-2')}
            style={state === 'now' ? { background: 'repeating-linear-gradient(135deg, var(--color-alert-bg) 0 8px, color-mix(in srgb, var(--color-alert) 30%, var(--color-alert-bg)) 8px 16px)', backgroundSize: '22px 22px' } : undefined}
          >
            <SignBadge ev={ev} size={28} />
            {ev.key === 'sickness' ? `Sick: ${g.events.map((e) => name(e.player!)).join(', ')}` : ev.title}
            {state === 'done' && <span aria-label="done">✓</span>}
          </span>
        );
      })}
    </span>
  );
}

/** The rail: a log of this phase's alerts, each with its status light and, once done, what it did. */
function Board() {
  const { s, t } = useShow();
  return (
    <div className="flex flex-col gap-2" data-testid="board">
      <span className="label-caps text-base!">Alerts this {s.phase === 'production' ? 'month' : 'turn'}</span>
      {s.segments.map((g) => {
        const state = t >= g.settleAt ? 'done' : t >= g.announceAt ? 'now' : 'next';
        const ev = g.events[0]!;
        return (
          <div key={g.n} className={cx('flex items-start gap-3 rounded-panel border-2 p-3', state === 'now' ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel', state === 'next' && 'opacity-40')}>
            <span className={cx('mt-2 size-3 shrink-0 rounded-full', state === 'now' ? 'bg-alert animate-[ev-throb_0.8s_ease-in-out_infinite]' : state === 'done' ? 'bg-ink-2' : 'border-2 border-ink-3')} aria-label={state} />
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-xl font-semibold leading-tight">{g.events.length > 1 ? `${ev.title} ×${g.events.length}` : ev.title}</span>
              <span className="text-base leading-snug text-ink-2">{state === 'done' ? segmentSummary(g) : state === 'now' ? whoSeg(g) : 'Coming up'}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Lena's phone ---------------------------------------------------------------------------------------------------

/** The phone gets a system-style alert across its top that turns into what it did to you, then docks in the rail. */
export function PhoneA() {
  const { s, t, reduced } = useShow();
  const { seg } = stageAt(s, t);
  const mine = landed(s, t, reduced).filter((l) => ownerAt(l.hit.x, l.hit.y) === ME);
  const sick = sickAt(s, t, reduced);
  return (
    <PhoneLayout
      map={
        <MapBox
          tv={false}
          focusSlot={0}
          over={
            <>
              {mine.map((l) => (
                <div key={`${l.hit.x},${l.hit.y}`}>
                  <Brackets x={l.hit.x} y={l.hit.y} colour="var(--color-alert)" since={9} />
                  <OnPlot x={l.hit.x} y={l.hit.y}>
                    <DeltaChip delta={l.hit.delta} good={l.hit.good} size="phone" />
                  </OnPlot>
                </div>
              ))}
              {s.phase === 'development' && <Colonists tv={false} only={ME} tag={(id) => sick.has(id) && <SickTag size="phone" className="absolute -right-1.5 -top-1.5" />} />}
            </>
          }
        />
      }
      rail={
        <>
          <span className="label-caps">Alerts</span>
          {s.segments.map((g) => {
            const state = t >= g.endAt ? 'done' : t >= g.announceAt ? 'now' : 'next';
            if (state === 'next') return null;
            const you = youSummary(g, ME);
            return (
              <div key={g.n} className={cx('flex items-center gap-2 rounded-control px-2 py-1.5', state === 'now' ? 'bg-alert-bg' : 'bg-raised')}>
                <SignBadge ev={g.events[0]!} size={24} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{g.events[0]!.title}</span>
                <span className={cx('text-xs', you ? 'font-bold text-alert-ink' : 'text-ink-3')}>{t < g.settleAt ? '…' : you ? you.headline.replace(' for you', '') : 'missed you'}</span>
              </div>
            );
          })}
        </>
      }
      overlay={seg && t < seg.endAt - 0.3 && <PhoneAlert seg={seg} />}
    />
  );
}

function PhoneAlert({ seg }: { seg: Segment }) {
  const { t } = useShow();
  const ev = seg.events[0]!;
  const after = t >= seg.settleAt - 0.2;
  const you = youSummary(seg, ME);
  return (
    <div key={seg.n} className="absolute inset-x-3 top-2 z-30 flex overflow-hidden rounded-panel border border-holo-line bg-panel shadow-chip animate-[ev-drop_0.3s_ease-out]" data-testid="phone-alert">
      <span className="w-2.5 shrink-0" style={{ background: ev.sign === 'good' ? 'var(--color-ok)' : HAZARD, backgroundSize: '14px 14px' }} />
      <div className="flex flex-1 items-center gap-2.5 px-2.5 py-2">
        <SignBadge ev={ev} size={36} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-alert-ink">
            {ev.sign === 'good' ? 'Good news' : 'Alert'} · {ev.key === 'sickness' ? 'this turn' : who(ev)}
          </span>
          <span className="font-display text-base font-bold leading-tight">{seg.events.length > 1 ? `${ev.title} ×${seg.events.length}` : ev.title}</span>
          {after ? (
            you ? (
              <span className="flex items-center gap-1 text-xs font-bold text-alert-ink" data-testid="phone-you">
                {you.sick && <SickTag size="phone" />}
                {you.headline}. <span className="font-normal text-ink-2">{you.detail}</span>
              </span>
            ) : (
              <span className="text-xs text-ink-2" data-testid="phone-miss">
                {missLine(seg)}
              </span>
            )
          ) : (
            <span className="text-xs text-ink-2">{TIER[ev.key] === 'headline' ? 'Look at the TV.' : ev.line}</span>
          )}
        </span>
        <Buzz on={t - seg.announceAt < 1.2} size={16} />
      </div>
    </div>
  );
}

