import type { Ground } from '@mule/engine';
import type { MuleView, TileView } from '@mule/protocol';
import { bestOf, cx, dotsOf, gemsIn, GOOD_NAME, GoodIcon, TERRAIN_NAME, type RawGood } from '@mule/ui';
import { useEffect, useState } from 'react';
import { plotName, tileAt } from '../game/derive';

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

/** Every raw good of one plot, 0–3 dots each, in two columns; Crystite and Rare earth carry their gem when found. */
export function GoodDots({ ground, cols = 2 }: { ground: Ground; cols?: 2 | 3 | 6 }) {
  const dots = dotsOf(ground);
  const gems = gemsIn(dots);
  return (
    <div className={cx('grid gap-x-3 gap-y-1', cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-6 gap-x-1.5')} data-testid="good-dots">
      {RAW.map((g) => {
        const n = dots[g];
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

/** "best for Energy · Rare earth 3": the plot in one line. */
export function bestLine(ground: Ground): string {
  const dots = dotsOf(ground);
  const best = bestOf(dots);
  const gems = gemsIn(dots).filter((g) => g !== best);
  return [`best for ${GOOD_NAME[best]}`, ...gems.map((g) => `${GOOD_NAME[g]} ${dots[g]}`)].join(' · ');
}

/** The drone's report, in the rail: each scanned plot, its land, every good and the best of it. */
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
