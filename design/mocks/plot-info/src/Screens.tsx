import type { TileView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, HoloMap, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { gemsIn } from './proposed/dots';
import { useEffect, useState, type ReactNode } from 'react';
import { mapTiles } from '../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../apps/web/src/phone/Shell';
import { ANALYSE_AT, DRONE_PICKS, H, KNOWN, myPlots, tileOf, viewWith, W } from './plots';
import { AnalyseCard, GoodDots, MapMarks, OnlyYou, plotName, PlotRow, ScanReport, bestLine } from './proposed/PlotInfo';

/**
 * Graft targets: apps/web/src/phone/hub/tools.tsx (the drone's Scan and report; a new My plots tool beside Look) with
 * one tool line in hub/today.tsx; apps/web/src/phone/arcade/Develop.tsx and parts.tsx (the Plots chip and panel, the
 * Analyse card, the store's Your plots box with dots); packages/ui HoloMap (the 0–3 pip and the gem, WS4's named edit).
 */

export type Variant = 'A' | 'B';
type Pt = { x: number; y: number };
const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;

/** The map as the phone draws it, with the proposed marks over it. */
function Map({ tiles, view, selected = null, onTile, children }: { tiles: MapTile[]; view: TileView[]; selected?: Pt | null; onTile?: (t: MapTile) => void; children?: ReactNode }) {
  return (
    <MapFit width={W} height={H}>
      <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
        <HoloMap width={W} height={H} tiles={tiles} selected={selected} focusSlot={0} hideGround {...(onTile ? { onTile } : {})} className="absolute inset-0" />
        <MapMarks tiles={view} width={W} height={H} />
        {children}
      </div>
    </MapFit>
  );
}

// --- Planning ------------------------------------------------------------------------------------------------------

type Tool = 'look' | 'plots' | 'drone';
const TOOLS: { id: Tool; label: string; note?: string }[] = [
  { id: 'look', label: 'Look' },
  { id: 'plots', label: 'My plots', note: 'NEW' },
  { id: 'drone', label: 'Geo drone' },
];

/** Planning on the phone held sideways, as built: the tools, the map, the rail with Ready at its foot. */
function PlanningFrame({ tool, onTool, map, rail, footer }: { tool: Tool; onTool?: (t: Tool) => void; map: ReactNode; rail: ReactNode; footer?: ReactNode }) {
  return (
    <div className="h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
      <div className="flex h-full w-full bg-table text-ink">
        <nav className="flex w-[104px] shrink-0 flex-col gap-1.5 p-2" data-testid="tools">
          <span className="label-caps text-[10px]!">Month 5 · Plan</span>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTool?.(t.id)}
              className={cx('flex items-center justify-between rounded-control border px-2 py-2 text-left font-display text-xs font-semibold', tool === t.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint bg-panel')}
              data-testid={`tool-${t.id}`}
            >
              {t.label}
              {t.note && <span className="rounded-chip bg-ok px-1 font-mono text-[8px] text-on-holo">{t.note}</span>}
            </button>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col p-2">{map}</main>
        <aside className="flex w-[272px] shrink-0 flex-col gap-1.5 border-l border-holo-line bg-raised p-2" data-testid="rail">
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">{rail}</div>
          <div className="flex flex-col gap-1.5">
            {footer}
            <Button size="lg" className="w-full" data-testid="ready">
              I’m ready
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** The drone, live: tap up to two free plots, Scan, a second of scanning, then the report (A in the rail, B on the map). */
export function useScan() {
  const [picked, setPicked] = useState<Pt[]>(DRONE_PICKS);
  const [stage, setStage] = useState<'pick' | 'scanning' | 'report'>('pick');
  useEffect(() => {
    if (stage !== 'scanning') return;
    const t = setTimeout(() => setStage('report'), 1400);
    return () => clearTimeout(t);
  }, [stage]);
  return {
    picked,
    stage,
    toggle: (p: Pt) => stage === 'pick' && setPicked((now) => (now.some((q) => same(q, p)) ? now.filter((q) => !same(q, p)) : [...now, p].slice(-2))),
    scan: () => setStage('scanning'),
    again: () => {
      setStage('pick');
      setPicked(DRONE_PICKS);
    },
  };
}

export function PlanningScan({ variant, scan }: { variant: Variant; scan: ReturnType<typeof useScan> }) {
  const known = new Set(KNOWN);
  if (scan.stage === 'report') for (const p of scan.picked) known.add(`${p.x},${p.y}`);
  const view = viewWith(known);
  const tiles = mapTiles(view).map((t) => (scan.stage !== 'report' && scan.picked.some((p) => same(p, t)) ? { ...t, flag: 'survey' as const } : t));
  const scanned = scan.picked.map((p) => tileOf(view, p.x, p.y));
  const free = (t: MapTile) => t.owner === null && t.terrain !== 'store';
  return (
    <PlanningFrame
      tool="drone"
      map={
        <Map tiles={tiles} view={view.tiles} onTile={(t) => free(t) && scan.toggle(t)} >
          {variant === 'B' && scan.stage === 'report' && scanned.map((t) => <MapCallout key={`${t.x},${t.y}`} t={t} />)}
        </Map>
      }
      rail={
        scan.stage === 'report' ? (
          variant === 'A' ? (
            <ScanReport tiles={scanned} />
          ) : (
            <section className="flex flex-col gap-1 rounded-control border border-holo bg-panel p-2" data-testid="scan-summary">
              <span className="flex items-center justify-between">
                <span className="font-display text-sm font-semibold">Drone report</span>
                <OnlyYou />
              </span>
              {scanned.map((t) => (
                <span key={`${t.x},${t.y}`} className="text-xs">
                  <b className="font-semibold">Plot {plotName(t.x, t.y)}</b> · {bestLine(t.ground!)}
                </span>
              ))}
              <span className="text-[11px] text-ink-3">The full report sits beside each plot on the map.</span>
            </section>
          )
        ) : (
          <section className="flex flex-col gap-1 rounded-control border border-holo bg-panel p-2" data-testid="drone-panel">
            <span className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold">{scan.stage === 'scanning' ? 'Scanning…' : 'Tap up to 2 free plots'}</span>
              <OnlyYou />
            </span>
            <span className="text-[11px] leading-snug text-ink-2">
              {scan.stage === 'scanning'
                ? 'The drone reads the ground from orbit.'
                : 'The drone reads their ground from orbit, at once, for 60 cr. Only you see what it finds.'}
            </span>
            {scan.picked.map((p) => (
              <span key={`${p.x},${p.y}`} className="text-[11px]">
                <b className="font-semibold">Plot {plotName(p.x, p.y)}</b> · {TERRAIN_NAME[tileOf(view, p.x, p.y).terrain]}
              </span>
            ))}
          </section>
        )
      }
      footer={
        scan.stage === 'report' ? (
          <span className="flex items-center justify-between text-[11px] text-ink-3" data-testid="drone-used">
            One drone each planning: the next in month 6.
            <button type="button" className="font-mono text-holo underline" onClick={scan.again}>
              replay
            </button>
          </span>
        ) : (
          <Button size="md" className="w-full" disabled={scan.picked.length === 0 || scan.stage === 'scanning'} onClick={scan.scan} data-testid="scan">
            {scan.stage === 'scanning' ? 'Scanning…' : `Scan · ${scan.picked.length} of 2 plots · 60 cr`}
          </Button>
        )
      }
    />
  );
}

/** Variant B: a plot's report beside it on the map, pointing at it. */
function MapCallout({ t }: { t: TileView }) {
  const left = ((t.x + 1) / W) * 100;
  const top = (t.y / H) * 100;
  const flip = t.x > W / 2;
  return (
    <div
      className="absolute z-20 w-[150px] rounded-control border-2 border-holo bg-panel/95 p-1.5 shadow-map animate-[fade-in_0.3s_ease-out]"
      style={flip ? { right: `${100 - (t.x / W) * 100}%`, top: `${top}%` } : { left: `${left}%`, top: `${top}%` }}
      data-testid={`callout-${t.x}-${t.y}`}
    >
      <span className="block text-[11px] font-semibold">
        {plotName(t.x, t.y)} · <span className="text-holo">{bestLine(t.ground!).replace('best for ', '')}</span>
      </span>
      <GoodDots ground={t.ground!} cols={3} />
    </div>
  );
}

export function PlanningPlots() {
  const view = viewWith(KNOWN);
  const [sel, setSel] = useState<Pt | null>(null);
  const mine = myPlots(view);
  return (
    <PlanningFrame
      tool="plots"
      map={<Map tiles={mapTiles(view)} view={view.tiles} selected={sel} onTile={(t) => setSel(t.owner === 0 ? t : null)} />}
      rail={
        <>
          <span className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold">My plots · {mine.length}</span>
            <OnlyYou />
          </span>
          {mine.map((t) => (
            <PlotRow key={`${t.x},${t.y}`} t={t} selected={!!sel && same(sel, t)} onPick={() => setSel(t)} dense />
          ))}
        </>
      }
    />
  );
}

// --- Development: the walking screen --------------------------------------------------------------------------------

/** The walking screen as built: the map full, the status bar over it, the stick and the one button. */
function WalkFrame({ hud, button, children, map }: { hud?: ReactNode; button: string; children?: ReactNode; map: ReactNode }) {
  return (
    <div className="relative h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line bg-table shadow-map" data-testid="phone-frame">
      <div className="absolute inset-0 flex p-1">{map}</div>
      <div className="absolute left-3 right-3 top-2 z-20 flex items-center gap-3 rounded-panel border border-holo-faint bg-panel/90 px-3 py-1.5 text-sm shadow-chip" data-testid="status-bar">
        <b className="font-mono">940 cr</b>
        <span className="h-1.5 w-14 rounded-full bg-holo" />
        <b className="font-mono text-holo">41s</b>
        <span className="rounded-chip border border-holo-faint px-1.5 text-xs text-ink-2">No MULE</span>
        <span className="text-xs font-semibold text-ok">Pace 100%</span>
        <span className="flex-1" />
        {hud}
      </div>
      <div className="absolute bottom-3 left-3 z-20 grid size-[104px] place-items-center rounded-full border-2 border-holo/60 bg-panel/40" aria-hidden>
        <span className="size-11 rounded-full border-2 border-holo bg-panel" />
      </div>
      <div className="absolute bottom-3 right-3 z-20 grid h-[66px] w-[150px] place-items-center rounded-panel border-2 border-holo-faint bg-panel/90 font-display text-lg font-bold" data-testid="action-button">
        {button}
      </div>
      {children}
    </div>
  );
}

function PlotsChip({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx('rounded-chip border-2 px-2.5 py-0.5 font-display text-xs font-bold', open ? 'border-holo bg-holo text-on-holo' : 'border-holo bg-holo-soft text-holo')} data-testid="plots-chip">
      Plots {open ? '✕' : '▸'}
    </button>
  );
}

export function DevelopPlots() {
  const view = viewWith(KNOWN);
  const [open, setOpen] = useState(true);
  return (
    <WalkFrame
      hud={<PlotsChip open={open} onClick={() => setOpen((o) => !o)} />}
      button="TO THE STORE"
      map={<Map tiles={mapTiles(view)} view={view.tiles} />}
    >
      {open && (
        <aside className="absolute bottom-[86px] right-3 top-12 z-30 flex w-[300px] flex-col gap-1 overflow-y-auto rounded-panel border-2 border-holo bg-panel/95 p-2 shadow-map" data-testid="plots-panel">
          <span className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold">My plots · {myPlots(view).length}</span>
            <span className="text-[10px] text-ink-3">the clock keeps running</span>
          </span>
          {myPlots(view).map((t) => (
            <PlotRow key={`${t.x},${t.y}`} t={t} dense />
          ))}
        </aside>
      )}
    </WalkFrame>
  );
}

/** Analyse, live: the colonist on a free plot by the river presses Analyse; four seconds of assaying, then the card. */
export function useAnalyse() {
  const [stage, setStage] = useState<'ready' | 'assaying' | 'card' | 'gone'>('ready');
  useEffect(() => {
    if (stage === 'assaying') {
      const t = setTimeout(() => setStage('card'), 2500);
      return () => clearTimeout(t);
    }
    if (stage === 'card') {
      const t = setTimeout(() => setStage('gone'), 6000);
      return () => clearTimeout(t);
    }
  }, [stage]);
  return { stage, press: () => stage === 'ready' && setStage('assaying'), again: () => setStage('ready') };
}

export function DevelopAnalyse({ an }: { an: ReturnType<typeof useAnalyse> }) {
  const known = new Set(KNOWN);
  if (an.stage === 'card' || an.stage === 'gone') known.add(`${ANALYSE_AT.x},${ANALYSE_AT.y}`);
  const view = viewWith(known);
  const t = tileOf(view, ANALYSE_AT.x, ANALYSE_AT.y);
  const left = ((ANALYSE_AT.x + 1.2) / W) * 100;
  return (
    <WalkFrame
      button={an.stage === 'ready' ? 'ANALYSE' : an.stage === 'assaying' ? 'ASSAYING' : 'TO THE STORE'}
      map={
        <Map tiles={mapTiles(view)} view={view.tiles} selected={ANALYSE_AT}>
          {an.stage === 'card' && <AnalyseCard t={t} style={{ left: `${left}%`, top: `${(ANALYSE_AT.y / H) * 100 - 6}%` }} />}
        </Map>
      }
    >
      {an.stage === 'ready' && (
        <button type="button" onClick={an.press} className="absolute bottom-3 right-3 z-30 h-[66px] w-[150px] rounded-panel border-2 border-holo bg-holo font-display text-lg font-bold text-on-holo" data-testid="analyse">
          ANALYSE
        </button>
      )}
      {an.stage === 'assaying' && (
        <span className="absolute bottom-[86px] right-3 z-30 w-[150px]">
          <span className="block h-1.5 overflow-hidden rounded-full bg-raised">
            <span className="block h-full animate-[mock-grow_2.5s_linear] bg-holo" style={{ width: '100%' }} />
          </span>
        </span>
      )}
    </WalkFrame>
  );
}

/** In the store, an empty MULE in tow: today's "Your plots" box (words, at most 5) with the dots instead. */
export function StoreBox() {
  const view = viewWith(KNOWN);
  const mine = myPlots(view).sort((a, b) => Number(!!a.outfit) - Number(!!b.outfit));
  return (
    <div className="relative h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line bg-table shadow-map" data-testid="phone-frame">
      <div className="absolute inset-3 grid place-items-center rounded-panel border border-dashed border-holo-line text-ink-3">the store hall, as built: corral, outfitters, pub</div>
      <div className="absolute left-5 top-5 z-20 flex w-[288px] flex-col gap-1 rounded-control border border-holo-faint bg-panel/90 p-1.5" data-testid="my-plots-legend">
        <span className="label-caps text-[10px]!">Your plots</span>
        {mine.slice(0, 4).map((t) => (
          <span key={`${t.x},${t.y}`} className="flex items-center justify-between gap-2 text-[10px]">
            <b className={cx('shrink-0 font-semibold', t.outfit && 'text-ink-3')}>
              {plotName(t.x, t.y)} {t.outfit ? '· MULE' : ''}
            </b>
            {t.ground ? <GoodDots ground={t.ground} cols={6} /> : <span className="text-warn">analyse it</span>}
          </span>
        ))}
        <span className="text-[10px] text-ink-3">+{mine.length - 4} more · Plots ▸ shows all</span>
      </div>
    </div>
  );
}

/** The plots with a gem on this map, in words, from the fixture: "8·3 (Crystite)". */
function gemPlots(tiles: TileView[]): string {
  return tiles
    .filter((t) => t.ground && gemsIn(t.ground).length > 0)
    .map((t) => `${plotName(t.x, t.y)} (${gemsIn(t.ground!).map((g) => GOOD_NAME[g]).join(', ')}${t.owner === 'lena' ? ', yours' : ''})`)
    .join(', ');
}

/** The gem and the 0–3 pip, on Lena's planning map; the TV never shows either. */
export function GemMap() {
  const known = new Set([...KNOWN, '9,4', '8,1', '8,5']);
  const view = viewWith(known);
  return (
    <PlanningFrame
      tool="look"
      map={<Map tiles={mapTiles(view)} view={view.tiles} />}
      rail={
        <section className="flex flex-col gap-1.5 rounded-control border border-holo-faint bg-panel p-2 text-xs leading-snug" data-testid="gem-legend">
          <b className="font-display text-sm">On your map only</b>
          <span>
            A plot you've analysed shows its best good, 0–3 dots, on its lower edge (a plot with a MULE shows the MULE's good, as today).
          </span>
          <span>
            A <b>gem</b> at its top, left on a free plot and beside your mark on your own: it holds Crystite or Rare earth, whatever else it's best for. A plot with a MULE keeps its gem. Here:{' '}
            {gemPlots(view.tiles)}.
          </span>
          <span className="text-ink-3">The TV and the other phones never show either.</span>
        </section>
      }
    />
  );
}
