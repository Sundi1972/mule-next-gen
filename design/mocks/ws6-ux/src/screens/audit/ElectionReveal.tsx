import type { Office } from '@mule/engine';
import { Button, Creature, cx, SLOT_COLOR } from '@mule/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { VIEW } from '../../fixture';
import { IntentMarker } from '../../proposed/IntentNote';
import { baronWords, ELECTION_MONTH, ELECTION_NOTES as N, FIELD, howWords, JOB, LENA_CAP, ME, OFFICE_NAME, promiseWords, PROMISE, RESULT, seat, Steps, type Race } from './ElectionAudit';

/**
 * The reveal ceremony (UX audit E-2, Heiko 2026-10-28: "we dramatically reveal the results: showing the office, the
 * candidates, and then we let a bar grow next to them representing the votes. And then we announce the winner with
 * some dramatic celebration and congratulations etc. Then the next office comes, same ceremony.").
 *
 * The craft follows WS8's approved event show ("Living weather"): one engine for the TV and for a phone with no TV,
 * every layer a pure function of one show clock, only transform and opacity moving, and with reduced motion the
 * entrances become plain appearances and the confetti stays away. Because it is a function of the clock, a still of
 * any beat is the same picture the animation passes through.
 *
 * Governor only for now (Heiko 2026-10-28): the ceremony runs over a list of offices of length one; a second office
 * would follow with the same beats. Per office: the title drops in; the candidates pop in, in seat order (never ranked, so the order gives nothing
 * away); vote blocks grow one at a time, interleaved across the candidates; a tie is stamped and said in the words of
 * the rule that decides it (E-6); the winner glows, confetti and fireworks burst, "Congratulations, Governor Lena!".
 * Then the next office. At the end the whole result stays, with the Land Baron named (E-8).
 *
 * GRAFT TARGET: apps/web/src/table/TvElection.tsx (the TV), apps/web/src/phone/hub/politics/Council.tsx's
 * ElectionResult (the phone, with and without a TV). The beats' timings are WS6's; the result is WS7's.
 */

/** Seconds per vote block. */
const BLOCK = 0.55;

export interface OfficeBeat {
  race: Race;
  /** The candidates in seat order, as they stand on the stage. */
  cands: string[];
  /** One entry per vote block, in the order they appear. */
  order: string[];
  title: number;
  cands0: number;
  bars: number;
  blocksEnd: number;
  tie: number | null;
  winner: number;
  end: number;
}

/** When each beat of the ceremony starts, for these offices. */
export function timeline(offices: readonly Office[]) {
  let t = 0.3;
  const beats: OfficeBeat[] = offices.map((o) => {
    const race = RESULT[o]!;
    const cands = FIELD[o]!;
    const votes = (id: string) => race.tallies.find((x) => x.id === id)?.votes ?? 0;
    const order: string[] = [];
    for (let r = 0; r < Math.max(...cands.map(votes)); r++) for (const id of cands) if (votes(id) > r) order.push(id);
    const title = t;
    const cands0 = title + 1.8;
    const bars = cands0 + cands.length * 0.5 + 0.5;
    const blocksEnd = bars + order.length * BLOCK;
    const tie = race.how === 'land' || race.how === 'lot' || race.how === 'baron' ? blocksEnd + 0.4 : null;
    const winner = tie !== null ? tie + 2.6 : blocksEnd + 0.7;
    const end = winner + 3.8;
    t = end;
    return { race, cands, order, title, cands0, bars, blocksEnd, tie, winner, end };
  });
  return { beats, summary: t, end: t + 1.5 };
}

/** The still frames, one per beat, for review: `#audit-election-reveal-<id>`. */
export function revealStills(offices: readonly Office[]): { id: string; title: string; t: number }[] {
  const tl = timeline(offices);
  const out = tl.beats.flatMap((b) => {
    const o = OFFICE_NAME[b.race.office];
    return [
      { id: `${b.race.office}-title`, title: `${o}: the title`, t: b.title + 1.2 },
      { id: `${b.race.office}-candidates`, title: `${o}: the candidates`, t: b.bars - 0.15 },
      { id: `${b.race.office}-votes`, title: `${o}: the bars grow`, t: b.bars + (b.order.length - 2 + 0.6) * BLOCK },
      ...(b.tie !== null ? [{ id: `${b.race.office}-tie`, title: `${o}: a tie`, t: b.tie + 1.6 }] : []),
      { id: `${b.race.office}-winner`, title: `${o}: the winner`, t: b.winner + 0.9 },
    ];
  });
  return [...out, { id: 'result', title: 'The whole result', t: tl.summary + 1.2 }];
}

/** What the ceremony is showing at `t`, in words, for the reviewer's controls. */
export function beatLabel(offices: readonly Office[], t: number): string {
  const tl = timeline(offices);
  const b = tl.beats.find((x) => t < x.end);
  if (!b) return 'The whole result';
  const o = OFFICE_NAME[b.race.office];
  return t < b.cands0 ? `${o}: the title` : t < b.bars ? `${o}: the candidates` : t < b.blocksEnd ? `${o}: the votes` : b.tie !== null && t < b.winner ? `${o}: a tie` : `${o}: the winner`;
}

// --- The clock ---------------------------------------------------------------------------------------------------------

/** The show clock: plays from 0 to `end` and holds there; `fixed` holds a still. */
export function useRevealClock(end: number, fixed: number | null) {
  const [t, setT] = useState(fixed ?? 0);
  const [playing, setPlaying] = useState(fixed === null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (fixed !== null) {
      setT(fixed);
      setPlaying(false);
    }
  }, [fixed]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    last.current = null;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setT((v) => {
        const next = Math.min(end, v + dt);
        if (next >= end) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, end]);
  return {
    t,
    playing,
    replay: () => {
      setT(0);
      setPlaying(true);
    },
    toggle: () => {
      if (t >= end) setT(0);
      setPlaying((p) => !p);
    },
    seek: (v: number) => {
      setT(v);
      setPlaying(false);
    },
  };
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (t: number, at: number, dur: number) => clamp((t - at) / dur);
const ease = (v: number) => v * v * (3 - 2 * v);
/** Overshoots a little, then settles: a pop. */
const back = (v: number) => {
  const c = 1.9;
  return v >= 1 ? 1 : 1 + (c + 1) * (v - 1) ** 3 + c * (v - 1) ** 2;
};

// --- Confetti and fireworks: pure functions of the time since the winner was named ------------------------------------

/** A fixed scatter, the same every run (a still must match the animation). */
const PIECES = (() => {
  let s = 0x2f6e2b1;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 90 }, () => ({ vx: (rnd() - 0.5) * 2, vy: -(0.55 + rnd() * 0.75), rot: rnd() * 360, vr: (rnd() - 0.5) * 900, delay: rnd() * 0.25, c: Math.floor(rnd() * 6), w: 0.6 + rnd() * 0.8, sway: rnd() * 6 }));
})();
const SPARKS = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2);
const BURSTS = [
  { x: -0.3, y: -0.15, at: 0.1 },
  { x: 0.28, y: -0.22, at: 0.45 },
  { x: 0.02, y: -0.3, at: 0.85 },
];

/** Confetti from the winner's row and three fireworks above it. `k` scales it: 1 on the TV. */
function Celebration({ dt, color, k, n }: { dt: number; color: string; k: number; n: number }) {
  if (dt < 0 || dt > 3.6) return null;
  const colors = [color, 'var(--color-holo)', 'var(--color-ok)', 'var(--color-warn)', 'var(--color-g-crystite)', 'var(--color-g-energy)'];
  const G = 1500 * k;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden data-testid="celebration">
      {BURSTS.map((b, i) => {
        const bt = dt - b.at;
        if (bt < 0 || bt > 1.3) return null;
        const r = 160 * k * ease(clamp(bt / 0.9));
        const o = 1 - ramp(bt, 0.6, 0.7);
        return SPARKS.map((a, j) => (
          <span
            key={`${i}-${j}`}
            className="absolute size-2 rounded-full"
            style={{ left: `${50 + b.x * 100}%`, top: `${45 + b.y * 100}%`, background: colors[(i + j) % colors.length], opacity: o, transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r + 120 * k * bt * bt}px) scale(${k})` }}
          />
        ));
      })}
      {PIECES.slice(0, n).map((p, i) => {
        const pt = dt - p.delay;
        if (pt < 0) return null;
        const x = p.vx * 520 * k * pt + Math.sin(pt * p.sway) * 14 * k;
        const y = p.vy * 1100 * k * pt + 0.5 * G * pt * pt;
        const style: CSSProperties = {
          left: '50%',
          top: '58%',
          width: 10 * k * p.w,
          height: 5 * k * p.w,
          background: colors[p.c],
          opacity: 1 - ramp(pt, 2.4, 0.9),
          transform: `translate(${x}px, ${y}px) rotate(${p.rot + p.vr * pt}deg)`,
        };
        return <span key={i} className="absolute" style={style} />;
      })}
    </div>
  );
}

// --- One office's ceremony, on the TV or a phone ------------------------------------------------------------------------

type Size = 'tv' | 'phone';
const SZ = {
  tv: { title: 'text-9xl', head: 'text-5xl', job: 'text-3xl', creature: 88, name: 'text-5xl', promise: 'text-2xl', block: 'h-12 w-16', count: 'text-7xl', chip: 'px-3 py-1 text-xl', congrats: 'text-6xl', how: 'text-2xl', stamp: 'text-8xl', row: 'gap-6 px-5 py-3', rows: 'gap-4 px-5', k: 1, n: 90 },
  phone: { title: 'text-6xl', head: 'text-2xl', job: 'text-sm', creature: 40, name: 'text-xl', promise: 'text-xs', block: 'h-6 w-8', count: 'text-3xl', chip: 'px-1.5 text-xs', congrats: 'text-2xl', how: 'text-xs', stamp: 'text-5xl', row: 'gap-3 px-2.5 py-1.5', rows: 'gap-2 px-3', k: 0.5, n: 50 },
} as const;

function OfficeStage({ b, t, size, me, reduced, first }: { b: OfficeBeat; t: number; size: Size; me: string | null; reduced: boolean; first: boolean }) {
  const s = SZ[size];
  const office = OFFICE_NAME[b.race.office];
  const big = ease(ramp(t, b.title, reduced ? 0.01 : 0.7));
  const toHead = ramp(t, b.cands0 - 0.35, 0.35);
  const out = 1 - ramp(t, b.end - 0.45, 0.45);
  const shown = (id: string) => b.order.filter((x, i) => x === id && t >= b.bars + i * BLOCK).length;
  const named = t >= b.winner;
  const w = seat(b.race.winner);
  const tieOn = b.tie !== null && t >= b.tie;
  return (
    <div className="absolute inset-0" style={{ opacity: out }} data-testid={`stage-${b.race.office}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,var(--color-holo-faint),transparent_65%)]" style={{ opacity: big }} />
      {/* The title, alone and big, then shrinking into the header. */}
      {toHead < 1 && (
        <div className="absolute inset-0 grid place-items-center" style={{ opacity: big * (1 - toHead) }} data-testid="reveal-title">
          <div className="flex flex-col items-center gap-2 text-center" style={{ transform: reduced ? undefined : `translateY(${(1 - big) * -60}px) scale(${1 - 0.3 * toHead})` }}>
            <span className={cx('label-caps', size === 'tv' ? 'text-2xl!' : 'text-xs!')}>{first ? 'The colony’s new' : 'And next, the colony’s new'}</span>
            <span className={cx('font-display font-bold leading-none text-holo', s.title)}>{office}</span>
            <span className={cx('text-ink-2', s.job)}>
              {JOB[b.race.office]} · {b.cands.length} candidates
            </span>
          </div>
        </div>
      )}
      {toHead > 0 && (
        <div className={cx('relative flex h-full flex-col', s.rows)} style={{ opacity: toHead }}>
          <div className="flex items-baseline gap-4">
            <span className={cx('font-display font-bold text-holo', s.head)} data-testid="reveal-office">
              {office}
            </span>
            <span className={cx('text-ink-2', s.job)}>{JOB[b.race.office]}</span>
          </div>
          {b.cands.map((id, i) => {
            const pop = reduced ? (t >= b.cands0 + i * 0.5 ? 1 : 0) : back(ramp(t, b.cands0 + i * 0.5, 0.45));
            const p = seat(id);
            const n = shown(id);
            const win = named && id === b.race.winner;
            const lost = named && !win;
            return (
              <div
                key={id}
                className={cx('relative flex items-center rounded-panel border', s.row, win ? 'border-holo bg-holo-soft ring-2 ring-holo animate-pulse-glow' : 'border-holo-line bg-panel')}
                style={{ opacity: Math.min(1, pop) * (lost ? 0.45 : 1), transform: `scale(${(0.6 + 0.4 * pop) * (win && !reduced ? 1 + 0.02 * ease(ramp(t, b.winner, 0.4)) : 1)})` }}
                data-testid={`reveal-row-${b.race.office}-${id}`}
              >
                <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={s.creature} />
                <span className="flex min-w-0 flex-col">
                  <span className={cx('whitespace-nowrap font-display font-semibold leading-tight', s.name)}>{id === me ? 'You' : p.name}</span>
                  {b.race.office === 'governor' && (
                    <span className={cx('relative whitespace-nowrap text-ink-2', s.promise)}>
                      {promiseWords(PROMISE[id])}
                      {i === 0 && <IntentMarker note={N.E4} part={`reveal-${size}`} at="tr" />}
                    </span>
                  )}
                </span>
                <span className="flex flex-1 items-center gap-1.5 pl-2" aria-label={`${n} votes`} data-testid={`reveal-bar-${b.race.office}-${id}`}>
                  {b.order.map((x, k) =>
                    x !== id ? null : (() => {
                      const at = b.bars + k * BLOCK;
                      const v = reduced ? (t >= at ? 1 : 0) : back(ramp(t, at, 0.3));
                      return t < at ? null : <span key={k} className={cx('rounded-chip', s.block)} style={{ background: SLOT_COLOR[p.slot], opacity: Math.min(1, v), transform: `scaleX(${v})`, transformOrigin: 'left' }} />;
                    })(),
                  )}
                </span>
                <span data-num className={cx('w-[1.5ch] text-right font-mono font-bold', s.count)} data-testid={`reveal-count-${b.race.office}-${id}`}>
                  {t >= b.bars ? n : ''}
                </span>
                {win && <span className={cx('rounded-chip bg-holo font-mono font-bold text-on-holo', s.chip)}>ELECTED</span>}
              </div>
            );
          })}
          {/* A tie: stamped, then said in the words of the rule that breaks it (E-6). */}
          {tieOn && !named && (
            <div className="relative flex flex-col items-center gap-1 text-center" data-testid="reveal-tie">
              <span className={cx('font-display font-bold text-warn', s.stamp)} style={reduced ? undefined : { transform: `scale(${1 + 0.8 * (1 - back(ramp(t, b.tie!, 0.4)))})`, opacity: ramp(t, b.tie!, 0.2) }}>
                A tie!
              </span>
              <span className={cx('max-w-[90%] text-ink', s.how)} style={{ opacity: ramp(t, b.tie! + 0.9, 0.4) }}>
                {howWords(b.race, me)}
              </span>
              <IntentMarker note={N.E6} part={`tie-${size}`} at="tr" />
            </div>
          )}
          {named && (
            <div className="relative flex flex-col items-center gap-1 text-center" style={reduced ? undefined : { transform: `translateY(${(1 - ease(ramp(t, b.winner, 0.5))) * 24}px)`, opacity: ramp(t, b.winner, 0.4) }} data-testid="reveal-congrats">
              <span className={cx('font-display font-bold leading-tight', s.congrats)}>
                Congratulations, {office} {w.name}!
              </span>
              <span className={cx(b.race.how === 'votes' ? 'text-ink-2' : 'text-warn', s.how)} data-testid="reveal-how">
                {howWords(b.race, me)}
              </span>
              <IntentMarker note={N.E6} part={`how-${size}`} at="tr" />
            </div>
          )}
        </div>
      )}
      {named && !reduced && <Celebration dt={t - b.winner} color={SLOT_COLOR[w.slot]} k={s.k} n={s.n} />}
    </div>
  );
}

/** The whole result when the ceremony ends (E-6), with the Land Baron named (E-8). */
function Summary({ beats, size, me, t, at }: { beats: OfficeBeat[]; size: Size; me: string | null; t: number; at: number }) {
  const tv = size === 'tv';
  const baron = baronWords(me);
  const gov = seat(RESULT.governor!.winner);
  return (
    <div className={cx('absolute inset-0 flex flex-col', tv ? 'gap-5' : 'gap-2')} style={{ opacity: ramp(t, at, 0.5) }} data-testid="reveal-summary">
      <span className={cx('font-display font-semibold', tv ? 'text-4xl' : 'text-lg')}>The colony’s new {beats.length > 1 ? 'officers' : 'Governor'}</span>
      <div className={cx('relative grid', tv ? 'gap-6' : 'gap-2', beats.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {beats.map((b) => {
          const w = seat(b.race.winner);
          return (
            <section key={b.race.office} className={cx('flex flex-col rounded-panel border border-holo bg-panel shadow-glow', tv ? 'gap-4 px-8 py-6' : 'gap-1 p-2')} data-testid={`summary-${b.race.office}`}>
              <span className="flex items-center gap-3">
                <Creature species={w.species} color={SLOT_COLOR[w.slot]} size={tv ? 88 : 30} />
                <span className={cx('font-display font-semibold', tv ? 'text-5xl' : 'text-base')}>
                  {OFFICE_NAME[b.race.office]} {w.id === me ? 'Lena (you)' : w.name}
                </span>
              </span>
              {b.race.tallies.map((x) => (
                <span key={x.id} className={cx('flex items-center gap-2', tv ? 'text-3xl' : 'text-xs')} data-testid={`summary-${b.race.office}-${x.id}`}>
                  <span className={cx('font-semibold', tv ? 'w-40' : 'w-12')}>{x.id === me ? 'You' : seat(x.id).name}</span>
                  <span className={cx('flex', tv ? 'gap-1.5' : 'gap-1')}>
                    {Array.from({ length: x.votes }, (_, i) => (
                      <span key={i} className={cx('rounded-chip', tv ? 'h-10 w-14' : 'h-3 w-4')} style={{ background: SLOT_COLOR[seat(x.id).slot] }} />
                    ))}
                  </span>
                  <span data-num className="font-mono font-bold">
                    {x.votes}
                  </span>
                </span>
              ))}
              <span className={cx(b.race.how === 'votes' ? 'text-ink-2' : 'text-warn', tv ? 'text-2xl' : 'text-[11px] leading-snug')}>{howWords(b.race, me)}</span>
            </section>
          );
        })}
        <IntentMarker note={N.E6} part={`summary-${size}`} at="tr" />
      </div>
      <p className={cx('relative self-start pr-4', tv ? 'text-2xl' : 'text-[11px] leading-snug')} data-testid="summary-baron">
        <strong className="font-semibold">{baron.head}.</strong> <span className="text-ink-2">{baron.rule}</span>
        <IntentMarker note={N.E8} part={`summary-${size}`} at="tr" />
      </p>
      <p className={cx('text-ink-2', tv ? 'text-xl' : 'text-[11px]')}>
        Who voted for whom stays secret. Next: Governor {gov.name} sets the sales tax.
      </p>
    </div>
  );
}

/** The offices along the bottom: done, now, next. */
function Progress({ beats, t, size }: { beats: OfficeBeat[]; t: number; size: Size }) {
  return (
    <ol className={cx('flex items-center', size === 'tv' ? 'gap-4 text-xl' : 'gap-2 text-[11px]')} data-testid="reveal-progress">
      {beats.map((b) => {
        const done = t >= b.winner;
        const now = t >= b.title && t < b.end;
        return (
          <li key={b.race.office} className={cx('rounded-chip border font-semibold', size === 'tv' ? 'px-3 py-1' : 'px-1.5', now ? 'border-holo text-holo' : done ? 'border-holo-faint text-ok' : 'border-holo-faint text-ink-3')}>
            {OFFICE_NAME[b.race.office]}
            {done ? `: ${seat(b.race.winner).name} ✓` : now ? ': now' : ': next'}
          </li>
        );
      })}
    </ol>
  );
}

function Ceremony({ offices, t, size, me }: { offices: readonly Office[]; t: number; size: Size; me: string | null }) {
  const reduced = useReducedMotion();
  const tl = timeline(offices);
  const b = tl.beats.find((x) => t < x.end);
  return (
    <div className="relative min-h-0 flex-1">
      {b ? <OfficeStage key={b.race.office} b={b} t={t} size={size} me={me} reduced={reduced} first={b === tl.beats[0]} /> : <Summary beats={tl.beats} size={size} me={me} t={t} at={tl.summary} />}
    </div>
  );
}

/** The ceremony on the big screen, its centrepiece. */
export function TvReveal({ offices, t }: { offices: readonly Office[]; t: number }) {
  return (
    <div className="h-[720px] w-[1280px] @container/shell">
      <div className="relative flex h-full flex-col gap-4 overflow-hidden bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-reveal">
        <TvHeader game={{ ...VIEW, phase: 'planning', month: ELECTION_MONTH }} title="Election day · the result" />
        <Ceremony offices={offices} t={t} size="tv" me={null} />
        <div className="flex items-center justify-between">
          <Progress beats={timeline(offices).beats} t={t} size="tv" />
          <Steps at={3} tv />
        </div>
        <IntentMarker note={N.E2} part="reveal-tv" at="tl-in" />
      </div>
    </div>
  );
}

/** A phone with no TV in the room: the phone carries the ceremony itself, full screen. */
export function PhoneRevealSolo({ offices, t }: { offices: readonly Office[]; t: number }) {
  return (
    <div className="relative flex h-full flex-col gap-2 overflow-hidden bg-table p-3 text-ink" data-testid="phone-reveal-solo">
      <header className="flex items-center gap-3">
        <span className="label-caps text-[10px]!">
          Month {ELECTION_MONTH} / {VIEW.maxMonths}
        </span>
        <span className="font-display text-base font-semibold">Election day · the result</span>
        <span className="ml-auto">
          <Steps at={3} />
        </span>
      </header>
      <Ceremony offices={offices} t={t} size="phone" me={ME} />
      <div className="flex items-center justify-between">
        <Progress beats={timeline(offices).beats} t={t} size="phone" />
        {t >= timeline(offices).summary && (
          <a href="#audit-election-governor" className="text-xs font-semibold text-holo underline" data-testid="to-governor">
            To your Governor’s desk ›
          </a>
        )}
      </div>
      <IntentMarker note={N.E2} part="reveal-solo" at="tl-in" />
    </div>
  );
}

/**
 * A phone while the TV carries the ceremony: it says look up, never spoils a bar the TV is still growing, and gives
 * each office's whole result once the TV has named its winner. Your own win is celebrated on your own phone too.
 */
export function PhoneRevealWithTv({ offices, t }: { offices: readonly Office[]; t: number }) {
  const reduced = useReducedMotion();
  const tl = timeline(offices);
  const gov = tl.beats[0]!;
  const mineWon = tl.beats.find((b) => b.race.winner === ME && t >= b.winner);
  const over = t >= tl.summary;
  const baron = baronWords(ME);
  return (
    <div className="relative flex h-full flex-col gap-2 overflow-hidden bg-table p-3 text-ink" data-testid="phone-reveal-tv">
      <header className="flex items-center gap-3">
        <span className="label-caps text-[10px]!">
          Month {ELECTION_MONTH} / {VIEW.maxMonths}
        </span>
        <span className="font-display text-base font-semibold">Election day · the result</span>
        <span className="ml-auto">
          <Steps at={3} />
        </span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {!over && (
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-holo" data-testid="look-up">
              <svg aria-hidden viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x={2.5} y={4} width={19} height={12.5} rx={2} />
                <path d="M8 20.5h8M12 16.5v4" />
              </svg>
              Look up: the result is on the TV
            </span>
          )}
          {tl.beats.map((b) => {
            const known = t >= b.winner;
            const now = t >= b.title && t < b.winner;
            return (
              <section key={b.race.office} className={cx('flex flex-col gap-0.5 rounded-panel border p-2', now ? 'border-holo bg-holo-soft' : 'border-holo-line bg-panel')} data-testid={`companion-${b.race.office}`}>
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-base font-semibold">{OFFICE_NAME[b.race.office]}</span>
                  <span className="text-xs text-ink-2">{known ? '' : now ? 'on the TV now…' : 'next'}</span>
                </span>
                {known &&
                  b.race.tallies.map((x) => (
                    <span key={x.id} className="flex items-center gap-2 text-xs" data-testid={`companion-${b.race.office}-${x.id}`}>
                      <span className="w-10 font-semibold">{x.id === ME ? 'You' : seat(x.id).name}</span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: x.votes }, (_, i) => (
                          <span key={i} className="h-2.5 w-3 rounded-chip" style={{ background: SLOT_COLOR[seat(x.id).slot] }} />
                        ))}
                      </span>
                      <span data-num className="font-mono font-bold">
                        {x.votes}
                      </span>
                      {x.id === b.race.winner && <span className="rounded-chip bg-holo px-1 font-mono text-[9px] font-bold leading-4 text-on-holo">ELECTED</span>}
                    </span>
                  ))}
                {known && <span className={cx('text-[11px] leading-snug', b.race.how === 'votes' ? 'text-ink-2' : 'text-warn')}>{howWords(b.race, ME)}</span>}
              </section>
            );
          })}
          {over && (
            <p className="relative self-start pr-4 text-[11px] leading-snug" data-testid="companion-baron">
              <strong className="font-semibold">{baron.head}.</strong> <span className="text-ink-2">{baron.rule}</span>
              <IntentMarker note={N.E8} part="companion" at="tr" />
            </p>
          )}
        </div>
        <div className="relative flex flex-col justify-center gap-2">
          {mineWon ? (
            <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-sheet border-2 border-holo bg-holo-soft p-3 text-center shadow-glow" data-testid="companion-mine">
              <Creature species={seat(ME).species} color={SLOT_COLOR[seat(ME).slot]} size={56} />
              <span className="font-display text-xl font-bold leading-tight">Congratulations, {OFFICE_NAME[mineWon.race.office]} {seat(ME).name}!</span>
              <span className="text-xs text-ink-2">You set the sales tax next. You promised no higher than {LENA_CAP}%.</span>
              {over && (
                <Button size="md" className="w-full" onClick={() => (window.location.hash = 'audit-election-governor')} data-testid="companion-to-governor">
                  To your Governor’s desk
                </Button>
              )}
              {!reduced && <Celebration dt={t - mineWon.winner} color={SLOT_COLOR[seat(ME).slot]} k={0.4} n={40} />}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-sheet border border-holo-line bg-panel p-3 text-center" data-testid="companion-wait">
              <span className="font-display text-base font-semibold">{t < gov.winner ? 'The votes are being counted on the TV' : 'Next office on the TV'}</span>
              <span className="text-xs text-ink-2">Your phone shows each result once the TV has named the winner, so nobody’s screen gives it away.</span>
            </div>
          )}
          <IntentMarker note={N.E6} part="companion" at="tr" />
        </div>
      </div>
      <IntentMarker note={N.E2} part="reveal-phone" at="tl-in" />
    </div>
  );
}
