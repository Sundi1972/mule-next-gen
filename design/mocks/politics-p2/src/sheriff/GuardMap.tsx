import type { MuleView } from '@mule/protocol';
import { Button, HoloMap, type MapTile } from '@mule/ui';
import { useState } from 'react';
import { mapTiles } from '../../../../../apps/web/src/game/derive';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { Who } from '../../../../../apps/web/src/phone/hub/politics/parts';
import type { SheriffState } from '../fixture';
import { GuardGlyph } from './parts';

/**
 * P8, ruled by the PM 8 Nov: one map, Overview's. The Sheriff's "Post a guard on the map" switches to it in Guard mode,
 * under a "Guarding · back to Sheriff" bar. A tap on any player's plot posts or lifts a guard; the marks show on the
 * Sheriff's map only. Sending is the whole list (intent `guard {tiles}`), on "Done".
 *
 * DS-GAP: HoloMap has no guard mark (its flags are survey, sabotage, sale). Drawn here as an overlay at the plot's
 * place; the build adds `flag: 'guard'` (or a `marks` prop) to HoloMap so it sits with the other flags.
 */
export function GuardMap({ view, start, onBack }: { view: MuleView; start: SheriffState; onBack(guards: number[]): void }) {
  const [guards, setGuards] = useState(start.guards);
  const [hint, setHint] = useState<string | null>(null);
  const tiles = mapTiles(view);
  const tap = (t: MapTile) => {
    const i = t.y * view.width + t.x;
    if (guards.includes(i)) return setGuards(guards.filter((g) => g !== i)), setHint(null);
    if (t.owner === null) return setHint('Guards stand on players’ plots.');
    if (guards.length >= start.max) return setHint(`All ${start.max} guards are out. Tap a guarded plot to lift one.`);
    setGuards([...guards, i]);
    setHint(null);
  };
  return (
    <div className="flex h-full flex-col gap-1.5" data-testid="guard-map">
      <div className="flex items-center gap-2 rounded-control border border-holo bg-holo-soft px-2 py-1" data-testid="guard-bar">
        <GuardGlyph size={14} />
        <span className="flex-1 text-sm font-semibold" data-testid="guard-bar-words">
          Guarding · <span data-num className="font-mono">{guards.length}</span> of {start.max}
        </span>
        <OnlyYou />
        <Button size="md" variant="holo" className="shrink-0 px-3" onClick={() => onBack(guards)} data-testid="guard-back">
          Done · back to Sheriff
        </Button>
      </div>
      <div className="relative min-h-0 flex-1" data-testid="guard-map-board">
        <div className="relative mx-auto h-full" style={{ aspectRatio: `${view.width} / ${view.height}`, maxWidth: '100%' }}>
          <HoloMap width={view.width} height={view.height} tiles={tiles} onTile={tap} density="phone" className="h-full w-full" />
          {guards.map((i) => {
            const x = i % view.width;
            const y = Math.floor(i / view.width);
            return (
              <span key={i} className="pointer-events-none absolute z-10 grid place-items-center" style={{ left: `${(x / view.width) * 100}%`, top: `${(y / view.height) * 100}%`, width: `${100 / view.width}%`, height: `${100 / view.height}%` }} data-testid={`guard-mark-${x}-${y}`}>
                {/* DS-GAP: guard mark; see the component note. */}
                <span className="grid size-5 place-items-center rounded-full border-2 border-holo bg-void shadow-glow">
                  <GuardGlyph size={12} />
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <p className="min-h-4 text-[11px] text-ink-2" role="status" data-testid="guard-hint">
        {hint ?? 'Tap a plot to post a guard there this month. A power cut on a guarded plot fails, and the saboteur is caught.'}
      </p>
      <GuardedList view={view} guards={guards} />
    </div>
  );
}

function GuardedList({ view, guards }: { view: MuleView; guards: number[] }) {
  if (guards.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" data-testid="guard-map-list">
      {guards.map((i) => {
        const t = view.tiles[i]!;
        return (
          <li key={i} className="flex items-center gap-1 rounded-chip border border-holo-line bg-panel px-1.5 py-0.5 text-xs">
            <GuardGlyph />
            {t.owner && <Who view={view} id={t.owner} size={12} />}
            <span className="font-mono text-ink-3">({t.x + 1}, {t.y + 1})</span>
          </li>
        );
      })}
    </ul>
  );
}
