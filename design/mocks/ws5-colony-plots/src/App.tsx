import { Button, cx, HoloMap } from '@mule/ui';
import { useMemo, useState } from 'react';
import { HEIGHT, objectsFor, OBJECT_PLOTS, tiles, WIDTH, type Stages } from './fixture';
import { ObjectDisc, ObjectGround, objectLabel, OBJECT_NAME, type PlotObject, type PlotStage } from './objects';

type Variant = 'A' | 'B';
const STAGES: PlotStage[] = ['commissioned', 'building', 'standing', 'closed', 'damaged'];

/**
 * The map with the colony's objects on their plots. In the mock the objects ride a grid laid over HoloMap with the same
 * columns and rows; C33's build draws them inside HoloMap's own plot (MapTile.object), in the installed good's slot.
 */
function MapWithObjects({ objects, variant, density, className }: { objects: Map<number, PlotObject>; variant: Variant; density: 'tv' | 'phone'; className?: string }) {
  const map = useMemo(tiles, []);
  const tv = density === 'tv';
  return (
    <div className={cx('relative', className)} data-testid={`map-${density}`}>
      <HoloMap width={WIDTH} height={HEIGHT} tiles={map} density={density} />
      <div
        className="pointer-events-none absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${WIDTH}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${HEIGHT}, minmax(0, 1fr))` }}
      >
        {map.map((t) => {
          const object = objects.get(t.y * WIDTH + t.x);
          return (
            <span key={`${t.x},${t.y}`} className="relative flex items-center justify-center" aria-label={object ? objectLabel(object) : undefined} data-testid={object ? `object-plot-${t.x}-${t.y}` : undefined}>
              {object && (variant === 'A' ? <ObjectDisc object={object} tv={tv} /> : <ObjectGround object={object} tv={tv} />)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function StagePicker({ kind, stage, onStage }: { kind: keyof typeof OBJECT_PLOTS; stage: PlotStage; onStage(s: PlotStage): void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`stage-picker-${kind}`}>
      <span className="label-caps w-36">{OBJECT_NAME[kind]}</span>
      {STAGES.map((s) => (
        <Button key={s} size="md" variant={s === stage ? 'holo' : 'outline'} onClick={() => onStage(s)} data-testid={`stage-${kind}-${s}`}>
          {s}
        </Button>
      ))}
    </div>
  );
}

export default function App() {
  const [variant, setVariant] = useState<Variant>('A');
  const [stages, setStages] = useState<Stages>({ park: 'standing', stadium: 'building', spaceport: 'damaged' });
  const objects = useMemo(() => objectsFor(stages), [stages]);
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-void p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2" data-testid="decisions">
        <h1 className="font-display text-2xl font-bold">C33 · the colony's objects on their plots (WS5)</h1>
        <ul className="list-disc pl-5 text-sm text-ink-2">
          <li>A park, stadium or spaceport upgrade is drawn on its plot on every map: the TV's and each phone's, from the same map tiles.</li>
          <li>The glyphs are WS8's five (design/mocks/ws8-colony, b0f52001), verbatim.</li>
          <li>The stage colour: a reserved site holo (dashed, the glyph faint), building warn (dashed), standing holo (the colony's colour: ok's green reads as a green player's plot), closed and damaged alert, faded. Building, closed and damaged match the build site's list.</li>
          <li>A corner chip in the map's flag style says what the colours can't: SITE, a site's months ("1/3"), SHUT, HIT.</li>
          <li>The plot is the colony's (owner 'colony', set by C30's site bid): no player's border or tab, no MULE (it makes nothing); it keeps its special badge.</li>
          <li>Screen readers hear the build site's words: "Stadium, building: 1 of 3 months".</li>
        </ul>
      </header>

      <section className="flex flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4" data-testid="controls">
        <div className="flex items-center gap-2" data-testid="variant-picker">
          <span className="label-caps w-36">Variant</span>
          <Button size="md" variant={variant === 'A' ? 'holo' : 'outline'} onClick={() => setVariant('A')} data-testid="variant-A">
            A · the object's disc
          </Button>
          <Button size="md" variant={variant === 'B' ? 'holo' : 'outline'} onClick={() => setVariant('B')} data-testid="variant-B">
            B · the colony's ground
          </Button>
        </div>
        {(Object.keys(OBJECT_PLOTS) as (keyof typeof OBJECT_PLOTS)[]).map((kind) => (
          <StagePicker key={kind} kind={kind} stage={stages[kind]} onStage={(s) => setStages((now) => ({ ...now, [kind]: s }))} />
        ))}
      </section>

      <section className="flex flex-col gap-2" data-testid="tv">
        <h2 className="label-caps">The TV map (density tv)</h2>
        <MapWithObjects objects={objects} variant={variant} density="tv" className="w-full max-w-[1100px]" />
      </section>

      <section className="flex flex-col gap-2" data-testid="phone">
        <h2 className="label-caps">A phone's map (density phone), at a landscape phone's width</h2>
        <MapWithObjects objects={objects} variant={variant} density="phone" className="w-[420px]" />
      </section>
    </main>
  );
}
