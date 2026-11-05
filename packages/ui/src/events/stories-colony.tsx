import { GoodIcon } from '../components/GoodIcon';
import { MuleIcon } from '../components/MuleIcon';
import type { Species } from '../components/species';
import { cx, GOOD_NAME, type Good } from '../components/tokens';
import { STORY } from './catalogue';
import { effectWords } from './copy';
import { useShow } from './frame';
import { clamp, ramp } from './fx';
import { At, px, type P } from './place';
import { colonistAt } from './rollcall';
import { epidemicSick } from './sick';
import { Colonist, Crate, ease, Flame, lerp, mix, Smoke, storeAt, TOWN, useStoryClock, type Scene } from './scene';
import type { ShowEffect, ShowEventKey } from './types';

/**
 * The colony's and the store's stories, the galleries' own (design/mocks/ws8-events and ws8-colony-events
 * src/stories.tsx): the store fire, the immigration wave's shuttle, the epidemic's haze, and the colony's mood events:
 * the general strike, the festival and the riot. Reduced motion: nothing travels; each shows its outcome.
 */

const isGood = (what: ShowEffect['what']): what is Good => what in GOOD_NAME;

// --- Store fire ----------------------------------------------------------------------------------------------------

/**
 * Heiko: "we need to show how the store is in flames", and "store fire burns all store storage". The store goes up;
 * shelf after shelf of its stock burns to 0, then the MULEs in its corral.
 */
const StoreFire: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const store = storeAt(frame, ev);
  const shelves = (ev.effects ?? []).filter((f) => f.on === 'store' && (isGood(f.what) || f.what === 'mules'));
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
      <At p={store} w={1}>
        <div className="aspect-square rounded-[12%]" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-void) 80%, transparent), color-mix(in srgb, var(--color-void) 40%, transparent))', opacity: char * 0.85 }} />
      </At>
      {/* The flames: bigger than the store, rising off its roof. */}
      {fireOn && (
        <At p={{ x: store.x - 0.05, y: store.y - 0.6 }} w={2.5} style={{ transform: `translate(-50%, -50%) scale(${0.3 + blaze * 0.7})`, transformOrigin: '50% 100%', opacity: clamp(grow * 2) }} testId="store-flames">
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
        <At p={store} w={2.6}>
          <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-smithore) 45%, transparent), transparent 65%)', opacity: blaze }} />
        </At>
      )}
      {!reduced && <Smoke from={{ x: store.x, y: store.y - 1.3 }} u={u - 0.5} every={0.28} until={5.2} size={size} dark />}
      {/* Everything the store holds, shelf by shelf: three crates catch and char, the count runs down to 0. */}
      {u < STORY.storeFire!.reveal! && (
        <At p={{ x: store.x + 1.75, y: store.y + 0.15 }} w={1.9}>
          <div className="flex flex-col gap-[3px] rounded-control border border-alert bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 10) }} data-testid="store-storage">
            <span className="font-mono font-bold uppercase leading-none text-alert-ink">Store storage</span>
            {shelves.map((f, r) => {
              const b = burnt(r);
              const left = Math.round(-f.delta * (1 - b));
              const good = isGood(f.what) ? f.what : null;
              return (
                <span key={f.what} className="flex items-center gap-1 leading-none">
                  <span className="flex w-[14%]">{good ? <GoodIcon good={good} size={11} className="h-auto w-full" /> : <MuleIcon size={11} className="h-auto w-full text-mule-metal" />}</span>
                  <span className="grid flex-1 grid-cols-3 gap-[2px]">
                    {[0, 1, 2].map((j) => {
                      const c = burnt(r, j);
                      return (
                        <span key={j} className="relative">
                          {good ? (
                            <Crate good={good} burnt={c} />
                          ) : (
                            <span className="flex aspect-square items-center justify-center rounded-[18%] bg-raised" style={{ filter: `brightness(${1 - c * 0.75})` }}>
                              <MuleIcon size={10} className="h-auto w-[80%] text-mule-metal" />
                            </span>
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
          </div>
        </At>
      )}
    </>
  );
};

// --- Colonists arriving ----------------------------------------------------------------------------------------------

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
/** When the head count changes, in the story's seconds. */
const COUNT_AT = 4.2;

/** The immigration wave: a shuttle sets down at the store and colonists file out to their new homes; the head count ticks up. */
const Migration: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0 || u > 6) return null;
  const store = storeAt(frame, ev);
  const pad: P = { x: store.x - 1.35, y: store.y - 0.3 };
  const door: P = { x: pad.x, y: pad.y + 0.45 };
  const sky: P = { x: pad.x + 1.5, y: pad.y - 5 };
  const away: P = { x: pad.x - 1, y: pad.y - 5.5 };
  const landK = reduced ? 1 : ease(clamp(u / 1.3));
  const leaveAt = 4.4;
  const offK = reduced ? 0 : ease(clamp((u - leaveAt) / 1.2)) ** 1.5;
  const ship = u < leaveAt ? mix(sky, pad, landK) : mix(pad, away, offK);
  const thrust = u < 1.3 ? 1 : u > leaveAt - 0.3 ? ramp(u, leaveAt - 0.3, 0.3) : 0;
  const doorOpen = clamp(ramp(u, 1.4, 0.3) - ramp(u, 3.9, 0.3));
  const count = ev.effects?.find((f) => f.what === 'colonists');
  return (
    <>
      {NEWCOMERS.map((sp, i) => {
        const a = (i / NEWCOMERS.length) * Math.PI * 2 + 0.4;
        const home: P = { x: door.x + Math.cos(a) * 2.6, y: door.y + Math.sin(a) * 1.7 };
        const k = reduced ? 1 : clamp((u - 1.6 - i * 0.22) / 1.3);
        if (k <= 0) return null;
        return (
          <At key={i} p={mix(door, home, k)} w={0.5} style={{ opacity: 1 - clamp((k - 0.8) / 0.2) }} testId="migration-colonist">
            <Colonist sp={sp} color={TOWN[i % TOWN.length]!} bob={!reduced && k < 1 ? Math.abs(Math.sin(u * 9 + i)) * 0.08 : 0} />
          </At>
        );
      })}
      {u < leaveAt + 1.3 && (
        <At p={ship} w={2.4} style={{ transform: `translate(-50%, -60%) scale(${u < leaveAt ? lerp(0.6, 1, landK) : lerp(1, 0.5, offK)})` }} testId="migration-shuttle">
          <Shuttle thrust={reduced ? 0 : thrust} door={reduced ? 0 : doorOpen} />
        </At>
      )}
      {count && (u > COUNT_AT || reduced) && u < 5.9 && (
        <At p={{ x: store.x + 1.1, y: store.y - 1.1 }} w={1.7}>
          <span className="flex justify-center">
            <span className={cx('whitespace-nowrap rounded-chip px-1.5 font-mono font-bold shadow-chip animate-[ev-pop_0.3s_ease-out]', count.delta > 0 ? 'bg-ok text-on-holo' : 'bg-alert text-white')} style={{ fontSize: px(size, 12) }}>
              {effectWords(count)}
            </span>
          </span>
        </At>
      )}
    </>
  );
};

// --- Epidemic --------------------------------------------------------------------------------------------------------

/**
 * The epidemic: a pink haze from the store; everyone without Medicine sneezes and goes pale; Medicine shields the rest.
 * Who it sickened is epidemicSick's one reading of the view.
 */
const Epidemic: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced, t } = useStoryClock(seg);
  if (u < 0 || u > 4.6) return null;
  const store = storeAt(frame, ev);
  const ill = new Set(epidemicSick(ev, frame.cast.players));
  const sick = frame.cast.players.filter((p) => ill.has(p.id));
  const well = frame.cast.players.filter((p) => !ill.has(p.id));
  const haze = reduced ? 1 : ease(clamp((u - 0.2) / 1.6));
  return (
    <>
      <At p={store} w={6 * haze} testId="epidemic-haze">
        <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-g-medicine) 40%, transparent), transparent 68%)', opacity: 1 - clamp((u - 3.4) / 1) }} />
      </At>
      {sick.map((p, i) => {
        const at = colonistAt(frame, p.id);
        const since = t - (seg.playAt + (STORY.epidemic!.lands + i * STORY.epidemic!.step!) * seg.pace);
        if (!at || (since < 0 && !reduced)) return null;
        return (
          <div key={p.id}>
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
            <At p={{ x: at.x, y: at.y + 0.5 }} w={0.9} testId={`epidemic-sick-${p.id}`}>
              <span className="flex justify-center">
                <span className="whitespace-nowrap rounded-chip bg-g-medicine px-1 font-mono font-bold text-void shadow-chip animate-[ev-pop_0.3s_ease-out]" style={{ fontSize: px(size, 9) }}>
                  sick · 2 turns
                </span>
              </span>
            </At>
          </div>
        );
      })}
      {/* Whoever held Medicine is shielded. */}
      {well.map((p) => {
        const at = colonistAt(frame, p.id);
        if (!at) return null;
        const k = reduced ? 1 : clamp((u - 1.4) / 0.4);
        return (
          <At key={p.id} p={at} w={0.95 * (0.6 + 0.4 * k)} style={{ opacity: k }} testId={`epidemic-shield-${p.id}`}>
            <div className="relative aspect-square rounded-full border-2 border-g-medicine" style={{ boxShadow: '0 0 12px color-mix(in srgb, var(--color-g-medicine) 60%, transparent)' }}>
              <span className="absolute -right-[18%] -top-[18%] flex w-[42%]">
                <GoodIcon good="medicine" size={12} className="h-auto w-full" />
              </span>
            </div>
          </At>
        );
      })}
    </>
  );
};

// --- General strike --------------------------------------------------------------------------------------------------

/** DS-GAP: a striker's placard, a sign on a pole, in the alert's hazard colour so it reads without colour. */
function Placard() {
  return (
    <svg viewBox="0 0 20 24" className="h-auto w-full overflow-visible" aria-hidden>
      <path d="M10 10v14" stroke="var(--color-ink-2)" strokeWidth={1.6} />
      <rect x={1} y={1} width={18} height={10} rx={1.5} fill="var(--color-alert)" stroke="var(--color-void)" strokeWidth={1} />
      <path d="M4 4h12M4 8h8" stroke="white" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

const CROWD: Species[] = ['bramblet', 'gearling', 'mollox', 'zipwing', 'quibbit', 'glimmer'];

/**
 * The general strike. Planning: strikers with placards walk out of the store, one to each plot of the struck good, and
 * stand there; each plot gets "STRIKE · 20%". Production (unpaid): the strikers stand on the plots and each chip reads
 * "STRIKE −80%". Paid, the server sends no event, so nobody stands anywhere.
 */
const GeneralStrike: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const store = storeAt(frame, ev);
  const planning = ev.phase === 'planning';
  const { lands, step } = STORY.generalStrike as { lands: number; step: number };
  return (
    <>
      {ev.hits.map((h, i) => {
        const plot: P = { x: h.x + 0.24, y: h.y + 0.12 };
        const k = !planning || reduced ? 1 : ease(clamp((u - 0.8 - i * step) / 1.8));
        const walking = !reduced && k > 0 && k < 1;
        const landed = reduced || u >= lands + i * step;
        return (
          <div key={`${h.x},${h.y}`}>
            {k > 0 && (
              <At p={mix(store, plot, k)} w={0.5} style={{ zIndex: 3 }} testId={`striker-${h.x}-${h.y}`}>
                <Colonist sp={CROWD[i % CROWD.length]!} color={TOWN[i % TOWN.length]!} prop={<Placard />} bob={walking ? Math.abs(Math.sin(u * 10 + i)) * 0.07 : 0} sway={walking ? Math.sin(u * 6 + i) * 8 : landed && !reduced ? Math.sin(u * 3 + i) * 6 : 0} />
              </At>
            )}
            {landed && (
              <At p={{ x: h.x - 0.2, y: h.y - 0.3 }} w={1}>
                <span className="flex justify-center">
                  <span className={cx('whitespace-nowrap rounded-chip bg-alert px-1 py-px font-mono font-bold text-white shadow-chip', !reduced && 'animate-[ev-pop_0.3s_ease-out]')} style={{ fontSize: px(size, size === 'tv' ? 13 : 16) }} data-testid={`strike-chip-${h.x}-${h.y}`}>
                    {/* Two lines, so neighbouring plots' chips never overlap. */}
                    <span className="flex flex-col items-center leading-none">
                      <span>STRIKE</span>
                      <span>{planning ? '· 20%' : '−80%'}</span>
                    </span>
                  </span>
                </span>
              </At>
            )}
          </div>
        );
      })}
    </>
  );
};

// --- Festival --------------------------------------------------------------------------------------------------------

const FLAGS = ['var(--color-holo)', 'var(--color-ok)', 'var(--color-warn)', 'var(--color-g-medicine)', 'var(--color-g-energy)'];

/** The festival: bunting strung over the colony from the store, lanterns glowing, and a crowd dancing at the store. */
const Festival: Scene = ({ ev, seg }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const store = storeAt(frame, ev);
  const up = reduced ? 1 : ease(clamp((u - 0.2) / 1.2));
  const top: P = { x: store.x, y: store.y - 0.45 };
  // Four strings, each from the store out to a corner of the map, sagging between.
  const corners: P[] = [
    { x: 0.2, y: 0.2 },
    { x: frame.grid.width - 1.2, y: 0.2 },
    { x: 0.4, y: frame.grid.height - 1 },
    { x: frame.grid.width - 1.4, y: frame.grid.height - 1 },
  ];
  return (
    <>
      {corners.map((b, s) =>
        Array.from({ length: 9 }, (_, i) => {
          const k = (i + 1) / 10;
          if (k > up) return null;
          const p = { ...mix(top, b, k), y: lerp(top.y, b.y, k) + Math.sin(k * Math.PI) * 0.35 };
          return (
            <At key={`${s}-${i}`} p={p} w={0.22} testId={s === 0 && i === 0 ? 'festival-bunting' : undefined}>
              <span className="block aspect-square" style={{ background: FLAGS[(i + s) % FLAGS.length], clipPath: 'polygon(0 0, 100% 0, 50% 100%)', transform: reduced ? undefined : `rotate(${Math.sin(u * 4 + i) * 10}deg)` }} />
            </At>
          );
        }),
      )}
      {/* Lanterns round the store, glowing. */}
      {[-0.9, 0.9].map((dx, i) => (
        <At key={dx} p={{ x: store.x + dx, y: store.y - 0.55 }} w={0.7} style={{ opacity: up }}>
          <div className="aspect-square rounded-full" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-warn) 75%, transparent) 0 18%, color-mix(in srgb, var(--color-warn) 25%, transparent) 40%, transparent 70%)', transform: reduced ? undefined : `scale(${0.9 + Math.sin(u * 5 + i) * 0.1})` }} />
        </At>
      ))}
      {/* The crowd: eight colonists round the store, jumping. */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const k = reduced ? 1 : clamp((u - 0.6 - i * 0.12) / 0.6);
        if (k <= 0) return null;
        const home: P = { x: store.x + Math.cos(a) * 0.95, y: store.y + 0.15 + Math.sin(a) * 0.6 };
        return (
          <At key={i} p={home} w={0.36} style={{ opacity: k }} testId="festival-crowd">
            <Colonist sp={CROWD[i % CROWD.length]!} color={TOWN[i % TOWN.length]!} bob={reduced ? 0 : Math.abs(Math.sin(u * 7 + i * 1.3)) * 0.18} />
          </At>
        );
      })}
    </>
  );
};

// --- Riot -------------------------------------------------------------------------------------------------------------

/**
 * The riot: an angry crowd at the store, and the store fire's shelf box, calmly: no fire, a third of each shelf goes
 * (one crate of three empties) and its count runs down. The damaged object's plot puffs dust as it is hit; its HIT
 * mark is the map's own (PlotObjectMark, from the live tiles).
 */
const Riot: Scene = ({ ev, seg, size }) => {
  const frame = useShow();
  const { u, reduced } = useStoryClock(seg);
  if (u < 0) return null;
  const store = storeAt(frame, ev);
  const shelves = (ev.effects ?? []).filter((f): f is ShowEffect & { what: Good } => f.on === 'store' && isGood(f.what));
  const gone = (r: number) => (reduced ? 1 : clamp((u - 1.8 - r * 0.45) / 0.35));
  const hitAt = STORY.riot!.lands;
  const hit = ev.hits[0];
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const k = reduced ? 1 : ease(clamp((u - 0.2 - i * 0.08) / 0.9));
        if (k <= 0 || (u > 5.8 && !reduced)) return null;
        const from: P = { x: store.x + Math.cos(a) * 2.6, y: store.y + Math.sin(a) * 1.8 };
        const to: P = { x: store.x + Math.cos(a) * 0.85, y: store.y + 0.1 + Math.sin(a) * 0.55 };
        return (
          <At key={i} p={mix(from, to, k)} w={0.36} testId="riot-crowd">
            <span className="block" style={{ filter: 'saturate(0.6)' }}>
              <Colonist sp={CROWD[i % CROWD.length]!} color={TOWN[i % TOWN.length]!} bob={reduced ? 0 : Math.abs(Math.sin(u * 12 + i)) * 0.06} prop={i % 3 === 0 ? <Placard /> : undefined} sway={reduced ? 0 : Math.sin(u * 9 + i) * 14} />
            </span>
          </At>
        );
      })}
      {hit && !reduced && u > hitAt - 0.1 && <Smoke from={{ x: hit.x, y: hit.y - 0.2 }} u={u - hitAt + 0.1} every={0.3} until={1} size={size} />}
      {u < hitAt - 0.2 && (
        <At p={{ x: store.x + 1.75, y: store.y + 0.15 }} w={1.9}>
          <div className="flex flex-col gap-[3px] rounded-control border border-warn bg-panel/95 p-[4px] shadow-chip" style={{ fontSize: px(size, 12) }} data-testid="riot-storage">
            <span className="font-mono font-bold uppercase leading-none text-warn">Store storage</span>
            {shelves.map((f, r) => {
              const g = gone(r);
              // Counted from the store's real stock when the caller has it; without it, only the loss, never a guessed count.
              const after = frame.storeStock?.[f.what];
              const count = after === undefined ? (g >= 1 ? `−${Math.abs(f.delta)}` : '') : String(Math.round(after - f.delta + f.delta * g));
              return (
                <span key={f.what} className="flex items-center gap-1 leading-none">
                  <span className="flex w-[14%]">
                    <GoodIcon good={f.what} size={11} className="h-auto w-full" />
                  </span>
                  <span className="grid flex-1 grid-cols-3 gap-[2px]">
                    {[0, 1, 2].map((j) => (
                      <span key={j} style={{ opacity: j === 2 ? 1 - g * 0.85 : 1 }}>
                        <Crate good={f.what} burnt={j === 2 ? g * 0.6 : 0} />
                      </span>
                    ))}
                  </span>
                  <span className={cx('w-[22%] text-right font-mono font-bold', g >= 1 ? 'text-warn' : 'text-ink')}>{count}</span>
                </span>
              );
            })}
          </div>
        </At>
      )}
    </>
  );
};

export const COLONY_SCENES: Partial<Record<ShowEventKey, Scene>> = {
  storeFire: StoreFire,
  immigrationWave: Migration,
  epidemic: Epidemic,
  generalStrike: GeneralStrike,
  festival: Festival,
  riot: Riot,
};
