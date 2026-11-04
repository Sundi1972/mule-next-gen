import { airBandStyle, cx, GoodIcon, PlayerMark } from '@mule/ui';
import type { ReactNode } from 'react';
import { GOOD_ORDER, MOOD, OBJECT, plaquesOf, standingCount, type ColonyScore, type ColonyView, type PrestigeId, type ProjectGood, type ProjectView, type Stage } from './colony';
import { NAME, PLAYERS, SLOT, SPECIES } from './fixture';

export type Size = 'tv' | 'phone';

const fmt = (n: number) => n.toLocaleString('en-US');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

// --- The objects' glyphs ------------------------------------------------------------------------------

/**
 * DS-GAP (WS8): five object glyphs, 24×24 stroked like the hub's desk icons (hub/slots.ts DeskSlot.icon). They move
 * into packages/ui beside SpecialIcon once approved; WS5's C33 draws the same five on the map.
 */
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

/**
 * Wealth, Environment, Prestige and Happiness (C34): on the TV they take the air gauge's place in the header; on the
 * phone they head the Colony desk. Environment is the air everyone already knows, so it keeps the air's bands.
 */
export function ColonyGauges({ colony, size, className }: { colony: ColonyView; size: Size; className?: string }) {
  const g = colony.gauges;
  const last = colony.lastGauges;
  const air = airBandStyle(g.environment);
  const mood = MOOD[g.band];
  const moodMove = last === null ? null : g.happiness - last.happiness;
  const tv = size === 'tv';
  return (
    <div className={cx('grid grid-cols-4', tv ? 'gap-2' : 'gap-1.5', className)} data-testid="colony-gauges">
      <Gauge size={size} testid="gauge-wealth" label="Wealth" value={`${fmt(g.wealth)} cr`} note={`fund ${fmt(colony.fund)} cr`} />
      <Gauge size={size} testid="gauge-environment" label="Environment" value={`${g.environment}`} band={air.label} tone={air.tone} bar={air.bar} fill={g.environment} />
      <Gauge size={size} testid="gauge-prestige" label="Prestige" value={`${g.prestige}`} note={`${standingCount(colony)} standing${last && g.prestige !== last.prestige ? ` · ${signed(g.prestige - last.prestige)}` : ''}`} />
      <Gauge
        size={size}
        testid="gauge-happiness"
        label="Happiness"
        value={`${g.happiness}`}
        band={mood.label}
        tone={mood.tone}
        bar={mood.bar}
        fill={g.happiness}
        {...(moodMove !== null && tv ? { note: moodMove === 0 ? '± 0' : `${moodMove > 0 ? '↑' : '↓'} ${Math.abs(moodMove)} this month` } : {})}
      />
    </div>
  );
}

// --- The build site -----------------------------------------------------------------------------------

const STAGE: Record<Stage, { label: string; chip: string }> = {
  commissioned: { label: 'Collecting', chip: 'border-holo text-holo' },
  building: { label: 'Building', chip: 'border-warn text-warn' },
  standing: { label: 'Standing', chip: 'border-ok text-ok' },
  closed: { label: 'Closed', chip: 'border-alert text-alert' },
  damaged: { label: 'Damaged', chip: 'border-alert text-alert' },
};

function GoodsNeed({ p, size }: { p: ProjectView; size: Size }) {
  const tv = size === 'tv';
  const goods = GOOD_ORDER.filter((g) => p.cost.goods[g]);
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-3' : 'gap-2')}>
      {goods.map((g: ProjectGood) => {
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
function StageLine({ p, size }: { p: ProjectView; size: Size }) {
  const tv = size === 'tv';
  const line = tv ? 'text-base' : 'text-[11px] leading-tight';
  switch (p.stage) {
    case 'commissioned': {
      const share = Math.round((p.funded.credits / p.cost.credits) * 100);
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
          <span className={cx('text-ink-2', line)}>Starts building the month it is paid in full: {p.buildMonths} month{p.buildMonths > 1 ? 's' : ''}.</span>
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
          {OBJECT[p.id].perk} · upkeep {p.upkeep} cr a month
        </span>
      );
    case 'closed':
      return <span className={cx('font-semibold text-alert', line)}>The fund missed its upkeep ({p.upkeep} cr): no perk, counts 0 until it is paid</span>;
    case 'damaged':
      return <span className={cx('font-semibold text-alert', line)}>Damaged in the riot: counts 0 until the Governor repairs it ({fmt(p.repairCost ?? 0)} cr)</span>;
  }
}

/** The donors on a project, biggest first: their mark and what they gave. */
export function Plaque({ p, size, limit }: { p: ProjectView; size: Size; limit?: number }) {
  const tv = size === 'tv';
  const donors = p.plaque;
  const shown = limit === undefined ? donors : donors.slice(0, limit);
  if (donors.length === 0) return null;
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-x-4 gap-y-1' : 'gap-x-2.5 gap-y-0.5')} data-testid={`plaque-${p.id}`}>
      <span className={cx('label-caps', tv ? 'text-xs!' : 'text-[9px]!')}>Plaque</span>
      {shown.map((d) => (
        <span key={d.playerId} className={cx('flex items-center gap-1', tv ? 'text-base' : 'text-[11px]')}>
          <PlayerMark slot={SLOT[d.playerId]!} species={SPECIES[d.playerId]} size={tv ? 18 : 12} label={NAME[d.playerId]} />
          <span className="font-semibold">{NAME[d.playerId]}</span>
          <span data-num className="font-mono text-ink-2">
            {fmt(d.credits)} cr{d.goods ? ` + ${d.goods} goods` : ''}
          </span>
        </span>
      ))}
      {shown.length < donors.length && <span className={cx('text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>+{donors.length - shown.length} more</span>}
    </span>
  );
}

export function ProjectRow({ p, size, plaque = true }: { p: ProjectView; size: Size; plaque?: boolean }) {
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
          <span className={cx('font-display font-semibold', tv ? 'text-2xl' : 'text-sm')}>{OBJECT[p.id].name}</span>
          <span className={cx('rounded-chip border px-1.5 font-mono font-bold uppercase', tv ? 'text-xs' : 'text-[9px]', st.chip)} data-testid={`stage-${p.id}`}>
            {st.label}
          </span>
          <span className={cx('ml-auto font-mono font-bold', tv ? 'text-lg' : 'text-[11px]', dead ? 'text-ink-3 line-through' : 'text-holo')} data-testid={`prestige-${p.id}`}>
            +{p.prestige} prestige
          </span>
        </span>
        <StageLine p={p} size={size} />
        {plaque && <Plaque p={p} size={size} {...(tv ? {} : { limit: 2 })} />}
      </span>
    </li>
  );
}

/**
 * The colony's build site (C34): every project the Governor has commissioned, newest first, at its stage. On the TV it
 * sits beside the colony's report at the month end; on the phone it is the Colony desk's Projects section, where WS7's
 * commission and donate desks (C35) open from its buttons.
 */
export function BuildSite({ colony, size, action, className }: { colony: ColonyView; size: Size; action?: (p: ProjectView) => ReactNode; className?: string }) {
  const tv = size === 'tv';
  return (
    <section className={cx('flex min-h-0 flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-3 p-5' : 'gap-1.5 px-2.5 py-2', className)} aria-label="The colony's projects" data-testid="build-site">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>Colony projects</h2>
        <span className={cx('font-mono text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>{standingCount(colony)} standing · {colony.gauges.prestige} prestige</span>
      </header>
      {colony.projects.length === 0 ? (
        <p className={cx('text-ink-2', tv ? 'text-lg' : 'text-xs')} data-testid="no-projects">
          Nothing commissioned yet. The Governor picks the colony’s first project in planning; anyone can donate toward it.
        </p>
      ) : (
        <ul className="flex flex-col">
          {colony.projects.map((p) => (
            <div key={p.id} className="flex flex-col">
              <ProjectRow p={p} size={size} />
              {action?.(p)}
            </div>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- The colony score ---------------------------------------------------------------------------------

function Term({ label, value, size, testid, sign }: { label: string; value: string; size: Size | 'hero'; testid: string; sign?: string }) {
  const big = size === 'hero' ? 'text-5xl' : size === 'tv' ? 'text-3xl' : 'text-base';
  const cap = size === 'phone' ? 'text-[9px]!' : 'text-xs!';
  return (
    <span className="flex items-end gap-2" data-testid={testid}>
      {sign && <span className={cx('pb-1 font-mono text-ink-3', size === 'phone' ? 'text-sm' : 'text-2xl')}>{sign}</span>}
      <span className="flex flex-col items-center">
        <span data-num className={cx('font-mono font-bold leading-none', big)}>
          {value}
        </span>
        <span className={cx('label-caps mt-1', cap)}>{label}</span>
      </span>
    </span>
  );
}

/** The sum as one line everyone can read across the room: wealth + environment + prestige, × the happiness factor. */
export function ScoreSum({ score, colony, size }: { score: ColonyScore; colony: ColonyView; size: Size | 'hero' }) {
  const mood = MOOD[colony.gauges.band];
  const phone = size === 'phone';
  if (phone) {
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
    <span className={cx('flex flex-wrap items-end', phone ? 'gap-x-2 gap-y-1' : 'gap-x-4 gap-y-2')} data-testid="score-sum">
      <Term size={size} testid="term-wealth" label="Wealth" value={`${score.wealth}`} />
      <Term size={size} testid="term-environment" label="Environment" value={`${score.environment}`} sign="+" />
      <Term size={size} testid="term-prestige" label="Prestige" value={`${score.prestige}`} sign="+" />
      <span className="flex items-end gap-2" data-testid="term-factor">
        <span className={cx('pb-1 font-mono text-ink-3', phone ? 'text-sm' : 'text-2xl')}>×</span>
        <span className="flex flex-col items-center">
          <span data-num className={cx('font-mono font-bold leading-none', mood.tone, size === 'hero' ? 'text-5xl' : size === 'tv' ? 'text-3xl' : 'text-base')}>
            {score.factor.toFixed(2)}
          </span>
          <span className={cx('label-caps mt-1', phone ? 'text-[9px]!' : 'text-xs!')}>{mood.label}</span>
        </span>
      </span>
    </span>
  );
}

/** What each part of the score was made of, for the line under the sum. */
export function scoreWords(colony: ColonyView): string {
  const s = colony.score!;
  const n = standingCount(colony);
  return `Wealth: everything the colony owns, ${fmt(colony.gauges.wealth)} cr · Environment: air ${colony.gauges.environment} · Prestige: ${n} standing object${n === 1 ? '' : 's'} · ${MOOD[colony.gauges.band].label}: × ${s.factor.toFixed(2)}`;
}

/** The colony's verdict on its score: one line the table can repeat. Fixture bands; WS1 sets the real ones. */
export function scoreVerdict(score: ColonyScore): { title: string; tone: string } {
  if (score.total >= 100) return { title: 'A colony to be proud of', tone: 'text-ok' };
  if (score.total >= 50) return { title: 'A colony that held together', tone: 'text-ink' };
  return { title: 'A colony in ruins', tone: 'text-alert-ink' };
}

// --- Each player's standing: their plaques ------------------------------------------------------------

/** Who gave most to the colony, with their plaques: the colony half of each player's standing. */
export function PlaqueBoard({ colony, size, selfId }: { colony: ColonyView; size: Size; selfId?: string }) {
  const tv = size === 'tv';
  const rows = PLAYERS.map((pl) => {
    const plaques = plaquesOf(colony, pl.id);
    return { pl, plaques, credits: plaques.reduce((a, b) => a + b.credits, 0) };
  }).sort((a, b) => b.credits - a.credits);
  return (
    <ol className={cx('flex flex-col', tv ? 'gap-2' : 'gap-1')} data-testid="plaque-board">
      {rows.map(({ pl, plaques, credits }, i) => (
        <li key={pl.id} className={cx('flex items-center', tv ? 'gap-3' : 'gap-1.5', pl.id === selfId && 'rounded-control bg-holo-soft px-1')} data-testid={`plaques-${pl.id}`}>
          <span className={cx('font-mono text-ink-3', tv ? 'w-5 text-base' : 'w-3 text-[10px]')}>{i + 1}</span>
          <PlayerMark slot={SLOT[pl.id]!} species={pl.species} size={tv ? 20 : 12} label={pl.name} />
          <span className={cx('min-w-0 truncate font-semibold', tv ? 'w-20 text-lg' : 'w-12 text-[11px]')}>{pl.name}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1 text-holo">
            {plaques.length === 0 ? (
              <span className={cx('text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>no plaques</span>
            ) : (
              plaques.map((q) => (
                <span key={q.project.id} title={`${OBJECT[q.project.id].name}: ${fmt(q.credits)} cr`} className="flex">
                  <ObjectGlyph kind={q.project.id} size={tv ? 22 : 14} />
                </span>
              ))
            )}
          </span>
          <span data-num className={cx('font-mono font-bold', tv ? 'text-lg' : 'text-[11px]')}>
            {fmt(credits)} cr
          </span>
        </li>
      ))}
    </ol>
  );
}
