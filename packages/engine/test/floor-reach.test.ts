import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  analysisSeconds,
  applyReach,
  boxOf,
  buildFloor,
  createGame,
  DEV_STEER,
  DEVELOPMENT,
  doorOutside,
  doorPresses,
  floorConfig,
  HALL,
  HALL_PLACES,
  hasAnalysed,
  MULE,
  mulePrice,
  mulePriceFor,
  outfitCostFor,
  reachOf,
  reachWords,
  RuleError,
  stepFloor,
  WOLVES,
  type DevFloor,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type HallPlace,
  type Press,
  type Reach,
  type ReachWords,
  type Terrain,
} from '../src/index.js';

const LAND: Record<string, Terrain> = { '.': 'plains', '~': 'lake', S: 'store' };

/** The store at 5·3, a lake at 5·1. */
const MAP = [
  '.........',
  '.....~...',
  '.........',
  '.....S...',
  '.........',
];

/** 'a''s plots: beside the store's left door, the lake, two plains plots, and one with a Smithore MULE on it. */
const A_PLOTS = [
  [4, 3],
  [5, 1],
  [2, 1],
  [2, 4],
  [7, 4],
] as const;

const SEED = 31;
const RICH = 1_000;
const SECONDS_LEFT = 30;
const IDLE: FloorInput = { x: 0, y: 0, act: false };
const cfg = floorConfig(HALL);
/** A stand-in for game.ts's pubPayoutFor: it shows the seat, the month and the time left reached it. */
const stubPayout: NonNullable<FloorConfig['pubPayout']> = (state, id, secondsLeft) => (id === 'a' ? 100 * state.month + secondsLeft : 0);
const paying: FloorConfig = { ...cfg, pubPayout: stubPayout };

const tileOf = (state: GameState, x: number, y: number) => state.tiles[y * state.width + x]!;
const onTile = (x: number, y: number): Partial<FloorColonist> => ({ space: 'map', x: x + 0.5, y: y + 0.5 });
/** Standing in the middle of a place's box: being at it. */
const inHall = (place: HallPlace): Partial<FloorColonist> => {
  const box = boxOf(place);
  return { space: 'hall', x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
};
/** Standing in the middle of the works' left, middle or right third: Store.tsx's Alloy, Electronics and Medicine bays. */
const inWorksBay = (third: 0 | 1 | 2): Partial<FloorColonist> => {
  const works = HALL.rooms.works;
  const width = (works.x1 - works.x0) / 3;
  return { space: 'hall', x: works.x0 + width * (third + 0.5), y: (works.y0 + works.y1) / 2 };
};
const words = (verb: string, detail: string | null = null, enabled = true): ReachWords => ({ verb, detail, enabled });
const a = (state: GameState) => state.players[0]!;

type Outcome =
  /** A state-side row: what the press changed in the game, and what game.ts returned. */
  | { game: (was: GameState, now: GameState, press: Press) => void }
  /** A floor move: the stick that walks 'a' through the same door. */
  | { door: FloorInput }
  | { refused: RegExp }
  | 'nothing';

interface Row {
  row: string;
  at: (state: GameState) => Partial<FloorColonist>;
  /** The stick held with the press; still when not given. */
  stick?: FloorInput;
  /** The floor's config; `cfg` when not given. */
  cfg?: FloorConfig;
  game?: (state: GameState) => void;
  /** Reach is asked without the turn's time left, as a caller that has none would: the pub has no payout to show. */
  unasked?: boolean;
  reach: (state: GameState) => Reach;
  words: (state: GameState) => ReachWords;
  press: Outcome;
}

/** A development turn on MAP: 'a' a Gearling, so its prices are not the store's list price, placed where `row` says. */
function world(row: Pick<Row, 'at' | 'game' | 'cfg'>): { state: GameState; floor: DevFloor } {
  const state = createGame({
    seed: SEED,
    players: [
      { id: 'a', name: 'A', isAi: false, species: 'gearling' },
      { id: 'b', name: 'B', isAi: false, species: 'bramblet' },
    ],
  });
  while (state.phase !== 'development') advancePhase(state);
  const template = state.tiles[0]!;
  state.width = MAP[0]!.length;
  state.height = MAP.length;
  state.tiles = MAP.flatMap((line, y) =>
    [...line].map((ch, x) => ({ ...template, x, y, terrain: LAND[ch]!, traits: [], owner: null, outfit: null, filter: false, pollution: 0, runMonths: 0 })),
  );
  for (const [x, y] of A_PLOTS) tileOf(state, x, y).owner = 'a';
  tileOf(state, 7, 4).outfit = 'smithore';
  Object.assign(a(state), { money: RICH, carriedMule: null, analysed: [] });
  a(state).stock.alloy = 0;
  row.game?.(state);
  const built = buildFloor(state, row.cfg ?? cfg);
  return { state, floor: { ...built, colonists: built.colonists.map((c) => (c.id === 'a' ? { ...c, ...row.at(state) } : c)) } };
}

/**
 * One tick as the server and the sim run it (RULE-1): the step, then each press the step did not spend, at the stepped
 * position, each on the floor the one before it left. The stepped floor, the floor after the presses, and each press.
 */
function tick(state: GameState, floor: DevFloor, inputs: Record<string, FloorInput>, config = cfg): { stepped: DevFloor; floor: DevFloor; presses: Press[] } {
  const spent = doorPresses(floor, state, inputs, config);
  const stepped = stepFloor(floor, state, inputs, DEV_STEER.tickMs, config);
  const pressing = Object.keys(inputs).filter((seat) => inputs[seat]!.act && !spent.has(seat));
  const presses: Press[] = [];
  const after = pressing.reduce((f, seat) => {
    const press = applyReach(state, f, seat, SECONDS_LEFT, config);
    presses.push(press);
    return press.floor;
  }, stepped);
  return { stepped, floor: after, presses };
}

const ASSAYING = words('ASSAYING', null, false);

/**
 * After 'a''s ANALYSE press: the floor the press returned holds it where it stands for the analysis's seconds in
 * ticks, its stick held and its button pressed, the button saying ASSAYING and a press changing nothing; then it walks.
 */
function assays(row: string, state: GameState, pressed: DevFloor, press: Press, config: FloorConfig): void {
  const ticks = Math.ceil((analysisSeconds(state, 'a') * 1_000) / DEV_STEER.tickMs);
  const start = pressed.colonists[0]!;
  expect(press.seconds, row).toBe(analysisSeconds(state, 'a'));
  expect(start.assayUntilTick, `${row}: held for the analysis's ticks`).toBe(pressed.tick + ticks);
  const game = structuredClone(state);
  const stick: FloorInput = { x: 1, y: 0, act: true };
  let floor = pressed;
  for (let t = 0; t < ticks; t++) {
    expect(reachWords(reachNow(floor, state, config)), `${row}: tick ${floor.tick}`).toEqual(ASSAYING);
    expect(applyReach(state, floor, 'a', SECONDS_LEFT, config).floor, `${row}: tick ${floor.tick}, a press`).toBe(floor);
    floor = stepFloor(floor, state, { a: stick }, DEV_STEER.tickMs, config);
    const me = floor.colonists[0]!;
    expect([me.space, me.x, me.y, me.moving], `${row}: tick ${floor.tick}, still`).toEqual([start.space, start.x, start.y, false]);
  }
  expect(state, `${row}: the presses while assaying left the game as it was`).toEqual(game);
  expect(floor.colonists[0]!.assayUntilTick, `${row}: done at tick ${floor.tick}`).toBeNull();
  expect(reachWords(reachNow(floor, state, config)), `${row}: done`).not.toEqual(ASSAYING);
  const walked = stepFloor(floor, state, { a: { ...stick, act: false } }, DEV_STEER.tickMs, config).colonists[0]!;
  expect([walked.x > start.x, walked.moving], `${row}: walking again`).toEqual([true, true]);
}

/** What the button would do for 'a' now, with the turn's time left, as the server asks it each tick. */
const reachNow = (floor: DevFloor, state: GameState, config = cfg, asked = true) =>
  reachOf(floor, state, 'a', config, asked ? { secondsLeft: SECONDS_LEFT } : {});

/** 'a' walked by `stick` until it is through a door. */
function throughTheDoor(state: GameState, floor: DevFloor, stick: FloorInput): FloorColonist {
  let f = floor;
  for (let tick = 0; tick < 100; tick++) {
    f = stepFloor(f, state, { a: stick }, DEV_STEER.tickMs, cfg);
    if (f.colonists[0]!.space !== floor.colonists[0]!.space) return f.colonists[0]!;
  }
  throw new Error('never went through the door');
}

const TABLE: Row[] = [
  {
    row: '5 ENTER: on the map at the store door',
    at: (s) => ({ space: 'map', ...doorOutside(s, 'doorL', cfg) }),
    reach: () => ({ kind: 'enter', enabled: true, door: 'doorL' }),
    words: () => words('ENTER STORE'),
    press: { door: { x: 1, y: 0, act: false } },
  },
  {
    row: '5 over 6: at the door, carrying pelts: the press goes in, and does nothing more',
    at: (s) => ({ space: 'map', ...doorOutside(s, 'doorL', cfg), pelts: 2 }),
    reach: () => ({ kind: 'enter', enabled: true, door: 'doorL' }),
    words: () => words('ENTER STORE'),
    press: { door: { x: 1, y: 0, act: false } },
  },
  {
    row: '5 over 10: at the door on an own plot, leading a fitted MULE',
    at: (s) => ({ space: 'map', ...doorOutside(s, 'doorL', cfg) }),
    game: (s) => void (a(s).carriedMule = 'food'),
    reach: () => ({ kind: 'enter', enabled: true, door: 'doorL' }),
    words: () => words('ENTER STORE'),
    press: { door: { x: 1, y: 0, act: false } },
  },
  {
    row: '6 over 9: in the hall at a door, carrying pelts',
    at: () => ({ ...inHall('doorL'), pelts: 2 }),
    reach: () => ({ kind: 'sell', enabled: true, pelts: 2, price: 2 * WOLVES.peltPrice }),
    words: () => words('SELL 2 PELTS', `${2 * WOLVES.peltPrice} cr`),
    press: { refused: /pelts/ },
  },
  {
    row: '7 BUY MULE: at the corral, no MULE, MULEs left, money',
    at: () => inHall('corral'),
    reach: (s) => ({ kind: 'buy', enabled: true, price: mulePriceFor(s, 'a'), why: null }),
    words: (s) => words('BUY MULE', `${mulePriceFor(s, 'a')} cr`),
    press: {
      game: (was, now) => {
        expect(mulePriceFor(was, 'a'), "a Gearling's price, not the list price").not.toBe(mulePrice(was));
        expect(a(now).carriedMule).toBe('empty');
        expect(a(was).money - a(now).money).toBe(mulePriceFor(was, 'a'));
        expect(was.store.mules - now.store.mules).toBe(1);
      },
    },
  },
  {
    row: '7 at the stepped position: walking into the corral with the press buys',
    at: () => ({ space: 'hall', x: HALL.spots.corral.x, y: HALL.rooms.corral.y0 - 0.1 }),
    stick: { x: 0, y: 1, act: false },
    reach: () => ({ kind: 'none', enabled: false, hint: 'corral' }),
    words: () => words('TO THE CORRAL', null, false),
    press: {
      game: (was, now, press) => {
        expect(press.reach.kind).toBe('buy');
        expect(a(now).carriedMule).toBe('empty');
        expect(a(was).money - a(now).money).toBe(mulePriceFor(was, 'a'));
      },
    },
  },
  {
    row: '7, money short: disabled, with the shortfall',
    at: () => inHall('corral'),
    game: (s) => void (a(s).money = mulePriceFor(s, 'a') - 7),
    reach: (s) => ({ kind: 'buy', enabled: false, price: mulePriceFor(s, 'a'), why: { kind: 'money', short: 7 } }),
    words: (s) => words('BUY MULE', `${mulePriceFor(s, 'a')} cr · 7 short`, false),
    press: 'nothing',
  },
  {
    row: '7, the corral empty: NO MULES LEFT',
    at: () => inHall('corral'),
    game: (s) => void (s.store.mules = 0),
    reach: (s) => ({ kind: 'buy', enabled: false, price: mulePriceFor(s, 'a'), why: { kind: 'soldOut' } }),
    words: () => words('NO MULES LEFT', 'the pub pays now', false),
    press: 'nothing',
  },
  {
    row: '8 OUTFIT: at an outfitter, an unfitted MULE, money',
    at: () => inHall('energy'),
    game: (s) => void (a(s).carriedMule = 'empty'),
    reach: (s) => ({ kind: 'outfit', enabled: true, good: 'energy', cost: outfitCostFor(s, 'a', 'energy'), why: null }),
    words: (s) => words('OUTFIT · ENERGY', `${outfitCostFor(s, 'a', 'energy')} cr`),
    press: {
      game: (was, now) => {
        expect(a(now).carriedMule).toBe('energy');
        expect(a(was).money - a(now).money).toBe(outfitCostFor(was, 'a', 'energy'));
      },
    },
  },
  {
    row: '8, money short: disabled, with the shortfall',
    at: () => inHall('energy'),
    game: (s) => void Object.assign(a(s), { carriedMule: 'empty', money: outfitCostFor(s, 'a', 'energy') - 3 }),
    reach: (s) => ({ kind: 'outfit', enabled: false, good: 'energy', cost: outfitCostFor(s, 'a', 'energy'), why: { kind: 'money', short: 3 } }),
    words: (s) => words('OUTFIT · ENERGY', `${outfitCostFor(s, 'a', 'energy')} cr · 3 short`, false),
    press: 'nothing',
  },
  ...(['alloy', 'electronics', 'medicine'] as const).map(
    (good, third): Row => ({
      row: `8b OUTFIT: at the works' ${['left', 'middle', 'right'][third]} fitting bay, an unfitted MULE, money: ${good}`,
      at: () => inWorksBay(third as 0 | 1 | 2),
      game: (s) => void (a(s).carriedMule = 'empty'),
      reach: (s) => ({ kind: 'outfit', enabled: true, good, cost: outfitCostFor(s, 'a', good), why: null }),
      words: (s) => words(`OUTFIT · ${good.toUpperCase()}`, `${outfitCostFor(s, 'a', good)} cr`),
      press: {
        game: (was, now) => {
          expect(a(now).carriedMule).toBe(good);
          expect(a(was).money - a(now).money).toBe(outfitCostFor(was, 'a', good));
        },
      },
    }),
  ),
  {
    row: '8b, money short: disabled, with the shortfall',
    at: () => inWorksBay(1),
    game: (s) => void Object.assign(a(s), { carriedMule: 'empty', money: outfitCostFor(s, 'a', 'electronics') - 5 }),
    reach: (s) => ({ kind: 'outfit', enabled: false, good: 'electronics', cost: outfitCostFor(s, 'a', 'electronics'), why: { kind: 'money', short: 5 } }),
    words: (s) => words('OUTFIT · ELECTRONICS', `${outfitCostFor(s, 'a', 'electronics')} cr · 5 short`, false),
    press: 'nothing',
  },
  {
    row: '8c OUTFIT: at the Green belt, an unfitted MULE, money',
    at: () => inHall('greenBelt'),
    game: (s) => void (a(s).carriedMule = 'empty'),
    reach: (s) => ({ kind: 'outfit', enabled: true, good: 'greenBelt', cost: outfitCostFor(s, 'a', 'greenBelt'), why: null }),
    words: (s) => words('OUTFIT · GREEN BELT', `${outfitCostFor(s, 'a', 'greenBelt')} cr`),
    press: {
      game: (was, now) => {
        expect(a(now).carriedMule).toBe('greenBelt');
        expect(a(was).money - a(now).money).toBe(outfitCostFor(was, 'a', 'greenBelt'));
      },
    },
  },
  {
    row: '9 LEAVE: in the hall at a door',
    at: () => inHall('doorR'),
    game: (s) => void (a(s).carriedMule = 'energy'),
    reach: () => ({ kind: 'leave', enabled: true, door: 'doorR', leading: true }),
    words: () => words('LEAVE', 'with your MULE'),
    press: { door: { x: 1, y: 0, act: false } },
  },
  {
    row: '10 INSTALL: on an own plot, leading a fitted MULE',
    at: () => onTile(2, 1),
    game: (s) => void (a(s).carriedMule = 'food'),
    reach: () => ({ kind: 'install', enabled: true, good: 'food', plot: { x: 2, y: 1 }, fromShore: false, replaces: null }),
    words: () => words('INSTALL · FOOD'),
    press: {
      game: (_, now) => {
        expect(tileOf(now, 2, 1).outfit).toBe('food');
        expect(a(now).carriedMule).toBeNull();
      },
    },
  },
  {
    row: '10, a lake plot from its shore',
    at: () => ({ space: 'map', x: 4.75, y: 1.5 }),
    game: (s) => void (a(s).carriedMule = 'water'),
    reach: () => ({ kind: 'install', enabled: true, good: 'water', plot: { x: 5, y: 1 }, fromShore: true, replaces: null }),
    words: () => words('INSTALL · WATER', 'from the shore'),
    press: { game: (_, now) => expect(tileOf(now, 5, 1).outfit).toBe('water') },
  },
  {
    row: '10, a lake plot from its shore, across a corner',
    at: () => ({ space: 'map', x: 4.8, y: 2.2 }),
    game: (s) => void (a(s).carriedMule = 'water'),
    reach: () => ({ kind: 'install', enabled: true, good: 'water', plot: { x: 5, y: 1 }, fromShore: true, replaces: null }),
    words: () => words('INSTALL · WATER', 'from the shore'),
    press: { game: (_, now) => expect(tileOf(now, 5, 1).outfit).toBe('water') },
  },
  {
    row: "10, a lake plot just beyond the shore's reach: not offered",
    at: () => ({ space: 'map', x: 5 - DEV_STEER.shoreReachTiles - 0.01, y: 1.5 }),
    game: (s) => void Object.assign(a(s), { carriedMule: 'water', analysed: [1 * s.width + 4] }),
    reach: () => ({ kind: 'none', enabled: false, hint: 'plot' }),
    words: () => words('TO YOUR PLOT', null, false),
    press: 'nothing',
  },
  {
    row: '10 SWAP over 12: on an own plot with a Smithore MULE, Alloy held, leading a fitted MULE',
    at: () => onTile(7, 4),
    game: (s) => void Object.assign(a(s), { carriedMule: 'energy', stock: { ...a(s).stock, alloy: DEVELOPMENT.filterAlloy } }),
    reach: () => ({ kind: 'install', enabled: true, good: 'energy', plot: { x: 7, y: 4 }, fromShore: false, replaces: 'smithore' }),
    words: () => words('SWAP', 'your Smithore MULE runs away'),
    press: {
      game: (was, now) => {
        expect(tileOf(now, 7, 4).outfit).toBe('energy');
        expect([tileOf(now, 7, 4).filter, a(now).stock.alloy]).toEqual([false, a(was).stock.alloy]);
      },
    },
  },
  {
    row: '10 SWAP: the old MULE named as in a sentence',
    at: () => onTile(2, 1),
    game: (s) => void ((tileOf(s, 2, 1).outfit = 'rareEarth'), (a(s).carriedMule = 'food')),
    reach: () => ({ kind: 'install', enabled: true, good: 'food', plot: { x: 2, y: 1 }, fromShore: false, replaces: 'rareEarth' }),
    words: () => words('SWAP', 'your Rare earth MULE runs away'),
    press: { game: (_, now) => expect(tileOf(now, 2, 1).outfit).toBe('food') },
  },
  {
    row: '10 SWAP for the same outfit: nothing gained, said so',
    at: () => onTile(7, 4),
    game: (s) => void (a(s).carriedMule = 'smithore'),
    reach: () => ({ kind: 'install', enabled: true, good: 'smithore', plot: { x: 7, y: 4 }, fromShore: false, replaces: 'smithore' }),
    words: () => words('SWAP', 'same outfit, nothing gained'),
    press: { game: (_, now) => expect(tileOf(now, 7, 4).outfit).toBe('smithore') },
  },
  {
    row: '10 SWAP for the same outfit, from the shore: the shore first, then nothing gained',
    at: () => ({ space: 'map', x: 4.75, y: 1.5 }),
    game: (s) => void ((tileOf(s, 5, 1).outfit = 'water'), (a(s).carriedMule = 'water')),
    reach: () => ({ kind: 'install', enabled: true, good: 'water', plot: { x: 5, y: 1 }, fromShore: true, replaces: 'water' }),
    words: () => words('SWAP', 'from the shore · same outfit, nothing gained'),
    press: { game: (_, now) => expect(tileOf(now, 5, 1).outfit).toBe('water') },
  },
  {
    row: '11 ANALYSE: on an own plot, no MULE, not analysed',
    at: () => onTile(2, 4),
    reach: () => ({ kind: 'analyse', enabled: true, plot: { x: 2, y: 4 } }),
    words: () => words('ANALYSE'),
    press: {
      game: (was, now, press) => {
        expect(hasAnalysed(a(now), now, tileOf(now, 2, 4))).toBe(true);
        expect(press.seconds).toBe(analysisSeconds(was, 'a'));
      },
    },
  },
  {
    row: '11 ANALYSE: on a free plot, leading a MULE: scouting',
    at: () => onTile(6, 0),
    game: (s) => void (a(s).carriedMule = 'food'),
    reach: () => ({ kind: 'analyse', enabled: true, plot: { x: 6, y: 0 } }),
    words: () => words('ANALYSE'),
    press: {
      game: (_, now) => {
        expect(hasAnalysed(a(now), now, tileOf(now, 6, 0))).toBe(true);
        expect([tileOf(now, 6, 0).owner, a(now).carriedMule]).toEqual([null, 'food']);
      },
    },
  },
  {
    row: '11 over 12: on an own plot with a MULE, Alloy held, no MULE, not analysed',
    at: () => onTile(7, 4),
    game: (s) => void (a(s).stock.alloy = DEVELOPMENT.filterAlloy),
    reach: () => ({ kind: 'analyse', enabled: true, plot: { x: 7, y: 4 } }),
    words: () => words('ANALYSE'),
    press: {
      game: (_, now) => {
        expect(hasAnalysed(a(now), now, tileOf(now, 7, 4))).toBe(true);
        expect(tileOf(now, 7, 4).filter).toBe(false);
      },
    },
  },
  {
    row: '12 FIT FILTER: on an own plot with a MULE, Alloy held',
    at: () => onTile(7, 4),
    game: (s) => void Object.assign(a(s), { analysed: [4 * s.width + 7], stock: { ...a(s).stock, alloy: DEVELOPMENT.filterAlloy } }),
    reach: () => ({ kind: 'filter', enabled: true, plot: { x: 7, y: 4 }, alloy: DEVELOPMENT.filterAlloy }),
    words: () => words('FIT FILTER', `${DEVELOPMENT.filterAlloy} Alloy`),
    press: {
      game: (was, now) => {
        expect(tileOf(now, 7, 4).filter).toBe(true);
        expect(a(was).stock.alloy - a(now).stock.alloy).toBe(DEVELOPMENT.filterAlloy);
      },
    },
  },
  {
    row: '12 FIT FILTER: on an own plot with no MULE, Alloy held, analysed',
    at: () => onTile(2, 4),
    game: (s) => void Object.assign(a(s), { analysed: [4 * s.width + 2], stock: { ...a(s).stock, alloy: DEVELOPMENT.filterAlloy } }),
    reach: () => ({ kind: 'filter', enabled: true, plot: { x: 2, y: 4 }, alloy: DEVELOPMENT.filterAlloy }),
    words: () => words('FIT FILTER', `${DEVELOPMENT.filterAlloy} Alloy`),
    press: {
      game: (was, now) => {
        expect([tileOf(now, 2, 4).filter, tileOf(now, 2, 4).outfit]).toEqual([true, null]);
        expect(a(was).stock.alloy - a(now).stock.alloy).toBe(DEVELOPMENT.filterAlloy);
      },
    },
  },
  {
    row: '13 PUB · END TURN: in the hall at the pub, with the payout pubPayoutFor gives',
    at: () => inHall('pub'),
    cfg: paying,
    reach: (s) => ({ kind: 'pub', enabled: true, payout: stubPayout(s, 'a', SECONDS_LEFT) }),
    words: (s) => words('PUB · END TURN', `+${stubPayout(s, 'a', SECONDS_LEFT)} cr`),
    press: {
      game: (was, now, press) => {
        expect(press.payout).toBeGreaterThan(0);
        expect(a(now).money - a(was).money).toBe(press.payout);
        expect(a(now).doneDeveloping).toBe(true);
      },
    },
  },
  {
    row: '13, with no payout function: the words show no payout',
    at: () => inHall('pub'),
    reach: () => ({ kind: 'pub', enabled: true, payout: null }),
    words: () => words('PUB · END TURN'),
    press: {
      game: (was, now, press) => {
        expect(press.payout).toBeGreaterThan(0);
        expect(a(now).money - a(was).money).toBe(press.payout);
        expect(a(now).doneDeveloping).toBe(true);
      },
    },
  },
  {
    row: '13, with a payout function but no time left asked: the words show no payout',
    at: () => inHall('pub'),
    cfg: paying,
    unasked: true,
    reach: () => ({ kind: 'pub', enabled: true, payout: null }),
    words: () => words('PUB · END TURN'),
    press: {
      game: (was, now, press) => {
        expect(press.payout).toBeGreaterThan(0);
        expect(a(now).money - a(was).money).toBe(press.payout);
      },
    },
  },
  {
    row: "14 none, assaying, at the store's door: ASSAYING, and the stick and a press do nothing",
    at: (s) => ({ space: 'map', ...doorOutside(s, 'doorL', cfg), assayUntilTick: 2 }),
    stick: { x: 1, y: 0, act: false },
    reach: () => ({ kind: 'none', enabled: false, hint: 'assaying' }),
    words: () => ASSAYING,
    press: {
      game: (was, now, press) => {
        expect(now).toEqual(was);
        expect(press.reach).toEqual({ kind: 'none', enabled: false, hint: 'assaying' });
        expect(press.floor.colonists[0]).toMatchObject({ space: 'map', ...doorOutside(was, 'doorL', cfg), moving: false, assayUntilTick: 2 });
      },
    },
  },
  {
    row: '14 none: on the map on a plot already analysed, nothing in reach',
    at: () => onTile(0, 0),
    game: (s) => void (a(s).analysed = [0]),
    reach: () => ({ kind: 'none', enabled: false, hint: 'store' }),
    words: () => words('TO THE STORE', null, false),
    press: 'nothing',
  },
];

describe('the dev floor: the action button', () => {
  it("T-AC-3: Reach per RULE-3's table, one row each", () => {
    for (const r of TABLE) {
      const { state, floor } = world(r);
      const was = structuredClone(state);
      const config = r.cfg ?? cfg;
      const reach = reachNow(floor, state, config, !r.unasked);
      expect(reach, r.row).toEqual(r.reach(was));
      expect(reachWords(reach), r.row).toEqual(r.words(was));

      // The press in a tick: the step first, then the press where the step left the colonist.
      const stick = r.stick ?? IDLE;
      const walked = stepFloor(floor, state, { a: stick }, DEV_STEER.tickMs, config).colonists[0]!;
      const pressed = () => tick(state, floor, { a: { ...stick, act: true } }, config);
      if (typeof r.press === 'object' && 'refused' in r.press) {
        expect(pressed, r.row).toThrow(RuleError);
        expect(pressed, r.row).toThrow(r.press.refused);
        continue;
      }
      const { stepped, floor: after, presses } = pressed();
      const me = after.colonists[0]!;
      if (typeof r.press === 'object' && 'door' in r.press) {
        expect(me.space, `${r.row}: through the door`).not.toBe(floor.colonists[0]!.space);
        expect(me, `${r.row}: as walking through it`).toEqual(throughTheDoor(state, floor, r.press.door));
        expect(presses, `${r.row}: the press spent on the door`).toEqual([]);
        expect(state, `${r.row}: the game as it was`).toEqual(was);
        continue;
      }
      expect([me.space, me.x, me.y], `${r.row}: where its stick took it`).toEqual([walked.space, walked.x, walked.y]);
      expect(presses.length, `${r.row}: one press`).toBe(1);
      const press = presses[0]!;
      if (!r.stick && !r.unasked) expect(press.reach, r.row).toEqual(reach);
      if (typeof r.press === 'object' && 'game' in r.press) r.press.game(was, state, press);
      else expect(state, `${r.row}: the press leaves the game as it was`).toEqual(was);
      if (press.reach.kind === 'analyse') assays(r.row, state, after, press, config);
      else expect(press.floor, `${r.row}: the floor as the step left it`).toBe(stepped);

      if (r.row.startsWith('13')) {
        // After the pub the turn is over: the button dims and a second press changes nothing.
        expect(reachWords(reachNow(after, state, config))).toEqual(words('IN THE PUB', 'turn over', false));
        const done = structuredClone(state);
        tick(state, after, { a: { ...IDLE, act: true } }, config);
        expect(state).toEqual(done);
      }
    }
  });

  it('T-AC-3: on an own plot with a MULE, Alloy held, not analysed, leading none, the button says ANALYSE, then FIT FILTER, then where to go', () => {
    const { state, floor } = world({ at: () => onTile(7, 4), game: (s) => void (a(s).stock.alloy = DEVELOPMENT.filterAlloy) });
    const press = (f: DevFloor) => tick(state, f, { a: { ...IDLE, act: true } }).floor;
    expect(reachWords(reachNow(floor, state))).toEqual(words('ANALYSE'));
    const analysed = press(floor);
    expect(hasAnalysed(a(state), state, tileOf(state, 7, 4))).toBe(true);
    expect(reachWords(reachNow(analysed, state))).toEqual(ASSAYING);
    let assayed = analysed;
    while (assayed.colonists[0]!.assayUntilTick !== null) assayed = stepFloor(assayed, state, {}, DEV_STEER.tickMs, cfg);
    expect(reachWords(reachNow(assayed, state))).toEqual(words('FIT FILTER', `${DEVELOPMENT.filterAlloy} Alloy`));
    const filtered = press(assayed);
    expect(tileOf(state, 7, 4).filter).toBe(true);
    expect(reachWords(reachNow(filtered, state)), "row 14's hint").toEqual(words('TO THE STORE', null, false));
  });

  it('T-AC-3: every outfit the game sells is offered at exactly one place in the hall', () => {
    const offered = HALL_PLACES.flatMap((place) => {
      const { state, floor } = world({ at: () => inHall(place), game: (s) => void (a(s).carriedMule = 'empty') });
      const reach = reachNow(floor, state);
      return reach.kind === 'outfit' ? [reach.good] : [];
    });
    expect(offered.sort()).toEqual(Object.keys(MULE.outfitCost).sort());
  });
});
