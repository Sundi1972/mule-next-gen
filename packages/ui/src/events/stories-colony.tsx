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
 * The colony's and the store's stories, the gallery's own (design/mocks/ws8-events src/stories.tsx): the store fire,
 * the immigration wave's shuttle and the epidemic's haze. Reduced motion: nothing travels; each shows its outcome.
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

export const COLONY_SCENES: Partial<Record<ShowEventKey, Scene>> = {
  storeFire: StoreFire,
  immigrationWave: Migration,
  epidemic: Epidemic,
};
