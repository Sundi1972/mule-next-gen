/**
 * The action button (spec C3): what one press does where a colonist stands, the button's words, and the press.
 *
 * A tick runs in RULE-1's order in the server and the sim alike (HC-4). First stepFloor steps the floor, taking each
 * colonist whose press reached ENTER or LEAVE through its door. Then every other seat that pressed since the last tick
 * has applyReach run, in pressOrder on the stepped floor, with its reach at the stepped position, on the game and the
 * floor the seats before it left. doorPresses names the presses the step spent, which are not applied again.
 */
import { DEVELOPMENT } from '../config.js';
import { RuleError } from '../errors.js';
import { analysePlot, buyMule, catchMule, fitFilter, hasAnalysed, installMule, mulePriceFor, outfitCostFor, outfitMule, player, sellPelts, visitPub } from '../game.js';
import { tileAt } from '../grid.js';
import type { GameState, Outfit, Player, Tile } from '../types.js';
import { MS_PER_SECOND } from '../units.js';
import { nameOf } from './chance.js';
import { doorOutside, floorConfig, isAssaying, isStunned, type DevFloor, type FloorColonist, type FloorConfig, type FloorPoint } from './floor.js';
import { grabGlint, inGrabReach } from './glint.js';
import { HALL_BAYS, HALL_DOORS, HALL_OUTFITTERS, placeAt, type HallDoor, type HallPlace } from './hall.js';
import { afterSale } from './scramble.js';
import { strikeTarget } from './wolves.js';

/** Why a row's press is refused: money short by `short` credits, or the corral empty. */
export type ReachRefusal = { kind: 'money'; short: number } | { kind: 'soldOut' };

/** Where a dim button points when nothing is in reach, or why the seat has nothing to press now. */
export type ReachHint = 'over' | 'done' | 'assaying' | 'stunned' | 'run' | 'dodge' | 'catch' | 'corral' | 'outfitter' | 'door' | 'store' | 'outfitFirst' | 'plot' | 'noMules';

/** The one thing a press does now (RULE-3), with what its words and its press need. */
export type Reach =
  /** Wolves met, choosing: the press fights (the stick runs); stepFloor makes the move. */
  | { kind: 'fight'; enabled: true }
  /** In a fight, a wolf open within reach: the press strikes it; stepFloor makes the move. */
  | { kind: 'strike'; enabled: true }
  | { kind: 'grab'; enabled: true; plot: FloorPoint }
  | { kind: 'catch'; enabled: true }
  | { kind: 'enter'; enabled: true; door: HallDoor }
  | { kind: 'sell'; enabled: true; pelts: number; price: number }
  | { kind: 'buy'; enabled: boolean; price: number; why: ReachRefusal | null }
  | { kind: 'outfit'; enabled: boolean; good: Outfit; cost: number; why: ReachRefusal | null }
  | { kind: 'leave'; enabled: true; door: HallDoor; leading: boolean }
  /** On a plot that has a MULE, `replaces` is its outfit: installing swaps the new MULE in and the old one runs away. */
  | { kind: 'install'; enabled: true; good: Outfit; plot: FloorPoint; fromShore: boolean; replaces: Outfit | null }
  | { kind: 'analyse'; enabled: true; plot: FloorPoint }
  | { kind: 'filter'; enabled: true; plot: FloorPoint; alloy: number }
  | { kind: 'pub'; enabled: true; payout: number | null }
  | { kind: 'none'; enabled: false; hint: ReachHint };

export type ReachKind = Reach['kind'];

/** The button's words: the protocol's ReachView, which the server fills from them. */
export interface ReachWords {
  verb: string;
  detail: string | null;
  enabled: boolean;
}

/** What a press did: the reach it pressed, what its rule returned, and the floor after it. */
export interface Press {
  reach: Reach;
  /** ANALYSE: the seconds analysePlot says the analysis took. */
  seconds: number | null;
  /** PUB: what visitPub paid. */
  payout: number | null;
  /** ANALYSE: a new floor, the seat's colonist assaying for `seconds`. Every other press: the floor pressed on. */
  floor: DevFloor;
}

interface Standing {
  floor: DevFloor;
  state: GameState;
  cfg: FloorConfig;
  colonist: FloorColonist;
  player: Player;
  /** In the hall: the room or door it stands in. */
  place: HallPlace | null;
  /** On the map: the tile under its feet. */
  tile: Tile | null;
  secondsLeft: number | undefined;
}

type Row = (s: Standing) => Reach | null;

const isDoor = (place: HallPlace | null): place is HallDoor => place === 'doorL' || place === 'doorR';
const at = (tile: Tile): FloorPoint => ({ x: tile.x, y: tile.y });
const shortBy = (p: Player, price: number): ReachRefusal | null => (p.money < price ? { kind: 'money', short: price - p.money } : null);

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * In shore mode a lake plot is worked from the land beside it: of the seat's own lake plots among the eight around its
 * tile, the nearest its feet, if nearer than DEV_STEER.shoreReachTiles to the plot's edge.
 */
function shorePlot(state: GameState, cfg: FloorConfig, c: FloorColonist, tile: Tile, seat: string): Tile | null {
  const gap = (t: Tile) => Math.hypot(Math.max(t.x - c.x, 0, c.x - t.x - 1), Math.max(t.y - c.y, 0, c.y - t.y - 1));
  const lakes = AROUND.map(([dx, dy]) => tileAt(state.tiles, state.width, tile.x + dx, tile.y + dy)).filter(
    (t): t is Tile => t?.terrain === 'lake' && t.owner === seat && gap(t) < cfg.steer.shoreReachTiles,
  );
  return lakes.reduce<Tile | null>((best, t) => (best && gap(best) <= gap(t) ? best : t), null);
}

/** Rows 1 and 2: wolves met. Choosing, FIGHT; running, nothing to press; fighting, STRIKE at a wolf open, else dodge. */
const wolves: Row = ({ floor, cfg, colonist: c }) => {
  const e = c.encounter;
  if (!e) return null;
  if (e.stage === 'choose') return { kind: 'fight', enabled: true };
  if (e.stage === 'chase') return dim('run');
  return strikeTarget(c, cfg) >= 0 && floor.tick >= e.recoverUntilTick ? { kind: 'strike', enabled: true } : dim('dodge');
};

/** Row 3: the lit glint within GLINT.grabReach. */
const grab: Row = ({ floor, cfg, colonist: c }) => {
  const g = inGrabReach(floor, c, cfg);
  return g && { kind: 'grab', enabled: true, plot: { x: g.x, y: g.y } };
};

/** Row 4: the seat's bolted MULE within WOLVES.catchReachTiles, on the map. */
const catchIt: Row = ({ cfg, colonist: c, player: p }) => {
  if (!p.muleBolted || c.space !== 'map' || !c.lead) return null;
  return Math.hypot(c.lead.x - c.x, c.lead.y - c.y) <= cfg.wolves.catchReachTiles ? { kind: 'catch', enabled: true } : null;
};

const enter: Row = ({ state, cfg, colonist: c }) => {
  if (c.space !== 'map') return null;
  const door = HALL_DOORS.find((d) => {
    const mouth = doorOutside(state, d, cfg);
    return Math.hypot(c.x - mouth.x, c.y - mouth.y) <= cfg.steer.doorHalfTiles;
  });
  return door ? { kind: 'enter', enabled: true, door } : null;
};

const sell: Row = ({ cfg, colonist: c, place }) =>
  isDoor(place) && c.pelts > 0 ? { kind: 'sell', enabled: true, pelts: c.pelts, price: c.pelts * cfg.wolves.peltPrice } : null;

const buy: Row = ({ state, player: p, place }) => {
  if (place !== 'corral' || p.carriedMule) return null;
  const price = mulePriceFor(state, p.id);
  if (state.store.mules <= 0) return { kind: 'buy', enabled: false, price, why: { kind: 'soldOut' } };
  const why = shortBy(p, price);
  return { kind: 'buy', enabled: !why, price, why };
};

/** The places that outfit a MULE, each for its own good: the shopfronts, the works' bays and the Green belt. */
const OUTFITTERS = [...HALL_OUTFITTERS, ...HALL_BAYS, 'greenBelt'] as const satisfies readonly (Outfit & HallPlace)[];

const outfit: Row = ({ state, player: p, place }) => {
  const good = OUTFITTERS.find((g) => g === place);
  if (!good || p.carriedMule !== 'empty' || p.muleBolted) return null;
  const cost = outfitCostFor(state, p.id, good);
  const why = shortBy(p, cost);
  return { kind: 'outfit', enabled: !why, good, cost, why };
};

const leave: Row = ({ player: p, place }) => (isDoor(place) ? { kind: 'leave', enabled: true, door: place, leading: p.carriedMule !== null && !p.muleBolted } : null);

const install: Row = ({ state, cfg, colonist: c, player: p, tile }) => {
  const good = p.carriedMule;
  if (!tile || !good || good === 'empty' || p.muleBolted) return null;
  const plot = tile.owner === p.id ? tile : cfg.steer.lakeMode === 'shore' ? shorePlot(state, cfg, c, tile, p.id) : null;
  return plot && { kind: 'install', enabled: true, good, plot: at(plot), fromShore: plot !== tile, replaces: plot.outfit };
};

/** Any plot, owned or free, with or without a MULE, led or on it: as analysePlot allows. */
const analyse: Row = ({ state, player: p, tile }) =>
  tile && tile.terrain !== 'store' && !hasAnalysed(p, state, tile) ? { kind: 'analyse', enabled: true, plot: at(tile) } : null;

const filter: Row = ({ player: p, tile }) =>
  tile?.owner === p.id && !tile.filter && p.stock.alloy >= DEVELOPMENT.filterAlloy
    ? { kind: 'filter', enabled: true, plot: at(tile), alloy: DEVELOPMENT.filterAlloy }
    : null;

const pub: Row = ({ state, cfg, player: p, place, secondsLeft }) => {
  if (place !== 'pub') return null;
  const payout = cfg.pubPayout && secondsLeft !== undefined ? cfg.pubPayout(state, p.id, secondsLeft) : null;
  return { kind: 'pub', enabled: true, payout };
};

/** RULE-3's rows 1 to 13 in its order: the first that holds is the reach, and row 14 is none. */
// Row 11a, TAKE MULE, slots in after filter: any earlier, it would hide ANALYSE and FIT FILTER on a plot with a MULE.
const ROWS: readonly Row[] = [wolves, grab, catchIt, enter, sell, buy, outfit, leave, install, analyse, filter, pub];

const dim = (hint: ReachHint): Reach => ({ kind: 'none', enabled: false, hint });

function hintFor({ state, colonist: c, player: p }: Standing): ReachHint {
  const hall = c.space === 'hall';
  if (p.muleBolted) return 'catch';
  if (!p.carriedMule) return state.store.mules <= 0 ? 'noMules' : hall ? 'corral' : 'store';
  if (p.carriedMule === 'empty') return hall ? 'outfitter' : 'outfitFirst';
  return hall ? 'door' : 'plot';
}

/**
 * What a press would do now for this seat's colonist; `secondsLeft` of development prices the pub's payout, and
 * without it the pub reach carries none. Throws RuleError for a seat not in the game.
 */
export function reachOf(floor: DevFloor, state: GameState, seat: string, cfg: FloorConfig = floorConfig(), { secondsLeft }: { secondsLeft?: number } = {}): Reach {
  const p = player(state, seat);
  // Every rule refuses outside development and after the pub, so the button must not offer one.
  if (state.phase !== 'development') return dim('over');
  if (p.doneDeveloping) return dim('done');
  const colonist = floor.colonists.find((c) => c.id === seat);
  if (!colonist) throw new Error(`No colonist on the floor for ${seat}`);
  if (isAssaying(colonist, floor.tick)) return dim('assaying');
  if (isStunned(colonist, floor.tick)) return dim('stunned');
  const s: Standing = {
    floor,
    state,
    cfg,
    colonist,
    player: p,
    place: colonist.space === 'hall' ? placeAt(colonist, cfg.hall) : null,
    tile: colonist.space === 'map' ? (tileAt(state.tiles, state.width, Math.floor(colonist.x), Math.floor(colonist.y)) ?? null) : null,
    secondsLeft,
  };
  for (const row of ROWS) {
    const reach = row(s);
    if (reach) return reach;
  }
  return dim(hintFor(s));
}

/**
 * Presses the button for a seat: the game.ts rule for its reach on this floor, the pub paying for `secondsLeft`, and
 * the floor after it (SELL drops the pelts sold, GRAB the glint, CATCH the bolt; a sale may call or count the
 * scramble). ENTER, LEAVE, FIGHT, STRIKE and a dim reach change nothing here: stepFloor makes those moves.
 */
export function applyReach(state: GameState, floor: DevFloor, seat: string, secondsLeft: number, cfg: FloorConfig = floorConfig()): Press {
  const reach = reachOf(floor, state, seat, cfg, { secondsLeft });
  const press: Press = { reach, seconds: null, payout: null, floor };
  if (!reach.enabled) return press;
  switch (reach.kind) {
    case 'sell': {
      // sellPelts trusts the count, so the floor drops the pelts it sold.
      const paid = sellPelts(state, seat, reach.pelts);
      const sold = withColonist(floor, seat, { pelts: 0 });
      const beat = { kind: 'store' as const, who: seat, text: `${nameOf(state, seat)} sold ${reach.pelts} ${reach.pelts === 1 ? 'pelt' : 'pelts'}: +${credits(paid)}` };
      return { ...press, floor: { ...sold, moments: { ...sold.moments, beats: [...sold.moments.beats, beat] } } };
    }
    case 'grab':
      return { ...press, floor: grabGlint(state, floor, seat, cfg) };
    case 'catch': {
      catchMule(state, seat);
      const caught = withColonist(floor, seat, { bolt: null });
      const beat = { kind: 'wolves' as const, who: seat, text: `${nameOf(state, seat)} caught the MULE` };
      return { ...press, floor: { ...caught, moments: { ...caught.moments, beats: [...caught.moments.beats, beat] } } };
    }
    case 'buy':
      buyMule(state, seat);
      return { ...press, floor: afterSale(state, floor, seat, cfg) };
    case 'outfit':
      outfitMule(state, seat, reach.good);
      return press;
    case 'install':
      installMule(state, seat, reach.plot.x, reach.plot.y);
      return press;
    case 'analyse': {
      const seconds = analysePlot(state, seat, reach.plot.x, reach.plot.y);
      return { ...press, seconds, floor: assay(floor, seat, seconds, cfg) };
    }
    case 'filter':
      fitFilter(state, seat, reach.plot.x, reach.plot.y);
      return press;
    case 'pub':
      return { ...press, payout: visitPub(state, seat, secondsLeft) };
    case 'fight':
    case 'strike':
    case 'enter':
    case 'leave':
      return press;
  }
}

/** The floor with one seat's colonist changed. */
function withColonist(floor: DevFloor, seat: string, patch: Partial<FloorColonist>): DevFloor {
  return { ...floor, colonists: floor.colonists.map((c) => (c.id === seat ? { ...c, ...patch } : c)) };
}

/** The floor with the seat's colonist assaying for `seconds`, in whole ticks. */
function assay(floor: DevFloor, seat: string, seconds: number, cfg: FloorConfig): DevFloor {
  const ticks = Math.ceil((seconds * MS_PER_SECOND) / cfg.steer.tickMs);
  const assayUntilTick = ticks > 0 ? floor.tick + ticks : null;
  return { ...floor, colonists: floor.colonists.map((c) => (c.id === seat ? { ...c, assayUntilTick } : c)) };
}

const NAME: Record<Outfit, string> = {
  food: 'FOOD',
  water: 'WATER',
  energy: 'ENERGY',
  smithore: 'SMITHORE',
  crystite: 'CRYSTITE',
  rareEarth: 'RARE EARTH',
  alloy: 'ALLOY',
  electronics: 'ELECTRONICS',
  medicine: 'MEDICINE',
  greenBelt: 'GREEN BELT',
};

const HINT: Record<ReachHint, readonly [string, string | null]> = {
  over: ['DEVELOPMENT OVER', null],
  done: ['IN THE PUB', 'turn over'],
  assaying: ['ASSAYING', null],
  stunned: ['STUNNED', null],
  run: ['RUN!', 'to the store or your plot'],
  dodge: ['DODGE', null],
  catch: ['CATCH YOUR MULE', 'it bolted'],
  corral: ['TO THE CORRAL', null],
  outfitter: ['TO AN OUTFITTER', null],
  door: ['TO A DOOR', null],
  store: ['TO THE STORE', null],
  outfitFirst: ['OUTFIT IT FIRST', 'in the store'],
  plot: ['TO YOUR PLOT', null],
  noMules: ['NO MULES LEFT', 'the pub pays now'],
};

/** A good inside a sentence: "Rare earth". */
const inWords = (good: Outfit) => NAME[good].charAt(0) + NAME[good].slice(1).toLowerCase();
const credits = (n: number) => `${n} cr`;
const priced = (price: number, why: ReachRefusal | null) => (why?.kind === 'money' ? `${credits(price)} · ${Math.ceil(why.short)} short` : credits(price));

/** The button's words for a reach; a dim row keeps its words, with what it is short of. */
export function reachWords(reach: Reach): ReachWords {
  const say = (verb: string, detail: string | null = null): ReachWords => ({ verb, detail, enabled: reach.enabled });
  switch (reach.kind) {
    case 'fight':
      return say('FIGHT', 'or push the stick to run');
    case 'strike':
      return say('STRIKE!');
    case 'grab':
      return say('GRAB THE GLINT');
    case 'catch':
      return say('CATCH MULE');
    case 'enter':
      return say('ENTER STORE');
    case 'sell':
      return say(`SELL ${reach.pelts} ${reach.pelts === 1 ? 'PELT' : 'PELTS'}`, credits(reach.price));
    case 'buy':
      return reach.why?.kind === 'soldOut' ? say(...HINT.noMules) : say('BUY MULE', priced(reach.price, reach.why));
    case 'outfit':
      return say(`OUTFIT · ${NAME[reach.good]}`, priced(reach.cost, reach.why));
    case 'leave':
      return say('LEAVE', reach.leading ? 'with your MULE' : 'to the colony');
    case 'install': {
      const notes = [reach.fromShore && 'from the shore', reach.replaces && (reach.replaces === reach.good ? 'same outfit, nothing gained' : `your ${inWords(reach.replaces)} MULE runs away`)].filter((n) => n);
      return say(reach.replaces ? 'SWAP' : `INSTALL · ${NAME[reach.good]}`, notes.join(' · ') || null);
    }
    case 'analyse':
      return say('ANALYSE');
    case 'filter':
      return say('FIT FILTER', `${reach.alloy} Alloy`);
    case 'pub':
      return say('PUB · END TURN', reach.payout === null ? null : `+${credits(reach.payout)}`);
    case 'none':
      return say(...HINT[reach.hint]);
  }
}
