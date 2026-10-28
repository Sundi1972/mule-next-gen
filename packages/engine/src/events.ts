import { EVENTS, GAME } from './config.js';
import { neighbours } from './map.js';
import { airBand } from './pollution.js';
import { createRng } from './rng.js';
import { RAW_GOODS, type EventKey, type EventKind, type GameState, type Good, type MonthEvent, type Phase, type Tile } from './types.js';

type Rng = ReturnType<typeof createRng>;
type Direction = NonNullable<MonthEvent['direction']>;

/** How each event looks and reads; the numbers in the lines come from EVENTS. */
const SHAPE: Record<EventKey, { kind: EventKind; title: string; scope: MonthEvent['scope']; sign: MonthEvent['sign']; line: () => string }> = {
  dustStorm: { kind: 'storm', title: 'Dust storm', scope: 'colony', sign: 'bad', line: () => `A dust storm takes ${pct(EVENTS.dustStorm.cut)} of every Energy plot's output.` },
  drought: { kind: 'drought', title: 'Drought', scope: 'colony', sign: 'bad', line: () => `Drought: every Food and Water plot makes ${EVENTS.drought.loss} less.` },
  acidRain: { kind: 'storm', title: 'Acid rain', scope: 'colony', sign: 'bad', line: () => `Acid rain: every Energy and Food plot makes ${EVENTS.acidRain.loss} less.` },
  solarFlare: { kind: 'flare', title: 'Solar flare', scope: 'colony', sign: 'good', line: () => `A solar flare: every Energy plot makes ${EVENTS.solarFlare.gain} more.` },
  cometPass: { kind: 'comet', title: 'Comet pass', scope: 'colony', sign: 'good', line: () => `A comet passes: every Water plot makes ${EVENTS.cometPass.gain} more.` },
  flood: { kind: 'flood', title: 'Flood season', scope: 'local', sign: 'bad', line: () => 'The river floods: Food plots on the river make nothing.' },
  volcanicAsh: { kind: 'quake', title: 'Volcanic ash', scope: 'local', sign: 'bad', line: () => `Ash falls: plots near the volcano make ${EVENTS.volcanicAsh.loss} less.` },
  pestSwarm: { kind: 'blight', title: 'Pest swarm', scope: 'personal', sign: 'bad', line: () => `Pests eat ${pct(EVENTS.pestSwarm.cut)} of the Food on the plots they reach.` },
  wildfire: { kind: 'fire', title: 'Wildfire', scope: 'personal', sign: 'bad', line: () => 'A fire burns one Food plot and scorches the farms joined to it.' },
  bumperHarvest: { kind: 'bounty', title: 'Bumper harvest', scope: 'personal', sign: 'good', line: () => `One plot makes ${EVENTS.bumperHarvest.factor} times its usual output.` },
};

/** The goods a colony-wide event touches. */
const COLONY_GOODS: Partial<Record<EventKey, readonly Good[]>> = {
  dustStorm: ['energy'],
  drought: ['food', 'water'],
  acidRain: ['energy', 'food'],
  solarFlare: ['energy'],
  cometPass: ['water'],
};

const pct = (share: number) => `${Math.round(share * 100)}%`;
const steps = (a: Tile, b: Tile) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * The month's production event, or none: never on a what-if copy, never
 * before EVENTS.firstMonth, otherwise with chance EVENTS.chance one event by
 * weight among those that would hit at least one plot, never last month's.
 * The plots' deltas are 0 here; production fills them in.
 */
export function planEvent(state: GameState): MonthEvent | null {
  if (state.whatIf || state.month < EVENTS.firstMonth) return null;
  const base = (state.seed * 2_654_435_761 + state.month * 40_503) >>> 0;
  const rng = createRng(base);
  if (!rng.chance(EVENTS.chance)) return null;
  const last = state.history.at(-1)?.events?.[0]?.key;
  const keys = (Object.keys(EVENTS.weights) as EventKey[]).filter((k) => k !== last && EVENTS.weights[k] > 0);
  const options = keys
    .map((key, i) => buildEvent(state, key, createRng((base + (i + 1) * 0x9e3779b9) >>> 0)))
    .filter((e): e is MonthEvent => e !== null);
  if (options.length === 0) return null;
  return options[rng.weighted(options.map((e) => EVENTS.weights[e.key]))]!;
}

/** What a hit plot makes after the event (never below 0), from what it made before; `first` marks the event's first plot. */
export function eventOutput(key: EventKey, before: number, first: boolean): number {
  const after = {
    dustStorm: () => Math.floor(before * (1 - EVENTS.dustStorm.cut)),
    drought: () => before - EVENTS.drought.loss,
    acidRain: () => before - EVENTS.acidRain.loss,
    solarFlare: () => before + EVENTS.solarFlare.gain,
    cometPass: () => before + EVENTS.cometPass.gain,
    flood: () => 0,
    volcanicAsh: () => before - EVENTS.volcanicAsh.loss,
    pestSwarm: () => Math.floor(before * (1 - EVENTS.pestSwarm.cut)),
    wildfire: () => (first ? 0 : before - EVENTS.wildfire.loss),
    bumperHarvest: () => before * EVENTS.bumperHarvest.factor,
  }[key]();
  return Math.max(0, after);
}

/** What one event would hit this month, in the order it reaches the plots; null when it would hit nothing. */
export function buildEvent(state: GameState, key: EventKey, rng: Rng): MonthEvent | null {
  const shape = SHAPE[key];
  const working = state.tiles.filter((t) => t.owner && t.outfit && (RAW_GOODS as readonly string[]).includes(t.outfit));
  const food = working.filter((t) => t.outfit === 'food');
  let hit: Tile[] = [];
  let origin: { x: number; y: number };
  let direction: Direction | undefined;
  let player: string | undefined;

  const goods = COLONY_GOODS[key];
  if (goods) {
    const targets = working.filter((t) => goods.includes(t.outfit as Good));
    if (targets.length === 0) return null;
    direction = rng.pick(['n', 'e', 's', 'w'] as const);
    const edge = { n: (t: Tile) => t.y, s: (t: Tile) => state.height - 1 - t.y, w: (t: Tile) => t.x, e: (t: Tile) => state.width - 1 - t.x }[direction];
    origin =
      direction === 'n' || direction === 's'
        ? { x: rng.int(0, state.width - 1), y: direction === 'n' ? 0 : state.height - 1 }
        : { x: direction === 'w' ? 0 : state.width - 1, y: rng.int(0, state.height - 1) };
    hit = targets.sort((a, b) => edge(a) - edge(b));
  } else if (key === 'flood' || key === 'volcanicAsh') {
    const sources = state.tiles.filter((t) => (key === 'flood' ? t.terrain === 'river' : t.terrain === 'volcanic' || t.terrain === 'mountains'));
    const reach = (s: Tile) =>
      key === 'flood' ? food.filter((t) => t.terrain === 'river') : working.filter((t) => steps(t, s) <= EVENTS.volcanicAsh.radius);
    const live = sources.filter((s) => reach(s).length > 0);
    if (live.length === 0) return null;
    const source = rng.pick(live);
    origin = { x: source.x, y: source.y };
    hit = reach(source).sort((a, b) => steps(a, source) - steps(b, source));
  } else {
    const start = pickStart(state, key === 'bumperHarvest' ? working : food, shape.sign, rng);
    if (!start) return null;
    origin = { x: start.x, y: start.y };
    player = start.owner!;
    hit =
      key === 'pestSwarm'
        ? spread(state, start, (t) => t.outfit === 'food' && t.owner !== null, EVENTS.pestSwarm.maxPlots)
        : key === 'wildfire'
          ? spread(state, start, (t) => t.outfit === 'food' && t.owner === start.owner, Infinity)
          : [start];
  }

  const index = new Map(state.tiles.map((t, i) => [t, i]));
  return {
    key,
    kind: shape.kind,
    title: shape.title,
    line: shape.line(),
    scope: shape.scope,
    origin,
    ...(direction ? { direction } : {}),
    plots: hit.map((t, order) => ({ index: index.get(t)!, order, good: t.outfit as Good, delta: 0 })),
    ...(player ? { player } : {}),
    sign: shape.sign,
    when: 'afterProduction',
  };
}

/**
 * Where a personal event starts: with chance EVENTS.targetBias on the
 * leader's land for a bad event or the trailing player's for a good one,
 * otherwise anywhere it could. Wealth here is money plus land at its score.
 */
function pickStart(state: GameState, candidates: Tile[], sign: MonthEvent['sign'], rng: Rng): Tile | null {
  if (candidates.length === 0) return null;
  const wealth = (id: string) => state.players.find((p) => p.id === id)!.money + GAME.plotScore * state.tiles.filter((t) => t.owner === id).length;
  const ranked = state.players.map((p) => p.id);
  const pick = sign === 'bad' ? ranked.reduce((a, b) => (wealth(b) > wealth(a) ? b : a)) : ranked.reduce((a, b) => (wealth(b) < wealth(a) ? b : a));
  const own = candidates.filter((t) => t.owner === pick);
  return rng.chance(EVENTS.targetBias) && own.length > 0 ? rng.pick(own) : rng.pick(candidates);
}

/** The start plot, then neighbours that `joins`, breadth first, up to `max` plots. */
function spread(state: GameState, start: Tile, joins: (t: Tile) => boolean, max: number): Tile[] {
  const out = [start];
  for (let i = 0; i < out.length && out.length < max; i++) {
    for (const n of neighbours(state.tiles, state.width, out[i]!)) {
      if (out.length >= max) break;
      if (!out.includes(n) && joins(n)) out.push(n);
    }
  }
  return out;
}

/** A player event's key: a row of EVENTS.player. */
export type PlayerEventKey = keyof typeof EVENTS.player;

/**
 * The chance a player event fires for this player at the start of this phase: the phase's chance, plus the air band's
 * bonus, plus perPoint for each air point the player's plots caused last month (at most max), never above the cap; 0
 * in a phase the event doesn't list.
 */
export function playerEventChance(state: GameState, key: PlayerEventKey, phase: Phase, id: string): number {
  const row = EVENTS.player[key];
  const inPhase = (row.phases as Partial<Record<Phase, number>>)[phase];
  if (inPhase === undefined) return 0;
  const caused = state.history.at(-1)?.pollutionBy?.[id] ?? 0;
  const polluter = Math.min(row.pollution.max, row.pollution.perPoint * caused);
  return Math.min(row.cap, inPhase + row.air[airBand(state.air).name] + polluter);
}

/** Why a player event would fire for this player: the influence that raised its chance most, or plain chance. */
export function playerEventReason(state: GameState, key: PlayerEventKey, phase: Phase, id: string): 'air' | 'pollution' | 'chance' {
  throw new Error('NotImplemented: playerEventReason');
}

/**
 * Whether a player event fires for this player at the start of this phase: a roll seeded from the game, the month,
 * the event, the phase and the player, so a game replays exactly; never on a what-if copy.
 */
export function rollPlayerEvent(state: GameState, key: PlayerEventKey, phase: Phase, id: string): boolean {
  if (state.whatIf) return false;
  const chance = playerEventChance(state, key, phase, id);
  if (chance <= 0) return false;
  return createRng(seedOf(state.seed, state.month, key, phase, id)).chance(chance);
}

/** A seed from a game's seed, its month and some names: FNV-1a over them. */
function seedOf(seed: number, month: number, ...names: string[]): number {
  let h = 2_166_136_261; // literal-ok: FNV-1a offset basis
  for (const part of [String(seed), String(month), ...names]) {
    for (let i = 0; i < part.length; i++) h = Math.imul(h ^ part.charCodeAt(i), 16_777_619); // literal-ok: FNV-1a prime
    h = Math.imul(h ^ 0, 16_777_619); // literal-ok: FNV-1a prime, a separator between parts
  }
  return h >>> 0;
}
