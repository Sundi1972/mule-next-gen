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

type Value = number | boolean | string;

interface Row {
  key: string;
  label: string;
  get: (t: Tunables) => Value;
  set: (t: Tunables, v: Value) => Tunables;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Acts on Play again, not at once. */
  restart?: boolean;
  /** A choice between named options instead of a number. */
  options?: { value: string; label: string }[];
  /** Heiko's question this row answers, in plain words, shown above it. */
  ask?: string;
}

const num = (key: string, label: string, get: (t: Tunables) => number, set: (t: Tunables, v: number) => Tunables, min: number, max: number, step: number, unit?: string, restart?: boolean): Row => ({
  key, label, get, set: (t, v) => set(t, Number(v)), min, max, step, ...(unit ? { unit } : {}), ...(restart ? { restart } : {}),
});
const flag = (key: string, label: string, get: (t: Tunables) => boolean, set: (t: Tunables, v: boolean) => Tunables): Row => ({ key, label, get, set: (t, v) => set(t, !!v) });
const asks = (ask: string, row: Row): Row => ({ ...row, ask });

const TERRAINS = (Object.keys(DEFAULT_TUNABLES.terrain) as WalkTerrain[]).filter((k) => k !== 'lake');
const NAME: Record<string, string> = { food: 'Food', energy: 'Energy', smithore: 'Smithore', crystite: 'Crystite' };
const Q = (t: Tunables, patch: Partial<Tunables['questions']>): Tunables => ({ ...t, questions: { ...t.questions, ...patch } });
const WV = (t: Tunables, patch: Partial<Tunables['wolves']>): Tunables => ({ ...t, wolves: { ...t.wolves, ...patch } });
const wolf = (key: keyof Tunables['wolves'], label: string, min: number, max: number, step: number, unit?: string) =>
  num(`wolves-${key}`, label, (t) => t.wolves[key] as number, (t, v) => WV(t, { [key]: v }), min, max, step, unit);

const GROUPS: { title: string; note?: string; open?: boolean; wolves?: boolean; rows: Row[] }[] = [
  {
    title: 'Heiko’s questions',
    note: 'Your six questions from slice 1, each a switch: flip one and play.',
    open: true,
    rows: [
      asks('Does leading a MULE slow you?', num('leadPace', 'Leading a MULE', (t) => t.leadPace, (t, v) => ({ ...t, leadPace: v }), 0.3, 1, 0.05, '× speed')),
      asks('Mountains: slower, or impassable?', flag('mountainsImpassable', 'Mountains impassable', (t) => t.questions.mountainsImpassable, (t, v) => Q(t, { mountainsImpassable: v }))),
      asks('Lakes: wade across, or install from the shore?', {
        key: 'lakeMode',
        label: 'Lakes',
        get: (t) => t.questions.lakeMode,
        set: (t, v) => Q(t, { lakeMode: v === 'wade' ? 'wade' : 'shore' }),
        options: [
          { value: 'shore', label: 'install from the shore' },
          { value: 'wade', label: 'wade, slow' },
        ],
      }),
      num('terrain-lake', 'Wading speed', (t) => t.terrain.lake, (t, v) => ({ ...t, terrain: { ...t.terrain, lake: v } }), 0.05, 1, 0.05, '×'),
      asks('May you walk across other players’ plots?', flag('trespass', 'Trespass allowed', (t) => t.questions.trespass, (t, v) => Q(t, { trespass: v }))),
      asks('The pub while you lead a MULE: what comes back?', num('pubRefund', 'Refund of what it cost', (t) => t.questions.pubRefund, (t, v) => Q(t, { pubRefund: v }), 0, 1, 0.05, 'share')),
      asks('Are the bots too quick?', num('botSpeed', 'Bot speed', (t) => t.questions.botSpeed, (t, v) => Q(t, { botSpeed: v }), 0.25, 2, 0.05, '×')),
      num('botThinkSeconds', 'Bots pause at a counter', (t) => t.botThinkSeconds, (t, v) => ({ ...t, botThinkSeconds: v }), 0, 3, 0.1, 's'),
    ],
  },
  {
    title: 'Wolves (slice 2)',
    note: 'On forest, hills or tundra a pack may come. Push the stick to RUN, press the button to FIGHT.',
    open: true,
    wolves: true,
    rows: [
      flag('wolves-on', 'Wolves on', (t) => t.wolves.on, (t, v) => WV(t, { on: v })),
      wolf('chancePerSecond', 'Chance a second (forest, hills, tundra)', 0, 0.5, 0.01, '/s'),
      wolf('packSize', 'Pack size', 1, 6, 1),
      wolf('cooldownSeconds', 'Cooldown per colonist', 0, 60, 1, 's'),
      wolf('chooseSeconds', 'Time to choose before they pounce', 1, 10, 0.5, 's'),
      wolf('chaseSpeed', 'Run: wolves’ chase speed', 0.5, 6, 0.1, 'tiles/s'),
      wolf('giveUpSeconds', 'Run: they give up after', 1, 20, 0.5, 's'),
      wolf('giveUpTiles', 'Run: …or this far', 1, 10, 0.5, 'tiles'),
      wolf('bittenPace', 'Run: bitten, your speed', 0.1, 1, 0.05, '×'),
      wolf('fightSeconds', 'Fight: length', 3, 20, 0.5, 's'),
      wolf('lungeEverySeconds', 'Fight: a lunge every', 0.5, 4, 0.1, 's'),
      wolf('warnSeconds', 'Fight: warning before a lunge', 0.2, 2, 0.05, 's'),
      wolf('strikesToWin', 'Fight: strikes to win', 1, 8, 1),
      wolf('bitesToLose', 'Fight: bites to lose', 1, 8, 1),
      wolf('pelts', 'Win: pelts', 0, 6, 1),
      wolf('peltPrice', 'Win: store pays a pelt', 0, 100, 5, 'cr'),
      wolf('boltTiles', 'Lose: MULE bolts this far', 0, 10, 0.5, 'tiles'),
      wolf('boltSpeed', 'Lose: MULE bolts this fast', 0.5, 8, 0.1, 'tiles/s'),
      wolf('stunSeconds', 'Lose, no MULE: stunned', 0, 10, 0.5, 's'),
      wolf('botFightShare', 'Bots that fight', 0, 1, 0.05, 'share'),
      wolf('botDodge', 'Bots dodge a lunge', 0, 1, 0.05, 'chance'),
    ],
  },
  {
    title: 'Walking',
    rows: [
      num('mapTilesPerSecond', 'Map speed on plains', (t) => t.mapTilesPerSecond, (t, v) => ({ ...t, mapTilesPerSecond: v }), 0.5, 8, 0.1, 'tiles/s'),
      num('floorSeconds', 'Store: door to corral', (t) => t.floorSeconds, (t, v) => ({ ...t, floorSeconds: v }), 0.3, 5, 0.1, 's'),
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
    ],
  },
  {
    title: 'Colonists',
    note: 'Food held sets the pace, linear from “no Food” to fed. Money acts on Play again.',
    rows: SEATS.flatMap((s) => [
      num(`${s.id}-food`, `${s.name}: Food held`, (t) => t.seats[s.id]!.food, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, food: v } } }), 0, 12, 1),
      num(`${s.id}-need`, `${s.name}: Food needed`, (t) => t.seats[s.id]!.need, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, need: v } } }), 1, 12, 1),
      flag(`${s.id}-sick`, `${s.name}: sick`, (t) => t.seats[s.id]!.sick, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, sick: v } } })),
      num(`${s.id}-money`, `${s.name}: money`, (t) => t.seats[s.id]!.money, (t, v) => ({ ...t, seats: { ...t.seats, [s.id]: { ...t.seats[s.id]!, money: v } } }), 0, 2000, 10, 'cr', true),
    ]),
  },
  {
    title: 'Later slices: events on the world (0 = off)',
    note: 'Each will be a seeded event in the world’s queue, as the wolves are; not built yet, so a queued one is only logged. Acts on Play again.',
    rows: [
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
  const put = (x: Value) => arcade.setTunables(row.set(arcade.tunables, x));
  // One line a number: its name, a slider, the exact value, its unit. A flag or a choice takes the line's right side.
  const line = (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.25rem_2.25rem] items-center gap-2 text-sm">
      <span className={cx('truncate', changed ? 'font-semibold text-holo' : 'text-ink-2')} title={row.label}>
        {row.label}
        {row.restart && <span className="text-ink-3"> ↻</span>}
      </span>
      {typeof v === 'boolean' ? (
        <input type="checkbox" checked={v} onChange={(e) => put(e.target.checked)} aria-label={row.label} className="col-span-3 justify-self-start accent-[var(--color-holo)]" data-testid={`tunable-${row.key}`} />
      ) : typeof v === 'string' ? (
        <span className="col-span-3 flex flex-wrap gap-x-3 gap-y-0.5" role="radiogroup" aria-label={row.label} data-testid={`tunable-${row.key}`}>
          {row.options!.map((o) => (
            <label key={o.value} className="flex items-center gap-1 text-ink">
              <input type="radio" name={row.key} checked={v === o.value} onChange={() => put(o.value)} className="accent-[var(--color-holo)]" data-testid={`tunable-${row.key}-${o.value}`} />
              {o.label}
            </label>
          ))}
        </span>
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
  if (!row.ask) return line;
  return (
    <div className="mt-1 flex flex-col gap-0.5" data-testid={`question-${row.key}`}>
      <span className="text-sm font-semibold text-ink">{row.ask}</span>
      {line}
    </div>
  );
}

/** Calls a pack for Lena at once, wherever she stands on the map. */
function CallWolves() {
  const arcade = useArcade();
  const me = meOf(useWorld());
  const can = me.space === 'map' && !me.encounter && !me.done;
  return (
    <span className="relative self-start">
      <Button size="md" variant="danger" disabled={!can} onClick={() => arcade.callWolves()} data-testid="call-wolves">
        {me.encounter ? 'Wolves are here' : me.space === 'map' ? 'Call the wolves now' : 'Call the wolves (step outside first)'}
      </Button>
      <IntentMarker note={NOTE.A7} at="tr" />
    </span>
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
      You now: <span className="font-bold text-ink">{s.perSecond.toFixed(2)} {me.space === 'map' ? 'tiles/s' : 'units/s'}</span> = {base} × pace {s.pace.total.toFixed(2)} (hunger {s.pace.hunger.toFixed(2)} × sick {s.pace.sick} × species {s.pace.species}) × lead {s.lead} × bitten {s.bitten} × bot {s.bot}
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
      {GROUPS.map((g) => (
        // The two groups a walk tunes stay open; the rest fold, so the panel stays beside the game.
        <details key={g.title} open={!!g.open} className="group border-t border-holo-faint pt-2" data-testid={`tunables-${g.title.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, '')}`}>
          <summary className="label-caps cursor-pointer select-none">{g.title}</summary>
          <div className="mt-1.5 flex flex-col gap-1">
            {g.note && <p className="text-xs text-ink-3">{g.note}</p>}
            {g.wolves && <CallWolves />}
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
