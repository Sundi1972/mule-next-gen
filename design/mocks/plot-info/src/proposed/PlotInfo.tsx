import type { Ground, RawGood } from '@mule/engine';
import type { TileView } from '@mule/protocol';
import { cx, GOOD_NAME, GoodIcon, TERRAIN_NAME } from '@mule/ui';
import type { CSSProperties } from 'react';
import { bestOf, gemsIn, groundDots } from './dots';

/*
 * PROPOSED: the pieces every plot-info surface shares. Graft targets: new apps/web/src/phone/plotInfo.tsx (Dots, GoodDots,
 * ScanReport, PlotRow, AnalyseCard), and packages/ui HoloMap's marks (MapMarks: WS4's named edit).
 */

const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const SHORT: Record<RawGood, string> = { food: 'Food', water: 'Water', energy: 'Energy', smithore: 'Ore', crystite: 'Crystite', rareEarth: 'Rare earth' };
export const plotName = (x: number, y: number) => `${x + 1}·${y + 1}`;

/** 0 to 3 dots in the good's colour. */
export function Dots({ good, n, size = 6 }: { good: RawGood; n: number; size?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${GOOD_NAME[good]} ${n} of 3`} data-testid={`dots-${good}`} data-n={n}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="rounded-full" style={{ width: size, height: size, background: i <= n ? `var(--color-g-${good})` : 'var(--color-holo-line)' }} />
      ))}
    </span>
  );
}

/** The gem: this plot holds Crystite or Rare earth. Only on the screens of a player who did the geology. */
export function Gem({ good, size = 12 }: { good: RawGood; size?: number }) {
  return (
    <span
      className="inline-grid place-items-center rounded-full shadow-chip ring-2 ring-white/80"
      style={{ width: size + 6, height: size + 6, background: `var(--color-g-${good})` }}
      title={`${GOOD_NAME[good]} here`}
      data-testid={`gem-${good}`}
    >
      <GoodIcon good={good} size={size} color="white" />
    </span>
  );
}

/** Every raw good of one plot, 0–3 dots each, in two columns; Crystite and Rare earth carry their gem when found. */
export function GoodDots({ ground, cols = 2 }: { ground: Ground; cols?: 2 | 3 | 6 }) {
  const gems = gemsIn(ground);
  return (
    <div className={cx('grid gap-x-3 gap-y-1', cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-6 gap-x-1.5')} data-testid="good-dots">
      {RAW.map((g) => {
        const n = groundDots(g, ground[g]);
        return (
          <span key={g} className={cx('flex items-center gap-1', n === 0 && 'opacity-45')}>
            {gems.includes(g) ? <Gem good={g} size={8} /> : <GoodIcon good={g} size={12} />}
            {cols !== 6 && <span className={cx('min-w-0 flex-1 truncate text-[11px]', gems.includes(g) && 'font-semibold')}>{SHORT[g]}</span>}
            <Dots good={g} n={n} size={cols === 6 ? 4 : 6} />
          </span>
        );
      })}
    </div>
  );
}

/** "Best for Energy · Rare earth 3": the plot in one line. */
export function bestLine(ground: Ground): string {
  const best = bestOf(ground);
  const gems = gemsIn(ground).filter((g) => g !== best);
  return [`best for ${GOOD_NAME[best]}`, ...gems.map((g) => `${GOOD_NAME[g]} ${groundDots(g, ground[g])}`)].join(' · ');
}

/** The drone's report, in the rail (variant A): each scanned plot, its land, every good and the best of it. */
export function ScanReport({ tiles }: { tiles: TileView[] }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-control border border-holo bg-panel p-2" data-testid="scan-report">
      <span className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold">Drone report</span>
        <OnlyYou />
      </span>
      {tiles.map((t) => (
        <div key={`${t.x},${t.y}`} className="flex flex-col gap-1 border-t border-holo-faint pt-1.5" data-testid={`report-${t.x}-${t.y}`}>
          <b className="text-xs font-semibold">
            Plot {plotName(t.x, t.y)} · {TERRAIN_NAME[t.terrain]}
          </b>
          <span className="text-[11px] font-semibold leading-tight text-holo">{bestLine(t.ground!)}</span>
          <GoodDots ground={t.ground!} />
        </div>
      ))}
    </section>
  );
}

export function OnlyYou() {
  return <span className="rounded-chip bg-holo-soft px-1.5 font-mono text-[10px] font-bold text-holo">ONLY YOU</span>;
}

const OUTFIT_WORD: Record<string, string> = { ...GOOD_NAME, greenBelt: 'Green belt' };

/** One row of My plots: where, what land, what stands on it, then its goods; a plot not analysed says how to find out. */
export function PlotRow({ t, selected = false, onPick, dense = false }: { t: TileView; selected?: boolean; onPick?: () => void; dense?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cx('flex w-full flex-col gap-1 rounded-control border px-2 py-1.5 text-left', selected ? 'border-holo bg-holo-soft' : 'border-holo-faint bg-panel')}
      data-testid={`plot-row-${t.x}-${t.y}`}
    >
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <b className="shrink-0 font-semibold">
          {plotName(t.x, t.y)} · {TERRAIN_NAME[t.terrain]}
        </b>
        <span className="truncate text-[11px] text-ink-3">{t.outfit ? `${OUTFIT_WORD[t.outfit]} MULE` : 'no MULE yet'}</span>
      </span>
      {t.ground ? (
        <GoodDots ground={t.ground} cols={dense ? 6 : 3} />
      ) : (
        <span className="text-[11px] leading-snug text-warn" data-testid="not-analysed">
          Not analysed: walk to it in development and press Analyse.
        </span>
      )}
    </button>
  );
}

/** What Analyse found, over the map beside the plot for a few seconds, any plot: words, not just a pip. */
export function AnalyseCard({ t, style }: { t: TileView; style?: CSSProperties }) {
  return (
    <div className="pointer-events-auto absolute z-30 flex w-[236px] flex-col gap-1 rounded-panel border-2 border-holo bg-panel/95 px-2.5 py-2 shadow-map animate-[show-card-in_0.25s_ease-out]" style={style} data-testid="analyse-card">
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-semibold">
          {plotName(t.x, t.y)} · {TERRAIN_NAME[t.terrain]} <span className="text-ok">analysed</span>
        </span>
        <OnlyYou />
      </span>
      <span className="text-[11px] font-semibold text-holo">{bestLine(t.ground!)}</span>
      <GoodDots ground={t.ground!} />
    </div>
  );
}

/**
 * A gem on the map: about 40% of the plot, like the owner's tab, so it scales with the map (WS4's read, 5 Nov). Two on
 * an owned plot are 30% each, so the pair still fits right of the tab (54% + 30% + 15% = 99%).
 */
function MapGem({ good, nth, share }: { good: RawGood; nth: number; share: number }) {
  return (
    <span
      className="relative grid aspect-square shrink-0 place-items-center rounded-full shadow-chip ring-1 ring-white/80"
      style={{ width: `${share}%`, background: `var(--color-g-${good})`, marginLeft: nth > 0 ? `-${share / 2}%` : 0, zIndex: 2 - nth }}
      title={`${GOOD_NAME[good]} here`}
      data-testid={`gem-${good}`}
    >
      <GoodIcon good={good} color="white" className="h-[62%] w-[62%]" />
    </span>
  );
}

/**
 * PROPOSED (WS4's named edit in HoloMap's marks): on the map of the player who did the geology, a known plot shows its
 * best good as 0–3 dots (today 0–4), and a gem when it holds Crystite or Rare earth: top-left on a free plot, just right
 * of the owner's tab on an owned one (the tab is 46% wide at 4%), two gems overlapping by half. With a MULE on the plot
 * the gem stays and the dots hide, as HoloMap hides its pips under an installed good. Laid over HoloMap here
 * (hideGround) on the same grid; in the build it is HoloMap's own mark.
 */
export function MapMarks({ tiles, width, height }: { tiles: TileView[]; width: number; height: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${height}, minmax(0, 1fr))` }} data-testid="map-marks">
      {tiles.map((t) => {
        if (!t.ground) return <span key={`${t.x},${t.y}`} />;
        const gems = t.ground ? gemsIn(t.ground) : [];
        const best = t.ground ? bestOf(t.ground) : null;
        return (
          <span key={`${t.x},${t.y}`} className="relative" style={{ gridColumn: t.x + 1, gridRow: t.y + 1 }}>
            {gems.length > 0 && (
              <span className={cx('absolute top-[4%] flex w-full', t.owner ? 'left-[54%]' : 'left-[4%]')} data-testid={`map-gem-${t.x}-${t.y}`}>
                {gems.map((g, i) => (
                  <MapGem key={g} good={g} nth={i} share={t.owner && gems.length > 1 ? 30 : 40} />
                ))}
              </span>
            )}
            {best && !t.outfit && (
              <span className="absolute inset-x-0 bottom-[8%] flex justify-center">
                <span className="flex items-center gap-0.5 rounded-chip bg-panel/85 px-1 py-px">
                  <GoodIcon good={best} size={9} />
                  <Dots good={best} n={groundDots(best, t.ground![best])} size={4} />
                </span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
