import { cx } from '@mule/ui';
import { EdgePointer } from './GlintLayer';
import { live, needsMule } from './scramble';
import { HALL, ROOMS, pubPayout, type Colonist, type Tunables, type World } from './sim';

/** Who is racing for the corral right now: everyone who needed a MULE when it began and still has none. */
export const stillNeeding = (w: World) => (live(w) ? w.scramble!.needers.filter((id) => !w.colonists.find((c) => c.id === id)!.mule && !w.colonists.find((c) => c.id === id)!.done) : []);

/** The corral during the scramble, on every view of the hall: it pulses, and says how many are left. */
export function ScrambleCorral({ world }: { world: World }) {
  if (!live(world)) return null;
  const r = ROOMS.corral;
  return (
    <span
      className="pointer-events-none absolute z-[6] rounded-panel border-[3px] border-alert shadow-glow-alert animate-[store-beckon_1s_ease-in-out_infinite]"
      style={{ left: `${r.x0}%`, top: `${r.y0}%`, width: `${r.x1 - r.x0}%`, height: `${r.y1 - r.y0}%` }}
      data-testid="scramble-corral"
      data-left={world.storeMules}
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-alert px-2 font-mono text-xs font-bold leading-5 text-white shadow-chip">{world.storeMules} LEFT</span>
    </span>
  );
}

/** The TV's lines: from everyone still needing a MULE to the store on the map, and to the corral in the hall. */
export function ScrambleLines({ world, space }: { world: World; space: 'map' | 'hall' }) {
  const ids = stillNeeding(world);
  if (ids.length === 0) return null;
  const W = space === 'map' ? world.width : HALL.w;
  const H = space === 'map' ? world.height : HALL.h;
  const r = ROOMS.corral;
  const to = space === 'map' ? { x: world.store.x + 0.5, y: world.store.y + 0.5 } : { x: (((r.x0 + r.x1) / 2) * HALL.w) / 100, y: (((r.y0 + r.y1) / 2) * HALL.h) / 100 };
  return (
    <svg className="pointer-events-none absolute inset-0 z-[6] h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden data-testid={`scramble-lines-${space}`}>
      {world.colonists
        .filter((c) => ids.includes(c.id) && c.space === space)
        .map((c) => (
          <line key={c.id} x1={c.x} y1={c.y} x2={to.x} y2={to.y} stroke="var(--color-alert)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" opacity={0.85} data-who={c.id} />
        ))}
    </svg>
  );
}

/** Variant A: the store off-camera while you still need a MULE: "STORE · 4 tiles W · 2 left". */
export function ScramblePointer({ world, me, cell, off, width, height }: { world: World; me: Colonist; cell: number; off: { x: number; y: number }; width: number; height: number }) {
  if (!live(world) || me.space !== 'map' || me.mule || me.done) return null;
  return (
    <EdgePointer
      target={{ x: world.store.x + 0.5, y: world.store.y + 0.5 }}
      me={me}
      cell={cell}
      off={off}
      width={width}
      height={height}
      label={`STORE · {tiles} tiles {dir} · ${world.storeMules} left`}
      color="var(--color-alert)"
      testid="store-pointer"
    />
  );
}

/**
 * Your screen's banner: the call while it runs; then how it ended for you, in plain words. Left out is no MULE this
 * turn, nothing worse: the pub pays for the time left.
 */
export function ScrambleBanner({ world, me, tun }: { world: World; me: Colonist; tun: Tunables }) {
  const s = world.scramble;
  if (!s) return null;
  const mine = s.got.includes(me.id);
  const n = world.storeMules;
  let text: string;
  let tone: 'alert' | 'ok' | 'warn';
  if (!s.over) {
    if (mine) [text, tone] = [`You got one! ${n} left for the others`, 'ok'];
    else if (s.needers.includes(me.id) && needsMule(world, me, tun)) [text, tone] = [`${n} MULE${n === 1 ? '' : 's'} left! Race to the corral`, 'alert'];
    else [text, tone] = [`${n} MULE${n === 1 ? '' : 's'} left: the others race for them`, 'warn'];
  } else if (mine) [text, tone] = ['You got one in the scramble', 'ok'];
  else if (s.leftOut.includes(me.id)) [text, tone] = [`The corral is empty: no MULE for you this turn. The pub pays +${pubPayout(world, tun)} cr now, less the longer you wait.`, 'warn'];
  else if (s.over === 'empty') [text, tone] = ['The corral is empty', 'warn'];
  else return null;
  return (
    <span
      className={cx(
        'pointer-events-none absolute inset-x-2 bottom-2 z-20 rounded-chip border-2 bg-panel/95 px-2 py-1 text-center font-display text-sm font-bold leading-tight shadow-chip',
        tone === 'alert' ? 'border-alert text-alert' : tone === 'ok' ? 'border-ok text-ok' : 'border-warn text-warn',
      )}
      data-testid="scramble-banner"
      data-tone={tone}
    >
      {text}
    </span>
  );
}
