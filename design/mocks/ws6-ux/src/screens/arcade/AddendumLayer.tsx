import { cx, GOOD_NAME } from '@mule/ui';
import { useState, type CSSProperties } from 'react';
import { IntentMarker } from '../../proposed/IntentNote';
import { bestHere, pips, plotTitle, RAW, suits, suitsLine } from '../audit/dev/fixture';
import { guideOf, plotName } from './guide';
import { useArcade } from './loop';
import { NOTE } from './notes';
import { paceOf, reachOf, tileAt, type Colonist, type Tunables, type World } from './sim';
import { secondsLeft } from './views';

/**
 * The addendum (PM ruling 29 Oct): five of the development audit's approved changes, drawn in the arcade's own
 * language: the button and its second line, the ring, the side room and the banner box. No menus, no tap-to-walk.
 */

// Every outfit in words, the Green belt too (it is not a good).
const GOOD = { ...(GOOD_NAME as Record<string, string>), greenBelt: 'Green belt' } as Record<string, string>;
const dots = (n: number) => '●'.repeat(n) + '○'.repeat(4 - n);

// --- V-6 · your pace, and why ---------------------------------------------------------------------

/** "Your pace 47%: you ate 1 of the 3 Food you need", and what to do about it next month. */
export function paceWords(world: World, me: Colonist, tun: Tunables): { pct: number; line: string; short: string; next: string | null; slow: boolean } {
  const s = tun.seats[me.id] ?? { food: 1, need: 1, sick: false, money: 0 };
  const pct = Math.round(paceOf(me, tun).condition * 100);
  const hungry = s.food < s.need;
  const why = hungry ? `you ate ${s.food} of the ${s.need} Food you need` : s.sick ? 'you are sick' : 'fed and well';
  const sick = hungry && s.sick ? ', and you are sick' : '';
  // What makes Food for you already: a Food MULE on a plot of yours.
  const foodMule = world.tiles.find((t) => t.owner === me.id && t.outfit === 'food');
  const next = hungry ? (foodMule ? `Next month: your Food MULE on ${plotName(foodMule)} should feed you` : `Next month: buy ${s.need} Food at the auction, or put a Food MULE on a plot`) : null;
  return { pct, line: `Your pace ${pct}%: ${why}${sick}`, short: hungry ? `Pace ${pct}%: ate ${s.food} of ${s.need} Food` : s.sick ? `Pace ${pct}%: sick` : `Pace ${pct}%`, next, slow: pct < 100 };
}

/** In the side room: the line always, the next month with a tap (a phone has no hover). */
export function PaceLine({ world, me, tun, short = false }: { world: World; me: Colonist; tun: Tunables; short?: boolean }) {
  const [open, setOpen] = useState(false);
  const p = paceWords(world, me, tun);
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setOpen((o) => !o)}
      className={cx('relative block min-h-[18px] w-full pr-4 text-left font-display font-semibold leading-tight', short ? 'text-[11px]' : 'text-xs', p.slow ? 'text-warn' : 'text-ok')}
      data-testid="pace-line"
      data-pct={p.pct}
      aria-expanded={!!p.next && open}
    >
      {short ? p.short : p.line}
      {p.next && <span className="ml-1 font-mono text-[10px] text-ink-3">{open ? '▴' : '▾'}</span>}
      {p.next && open && (
        <span className="mt-0.5 block font-sans text-[11px] font-normal text-ink-2" data-testid="pace-next">
          {p.next}
        </span>
      )}
      <IntentMarker note={NOTE.A14} at="tr-in" />
    </button>
  );
}

// --- V-3 · analyse before you install, in words ----------------------------------------------------

/**
 * The card for the plot you stand on, over the map on the half away from it: every good in words and dots once it is
 * analysed, what is best here, and a mismatch with the MULE you lead (or the one standing on it). Before: what its land
 * is often good for, and that ANALYSE (the line above the button) shows what is underground.
 */
export function PlotCard({ world, me, tun, at }: { world: World; me: Colonist; tun: Tunables; at: CSSProperties }) {
  if (me.space !== 'map') return null;
  const t = tileAt(world, me.x, me.y);
  if (!t || t.owner !== me.id) return null;
  const r = reachOf(world, me, tun);
  const lead = me.mule?.good ?? null;
  const best = t.ground ? bestHere(t.ground) : null;
  const left = me.analysing ? Math.max(0, me.analysing.until - world.t) / 1000 : 0;
  const filter = r.alt?.kind === 'filter' ? r.alt : null;
  return (
    <div className="pointer-events-none absolute z-20 flex flex-col gap-0.5 overflow-hidden rounded-panel border border-holo-line bg-panel/92 px-2 py-1.5 text-xs shadow-map backdrop-blur-[2px]" style={at} data-testid="plot-card" data-analysed={!!t.ground || undefined}>
      <span className="font-display text-sm font-semibold leading-tight">
        {plotTitle(t)} · <span className={t.ground ? 'text-ok' : 'text-ink-3'}>{t.ground ? 'analysed' : me.analysing ? 'analysing…' : 'not analysed'}</span>
      </span>
      {me.analysing ? (
        <span className="flex items-center gap-2" data-testid="plot-analysing">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
            <span className="block h-full bg-holo" style={{ width: `${(1 - left / tun.analyseSeconds) * 100}%` }} />
          </span>
          <span className="font-mono">{Math.ceil(left)} s</span>
        </span>
      ) : t.ground ? (
        <>
          <span className="grid grid-cols-3 gap-x-3 font-mono text-[11px] leading-[15px]" data-testid="plot-readout">
            {RAW.map((g) => (
              <span key={g} className={cx('flex justify-between gap-1', g === best && 'font-bold text-holo')}>
                <span className="font-sans">{GOOD[g]}</span>
                <span>{dots(pips(g, t.ground![g]))}</span>
              </span>
            ))}
          </span>
          {/* A mismatch names the best good itself; otherwise the best gets its own line. */}
          {!(lead && lead !== best) && !(!lead && t.outfit && t.outfit !== best) && (
            <span className="font-semibold" data-testid="plot-best">
              Best here: {GOOD[best!]}
            </span>
          )}
          {lead && lead !== best && (
            <span className="font-semibold text-alert" data-testid="plot-mismatch">
              Your MULE makes {GOOD[lead]}; this plot is best for {GOOD[best!]}
            </span>
          )}
          {!lead && t.outfit && t.outfit !== best && (
            <span className="font-semibold text-warn" data-testid="plot-mismatch">
              Its {GOOD[t.outfit]} MULE: this plot is best for {GOOD[best!]}
            </span>
          )}
        </>
      ) : (
        <span className="text-ink-2" data-testid="plot-suits">
          {suitsLine(t)[0]!.toUpperCase() + suitsLine(t).slice(1)}, from its land. ANALYSE · {tun.analyseSeconds} s shows what is underground.
        </span>
      )}
      {r.kind === 'take' && (
        <span className="relative text-[10px] leading-tight text-ink-2" data-testid="plot-take">
          Taken off, its plot makes nothing till a MULE is in again.
          <IntentMarker note={NOTE.A16} at="tr" />
        </span>
      )}
      {filter?.why && (
        <span className="text-[10px] leading-tight text-ink-2" data-testid="plot-filter">
          Filter: {filter.why}.
        </span>
      )}
      <IntentMarker note={NOTE.A12} at="tr-in" />
    </div>
  );
}

// --- V-2 · your plots, and what each suits, while you choose ---------------------------------------

/** The side room, in the store while you choose: each plot of yours, what it suits, and what stands on it. */
export function PlotsLegend({ world, me, short = false }: { world: World; me: Colonist; short?: boolean }) {
  if (me.space !== 'hall' || !me.mule || (me.mule.good && !me.mule.taken)) return null;
  const mine = world.tiles.filter((t) => t.owner === me.id);
  return (
    <div className="relative flex flex-col gap-1 rounded-control border border-holo-faint bg-panel/80 p-1 text-[10px] leading-tight" data-testid="my-plots-legend">
      <span className="label-caps text-[9px]!">Your plots</span>
      {mine.map((t) => (
        <span key={`${t.x},${t.y}`} className={cx(t.outfit ? 'text-ink-3' : 'text-ink')} data-testid={`legend-${t.x}-${t.y}`}>
          <b className="font-semibold">{plotTitle(t)}</b>
          {/* The small phone's narrow column: the suits in a word or two. */}
          {short ? `: ${t.ground ? `best ${GOOD[bestHere(t.ground)]}` : suits(t).length ? suits(t).map((g) => GOOD[g]).join(', ') : 'analyse it'}` : ` · ${suitsLine(t)}`}
          {t.outfit ? ` · ${short ? 'MULE' : `${GOOD[t.outfit]} MULE`}` : ''}
        </span>
      ))}
      <IntentMarker note={NOTE.A11} at="tr-in" />
    </div>
  );
}

// --- V-7 · the guide never sends you where you can't go -------------------------------------------

/** What to do instead, in words, in the banner's box when no banner shows. */
export function GuideNote({ world, me, tun, faded }: { world: World; me: Colonist; tun: Tunables; faded: boolean }) {
  const g = guideOf(world, me, tun);
  if (!g?.note) return null;
  return (
    <span className={cx('pointer-events-none relative max-w-full rounded-chip border-2 border-warn bg-panel/95 px-2 py-1 text-center font-display text-sm font-bold leading-tight text-warn shadow-chip transition-opacity duration-200', faded && 'opacity-25')} data-testid="guide-note">
      {g.note}
      <IntentMarker note={NOTE.A15} at="tl" />
    </span>
  );
}

// --- The second choice, on the line above the button ---------------------------------------------

/**
 * V-3's ANALYSE beside INSTALL, V-5's FIT FILTER beside TAKE MULE: a second, smaller button above the one button, only
 * while there is a second choice. Least fiddly of the three ways (a hold, the stick pushed down, a second line): a hold
 * hides the choice and costs time on a clock that is everyone's; the stick already walks; a line you can read says what
 * it does, like the button. A on a keyboard.
 */
export function AltLine({ world, me, tun, small = false, className }: { world: World; me: Colonist; tun: Tunables; small?: boolean; className?: string }) {
  const arcade = useArcade();
  const alt = reachOf(world, me, tun).alt;
  if (!alt) return null;
  return (
    <button
      type="button"
      disabled={!alt.enabled}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.altKey && alt.enabled) arcade.pressAlt();
      }}
      className={cx('flex h-full w-full flex-col items-center justify-center rounded-control border-2 px-1 leading-tight', alt.enabled ? 'border-holo bg-panel text-holo' : 'border-holo-faint bg-panel text-ink-3', className)}
      data-testid="alt-button"
      data-kind={alt.kind}
      data-enabled={alt.enabled}
      aria-label={`${alt.verb}${alt.detail ? ` · ${alt.detail}` : ''}`}
    >
      <span className={cx('font-display font-bold', small ? 'text-xs' : 'text-sm')} data-testid="alt-verb">
        {alt.verb}
      </span>
      {alt.detail && (
        <span className="font-mono text-[10px] font-semibold opacity-90" data-testid="alt-detail">
          {alt.detail}
        </span>
      )}
      <IntentMarker note={alt.kind === 'filter' ? NOTE.A13 : NOTE.A12} at="tl" />
    </button>
  );
}

/** The clock in a narrow status: seconds left and a thin bar, everyone's. */
export function CompactClock({ world, tun }: { world: World; tun: Tunables }) {
  const s = secondsLeft(world, tun);
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="compact-clock">
      <span className="h-1.5 w-8 shrink overflow-hidden rounded-full bg-raised">
        <span className={cx('block h-full', s < 10 ? 'bg-alert' : 'bg-holo')} style={{ width: `${(s / tun.devSeconds) * 100}%` }} />
      </span>
      <span data-num className={cx('font-mono text-xs font-bold', s < 10 ? 'text-alert' : 'text-holo')}>
        {Math.ceil(s)}s
      </span>
    </span>
  );
}
