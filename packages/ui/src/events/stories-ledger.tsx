import { GoodIcon } from '../components/GoodIcon';
import { PlayerMark } from '../components/PlayerMark';
import { cx, SLOT_COLOR } from '../components/tokens';
import { STORY } from './catalogue';
import { lineShare } from './copy';
import { useShow } from './frame';
import { clamp, ramp } from './fx';
import { At, px, type P } from './place';
import { Crate, ease, landOf, lerp, mix, storeAt, useStoryClock, type Scene } from './scene';
import type { ShowEventKey } from './types';

/**
 * The ledger's stories, the gallery's own (design/mocks/ws8-events src/stories.tsx): money and goods moving between
 * the players, the colony fund and the store. The pirates' raid on the colony's Crystite, the Federation's tax and
 * its grant. The personal ledger events (rats, the accountant, a package, an inheritance) tell theirs on the roll
 * call's marks (rollcall.tsx). Reduced motion: nothing travels; each scene shows its outcome where it lands.
 */

// --- Pirate raid ---------------------------------------------------------------------------------------------------

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
 * Heiko: "a pirate ship comes, lands at the store and takes all Crystite with it and then takes off again". Each
 * holder's crates go up the ramp in the order the raid took them, in the holder's colour (the store's in holo); each
 * count runs to 0.
 */
const PirateRaid: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < -0.2 || u > 7.6) return null;
  const { cast } = frame;
  const store = storeAt(frame, ev);
  const land: P = { x: store.x - 1.45, y: store.y - 0.35 };
  const sky: P = { x: store.x + 2.6, y: store.y - 5.5 };
  const away: P = { x: store.x - 6.5, y: store.y - 6 };
  const door: P = { x: store.x - 0.25, y: store.y + 0.2 };
  const hatch: P = { x: land.x + 0.15, y: land.y + 0.5 };
  const held = (ev.effects ?? []).filter((f) => f.what === 'crystite' && f.delta < 0).map((f) => ({ id: f.on, n: -f.delta }));
  const slot = (id: string) => cast.slotOf(id);
  const ring = (id: string) => (id === 'store' ? 'var(--color-holo)' : SLOT_COLOR[slot(id) ?? 0]);
  // One crate for every 3 units, in its owner's colour.
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
          <At key={i} p={{ x: p.x, y: p.y - Math.sin(k * Math.PI) * 0.35 }} w={0.55} testId="pirate-crate">
            <Crate good="crystite" ring={ring(c.id)} />
          </At>
        );
      })}
      {!gone && (
        <At p={ship} w={2.9} style={{ transform: `translate(-50%, -60%) scale(${scale}) rotate(${u > liftAt ? -8 * outK : (1 - inK) * 6}deg)` }} testId="pirate-ship">
          <PirateShip thrust={reduced ? 0 : thrust} ramp={reduced ? 0 : hatchOpen} />
        </At>
      )}
      {/* All the colony's Crystite, the store's and each player's, counted down as its crates go aboard. */}
      {u > 1.2 && u < STORY.pirateRaid!.reveal! && (
        <At p={{ x: store.x + 1.2, y: store.y - 1.15 }} w={1.95}>
          <div className="flex flex-col gap-[3px] rounded-control border border-g-crystite bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 11) }} data-testid="pirate-hold">
            <span className="flex items-center gap-1 font-mono font-bold uppercase leading-none text-g-crystite">
              <span className="flex" style={{ width: px(size, 9) }}>
                <GoodIcon good="crystite" size={9} className="h-auto w-full" />
              </span>
              All the Crystite
            </span>
            {held.map((h) => {
              const mine = crates.map((c, i) => ({ c, i })).filter(({ c }) => c.id === h.id);
              const left = Math.round(h.n * (1 - mine.filter(({ i }) => arrived(i)).length / mine.length));
              const s = slot(h.id);
              return (
                <span key={h.id} className="flex items-center gap-1 leading-none">
                  {h.id === 'store' || s === undefined ? <span className="aspect-square rounded-[3px] bg-holo" style={{ width: px(size, 10) }} /> : <PlayerMark slot={s} size={size === 'tv' ? 10 : 7} glow={false} />}
                  <span className="flex-1 font-semibold">{h.id === 'store' ? 'Store' : cast.name(h.id)}</span>
                  <span className={cx('font-mono font-bold', left === 0 ? 'text-alert' : 'text-ink')}>{left}</span>
                </span>
              );
            })}
          </div>
        </At>
      )}
    </>
  );
};

// --- The Federation: tax and grant ---------------------------------------------------------------------------------

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

/** Where the cruiser stops: over the middle of the colony's top edge. */
const overhead = (width: number): P => ({ x: (width - 1) / 2, y: 0.4 });

/** The cruiser's path: in from the east, over the middle of the colony, out to the west. */
function cruiserAt(u: number, leave: number, width: number): P {
  const over = overhead(width);
  if (u < 1) return mix({ x: width + 2, y: -0.6 }, over, ease(clamp(u)));
  if (u < leave) return { x: over.x, y: over.y + Math.sin(u * 2) * 0.06 };
  return mix(over, { x: -3, y: -0.8 }, ease(clamp(u - leave)));
}

/** A coin flying in an arc from one place to another. */
function FlyingCoin({ from, to, k, w = 0.32 }: { from: P; to: P; k: number; w?: number }) {
  if (k <= 0 || k >= 1) return null;
  const p = mix(from, to, ease(k));
  return (
    <At p={{ x: p.x, y: p.y - Math.sin(k * Math.PI) * 0.8 }} w={w} testId="tax-coin">
      <Coin />
    </At>
  );
}

/** The tax: the cruiser stops over the colony, each player's tax flies up from their land, then down into the colony fund at the store. */
const FederationTax: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 5) return null;
  const { grid, cast } = frame;
  const store = storeAt(frame, ev);
  const ship = reduced ? overhead(grid.width) : cruiserAt(u, 3.8, grid.width);
  const payers = (ev.effects ?? []).filter((f) => f.what === 'money' && f.delta < 0 && f.on !== 'colony' && f.on !== 'store');
  // What the players paid goes to the colony fund (RULE-4): the fund's figure is theirs together.
  const fund = -payers.reduce((n, f) => n + f.delta, 0);
  const share = lineShare(ev);
  return (
    <>
      {payers.map((f, i) => {
        const land = landOf(frame, f.on, store);
        const start = 1.2 + i * 0.35;
        const beam = reduced ? 0 : clamp(ramp(u, start - 0.2, 0.2) - ramp(u, start + 1, 0.3));
        return (
          <div key={f.on}>
            {beam > 0 && (
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${grid.width} ${grid.height}`} preserveAspectRatio="none" aria-hidden>
                <path d={`M${ship.x + 0.5 - 0.15} ${ship.y + 0.8} L${land.x + 0.5 - 0.6} ${land.y + 0.5} L${land.x + 0.5 + 0.6} ${land.y + 0.5} L${ship.x + 0.5 + 0.15} ${ship.y + 0.8}Z`} fill={SLOT_COLOR[cast.slotOf(f.on) ?? 0]} opacity={0.18 * beam} />
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
        <FlyingCoin key={d} from={{ x: ship.x, y: ship.y + 0.4 }} to={store} k={reduced ? 0 : (u - 3 - d) / 0.6} w={0.36} />
      ))}
      {fund > 0 && (u > 3.6 || reduced) && u < 4.9 && (
        <At p={{ x: store.x, y: store.y - 0.85 }} w={1.6}>
          <span className="flex justify-center">
            <span className="whitespace-nowrap rounded-chip bg-warn px-1 font-mono font-bold text-on-holo shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 11) }}>
              Colony fund +{fund} cr
            </span>
          </span>
        </At>
      )}
      {!reduced && (
        <At p={ship} w={3.2} testId="cruiser">
          <Cruiser beam={clamp(ramp(u, 1, 0.3) - ramp(u, 3.6, 0.3))} />
        </At>
      )}
      {(u > 1 || reduced) && u < 3.8 && (
        <At p={{ x: ship.x, y: ship.y + 1.15 }} w={1.4}>
          <span className="flex justify-center">
            <span className="whitespace-nowrap rounded-chip border-2 border-warn bg-panel px-1 font-display font-bold text-warn animate-[ev-stamp_0.35s_ease-out]" style={{ fontSize: px(size, 12) }}>
              {share ? `TAX ${share}` : 'TAX'}
            </span>
          </span>
        </At>
      )}
    </>
  );
};

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

/** The grant: the cruiser drops a pod on each paid player's land; it lands and bursts into credits. */
const FederationGrant: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 5) return null;
  const store = storeAt(frame, ev);
  const ship = reduced ? overhead(frame.grid.width) : cruiserAt(u, 3.4, frame.grid.width);
  const takers = (ev.effects ?? []).filter((f) => f.what === 'money');
  return (
    <>
      {takers.map((f, i) => {
        const land = landOf(frame, f.on, store);
        const drop = reduced ? 1 : ease(clamp((u - 1.2 - i * 0.3) / 1.4));
        const burst = reduced ? 1 : clamp((u - 2.7 - i * 0.3) / 0.6);
        const p = mix({ x: ship.x, y: ship.y + 0.4 }, land, drop);
        return (
          <div key={f.on}>
            {drop > 0 && burst < 1 && (
              <At p={{ x: p.x + Math.sin(u * 3 + i) * 0.1 * (1 - drop), y: p.y - 0.3 }} w={0.75} testId="grant-pod">
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
                  <span className="whitespace-nowrap rounded-chip bg-ok px-1 font-mono font-bold text-on-holo shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 12) }}>
                    {frame.cast.name(f.on)} +{f.delta} cr
                  </span>
                </span>
              </At>
            )}
          </div>
        );
      })}
      {!reduced && (
        <At p={ship} w={3.2} testId="cruiser">
          <Cruiser beam={clamp(ramp(u, 1, 0.3) - ramp(u, 3.2, 0.3))} />
        </At>
      )}
    </>
  );
};

export const LEDGER_SCENES: Partial<Record<ShowEventKey, Scene>> = {
  pirateRaid: PirateRaid,
  federationTax: FederationTax,
  federationGrant: FederationGrant,
};
