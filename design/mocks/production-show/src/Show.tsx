import { Button, Creature, cx, GOOD_NAME, GoodIcon, HoloMap, SLOT_COLOR, type Good } from '@mule/ui';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { actAt, byId, clusterMates, finalUnits, H, harvestOf, inSilo, ME, PACE, PLAYERS, sum, TILES, timeline, unitsAt, W, type Act, type Beat, type Order, type Timeline, type Why } from './timeline';

/**
 * The production show, three acts on one map. DS-GAP (WS6): the plot spotlight, the cluster links, the flying goods
 * and the silos are new; they belong in packages/ui/src/components/ProductionMap.tsx (WS6's) once approved. The
 * month's events keep WS8's show, unchanged, in the slot between the bonuses and the flight.
 */

// --- The clock -----------------------------------------------------------------------

/** Show time: plays in real time, pauses, scrubs, and plays `PACE.fast` times faster once the table asks. */
export function useClock(end: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fastFrom, setFastFrom] = useState<number | null>(null);
  const rate = fastFrom !== null && t >= fastFrom ? PACE.fast : 1;
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      setT((x) => {
        const next = Math.min(end, x + ((now - last) / 1000) * rate);
        if (next >= end) setPlaying(false);
        return next;
      });
      last = now;
    }, 33);
    return () => clearInterval(id);
  }, [playing, rate, end]);
  return {
    t,
    playing,
    fast: fastFrom !== null && t >= fastFrom,
    play: () => {
      if (t >= end) setT(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    seek: (s: number) => {
      setPlaying(false);
      setT(s);
    },
    restart: () => {
      setT(0);
      setFastFrom(null);
      setPlaying(true);
    },
    speedUp: () => setFastFrom(t),
  };
}
export type Clock = ReturnType<typeof useClock>;

// --- What the table asked for --------------------------------------------------------

/** Who has tapped Speed up. The computer players always agree, so only the people at the table are waited for. */
export type Asked = Record<string, boolean>;
export const humans = PLAYERS.filter((p) => !p.ai);
export const everyoneAsked = (asked: Asked) => humans.every((p) => asked[p.id]);

// --- Where the goods fly to ------------------------------------------------------------

const RootContext = createContext<RefObject<HTMLDivElement> | null>(null);

/** The box the show looks in for `data-silo` elements, the places each player's goods fly to. */
export function ShowRoot({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <RootContext.Provider value={ref}>
      <div ref={ref} className={cx('relative', className)}>
        {children}
      </div>
    </RootContext.Provider>
  );
}

type Geometry = { w: number; h: number; to: Record<string, { x: number; y: number }> };

/** Each silo's centre in the map's own pixels, measured once the screen has laid out. */
function useSilos(map: RefObject<HTMLDivElement>): Geometry | null {
  const root = useContext(RootContext);
  const [geom, setGeom] = useState<Geometry | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (!map.current || !root?.current) return;
      const m = map.current.getBoundingClientRect();
      const scale = m.width / map.current.offsetWidth || 1;
      const to: Geometry['to'] = {};
      root.current.querySelectorAll<HTMLElement>('[data-silo]').forEach((el) => {
        const r = el.getBoundingClientRect();
        to[el.dataset.silo!] = { x: (r.left + r.width / 2 - m.left) / scale, y: (r.top + r.height / 2 - m.top) / scale };
      });
      setGeom({ w: map.current.offsetWidth, h: map.current.offsetHeight, to });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return geom;
}

// --- The map --------------------------------------------------------------------------

const BADGE: Record<Why, { label: string; bonus: string; loss: string; icon?: Good }> = {
  cluster: { label: 'Next to your own plot of the same good', bonus: 'bg-ok text-on-holo', loss: 'bg-warn text-void' },
  species: { label: 'Your species is good at this', bonus: 'bg-ok text-on-holo', loss: 'bg-warn text-void' },
  trait: { label: 'Something about this ground', bonus: 'bg-ok text-on-holo', loss: 'bg-warn text-void' },
  pollution: { label: 'Polluted ground', bonus: 'bg-warn text-void', loss: 'bg-warn text-void' },
  noWater: { label: 'A farm with no Water makes half', bonus: 'bg-alert text-white', loss: 'bg-alert text-white', icon: 'water' },
  noEnergy: { label: 'No Energy for the plot: half', bonus: 'bg-alert text-white', loss: 'bg-alert text-white', icon: 'energy' },
};
const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function ShowMap({ tl, t, tv, only }: { tl: Timeline; t: number; tv: boolean; only?: string }) {
  const map = useRef<HTMLDivElement>(null);
  const geom = useSilos(map);
  const act = actAt(tl, t);
  const focus = only ? byId(only).slot : undefined;
  return (
    <div ref={map} className="relative" data-testid="show-map">
      <HoloMap width={W} height={H} tiles={TILES} density={tv ? 'tv' : 'phone'} hideGround {...(focus !== undefined ? { focusSlot: focus } : {})} className="w-full" />
      {/* The bonus pass dims the map a little, so the plot being worked on stands out. */}
      <div className={cx('pointer-events-none absolute inset-0 rounded-panel bg-void transition-opacity duration-500', act === 'bonus' ? 'opacity-30' : 'opacity-0')} />
      <ClusterLinks tl={tl} t={t} />
      {tl.beats.map((b) => (only === undefined || b.plot.owner === only) && <PlotShow key={`${b.plot.x},${b.plot.y}`} beat={b} t={t} tv={tv} act={act} />)}
      {geom && tl.beats.map((b) => (only === undefined || b.plot.owner === only) && <Flight key={`f${b.plot.x},${b.plot.y}`} beat={b} t={t} tv={tv} geom={geom} />)}
    </div>
  );
}

/** While a cluster bonus lands, a glowing line joins the plot to the neighbours it comes from. */
function ClusterLinks({ tl, t }: { tl: Timeline; t: number }) {
  const live = tl.mods.filter((m) => m.mod.why === 'cluster' && t >= m.at - 0.15 && t < m.at + 0.9);
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-testid="cluster-links">
      {live.flatMap((m) =>
        clusterMates(m.plot).map((o) => {
          const k = clamp01((t - (m.at - 0.15)) / 0.25);
          const fade = 1 - clamp01((t - m.at - 0.5) / 0.4);
          const x1 = m.plot.x + 0.5;
          const y1 = m.plot.y + 0.5;
          return (
            <line
              key={`${m.plot.x},${m.plot.y}-${o.x},${o.y}`}
              x1={x1}
              y1={y1}
              x2={x1 + (o.x + 0.5 - x1) * k}
              y2={y1 + (o.y + 0.5 - y1) * k}
              stroke="var(--color-ok)"
              strokeWidth={5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.9 * fade}
              style={{ filter: 'drop-shadow(0 0 4px var(--color-ok))' }}
            />
          );
        }),
      )}
    </svg>
  );
}

/** One plot: its spotlight while it works, its bars counting up, its badges as they land. */
function PlotShow({ beat, t, tv, act }: { beat: Beat; t: number; tv: boolean; act: Act }) {
  const { plot } = beat;
  const colour = SLOT_COLOR[byId(plot.owner).slot];
  const units = unitsAt(beat, t);
  const making = t >= beat.harvestAt && t < beat.harvestAt + plot.base * PACE.unitStep + 0.35;
  const modLanding = beat.modAt.findIndex((at) => t >= at - 0.1 && t < at + 0.6);
  const lit = making || modLanding >= 0;
  const flown = t >= beat.flyAt;
  // What the last loss took, falling away in grey for a moment.
  const lossIdx = beat.modAt.findLastIndex((at, i) => plot.mods[i]!.delta < 0 && t >= at && t < at + 0.8);
  const lost = lossIdx >= 0 ? -plot.mods[lossIdx]!.delta : 0;
  const lostAgo = lossIdx >= 0 ? t - beat.modAt[lossIdx]! : 0;
  // A bonus unit glows green as it arrives.
  const gainIdx = beat.modAt.findLastIndex((at, i) => plot.mods[i]!.delta > 0 && t >= at && t < at + 0.7);
  const gained = gainIdx >= 0 ? plot.mods[gainIdx]!.delta : 0;
  const bar = tv ? 'h-3.5 w-1.5' : 'h-3 w-1.5 ring-1 ring-void/70';
  const dim = act === 'bonus' && !lit && plot.mods.length === 0;

  return (
    <div
      className={cx('pointer-events-none absolute flex flex-col justify-end transition-opacity duration-300', tv ? 'p-1' : 'p-0.5', dim && 'opacity-50')}
      style={{ left: `${(plot.x / W) * 100}%`, top: `${(plot.y / H) * 100}%`, width: `${100 / W}%`, height: `${100 / H}%` }}
      data-testid={`plot-${plot.x}-${plot.y}`}
    >
      {/* Until its turn a working plot waits in the dark, so the order the plots make in reads across the map. */}
      {t < beat.harvestAt && <span className="absolute inset-0 rounded-[4px] bg-void/65" data-testid="waiting" />}
      {/* The spotlight: the plot being worked on rings in its owner's colour and lifts a little. */}
      {lit && !flown && (
        <span
          className="absolute inset-0 rounded-[4px]"
          style={{ boxShadow: `0 0 0 ${tv ? 3 : 2}px ${modLanding >= 0 ? (plot.mods[modLanding]!.delta > 0 ? 'var(--color-ok)' : 'var(--color-alert)') : colour}, 0 0 ${tv ? 18 : 10}px ${modLanding >= 0 ? (plot.mods[modLanding]!.delta > 0 ? 'var(--color-ok)' : 'var(--color-alert)') : colour}` }}
          data-testid="spotlight"
        />
      )}
      {/* The count, bottom right: the number you read from the couch. */}
      {units > 0 && !flown && (
        <span
          data-num
          className={cx('absolute bottom-0.5 right-0.5 rounded-chip bg-void/85 font-mono font-bold leading-none text-ink', tv ? 'px-1.5 py-0.5 text-lg' : 'px-0.5 text-[11px]', lit && 'scale-125')}
          style={{ transition: 'transform 0.15s' }}
          data-testid="plot-count"
        >
          {units}
        </span>
      )}
      {/* Badges, top right: each bonus or loss, in the order it landed. */}
      {!flown && (
        <span className={cx('absolute flex flex-col items-end', tv ? 'right-1 top-1 gap-0.5' : 'right-0.5 top-0.5 gap-px')}>
          {plot.mods.map(
            (m, i) =>
              t >= beat.modAt[i]! && (
                <span
                  key={m.why}
                  data-badge={m.why}
                  className={cx('flex items-center rounded-chip font-mono font-bold leading-none shadow-chip animate-[show-badge-in_0.3s_ease-out]', m.delta > 0 ? BADGE[m.why].bonus : BADGE[m.why].loss, tv ? 'gap-0.5 px-1 py-0.5 text-[11px]' : 'px-0.5 text-[9px]')}
                >
                  {BADGE[m.why].icon && <GoodIcon good={BADGE[m.why].icon!} size={tv ? 10 : 6} />}
                  {m.why === 'noWater' || m.why === 'noEnergy' ? '½' : signed(m.delta)}
                </span>
              ),
          )}
        </span>
      )}
      {/* One bar per unit, at most eight. */}
      {!flown && (
        <span className={cx('flex w-fit flex-wrap-reverse items-end', tv ? 'max-w-[44px] gap-[3px]' : 'max-w-[30px] gap-px')}>
          {Array.from({ length: Math.min(units, 8) }, (_, k) => {
            const fresh = gained > 0 && k >= units - gained;
            const rise = clamp01((t - beat.harvestAt - k * PACE.unitStep) / 0.18);
            return (
              <span
                key={k}
                data-bar="unit"
                className={cx('rounded-[2px] shadow-chip', bar)}
                style={{ background: colour, transform: `scaleY(${k < plot.base ? rise : 1})`, transformOrigin: 'bottom', boxShadow: fresh ? '0 0 0 2px var(--color-ok), 0 0 8px var(--color-ok)' : undefined }}
              />
            );
          })}
          {Array.from({ length: Math.min(lost, 8) }, (_, k) => (
            <span key={`lost-${k}`} data-bar="lost" className={cx('rounded-[2px] bg-ink-3', bar)} style={{ transform: `translateY(${lostAgo * (tv ? 40 : 20)}px)`, opacity: 1 - lostAgo / 0.8 }} />
          ))}
        </span>
      )}
    </div>
  );
}

/** The plot's goods in flight: a chip with the count and the good, arcing up and over into the owner's silo. */
function Flight({ beat, t, tv, geom }: { beat: Beat; t: number; tv: boolean; geom: Geometry }) {
  const p = (t - beat.flyAt) / PACE.flight;
  const n = finalUnits(beat.plot);
  const to = geom.to[beat.plot.owner];
  if (p < 0 || p >= 1 || n === 0 || !to) return null;
  const from = { x: ((beat.plot.x + 0.5) / W) * geom.w, y: ((beat.plot.y + 0.5) / H) * geom.h };
  // Ease in along the line, and lift into an arc on the way.
  const e = p * p * (3 - 2 * p);
  const x = from.x + (to.x - from.x) * e;
  const y = from.y + (to.y - from.y) * e - (tv ? 90 : 40) * 4 * p * (1 - p);
  const scale = 1 - 0.35 * p;
  const colour = SLOT_COLOR[byId(beat.plot.owner).slot];
  return (
    <span
      className={cx('pointer-events-none absolute z-20 flex items-center rounded-chip border-2 bg-panel font-mono font-bold shadow-chip', tv ? 'gap-1 px-1.5 py-0.5 text-base' : 'gap-0.5 px-1 text-[10px]')}
      style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${scale})`, borderColor: colour }}
      data-testid="flying-goods"
    >
      +{n}
      <GoodIcon good={beat.plot.good} size={tv ? 18 : 11} />
    </span>
  );
}

// --- The silos (TV) -----------------------------------------------------------------------

/** Each player's silo along the foot of the screen: this month's harvest only, never what they already hold. */
function SiloBar({ tl, t, asked }: { tl: Timeline; t: number; asked: Asked }) {
  const most = Math.max(...PLAYERS.map((p) => sum(harvestOf(p.id))));
  const turn = tl.order === 'player' ? [...tl.turns].reverse().find((x) => t >= x.at)?.owner : undefined;
  const act = actAt(tl, t);
  return (
    <div className="grid grid-cols-4 gap-3" data-testid="silo-bar">
      {PLAYERS.map((p) => {
        const got = inSilo(tl, p.id, t);
        const landing = tl.beats.some((b) => b.plot.owner === p.id && t >= b.flyAt + PACE.flight && t < b.flyAt + PACE.flight + 0.3);
        const theirs = turn === p.id && act === 'harvest';
        return <Silo key={p.id} id={p.id} got={got} fill={sum(got) / most} glow={landing || theirs} making={theirs} asked={!p.ai && asked[p.id] === true} />;
      })}
    </div>
  );
}

function Silo({ id, got, fill, glow, making, asked }: { id: string; got: Partial<Record<Good, number>>; fill: number; glow: boolean; making: boolean; asked: boolean }) {
  const p = byId(id);
  const colour = SLOT_COLOR[p.slot];
  return (
    <div className={cx('flex h-[92px] items-stretch gap-3 rounded-panel border-2 bg-panel px-3 py-2 transition-shadow', glow && 'shadow-glow')} style={{ borderColor: colour }} data-testid={`silo-${id}`}>
      <span className="flex w-16 shrink-0 flex-col items-center justify-center gap-1">
        <Creature species={p.species} color={colour} size={40} />
        <span className="font-display text-lg font-semibold leading-none">{p.name}</span>
      </span>
      {/* The silo: a vessel in the player's colour that fills as their goods land. */}
      <span data-silo={id} className="relative flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-t-[22px] rounded-b-control border-2 bg-raised" style={{ borderColor: colour }}>
        <span className="absolute inset-x-0 bottom-0 transition-[height] duration-300" style={{ height: `${Math.round(fill * 100)}%`, background: `color-mix(in srgb, ${colour} 28%, transparent)` }} />
        <span className="relative flex flex-wrap items-end justify-center gap-x-2 gap-y-0.5 px-1 pb-1">
          {(Object.entries(got) as [Good, number][]).map(([g, n]) => (
            <span key={g} data-num className="flex items-center gap-0.5 font-mono text-base font-bold text-ink" data-good={g}>
              <GoodIcon good={g} size={18} />
              {n}
            </span>
          ))}
          {making && <span className="label-caps pb-1 text-holo">making…</span>}
        </span>
        {asked && <span className="absolute right-1 top-1 rounded-chip bg-holo-soft px-1 font-mono text-xs text-holo" title={`${p.name} asked to speed up`}>⏩</span>}
      </span>
    </div>
  );
}

// --- The TV rail ------------------------------------------------------------------------------

const ACTS: { id: Act; n: number; title: string; line: (tl: Timeline) => string }[] = [
  { id: 'harvest', n: 1, title: 'Harvest', line: (tl) => (tl.order === 'scan' ? 'Every plot makes what its ground gives, one after the next.' : 'Player by player, every plot makes what its ground gives.') },
  { id: 'bonus', n: 2, title: 'Bonuses and losses', line: () => 'Plots next to their own kind make more. Plots short of Energy or Water, or on polluted ground, make less.' },
  { id: 'events', n: 3, title: 'This month on Irata', line: () => 'The month’s events play over the map.' },
  { id: 'flight', n: 4, title: 'Into the silos', line: () => 'Every plot’s goods fly home to its owner’s silo.' },
];

function Rail({ tl, t, asked, fast }: { tl: Timeline; t: number; asked: Asked; fast: boolean }) {
  const act = actAt(tl, t);
  const acts = ACTS.filter((a) => a.id !== 'events' || tl.acts.events !== null);
  const at = act === 'hold' ? 'flight' : act === 'intro' ? 'harvest' : act;
  const seen = new Set(tl.mods.filter((m) => t >= m.at).map((m) => m.mod.why));
  const turn = tl.order === 'player' && act === 'harvest' ? [...tl.turns].reverse().find((x) => t >= x.at)?.owner : undefined;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4" data-testid="rail">
      <ol className="flex flex-col gap-2" data-testid="acts">
        {acts.map((a, i) => {
          const now = a.id === at;
          const done = acts.findIndex((x) => x.id === at) > i;
          return (
            <li key={a.id} className={cx('flex items-baseline gap-3 rounded-control px-3 py-2 transition-colors', now ? 'bg-holo-soft' : '')} data-testid={`act-${a.id}`}>
              <span className={cx('font-mono text-lg font-bold', now ? 'text-holo' : done ? 'text-ok' : 'text-ink-3')}>{done ? '✓' : i + 1}</span>
              <span className="flex flex-col gap-1">
                <span className={cx('font-display text-2xl font-semibold leading-none', now ? 'text-ink' : 'text-ink-3')}>{a.title}</span>
                {now && <span className="text-lg leading-snug text-ink-2">{turn ? `${byId(turn).name}’s plots.` : a.line(tl)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {/* The reasons light up as each first appears on the map. */}
      {(act === 'bonus' || seen.size > 0) && act !== 'hold' && act !== 'flight' && (
        <ul className="flex flex-col gap-1.5" data-testid="why-legend">
          {(Object.keys(BADGE) as Why[])
            .filter((w) => tl.mods.some((m) => m.mod.why === w))
            .map((w) => (
              <li key={w} className={cx('flex items-center gap-3 text-base leading-snug transition-opacity', seen.has(w) ? 'text-ink-2' : 'opacity-30')}>
                <span className={cx('flex w-11 shrink-0 items-center justify-center gap-0.5 rounded-chip px-1 py-0.5 font-mono text-sm font-bold', w === 'pollution' || w === 'noWater' || w === 'noEnergy' ? BADGE[w].loss : BADGE[w].bonus)}>
                  {BADGE[w].icon && <GoodIcon good={BADGE[w].icon!} size={12} />}
                  {w === 'noWater' || w === 'noEnergy' ? '½' : w === 'pollution' ? '−1' : '+1'}
                </span>
                {BADGE[w].label}
              </li>
            ))}
        </ul>
      )}
      {act === 'events' && (
        <div className="rounded-panel border-2 border-dashed border-holo-line p-4 text-lg text-ink-2" data-testid="event-slot">
          <span className="label-caps text-base! text-holo">Dust storm</span>
          <p>WS8’s event show plays here, as it does today: its own card, its own sweep across the map, its own length.</p>
        </div>
      )}
      <SpeedUpChips asked={asked} fast={fast} />
    </div>
  );
}

/** Who has asked to speed up, at the rail's foot; the computer players always agree. */
function SpeedUpChips({ asked, fast }: { asked: Asked; fast: boolean }) {
  const n = humans.filter((p) => asked[p.id]).length;
  if (n === 0) return <p className="mt-auto text-base text-ink-3">In a hurry? Everyone taps ⏩ on their phone to speed it up.</p>;
  return (
    <div className={cx('mt-auto flex items-center gap-3 rounded-control px-3 py-2', fast ? 'bg-holo-soft' : 'bg-raised')} data-testid="speed-up">
      <span className="font-mono text-2xl text-holo">⏩</span>
      <span className="text-lg leading-snug text-ink">{fast ? `Everyone asked: playing ${PACE.fast}× faster` : `${n} of ${humans.length} asked to speed up. Waiting for ${humans.filter((p) => !asked[p.id]).map((p) => p.name).join(' and ')}.`}</span>
    </div>
  );
}

// --- The two screens -----------------------------------------------------------------------------

/** The big screen, at its design size 1280 × 720. */
export function TvShow({ order, withEvent, t, asked, fast }: { order: Order; withEvent: boolean; t: number; asked: Asked; fast: boolean }) {
  const tl = useMemo(() => timeline(order, withEvent), [order, withEvent]);
  return (
    <ShowRoot className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink">
      {/* Today's TvHeader, unchanged: month, phase name, the chat ticker. */}
      <header className="flex flex-col gap-1">
        <span className="label-caps text-base!">Month 5 / 12</span>
        <h1 className="font-display text-5xl font-semibold leading-none">Production</h1>
      </header>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="w-[760px] shrink-0 self-start">
          <ShowMap tl={tl} t={t} tv />
        </div>
        <Rail tl={tl} t={t} asked={asked} fast={fast} />
      </div>
      <SiloBar tl={tl} t={t} asked={asked} />
    </ShowRoot>
  );
}

const GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'];
/** Lena's stock before this month's harvest (her own, private). */
const BEFORE: Partial<Record<Good, number>> = { food: 2, water: 1, energy: 1, alloy: 1 };

/** Lena's phone, held sideways, with the TV in the room: her plots on the map, her silo, Speed up. */
export function PhoneShow({ order, withEvent, t, asked, onAsk }: { order: Order; withEvent: boolean; t: number; asked: Asked; onAsk: () => void }) {
  const tl = useMemo(() => timeline(order, withEvent), [order, withEvent]);
  const act = actAt(tl, t);
  const got = inSilo(tl, ME, t);
  const mine = harvestOf(ME);
  const landing = tl.beats.some((b) => b.plot.owner === ME && t >= b.flyAt + PACE.flight && t < b.flyAt + PACE.flight + 0.3);
  const done = t >= tl.acts.end;
  const words: Record<Act, string> = {
    intro: 'Your plots are about to work.',
    harvest: 'Your plots are making their goods.',
    bonus: 'Bonuses and losses: watch your plots.',
    events: 'An event is playing on the TV.',
    flight: 'Your goods are flying into your silo.',
    hold: 'In your silo.',
  };
  return (
    <ShowRoot className="flex h-full w-full bg-table text-ink">
      <div className="flex min-w-0 flex-1 flex-col p-2">
        <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div style={{ width: `min(100cqw, calc(100cqh * ${W} / ${H}))` }}>
            <ShowMap tl={tl} t={t} tv={false} only={ME} />
          </div>
        </div>
        {/* Your silo: everything you hold, the harvest counting in as it lands. */}
        <div data-silo={ME} className={cx('mt-1.5 flex h-9 shrink-0 items-center gap-2 rounded-control border-2 bg-panel px-2 transition-shadow', landing && 'shadow-glow')} style={{ borderColor: SLOT_COLOR[0] }} data-testid="phone-silo">
          <span className="label-caps shrink-0">Your silo</span>
          <span className="flex flex-1 items-center justify-between">
            {GOODS.map((g) => {
              const n = (BEFORE[g] ?? 0) + (got[g] ?? 0);
              return (
                <span key={g} className="flex items-center gap-0.5" aria-label={`${GOOD_NAME[g]} ${n}`}>
                  <GoodIcon good={g} size={13} />
                  <span data-num className={cx('font-mono text-xs font-bold', (got[g] ?? 0) > 0 ? 'text-ok' : 'text-ink')}>
                    {n}
                  </span>
                </span>
              );
            })}
          </span>
        </div>
      </div>
      <aside className="flex w-[var(--rail)] shrink-0 flex-col gap-2 border-l border-holo-line bg-panel p-3" data-testid="phone-rail">
        <span className="label-caps">Production · month 5</span>
        <p className="font-display text-lg font-semibold leading-snug">{words[act]}</p>
        <ul className="flex flex-col gap-1" data-testid="harvest">
          {(Object.entries(mine) as [Good, number][]).map(([g, n]) => (
            <li key={g} className="flex items-center justify-between rounded-control bg-raised px-2 py-1">
              <span className="flex items-center gap-1.5 text-sm">
                <GoodIcon good={g} size={14} />
                {GOOD_NAME[g]}
              </span>
              <span data-num className="font-mono text-sm font-bold">
                {(got[g] ?? 0) > 0 ? `+${got[g]}` : act === 'flight' || act === 'hold' ? `+${n}` : '…'}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1.5">
          {!done && (
            <Button size="md" variant={asked[ME] ? 'outline' : 'ghost'} className="w-full" disabled={asked[ME]} onClick={onAsk} data-testid="speed-up-button">
              {asked[ME] ? `⏩ Asked: ${humans.filter((p) => asked[p.id]).length} of ${humans.length}` : '⏩ Speed up'}
            </Button>
          )}
          <Button size="lg" variant={done ? 'holo' : 'outline'} className="w-full px-2" disabled={!done} data-testid="ready">
            {done ? 'On to the auction' : 'Watching the show'}
          </Button>
        </div>
      </aside>
    </ShowRoot>
  );
}
