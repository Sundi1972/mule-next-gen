import { Button, cx, TERRAIN_NAME } from '@mule/ui';
import { MULE } from '@mule/engine';
import { IntentMarker } from '../../proposed/IntentNote';
import { SEATS, TRACK } from './fixture';
import { useArcade, useTunables, useWorld } from './loop';
import { NOTE } from './notes';
import { ARCADE_OUTFITS, DEFAULT_TUNABLES, mulePrice, speedOf, type Tunables, type WalkTerrain } from './sim';
import { meOf } from './views';

/**
 * The tunables panel (A-6): every speed, price and pace the arcade reads, changed while you play. Speeds and paces act
 * at once; money, the corral's MULEs and the later slices' events act on Play again (they set up a turn).
 */

interface Row {
  key: string;
  label: string;
  get: (t: Tunables) => number | boolean;
  set: (t: Tunables, v: number | boolean) => Tunables;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Acts on Play again, not at once. */
  restart?: boolean;
}

const num = (key: string, label: string, get: (t: Tunables) => number, set: (t: Tunables, v: number) => Tunables, min: number, max: number, step: number, unit?: string, restart?: boolean): Row => ({
  key, label, get, set: (t, v) => set(t, Number(v)), min, max, step, ...(unit ? { unit } : {}), ...(restart ? { restart } : {}),
});

const TERRAINS = Object.keys(DEFAULT_TUNABLES.terrain) as WalkTerrain[];
const NAME: Record<string, string> = { food: 'Food', energy: 'Energy', smithore: 'Smithore', crystite: 'Crystite' };

const GROUPS: { title: string; note?: string; rows: Row[] }[] = [
  {
    title: 'Walking',
    rows: [
      num('mapTilesPerSecond', 'Map speed on plains', (t) => t.mapTilesPerSecond, (t, v) => ({ ...t, mapTilesPerSecond: v }), 0.5, 8, 0.1, 'tiles/s'),
      num('floorSeconds', 'Store: door to corral', (t) => t.floorSeconds, (t, v) => ({ ...t, floorSeconds: v }), 0.3, 5, 0.1, 's'),
      num('leadPace', 'Leading a MULE', (t) => t.leadPace, (t, v) => ({ ...t, leadPace: v }), 0.3, 1, 0.05, '× speed'),
      num('leadTiles', 'Lead length', (t) => t.leadTiles, (t, v) => ({ ...t, leadTiles: v }), 0.2, 1.5, 0.05, 'tiles'),
    ],
  },
  {
    title: 'Terrain (share of full speed; 0 is impassable)',
    rows: TERRAINS.map((k) => num(`terrain-${k}`, TERRAIN_NAME[k], (t) => t.terrain[k], (t, v) => ({ ...t, terrain: { ...t.terrain, [k]: v } }), 0, 1.5, 0.05, '×')),
  },
  {
    title: 'Condition pace (DEV_WALK, as the engine works it)',
    rows: [
      num('hungerPaceMin', 'Pace with no Food', (t) => t.hungerPaceMin, (t, v) => ({ ...t, hungerPaceMin: v }), 0, 1, 0.05, '×'),
      num('sickPace', 'Pace when sick', (t) => t.sickPace, (t, v) => ({ ...t, sickPace: v }), 0, 1, 0.05, '×'),
      num('zipwingSpeed', 'Zipwing perk', (t) => t.zipwingSpeed, (t, v) => ({ ...t, zipwingSpeed: v }), 1, 2, 0.05, '×'),
    ],
  },
  {
    title: 'Clock, store and prices',
    rows: [
      num('devSeconds', 'Development', (t) => t.devSeconds, (t, v) => ({ ...t, devSeconds: v }), 10, 120, 1, 's'),
      num('smithorePrice', `Smithore price (MULE = ${MULE.labour} + it)`, (t) => t.smithorePrice, (t, v) => ({ ...t, smithorePrice: v }), 0, 200, 1, 'cr'),
      num('storeMules', 'MULEs in the corral', (t) => t.storeMules, (t, v) => ({ ...t, storeMules: v }), 0, 12, 1, '', true),
      ...ARCADE_OUTFITS.map((g) => num(`outfit-${g}`, `Outfit ${NAME[g]}`, (t) => t.outfit[g], (t, v) => ({ ...t, outfit: { ...t.outfit, [g]: v } }), 0, 300, 5, 'cr')),
      num('botThinkSeconds', 'Bots pause at a counter', (t) => t.botThinkSeconds, (t, v) => ({ ...t, botThinkSeconds: v }), 0, 3, 0.1, 's'),
    ],
  },
  {
    title: 'Colonists',
    note: 'Food held sets the pace, linear from “no Food” to fed. Money acts on Play again.',
    rows: SEATS.flatMap((s) => [
      num(`${s.id}-food`, `${s.name}: Food held`, (t) => t.seats[s.id]!.food, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, food: v } } }), 0, 12, 1),
      num(`${s.id}-need`, `${s.name}: Food needed`, (t) => t.seats[s.id]!.need, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, need: v } } }), 1, 12, 1),
      { key: `${s.id}-sick`, label: `${s.name}: sick`, get: (t: Tunables) => t.seats[s.id]!.sick, set: (t: Tunables, v: number | boolean) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, sick: !!v } } }) },
      num(`${s.id}-money`, `${s.name}: money`, (t) => t.seats[s.id]!.money, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, money: v } } }), 0, 2000, 10, 'cr', true),
    ]),
  },
  {
    title: 'Later slices: events on the world (0 = off)',
    note: 'Each is a seeded event in the world’s queue; slice 1 builds none of them, so a queued one is only logged. Acts on Play again.',
    rows: [
      num('wolves-perMinute', 'Wolves: per minute', (t) => t.events.wolves.perMinute, (t, v) => ({ ...t, events: { ...t.events, wolves: { ...t.events.wolves, perMinute: v } } }), 0, 6, 0.5, '/min', true),
      num('wolves-reward', 'Wolves: reward for a fight', (t) => t.events.wolves.reward, (t, v) => ({ ...t, events: { ...t.events, wolves: { ...t.events.wolves, reward: v } } }), 0, 300, 5, 'cr', true),
      num('wolves-cost', 'Wolves: cost of a bite', (t) => t.events.wolves.cost, (t, v) => ({ ...t, events: { ...t.events, wolves: { ...t.events.wolves, cost: v } } }), 0, 300, 5, 'cr', true),
      num('glint-perMinute', 'Glint: per minute', (t) => t.events.glint.perMinute, (t, v) => ({ ...t, events: { ...t.events, glint: { ...t.events.glint, perMinute: v } } }), 0, 6, 0.5, '/min', true),
      num('glint-reward', 'Glint: Crystite find', (t) => t.events.glint.reward, (t, v) => ({ ...t, events: { ...t.events, glint: { ...t.events.glint, reward: v } } }), 0, 300, 5, 'cr', true),
      num('scramble-perMinute', 'Corral scramble: per minute', (t) => t.events.scramble.perMinute, (t, v) => ({ ...t, events: { ...t.events, scramble: { ...t.events.scramble, perMinute: v } } }), 0, 6, 0.5, '/min', true),
      num('scramble-mulesLeft', 'Corral scramble: at MULEs left', (t) => t.events.scramble.mulesLeft, (t, v) => ({ ...t, events: { ...t.events, scramble: { ...t.events.scramble, mulesLeft: v } } }), 0, 6, 1, '', true),
    ],
  },
];

function RowInput({ row }: { row: Row }) {
  const arcade = useArcade();
  const tun = useTunables();
  const v = row.get(tun);
  const changed = v !== row.get(DEFAULT_TUNABLES);
  const put = (x: number | boolean) => arcade.setTunables(row.set(arcade.tunables, x));
  // One line a number: its name, a slider, the exact value, its unit.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.25rem_2.25rem] items-center gap-2 text-sm">
      <span className={cx('truncate', changed ? 'font-semibold text-holo' : 'text-ink-2')} title={row.label}>
        {row.label}
        {row.restart && <span className="text-ink-3"> ↻</span>}
      </span>
      {typeof v === 'boolean' ? (
        <input type="checkbox" checked={v} onChange={(e) => put(e.target.checked)} aria-label={row.label} className="col-span-3 justify-self-start accent-[var(--color-holo)]" data-testid={`tunable-${row.key}`} />
      ) : (
        <>
          <input type="range" value={v} min={row.min} max={row.max} step={row.step} onChange={(e) => put(Number(e.target.value))} className="w-full accent-[var(--color-holo)]" aria-label={row.label} data-testid={`tunable-${row.key}-range`} />
          <input
            type="number"
            value={v}
            min={row.min}
            max={row.max}
            step={row.step}
            aria-label={row.label}
            onChange={(e) => e.target.value !== '' && Number.isFinite(Number(e.target.value)) && put(Number(e.target.value))}
            className="w-full rounded-chip border border-holo-line bg-raised px-1 py-0.5 text-right font-mono text-ink"
            data-testid={`tunable-${row.key}`}
          />
          <span className="truncate font-mono text-xs text-ink-3">{row.unit ?? ''}</span>
        </>
      )}
    </div>
  );
}

/** What your speed is made of right now: base × land × pace × lead. */
function SpeedReadout() {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const s = speedOf(world, me, tun);
  const base = me.space === 'map' ? `${tun.mapTilesPerSecond.toFixed(2)} tiles/s × ${s.terrain ? TERRAIN_NAME[s.terrain] : ''} ${s.ground}` : 'store floor';
  return (
    <p className="rounded-control border border-holo-faint p-2 font-mono text-xs text-ink-2" data-testid="speed-readout" data-speed={s.perSecond.toFixed(4)}>
      You now: <span className="font-bold text-ink">{s.perSecond.toFixed(2)} {me.space === 'map' ? 'tiles/s' : 'units/s'}</span> = {base} × pace {s.pace.total.toFixed(2)} (hunger {s.pace.hunger.toFixed(2)} × sick {s.pace.sick} × species {s.pace.species}) × lead {s.lead}
    </p>
  );
}

function Autopilot({ tv }: { tv: boolean }) {
  const arcade = useArcade();
  const me = meOf(useWorld());
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <input type="checkbox" checked={me.bot} onChange={(e) => arcade.setAutopilot(e.target.checked)} className="accent-[var(--color-holo)]" data-testid="autopilot" />
      Lena on autopilot (a bot plays her){tv ? ': on for the TV' : ''}
    </label>
  );
}

function EventQueue() {
  const world = useWorld();
  return (
    <p className="font-mono text-xs text-ink-3" data-testid="event-queue">
      Events queued this turn: {world.queue.length}
      {world.log.length > 0 && ` · last: ${world.log[world.log.length - 1]}`}
    </p>
  );
}

/** Only the readout, the autopilot and the queue read the world: the rows render on a tunable's change, not every frame. */
export function TunablesPanel({ className, autopilot = false }: { className?: string; autopilot?: boolean }) {
  const arcade = useArcade();
  const tun = useTunables();
  return (
    <aside className={cx('relative flex flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4', className)} aria-label="Tunables" data-testid="tunables">
      <IntentMarker note={NOTE.A6} at="tl" />
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-lg font-semibold">Tunables</h2>
        <Button size="md" variant="outline" onClick={() => arcade.setTunables(DEFAULT_TUNABLES)} data-testid="tunables-reset">
          Reset to defaults
        </Button>
        <Button size="md" variant="holo" onClick={() => arcade.restart()} data-testid="arcade-restart">
          Play again
        </Button>
      </header>
      <p className="text-sm text-ink-2">
        Change any number while you play: speeds act at once, ↻ on Play again. The MULE costs {mulePrice(tun)} cr. Changed numbers show in colour.
      </p>
      <SpeedReadout />
      <div className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="test-track">
        <span className="text-ink-2">Put me on:</span>
        {(Object.keys(TRACK) as WalkTerrain[]).map((k) => (
          <button key={k} type="button" onClick={() => arcade.dropOn(k)} className="rounded-chip border border-holo-line px-1.5 py-0.5 text-ink hover:border-holo" data-testid={`drop-${k}`}>
            {TERRAIN_NAME[k]}
          </button>
        ))}
      </div>
      <Autopilot tv={autopilot} />
      {GROUPS.map((g, i) => (
        // The two groups a walk tunes stay open; the rest fold, so the panel stays beside the game.
        <details key={g.title} open={i < 2} className="group border-t border-holo-faint pt-2" data-testid={`tunables-${g.title.split(' ')[0]!.toLowerCase()}`}>
          <summary className="label-caps cursor-pointer select-none">{g.title}</summary>
          <div className="mt-1.5 flex flex-col gap-1">
            {g.note && <p className="text-xs text-ink-3">{g.note}</p>}
            {g.rows.map((r) => (
              <RowInput key={r.key} row={r} />
            ))}
          </div>
        </details>
      ))}
      <EventQueue />
    </aside>
  );
}
