import { DEVELOPMENT, SPECIES_PERK, type RawGood } from '@mule/engine';
import { cx, GoodIcon, MuleIcon, TERRAIN_NAME } from '@mule/ui';
import { useState, type CSSProperties } from 'react';
import { waitingNow } from '../Develop';
import type { Now } from '../Shell';
import { groundPips, plotName } from '../../game/derive';
import { bestHere, OUTFIT_WORD, RAW, plotTitle, suits, suitsLine } from './plots';
import type { ArcadeSeat } from './seat';

/**
 * The arcade's status parts, grafted from the mock's views.tsx and AddendumLayer.tsx (d30ae057) onto the view: the
 * land underfoot, your MULE, your money, the turn's end, and the addendum's V-2, V-3, V-6 and V-7 in the arcade's own
 * language. Every number is the view's or the engine's config.
 */

const dots = (n: number) => '●'.repeat(n) + '○'.repeat(4 - n);

/** The land underfoot and what it does to your speed: terrain you can feel, said in words. */
export function GroundChip({ seat, className }: { seat: ArcadeSeat; className?: string }) {
  const s = seat.underfoot;
  const k = s.ground * s.lead * s.bitten;
  const share = Math.round(k * 100);
  const name = `${s.tile ? TERRAIN_NAME[s.tile.terrain] : 'Store floor'}${s.bitten < 1 ? ', bitten' : ''}`;
  const slow = k < 0.99;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 rounded-chip border px-2 py-0.5 text-sm', slow ? 'border-warn/60 text-warn' : 'border-holo-faint text-ink-2', className)} data-testid="ground-chip" data-ground={s.ground} data-bitten={s.bitten < 1 || undefined}>
      <span className="truncate font-semibold">{name}</span>
      <span data-num className="font-mono text-xs">
        {slow ? `${share}% speed` : 'full speed'}
      </span>
    </span>
  );
}

/** Your MULE on its lead: none, empty, or fitted for a good. */
export function LeadChip({ seat, className }: { seat: ArcadeSeat; className?: string }) {
  const m = seat.me.carriedMule;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 rounded-chip border border-holo-faint px-2 py-0.5 text-sm text-ink-2', className)} data-testid="lead-chip" data-lead={m ?? 'none'}>
      <MuleIcon size={16} className={m ? 'text-holo' : 'text-ink-3'} />
      <span className="truncate">{!m ? 'No MULE' : m !== 'empty' ? 'MULE on lead' : 'Empty MULE'}</span>
      {m && m !== 'empty' && m !== 'greenBelt' && <GoodIcon good={m} size={14} />}
    </span>
  );
}

export function Money({ seat, className }: { seat: ArcadeSeat; className?: string }) {
  return (
    <span className={cx('flex items-center gap-2', className)}>
      <span data-num className="font-mono font-bold text-ink" data-testid="money">
        {seat.self.money} cr
      </span>
    </span>
  );
}

/** The turn is over: for you (the pub) or for everyone (the clock). */
export function OverCard({ seat, installs, className }: { seat: ArcadeSeat; installs: number; className?: string }) {
  const done = seat.self.doneDeveloping;
  if (!seat.over && !done) return null;
  return (
    <div className={cx('pointer-events-auto absolute inset-x-3 top-3 z-20 flex flex-col gap-2 rounded-panel border border-holo bg-panel/95 p-3 shadow-glow', className)} data-testid="over-card">
      <span className="font-display text-lg font-semibold">{seat.over ? 'Development over' : 'In the pub: your turn is over'}</span>
      <span className="text-sm text-ink-2">
        {installs > 0 ? `You installed ${installs} MULE${installs > 1 ? 's' : ''}.` : 'No MULE went in this turn.'} {seat.over ? '' : `The others still walk (${Math.ceil(seat.seconds)} s).`}
      </span>
    </div>
  );
}

// --- V-6 · your pace, and why ---------------------------------------------------------------------

/** "Your pace 47%: you ate 1 of the 3 Food you need", and what to do about it next month. */
export function paceWords(seat: ArcadeSeat): { pct: number; line: string; short: string; next: string | null; slow: boolean } {
  const { me, self, view } = seat;
  const food = Math.min(me.stock.food, me.needs.food);
  const need = me.needs.food;
  const sick = !!self.condition?.sick;
  const pct = Math.round((self.condition?.conditionPace ?? 1) * 100);
  const hungry = food < need;
  const why = hungry ? `you ate ${food} of the ${need} Food you need` : sick ? 'you are sick' : 'fed and well';
  const andSick = hungry && sick ? ', and you are sick' : '';
  // What makes Food for you already: a Food MULE on a plot of yours.
  const foodMule = view.tiles.find((t) => t.owner === me.id && t.outfit === 'food');
  const next = hungry ? (foodMule ? `Next month: your Food MULE on ${plotName(foodMule.x, foodMule.y)} should feed you` : `Next month: buy ${need} Food at the auction, or put a Food MULE on a plot`) : null;
  return { pct, line: `Your pace ${pct}%: ${why}${andSick}`, short: hungry ? `Pace ${pct}%: ate ${food} of ${need} Food` : sick ? `Pace ${pct}%: sick` : `Pace ${pct}%`, next, slow: pct < 100 };
}

/** In the side room: the line always, the next month with a tap (a phone has no hover). */
export function PaceLine({ seat, short = false }: { seat: ArcadeSeat; short?: boolean }) {
  const [open, setOpen] = useState(false);
  const p = paceWords(seat);
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
    </button>
  );
}

// --- V-3 · analyse before you install, in words ----------------------------------------------------

/** Seconds a geo analysis takes this player: the engine's analysisSeconds, from its config. */
const analysisSeconds = (seat: ArcadeSeat) => DEVELOPMENT.analysisSeconds * (seat.self.species === 'mollox' ? SPECIES_PERK.molloxAnalysis : 1);

/**
 * The card for the plot of yours you stand on, over the map away from it: every good in words and dots once it is
 * analysed, what is best here, and a mismatch with the MULE you lead (or the one standing on it). Before: what its land
 * is often good for, and that ANALYSE shows what is underground.
 */
export function PlotCard({ seat, now, at }: { seat: ArcadeSeat; now: number; at: CSSProperties }) {
  const t = seat.underfoot.tile;
  if (seat.mine?.space !== 'map' || !t || t.owner !== seat.me.id) return null;
  const lead = seat.me.carriedMule && seat.me.carriedMule !== 'empty' ? seat.me.carriedMule : null;
  const best = t.ground ? bestHere(t.ground) : null;
  const total = analysisSeconds(seat);
  const left = seat.assayUntil !== null ? Math.max(0, seat.assayUntil - now) / 1000 : 0;
  return (
    <div className="pointer-events-none absolute z-20 flex flex-col gap-0.5 overflow-hidden rounded-panel border border-holo-line bg-panel/92 px-2 py-1.5 text-xs shadow-map backdrop-blur-[2px]" style={at} data-testid="plot-card" data-analysed={!!t.ground || undefined}>
      <span className="font-display text-sm font-semibold leading-tight">
        {plotTitle(t)} · <span className={t.ground ? 'text-ok' : 'text-ink-3'}>{t.ground ? 'analysed' : seat.assayUntil !== null ? 'analysing…' : 'not analysed'}</span>
      </span>
      {seat.assayUntil !== null ? (
        <span className="flex items-center gap-2" data-testid="plot-analysing">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
            <span className="block h-full bg-holo" style={{ width: `${(1 - left / total) * 100}%` }} />
          </span>
          <span className="font-mono">{Math.ceil(left)} s</span>
        </span>
      ) : t.ground ? (
        <>
          <span className="grid grid-cols-3 gap-x-3 font-mono text-[11px] leading-[15px]" data-testid="plot-readout">
            {RAW.map((g: RawGood) => (
              <span key={g} className={cx('flex justify-between gap-1', g === best && 'font-bold text-holo')}>
                <span className="font-sans">{OUTFIT_WORD[g]}</span>
                <span>{dots(groundPips(g, t.ground![g]))}</span>
              </span>
            ))}
          </span>
          {/* A mismatch names the best good itself; otherwise the best gets its own line. */}
          {!(lead && lead !== best) && !(!lead && t.outfit && t.outfit !== best) && (
            <span className="font-semibold" data-testid="plot-best">
              Best here: {OUTFIT_WORD[best!]}
            </span>
          )}
          {lead && lead !== best && (
            <span className="font-semibold text-alert" data-testid="plot-mismatch">
              Your MULE makes {OUTFIT_WORD[lead]}; this plot is best for {OUTFIT_WORD[best!]}
            </span>
          )}
          {!lead && t.outfit && t.outfit !== best && (
            <span className="font-semibold text-warn" data-testid="plot-mismatch">
              Its {OUTFIT_WORD[t.outfit]} MULE: this plot is best for {OUTFIT_WORD[best!]}
            </span>
          )}
        </>
      ) : (
        <span className="text-ink-2" data-testid="plot-suits">
          {suitsLine(t)[0]!.toUpperCase() + suitsLine(t).slice(1)}, from its land. ANALYSE · {total} s shows what is underground.
        </span>
      )}
    </div>
  );
}

// --- V-2 · your plots, and what each suits, while you choose ---------------------------------------

/** The side room, in the store while you choose: each plot of yours, what it suits, and what stands on it. */
export function PlotsLegend({ seat, short = false }: { seat: ArcadeSeat; short?: boolean }) {
  if (seat.mine?.space !== 'hall' || seat.me.carriedMule !== 'empty') return null;
  const mine = seat.view.tiles.filter((t) => t.owner === seat.me.id);
  return (
    <div className="relative flex flex-col gap-1 rounded-control border border-holo-faint bg-panel/80 p-1 text-[10px] leading-tight" data-testid="my-plots-legend">
      <span className="label-caps text-[10px]!">Your plots</span>
      {mine.map((t) => (
        <span key={`${t.x},${t.y}`} className={cx(t.outfit ? 'text-ink-3' : 'text-ink')} data-testid={`legend-${t.x}-${t.y}`}>
          <b className="font-semibold">{plotTitle(t)}</b>
          {/* The small phone's narrow column: the suits in a word or two. */}
          {short ? `: ${t.ground ? `best ${OUTFIT_WORD[bestHere(t.ground)]}` : suits(t).length ? suits(t).map((g) => OUTFIT_WORD[g]).join(', ') : 'analyse it'}` : ` · ${suitsLine(t)}`}
          {t.outfit ? ` · ${short ? 'MULE' : `${OUTFIT_WORD[t.outfit]} MULE`}` : ''}
        </span>
      ))}
    </div>
  );
}

// --- V-7 · the guide never sends you where you can't go -------------------------------------------

/** What to do instead, in words, in the banner's box. */
export function GuideNote({ seat, faded }: { seat: ArcadeSeat; faded: boolean }) {
  const note = seat.guide?.note;
  if (!note) return null;
  return (
    <span className={cx('pointer-events-none relative max-w-full rounded-chip border-2 border-warn bg-panel/95 px-2 py-1 text-center font-display text-sm font-bold leading-tight text-warn shadow-chip transition-opacity duration-200', faded && 'opacity-25')} data-testid="guide-note">
      {note}
    </span>
  );
}

/** The clock in a narrow status: seconds left and a thin bar, everyone's. */
export function CompactClock({ seat }: { seat: ArcadeSeat }) {
  const s = seat.seconds;
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="compact-clock">
      <span className="h-1.5 w-8 shrink overflow-hidden rounded-full bg-raised">
        <span className={cx('block h-full', s < 10 ? 'bg-alert' : 'bg-holo')} style={{ width: `${(s / seat.total) * 100}%` }} />
      </span>
      <span data-num className={cx('font-mono text-xs font-bold', s < 10 ? 'text-alert' : 'text-holo')}>
        {Math.ceil(s)}s
      </span>
    </span>
  );
}

/** No frame for staleMs (RULE-10): your colonist stands, and the screen says so, in the app's connection bar. */
export function Reconnecting({ seat }: { seat: ArcadeSeat }) {
  if (seat.status !== 'reconnecting') return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 bg-warn px-4 py-1.5 text-center font-mono text-xs font-bold text-void" data-testid="reconnecting">
      RECONNECTING…
    </div>
  );
}


/**
 * Month 1's wait (A-1, spec AM-20), in today's Develop's own words (waitingNow): before your first MULE, no rush; once it
 * is in, whose are still to come. Null while the clock runs, and when the wait has nothing of its own to say.
 */
export function waitWords(seat: ArcadeSeat): Now | null {
  const waitsFor = seat.view.clockWaitsFor;
  if (!waitsFor) return null;
  const { me, view } = seat;
  const youWait = !waitsFor.includes(me.id);
  // Row 1, buying your first MULE, is the step waitingNow rewords; any other step it leaves as it is.
  const toCorral = seat.guide?.space === 'map' ? seat.guide.spots[0]?.label === 'STORE · CORRAL' : seat.guide?.rooms.includes('corral');
  const step: Now = toCorral ? { step: 1, of: 3, title: '' } : { title: '' };
  const said = waitingNow(step, me.carriedMule, me.installedThisTurn || youWait, !view.tiles.some((t) => t.owner === me.id), view.storeMules, waitsFor, me.id, view.players);
  return said === step ? null : said;
}

/** The wait's words in the side room, or its title alone in the small phone's bar. */
export function WaitWords({ seat, short = false }: { seat: ArcadeSeat; short?: boolean }) {
  const now = waitWords(seat);
  if (!now) return null;
  return (
    <span className="flex min-w-0 flex-col gap-0.5" data-testid="wait-now">
      <span className={cx('font-display font-semibold leading-tight text-holo', short ? 'truncate text-[11px]' : 'text-xs')} data-testid="wait-title">
        {now.title}
      </span>
      {!short && now.detail && (
        <span className="text-[10px] leading-tight text-ink-2" data-testid="wait-detail">
          {now.detail}
        </span>
      )}
    </span>
  );
}
