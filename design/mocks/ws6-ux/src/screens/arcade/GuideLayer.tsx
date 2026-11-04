import { cx, SLOT_COLOR } from '@mule/ui';
import { suits } from '../audit/dev/fixture';
import { guideOf, plotName } from './guide';
import { ROOMS, type Colonist, type HallRoom, type Tunables, type World } from './sim';

/** The six shopfronts, along the hall's top row: the raw goods a plot's ground can suit. */
const SHOPFRONTS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const;

/**
 * The phone's "go here next" ring (A-10, RULE-9): a pulsing ring on the store, your plot, the plot to analyse or your
 * bolted MULE on the map, and on the rooms or doors inside the store, each with a short label. The first spot is the
 * ring (testid guide-map); a second, thinner, is the other thing you can do (V-7: the pub). Only on your own phone.
 */
export function GuideOnMap({ world, me, tun }: { world: World; me: Colonist; tun: Tunables }) {
  const g = guideOf(world, me, tun);
  if (!g || g.space !== 'map' || me.space !== 'map') return null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <>
      {g.spots.map((s, i) => {
        // A tile's ring sits on the tile; a loose MULE's is centred on the MULE.
        const x0 = s.what === 'mule' ? s.at.x - 0.6 : s.at.x;
        const y0 = s.what === 'mule' ? s.at.y - 0.8 : s.at.y;
        const first = i === 0;
        // Standing on it, the ring is enough: its label would only say to walk where you are.
        const here = Math.floor(me.x) === Math.floor(s.at.x) && Math.floor(me.y) === Math.floor(s.at.y);
        return (
          <span
            key={`${s.what}-${s.at.x}-${s.at.y}`}
            aria-hidden
            className={cx('pointer-events-none absolute z-[6] rounded-panel border-holo', first ? 'border-[3px] shadow-glow animate-[store-beckon_1.6s_ease-in-out_infinite]' : 'border-2 border-dashed opacity-80')}
            style={{ left: pct(x0, world.width), top: pct(y0, world.height), width: pct(s.what === 'mule' ? 1.2 : 1, world.width), height: pct(1, world.height) }}
            data-testid={first ? 'guide-map' : 'guide-map-alt'}
            data-what={s.what}
            data-x={s.at.x}
            data-y={s.at.y}
          >
            {/* On the top row the label hangs below the ring, inside the map. */}
            {!here && <span
              className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 font-mono text-[10px] font-bold leading-4 shadow-glow', first ? 'bg-holo text-on-holo' : 'bg-panel text-holo', y0 < 0.5 ? 'top-full mt-0.5' : 'bottom-full mb-0.5')}
              data-testid={first ? 'guide-label' : 'guide-label-alt'}
            >
              {s.label}
            </span>}
          </span>
        );
      })}
    </>
  );
}

export function GuideInHall({ world, me, tun, lit }: { world: World; me: Colonist; tun: Tunables; lit: string | null }) {
  const g = guideOf(world, me, tun);
  if (!g || g.space !== 'hall' || me.space !== 'hall') return null;
  const ring = (r: HallRoom, dim: boolean) => {
    const b = ROOMS[r];
    return (
      <span
        key={r}
        className={cx('absolute rounded-panel border-2 border-dashed', dim ? 'border-ink-3 opacity-60' : 'border-holo animate-[store-beckon_1.6s_ease-in-out_infinite]')}
        style={{ left: `${b.x0}%`, top: `${b.y0}%`, width: `${b.x1 - b.x0}%`, height: `${b.y1 - b.y0}%` }}
        data-testid={dim ? `guide-dim-${r}` : `guide-room-${r}`}
      >
        {/* The corral's and the pub's captions sit at their foot, so their label goes near the top, below the
            scramble's count badge. */}
        <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 font-mono text-[10px] font-bold leading-4', dim ? 'bg-panel text-ink-3' : 'bg-holo text-on-holo shadow-glow', b.y0 > 50 ? 'top-6' : 'bottom-1')}>
          {dim ? 'IT MAKES THIS' : (g.labels[r] ?? 'GO')}
        </span>
      </span>
    );
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" data-testid="guide-hall" data-rooms={g.rooms.join(' ')} data-dim={g.dim.join(' ')}>
      {/* The room you stand in is already lit by the button's own glow. */}
      {g.rooms.filter((r) => r !== lit).map((r) => ring(r, false))}
      {g.dim.map((r) => ring(r, true))}
    </div>
  );
}

/**
 * V-2 in the hall: under each outfitter, your plots that suit its good (from their analysis, else their land), dashed
 * where a MULE already stands, while you choose (an empty MULE, or one taken off a plot to re-outfit).
 */
export function PlotsByOutfitter({ world, me }: { world: World; me: Colonist }) {
  if (me.space !== 'hall' || !me.mule || (me.mule.good && !me.mule.taken)) return null;
  const mine = world.tiles.filter((t) => t.owner === me.id);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" data-testid="plots-by-outfitter">
      {SHOPFRONTS.map((good) => {
        const b = ROOMS[good];
        const fit = mine.filter((t) => suits(t).includes(good));
        return (
          <span key={good} className="absolute flex flex-wrap justify-center gap-0.5" style={{ left: `${b.x0}%`, width: `${b.x1 - b.x0}%`, top: `${b.y1 + 0.6}%` }} data-testid={`suits-${good}`} data-plots={fit.map((t) => `${t.x},${t.y}`).join(' ')}>
            {fit.length === 0 ? (
              <span className="rounded-chip bg-panel/85 px-1 font-mono text-[9px] leading-[13px] text-ink-3">none</span>
            ) : (
              fit.map((t) => (
                <span
                  key={`${t.x},${t.y}`}
                  className={cx('rounded-chip border bg-panel/90 px-1 font-mono text-[9px] font-bold leading-[13px]', t.outfit ? 'border-dashed border-ink-3 text-ink-3' : 'border-holo text-ink')}
                  data-testid={`suit-${good}-${t.x}-${t.y}`}
                  data-has-mule={!!t.outfit || undefined}
                >
                  {plotName(t)}
                  {t.outfit ? ' · MULE' : ''}
                </span>
              ))
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Your own plots, outlined once more in your colour on your own phone, so they stand out from the others' at 43 px. */
export function MyPlots({ world, me }: { world: World; me: Colonist }) {
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <>
      {world.tiles
        .filter((t) => t.owner === me.id)
        .map((t) => (
          <span
            key={`${t.x},${t.y}`}
            aria-hidden
            className="pointer-events-none absolute z-[5] rounded-[12%]"
            style={{ left: pct(t.x, world.width), top: pct(t.y, world.height), width: pct(1, world.width), height: pct(1, world.height), boxShadow: `inset 0 0 0 3px ${SLOT_COLOR[me.slot]}, 0 0 0 1px var(--color-table)` }}
            data-testid={`my-plot-${t.x}-${t.y}`}
          />
        ))}
    </>
  );
}

