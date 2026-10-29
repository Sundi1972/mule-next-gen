import { cx, Mule } from '@mule/ui';
import type { Colonist, Tunables, World } from './sim';
import { ARENA, HIT_R, strikeTarget, type Wolf as WolfData, type WolfState } from './wolves';

type Density = 'phone' | 'tv' | 'wide';

/**
 * DS-GAP: @mule/ui has no wolf. Drawn here in the creatures' family (soft outline, one bright eye), from tokens only:
 * the MULE's shade for the coat, its metal for the belly, warn for the eye. A crouch before a lunge is the tell, an
 * alert outline makes it unmissable; an open wolf is ringed in holo. To move into packages/ui beside Creature.
 */
export function WolfGlyph({ size, state, facing }: { size: number; state: WolfState; facing: 'left' | 'right' }) {
  const coat = 'var(--color-mule-shade)';
  const belly = 'var(--color-mule-metal)';
  const edge = state === 'tell' ? 'var(--color-alert)' : 'var(--color-void)';
  const crouch = state === 'tell' ? 'translate(0 3) scale(1 0.85)' : state === 'lunge' ? 'scale(1.15 0.9)' : '';
  return (
    // A faint alert glow: a dark coat must read on dark forest, and a wolf is danger.
    <svg viewBox="0 0 32 24" width={size} height={(size * 24) / 32} aria-hidden style={{ overflow: 'visible', filter: 'drop-shadow(0 0 2px var(--color-alert)) drop-shadow(0 1px 1px var(--color-mark-edge))' }} className={cx(state === 'hurt' && 'opacity-60')}>
      <g transform={facing === 'left' ? 'translate(32 0) scale(-1 1)' : undefined}>
        <g transform={crouch} style={{ transformOrigin: '16px 20px' }}>
          <path d="M5 12 C1.5 10 1 6 3 4.5 C4.5 7.5 5.5 9.5 8 10.5Z" fill={coat} stroke={edge} strokeWidth={0.9} />
          {[8, 11, 18, 21].map((x) => (
            <rect key={x} x={x} y={15} width={2.2} height={7} rx={1} fill={coat} stroke={edge} strokeWidth={0.6} />
          ))}
          <ellipse cx={14.5} cy={12.5} rx={9} ry={5} fill={coat} stroke={edge} strokeWidth={state === 'tell' ? 1.6 : 0.9} />
          <ellipse cx={14.5} cy={15} rx={6} ry={1.8} fill={belly} opacity={0.45} />
          <path d="M21 8.5 L28 10.5 L31 13 L27.5 15 L21 15 Z" fill={coat} stroke={edge} strokeWidth={0.9} />
          <path d="M22 9 L23 3.5 L25.2 9 Z M25 9.5 L27.2 4.8 L28 10.4 Z" fill={coat} stroke={edge} strokeWidth={0.7} />
          <circle cx={26} cy={11.4} r={1.1} fill="var(--color-warn)" />
          {state === 'tell' && <path d="M27.5 14.4 L30.4 13.4" stroke="var(--color-eye-white)" strokeWidth={0.8} strokeLinecap="round" />}
        </g>
      </g>
    </svg>
  );
}

const at = (w: World, x: number, y: number) => ({ left: `${(x / w.width) * 100}%`, top: `${(y / w.height) * 100}%` });

/** Every pack on the map, every wolf leaving, every MULE that bolted: on every view of the map. */
export function WolvesOnMap({ world, cell }: { world: World; cell: number }) {
  const size = Math.round(cell * 0.75);
  return (
    <div className="pointer-events-none absolute inset-0 z-[7]" data-testid="wolves-layer">
      {world.colonists.map(
        (c) =>
          c.encounter?.kind === 'fight' && (
            // The fight's ground: you dodge inside this ring.
            <span
              key={`arena-${c.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-warn/70"
              style={{ ...at(world, c.encounter.centre.x, c.encounter.centre.y), width: cell * (ARENA + 0.3) * 2, height: cell * (ARENA + 0.3) * 2 }}
              data-testid={`arena-${c.id}`}
            />
          ),
      )}
      {world.colonists.map((c) =>
        c.encounter?.wolves.map((wf, i) => <OneWolf key={`${c.id}-${i}`} world={world} c={c} wf={wf} i={i} size={size} cell={cell} />),
      )}
      {world.fleeing.map((f, i) => (
        <div key={`f${i}`} className="absolute -translate-x-1/2 -translate-y-[75%] opacity-70" style={at(world, f.x, f.y)} data-testid="wolf-fleeing">
          <WolfGlyph size={size} state="prowl" facing={f.vx >= 0 ? 'right' : 'left'} />
        </div>
      ))}
      {world.loose.map((m) => (
        <div key={m.owner} className="absolute flex -translate-x-1/2 -translate-y-[80%] flex-col items-center" style={at(world, m.x, m.y)} data-testid={`loose-${m.owner}`} data-x={m.x.toFixed(3)} data-y={m.y.toFixed(3)} data-running={m.left > 0 || undefined}>
          <span className="rounded-full bg-alert px-1 font-mono text-[10px] font-bold leading-4 text-white shadow-chip">!</span>
          <Mule size={Math.round(size * 1.35)} state={m.left > 0 ? 'walk' : 'idle'} good={m.good} owner={m.slot} facing={m.facing} />
        </div>
      ))}
    </div>
  );
}

function OneWolf({ world, c, wf, i, size, cell }: { world: World; c: Colonist; wf: WolfData; i: number; size: number; cell: number }) {
  const facing = c.x >= wf.x ? 'right' : 'left';
  return (
    <>
      {wf.state === 'tell' && wf.target && (
        // The tell: where it will land, ringed in alert, and the line it will take. Step off the ring to dodge.
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-alert bg-alert/15"
          style={{ ...at(world, wf.target.x, wf.target.y), width: cell * HIT_R * 2, height: cell * HIT_R * 2 }}
          data-testid={`lunge-target-${c.id}`}
        />
      )}
      <div
        className="absolute -translate-x-1/2 -translate-y-[75%]"
        style={at(world, wf.x, wf.y)}
        data-testid={`wolf-${c.id}-${i}`}
        data-state={wf.state}
        data-x={wf.x.toFixed(3)}
        data-y={wf.y.toFixed(3)}
        {...(wf.target ? { 'data-tx': wf.target.x.toFixed(3), 'data-ty': wf.target.y.toFixed(3) } : {})}
      >
        {wf.state === 'open' && <span aria-hidden className="absolute inset-[-25%] rounded-full border-2 border-holo shadow-glow" />}
        <WolfGlyph size={size} state={wf.state} facing={facing} />
      </div>
    </>
  );
}

/**
 * What the wolves want of you, at the colonist: the choice (stick runs, button fights) with its countdown, then
 * the fight's score. On every view, so the TV shows it too.
 */
export function WolfCallout({ world, c, tun, density, mine }: { world: World; c: Colonist; tun: Tunables; density: Density; mine: boolean }) {
  const e = c.encounter;
  const text = density === 'tv' ? 'text-sm' : density === 'wide' ? 'text-base' : 'text-[11px]';
  // Near the map's top edge the callout hangs below the colonist, so the map never clips it.
  const place = c.y < 2 ? 'top-full mt-1' : 'bottom-full mb-1';
  if (c.stunnedUntil > world.t)
    return (
      <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-chip bg-alert', place, ' px-1.5 font-mono font-bold text-white shadow-chip', text)} data-testid={`stunned-${c.id}`}>
        ✶ STUNNED {Math.ceil((c.stunnedUntil - world.t) / 1000)}s
      </span>
    );
  if (!e) return null;
  if (e.kind === 'choose') {
    const left = Math.max(0, tun.wolves.chooseSeconds - (world.t - e.since) / 1000);
    return (
      <span
        className={cx('absolute left-1/2 z-10 flex -translate-x-1/2 flex-col', place, ' items-center whitespace-nowrap rounded-panel border-2 border-alert bg-panel px-2 py-1 font-display font-bold leading-tight text-ink shadow-glow-alert', text)}
        data-testid={`wolf-choice-${c.id}`}
      >
        <span className="text-alert">WOLVES!</span>
        <span className="font-mono font-semibold">
          {mine ? 'stick: RUN · button: FIGHT' : 'run or fight?'} · {Math.ceil(left)}s
        </span>
      </span>
    );
  }
  if (e.kind === 'chase')
    return (
      <span className={cx('absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-chip bg-warn', place, ' px-1.5 font-mono font-bold text-void shadow-chip', text)} data-testid={`wolf-chase-${c.id}`}>
        RUN!
      </span>
    );
  const left = Math.max(0, tun.wolves.fightSeconds - (world.t - e.since) / 1000);
  const open = strikeTarget(c) >= 0;
  return (
    <span
      className={cx('absolute left-1/2 flex -translate-x-1/2 items-center', place, ' gap-1.5 whitespace-nowrap rounded-chip border px-1.5 font-mono font-bold shadow-chip', open ? 'border-holo bg-holo text-on-holo' : 'border-alert bg-panel text-ink', text)}
      data-testid={`fight-hud-${c.id}`}
      data-strikes={e.strikes}
      data-bites={e.bites}
    >
      <span>{open ? 'STRIKE!' : 'DODGE'}</span>
      <span>⚔ {e.strikes}/{tun.wolves.strikesToWin}</span>
      <span className={open ? '' : 'text-alert'}>bites {e.bites}/{tun.wolves.bitesToLose}</span>
      <span className="opacity-70">{Math.ceil(left)}s</span>
    </span>
  );
}

/** A bite you carry, and pelts: small chips under the colonist. */
export function WolfMarks({ c, density }: { c: Colonist; density: Density }) {
  if (!c.bitten && !c.pelts) return null;
  const text = density === 'tv' ? 'text-[11px]' : 'text-[9px]';
  return (
    <span className="mt-0.5 flex gap-0.5">
      {c.bitten && (
        <span className={cx('rounded-chip bg-alert px-1 font-mono font-bold leading-tight text-white shadow-chip', text)} data-testid={`bitten-${c.id}`}>
          BITTEN
        </span>
      )}
      {c.pelts > 0 && (
        <span className={cx('rounded-chip bg-warn px-1 font-mono font-bold leading-tight text-void shadow-chip', text)} data-testid={`pelts-${c.id}`}>
          {c.pelts} PELTS
        </span>
      )}
    </span>
  );
}
