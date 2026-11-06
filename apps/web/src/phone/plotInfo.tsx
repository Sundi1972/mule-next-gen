import type { Ground } from '@mule/engine';
import type { MuleView, TileView } from '@mule/protocol';
import { bestOf, cx, dotsOf, gemsIn, GOOD_NAME, GoodIcon, TERRAIN_NAME, type RawGood } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { plotName, tileAt } from '../game/derive';
import { OUTFIT_WORD } from './arcade/plots';
import { OnlyYou } from './hub/OnlyYou';

/* What a plot's ground shows on the phone: each raw good as 0–3 dots, the gem, and the drone's report. */

const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const SHORT: Record<RawGood, string> = { food: 'Food', water: 'Water', energy: 'Energy', smithore: 'Ore', crystite: 'Crystite', rareEarth: 'Rare earth' };

/** How long the rail says "Scanning…" after this page's Scan, before the report. A screen's pause, not a rule. */
export const SCANNING_MS = 1_000;

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

/**
 * Every raw good of one plot, 0–3 dots each, in two or three labelled columns, or six in one row by icon alone (the
 * compact report); Crystite and Rare earth carry their gem when found.
 */
export function GoodDots({ ground, cols = 2 }: { ground: Ground; cols?: 2 | 3 | 6 }) {
  const dots = dotsOf(ground);
  const gems = gemsIn(dots);
  const row = cols === 6;
  return (
    <div className={cx('grid gap-y-1', cols === 2 ? 'grid-cols-2 gap-x-3' : cols === 3 ? 'grid-cols-3 gap-x-3' : 'grid-cols-6 gap-x-1')} data-testid="good-dots">
      {RAW.map((g) => {
        const n = dots[g];
        return (
          <span key={g} className={cx('flex min-w-0 items-center', row ? 'gap-0.5' : 'gap-1', n === 0 && 'opacity-45')}>
            <span className="flex shrink-0">{gems.includes(g) ? <Gem good={g} size={row ? 6 : 8} /> : <GoodIcon good={g} size={row ? 11 : 12} />}</span>
            {!row && <span className={cx('min-w-0 flex-1 truncate text-[11px]', gems.includes(g) && 'font-semibold')}>{SHORT[g]}</span>}
            <span className="flex shrink-0">
              <Dots good={g} n={n} size={row ? 4 : 6} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** "best for Energy", or "nothing worth working" when even its best good draws no dot. */
export function bestWords(dots: Record<RawGood, number>): string {
  const best = bestOf(dots);
  return dots[best] > 0 ? `best for ${GOOD_NAME[best]}` : 'nothing worth working';
}

/** "best for Energy · Rare earth 3": the plot in one line. */
export function bestLine(ground: Ground): string {
  const dots = dotsOf(ground);
  const best = bestOf(dots);
  const gems = gemsIn(dots).filter((g) => g !== best);
  return [bestWords(dots), ...gems.map((g) => `${GOOD_NAME[g]} ${dots[g]}`)].join(' · ');
}

/** What closes the Drone report: the month of the next drone, or that the game has none left. */
export function nextDroneWords({ month, maxMonths }: Pick<MuleView, 'month' | 'maxMonths'>): string {
  return month < maxMonths ? `Next drone: month ${month + 1}.` : 'No more drones this game.';
}

/**
 * The drone's report, in the rail, compact so both plots show without a scroll on a phone on its side: per plot one
 * line (where, what land, best for), then its six goods as icons with 0–3 dots in one row. `next` closes it.
 */
export function ScanReport({ tiles, next }: { tiles: TileView[]; next: string }) {
  const ref = useKeptInView<HTMLElement>();
  return (
    <section ref={ref} className="flex flex-col gap-1 rounded-control border border-holo bg-panel px-2 py-1.5" data-testid="scan-report">
      <span className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold">Drone report</span>
        <OnlyYou />
      </span>
      {tiles.map((t) => (
        <div key={`${t.x},${t.y}`} className="flex flex-col gap-0.5 border-t border-holo-faint pt-1" data-testid={`report-${t.x}-${t.y}`}>
          <span className="truncate text-xs leading-tight">
            <b className="font-semibold">
              {plotName(t.x, t.y)} · {TERRAIN_NAME[t.terrain]}
            </b>{' '}
            <span className="font-semibold text-holo">· {bestWords(dotsOf(t.ground!))}</span>
          </span>
          <GoodDots ground={t.ground!} cols={6} />
        </div>
      ))}
      <span className="border-t border-holo-faint pt-1 text-[11px] leading-tight text-ink-3" data-testid="drone-used">
        {next}
      </span>
    </section>
  );
}

/**
 * Scrolls an element wholly into its rail's view when it appears and when the window changes width (a turn of the
 * phone): the rail can hold notices above it (a strike alert, the Now card opened) that would push it below the fold.
 * Nothing else moves it: not a footer changing size (a player getting ready), so a player who scrolled up to read a
 * notice stays there, and not a phone keyboard, which shrinks only the height, so a chat line being typed stays put.
 */
function useKeptInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.scrollIntoView) return;
    let width = window.innerWidth;
    const show = () => {
      el.scrollIntoView({ block: 'nearest' });
    };
    const turned = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      show();
    };
    show();
    window.addEventListener('resize', turned);
    return () => window.removeEventListener('resize', turned);
  }, []);
  return ref;
}

/** The plots `meId` owns in the view, in the map's order: what My plots lists. */
export function myPlots(view: Pick<MuleView, 'tiles'>, meId: string): TileView[] {
  return view.tiles.filter((t) => t.owner === meId);
}

/**
 * One row of My plots: where, what land, what stands on it, then its goods; a plot nobody analysed says how to find
 * out (its ground is unknown, never 0).
 */
export function PlotRow({ t, selected = false, onPick, dense = false }: { t: TileView; selected?: boolean; onPick?: () => void; dense?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cx('flex w-full flex-col gap-1 rounded-control border px-2 py-1.5 text-left', selected ? 'border-holo bg-holo-soft' : 'border-holo-faint bg-panel')}
      data-testid={`plot-row-${t.x}-${t.y}`}
    >
      <span className="flex w-full items-baseline justify-between gap-2 text-xs">
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

/**
 * This seat's drone report, read from the view alone: the plots in its droneOrder, once the view holds every one's
 * ground. Null before the drone is used, for the TV and other seats, and while a plot's ground is still to come.
 */
export function droneReport(view: MuleView): TileView[] | null {
  const order = view.me?.droneOrder ?? [];
  if (order.length === 0) return null;
  const tiles = order.map((p) => tileAt(view, p.x, p.y));
  return tiles.every((t): t is TileView => !!t?.ground) ? tiles : null;
}

/**
 * True for SCANNING_MS after the drone goes out while this component watches. A component that mounts with the drone
 * already out (a rejoin, or the tool opened later) never scans: it shows the report at once.
 */
export function useScanning(ordered: boolean): boolean {
  const [was, setWas] = useState(ordered);
  const [scanning, setScanning] = useState(false);
  if (ordered !== was) {
    setWas(ordered);
    setScanning(ordered);
  }
  useEffect(() => {
    if (!scanning) return;
    const t = setTimeout(() => setScanning(false), SCANNING_MS);
    return () => clearTimeout(t);
  }, [scanning]);
  return scanning;
}
