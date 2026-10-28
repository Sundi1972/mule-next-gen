import { Creature, cx, GoodIcon, PlayerMark, SLOT_COLOR, type Species } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import type { EventKey } from './catalogue';
import type { Segment, ShowEvent } from './events';
import { H, seat, W } from './fixture';
import { clamp, ramp } from './fx';
import { EventGlyph } from './glyphs';
import { STORE, type Size } from './living';
import { useShow } from './stage';

/**
 * Each event's own story, played where it happens (Heiko, 28 Oct: "make this really entertaining and all should get
 * their animations"). Drawn in the map's own space, so the camera's zoom carries them; sized in tiles, so the same
 * scene plays on the TV and, smaller, on a phone alone. Pure functions of the clock; `u` is seconds into the story at
 * the TV's pace. Reduced motion: nothing travels; each scene shows its outcome where it lands.
 */

// --- Placing things on the map, in tiles ---------------------------------------------------------------------------

const ease = (v: number) => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
type P = { x: number; y: number };
const mix = (a: P, b: P, k: number): P => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

/** Something centred on a point in tiles (fractions between tiles), `w` tiles wide. */
function At({ p, w, children, style, className }: { p: P; w: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={cx('absolute', className)} style={{ left: `${((p.x + 0.5) / W) * 100}%`, top: `${((p.y + 0.5) / H) * 100}%`, width: `${(w / W) * 100}%`, transform: 'translate(-50%, -50%)', ...style }}>
      {children}
    </div>
  );
}

/** Small words on the map, sized in the map's own pixels so the camera's zoom makes them readable. */
const px = (size: Size, n: number) => (size === 'tv' ? n : n * 0.66);

/** Seconds into a segment's story, at the TV's pace. */
function useStoryClock(seg: Segment) {
  const { t, reduced } = useShow();
  return { u: (t - seg.playAt) / seg.pace, reduced, t };
}

// --- Shared props ----------------------------------------------------------------------------------------------------

/** A flame in three tones, so a fire reads as fire at any size. */
function Flame({ flicker, className, style }: { flicker: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 32" className={cx('h-auto w-full', flicker && 'animate-[show-flicker_0.22s_ease-in-out_infinite_alternate]', className)} style={{ transformOrigin: 'bottom', ...style }} aria-hidden>
      <path d="M12 1c1 6 9 9 9 19a9 9 0 0 1-18 0c0-5 3-8 4-11 .6 3 1.6 4.6 3 5C10 9 10 5 12 1Z" fill="var(--color-alert)" />
      <path d="M12 11c.5 3.5 5 5.5 5 11a5 5 0 0 1-10 0c0-3 1.6-4.6 2.4-6.4.4 1.6 1 2.4 1.8 2.6 0-2.6 0-5 .8-7.2Z" fill="var(--color-g-smithore)" />
      <path d="M12 20c.3 2 2.4 3 2.4 5.6a2.4 2.4 0 0 1-4.8 0c0-1.6.9-2.4 1.4-3.6.2.8.6 1 1 1.2Z" fill="var(--color-warn)" />
    </svg>
  );
}

/** A puff of smoke rising from a point and spreading as it goes. */
function Smoke({ from, u, every = 0.35, until, size, dark = false }: { from: P; u: number; every?: number; until: number; size: Size; dark?: boolean }) {
  const puffs = Math.floor(Math.min(u, until) / every) + 1;
  return (
    <>
      {Array.from({ length: Math.min(puffs, 10) }, (_, i) => {
        const born = (puffs - 1 - i) * every;
        const v = u - born;
        if (v < 0 || v > 2.2) return null;
        return (
          <At key={born} p={{ x: from.x + (i % 2 ? 0.2 : -0.2) * v, y: from.y - v * 0.9 }} w={0.6 + v * 0.7}>
            <div className="aspect-square rounded-full" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${dark ? 'var(--color-void)' : 'var(--color-ink-3)'} 85%, transparent), transparent 70%)`, opacity: clamp(1 - v / 2.2) * (size === 'tv' ? 1 : 0.9) }} />
          </At>
        );
      })}
    </>
  );
}

/** A crate of goods, its owner's colour round the edge when it has one. */
function Crate({ good, ring, burnt = 0 }: { good: 'crystite' | 'food' | 'energy'; ring?: string; burnt?: number }) {
  return (
    <div className="relative flex aspect-square items-center justify-center rounded-[18%] shadow-chip" style={{ background: `color-mix(in srgb, var(--color-g-smithore) ${45 - burnt * 40}%, var(--color-void))`, boxShadow: ring ? `0 0 0 2px ${ring}, var(--shadow-chip)` : undefined }}>
      <span className="absolute inset-[12%] rounded-[10%] border border-void/50" />
      <span className="relative flex w-[60%]" style={{ opacity: 1 - burnt }}>
        <GoodIcon good={good} size={24} className="h-auto w-full" />
      </span>
    </div>
  );
}

// --- Pirate raid -------------------------------------------------------------------------------------------------------

/** The pirates' ship, side on: a dark hull with red trim, a skull pennant, a hatch that lowers, two thrusters. */
function PirateShip({ thrust, ramp: open }: { thrust: number; ramp: number }) {
  return (
    <svg viewBox="0 0 64 48" className="h-auto w-full overflow-visible" aria-hidden>
      {/* Thrusters fire downward. */}
      {[16, 44].map((x) => (
        <path key={x} d={`M${x - 4} 34 L${x} ${34 + 4 + thrust * 12} L${x + 4} 34Z`} fill="var(--color-warn)" opacity={thrust} />
      ))}
      <path d="M24 2v12" stroke="var(--color-ink-2)" strokeWidth={1.4} />
      <path d="M24 3h14l-3 3.5 3 3.5H24Z" fill="var(--color-void)" stroke="var(--color-alert)" strokeWidth={0.8} />
      <circle cx="30.5" cy="6.5" r="1.8" fill="white" />
      <path d="M28.6 8.8h3.8" stroke="white" strokeWidth={0.8} />
      <path d="M5 26C7 18 18 15 26 15h18c9 0 15 4 17 10-2 7-9 10-18 10H20C11 35 6 32 5 26Z" fill="color-mix(in srgb, var(--color-panel) 70%, var(--color-void))" stroke="var(--color-alert)" strokeWidth={1.6} />
      <path d="M8 27h52" stroke="var(--color-alert)" strokeWidth={1} opacity={0.6} />
      <ellipse cx="47" cy="18.5" rx="7" ry="4.5" fill="color-mix(in srgb, var(--color-holo) 55%, var(--color-void))" />
      {[16, 24, 32].map((x) => (
        <circle key={x} cx={x} cy={23} r={2} fill="var(--color-warn)" />
      ))}
      {/* The hatch swings down to a ramp. */}
      <rect x="28" y="33" width="11" height="2.4" fill="var(--color-alert)" transform={`rotate(${open * 50} 28 34)`} />
      <path d="M14 35l-3 6M50 35l3 6" stroke="var(--color-ink-2)" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

/**
 * Heiko: "a pirate ship comes, lands at the store and takes all Crystite with it and then takes off again." The crates
 * come out of the store in their owners' colours (the Crystite the players hold), each player's count runs to 0.
 */
function PirateRaid({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < -0.2 || u > 7.2) return null;
  const land: P = { x: STORE.x - 1.45, y: STORE.y - 0.35 };
  const sky: P = { x: STORE.x + 2.6, y: STORE.y - 5.5 };
  const away: P = { x: STORE.x - 6.5, y: STORE.y - 6 };
  const door: P = { x: STORE.x - 0.25, y: STORE.y + 0.2 };
  const hatch: P = { x: land.x + 0.15, y: land.y + 0.5 };
  const held = (ev.effects ?? []).filter((f) => f.what === 'crystite' && f.delta < 0).map((f) => ({ id: f.on, n: -f.delta }));
  // One crate for every 3 units, in its owner's colour.
  const crates = held.flatMap((h) => Array.from({ length: Math.ceil(h.n / 3) }, () => ({ id: h.id })));
  const crateAt = (i: number) => 2 + i * 0.55;
  const arrived = (i: number) => u >= crateAt(i) + 0.5 || reduced;
  // The ship: coming in, on the ground, lifting off.
  const inK = reduced ? 1 : ease(ramp(u, 0, 1.4));
  const outK = reduced ? 0 : ease(ramp(u, 4.7, 1.3)) ** 1.5;
  const ship = u < 4.7 ? mix(sky, land, inK) : mix(land, away, outK);
  const scale = u < 4.7 ? lerp(0.55, 1, inK) : lerp(1, 0.45, outK);
  const thrust = u < 1.4 ? 1 : u < 1.8 ? 1 - ramp(u, 1.4, 0.4) : u > 4.4 ? ramp(u, 4.4, 0.3) : 0;
  const hatchOpen = clamp(ramp(u, 1.6, 0.4) - ramp(u, 4.1, 0.4));
  const gone = u > 6.1 && !reduced;
  return (
    <>
      {/* Its shadow on the ground grows as it comes in. */}
      {!gone && (
        <At p={{ x: land.x, y: land.y + 0.7 }} w={2.1 * (u < 4.7 ? inK : 1 - outK)}>
          <div className="aspect-[3/1] rounded-full bg-void/60" style={{ filter: size === 'tv' ? 'blur(2px)' : undefined }} />
        </At>
      )}
      {/* Touchdown dust. */}
      {!reduced && u > 1.4 && u < 2.2 && (
        <At p={{ x: land.x, y: land.y + 0.5 }} w={1 + (u - 1.4) * 2.5}>
          <div className="aspect-[3/1] rounded-full border-2 border-g-alloy" style={{ opacity: 1 - (u - 1.4) / 0.8 }} />
        </At>
      )}
      {/* The crates, out of the store's door and up the ramp. */}
      {crates.map((c, i) => {
        const k = reduced ? 1 : clamp((u - crateAt(i)) / 0.5);
        if (k <= 0 || k >= 1) return null;
        const p = mix(door, hatch, ease(k));
        return (
          <At key={i} p={{ x: p.x, y: p.y - Math.sin(k * Math.PI) * 0.35 }} w={0.55}>
            <Crate good="crystite" ring={SLOT_COLOR[seat(c.id).slot]} />
          </At>
        );
      })}
      {!gone && (
        <At p={ship} w={2.9} style={{ transform: `translate(-50%, -60%) scale(${scale}) rotate(${u > 4.7 ? -8 * outK : (1 - inK) * 6}deg)` }}>
          <PirateShip thrust={reduced ? 0 : thrust} ramp={reduced ? 0 : hatchOpen} />
        </At>
      )}
      {/* The players' Crystite, counted down as their crates go aboard. */}
      {u > 1.2 && u < 6 && (
        <At p={{ x: STORE.x + 1.15, y: STORE.y - 1.1 }} w={1.9}>
          <div className="flex flex-col gap-[3px] rounded-control border border-g-crystite bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 11) }}>
            <span className="flex items-center gap-1 font-mono font-bold uppercase leading-none text-g-crystite">
              <GoodIcon good="crystite" size={px(size, 9)} /> Crystite held
            </span>
            {held.map((h) => {
              const mine = crates.map((c, i) => ({ c, i })).filter(({ c }) => c.id === h.id);
              const left = Math.round(h.n * (1 - mine.filter(({ i }) => arrived(i)).length / mine.length));
              return (
                <span key={h.id} className="flex items-center gap-1 leading-none">
                  <PlayerMark slot={seat(h.id).slot} size={px(size, 10)} />
                  <span className="flex-1 font-semibold">{seat(h.id).name}</span>
                  <span className={cx('font-mono font-bold', left === 0 ? 'text-alert' : 'text-ink')}>{left}</span>
                </span>
              );
            })}
          </div>
        </At>
      )}
    </>
  );
}

// --- Store fire --------------------------------------------------------------------------------------------------------

/** Heiko: "we need to show how the store is in flames." The store catches, its Food burns crate by crate, the price jumps. */
function StoreFire({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const lost = -(ev.effects?.find((f) => f.on === 'store' && f.what !== 'price')?.delta ?? 0);
  const price = ev.effects?.find((f) => f.what === 'price')?.delta ?? 0;
  const grow = reduced ? 1 : ease(ramp(u, 0.2, 1.2));
  const die = reduced ? 0 : ramp(u, 3.8, 0.8);
  const blaze = grow * (1 - die * 0.75);
  const char = clamp(ramp(u, 0.8, 2.4));
  const shelf: P = { x: STORE.x + 1.55, y: STORE.y + 0.1 };
  const burnAt = (j: number) => 1 + j * 0.35;
  const burnt = (j: number) => (reduced ? 1 : clamp((u - burnAt(j)) / 0.5));
  const burning = Array.from({ length: 6 }, (_, j) => burnt(j)).filter((b) => b >= 1).length;
  const stock = Math.round(lost * (1 - burning / 6));
  const fireOn = u < 4.8 || reduced;
  return (
    <>
      {/* The store scorched, from the middle of the fire on. */}
      <At p={STORE} w={1}>
        <div className="aspect-square rounded-[12%]" style={{ background: `radial-gradient(circle, color-mix(in srgb, var(--color-void) 80%, transparent), color-mix(in srgb, var(--color-void) 40%, transparent))`, opacity: char * 0.8 }} />
      </At>
      {/* The flames: bigger than the store, rising off its roof. */}
      {fireOn && (
        <At p={{ x: STORE.x - 0.05, y: STORE.y - 0.6 }} w={2.5} style={{ transform: `translate(-50%, -50%) scale(${0.3 + blaze * 0.7})`, transformOrigin: '50% 100%', opacity: clamp(grow * 2) }}>
          <div className="relative aspect-[1.4/1]">
            {[
              [0, 30, 0.85],
              [22, 0, 1.1],
              [50, 18, 0.95],
              [70, 34, 0.75],
            ].map(([left, top, s], k) => (
              <div key={k} className="absolute" style={{ left: `${left}%`, top: `${top}%`, width: `${36 * s!}%` }}>
                <Flame flicker={!reduced} style={{ animationDelay: `${k * 0.05}s` }} />
              </div>
            ))}
          </div>
        </At>
      )}
      {/* The glow on the ground round the store. */}
      {fireOn && (
        <At p={STORE} w={2.6}>
          <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-smithore) 45%, transparent), transparent 65%)', opacity: blaze }} />
        </At>
      )}
      {!reduced && <Smoke from={{ x: STORE.x, y: STORE.y - 1.3 }} u={u - 0.5} every={0.28} until={4.6} size={size} dark />}
      {/* The store's Food on its shelf: each crate catches and chars in turn, the count runs down. */}
      <At p={shelf} w={1.35}>
        <div className="flex flex-col gap-[3px] rounded-control border border-alert bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 11) }}>
          <span className="flex items-center justify-between gap-1 font-mono font-bold uppercase leading-none text-ink-2">
            <span className="flex items-center gap-0.5">
              <GoodIcon good="food" size={px(size, 11)} />
              Food in store
            </span>
            <span className={cx(stock === 0 ? 'text-alert' : 'text-ink')}>{stock}</span>
          </span>
          <span className="grid grid-cols-3 gap-[2px]">
            {Array.from({ length: 6 }, (_, j) => {
              const b = burnt(j);
              return (
                <span key={j} className="relative">
                  <Crate good="food" burnt={b} />
                  {b > 0 && b < 1 && !reduced && (
                    <span className="absolute -top-[60%] left-[10%] w-[80%]">
                      <Flame flicker />
                    </span>
                  )}
                </span>
              );
            })}
          </span>
          {(u > 3.7 || reduced) && (
            <span className="flex items-center justify-center gap-0.5 rounded-chip bg-alert px-0.5 font-mono font-bold leading-none text-white animate-[ev-pop_0.3s_ease-out]">
              ▲ price +{price}%
            </span>
          )}
        </div>
      </At>
    </>
  );
}

// --- Riot --------------------------------------------------------------------------------------------------------------

/** The colony's own colonists, all six species, in the colony's plain colours: not the players, the town. */
const MOB: { sp: Species; dx: number; dy: number; prop: 'fist' | 'torch' | 'sign' }[] = [
  { sp: 'zipwing', dx: 0, dy: 0, prop: 'torch' },
  { sp: 'bramblet', dx: 0.42, dy: 0.1, prop: 'fist' },
  { sp: 'gearling', dx: -0.4, dy: 0.15, prop: 'sign' },
  { sp: 'mollox', dx: 0.2, dy: 0.45, prop: 'fist' },
  { sp: 'glimmer', dx: -0.25, dy: 0.5, prop: 'torch' },
  { sp: 'quibbit', dx: 0.6, dy: 0.45, prop: 'sign' },
  { sp: 'zipwing', dx: -0.6, dy: 0.55, prop: 'fist' },
  { sp: 'gearling', dx: 0.1, dy: -0.38, prop: 'fist' },
  { sp: 'bramblet', dx: -0.15, dy: 0.85, prop: 'torch' },
  { sp: 'mollox', dx: 0.5, dy: -0.25, prop: 'sign' },
  { sp: 'quibbit', dx: -0.55, dy: -0.2, prop: 'torch' },
  { sp: 'glimmer', dx: 0.35, dy: 0.85, prop: 'fist' },
];
const TOWN = ['var(--color-g-alloy)', 'var(--color-mule-metal)', 'var(--color-ink-2)'];

/** What a rioter holds over their head. */
function Prop({ kind, flicker }: { kind: 'fist' | 'torch' | 'sign'; flicker: boolean }) {
  if (kind === 'torch')
    return (
      <span className="flex flex-col items-center">
        <span className="w-[70%]">
          <Flame flicker={flicker} />
        </span>
        <span className="h-[50%] w-[12%] rounded-full bg-g-smithore" />
      </span>
    );
  if (kind === 'sign')
    return (
      <span className="flex flex-col items-center">
        <span className="flex aspect-[1.5/1] w-full items-center justify-center rounded-[2px] bg-ink text-void">
          <EventGlyph k="riot" size={10} className="h-auto w-[55%]" />
        </span>
        <span className="h-[40%] w-[10%] bg-ink-2" />
      </span>
    );
  return (
    <svg viewBox="0 0 12 14" className="h-auto w-[70%]" aria-hidden>
      <rect x="1.5" y="1" width="9" height="7" rx="2" fill="var(--color-alert-ink)" />
      <path d="M4 1v3M6 1v3M8 1v3" stroke="var(--color-void)" strokeWidth={0.8} />
      <rect x="3.5" y="8" width="5" height="6" fill="var(--color-alert-ink)" />
    </svg>
  );
}

/** The stadium the colony is proud of: the prestige object the riot damages. */
function Stadium({ cracked }: { cracked: number }) {
  return (
    <svg viewBox="0 0 40 28" className="h-auto w-full" aria-hidden>
      <ellipse cx="20" cy="18" rx="18" ry="9" fill="color-mix(in srgb, var(--color-g-alloy) 70%, var(--color-void))" stroke="var(--color-ink)" strokeWidth={1.2} />
      <ellipse cx="20" cy="16" rx="13" ry="5.5" fill="color-mix(in srgb, var(--color-g-food) 60%, var(--color-void))" />
      <path d="M4 15V9M36 15V9M12 11V5M28 11V5" stroke="var(--color-ink)" strokeWidth={1.2} />
      <path d="M2 9h6M32 9h6M10 5h4M26 5h4" stroke="var(--color-warn)" strokeWidth={1.6} />
      {cracked > 0 && <path d="M18 9l-3 6 4 3-3 8M23 10l3 5-2 4" fill="none" stroke="var(--color-void)" strokeWidth={1.8} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - cracked} />}
    </svg>
  );
}

/**
 * Heiko: "maybe an angry mob walking on the map?" The mob gathers in the west, marches on the store and loots it, then
 * on the stadium and smashes it, and scatters.
 */
function Riot({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const stadium: P = { x: 9, y: 4.1 };
  const gather: P = { x: ev.origin.x, y: ev.origin.y };
  const store: P = { x: STORE.x - 0.4, y: STORE.y + 0.55 };
  const front: P = { x: stadium.x - 0.7, y: stadium.y + 0.6 };
  // Where the mob's middle is: gathering, marching on the store, looting, on to the stadium, smashing.
  const where = reduced ? front : u < 1 ? gather : u < 3.2 ? mix(gather, store, ease((u - 1) / 2.2)) : u < 3.9 ? store : u < 4.4 ? mix(store, front, ease((u - 3.9) / 0.5)) : front;
  const scatter = reduced ? 0 : ramp(u, 5, 0.9);
  const cracked = reduced ? 1 : ramp(u, 4.4, 0.4);
  const marching = !reduced && u > 1 && u < 4.4 && !(u > 3.2 && u < 3.9);
  return (
    <>
      <At p={stadium} w={1.9}>
        <Stadium cracked={cracked} />
      </At>
      {!reduced && u > 4.4 && <Smoke from={{ x: stadium.x, y: stadium.y - 0.2 }} u={u - 4.4} every={0.3} until={1.8} size={size} />}
      {/* Looted crates tumble out of the store. */}
      {[0, 1, 2].map((i) => {
        const k = reduced ? 1 : clamp((u - 3.3 - i * 0.18) / 0.5);
        if (k <= 0) return null;
        return (
          <At key={i} p={{ x: STORE.x + 0.15 + i * 0.28, y: STORE.y + 0.45 + Math.sin(k * Math.PI) * -0.35 + k * 0.15 }} w={0.3} style={{ transform: `translate(-50%, -50%) rotate(${k * (i % 2 ? 160 : -140)}deg)` }}>
            <Crate good={i === 1 ? 'energy' : 'food'} />
          </At>
        );
      })}
      {u < 6.2 &&
        MOB.map((m, i) => {
          const born = reduced ? 1 : clamp((u - i * 0.06) / 0.3);
          const bob = marching ? Math.abs(Math.sin(u * 9 + i)) * 0.06 : 0;
          const out = { x: m.dx * 1.35 * (1 + scatter * 5), y: m.dy * 1.35 * (1 + scatter * 5) };
          return (
            <At key={i} p={{ x: where.x + out.x, y: where.y + out.y - bob }} w={0.62} style={{ opacity: born * (1 - scatter), zIndex: Math.round(m.dy * 10) + 10, filter: 'drop-shadow(0 0 2px var(--color-alert))' }}>
              <span className="relative flex flex-col items-center">
                <span className="absolute -top-[62%] left-[52%] w-[48%]" style={{ transform: marching ? `rotate(${Math.sin(u * 6 + i) * 12}deg)` : undefined, transformOrigin: 'bottom' }}>
                  <Prop kind={m.prop} flicker={!reduced} />
                </span>
                <Creature species={m.sp} color={TOWN[i % TOWN.length]!} size={px(size, 30)} className="h-auto w-full" />
              </span>
            </At>
          );
        })}
      {/* An angry shout over the mob while it marches. */}
      {!reduced && u > 0.8 && u < 4.6 && (
        <At p={{ x: where.x, y: where.y - 1.35 }} w={1.2}>
          <span className="flex justify-center font-display font-bold text-alert" style={{ fontSize: px(size, 20), transform: `scale(${1 + Math.abs(Math.sin(u * 4)) * 0.15})` }}>
            !!
          </span>
        </At>
      )}
    </>
  );
}

// --- Where the stories play ------------------------------------------------------------------------------------------

const SCENE: Partial<Record<EventKey, (p: { ev: ShowEvent; seg: Segment; size: Size }) => ReactNode>> = {
  pirateRaid: PirateRaid,
  storeFire: StoreFire,
  riot: Riot,
};

/** Every story of the phase, over the map, once its segment starts to play. */
export function Stories({ size }: { size: Size }) {
  const { s, t } = useShow();
  return (
    <>
      {s.segments.map((g) =>
        t >= g.playAt - 0.05
          ? g.events.map((ev, i) => {
              const Scene = SCENE[ev.key];
              return Scene ? <Scene key={`${g.n}-${i}`} ev={ev} seg={g} size={size} /> : null;
            })
          : null,
      )}
    </>
  );
}
