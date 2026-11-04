import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  applyReach,
  buildFloor,
  createGame,
  DEV_STEER,
  doorPresses,
  floorConfig,
  GLINT,
  HALL,
  meetWolves,
  pressOrder,
  SCRAMBLE,
  settleMoments,
  stepFloor,
  wolfInput,
  WOLVES,
  type DevFloor,
  type FloorBeat,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type Terrain,
  type WolfFightLevel,
} from '../src/index.js';

/**
 * The floor's three moments (arcade C4): wolves (RULE-4), the glint race (RULE-5) and the corral scramble (RULE-6),
 * headless, through the same calls a tick makes (RULE-1): stepFloor, settleMoments, then each press's applyReach.
 * Outcomes are asserted where they land: the floor's colonists and moments, and the game's money and stock.
 */

const LAND: Record<string, Terrain> = { '.': 'plains', f: 'forest', '~': 'lake', S: 'store' };

/** Forest all round the store, a lake in one corner: wolf land. */
const FOREST = [
  'fffffffffffffff',
  'fffffffffffffff',
  'fffffffffffffff',
  'fff~~ffffffffff',
  'fffffffSfffffff',
  'fffffffffffffff',
  'fffffffffffffff',
  'fffffffffffffff',
  'fffffffffffffff',
];

/** Plains with a lake: glint land, and no wolves. */
const PLAINS = FOREST.map((row) => row.replaceAll('f', '.'));

const SEATS = ['a', 'b', 'c', 'd'] as const;
const TICK = DEV_STEER.tickMs;
const ticks = (seconds: number) => Math.round((seconds * 1_000) / TICK);
const SECONDS_LEFT = 30;
const IDLE: FloorInput = { x: 0, y: 0, act: false };
const cfg = floorConfig(HALL);

/** Four seats in development on `map`, A to D, each rich and owning one free plot on the map's bottom row. */
function world(seed: number, map: readonly string[]): GameState {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id.toUpperCase(), isAi: id === 'c', species: 'gearling' as const })) });
  while (state.phase !== 'development') advancePhase(state);
  const template = state.tiles[0]!;
  state.width = map[0]!.length;
  state.height = map.length;
  state.tiles = map.flatMap((row, y) =>
    [...row].map((ch, x) => ({ ...template, x, y, terrain: LAND[ch]!, traits: [], owner: null, outfit: null, filter: false, pollution: 0, runMonths: 0 })),
  );
  SEATS.forEach((id, i) => (state.tiles[(state.height - 1) * state.width + i * 3]!.owner = id));
  for (const p of state.players) Object.assign(p, { money: 1_000, carriedMule: null, hungry: false, sick: false });
  return state;
}

const seat = (floor: DevFloor, id: string) => floor.colonists.find((c) => c.id === id)!;
const player = (state: GameState, id: string) => state.players.find((p) => p.id === id)!;
const moved = (floor: DevFloor, id: string, patch: Partial<FloorColonist>): DevFloor => ({
  ...floor,
  colonists: floor.colonists.map((c) => (c.id === id ? { ...c, ...patch } : c)),
});

/**
 * One tick as the server and the sim run it (RULE-1): the step, the moments it settled paid, then each press the step
 * did not spend, in pressOrder at the stepped position. The floor after it, with every beat of the tick.
 */
function tick(state: GameState, floor: DevFloor, inputs: Record<string, FloorInput>, config: FloorConfig = cfg): DevFloor {
  const spent = doorPresses(floor, state, inputs, config);
  let next = settleMoments(state, stepFloor(floor, state, inputs, TICK, config), config);
  for (const id of pressOrder(next, Object.keys(inputs).filter((s) => inputs[s]!.act && !spent.has(s)))) {
    next = applyReach(state, next, id, SECONDS_LEFT, config).floor;
  }
  return next;
}

const texts = (beats: readonly FloorBeat[]) => beats.map((b) => b.text);

/** 'a' on the forest below the store, meeting a pack: the floor in its choice, and the game. */
function meeting(seed: number, mule = false): { state: GameState; floor: DevFloor } {
  const state = world(seed, FOREST);
  if (mule) player(state, 'a').carriedMule = 'food';
  const built = buildFloor(state, cfg);
  const floor = moved(built, 'a', { space: 'map', x: 7.5, y: 6.5, lead: mule ? { good: 'food', x: 7.5, y: 6.2 } : null });
  return { state, floor: meetWolves(floor, state, 'a', cfg) };
}

type WolfEnd = { won: boolean; lost: boolean; bitten: boolean; floor: DevFloor; state: GameState; ticks: number };

/** 'a' plays the pack out as a bot of `level` that fights or runs: every tick its input, the tick, until the pack is gone. */
function playPack(seed: number, how: { level: WolfFightLevel; fights: boolean }, mule = false): WolfEnd {
  const met = meeting(seed, mule);
  const { state } = met;
  let floor = met.floor;
  const limit = ticks(WOLVES.chooseSeconds + WOLVES.fightSeconds + WOLVES.giveUpSeconds + 2);
  let n = 0;
  const lost = () => player(state, 'a').muleBolted === true || (seat(floor, 'a').stunnedUntilTick ?? 0) > floor.tick;
  for (; n < limit && seat(floor, 'a').encounter; n++) floor = tick(state, floor, { a: wolfInput(floor, state, 'a', cfg, how) });
  expect(seat(floor, 'a').encounter, `seed ${seed}: the pack still there after ${n} ticks`).toBeNull();
  return { won: seat(floor, 'a').pelts === WOLVES.pelts, lost: lost(), bitten: seat(floor, 'a').bitten, floor, state, ticks: n };
}

describe('the floor moments: wolves (RULE-4)', () => {
  it('T-AC-6: the rookie wins about 1 in 4 over 60 seeded fights; a forest run escapes about 13 of 20', { timeout: 60_000 }, () => {
    const wins = (level: WolfFightLevel) => Array.from({ length: 60 }, (_, i) => playPack(100 + i, { level, fights: true })).filter((f) => f.won).length;
    const rookie = wins('rookie');
    // The mock's headless run: 17 of 60. About 1 in 4: well clear of never and of always.
    expect(rookie, 'rookie wins of 60').toBeGreaterThanOrEqual(9);
    expect(rookie, 'rookie wins of 60').toBeLessThanOrEqual(24);
    // The level is what wins it: a veteran's dodge and strike win most of theirs.
    expect(wins('veteran'), 'veteran wins of 60').toBeGreaterThan(rookie + 15);

    const runs = Array.from({ length: 20 }, (_, i) => playPack(300 + i, { level: 'rookie', fights: false }));
    const away = runs.filter((r) => !r.bitten).length;
    // The mock's: 13 of 20. Running is a real way out, and not a sure one.
    expect(away, 'forest runs escaped of 20').toBeGreaterThanOrEqual(9);
    expect(away, 'forest runs escaped of 20').toBeLessThanOrEqual(18);
    for (const r of runs) {
      expect(r.won || r.lost, 'a run neither wins pelts nor loses the fight').toBe(false);
      // Bitten is slowed till the store or an own plot; got away is not.
      expect(r.floor.colonists[0]!.bitten).toBe(r.bitten);
    }
  });

  it('T-AC-6: a won fight leaves pelts on the colonist, and a lost one bolts the MULE through boltMule, or stuns', { timeout: 60_000 }, () => {
    const fights = Array.from({ length: 40 }, (_, i) => playPack(500 + i, { level: 'rookie', fights: true }, true));
    const won = fights.filter((f) => f.won);
    const lost = fights.filter((f) => f.lost);
    expect(won.length).toBeGreaterThan(0);
    expect(lost.length).toBeGreaterThan(0);
    for (const f of won) {
      expect(f.state.players[0]!.money, 'pelts are carried, not paid, until the store buys them').toBe(1_000);
      expect(f.state.players[0]!.muleBolted).toBeUndefined();
    }
    for (const f of lost) {
      // The rule's own flag, set by game.ts's boltMule: the MULE is the seat's still, not led.
      expect(f.state.players[0]!.muleBolted).toBe(true);
      expect(f.state.players[0]!.carriedMule).toBe('food');
      // It runs off on its own: boltTiles at boltSpeed, then stands, far from its colonist.
      let floor = f.floor;
      for (let i = 0; i < ticks(WOLVES.boltTiles / WOLVES.boltSpeed + 1); i++) floor = tick(f.state, floor, { a: IDLE });
      const a = seat(floor, 'a');
      expect(Math.hypot(a.lead!.x - a.x, a.lead!.y - a.y), 'the bolted MULE ran off').toBeGreaterThan(DEV_STEER.leadTiles + 1);
    }
    // No MULE on the lead: a lost fight stuns instead, and never bolts what is not there.
    const bare = Array.from({ length: 40 }, (_, i) => playPack(500 + i, { level: 'rookie', fights: true })).filter((f) => f.lost);
    expect(bare.length).toBeGreaterThan(0);
    for (const f of bare) {
      expect(f.state.players[0]!.muleBolted).toBeUndefined();
      const a = seat(f.floor, 'a');
      expect(a.stunnedUntilTick! - f.floor.tick).toBeGreaterThan(ticks(WOLVES.stunSeconds) - 2);
      const still = tick(f.state, f.floor, { a: { x: 1, y: 0, act: false } });
      expect([seat(still, 'a').x, seat(still, 'a').y], 'stunned: the stick does nothing').toEqual([a.x, a.y]);
    }
  });

  it('T-AC-6: a fight lost with the MULE already bolted stuns, and boltMule is not called twice', () => {
    const { state, floor } = meeting(7, true);
    player(state, 'a').muleBolted = true;
    let f = floor;
    for (let i = 0; i < ticks(WOLVES.chooseSeconds + WOLVES.fightSeconds + 1) && seat(f, 'a').encounter; i++) f = tick(state, f, { a: IDLE });
    // Standing still is a fight with no dodges: three bites lose it.
    expect(seat(f, 'a').encounter).toBeNull();
    expect(seat(f, 'a').stunnedUntilTick! > f.tick).toBe(true);
    expect(player(state, 'a').muleBolted).toBe(true);
  });

  it('T-AC-6 negative: no wolves in the hall, on plains, or with WOLVES.on false', () => {
    const roll = (map: readonly string[], at: Partial<FloorColonist>, config: FloorConfig) => {
      const state = world(11, map);
      let floor = moved(buildFloor(state, config), 'a', at);
      const lucky = { ...config, wolves: { ...config.wolves, chancePerSecond: 1_000 } };
      for (let i = 0; i < ticks(5); i++) floor = tick(state, floor, { a: IDLE }, lucky);
      return seat(floor, 'a').encounter;
    };
    // Positive control: on the forest, a pack comes at once.
    expect(roll(FOREST, { space: 'map', x: 7.5, y: 6.5 }, cfg)).not.toBeNull();
    expect(roll(FOREST, { space: 'hall', ...HALL.spots.corral }, cfg)).toBeNull();
    expect(roll(PLAINS, { space: 'map', x: 7.5, y: 6.5 }, cfg)).toBeNull();
    expect(roll(FOREST, { space: 'map', x: 7.5, y: 6.5 }, { ...cfg, wolves: { ...cfg.wolves, on: false } })).toBeNull();
  });
});

/** Idle colonists stepped through a whole turn: each glint lit, from which tick to which, and where. */
function glintsOf(seed: number): { lit: number; gone: number; x: number; y: number; state: GameState; beats: string[] }[] {
  const state = world(seed, PLAINS);
  let floor = buildFloor(state, cfg);
  const out: { lit: number; gone: number; x: number; y: number; state: GameState; beats: string[] }[] = [];
  for (let i = 0; i < ticks(50); i++) {
    const was = floor.moments.glint;
    floor = tick(state, floor, {});
    const now = floor.moments.glint;
    if (now && now !== was && (!was || was.sinceTick !== now.sinceTick)) out.push({ lit: floor.tick, gone: -1, x: now.x, y: now.y, state, beats: texts(floor.moments.beats) });
    if (was && !now) {
      out.at(-1)!.gone = floor.tick;
      out.at(-1)!.beats.push(...texts(floor.moments.beats));
    }
  }
  return out;
}

describe('the floor moments: the glint race (RULE-5)', () => {
  it('T-AC-7: glint timing per RULE-5: none in the first 6 s, 8 s shown, a pause before the next, on open land', () => {
    const all = Array.from({ length: 30 }, (_, i) => glintsOf(40 + i));
    // A mean gap of 20 s over a 44 s window: most turns see one.
    expect(all.filter((g) => g.length > 0).length).toBeGreaterThan(20);
    for (const glints of all) {
      glints.forEach((g, i) => {
        expect(g.lit, 'lit after the turn\'s first seconds').toBeGreaterThan(ticks(GLINT.firstAfterSeconds));
        expect(g.beats[0]).toBe(`A Crystite glint at ${g.x + 1}·${g.y + 1}! First there wins`);
        if (g.gone >= 0) {
          expect(g.gone - g.lit, 'shown its seconds, then faded').toBe(ticks(GLINT.showSeconds));
          expect(g.beats.at(-1)).toBe('The glint faded');
        }
        if (i > 0) expect(g.lit - glints[i - 1]!.gone, 'a pause after one ends').toBeGreaterThanOrEqual(ticks(GLINT.pauseSeconds));
        const tile = g.state.tiles[g.y * g.state.width + g.x]!;
        expect(['lake', 'store']).not.toContain(tile.terrain);
      });
    }
  });

  /** A glint lit on the plains tile left of 'a', with 'a' (and 'b', if asked) one step off it. */
  function lit(withB: boolean, at = 0) {
    const state = world(3, PLAINS);
    let floor = buildFloor(state, cfg);
    floor = { ...floor, tick: at, moments: { ...floor.moments, glint: { x: 5, y: 6, sinceTick: at, untilTick: at + ticks(GLINT.showSeconds) } } };
    floor = moved(floor, 'a', { space: 'map', x: 4.8, y: 6.5 });
    if (withB) floor = moved(floor, 'b', { space: 'map', x: 6.2, y: 6.5 });
    return { state, floor };
  }

  it('T-AC-7: the first onto it wins the prize through awardGlint, once, and everyone is told', () => {
    const { state, floor } = lit(false);
    const crystite = player(state, 'a').stock.crystite;
    let f = floor;
    for (let i = 0; i < ticks(1) && f.moments.glint; i++) f = tick(state, f, { a: { x: 1, y: 0, act: false } });
    expect(f.moments.glint).toBeNull();
    expect(player(state, 'a').stock.crystite - crystite).toBe(GLINT.crystite);
    expect(texts(f.moments.beats)).toEqual([`A got the glint: +${GLINT.crystite} Crystite`]);
    // Standing on where it was pays nothing more.
    for (let i = 0; i < ticks(1); i++) f = tick(state, f, { a: IDLE });
    expect(player(state, 'a').stock.crystite - crystite).toBe(GLINT.crystite);
  });

  it('T-AC-7: GRAB THE GLINT from a step away wins it with the press', () => {
    const { state, floor } = lit(false);
    const crystite = player(state, 'a').stock.crystite;
    const f = tick(state, floor, { a: { ...IDLE, act: true } });
    expect(f.moments.glint).toBeNull();
    expect(player(state, 'a').stock.crystite - crystite).toBe(GLINT.crystite);
  });

  it('T-AC-7: two onto it in one tick: the first in the tick\'s press order wins, and only one prize is paid', () => {
    const winners = [0, 1, 2, 3].map((at) => {
      const { state, floor } = lit(true, at);
      // Both one tick's step off the tile's edge, walking onto it in the same tick.
      let f = moved(moved(floor, 'a', { x: 5 - 0.02 }), 'b', { x: 6 + 0.02 });
      const before = state.players.map((p) => p.stock.crystite);
      f = tick(state, f, { a: { x: 1, y: 0, act: false }, b: { x: -1, y: 0, act: false } });
      const gained = state.players.map((p, i) => p.stock.crystite - before[i]!);
      expect(gained.reduce((n, g) => n + g, 0), 'one prize').toBe(GLINT.crystite);
      const first = pressOrder(f, ['a', 'b'])[0]!;
      expect(gained[first === 'a' ? 0 : 1]).toBe(GLINT.crystite);
      return first;
    });
    // The first seat rotates with the tick, so neither always wins a tie.
    expect(new Set(winners)).toEqual(new Set(['a', 'b']));
  });

  it('T-AC-7 negative: a colonist not racing, a person crossing the tile on its way, wins it too', () => {
    const { state, floor } = lit(false);
    // 'd' is a person's seat and walks along the row with no thought of the glint.
    let f = moved(floor, 'a', { x: 0.5, y: 0.5 });
    f = moved(f, 'd', { space: 'map', x: 3.5, y: 6.5 });
    const crystite = player(state, 'd').stock.crystite;
    for (let i = 0; i < ticks(3) && f.moments.glint; i++) f = tick(state, f, { d: { x: 1, y: 0, act: false } });
    expect(player(state, 'd').stock.crystite - crystite).toBe(GLINT.crystite);
  });
});

/** Four seats at the corral, each needing a MULE, with `mules` left. */
function corral(mules: number) {
  const state = world(9, PLAINS);
  state.store.mules = mules;
  let floor = buildFloor(state, cfg);
  for (const id of SEATS) floor = moved(floor, id, { space: 'hall', ...HALL.spots.corral, y: (HALL.rooms.corral.y0 + HALL.rooms.corral.y1) / 2 });
  return { state, floor };
}

describe('the floor moments: the corral scramble (RULE-6)', () => {
  it('T-AC-8: the scramble per RULE-6, the beats in order, the last sale\'s single line', () => {
    const { state, floor } = corral(3);
    const beats: string[] = [];
    let f = floor;
    for (const id of SEATS) {
      f = tick(state, f, { [id]: { ...IDLE, act: true } });
      beats.push(...texts(f.moments.beats));
    }
    expect(beats).toEqual(['2 MULEs left! Race to the corral', 'B got one: 1 left', 'C got the last one: the corral is empty', 'No MULE this turn for D']);
    expect(state.players.map((p) => p.carriedMule)).toEqual(['empty', 'empty', 'empty', null]);
    expect(state.store.mules).toBe(0);
    // The last sale is told in one line naming its buyer, never a "got one: 0 left" beside it.
    expect(beats.filter((b) => b.startsWith('C '))).toEqual(['C got the last one: the corral is empty']);
    expect(f.moments.scramble).toMatchObject({ over: 'empty', leftOut: ['d'] });
  });

  it('T-AC-8: two pressing for the last MULE in one tick: the first in press order gets it, the other\'s press changes nothing', () => {
    const { state, floor } = corral(2);
    // A's sale calls the scramble; then B and C press in the same tick for the one left.
    let f = tick(state, floor, { a: { ...IDLE, act: true } });
    const money = state.players.map((p) => p.money);
    f = tick(state, f, { b: { ...IDLE, act: true }, c: { ...IDLE, act: true } });
    const [first, second] = pressOrder(f, ['b', 'c']);
    expect(player(state, first!).carriedMule).toBe('empty');
    expect(player(state, second!).carriedMule).toBeNull();
    expect(player(state, second!).money).toBe(money[SEATS.indexOf(second as 'b')]);
    expect(texts(f.moments.beats)).toEqual([`${first!.toUpperCase()} got the last one: the corral is empty`, `No MULE this turn for ${['C', 'B', 'D'].filter((n) => n !== first!.toUpperCase()).sort().join(', ')}`]);
  });

  it('T-AC-8: a scramble the corral outlasts ends on its clock, and is told', () => {
    const { state, floor } = corral(3);
    let f = tick(state, floor, { a: { ...IDLE, act: true } });
    expect(f.moments.scramble?.over).toBeNull();
    const beats: string[] = [];
    for (let i = 0; i < ticks(SCRAMBLE.maxSeconds) + 1; i++) {
      f = tick(state, f, {});
      beats.push(...texts(f.moments.beats));
    }
    expect(beats).toEqual(['The scramble is over: 2 MULEs left']);
    expect(f.moments.scramble?.over).toBe('time');
  });

  it('T-AC-8 negative: no call when no seat needs a MULE, and one scramble a turn', () => {
    const { state, floor } = corral(3);
    // Every other seat already leads a MULE: nobody left needs one.
    for (const id of ['b', 'c', 'd']) player(state, id).carriedMule = 'empty';
    const f = tick(state, floor, { a: { ...IDLE, act: true } });
    expect(f.moments.scramble).toBeNull();
    expect(f.moments.beats).toEqual([]);

    // Positive control: with B needing one, the sale that leaves 2 calls it.
    const again = corral(4);
    let g = tick(again.state, again.floor, { a: { ...IDLE, act: true } });
    expect(g.moments.scramble, 'the sale that leaves 3 calls nothing').toBeNull();
    g = tick(again.state, g, { b: { ...IDLE, act: true } });
    expect(texts(g.moments.beats)).toEqual(['2 MULEs left! Race to the corral']);
    // One a turn: once it is over, another sale under the line calls no second one.
    for (let i = 0; i <= ticks(SCRAMBLE.maxSeconds); i++) g = tick(again.state, g, {});
    expect(g.moments.scramble?.over).toBe('time');
    g = tick(again.state, g, { c: { ...IDLE, act: true } });
    expect(player(again.state, 'c').carriedMule).toBe('empty');
    expect([g.moments.beats, g.moments.scramble?.over]).toEqual([[], 'time']);
  });
});
