import { GOODS, type PrestigeId } from '@mule/engine';
import type { ColonyProjectView, ColonyView, MuleView, PlayerView } from '@mule/protocol';
import { airBandStyle, cx, GoodIcon, PlayerMark } from '@mule/ui';
import type { ReactNode } from 'react';
import { colonyVerdict, fmt, toSlot } from '../game/derive';
import { league, winnerWords } from '../game/month-end';
import { MOOD, moodOf, PERK, plaqueBoard, plaquesOf, scoreVerdict, scoreWords, STAGE, standingCount, type ColonyScore } from '../game/colony';

/** The colony's parts at the TV's size and the phone's: its four gauges, its build site, and its score at game over. */

export type Size = 'tv' | 'phone';

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

// --- The objects' glyphs ------------------------------------------------------------------------------

// Until WS5's packages/ui ObjectGlyph (ws5-c33 64bedde4) merges; then import it from @mule/ui.
const GLYPH: Record<PrestigeId, string> = {
  park: 'M12 3l-5 7h3l-4 6h12l-4-6h3zM12 16v5M5 21h14',
  hospital: 'M4 21V7l8-4 8 4v14M10 21v-5h4v5M12 8v6M9 11h6',
  stadium: 'M3 9c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4zM3 9c0 2 4 4 9 4s9-2 9-4M7 12v5M17 12v5',
  observatory: 'M4 21h16M6 21v-6a6 6 0 0 1 12 0v6M12 9V3M15 5l4-2M9 17h6',
  spaceport: 'M12 3c3 3 4 7 3 11H9C8 10 9 6 12 3zM9 14l-3 4h12l-3-4M12 18v3M4 21h16',
};

export function ObjectGlyph({ kind, size = 24, className }: { kind: PrestigeId; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={GLYPH[kind]} />
    </svg>
  );
}

function Mark({ player, size }: { player: PlayerView; size: number }) {
  return <PlayerMark slot={toSlot(player.slot)} species={player.species} size={size} label={player.name} />;
}

// --- The four gauges ----------------------------------------------------------------------------------

function Gauge({ label, value, band, tone, bar, fill, note, size, testid }: { label: string; value: string; band?: string; tone?: string; bar?: string; fill?: number; note?: ReactNode; size: Size; testid: string }) {
  const tv = size === 'tv';
  return (
    <div className={cx('flex min-w-0 flex-col rounded-control border border-holo-line bg-panel', tv ? 'gap-1 px-3 py-1.5' : 'gap-0.5 px-2 py-1')} data-testid={testid}>
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('label-caps', !tv && 'text-[10px]!')}>{label}</span>
        <span data-num className={cx('whitespace-nowrap font-mono font-bold', tv ? 'text-lg' : 'text-xs')}>
          {value}
        </span>
      </span>
      <span className={cx('relative overflow-hidden rounded-full', tv ? 'h-2' : 'h-1.5', fill === undefined ? 'bg-transparent' : 'bg-raised')}>
        {fill !== undefined && <span className={cx('absolute inset-y-0 left-0 rounded-full', bar)} style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />}
      </span>
      <span className={cx('flex items-baseline justify-between gap-2 whitespace-nowrap', tv ? 'text-xs' : 'text-[10px]')}>
        {band && <span className={cx('font-display font-semibold uppercase', tone)}>{band}</span>}
        {note && <span className="truncate text-ink-3">{note}</span>}
      </span>
    </div>
  );
}

/** Wealth, Environment, Prestige and Happiness. Environment is the air, so it keeps the air's bands. */
export function ColonyGauges({ colony, size, className }: { colony: ColonyView; size: Size; className?: string }) {
  const g = colony.gauges;
  const last = colony.lastGauges;
  const air = airBandStyle(g.environment);
  const tv = size === 'tv';
  const moodMove = last?.happiness == null || g.happiness === null ? null : g.happiness - last.happiness;
  return (
    <div className={cx('grid grid-cols-4', tv ? 'gap-2' : 'gap-1.5', className)} data-testid="colony-gauges">
      <Gauge size={size} testid="gauge-wealth" label="Wealth" value={`${fmt(g.wealth)} cr`} note={`fund ${fmt(colony.fund)} cr`} />
      <Gauge size={size} testid="gauge-environment" label="Environment" value={`${g.environment}`} band={air.label} tone={air.tone} bar={air.bar} fill={g.environment} />
      <Gauge size={size} testid="gauge-prestige" label="Prestige" value={`${g.prestige}`} note={`${standingCount(colony)} standing${last && g.prestige !== last.prestige ? ` · ${signed(g.prestige - last.prestige)}` : ''}`} />
      {g.happiness === null || g.band === null ? (
        <Gauge size={size} testid="gauge-happiness" label="Happiness" value="—" note="not yet" />
      ) : (
        <Gauge
          size={size}
          testid="gauge-happiness"
          label="Happiness"
          value={`${g.happiness}`}
          band={MOOD[g.band].label}
          tone={MOOD[g.band].tone}
          bar={MOOD[g.band].bar}
          fill={g.happiness}
          {...(moodMove !== null && tv ? { note: moodMove === 0 ? '± 0' : `${moodMove > 0 ? '↑' : '↓'} ${Math.abs(moodMove)} this month` } : {})}
        />
      )}
    </div>
  );
}

// --- The build site -----------------------------------------------------------------------------------

function GoodsNeed({ p, size }: { p: ColonyProjectView; size: Size }) {
  const tv = size === 'tv';
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-3' : 'gap-2')}>
      {GOODS.filter((g) => p.cost.goods[g]).map((g) => {
        const need = p.cost.goods[g]!;
        const have = p.funded.goods[g] ?? 0;
        return (
          <span key={g} className={cx('flex items-center gap-1 font-mono font-bold', tv ? 'text-base' : 'text-[11px]', have >= need ? 'text-ok' : 'text-ink')} data-testid={`need-${p.id}-${g}`}>
            <GoodIcon good={g} size={tv ? 18 : 12} />
            {have}/{need}
          </span>
        );
      })}
    </span>
  );
}

/** Where the project is, in the one line that matters for its stage. */
function StageLine({ p, size }: { p: ColonyProjectView; size: Size }) {
  const tv = size === 'tv';
  const line = tv ? 'text-base' : 'text-[11px] leading-tight';
  switch (p.stage) {
    case 'commissioned': {
      const share = p.cost.credits === 0 ? 100 : Math.round((p.funded.credits / p.cost.credits) * 100);
      return (
        <span className="flex flex-col gap-1">
          <span className={cx('flex items-baseline justify-between gap-3', line)}>
            <span data-num className="font-mono font-bold">
              {fmt(p.funded.credits)} / {fmt(p.cost.credits)} cr
            </span>
            <GoodsNeed p={p} size={size} />
          </span>
          <span className={cx('relative overflow-hidden rounded-full bg-raised', tv ? 'h-2.5' : 'h-1.5')} data-testid={`funding-${p.id}`}>
            <span className="absolute inset-y-0 left-0 rounded-full bg-holo" style={{ width: `${share}%` }} />
          </span>
          <span className={cx('text-ink-2', line)}>
            Starts building the month it is paid in full: {p.buildMonths} month{p.buildMonths > 1 ? 's' : ''}.
          </span>
        </span>
      );
    }
    case 'building': {
      const done = p.buildMonths - (p.monthsLeft ?? 0);
      return (
        <span className={cx('flex items-center gap-3', line)}>
          <span className="flex gap-1" aria-label={`${done} of ${p.buildMonths} months built`} data-testid={`build-${p.id}`}>
            {Array.from({ length: p.buildMonths }, (_, i) => (
              <span key={i} className={cx('rounded-sm border', tv ? 'h-3 w-8' : 'h-2 w-5', i < done ? 'border-warn bg-warn' : 'border-holo-line bg-raised')} />
            ))}
          </span>
          <span className="text-ink-2">{p.monthsLeft === 1 ? 'Stands at this month’s end' : `Stands in ${p.monthsLeft} months`}</span>
        </span>
      );
    }
    case 'standing':
      return (
        <span className={cx('text-ink-2', line)}>
          {PERK[p.id]} · upkeep {p.upkeep} cr a month
        </span>
      );
    case 'closed':
      return <span className={cx('font-semibold text-alert', line)}>The fund missed its upkeep ({p.upkeep} cr): no perk, counts 0 until it is paid</span>;
    case 'damaged':
      return <span className={cx('font-semibold text-alert', line)}>Damaged in the riot: counts 0 until the Governor repairs it ({fmt(p.repairCost ?? 0)} cr)</span>;
  }
}

/** The donors on a project, biggest first: their mark and what they gave. */
export function Plaque({ p, players, size, limit }: { p: ColonyProjectView; players: PlayerView[]; size: Size; limit?: number }) {
  const tv = size === 'tv';
  const donors = p.plaque.flatMap((d) => {
    const player = players.find((x) => x.id === d.playerId);
    return player ? [{ player, value: d.value }] : [];
  });
  if (donors.length === 0) return null;
  const shown = limit === undefined ? donors : donors.slice(0, limit);
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-x-4 gap-y-1' : 'gap-x-2.5 gap-y-0.5')} data-testid={`plaque-${p.id}`}>
      <span className={cx('label-caps', tv ? 'text-xs!' : 'text-[10px]!')}>Plaque</span>
      {shown.map(({ player, value }) => (
        <span key={player.id} className={cx('flex items-center gap-1', tv ? 'text-base' : 'text-[11px]')}>
          <Mark player={player} size={tv ? 18 : 12} />
          <span className="font-semibold">{player.name}</span>
          <span data-num className="font-mono text-ink-2">
            {fmt(value)} cr
          </span>
        </span>
      ))}
      {shown.length < donors.length && <span className={cx('text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>+{donors.length - shown.length} more</span>}
    </span>
  );
}

export function ProjectRow({ p, players, size, plaque = true }: { p: ColonyProjectView; players: PlayerView[]; size: Size; plaque?: boolean }) {
  const tv = size === 'tv';
  const dead = p.stage === 'closed' || p.stage === 'damaged';
  const st = STAGE[p.stage];
  return (
    <li className={cx('flex items-start border-t border-holo-faint first:border-t-0', tv ? 'gap-4 py-3 first:pt-0' : 'gap-2 py-1.5 first:pt-0')} data-testid={`project-${p.id}`} data-stage={p.stage}>
      <span className={cx('grid shrink-0 place-items-center rounded-control border', tv ? 'size-12' : 'size-7', dead ? 'border-alert text-alert' : p.stage === 'standing' ? 'border-ok text-ok' : 'border-holo-line text-holo')}>
        <ObjectGlyph kind={p.id} size={tv ? 30 : 18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cx('font-display font-semibold', tv ? 'text-2xl' : 'text-sm')}>{p.name}</span>
          <span className={cx('rounded-chip border px-1.5 font-mono font-bold uppercase', tv ? 'text-xs' : 'text-[10px]', st.chip)} data-testid={`stage-${p.id}`}>
            {st.label}
          </span>
          <span className={cx('ml-auto font-mono font-bold', tv ? 'text-lg' : 'text-[11px]', dead ? 'text-ink-3 line-through' : 'text-holo')} data-testid={`prestige-${p.id}`}>
            +{p.prestige} prestige
          </span>
        </span>
        <StageLine p={p} size={size} />
        {plaque && <Plaque p={p} players={players} size={size} {...(tv ? {} : { limit: 2 })} />}
      </span>
    </li>
  );
}

/** Every project the Governor has commissioned, at its stage; `action` draws a project's buttons under its row. */
export function BuildSite({ colony, players, size, action, className }: { colony: ColonyView; players: PlayerView[]; size: Size; action?: (p: ColonyProjectView) => ReactNode; className?: string }) {
  const tv = size === 'tv';
  return (
    <section className={cx('flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-3 p-5' : 'gap-1.5 px-2.5 py-2', className)} aria-label="The colony's projects" data-testid="build-site">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>Colony projects</h2>
        <span className={cx('font-mono text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>
          {standingCount(colony)} standing · {colony.gauges.prestige} prestige
        </span>
      </header>
      {colony.projects.length === 0 ? (
        <p className={cx('text-ink-2', tv ? 'text-lg' : 'text-xs')} data-testid="no-projects">
          Nothing commissioned yet. The Governor picks the colony’s first project in planning; anyone can donate toward it.
        </p>
      ) : (
        <ul className="flex flex-col">
          {colony.projects.map((p) => (
            <div key={p.id} className="flex flex-col">
              <ProjectRow p={p} players={players} size={size} />
              {action?.(p)}
            </div>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The Colony desk's body on a phone: the four gauges, then the build site, with the desk's buttons under each project. */
export function ColonyDeskCard({ view, action, className }: { view: MuleView; action?: (p: ColonyProjectView) => ReactNode; className?: string }) {
  const colony = view.colony;
  if (!colony) return null;
  return (
    <div className={cx('flex min-h-0 flex-col gap-1.5', className)} data-testid="colony-desk-card">
      <ColonyGauges colony={colony} size="phone" className="grid-cols-2!" />
      <BuildSite colony={colony} players={view.players} size="phone" className="min-h-0 flex-1 overflow-hidden" {...(action ? { action } : {})} />
    </div>
  );
}

// --- The colony score ---------------------------------------------------------------------------------

function Term({ label, value, size, testid, sign, tone }: { label: string; value: string; size: Size | 'hero'; testid: string; sign?: string; tone?: string }) {
  const big = size === 'hero' ? 'text-5xl' : size === 'tv' ? 'text-3xl' : 'text-base';
  return (
    <span className="flex items-end gap-2" data-testid={testid}>
      {sign && <span className={cx('pb-1 font-mono text-ink-3', size === 'phone' ? 'text-sm' : 'text-2xl')}>{sign}</span>}
      <span className="flex flex-col items-center">
        <span data-num className={cx('font-mono font-bold leading-none', tone, big)}>
          {value}
        </span>
        <span className={cx('label-caps mt-1', size === 'phone' ? 'text-[10px]!' : 'text-xs!')}>{label}</span>
      </span>
    </span>
  );
}

/** The sum as one line everyone can read across the room: wealth + environment + prestige, × the happiness factor. */
export function ScoreSum({ score, colony, size }: { score: ColonyScore; colony: ColonyView; size: Size | 'hero' }) {
  const mood = moodOf(colony.gauges.band);
  if (size === 'phone') {
    // On a phone the sum is one line of numbers with the four names under it, so it never wraps mid-sum.
    const cells: [string, string, string, string | undefined][] = [
      ['', `${score.wealth}`, 'Wealth', undefined],
      ['+', `${score.environment}`, 'Env.', undefined],
      ['+', `${score.prestige}`, 'Prestige', undefined],
      ['×', score.factor.toFixed(2), mood.label, mood.tone],
    ];
    return (
      <span className="flex justify-between gap-x-1" data-testid="score-sum">
        {cells.map(([op, v, name, tone]) => (
          <span key={name} className="flex flex-col items-center">
            <span data-num className={cx('whitespace-nowrap font-mono text-sm font-bold leading-none', tone)}>
              {op && <span className="mr-0.5 text-ink-3">{op}</span>}
              {v}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none text-ink-3">{name}</span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-end gap-x-4 gap-y-2" data-testid="score-sum">
      <Term size={size} testid="term-wealth" label="Wealth" value={`${score.wealth}`} />
      <Term size={size} testid="term-environment" label="Environment" value={`${score.environment}`} sign="+" />
      <Term size={size} testid="term-prestige" label="Prestige" value={`${score.prestige}`} sign="+" />
      <Term size={size} testid="term-factor" label={mood.label} value={score.factor.toFixed(2)} sign="×" tone={mood.tone} />
    </span>
  );
}

/**
 * The colony's score, big: the total, its verdict and the sum that made it. `failed`: the colony failed (the air's
 * verdict, shown above it), so the score keeps no verdict of its own.
 */
export function ScoreHero({ colony, score, size, failed = false }: { colony: ColonyView; score: ColonyScore; size: 'hero' | 'tv'; failed?: boolean }) {
  const v = scoreVerdict(score);
  const hero = size === 'hero';
  return (
    <div className={cx('flex flex-col', hero ? 'gap-4' : 'gap-2')} data-testid="colony-score">
      <span className={cx('flex gap-x-8 gap-y-4', hero ? 'flex-col' : 'flex-row flex-wrap items-end')}>
        <span className="flex items-baseline gap-4">
          <span data-num className={cx('font-mono font-bold leading-none', failed ? 'text-alert-ink' : 'text-holo', hero ? 'text-8xl' : 'text-6xl')} data-testid="colony-total">
            {score.total}
          </span>
          <span className="flex flex-col">
            <span className="label-caps text-sm!">Colony score</span>
            {!failed && (
              <span className={cx('font-display font-semibold', v.tone, hero ? 'text-3xl' : 'text-2xl')} data-testid="colony-verdict">
                {v.title}
              </span>
            )}
          </span>
        </span>
        <ScoreSum score={score} colony={colony} size={size} />
      </span>
      <span className={cx('text-ink-2', hero ? 'text-base' : 'text-sm')}>{scoreWords(colony, score)}</span>
    </div>
  );
}

function ScorePending({ size }: { size: Size }) {
  return (
    <span className={cx('text-ink-2', size === 'tv' ? 'text-2xl' : 'text-[11px] leading-tight')} data-testid="colony-score-pending">
      The colony’s score is counted at game over
    </span>
  );
}

/** Who gave most to the colony, with their plaques: the colony half of each player's standing. */
export function PlaqueBoard({ colony, players, size, selfId }: { colony: ColonyView; players: PlayerView[]; size: Size; selfId?: string }) {
  const tv = size === 'tv';
  return (
    <ol className={cx('flex flex-col', tv ? 'gap-2' : 'gap-1')} data-testid="plaque-board">
      {plaqueBoard(colony, players).map(({ player, plaques, given }, i) => (
        <li key={player.id} className={cx('flex items-center', tv ? 'gap-3' : 'gap-1.5', player.id === selfId && 'rounded-control bg-holo-soft px-1')} data-testid={`plaques-${player.id}`}>
          <span className={cx('font-mono text-ink-3', tv ? 'w-5 text-base' : 'w-3 text-[10px]')}>{i + 1}</span>
          <Mark player={player} size={tv ? 20 : 12} />
          <span className={cx('min-w-0 truncate font-semibold', tv ? 'w-20 text-lg' : 'w-12 text-[11px]')}>{player.name}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1 text-holo">
            {plaques.length === 0 ? (
              <span className={cx('text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>no plaques</span>
            ) : (
              plaques.map((q) => (
                <span key={q.project.id} title={`${q.project.name}: ${fmt(q.value)} cr`} className="flex">
                  <ObjectGlyph kind={q.project.id} size={tv ? 22 : 14} />
                </span>
              ))
            )}
          </span>
          <span data-num className={cx('font-mono font-bold', tv ? 'text-lg' : 'text-[11px]')}>
            {fmt(given)} cr
          </span>
        </li>
      ))}
    </ol>
  );
}

// --- Game over ----------------------------------------------------------------------------------------

/** The winner, shorter and horizontal, so the colony's band fits under it on the TV. */
export function TvWinner({ view, className }: { view: MuleView; className?: string }) {
  const lg = league(view);
  const top = lg.rows[0];
  if (!top) return null;
  return (
    <div className={cx('relative flex items-center gap-5 rounded-panel border-2 border-holo bg-holo-soft px-6 py-4 shadow-glow', className)} data-testid="tv-winner">
      <PlayerMark slot={top.slot} species={top.player.species} size={88} label={top.player.name} />
      <span className="flex flex-col gap-1">
        <span className="label-caps text-base!">The game goes to</span>
        <span className="font-display text-3xl font-semibold leading-tight" data-testid="winner-line">
          {winnerWords(view, lg)}
        </span>
      </span>
    </div>
  );
}

/** The TV's band at game over: how the colony did, beside who gave most. A failed colony is carried in alert, never just a low number. */
export function ColonyScoreBand({ view, colony }: { view: MuleView; colony: ColonyView }) {
  const failed = colonyVerdict(view.air);
  return (
    <section
      className={cx('grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 rounded-panel border p-5', failed.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')}
      aria-label="How the colony did"
      data-testid="colony-band"
      data-failed={failed.failed}
    >
      <div className="flex flex-col gap-2">
        <h2 className="label-caps text-base!">How the colony did</h2>
        {failed.failed && (
          <span className="flex flex-wrap items-baseline gap-x-4">
            <span className="font-display text-2xl font-semibold text-alert-ink" data-testid="verdict-title">
              {failed.title}
            </span>
            <span className="text-lg text-ink" data-testid="verdict-line">
              {failed.line}
            </span>
          </span>
        )}
        {colony.score ? <ScoreHero colony={colony} score={colony.score} size="tv" failed={failed.failed} /> : <ScorePending size="tv" />}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="label-caps text-base!">Plaques · who gave most</h2>
        <PlaqueBoard colony={colony} players={view.players} size="tv" />
      </div>
    </section>
  );
}

/** The colony's score on a phone beside the TV, in the air verdict's place: so it carries a failed colony in alert. */
export function PhoneColonyScore({ view, colony, selfId, className }: { view: MuleView; colony: ColonyView; selfId: string; className?: string }) {
  const score = colony.score;
  const failed = colonyVerdict(view.air);
  const mine = plaquesOf(colony, selfId);
  return (
    <section className={cx('flex flex-col rounded-panel border', failed.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel', className)} data-testid="phone-colony-score" data-failed={failed.failed}>
      {failed.failed && (
        <span className="flex flex-col" data-testid="verdict">
          <span className="font-display text-sm font-semibold leading-tight text-alert-ink" data-testid="verdict-title">
            {failed.title}
          </span>
          <span className="text-[11px] leading-tight text-ink" data-testid="verdict-line">
            {failed.line}
          </span>
        </span>
      )}
      {score ? (
        <>
          <span className="flex items-baseline gap-2">
            <span data-num className={cx('font-mono text-2xl font-bold leading-none', failed.failed ? 'text-alert-ink' : 'text-holo')} data-testid="colony-total">
              {score.total}
            </span>
            <span className="flex flex-col">
              <span className="label-caps text-[10px]!">Colony score</span>
              {!failed.failed && <span className={cx('font-display text-sm font-semibold leading-tight', scoreVerdict(score).tone)}>{scoreVerdict(score).title}</span>}
            </span>
          </span>
          <ScoreSum score={score} colony={colony} size="phone" />
        </>
      ) : (
        <ScorePending size="phone" />
      )}
      <span className="text-[11px] leading-tight text-ink-2" data-testid="your-plaques">
        {mine.length === 0 ? 'You are on no plaque.' : `Your plaques: ${mine.map((q) => q.project.name).join(', ')} · ${fmt(mine.reduce((a, b) => a + b.value, 0))} cr given`}
      </span>
    </section>
  );
}
