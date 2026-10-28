import { cx, SLOT_COLOR } from '@mule/ui';
import { ROOMS, type Colonist, type Tunables, type World } from './sim';
import { guideOf } from './guide';

/**
 * The phone's "go here next" ring (A-10): a pulsing ring on the store, your plot or your bolted MULE on the map, and
 * on the room or door inside the store, with a short label. Only on your own phone; the TV is everyone's.
 */
export function GuideOnMap({ world, me, tun }: { world: World; me: Colonist; tun: Tunables }) {
  const g = guideOf(world, me, tun);
  if (!g || g.space !== 'map' || me.space !== 'map') return null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  // A tile's ring sits on the tile; a loose MULE's is centred on the MULE.
  const x0 = g.what === 'mule' ? g.at.x - 0.6 : g.at.x;
  const y0 = g.what === 'mule' ? g.at.y - 0.8 : g.at.y;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-[6] rounded-panel border-[3px] border-holo shadow-glow animate-[store-beckon_1.6s_ease-in-out_infinite]"
      style={{ left: pct(x0, world.width), top: pct(y0, world.height), width: pct(g.what === 'mule' ? 1.2 : 1, world.width), height: pct(1, world.height) }}
      data-testid="guide-map"
      data-what={g.what}
      data-x={g.at.x}
      data-y={g.at.y}
    >
      {/* On the top row the label hangs below the ring, inside the map. */}
      <span
        className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow', y0 < 0.5 ? 'top-full mt-0.5' : 'bottom-full mb-0.5')}
        data-testid="guide-label"
      >
        {g.label}
      </span>
    </span>
  );
}

export function GuideInHall({ world, me, tun, lit }: { world: World; me: Colonist; tun: Tunables; lit: string | null }) {
  const g = guideOf(world, me, tun);
  if (!g || g.space !== 'hall' || me.space !== 'hall') return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[6]" data-testid="guide-hall" data-rooms={g.rooms.join(' ')}>
      {g.rooms
        // The room you stand in is already lit by the button's own glow.
        .filter((r) => r !== lit)
        .map((r) => {
          const b = ROOMS[r];
          return (
            <span
              key={r}
              className="absolute rounded-panel border-2 border-dashed border-holo animate-[store-beckon_1.6s_ease-in-out_infinite]"
              style={{ left: `${b.x0}%`, top: `${b.y0}%`, width: `${b.x1 - b.x0}%`, height: `${b.y1 - b.y0}%` }}
              data-testid={`guide-room-${r}`}
            >
              {/* The corral's and the pub's captions sit at their foot, so their label goes near the top, below the
                  scramble's count badge. */}
              <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow', b.y0 > 50 ? 'top-6' : 'bottom-1')}>{g.label}</span>
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
