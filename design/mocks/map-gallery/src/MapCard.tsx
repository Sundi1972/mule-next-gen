import { useMemo, useState } from 'react';
import { MAP, mapSize, RAW_GOODS, RULE_TITLES, sizeBand, type Violation } from '@mule/engine';
import { cx, GOOD_NAME, GoodIcon, HoloMap, TERRAIN_NAME } from '@mule/ui';
import {
  biggestRegionCap,
  brokenRules,
  FLOOR_GOODS,
  floorOf,
  mapsForSeed,
  normalOf,
  SHARE_TERRAINS,
  toMapTiles,
  type CheckedMap,
  type Generator,
  type GroundView,
  type Players,
} from './gallery';
import { num, pct } from './ui';

const COLUMN_TITLE: Record<Generator, string> = { current: "Current: today's generator", new: 'New: the map rules generator' };
// Violations listed before "show all"; specks and river rows can run to dozens on today's maps.
const LISTED = 6;
// Plot coordinates printed under one violation before the rest are summarised.
const LISTED_PLOTS = 8;

/** One seed: today's map and the new map side by side, each with the checker's verdict and numbers. */
export function MapCard({ seed, players, ground }: { seed: number; players: Players; ground: GroundView }) {
  const maps = useMemo(() => mapsForSeed(seed, players), [seed, players]);
  return (
    <article className="rounded-panel border border-holo-line bg-panel p-4">
      <h2 className="mb-3 font-display text-lg font-semibold">Seed {seed}</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <MapColumn generator="current" checked={maps.current} players={players} ground={ground} />
        <MapColumn generator="new" checked={maps.new} players={players} ground={ground} />
      </div>
    </article>
  );
}

function MapColumn({ generator, checked, players, ground }: { generator: Generator; checked: CheckedMap; players: Players; ground: GroundView }) {
  const { map, report } = checked;
  const [focus, setFocus] = useState<Violation | null>(null);
  const tiles = useMemo(() => toMapTiles(map, ground), [map, ground]);
  const broken = brokenRules(report);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{COLUMN_TITLE[generator]}</h3>
        <Verdict rules={broken.length} problems={report.violations.length} />
      </div>
      <div className="relative">
        <HoloMap width={map.width} height={map.height} tiles={tiles} className="w-full" />
        <ProblemPlots width={map.width} height={map.height} plots={focus?.at ?? []} />
      </div>
      <Violations violations={report.violations} onFocus={setFocus} />
      <Metrics checked={checked} players={players} />
    </div>
  );
}

function Verdict({ rules, problems }: { rules: number; problems: number }) {
  if (rules === 0) return <span className="rounded-chip bg-ok px-2 py-0.5 text-xs font-semibold text-void">Meets every rule</span>;
  return (
    <span className="rounded-chip bg-alert px-2 py-0.5 text-xs font-semibold text-white">
      Breaks {rules} {rules === 1 ? 'rule' : 'rules'} ({problems} {problems === 1 ? 'problem' : 'problems'})
    </span>
  );
}

/** Marks the plots of the problem pointed at, over the map; HoloMap has no mark for this, so the gallery draws its own layer. */
function ProblemPlots({ width, height, plots }: { width: number; height: number; plots: { x: number; y: number }[] }) {
  if (plots.length === 0) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-px" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {plots.map((p, i) => (
        <rect
          key={i}
          x={p.x + 0.08}
          y={p.y + 0.08}
          width={0.84}
          height={0.84}
          rx={0.12}
          fill="color-mix(in srgb, var(--color-alert) 28%, transparent)"
          stroke="var(--color-alert)"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function Violations({ violations, onFocus }: { violations: Violation[]; onFocus(v: Violation | null): void }) {
  const [all, setAll] = useState(false);
  if (violations.length === 0) return null;
  const shown = all ? violations : violations.slice(0, LISTED);
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs text-ink-3">Problems (point at one to mark its plots on the map)</p>
      <ul className="space-y-1 text-sm" onMouseLeave={() => onFocus(null)}>
        {shown.map((v, i) => (
          <li
            key={i}
            onMouseEnter={() => onFocus(v)}
            onFocus={() => onFocus(v)}
            tabIndex={0}
            className="rounded-chip border-l-2 border-alert bg-alert-bg px-2 py-1"
          >
            <span className="font-semibold text-alert-ink">
              {v.rule} {RULE_TITLES[v.rule]}:
            </span>{' '}
            {v.detail}
            {v.at && v.at.length > 0 && <PlotList plots={v.at} />}
          </li>
        ))}
      </ul>
      {violations.length > LISTED && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs text-holo hover:underline">
          {all ? 'Show fewer' : `Show all ${violations.length} problems`}
        </button>
      )}
    </div>
  );
}

function PlotList({ plots }: { plots: { x: number; y: number }[] }) {
  const listed = plots.slice(0, LISTED_PLOTS).map((p) => `(${p.x},${p.y})`).join(' ');
  const more = plots.length - LISTED_PLOTS;
  return (
    <span className="block font-mono text-xs text-ink-2">
      {plots.length === 1 ? 'plot' : 'plots'} {listed}
      {more > 0 && ` and ${more} more`}
    </span>
  );
}

function Metrics({ checked, players }: { checked: CheckedMap; players: Players }) {
  const { map, report } = checked;
  const m = report.metrics;
  const broken = brokenRules(report);
  const band = sizeBand(players);
  const { width, height } = mapSize(players);
  const noGoodPlot = width + height;
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div>
        <p className="mb-1 text-xs text-ink-3">Good plots per player (red under the floor, amber under the normal range)</p>
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 sm:grid-cols-6">
          {RAW_GOODS.map((g) => {
            const v = m.perPlayer[g];
            const floor = floorOf(g);
            const normal = normalOf(g);
            const tone = floor !== undefined && v < floor ? 'text-alert' : normal !== undefined && v < normal ? 'text-warn' : '';
            return (
              <div key={g} className="flex items-center gap-1.5" title={GOOD_NAME[g]}>
                <GoodIcon good={g} size={14} />
                <span className="sr-only">{GOOD_NAME[g]}</span>
                <span className={cx('font-mono', tone)}>{num(v)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-ink-3">Worst reach: most steps from any plot to a good plot (limit)</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
          {FLOOR_GOODS.map((g) => {
            const v = m.worstReach[g];
            const limit = MAP.reach[band][g];
            return (
              <div key={g} className="flex items-center gap-1.5">
                <GoodIcon good={g} size={14} />
                <span className="sr-only">{GOOD_NAME[g]}</span>
                <span className={cx('font-mono', v > limit && 'text-alert')}>{v >= noGoodPlot ? 'none' : v}</span>
                <span className="font-mono text-ink-3">/ {limit}</span>
              </div>
            );
          })}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <Stat label="Biggest region" value={`${m.biggestRegion} plots`} limit={`cap ${biggestRegionCap(map)}`} bad={broken.includes('S5')} />
        <Stat label="River bends" value={String(m.bends)} limit={`need ${MAP.bends[band]}`} bad={m.bends < MAP.bends[band]} />
        <Stat label="Smithore seams" value={pct(m.seamShare)} limit={`need ${pct(MAP.seamShare)}`} bad={broken.includes('S8')} />
        <Stat label="Crystite peaks" value={String(m.peaks.crystite)} limit={ringCount()} bad={outOfCount(m.peaks.crystite)} />
        <Stat label="Rare earth peaks" value={String(m.peaks.rareEarth)} limit={ringCount()} bad={outOfCount(m.peaks.rareEarth)} />
        <Stat label="Scarce good" value={m.scarce ? GOOD_NAME[m.scarce] : 'none'} />
      </dl>

      <div>
        <p className="mb-1 text-xs text-ink-3">Terrain shares of non-river land (target)</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
          {SHARE_TERRAINS.map((t) => {
            const share = m.shares[t] ?? 0;
            return (
              <div key={t} className="flex justify-between gap-2">
                <span className="truncate">{TERRAIN_NAME[t]}</span>
                <span className="font-mono">
                  <span className={cx(share === 0 && 'text-alert')}>{pct(share)}</span>
                  <span className="text-ink-3"> ({pct(MAP.shares[t])})</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ringCount(): string {
  return `need ${MAP.peak.count.min} to ${MAP.peak.count.max}`;
}

function outOfCount(n: number): boolean {
  return n < MAP.peak.count.min || n > MAP.peak.count.max;
}

function Stat({ label, value, limit, bad = false }: { label: string; value: string; limit?: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-mono">
        <span className={cx(bad && 'text-alert')}>{value}</span>
        {limit && <span className="text-xs text-ink-3"> {limit}</span>}
      </dd>
    </div>
  );
}
