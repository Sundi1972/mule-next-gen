import type { RawGood } from '@mule/engine';
import { Creature, cx, GoodIcon, MuleIcon, sickReason, SLOT_COLOR, TERRAIN_NAME } from '@mule/ui';
import { useState, type CSSProperties } from 'react';
import { useTableChat } from '../../chat/store';
import { groundPips, plotName, toSlot } from '../../game/derive';
import { SWAP_NOTE } from './guide';
import { bestHere, OUTFIT_WORD, RAW, plotTitle, suits, suitsLine } from './plots';
import { assaySeconds, type ArcadeSeat } from './seat';

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

/** The laptop has no guide, so its rail gives the swapped MULE's warning (AM-35) in the phone's guide-note words. */
export function SwapWarning({ seat }: { seat: ArcadeSeat }) {
  if (!seat.me.leadsSwapped) return null;
  return (
    <span className="rounded-chip border-2 border-warn bg-panel/95 px-2 py-1 font-display text-sm font-bold leading-tight text-warn shadow-chip" data-testid="swap-warning">
      {SWAP_NOTE}
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

/** The roll call's sick tag, small: a white cross on the medicine colour, so it reads without the colour too. */
function SickTag({ size }: { size: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-g-medicine font-bold leading-none text-void" style={{ width: size, height: size, fontSize: size - 2 }} aria-hidden>
      ✚
    </span>
  );
}

/**
 * Sick this turn (ws6-ux AM-21, the PM's ruling A): the line names the sickness and its cause in the roll call's
 * medicine colour, then the pace this turn (and the Food she ate, if she is hungry too); a tap says it struck as the
 * turn began and what prevents it. At 667 the bar says it short.
 */
function SickLine({ seat, short }: { seat: ArcadeSeat; short: boolean }) {
  const [open, setOpen] = useState(false);
  const { me, self } = seat;
  const pct = Math.round((self.condition?.conditionPace ?? 1) * 100);
  const food = Math.min(me.stock.food, me.needs.food);
  const hungry = food < me.needs.food;
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setOpen((o) => !o)}
      className={cx('relative flex w-full flex-col pr-4 text-left font-display font-semibold leading-tight', short ? 'text-[11px]' : 'text-xs')}
      data-testid="pace-line"
      data-pct={pct}
      data-sick="true"
      aria-expanded={open}
    >
      {short ? (
        <span className="flex items-center gap-1 text-g-medicine">
          <SickTag size={11} /> {hungry ? `Sick · ate ${food} of ${me.needs.food} · ${pct}%` : `Sick · ${pct}% pace`}
        </span>
      ) : (
        <>
          <span className="flex items-start gap-1 text-g-medicine" data-testid="sick-cause">
            <SickTag size={12} /> {sickReason(self.condition?.sickBecause)}
          </span>
          <span className="text-alert">{hungry ? `${pct}% pace this turn · you ate ${food} of ${me.needs.food} Food` : `${pct}% pace this turn`}</span>
        </>
      )}
      <span className="absolute right-0 top-0 font-mono text-[10px] text-ink-3">{open ? '▴' : '▾'}</span>
      {open && (
        <span className="mt-0.5 block font-sans text-[11px] font-normal text-ink-2" data-testid="sick-why">
          It struck as your turn began, with no Medicine to cure it. Have a Medicine in hand when a turn begins and sickness can’t slow you (it’s used up).
        </span>
      )}
    </button>
  );
}

/** In the side room: the line always, the next month with a tap (a phone has no hover). Sick, it says so and why. */
export function PaceLine({ seat, short = false }: { seat: ArcadeSeat; short?: boolean }) {
  const [open, setOpen] = useState(false);
  const p = paceWords(seat);
  if (seat.self.condition?.sick) return <SickLine seat={seat} short={short} />;
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
  const total = assaySeconds(seat.view, seat.me);
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

/** The most rows the hall's side room has for your plots above the button at 844. */
const LEGEND_ROWS = 5;

/** The side room, in the store while you choose: each plot of yours, what it suits, and what stands on it. */
export function PlotsLegend({ seat, short = false }: { seat: ArcadeSeat; short?: boolean }) {
  if (seat.mine?.space !== 'hall' || seat.me.carriedMule !== 'empty') return null;
  // Free plots first: they are what an empty MULE is outfitted for. Past five the side room would reach the button.
  const all = seat.view.tiles.filter((t) => t.owner === seat.me.id).sort((a, b) => Number(!!a.outfit) - Number(!!b.outfit));
  const mine = all.length > LEGEND_ROWS ? all.slice(0, LEGEND_ROWS - 1) : all;
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
      {all.length > mine.length && (
        <span className="text-ink-3" data-testid="legend-more">
          +{all.length - mine.length} more
        </span>
      )}
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
 * The table chat's newest lines, newest first, from the same chat state as the shell's ticker. Each line is cut to one
 * row, or with `wrap` (a narrow column) runs on as one sentence, speaker and words together, over at most three rows.
 * A line never gives up its rows: a holder short of room cuts the oldest first, at its foot.
 */
export function ChatTicker({ seat, keep, wrap = false, wide = false }: { seat: ArcadeSeat; keep: number; wrap?: boolean; wide?: boolean }) {
  const { lines } = useTableChat();
  const players = new Map(seat.view.players.map((p) => [p.id, p]));
  const said = lines.filter((l) => players.has(l.from)).slice(-keep).reverse();
  return (
    <ul className="flex min-w-0 flex-col gap-0.5 overflow-hidden" data-testid="chat-ticker" aria-label="Table chat" aria-live="polite">
      {said.map((l, i) => {
        const p = players.get(l.from)!;
        return (
          <li
            key={l.id}
            className={cx('min-w-0 shrink-0', wrap ? 'line-clamp-3 leading-tight' : 'flex items-center gap-1.5 truncate', wide ? 'text-sm' : 'text-[11px]', i === 0 ? 'animate-[show-card-in_0.25s_ease-out] text-ink' : 'text-ink-3')}
            data-testid={`chat-line-${l.id}`}
          >
            <span className={wrap ? 'mr-1 inline-block align-[-3px]' : 'contents'}>
              <Creature species={p.species} color={SLOT_COLOR[toSlot(p.slot)]} size={14} />
            </span>
            <strong className={wrap ? '' : 'shrink-0'}>
              {p.name}
              {l.to ? ' 🔒' : ''}:
            </strong>
            <span className={wrap ? '' : 'truncate'}>
              {wrap ? ' ' : ''}
              {l.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
