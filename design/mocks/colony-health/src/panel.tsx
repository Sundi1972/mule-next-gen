import type { MuleView } from '@mule/protocol';
import { airBandStyle, cx, PlayerMark, GoodIcon } from '@mule/ui';
import type { ReactNode } from 'react';
import type { Density } from '../../../../apps/web/src/components/MonthEnd';
import { colonyVerdict, fmt, toSlot } from '../../../../apps/web/src/game/derive';
import { colonyReport } from '../../../../apps/web/src/game/month-end';
import { healthOf, type HealthView } from './fixture';
import { atLimit, healthBand, sickInTen } from './gauges';

/**
 * COPY: apps/web/src/components/MonthEnd.tsx:270-388 (`Block`, `HUNGRY_LINES_COMPACT`, `ColonyPanel`) at trunk 0ece94ba,
 * verbatim but for the lines marked EXTEND: on the phone with no TV the panel gains a Health block after Hunger.
 * src/borrowed/month-end.ts puts this copy in the real one's place for the real phone `Results` (see vite.config.ts).
 * Graft target: MonthEnd.tsx `ColonyPanel` (WS4's file, per SEAMS apps/web/** ).
 */

function Block({ label, children, testid, tv, className }: { label: string; children: ReactNode; testid: string; tv: boolean; className?: string }) {
  return (
    <div className={cx('relative flex min-w-0 flex-col', tv ? 'gap-1' : 'gap-0', className)} data-testid={testid}>
      <span className={cx('label-caps', tv ? 'text-sm!' : 'text-[10px]!')}>{label}</span>
      {children}
    </div>
  );
}

/** The phone with no TV names this many of the hungry; the rest are counted in one line. */
const HUNGRY_LINES_COMPACT = 2;

/**
 * How the colony is doing, apart from the players: the air against last month, the colony fund's balance and who went
 * hungry. At game over (`verdict`) it heads with the colony's verdict; `row` lays it out in one band across the TV.
 */
export function ColonyPanel({ view, density, layout = 'stack', verdict = false }: { view: MuleView; density: Exclude<Density, 'phone'>; layout?: 'stack' | 'row'; verdict?: boolean }) {
  const r = colonyReport(view);
  const tv = density === 'tv';
  const row = tv && layout === 'row';
  const v = colonyVerdict(view.air);
  const now = airBandStyle(r.air.level, r.air.band);
  const then = r.air.last === null ? null : airBandStyle(r.air.last, r.air.lastBand ?? undefined);
  const big = tv ? 'text-3xl' : 'text-base';
  const line = tv ? 'text-lg leading-snug' : 'text-[11px] leading-tight';
  const trend = r.air.trend;
  const shownHungry = tv ? r.hungry : r.hungry.slice(0, HUNGRY_LINES_COMPACT);
  const moreHungry = r.hungry.length - shownHungry.length;
  // EXTEND: the colony's health. SEAM: view.colony.health once WS5/WS7 add it.
  const health = healthOf(view.colony);
  return (
    <section className={cx('relative flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-3 p-5' : 'gap-1 px-2.5 py-1.5')} aria-label="How the colony is doing" data-testid="colony-panel">
      <header className={cx('flex flex-wrap items-baseline', tv ? 'gap-x-4' : 'gap-x-2')} {...(verdict ? { 'data-testid': 'tv-verdict' } : {})}>
        <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>{verdict ? 'How the colony did' : 'How the colony is doing'}</h2>
        {verdict && (
          <>
            <span className={cx('font-display font-semibold', v.failed ? 'text-alert-ink' : 'text-ok', tv ? 'text-2xl' : 'text-xs')} data-testid="verdict-title">
              {v.title}
            </span>
            <span className={cx('text-ink-2', tv ? 'text-lg' : 'text-[11px]')} data-testid="verdict-line">
              {v.line}
            </span>
          </>
        )}
      </header>
      <div className={cx('grid', row ? 'grid-cols-3 gap-x-6' : tv ? 'grid-cols-2 gap-x-6 gap-y-3' : 'grid-cols-3 gap-2')}>
        <Block label="Air" testid="colony-air" tv={tv}>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span data-num className={cx('font-mono font-bold', big)} data-testid="air-level">
              {r.air.level}
            </span>
            <span className={cx('font-display font-semibold', now.tone, tv ? 'text-2xl' : 'text-xs')} data-testid="air-band">
              {now.label}
            </span>
          </span>
          <span className={cx(line, trend === 'better' ? 'text-ok' : trend === 'worse' ? 'text-alert' : 'text-ink-3')} data-testid="air-trend">
            {trend === null || then === null
              ? 'The first month: nothing to compare yet'
              : `${trend === 'better' ? '↑ better than' : trend === 'worse' ? '↓ worse than' : '± same as'} month ${view.month - 1} (${r.air.last}${r.air.lastBand !== r.air.band ? ` · ${then.label}` : ''})`}
          </span>
        </Block>
        <Block label="Colony fund" testid="colony-fund" tv={tv}>
          <span data-num className={cx('font-mono font-bold', big)} data-testid="fund-balance">
            {fmt(r.fund.balance)} cr
          </span>
        </Block>
        <Block label="Hunger" testid="colony-hungry" tv={tv} {...(tv && !row ? { className: 'col-span-2 border-t border-holo-faint pt-3' } : {})}>
          <span className={cx('flex', tv && !row ? 'flex-wrap items-baseline gap-x-5 gap-y-1' : 'flex-col')}>
            {r.hungry.length === 0 ? (
              <span className={cx('font-display font-semibold text-ok', tv ? 'text-2xl' : 'text-xs')} data-testid="nobody-hungry">
                ✓ Nobody went hungry
              </span>
            ) : (
              shownHungry.map((h) => {
                const p = view.players.find((x) => x.id === h.id)!;
                const full = `${p.name} went hungry: ate ${h.ate} of ${h.need} Food`;
                if (!tv) {
                  // On a phone: one short line, the full sentence from 1100 px. Only the name gives way; the numbers never do.
                  return (
                    <span key={h.id} className="flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-tight text-alert" data-testid={`hungry-${h.id}`}>
                      <PlayerMark slot={toSlot(p.slot)} species={p.species} size={12} label={p.name} />
                      <span className="flex min-w-0 items-center @min-[1100px]/shell:hidden" title={full} data-testid={`hungry-short-${h.id}`}>
                        <span className="min-w-0 truncate" data-testid={`hungry-name-${h.id}`}>
                          {p.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap" data-testid={`hungry-ate-${h.id}`}>
                          : ate {h.ate} of {h.need} <GoodIcon good="food" size={11} />
                        </span>
                      </span>
                      <span className="hidden @min-[1100px]/shell:inline" data-testid={`hungry-full-${h.id}`}>
                        {full}
                      </span>
                    </span>
                  );
                }
                return (
                  <span key={h.id} className="flex items-start gap-2 text-2xl font-semibold leading-snug text-alert" data-testid={`hungry-${h.id}`}>
                    <span className="pt-1">
                      <PlayerMark slot={toSlot(p.slot)} species={p.species} size={26} label={p.name} />
                    </span>
                    <span>
                      {p.name} went hungry: ate {h.ate} of {h.need} <GoodIcon good="food" size={20} className="inline align-[-0.1em]" /> Food
                    </span>
                  </span>
                );
              })
            )}
            {moreHungry > 0 && (
              <span className="text-[11px] font-semibold leading-tight text-alert" data-testid="hungry-more">
                +{moreHungry} more went hungry
              </span>
            )}
            <span className={cx(line, r.colonistsFed === false ? 'text-alert' : 'text-ink-2')} data-testid="colonists">
              {r.colonistsFed ? `The store fed the colony’s ${fmt(r.colonists)} colonists` : `The colony’s ${fmt(r.colonists)} colonists${r.colonistsFed === false ? ' went short' : ''}`}
            </span>
          </span>
        </Block>
        {/* EXTEND: Health, after Hunger, on the phone with no TV only ('compact'). The TV month end and a phone beside a
            TV keep the panel as it is: the TV header's gauges carry health there. */}
        {!tv && health && <HealthBlock health={health} />}
      </div>
    </section>
  );
}

// --- The Health block (NEW) ---------------------------------------------------------------------------

/**
 * The second line: the cause, then what it does. WS5's effects: sickness raises the colonists' Medicine need (up to
 * 40 % more), takes up to 4 points off the mood's aim and slows growth by up to 2 % a month. The line names the first
 * two, which the table can act on; growth is left to the rulebook.
 */
export function healthWhy(h: HealthView): string {
  const short = h.shortMonths === 0 ? null : h.shortMonths === 1 ? 'Medicine ran short' : `Medicine short ${h.shortMonths} months`;
  if (atLimit(h)) return [`${sickInTen(h)}, the most there can be`, short].filter(Boolean).join(' · ');
  if (h.well >= 90) return `${h.sick} in 100 sick: about as low as it goes`;
  return [`${h.sick} in 100 sick`, short, 'they need more Medicine and the mood’s aim drops'].filter(Boolean).join(' · ');
}

/**
 * Health on the phone with no TV, in the panel's compact sizes: "HEALTH 78% well · Sick spell", then why. The label sits
 * on the first line (the other blocks put it above) to keep the block two lines tall on a 375 px phone.
 */
function HealthBlock({ health }: { health: HealthView }) {
  const b = healthBand(health.well);
  return (
    <div className="relative col-span-3 flex min-w-0 flex-col border-t border-holo-faint pt-1" data-testid="colony-health">
      <span className="flex flex-wrap items-baseline gap-x-1.5" data-testid="health-line">
        <span className="label-caps mr-0.5 text-[10px]!">Health</span>
        <span data-num className="font-mono text-base font-bold leading-tight" data-testid="health-value">
          {health.well}%
        </span>
        <span className="text-xs text-ink-2">well</span>
        <span className="text-xs text-ink-3" aria-hidden>
          ·
        </span>
        <span className={cx('font-display text-xs font-semibold', b.tone)} data-testid="health-band">
          {b.label}
        </span>
      </span>
      <span className="text-[11px] leading-tight text-ink-2" data-testid="health-why">
        {healthWhy(health)}
      </span>
    </div>
  );
}
