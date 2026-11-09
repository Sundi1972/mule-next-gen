import { ceremonyBeats, POLITICS, type CeremonyBeat, type Office } from '@mule/engine';
import type { MuleView, OfficeReveal } from '@mule/protocol';
import { Button, Creature, cx } from '@mule/ui';
import { useEffect, useState, type CSSProperties } from 'react';
import { usePhoneGame } from '../../game';
import { useHub } from '../Hub';
import { colorOf, Steps } from './parts';
import { baronWords, howWords, JOB, namer, OFFICE_NAME, promiseWords, youPromised, type Race } from './words';

/**
 * The reveal ceremony (E-2), one office at a time, on the TV and on a phone. Every layer is a function of the
 * server's one show clock and of the beats it has reached, so no screen draws a total or a winner before its beat.
 */

const C = POLITICS.ceremony;
const BLOCK = C.blockMs / 1_000;
/** The server steps the clock every 100 ms; each step glides to the next instead of jumping. */
const GLIDE = 'transition-[transform,opacity] duration-100 ease-linear motion-reduce:transition-none';

/** One office on the stage: who stands on it, its vote blocks in order, when each beat starts, and what the clock has revealed. */
interface OfficeShow {
  office: Office;
  /** In seat order, never ranked. */
  candidates: string[];
  blocks: string[];
  /** Show seconds. Beats after the one reached are where they will fall; nothing is drawn from them before they come. */
  at: { title: number; candidates: number; bars: number; tie: number | null; winner: number; end: number };
  beat: CeremonyBeat;
  reveal: OfficeReveal | undefined;
}

export interface Show {
  t: number;
  /** The offices the clock has reached, in POLITICS.offices order. */
  offices: OfficeShow[];
  /** When the whole result is held, after the last office. */
  summary: number;
}

const BEATS: readonly CeremonyBeat[] = ['title', 'candidates', 'bars', 'tie', 'winner', 'end'];
const beatIs = (s: OfficeShow, from: CeremonyBeat) => BEATS.indexOf(s.beat) >= BEATS.indexOf(from);

/** The ceremony as this view stands in it, or null outside it. */
export function showOf(view: Pick<MuleView, 'players' | 'politics'>): Show | null {
  const election = view.politics?.election;
  const ceremony = election?.ceremony;
  if (!election || !ceremony) return null;
  const seats = view.players.map((p) => p.id);
  const offices = POLITICS.offices.flatMap((office): OfficeShow[] => {
    const reached = ceremony.reached[office];
    if (!reached) return [];
    const reveal = election.result[office];
    const standing = [...(election.candidates[office] ?? [])].sort((a, b) => seats.indexOf(a) - seats.indexOf(b));
    // Until its winner beat the how is unknown; the beats it moves (tie, winner) are still ahead of the clock then.
    const race = { winner: reveal?.winner ?? '', how: reveal?.how ?? 'votes', tallies: reveal?.tallies ?? standing.map((id) => ({ id, votes: 0 })) } as const;
    const beats = ceremonyBeats(seats, { [office]: race }).offices[0]!;
    const shift = reached.at - beats.at[reached.beat]! / 1_000;
    const s = (ms: number) => ms / 1_000 + shift;
    const { title, candidates, bars, tie, winner, end } = beats.at;
    return [{ office, candidates: beats.candidates, blocks: beats.blocks, at: { title: s(title), candidates: s(candidates), bars: s(bars), tie: tie === null ? null : s(tie), winner: s(winner), end: s(end) }, beat: reached.beat, reveal }];
  });
  return { t: ceremony.seconds, offices, summary: ceremony.total - C.summaryMs / 1_000 };
}

/** The office on the stage now, or null once every office has had its turn. */
const currentOffice = (show: Show) => (show.offices.length < POLITICS.offices.length ? show.offices.at(-1) : show.offices.find((o) => o.beat !== 'end')) ?? null;

const raceOf = (s: OfficeShow): Race | null => (s.reveal?.winner && s.reveal.how ? { winner: s.reveal.winner, how: s.reveal.how, tallies: s.reveal.tallies } : null);

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

/** A fixed scatter, the same every run, so every screen throws the same confetti. */
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
            className={cx('absolute size-2 rounded-full', GLIDE)}
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
        return <span key={i} className={cx('absolute', GLIDE)} style={style} />;
      })}
    </div>
  );
}

// --- One office's ceremony, on the TV or a phone ------------------------------------------------------------------------

type Size = 'tv' | 'phone';
/** The TV holds up to six candidates on its 1280×720 frame: past two, the rows, avatars and gaps shrink with the count. */
const SZ = {
  tv: { title: 'text-9xl', head: 'text-5xl', job: 'text-3xl', creature: 88, name: 'text-5xl', promise: 'text-2xl', block: 'h-12 w-16', count: 'text-7xl', chip: 'px-3 py-1 text-xl', congrats: 'text-6xl', how: 'text-2xl', stamp: 'text-8xl', row: 'gap-6 px-5 py-3', rows: 'gap-4 px-5', k: 1, n: 90 },
  tv4: { title: 'text-9xl', head: 'text-4xl', job: 'text-2xl', creature: 52, name: 'text-3xl', promise: 'text-xl', block: 'h-9 w-12', count: 'text-5xl', chip: 'px-2.5 py-0.5 text-lg', congrats: 'text-5xl', how: 'text-xl', stamp: 'text-7xl', row: 'gap-5 px-5 py-1', rows: 'gap-3 px-5', k: 1, n: 90 },
  tv6: { title: 'text-9xl', head: 'text-3xl', job: 'text-xl', creature: 40, name: 'text-xl', promise: 'text-sm', block: 'h-6 w-9', count: 'text-4xl', chip: 'px-2 text-base', congrats: 'text-4xl', how: 'text-lg', stamp: 'text-6xl', row: 'gap-4 px-4 py-0.5', rows: 'gap-1.5 px-5', k: 1, n: 90 },
  phone: { title: 'text-6xl', head: 'text-2xl', job: 'text-sm', creature: 40, name: 'text-xl', promise: 'text-xs', block: 'h-6 w-8', count: 'text-3xl', chip: 'px-1.5 text-xs', congrats: 'text-2xl', how: 'text-xs', stamp: 'text-5xl', row: 'gap-3 px-2.5 py-1.5', rows: 'gap-2 px-3', k: 0.5, n: 50 },
} as const;

/** How full the TV's stage is: the mock's sizes up to two candidates, then four, then six. */
const tvFill = (n: number) => (n <= 2 ? 'tv' : n <= 4 ? 'tv4' : 'tv6');

function OfficeStage({ game, s: b, t, size, me, reduced, first }: { game: MuleView; s: OfficeShow; t: number; size: Size; me: string | null; reduced: boolean; first: boolean }) {
  const z = SZ[size === 'tv' ? tvFill(b.candidates.length) : size];
  const office = OFFICE_NAME[b.office];
  const tax = game.politics!.tax.percent;
  const promises = game.politics!.election!.promises;
  const big = ease(ramp(t, b.at.title, reduced ? 0.01 : 0.7));
  const toHead = beatIs(b, 'candidates') ? ramp(t, b.at.candidates - 0.35, 0.35) : 0;
  const out = 1 - ramp(t, b.at.end - 0.45, 0.45);
  const tallied = beatIs(b, 'bars');
  const shown = (id: string) => (tallied ? b.blocks.filter((x, i) => x === id && t >= b.at.bars + i * BLOCK).length : 0);
  const race = raceOf(b);
  const named = beatIs(b, 'winner') ? race : null;
  const tie = b.beat === 'tie' && b.at.tie !== null ? race : null;
  const n = b.candidates.length;
  return (
    <div className={cx('absolute inset-0', GLIDE)} style={{ opacity: out }} data-testid={`stage-${b.office}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,var(--color-holo-faint),transparent_65%)]" style={{ opacity: big }} />
      {/* The title, alone and big, then shrinking into the header. */}
      {toHead < 1 && (
        <div className={cx('absolute inset-0 grid place-items-center', GLIDE)} style={{ opacity: big * (1 - toHead) }} data-testid="reveal-title">
          <div className={cx('flex flex-col items-center gap-2 text-center', GLIDE)} style={{ transform: reduced ? undefined : `translateY(${(1 - big) * -60}px) scale(${1 - 0.3 * toHead})` }}>
            <span className={cx('label-caps', size === 'tv' ? 'text-2xl!' : 'text-xs!')}>{first ? 'The colony’s new' : 'And next, the colony’s new'}</span>
            <span className={cx('font-display font-bold leading-none text-holo', z.title)}>{office}</span>
            <span className={cx('text-ink-2', z.job)}>
              {JOB[b.office] ? `${JOB[b.office]} · ` : ''}
              {n} candidate{n === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}
      {toHead > 0 && (
        <div className={cx('relative flex h-full flex-col', z.rows, GLIDE)} style={{ opacity: toHead }}>
          <div className="flex items-baseline gap-4">
            <span className={cx('font-display font-bold text-holo', z.head)} data-testid="reveal-office">
              {office}
            </span>
            <span className={cx('text-ink-2', z.job)}>{JOB[b.office]}</span>
          </div>
          {b.candidates.map((id, i) => {
            const at = b.at.candidates + i * (C.candidateMs / 1_000);
            const pop = reduced ? (t >= at ? 1 : 0) : back(ramp(t, at, 0.45));
            const p = game.players.find((q) => q.id === id);
            const color = colorOf(game, id);
            const count = shown(id);
            const win = named?.winner === id;
            const lost = named !== null && !win;
            return (
              <div
                key={id}
                className={cx('relative flex items-center rounded-panel border', z.row, GLIDE, win ? cx('border-holo bg-holo-soft ring-2 ring-holo', !reduced && 'animate-pulse-glow') : 'border-holo-line bg-panel')}
                style={{ opacity: Math.min(1, pop) * (lost ? 0.45 : 1), transform: `scale(${(0.6 + 0.4 * pop) * (win && !reduced ? 1 + 0.02 * ease(ramp(t, b.at.winner, 0.4)) : 1)})` }}
                data-testid={`reveal-row-${b.office}-${id}`}
              >
                {p && <Creature species={p.species} color={color} size={z.creature} />}
                <span className="flex min-w-0 flex-col">
                  <span className={cx('whitespace-nowrap font-display font-semibold leading-tight', z.name)}>{id === me ? 'You' : p?.name}</span>
                  {b.office === 'governor' && promises[id] && <span className={cx('whitespace-nowrap text-ink-2', z.promise)}>{promiseWords(promises[id], tax)}</span>}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-2" aria-label={`${count} votes`} data-testid={`reveal-bar-${b.office}-${id}`}>
                  {b.blocks.map((x, k) => {
                    const at = b.at.bars + k * BLOCK;
                    if (x !== id || !tallied || t < at) return null;
                    const v = reduced ? 1 : back(ramp(t, at, 0.3));
                    return <span key={k} className={cx('shrink-0 rounded-chip', z.block, GLIDE)} style={{ background: color, opacity: Math.min(1, v), transform: `scaleX(${v})`, transformOrigin: 'left' }} />;
                  })}
                </span>
                <span data-num className={cx('w-[1.5ch] text-right font-mono font-bold', z.count)} data-testid={`reveal-count-${b.office}-${id}`}>
                  {tallied ? count : ''}
                </span>
                {win && <span className={cx('rounded-chip bg-holo font-mono font-bold text-on-holo', z.chip)}>ELECTED</span>}
              </div>
            );
          })}
          {/* A tie: stamped, then said in the words of the rule that breaks it (E-6). */}
          {tie && (
            <div className="relative flex flex-col items-center gap-1 text-center" data-testid="reveal-tie">
              <span className={cx('font-display font-bold text-warn', z.stamp, GLIDE)} style={reduced ? undefined : { transform: `scale(${1 + 0.8 * (1 - back(ramp(t, b.at.tie!, 0.4)))})`, opacity: ramp(t, b.at.tie!, 0.2) }}>
                A tie!
              </span>
              <span className={cx('max-w-[90%] text-ink', z.how, GLIDE)} style={{ opacity: ramp(t, b.at.tie! + 0.9, 0.4) }}>
                {howWords(tie, me, game)}
              </span>
            </div>
          )}
          {named && (
            <div
              className={cx('relative flex flex-col items-center gap-1 text-center', GLIDE)}
              style={reduced ? undefined : { transform: `translateY(${(1 - ease(ramp(t, b.at.winner, 0.5))) * 24}px)`, opacity: ramp(t, b.at.winner, 0.4) }}
              data-testid="reveal-congrats"
            >
              <span className={cx('font-display font-bold leading-tight', z.congrats)}>
                Congratulations, {office} {namer(game)(named.winner)}!
              </span>
              <span className={cx(named.how === 'votes' ? 'text-ink-2' : 'text-warn', z.how)} data-testid="reveal-how">
                {howWords(named, me, game)}
              </span>
            </div>
          )}
        </div>
      )}
      {named && !reduced && <Celebration dt={t - b.at.winner} color={colorOf(game, named.winner)} k={z.k} n={z.n} />}
    </div>
  );
}

const SUMMARY = {
  tv: { gap: 'gap-5', title: 'text-4xl', card: 'gap-4 px-8 py-6', creature: 88, head: 'text-5xl', line: 'text-3xl', block: 'h-10 w-14', blockGap: 'gap-1.5', how: 'text-2xl', baron: 'text-2xl', next: 'text-xl', rows: 'gap-y-4' },
  tv4: { gap: 'gap-3', title: 'text-3xl', card: 'gap-2 px-8 py-4', creature: 56, head: 'text-4xl', line: 'text-2xl', block: 'h-7 w-10', blockGap: 'gap-1', how: 'text-xl', baron: 'text-xl', next: 'text-lg', rows: 'gap-y-2' },
  tv6: { gap: 'gap-2', title: 'text-2xl', card: 'gap-1 px-6 py-3', creature: 40, head: 'text-3xl', line: 'text-xl', block: 'h-5 w-8', blockGap: 'gap-1', how: 'text-lg', baron: 'text-lg', next: 'text-base', rows: 'gap-y-1' },
} as const;

/** The whole result when the ceremony ends (E-6), with the Land Baron named (E-8). */
function Summary({ game, show, size, me }: { game: MuleView; show: Show; size: Size; me: string | null }) {
  const tv = size === 'tv';
  const baron = baronWords(game, game.politics!.baron, me);
  const name = namer(game);
  const races = show.offices.flatMap((s) => {
    const race = raceOf(s);
    return race ? [{ office: s.office, race }] : [];
  });
  const governor = races.find((r) => r.office === 'governor')?.race.winner;
  const z = SUMMARY[tvFill(Math.max(0, ...races.map((r) => r.race.tallies.length)))];
  return (
    <div className={cx('absolute inset-0 flex flex-col', tv ? z.gap : 'gap-2', GLIDE)} style={{ opacity: ramp(show.t, show.summary, 0.5) }} data-testid="reveal-summary">
      <span className={cx('font-display font-semibold', tv ? z.title : 'text-lg')}>The colony’s new {races.length > 1 ? 'officers' : (OFFICE_NAME[races[0]?.office ?? 'governor'])}</span>
      <div className={cx('grid', tv ? 'gap-6' : 'gap-2', races.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {races.map(({ office, race }) => {
          const w = game.players.find((p) => p.id === race.winner);
          return (
            <section key={office} className={cx('flex flex-col rounded-panel border border-holo bg-panel shadow-glow', tv ? z.card : 'gap-1 p-2')} data-testid={`summary-${office}`}>
              <span className="flex items-center gap-3">
                {w && <Creature species={w.species} color={colorOf(game, w.id)} size={tv ? z.creature : 30} />}
                <span className={cx('font-display font-semibold', tv ? z.head : 'text-base')}>
                  {OFFICE_NAME[office]} {race.winner === me ? `${name(race.winner)} (you)` : name(race.winner)}
                </span>
              </span>
              {/* On the TV one column of names, as wide as the longest, so no name wraps and the blocks line up. */}
              <span className={cx(tv ? cx('grid grid-cols-[max-content_1fr] items-center gap-x-2', z.rows, z.line) : 'flex flex-col gap-1 text-xs')}>
                {race.tallies.map((x) => (
                  <span key={x.id} className={tv ? 'contents' : 'flex items-center gap-2'} data-testid={`summary-${office}-${x.id}`}>
                    <span className={cx('font-semibold', tv ? 'min-w-40 whitespace-nowrap' : 'w-12 shrink-0')}>{x.id === me ? 'You' : name(x.id)}</span>
                    <span className="flex items-center gap-2">
                      <Blocks n={x.votes} color={colorOf(game, x.id)} className={tv ? z.block : 'h-3 w-4'} gap={tv ? z.blockGap : 'gap-1'} />
                      <span data-num className="font-mono font-bold">
                        {x.votes}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
              <span className={cx(race.how === 'votes' ? 'text-ink-2' : 'text-warn', tv ? z.how : 'text-[11px] leading-snug')}>{howWords(race, me, game)}</span>
            </section>
          );
        })}
      </div>
      <p className={cx('self-start', tv ? z.baron : 'text-[11px] leading-snug')} data-testid="summary-baron">
        <strong className="font-semibold">{baron.head}.</strong> <span className="text-ink-2">{baron.rule}</span>
      </p>
      {governor && <p className={cx('text-ink-2', tv ? z.next : 'text-[11px]')}>Who voted for whom stays secret. Next: Governor {name(governor)} sets the sales tax.</p>}
    </div>
  );
}

/** A row of vote blocks, one per vote. */
export function Blocks({ n, color, className, gap = 'gap-0.5' }: { n: number; color: string; className: string; gap?: string }) {
  return (
    <span className={cx('flex flex-wrap', gap)} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cx('rounded-chip', className)} style={{ background: color }} />
      ))}
    </span>
  );
}

/** The offices along the bottom: done, now, next. */
export function Progress({ game, show, size }: { game: MuleView; show: Show; size: Size }) {
  const name = namer(game);
  return (
    <ol className={cx('flex items-center', size === 'tv' ? 'gap-4 text-xl' : 'gap-2 text-[11px]')} data-testid="reveal-progress">
      {POLITICS.offices.map((office) => {
        const s = show.offices.find((o) => o.office === office);
        const race = s && beatIs(s, 'winner') ? raceOf(s) : null;
        const now = s && !race;
        return (
          <li key={office} className={cx('rounded-chip border font-semibold', size === 'tv' ? 'px-3 py-1' : 'px-1.5', now ? 'border-holo text-holo' : race ? 'border-holo-faint text-ok' : 'border-holo-faint text-ink-3')}>
            {OFFICE_NAME[office]}
            {race ? `: ${name(race.winner)} ✓` : now ? ': now' : ': next'}
          </li>
        );
      })}
    </ol>
  );
}

/** The ceremony's stage: the office now, or the whole result once every office has had its turn. */
export function Ceremony({ game, show, size, me }: { game: MuleView; show: Show; size: Size; me: string | null }) {
  const reduced = useReducedMotion();
  const s = currentOffice(show);
  return (
    <div className="relative min-h-0 flex-1">
      {s ? <OfficeStage key={s.office} game={game} s={s} t={show.t} size={size} me={me} reduced={reduced} first={s === show.offices[0]} /> : <Summary game={game} show={show} size={size} me={me} />}
    </div>
  );
}

function PhoneHeader() {
  const { view } = usePhoneGame();
  return (
    <header className="flex items-center gap-3">
      <span className="label-caps text-[10px]!">
        Month {view.month} / {view.maxMonths}
      </span>
      <span className="font-display text-base font-semibold">Election day · the result</span>
      <span className="ml-auto">
        <Steps at={3} />
      </span>
    </header>
  );
}

/** A phone with no TV in the room: the phone carries the ceremony itself, full screen. */
export function PhoneRevealSolo({ show }: { show: Show }) {
  const { view, me } = usePhoneGame();
  const mine = show.t >= show.summary && show.offices.some((s) => raceOf(s)?.winner === me.id && s.office === 'governor');
  return (
    <div className="relative flex h-full flex-col gap-2 overflow-hidden bg-table p-3 text-ink" data-testid="phone-reveal-solo">
      <PhoneHeader />
      <Ceremony game={view} show={show} size="phone" me={me.id} />
      <div className="flex items-center justify-between">
        <Progress game={view} show={show} size="phone" />
        {mine && <ToGovernor link />}
      </div>
    </div>
  );
}

/**
 * A phone while the TV carries the ceremony: it says look up, never shows a total the TV is still growing, and gives
 * each office's whole result once the TV has named its winner. Your own win is celebrated on your own phone too.
 */
export function PhoneRevealWithTv({ show }: { show: Show }) {
  const { view, me } = usePhoneGame();
  const reduced = useReducedMotion();
  const name = namer(view);
  const known = (s: OfficeShow | undefined) => (s && beatIs(s, 'winner') ? raceOf(s) : null);
  const mineWon = show.offices.find((s) => known(s)?.winner === me.id);
  const latest = show.offices.at(-1);
  const nextOffice = known(latest) !== null && latest!.office !== POLITICS.offices.at(-1);
  // Once the TV has named the last office's winner there is nothing left to count.
  const lastNamed = !nextOffice && latest ? known(latest) : null;
  const over = show.t >= show.summary && show.offices.length === POLITICS.offices.length;
  const baron = baronWords(view, view.politics!.baron, me.id);
  const promise = view.politics!.election!.promises[me.id];
  return (
    <div className="relative flex h-full flex-col gap-2 overflow-hidden bg-table p-3 text-ink" data-testid="phone-reveal-tv">
      <PhoneHeader />
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(0,300px)] gap-3">
        <div className="flex min-w-0 flex-col gap-2 overflow-y-auto">
          {!over && (
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-holo" data-testid="look-up">
              <svg aria-hidden viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x={2.5} y={4} width={19} height={12.5} rx={2} />
                <path d="M8 20.5h8M12 16.5v4" />
              </svg>
              Look up: the result is on the TV
            </span>
          )}
          {POLITICS.offices.map((office) => {
            const s = show.offices.find((o) => o.office === office);
            const race = known(s);
            const now = s && !race;
            return (
              <section key={office} className={cx('flex flex-col gap-0.5 rounded-panel border p-2', now ? 'border-holo bg-holo-soft' : 'border-holo-line bg-panel')} data-testid={`companion-${office}`}>
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-base font-semibold">{OFFICE_NAME[office]}</span>
                  <span className="text-xs text-ink-2">{race ? '' : now ? 'on the TV now…' : 'next'}</span>
                </span>
                {race?.tallies.map((x) => (
                  <span key={x.id} className="flex items-center gap-2 text-xs" data-testid={`companion-${office}-${x.id}`}>
                    <span className="w-10 shrink-0 truncate font-semibold">{x.id === me.id ? 'You' : name(x.id)}</span>
                    <Blocks n={x.votes} color={colorOf(view, x.id)} className="h-2.5 w-3" />
                    <span data-num className="font-mono font-bold">
                      {x.votes}
                    </span>
                    {x.id === race.winner && <span className="rounded-chip bg-holo px-1 font-mono text-[10px] font-bold leading-4 text-on-holo">ELECTED</span>}
                  </span>
                ))}
                {race && <span className={cx('text-[11px] leading-snug', race.how === 'votes' ? 'text-ink-2' : 'text-warn')}>{howWords(race, me.id, view)}</span>}
              </section>
            );
          })}
          {over && (
            <p className="self-start text-[11px] leading-snug" data-testid="companion-baron">
              <strong className="font-semibold">{baron.head}.</strong> <span className="text-ink-2">{baron.rule}</span>
            </p>
          )}
        </div>
        <div className="relative flex min-w-0 flex-col justify-center gap-2">
          {mineWon ? (
            <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-sheet border-2 border-holo bg-holo-soft p-3 text-center shadow-glow" data-testid="companion-mine">
              <Creature species={me.species} color={colorOf(view, me.id)} size={56} />
              <span className="font-display text-xl font-bold leading-tight">
                Congratulations, {OFFICE_NAME[mineWon.office]} {name(me.id)}!
              </span>
              {mineWon.office === 'governor' && <span className="text-xs text-ink-2">You set the sales tax next.{promise && ` ${youPromised(promise, view.politics!.tax.percent)}`}</span>}
              {over && mineWon.office === 'governor' && <ToGovernor />}
              {!reduced && <Celebration dt={show.t - mineWon.at.winner} color={colorOf(view, me.id)} k={0.4} n={40} />}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-sheet border border-holo-line bg-panel p-3 text-center" data-testid="companion-wait">
              <span className="font-display text-base font-semibold">{nextOffice ? 'Next office on the TV' : lastNamed ? `${name(lastNamed.winner)} is ${OFFICE_NAME[latest!.office]}. The TV shows the whole result.` : 'The votes are being counted on the TV'}</span>
              <span className="text-xs text-ink-2">Your phone shows each result once the TV has named the winner, so nobody’s screen gives it away.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The new Governor's way to the tax desk, which the hub opens first once the ceremony is over. */
function ToGovernor({ link = false }: { link?: boolean }) {
  const { openDesk } = useHub();
  if (link)
    return (
      <button type="button" onClick={() => openDesk('governor')} className="min-h-8 text-xs font-semibold text-holo underline" data-testid="to-governor">
        To your Governor’s desk ›
      </button>
    );
  return (
    <Button size="md" className="w-full" onClick={() => openDesk('governor')} data-testid="companion-to-governor">
      To your Governor’s desk
    </Button>
  );
}
