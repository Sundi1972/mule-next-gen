import { Creature, cx, GoodIcon, MuleIcon, PlayerMark, SLOT_COLOR, type Good, type Species } from '@mule/ui';
import type { ReactNode } from 'react';
import type { EventKey } from './catalogue';
import { effectWords } from './copy';
import { hitAt, type Segment, type ShowEvent } from './events';
import { H, SEATS, seat, STAND, TILES, W } from './fixture';
import { clamp, ramp } from './fx';
import { STORE, type Size } from './living';
import { At, Colonist, Crate, ease, Flame, lerp, mix, px, Smoke, TOWN, useStoryClock, type P, Prop } from './scene';
import { PLOT_SCENES } from './stories-plots';
import { STORY } from './story';
import { useShow } from './stage';

/**
 * Each event's own story, played where it happens (Heiko, 28 Oct: "make this really entertaining and all should get
 * their animations"). Drawn in the map's own space, so the camera's zoom carries them; sized in tiles, so the same
 * scene plays on the TV and, smaller, on a phone alone. Pure functions of the clock; `u` is seconds into the story at
 * the TV's pace. Reduced motion: nothing travels; each scene shows its outcome where it lands.
 */

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
 * Heiko: "a pirate ship comes, lands at the store and takes all Crystite with it and then takes off again", and "pirates
 * take all crystite": the store's crates go up the ramp first, then every player's in their colour; each count runs to 0.
 */
function PirateRaid({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < -0.2 || u > 7.6) return null;
  const land: P = { x: STORE.x - 1.45, y: STORE.y - 0.35 };
  const sky: P = { x: STORE.x + 2.6, y: STORE.y - 5.5 };
  const away: P = { x: STORE.x - 6.5, y: STORE.y - 6 };
  const door: P = { x: STORE.x - 0.25, y: STORE.y + 0.2 };
  const hatch: P = { x: land.x + 0.15, y: land.y + 0.5 };
  const held = (ev.effects ?? []).filter((f) => f.what === 'crystite' && f.delta < 0).map((f) => ({ id: f.on, n: -f.delta }));
  const ring = (id: string) => (id === 'store' ? 'var(--color-holo)' : SLOT_COLOR[seat(id).slot]);
  // One crate for every 3 units, in its owner's colour; the store's in the holo colour.
  const crates = held.flatMap((h) => Array.from({ length: Math.ceil(h.n / 3) }, () => ({ id: h.id })));
  const crateAt = (i: number) => 2 + i * 0.42;
  const arrived = (i: number) => u >= crateAt(i) + 0.5 || reduced;
  // The ship: coming in, on the ground, lifting off once the last crate is aboard.
  const liftAt = 5;
  const inK = reduced ? 1 : ease(ramp(u, 0, 1.4));
  const outK = reduced ? 0 : ease(ramp(u, liftAt, 1.3)) ** 1.5;
  const ship = u < liftAt ? mix(sky, land, inK) : mix(land, away, outK);
  const scale = u < liftAt ? lerp(0.55, 1, inK) : lerp(1, 0.45, outK);
  const thrust = u < 1.4 ? 1 : u < 1.8 ? 1 - ramp(u, 1.4, 0.4) : u > liftAt - 0.3 ? ramp(u, liftAt - 0.3, 0.3) : 0;
  const hatchOpen = clamp(ramp(u, 1.6, 0.4) - ramp(u, liftAt - 0.6, 0.4));
  const gone = u > 6.4 && !reduced;
  return (
    <>
      {/* Its shadow on the ground grows as it comes in. */}
      {!gone && (
        <At p={{ x: land.x, y: land.y + 0.7 }} w={2.1 * (u < liftAt ? inK : 1 - outK)}>
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
            <Crate good="crystite" ring={ring(c.id)} />
          </At>
        );
      })}
      {!gone && (
        <At p={ship} w={2.9} style={{ transform: `translate(-50%, -60%) scale(${scale}) rotate(${u > liftAt ? -8 * outK : (1 - inK) * 6}deg)` }}>
          <PirateShip thrust={reduced ? 0 : thrust} ramp={reduced ? 0 : hatchOpen} />
        </At>
      )}
      {/* All the colony's Crystite, the store's and each player's, counted down as its crates go aboard. */}
      {u > 1.2 && u < STORY.pirateRaid!.reveal! && (
        <At p={{ x: STORE.x + 1.2, y: STORE.y - 1.15 }} w={1.95}>
          <div className="flex flex-col gap-[3px] rounded-control border border-g-crystite bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 11) }}>
            <span className="flex items-center gap-1 font-mono font-bold uppercase leading-none text-g-crystite">
              <GoodIcon good="crystite" size={px(size, 9)} /> All the Crystite
            </span>
            {held.map((h) => {
              const mine = crates.map((c, i) => ({ c, i })).filter(({ c }) => c.id === h.id);
              const left = Math.round(h.n * (1 - mine.filter(({ i }) => arrived(i)).length / mine.length));
              return (
                <span key={h.id} className="flex items-center gap-1 leading-none">
                  {h.id === 'store' ? <span className="aspect-square rounded-[3px] bg-holo" style={{ width: px(size, 10) }} /> : <PlayerMark slot={seat(h.id).slot} size={px(size, 10)} />}
                  <span className="flex-1 font-semibold">{h.id === 'store' ? 'Store' : seat(h.id).name}</span>
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

/**
 * Heiko: "we need to show how the store is in flames", and "store fire burns all store storage". The store goes up;
 * shelf after shelf of its stock burns to 0, then the MULEs in its corral; the prices jump on what is gone.
 */
function StoreFire({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const shelves = (ev.effects ?? []).filter((f) => f.on === 'store' && f.what !== 'price');
  const price = ev.effects?.find((f) => f.what === 'price')?.delta ?? 0;
  const grow = reduced ? 1 : ease(ramp(u, 0.2, 1.2));
  const die = reduced ? 0 : ramp(u, 4.4, 0.8);
  const blaze = grow * (1 - die * 0.75);
  const char = clamp(ramp(u, 0.8, 3));
  // Shelf r catches at 1 + 0.4r and is ash 0.7 s later, when its change lands.
  const burnt = (r: number, j = 0) => (reduced ? 1 : clamp((u - 1 - r * 0.4 - j * 0.12) / 0.45));
  const fireOn = u < 5.4 || reduced;
  return (
    <>
      {/* The store scorched, from the middle of the fire on. */}
      <At p={STORE} w={1}>
        <div className="aspect-square rounded-[12%]" style={{ background: `radial-gradient(circle, color-mix(in srgb, var(--color-void) 80%, transparent), color-mix(in srgb, var(--color-void) 40%, transparent))`, opacity: char * 0.85 }} />
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
      {!reduced && <Smoke from={{ x: STORE.x, y: STORE.y - 1.3 }} u={u - 0.5} every={0.28} until={5.2} size={size} dark />}
      {/* Everything the store holds, shelf by shelf: three crates catch and char, the count runs down to 0. */}
      {u < STORY.storeFire!.reveal! && (
        <At p={{ x: STORE.x + 1.75, y: STORE.y + 0.15 }} w={1.9}>
          <div className="flex flex-col gap-[3px] rounded-control border border-alert bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 10) }} data-testid="store-storage">
            <span className="font-mono font-bold uppercase leading-none text-alert-ink">Store storage</span>
            {shelves.map((f, r) => {
              const b = burnt(r);
              const left = Math.round(-f.delta * (1 - b));
              const mules = f.what === 'mules';
              return (
                <span key={f.what} className="flex items-center gap-1 leading-none">
                  <span className="flex w-[14%]">{mules ? <MuleIcon size={px(size, 11)} className="h-auto w-full text-mule-metal" /> : <GoodIcon good={f.what as Good} size={px(size, 11)} className="h-auto w-full" />}</span>
                  <span className="grid flex-1 grid-cols-3 gap-[2px]">
                    {[0, 1, 2].map((j) => {
                      const c = burnt(r, j);
                      return (
                        <span key={j} className="relative">
                          {mules ? (
                            <span className="flex aspect-square items-center justify-center rounded-[18%] bg-raised" style={{ filter: `brightness(${1 - c * 0.75})` }}>
                              <MuleIcon size={px(size, 10)} className="h-auto w-[80%] text-mule-metal" />
                            </span>
                          ) : (
                            <Crate good={f.what as Good} burnt={c} />
                          )}
                          {c > 0 && c < 1 && !reduced && (
                            <span className="absolute -top-[60%] left-[10%] w-[80%]">
                              <Flame flicker />
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </span>
                  <span className={cx('w-[16%] text-right font-mono font-bold', left === 0 ? 'text-alert' : 'text-ink')}>{left}</span>
                </span>
              );
            })}
            {(u > 4.1 || reduced) && (
              <span className="flex items-center justify-center gap-0.5 rounded-chip bg-alert px-0.5 font-mono font-bold leading-none text-white animate-[ev-pop_0.3s_ease-out]">
                ▲ prices +{price}%
              </span>
            )}
          </div>
        </At>
      )}
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

// --- The Federation: tax and grant ------------------------------------------------------------------------------------

/** Where a player's land is, in the middle: what a coin flies from or a pod lands on. */
function landOf(id: string): P {
  const mine = TILES.filter((t) => t.owner === seat(id).slot);
  return { x: mine.reduce((n, t) => n + t.x, 0) / mine.length, y: mine.reduce((n, t) => n + t.y, 0) / mine.length };
}

/** The Federation's cruiser: long, pale, a gold star on its flank, lights along its belly. */
function Cruiser({ beam = 0 }: { beam?: number }) {
  return (
    <svg viewBox="0 0 80 28" className="h-auto w-full overflow-visible" aria-hidden>
      <path d="M3 15C14 6 34 5 54 6l20 4c4 2 4 6 0 8l-20 4C34 23 14 22 3 15Z" fill="color-mix(in srgb, var(--color-mule-metal) 85%, var(--color-holo))" stroke="var(--color-holo)" strokeWidth={1.2} />
      <path d="M10 15h58" stroke="var(--color-holo)" strokeWidth={0.8} opacity={0.6} />
      <path d="M30 8.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4Z" fill="var(--color-warn)" />
      {[44, 50, 56, 62].map((x) => (
        <circle key={x} cx={x} cy={19} r={1.2} fill="var(--color-holo)" opacity={0.5 + beam * 0.5} />
      ))}
      <ellipse cx="62" cy="10.5" rx="6" ry="3" fill="color-mix(in srgb, var(--color-holo) 55%, var(--color-void))" />
    </svg>
  );
}

/** A credit coin. */
function Coin() {
  return (
    <svg viewBox="0 0 12 12" className="h-auto w-full" aria-hidden>
      <circle cx="6" cy="6" r="5.5" fill="var(--color-warn)" stroke="color-mix(in srgb, var(--color-warn) 50%, var(--color-void))" strokeWidth={1} />
      <circle cx="6" cy="6" r="3.2" fill="none" stroke="color-mix(in srgb, var(--color-warn) 50%, var(--color-void))" strokeWidth={0.8} />
    </svg>
  );
}

/** The cruiser's path: in from the east, over the middle of the colony, out to the west. */
function cruiserAt(u: number, leave: number): P {
  const over: P = { x: 7, y: 0.4 };
  if (u < 1) return mix({ x: 17, y: -0.6 }, over, ease(clamp(u)));
  if (u < leave) return { x: over.x, y: over.y + Math.sin(u * 2) * 0.06 };
  return mix(over, { x: -3, y: -0.8 }, ease(clamp(u - leave)));
}

/** A coin flying in an arc from one place to another. */
function FlyingCoin({ from, to, k, w = 0.32 }: { from: P; to: P; k: number; w?: number }) {
  if (k <= 0 || k >= 1) return null;
  const p = mix(from, to, ease(k));
  return (
    <At p={{ x: p.x, y: p.y - Math.sin(k * Math.PI) * 0.8 }} w={w}>
      <Coin />
    </At>
  );
}

/** The tax: the cruiser stops over the colony, a tenth of each player's credits flies up from their land, then down into the colony fund at the store. */
function FederationTax({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 5) return null;
  const ship = reduced ? { x: 7, y: 0.4 } : cruiserAt(u, 3.8);
  const payers = (ev.effects ?? []).filter((f) => f.what === 'cash' && f.on !== 'colony');
  const fund = ev.effects?.find((f) => f.what === 'fund');
  return (
    <>
      {payers.map((f, i) => {
        const land = landOf(f.on);
        const start = 1.2 + i * 0.35;
        const beam = reduced ? 0 : clamp(ramp(u, start - 0.2, 0.2) - ramp(u, start + 1, 0.3));
        return (
          <div key={f.on}>
            {beam > 0 && (
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
                <path d={`M${ship.x + 0.5 - 0.15} ${ship.y + 0.8} L${land.x + 0.5 - 0.6} ${land.y + 0.5} L${land.x + 0.5 + 0.6} ${land.y + 0.5} L${ship.x + 0.5 + 0.15} ${ship.y + 0.8}Z`} fill={SLOT_COLOR[seat(f.on).slot]} opacity={0.18 * beam} />
              </svg>
            )}
            {[0, 0.15, 0.3].map((d) => (
              <FlyingCoin key={d} from={land} to={{ x: ship.x, y: ship.y + 0.4 }} k={reduced ? 0 : (u - start - d) / 0.8} />
            ))}
          </div>
        );
      })}
      {/* The cruiser pours it into the colony fund at the store. */}
      {[0, 0.12, 0.24, 0.36, 0.48].map((d) => (
        <FlyingCoin key={d} from={{ x: ship.x, y: ship.y + 0.4 }} to={STORE} k={reduced ? 0 : (u - 3 - d) / 0.6} w={0.36} />
      ))}
      {fund && (u > 3.6 || reduced) && u < 4.9 && (
        <At p={{ x: STORE.x, y: STORE.y - 0.85 }} w={1.6}>
          <span className="flex justify-center">
            <span className="rounded-chip bg-warn px-1 font-mono font-bold text-on-holo shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 11) }}>
              Colony fund +{fund.delta} cr
            </span>
          </span>
        </At>
      )}
      {!reduced && (
        <At p={ship} w={3.2}>
          <Cruiser beam={clamp(ramp(u, 1, 0.3) - ramp(u, 3.6, 0.3))} />
        </At>
      )}
      {(u > 1 || reduced) && u < 3.8 && (
        <At p={{ x: ship.x, y: ship.y + 1.15 }} w={1.4}>
          <span className="flex justify-center">
            <span className="rounded-chip border-2 border-warn bg-panel px-1 font-display font-bold text-warn animate-[ev-stamp_0.35s_ease-out]" style={{ fontSize: px(size, 12) }}>
              TAX 10%
            </span>
          </span>
        </At>
      )}
    </>
  );
}

/** A supply pod under a parachute. */
function Pod({ open }: { open: number }) {
  return (
    <svg viewBox="0 0 24 34" className="h-auto w-full overflow-visible" aria-hidden>
      {open < 1 && (
        <g opacity={1 - open}>
          <path d="M2 10a10 9 0 0 1 20 0Z" fill="var(--color-ok)" />
          <path d="M2 10l8 14M22 10l-8 14M12 10v14" stroke="var(--color-ink-2)" strokeWidth={0.7} />
        </g>
      )}
      <rect x="7" y="23" width="10" height="9" rx="2" fill="var(--color-mule-metal)" stroke="var(--color-holo)" strokeWidth={1} />
      <path d="M12 23v9" stroke="var(--color-holo)" strokeWidth={0.8} />
    </svg>
  );
}

/** The grant: the cruiser drops a pod on each of the two poorest players' land; it lands and bursts into credits. */
function FederationGrant({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 5) return null;
  const ship = reduced ? { x: 7, y: 0.4 } : cruiserAt(u, 3.4);
  const takers = (ev.effects ?? []).filter((f) => f.what === 'cash');
  return (
    <>
      {takers.map((f, i) => {
        const land = landOf(f.on);
        const drop = reduced ? 1 : ease(clamp((u - 1.2 - i * 0.3) / 1.4));
        const burst = reduced ? 1 : clamp((u - 2.7 - i * 0.3) / 0.6);
        const p = mix({ x: ship.x, y: ship.y + 0.4 }, land, drop);
        return (
          <div key={f.on}>
            {drop > 0 && burst < 1 && (
              <At p={{ x: p.x + Math.sin(u * 3 + i) * 0.1 * (1 - drop), y: p.y - 0.3 }} w={0.75}>
                <Pod open={burst} />
              </At>
            )}
            {burst > 0 &&
              [0, 1, 2, 3, 4, 5].map((k) => {
                const a = (k / 6) * Math.PI * 2;
                return (
                  <At key={k} p={{ x: land.x + Math.cos(a) * burst * 0.6, y: land.y + Math.sin(a) * burst * 0.4 - burst * 0.3 }} w={0.28} style={{ opacity: 1 - burst * 0.6 }}>
                    <Coin />
                  </At>
                );
              })}
            {burst > 0.3 && u < 4.9 && (
              <At p={{ x: land.x, y: land.y - 0.9 }} w={1.3}>
                <span className="flex justify-center">
                  <span className="rounded-chip bg-ok px-1 font-mono font-bold text-on-holo shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 12) }}>
                    {seat(f.on).name} +{f.delta} cr
                  </span>
                </span>
              </At>
            )}
          </div>
        );
      })}
      {!reduced && (
        <At p={ship} w={3.2}>
          <Cruiser beam={clamp(ramp(u, 1, 0.3) - ramp(u, 3.2, 0.3))} />
        </At>
      )}
    </>
  );
}

// --- Colonists arriving and leaving ------------------------------------------------------------------------------------

/** The passenger shuttle: round, white, a row of windows, a door that slides open. */
function Shuttle({ thrust, door }: { thrust: number; door: number }) {
  return (
    <svg viewBox="0 0 60 40" className="h-auto w-full overflow-visible" aria-hidden>
      {[14, 46].map((x) => (
        <path key={x} d={`M${x - 3} 31 L${x} ${31 + 3 + thrust * 10} L${x + 3} 31Z`} fill="var(--color-holo)" opacity={thrust} />
      ))}
      <path d="M4 22C4 12 16 6 30 6s26 6 26 16c0 6-6 9-14 9H18c-8 0-14-3-14-9Z" fill="var(--color-mule-metal)" stroke="var(--color-holo)" strokeWidth={1.4} />
      <path d="M6 20h48" stroke="var(--color-holo)" strokeWidth={2} />
      {[14, 22, 38, 46].map((x) => (
        <rect key={x} x={x - 2.5} y={12} width={5} height={4} rx={1.5} fill="color-mix(in srgb, var(--color-holo) 60%, var(--color-void))" />
      ))}
      <rect x="25" y="16" width="10" height="15" rx="1.5" fill="var(--color-void)" />
      <rect x="25" y="16" width="10" height="15" rx="1.5" fill="var(--color-g-alloy)" transform={`translate(${door * 10} 0)`} />
      <path d="M12 31l-2 5M48 31l2 5" stroke="var(--color-ink-2)" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

const NEWCOMERS: Species[] = ['zipwing', 'bramblet', 'gearling', 'mollox', 'glimmer', 'quibbit', 'zipwing', 'gearling'];

/** Migration: a shuttle at the store, colonists filing out to their new homes (arriving), or in from them (leaving). */
function Migration({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 6) return null;
  const arriving = ev.key === 'immigrationWave';
  const pad: P = { x: STORE.x - 1.35, y: STORE.y - 0.3 };
  const door: P = { x: pad.x, y: pad.y + 0.45 };
  const sky: P = arriving ? { x: pad.x + 1.5, y: pad.y - 5 } : pad;
  const away: P = { x: pad.x - 1, y: pad.y - 5.5 };
  // Arriving: in 0–1.3, out 4.4–5.4. Leaving: there from the start, off 3.4–4.6.
  const landK = arriving ? (reduced ? 1 : ease(clamp(u / 1.3))) : 1;
  const leaveAt = arriving ? 4.4 : 3.4;
  const offK = reduced ? 0 : ease(clamp((u - leaveAt) / 1.2)) ** 1.5;
  const ship = u < leaveAt ? mix(sky, pad, landK) : mix(pad, away, offK);
  const thrust = arriving ? (u < 1.3 ? 1 : u > leaveAt - 0.3 ? ramp(u, leaveAt - 0.3, 0.3) : 0) : u > leaveAt - 0.3 ? ramp(u, leaveAt - 0.3, 0.3) : 0;
  const doorOpen = arriving ? clamp(ramp(u, 1.4, 0.3) - ramp(u, 3.9, 0.3)) : clamp(1 - ramp(u, 3, 0.3));
  const count = ev.effects?.find((f) => f.what === 'colonists');
  const shown = u > (STORY_COUNT_AT[ev.key] ?? 4) || reduced;
  return (
    <>
      {NEWCOMERS.map((sp, i) => {
        const a = (i / NEWCOMERS.length) * Math.PI * 2 + 0.4;
        const home: P = { x: door.x + Math.cos(a) * 2.6, y: door.y + Math.sin(a) * 1.7 };
        const k = reduced ? (arriving ? 1 : 0) : arriving ? clamp((u - 1.6 - i * 0.22) / 1.3) : 1 - clamp((u - 0.4 - i * 0.25) / 1.3);
        if ((arriving && k <= 0) || (!arriving && k <= 0)) return null;
        const p = mix(door, home, k);
        return (
          <At key={i} p={p} w={0.5} style={{ opacity: arriving ? 1 - clamp((k - 0.8) / 0.2) : clamp(k / 0.15) }}>
            <Colonist sp={sp} color={TOWN[i % TOWN.length]!} bob={!reduced && k > 0 && k < 1 ? Math.abs(Math.sin(u * 9 + i)) * 0.08 : 0} size={size} />
          </At>
        );
      })}
      {u < leaveAt + 1.3 && (
        <At p={ship} w={2.4} style={{ transform: `translate(-50%, -60%) scale(${u < leaveAt ? lerp(arriving ? 0.6 : 1, 1, landK) : lerp(1, 0.5, offK)})` }}>
          <Shuttle thrust={reduced ? 0 : thrust} door={reduced ? 0 : doorOpen} />
        </At>
      )}
      {count && shown && u < 5.9 && (
        <At p={{ x: STORE.x + 1.1, y: STORE.y - 1.1 }} w={1.7}>
          <span className="flex justify-center">
            <span className={cx('rounded-chip px-1.5 font-mono font-bold shadow-chip animate-[ev-pop_0.3s_ease-out]', count.delta > 0 ? 'bg-ok text-on-holo' : 'bg-alert text-white')} style={{ fontSize: px(size, 12) }}>
              Colonists {count.delta > 0 ? '+' : '−'}
              {Math.abs(count.delta)}%
            </span>
          </span>
        </At>
      )}
    </>
  );
}
/** When migration's head count changes, in the story's seconds. */
const STORY_COUNT_AT: Partial<Record<EventKey, number>> = { immigrationWave: 4.2, emigrationWave: 4.6 };

// --- Festival ----------------------------------------------------------------------------------------------------------

const SPARK = ['var(--color-warn)', 'var(--color-rise)', 'var(--color-holo)', 'var(--color-ok)', 'var(--color-g-crystite)'];

/** A firework: a trail up, a burst of sparks out, fading. */
function Firework({ at, u, colour }: { at: P; u: number; colour: string }) {
  if (u < 0 || u > 1.4) return null;
  const up = clamp(u / 0.4);
  const burst = clamp((u - 0.4) / 0.9);
  return (
    <>
      {up < 1 && (
        <At p={{ x: at.x, y: at.y + (1 - up) * 2 }} w={0.12}>
          <div className="aspect-square rounded-full bg-warn" />
        </At>
      )}
      {burst > 0 && (
        <At p={at} w={1.8 * (0.3 + burst * 0.7)} style={{ opacity: 1 - burst ** 2 }}>
          <svg viewBox="-10 -10 20 20" className="h-auto w-full" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <line key={i} x1={Math.cos(a) * 3} y1={Math.sin(a) * 3} x2={Math.cos(a) * 9} y2={Math.sin(a) * 9} stroke={colour} strokeWidth={1.1} strokeLinecap="round" />;
            })}
            <circle r="1.6" fill="white" />
          </svg>
        </At>
      )}
    </>
  );
}

/** The festival: bunting over the store, colonists dancing round it, fireworks, and the mood climbing. */
function Festival({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 5.6) return null;
  const flags = reduced ? 1 : clamp(u / 0.6);
  const lines = (ev.effects ?? []).map((f, i) => ({ f, at: 2.6 + i * 0.5 }));
  return (
    <>
      {/* Bunting strung over the store. */}
      <At p={{ x: STORE.x, y: STORE.y - 0.75 }} w={3}>
        <svg viewBox="0 0 60 12" className="h-auto w-full" aria-hidden>
          <path d="M1 2c19 7 39 7 58 0" fill="none" stroke="var(--color-ink-2)" strokeWidth={0.6} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - flags} />
          {Array.from({ length: 9 }, (_, i) => {
            const x = 4 + i * 6.5;
            const y = 2 + Math.sin((x / 60) * Math.PI) * 4.4;
            return flags > i / 9 && <path key={i} d={`M${x - 2} ${y} L${x} ${y + 5} L${x + 2} ${y}Z`} fill={SPARK[i % SPARK.length]} />;
          })}
        </svg>
      </At>
      {/* Colonists dancing round the store. */}
      {NEWCOMERS.map((sp, i) => {
        const a = (i / NEWCOMERS.length) * Math.PI * 2 + (reduced ? 0 : u * 0.6);
        const p = { x: STORE.x + Math.cos(a) * 1.25, y: STORE.y + 0.15 + Math.sin(a) * 0.75 };
        return (
          <At key={i} p={p} w={0.46} style={{ opacity: reduced ? 1 : clamp((u - 0.3 - i * 0.05) / 0.3), zIndex: Math.round(p.y * 10) }}>
            <Colonist sp={sp} color={TOWN[i % TOWN.length]!} bob={reduced ? 0 : Math.abs(Math.sin(u * 7 + i * 0.8)) * 0.18} size={size} />
          </At>
        );
      })}
      {!reduced &&
        [0.8, 1.3, 1.9, 2.4, 3, 3.5, 4.1].map((at, i) => (
          <Firework key={i} at={{ x: STORE.x + [-1.4, 1.2, 0, -0.8, 1.6, -1.6, 0.6][i]!, y: STORE.y - [2, 2.3, 2.7, 2.1, 1.9, 2.5, 2.4][i]! }} u={u - at} colour={SPARK[i % SPARK.length]!} />
        ))}
      {/* What the colony gets, line by line. */}
      <At p={{ x: STORE.x + 2.05, y: STORE.y + 0.6 }} w={1.9}>
        <span className="flex flex-col items-start gap-[3px]">
          {lines.map(
            ({ f, at }) =>
              (u >= at || reduced) && (
                <span key={f.what} className="rounded-chip bg-ok px-1 font-mono font-bold text-on-holo shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 11) }}>
                  ▲ {effectWords(f)}
                </span>
              ),
          )}
        </span>
      </At>
    </>
  );
}

// --- Strikes -------------------------------------------------------------------------------------------------------------

const PICKET: Species[] = ['gearling', 'mollox', 'bramblet', 'zipwing', 'quibbit', 'glimmer'];

/** The general strike: placards go up on every plot of the good, the strikers march on the store, and the Governor can pay them. */
function GeneralStrike({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced, t } = useStoryClock(seg);
  if (u < 0) return null;
  const picket = (i: number): P => ({ x: STORE.x + Math.cos((i / ev.plots.length) * Math.PI * 2) * 0.9, y: STORE.y + 0.15 + Math.sin((i / ev.plots.length) * Math.PI * 2) * 0.55 });
  return (
    <>
      {ev.plots.map((h, i) => {
        const struck = t >= hitAt(seg, ev, h, reduced);
        const walk = reduced ? 1 : ease(clamp((u - 1.8 - i * 0.15) / 1.6));
        const p = mix({ x: h.x, y: h.y }, picket(i), walk);
        return (
          <div key={`${h.x},${h.y}`}>
            {struck && <div className="absolute rounded-[10%]" style={{ left: `${(h.x / W) * 100}%`, top: `${(h.y / H) * 100}%`, width: `${100 / W}%`, height: `${100 / H}%`, background: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-alert) 34%, transparent) 0 5px, transparent 5px 11px)' }} />}
            {struck && u < 5 && (
              <At p={{ x: p.x, y: p.y + 0.1 }} w={0.5} style={{ zIndex: Math.round(p.y * 10) }}>
                <Colonist sp={PICKET[i % PICKET.length]!} color={TOWN[i % TOWN.length]!} prop="sign" bob={walk > 0 && walk < 1 ? Math.abs(Math.sin(u * 9 + i)) * 0.08 : 0} sway={walk >= 1 && !reduced ? Math.sin(u * 5 + i) * 10 : 0} size={size} />
              </At>
            )}
          </div>
        );
      })}
      {(u > 3.2 || reduced) && u < 5 && (
        <At p={{ x: STORE.x, y: STORE.y - 0.95 }} w={2.4}>
          <span className="flex flex-col items-center gap-[2px] animate-[ev-pop_0.35s_ease-out]">
            <span className="rounded-[3px] bg-alert px-1.5 font-display font-bold tracking-widest text-white shadow-chip" style={{ fontSize: px(size, 14) }}>
              STRIKE
            </span>
            <span className="rounded-chip bg-panel/95 px-1 text-ink-2 shadow-chip" style={{ fontSize: px(size, 9) }}>
              The Governor can pay them from the colony fund
            </span>
          </span>
        </At>
      )}
    </>
  );
}

/** The store strike: the store's staff picket it, and the corral gate slams shut on the MULEs. */
function StoreStrike({ seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 4.6) return null;
  const corral: P = { x: STORE.x + 0.95, y: STORE.y + 0.75 };
  const shut = reduced ? 1 : ease(clamp((u - 2.2) / 0.4));
  return (
    <>
      {/* The corral by the store, its MULEs behind a gate that swings shut. */}
      <At p={corral} w={1.2}>
        <div className="relative aspect-[1.6/1]">
          <svg viewBox="0 0 32 20" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M1 4h30M1 10h30M1 19h30M1 2v17M31 2v17" stroke="var(--color-g-smithore)" strokeWidth={1.2} />
            <path d="M1 2v17" stroke="var(--color-alert)" strokeWidth={2} transform={`rotate(${-70 * (1 - shut)} 1 19)`} />
          </svg>
          <span className={cx('absolute inset-x-[15%] top-[18%] flex justify-around text-mule-metal', shut > 0.5 && 'opacity-50')}>
            <MuleIcon size={px(size, 16)} />
            <MuleIcon size={px(size, 16)} />
          </span>
          {shut > 0.9 && (
            <span className="absolute -top-[35%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-alert px-1 font-mono font-bold text-white shadow-chip animate-[ev-stamp_0.3s_ease-out]" style={{ fontSize: px(size, 10) }}>
              NO MULES
            </span>
          )}
        </div>
      </At>
      {/* The staff marching round the store with their placards. */}
      {[0, 1, 2].map((i) => {
        const a = (reduced ? 0 : u * 1.4) + (i / 3) * Math.PI * 2;
        const p = { x: STORE.x + Math.cos(a) * 0.95, y: STORE.y + 0.1 + Math.sin(a) * 0.6 };
        return (
          <At key={i} p={p} w={0.46} style={{ opacity: reduced ? 1 : clamp((u - 0.3 - i * 0.15) / 0.3), zIndex: Math.round(p.y * 10) }}>
            <Colonist sp={PICKET[i]!} color={TOWN[i % TOWN.length]!} prop="sign" bob={reduced ? 0 : Math.abs(Math.sin(u * 8 + i)) * 0.08} size={size} />
          </At>
        );
      })}
    </>
  );
}

// --- Epidemic --------------------------------------------------------------------------------------------------------------

/** The epidemic: a pink haze from the store; everyone without Medicine sneezes and goes pale; Medicine shields the rest. */
function Epidemic({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced, t } = useStoryClock(seg);
  if (u < 0 || u > 4.6) return null;
  const sick = (ev.effects ?? []).filter((f) => f.what === 'pace');
  const well = SEATS.filter((p) => !sick.some((f) => f.on === p.id));
  const haze = reduced ? 1 : ease(clamp((u - 0.2) / 1.6));
  return (
    <>
      <At p={STORE} w={6 * haze}>
        <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-medicine) 40%, transparent), transparent 68%)', opacity: 1 - clamp((u - 3.4) / 1) }} />
      </At>
      {sick.map((f, i) => {
        const at = STAND[f.on]!;
        const since = t - (seg.playAt + (1.8 + i * 0.45) * seg.pace);
        if (since < 0) return null;
        return (
          <div key={f.on}>
            {!reduced &&
              since < 0.9 &&
              [0, 1, 2, 3, 4].map((k) => (
                <At key={k} p={{ x: at.x + 0.25 + since * (0.5 + k * 0.08), y: at.y - 0.15 + (k - 2) * since * 0.18 }} w={0.13} style={{ opacity: 1 - since / 0.9 }}>
                  <div className="aspect-square rounded-full bg-g-medicine" />
                </At>
              ))}
            {!reduced && since < 0.5 && (
              <At p={{ x: at.x + 0.4, y: at.y - 0.55 }} w={0.9}>
                <span className="flex justify-center font-display font-bold italic text-g-medicine" style={{ fontSize: px(size, 11) }}>
                  achoo!
                </span>
              </At>
            )}
            <At p={{ x: at.x, y: at.y + 0.5 }} w={0.9}>
              <span className="flex justify-center">
                <span className="rounded-chip bg-g-medicine px-1 font-mono font-bold text-void shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 9) }}>
                  sick · {f.turns ?? 1} turns
                </span>
              </span>
            </At>
          </div>
        );
      })}
      {/* Whoever holds Medicine is shielded. */}
      {well.map((p) => {
        const at = STAND[p.id]!;
        const k = reduced ? 1 : clamp((u - 1.4) / 0.4);
        return (
          <At key={p.id} p={at} w={0.95 * (0.6 + 0.4 * k)} style={{ opacity: k }}>
            <div className="relative aspect-square rounded-full border-2 border-g-medicine" style={{ boxShadow: '0 0 12px color-mix(in srgb, var(--color-g-medicine) 60%, transparent)' }}>
              <span className="absolute -right-[18%] -top-[18%] flex w-[42%]">
                <GoodIcon good="medicine" size={px(size, 12)} className="h-auto w-full" />
              </span>
            </div>
          </At>
        );
      })}
    </>
  );
}

// --- Volunteer clean-up ----------------------------------------------------------------------------------------------------

/** The clean-up: smog over the colony; volunteers with brooms sweep out from the store, clearing it as they go; the air gauge drops. */
function Cleanup({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 5.2) return null;
  const reach = reduced ? 1 : ease(clamp((u - 1) / 2.6));
  const r = reach * 85;
  const air = ev.effects?.find((f) => f.what === 'air');
  const sx = ((STORE.x + 0.5) / W) * 100;
  const sy = ((STORE.y + 0.5) / H) * 100;
  return (
    <>
      {/* The smog, cleared from the store outward. */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at ${sx}% ${sy}%, transparent 0 ${r}%, color-mix(in srgb, var(--color-g-smithore) 35%, var(--color-void)) ${r + 8}%)`, opacity: 0.72 * (1 - clamp((u - 4.4) / 0.6)) }} />
      {NEWCOMERS.map((sp, i) => {
        const a = (i / NEWCOMERS.length) * Math.PI * 2;
        const p = { x: STORE.x + Math.cos(a) * reach * 6.5, y: STORE.y + Math.sin(a) * reach * 4.2 };
        return (
          <At key={i} p={p} w={0.62} style={{ opacity: reduced ? 1 : clamp((u - 0.6) / 0.4) * (1 - clamp((u - 4.2) / 0.5)), filter: 'drop-shadow(0 0 3px var(--color-ok))' }}>
            <Colonist sp={sp} color={TOWN[i % TOWN.length]!} prop="broom" sway={reduced ? 0 : Math.sin(u * 10 + i) * 25} size={size} />
          </At>
        );
      })}
      {/* The air gauge in the corner, falling as the smog clears. */}
      {air && (
        <At p={{ x: 12.4, y: 0.3 }} w={2.6}>
          <div className="flex items-center gap-1 rounded-control border border-ok bg-panel/95 px-1 py-[2px] shadow-chip" style={{ fontSize: px(size, 11) }}>
            <span className="font-mono font-bold uppercase text-ink-2">Air</span>
            <span className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-raised">
              <span className="absolute inset-y-0 left-0 rounded-full bg-warn" style={{ width: `${42 - (u >= 3.6 || reduced ? -air.delta : 0)}%`, transition: 'width 0.6s' }} />
            </span>
            <span className="font-mono font-bold">{42 + (u >= 3.6 || reduced ? air.delta : 0)}</span>
          </div>
        </At>
      )}
    </>
  );
}

// --- Sickness on the map ---------------------------------------------------------------------------------------------------

/** A bulletin never takes the TV, but on the development map the sick colonist still sneezes as it lands. */
function Sneeze({ ev, seg, size }: { ev: ShowEvent; seg: Segment; size: Size }) {
  const { t, reduced } = useShow();
  const since = t - hitAt(seg, ev, null, reduced);
  const at = ev.player ? STAND[ev.player] : undefined;
  if (!at || reduced || since < 0 || since > 1) return null;
  return (
    <>
      {[0, 1, 2, 3].map((k) => (
        <At key={k} p={{ x: at.x + 0.25 + since * (0.45 + k * 0.08), y: at.y - 0.15 + (k - 1.5) * since * 0.2 }} w={0.12} style={{ opacity: 1 - since }}>
          <div className="aspect-square rounded-full bg-g-medicine" />
        </At>
      ))}
      {since < 0.5 && (
        <At p={{ x: at.x + 0.45, y: at.y - 0.55 }} w={0.9}>
          <span className="flex justify-center font-display font-bold italic text-g-medicine" style={{ fontSize: px(size, 11) }}>
            achoo!
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
  federationTax: FederationTax,
  federationGrant: FederationGrant,
  immigrationWave: Migration,
  emigrationWave: Migration,
  festival: Festival,
  generalStrike: GeneralStrike,
  storeStrike: StoreStrike,
  epidemic: Epidemic,
  volunteerCleanup: Cleanup,
  sickness: Sneeze,
  ...PLOT_SCENES,
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
