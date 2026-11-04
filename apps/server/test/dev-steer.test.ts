import {
  applyReach,
  boxOf,
  buildFloor,
  DEV_STEER,
  DEVELOPMENT,
  doorOutside,
  doorPresses,
  floorConfig,
  HALL,
  IDLE_INPUT,
  pressOrder,
  pubPayoutFor,
  reachOf,
  reachWords,
  RuleError,
  stableJson,
  stepFloor,
  tileIndex,
  type DevFloor,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type HallPlace,
} from '@mule/engine';
import type { DevFrame, MuleIntent, MuleView, ReachView, ServerEnvelope } from '@mule/protocol';
import { Room, TableError } from '@tabletop/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../src/brain/index.js';
import { devFrame } from '../src/dev-steer.js';
import { AI_NAMES, MuleGame } from '../src/mule-game.js';
import { pressAct, seats, steerTo, toDevelopment, walkers, type SteerPoint } from './fake-context.js';

const LENA = 's1';
const OSSA = 's2';
const TICK = DEV_STEER.tickMs;

/** The arcade tick runs only with DEV_STEER.on; every test here turns it on and puts it back. */
let flag = DEV_STEER.on;
beforeEach(() => {
  flag = DEV_STEER.on;
  DEV_STEER.on = true;
});
afterEach(() => {
  DEV_STEER.on = flag;
});

/** The floor config the server steps with: the live config, the store's hall, and game.ts's pub payout. */
const serverCfg = (): FloorConfig => ({ ...floorConfig(), pubPayout: pubPayoutFor });

/** The server's floor, read as the tests read its GameState: through the private field. */
const floorOf = (game: MuleGame): DevFloor => {
  const steering = (game as unknown as { steering: { floor: DevFloor } | null }).steering;
  if (!steering) throw new Error('the server is not steering');
  return steering.floor;
};

/** A hall place's own box's middle: standing there is being at it. */
const inside = (place: HallPlace): SteerPoint => {
  const b = boxOf(place);
  return { space: 'hall', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
};
const spot = (place: HallPlace): SteerPoint => ({ space: 'hall', ...HALL.spots[place] });
/** From the door spot into a room: along the walkway to the room's spot, then in. */
const toRoom = (place: HallPlace): SteerPoint[] => [spot(place), inside(place)];
/** Out of a room: back to its spot on the walkway, then to the left door's spot. */
const toLeftDoor = (from: HallPlace): SteerPoint[] => [spot(from), spot('doorL')];

/**
 * Development with flag on, Lena (Zipwing, seat 0, at the left door) and Ossa (Mollox, seat 1, at the right door), both
 * fed and holding Medicine. Every plot is plains, so a straight steer is a straight walk, and Lena owns `home`, two
 * tiles left of the store on its row. Month 1's clock runs from the start unless `firstMonthWaits`.
 */
function steered(options: { firstMonthWaits?: boolean; ossaHome?: boolean } = {}) {
  let home = { x: 0, y: 0 };
  const changes: number[] = [];
  const g = toDevelopment({
    players: walkers,
    firstMonthWaits: options.firstMonthWaits,
    onChanged: (at) => changes.push(at),
    prepare: (state) => {
      for (const p of state.players) Object.assign(p.stock, { food: 20, medicine: 2 });
      for (const t of state.tiles) {
        if (t.terrain === 'store') continue;
        Object.assign(t, { terrain: 'plains', owner: null, outfit: null });
      }
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      home = { x: store.x - 2, y: store.y };
      state.tiles[tileIndex(state.width, home.x, home.y)]!.owner = LENA;
      if (options.ossaHome) state.tiles[tileIndex(state.width, store.x + 2, store.y)]!.owner = OSSA;
    },
  });
  const start = g.ctx.now();
  // Development started inside toDevelopment's last step; the views that went out before it are not this test's.
  changes.length = 0;
  g.frames.length = 0;
  const homeMiddle: SteerPoint = { space: 'map', x: home.x + 0.5, y: home.y + 0.5 };
  // The fake clock fires a timer only once it has jumped past it, so a long jump is a late timer: step a tick at a time,
  // as a room's timers fire, unless a test means the jump (`jump`).
  const advance = (ms: number) => {
    for (let left = ms; left > 0; left -= TICK) g.advance(Math.min(TICK, left));
  };
  return { ...g, advance, jump: g.advance, start, home, homeMiddle, changes, advanceTo: (at: number) => advance(at - g.ctx.now()) };
}

type Steered = ReturnType<typeof steered>;

const reachOfSeat = (g: Steered, seat: string): ReachView | undefined => g.game.viewFor(seat).me?.reach;
const meOf = (g: Steered, seat: string) => g.state.players.find((p) => p.id === seat)!;

/** Lena, from her start outside the left door: in, BUY MULE at the corral, OUTFIT · FOOD, back out to the map. */
function lenaBuysAndOutfits(g: Steered): void {
  pressAct(g.game, g, LENA); // ENTER STORE
  steerTo(g.game, g, LENA, toRoom('corral'));
  pressAct(g.game, g, LENA); // BUY MULE
  steerTo(g.game, g, LENA, [spot('corral'), ...toRoom('food')]);
  pressAct(g.game, g, LENA); // OUTFIT · FOOD
  steerTo(g.game, g, LENA, toLeftDoor('food'));
  pressAct(g.game, g, LENA); // LEAVE
}

/** The whole turn Lena plays: into the store, a fitted MULE, out, and installed on her plot. */
function lenaInstalls(g: Steered): void {
  lenaBuysAndOutfits(g);
  steerTo(g.game, g, LENA, [g.homeMiddle]);
  pressAct(g.game, g, LENA); // INSTALL · FOOD
}

describe('T-AC-1 (server part): the server steps the same floor as stepFloor', () => {
  /**
   * Every intent the test's seats sent, with the floor's tick when it reached the server: an unstamped steer or an act
   * sent while the floor stands at tick T is the input of the step from T (RULE-1: latest-wins, acts since the last tick).
   */
  function scriptedTurn() {
    const g = steered();
    const initial = structuredClone(g.state);
    const firstFloor = structuredClone(floorOf(g.game));
    const sent: { tick: number; seat: string; intent: MuleIntent }[] = [];
    const handle = g.game.handle.bind(g.game);
    g.game.handle = (seat, intent) => {
      sent.push({ tick: floorOf(g.game).tick, seat, intent: structuredClone(intent) });
      handle(seat, intent);
    };
    // Ossa wanders off on the map while Lena plays her errand; the two overlap in time.
    g.game.handle(OSSA, { type: 'steer', x: 0.5, y: 0.5 });
    lenaBuysAndOutfits(g);
    g.game.handle(OSSA, { type: 'steer', x: -0.25, y: 1 });
    steerTo(g.game, g, LENA, [g.homeMiddle]);
    pressAct(g.game, g, LENA);
    g.game.handle(OSSA, { type: 'steer', x: 0, y: 0 });
    g.advance(10 * TICK);
    return { g, initial, firstFloor, sent, ticks: floorOf(g.game).tick };
  }

  /** The script's inputs for the step from each tick, rebuilt from what was sent, the way RULE-1 reads them. */
  function inputsByTick(sent: { tick: number; seat: string; intent: MuleIntent }[], ticks: number) {
    const stick: Record<string, { x: number; y: number }> = {};
    const out: Record<string, FloorInput>[] = [];
    for (let t = 0; t < ticks; t++) {
      const acts = new Set<string>();
      for (const s of sent.filter((e) => e.tick === t)) {
        if (s.intent.type === 'steer') stick[s.seat] = { x: s.intent.x, y: s.intent.y };
        if (s.intent.type === 'act') acts.add(s.seat);
      }
      out.push(Object.fromEntries(walkers.map((w) => [w.id, { ...(stick[w.id] ?? IDLE_INPUT), act: acts.has(w.id) }])));
    }
    return out;
  }

  /** The floor-reach test's tick (RULE-1), copied: the step, then each press the step did not spend, in pressOrder, chained. */
  function referenceTurn(initial: GameState, inputs: Record<string, FloorInput>[], secondsLeft: (tick: number) => number) {
    const state = structuredClone(initial);
    const cfg = serverCfg();
    let floor = buildFloor(state, cfg);
    for (const [t, step] of inputs.entries()) {
      const spent = doorPresses(floor, state, step, cfg);
      const stepped = stepFloor(floor, state, step, TICK, cfg);
      const pressing = pressOrder(stepped, Object.keys(step).filter((seat) => step[seat]!.act && !spent.has(seat)));
      floor = pressing.reduce((f, seat) => applyReach(state, f, seat, secondsLeft(t), cfg).floor, stepped);
    }
    return { state, floor };
  }

  const secondsLeft = (tick: number) => DEVELOPMENT.fullSeconds - ((tick + 1) * TICK) / 1_000;

  it("T-AC-1: after a scripted turn (Lena buys, outfits, leaves and installs; Ossa walks the map) the server's floor and GameState equal stepFloor's from the same start and inputs", () => {
    const { g, initial, firstFloor, sent, ticks } = scriptedTurn();
    expect(g.state.tiles[tileIndex(g.state.width, g.home.x, g.home.y)]!.outfit, 'the script played out: the MULE is installed').toBe('food');
    expect(firstFloor, 'the server starts from the floor buildFloor builds').toEqual(buildFloor(structuredClone(initial), serverCfg()));
    const ref = referenceTurn(initial, inputsByTick(sent, ticks), secondsLeft);
    expect(floorOf(g.game)).toEqual(ref.floor);
    expect(stableJson(g.state)).toBe(stableJson(ref.state));
  });

  it('T-AC-1 (negative): one input changed at one tick changes the result', () => {
    const { g, initial, sent, ticks } = scriptedTurn();
    const inputs = inputsByTick(sent, ticks);
    // The last tick Lena walks, out on the map to her plot: she stands still for it instead. (A tick in the hall would
    // be undone by her LEAVE, which puts her at the door wherever she stood in it.)
    const walks = (step: Record<string, FloorInput>) => (step[LENA]!.x !== 0 || step[LENA]!.y !== 0) && !step[LENA]!.act;
    const at = inputs.length - 1 - [...inputs].reverse().findIndex(walks);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(inputs.length);
    inputs[at] = { ...inputs[at]!, [LENA]: IDLE_INPUT };
    expect(floorOf(g.game)).not.toEqual(referenceTurn(initial, inputs, secondsLeft).floor);
  });

  it("RULE-10: a steer stamped with a later tick applies at that tick, and one stamped with a tick already gone applies at the next", () => {
    const g = steered();
    const start = floorOf(g.game).tick;
    const xAt = () => floorOf(g.game).colonists.find((c) => c.id === OSSA)!.x;
    const x0 = xAt();
    g.game.handle(OSSA, { type: 'steer', x: 1, y: 0, tick: start + 3 });
    g.advance(3 * TICK);
    expect(floorOf(g.game).tick).toBe(start + 3);
    expect(xAt(), 'not before its tick').toBe(x0);
    g.advance(TICK);
    expect(xAt(), 'from its tick on').toBeGreaterThan(x0);
    g.game.handle(OSSA, { type: 'steer', x: 0, y: 0, tick: 0 });
    const x1 = xAt();
    g.advance(TICK);
    expect(xAt(), 'a late steer applies at the next tick').toBe(x1);
  });
});

describe('T-AC-4 (server part): one frame a tick; full views only on change', () => {
  it('T-AC-4: every tick sends one frame, its positions rounded to 2 decimals, in tick order with at = tick × tickMs', () => {
    const g = steered();
    g.game.handle(OSSA, { type: 'steer', x: 0.375, y: 0.625 });
    g.advance(40 * TICK);
    const frames = g.frames as DevFrame[];
    expect(frames).toHaveLength(40);
    expect(frames.map((f) => f.tick)).toEqual(frames.map((_, i) => frames[0]!.tick + i));
    for (const f of frames) {
      expect(f.at).toBe(f.tick * TICK);
      expect(f.colonists.map((c) => c.id)).toEqual([LENA, OSSA]);
      for (const c of f.colonists) for (const n of [c.x, c.y, c.lead?.x ?? 0, c.lead?.y ?? 0]) expect(Math.round(n * 100) / 100, `${c.id} ${n}`).toBe(n);
    }
    const ossa = frames.at(-1)!.colonists[1]!;
    const floor = floorOf(g.game).colonists[1]!;
    expect([ossa.x, ossa.y]).toEqual([Math.round(floor.x * 100) / 100, Math.round(floor.y * 100) / 100]);
    expect(ossa.moving).toBe(true);
  });

  it('T-AC-4 (negative): no full view on a tick where nothing changed and no seat\'s reach words changed', () => {
    const g = steered();
    g.advance(40 * TICK);
    expect(g.frames).toHaveLength(40);
    expect(g.changes).toEqual([]);
  });

  it('T-AC-4 (AM-13, AM-21): a steer or a press sends no full view by itself, and the room is told so: MuleGame is quiet for steer and act only', () => {
    const g = steered();
    expect(g.game.quiet({ type: 'steer', x: 1, y: 0 })).toBe(true);
    expect(g.game.quiet({ type: 'act' })).toBe(true);
    expect(g.game.quiet({ type: 'ready' })).toBe(false);
    for (let i = 0; i < 20; i++) g.game.handle(OSSA, { type: 'steer', x: i % 2 ? 0 : 0.125, y: 0 });
    expect(g.changes).toEqual([]);
  });

  it("T-AC-4 (AM-11): walking with no state change, a view goes on exactly the ticks a seat's reach words change", () => {
    const g = steered();
    let words = stableJson(reachOfSeat(g, LENA));
    const changedOn: boolean[] = [];
    const wordsChangedOn: boolean[] = [];
    g.game.handle(LENA, { type: 'steer', x: -1, y: 0 });
    for (let t = 0; t < 60; t++) {
      const before = g.changes.length;
      g.advance(TICK);
      const now = stableJson(reachOfSeat(g, LENA));
      changedOn.push(g.changes.length > before);
      wordsChangedOn.push(now !== words);
      words = now;
    }
    expect(wordsChangedOn.filter(Boolean).length, 'the walk crossed onto another reach').toBeGreaterThan(0);
    expect(changedOn).toEqual(wordsChangedOn);
  });

  it('T-AC-4: a press that changes the game sends full views: BUY MULE at the corral', () => {
    const g = steered();
    pressAct(g.game, g, LENA);
    steerTo(g.game, g, LENA, toRoom('corral'));
    expect(reachOfSeat(g, LENA)?.verb).toBe('BUY MULE');
    const money = meOf(g, LENA).money;
    g.changes.length = 0;
    pressAct(g.game, g, LENA);
    expect(meOf(g, LENA).carriedMule).toBe('empty');
    expect(meOf(g, LENA).money).toBeLessThan(money);
    expect(g.changes).toHaveLength(1);
  });
});

describe("UBER-AC-3 (server part): the moments' lines reach the TV in the tick's frame", () => {
  it("UBER-AC-3: a pack meeting a colonist, an AI's among them, puts its 'Wolves!' line in that tick's frame, once", () => {
    // Every plot forest, wolf land: the colonists stand where development starts them, outside the store's doors, and
    // the packs come to them there (an AI's stands still on this server until it steers, a person's with no steer).
    const g = toDevelopment({
      players: seats,
      prepare: (state) => {
        for (const t of state.tiles) if (t.terrain !== 'store') Object.assign(t, { terrain: 'forest', owner: null, outfit: null });
      },
    });
    g.frames.length = 0;
    const named = new Map(g.state.players.map((p) => [p.id, p.name]));
    const met: { tick: number; line: string }[] = [];
    // A meeting: a pack round a colonist that had none the tick before.
    let before = floorOf(g.game);
    for (let i = 0; i < 600 && g.game.viewFor(null).phase === 'development'; i++) {
      g.advance(TICK);
      const floor = floorOf(g.game);
      for (const c of floor.colonists) {
        if (c.encounter && !before.colonists.find((b) => b.id === c.id)!.encounter) met.push({ tick: floor.tick, line: `Wolves! ${named.get(c.id)}: run or fight?` });
      }
      before = floor;
    }
    const ai = g.state.players.find((p) => p.isAi)!;
    expect(met.some((m) => m.line.includes(ai.name)), 'a pack met the AI').toBe(true);
    const frames = g.frames as DevFrame[];
    // Each meeting's line is in its tick's frame, once; and no frame carries a 'Wolves!' line for a meeting not this tick.
    for (const m of met) expect(frames.find((f) => f.tick === m.tick)!.beats.filter((b) => b === m.line), `tick ${m.tick}`).toEqual([m.line]);
    const shown = frames.flatMap((f) => f.beats.filter((b) => b.endsWith(': run or fight?')).map((line) => ({ tick: f.tick, line })));
    expect(shown).toEqual(met);
  });
});

describe("AM-28: the frame carries the moments' state, straight from the floor", () => {
  /** The server's floor at development start, with one colonist or the moments changed as a row needs. */
  const floorWith = (patch: { lena?: Partial<DevFloor['colonists'][number]>; moments?: Partial<DevFloor['moments']> }): DevFloor => {
    const floor = floorOf(steered().game);
    return {
      ...floor,
      colonists: floor.colonists.map((c) => (c.id === LENA ? { ...c, ...patch.lena } : c)),
      moments: { ...floor.moments, ...patch.moments },
    };
  };
  const none = { packs: [], glint: null, scramble: null, bolted: [] };

  it('AM-28: with no pack, no glint, no scramble and no bolted MULE, the frame has no moments key', () => {
    const frame = devFrame(floorWith({}));
    expect('moments' in frame, 'the key is missing, not empty').toBe(false);
  });

  it('AM-28: a pack mid-fight: whose, its stage, when and where the stage began, its strikes and bites, and each wolf rounded', () => {
    const wolf = { angle: 1, sinceTick: 40, untilTick: 52, from: null };
    const encounter = {
      stage: 'fight' as const,
      sinceTick: 37,
      centre: { x: 3.14159, y: 2.71828 },
      wolves: [
        { ...wolf, x: 1.23456, y: 4.56789, state: 'tell' as const, target: { x: 3.00001, y: 2.98765 } },
        { ...wolf, x: 5.55555, y: 1.11111, state: 'prowl' as const, target: null },
      ],
      strikes: 1,
      bites: 2,
      nextLungeTick: 60,
      recoverUntilTick: 37,
    };
    const frame = devFrame(floorWith({ lena: { space: 'map', x: 3, y: 3, encounter } }));
    expect(frame.moments).toEqual({
      ...none,
      packs: [
        {
          who: LENA,
          stage: 'fight',
          sinceTick: 37,
          centre: { x: 3.14, y: 2.72 },
          strikes: 1,
          bites: 2,
          wolves: [
            { x: 1.23, y: 4.57, state: 'tell', target: { x: 3, y: 2.99 } },
            { x: 5.56, y: 1.11, state: 'prowl', target: null },
          ],
        },
      ],
    });
  });

  it('AM-28: a glint lit: its tile and the tick it fades', () => {
    const frame = devFrame(floorWith({ moments: { glint: { x: 4, y: 5, sinceTick: 3, untilTick: 163 } } }));
    expect(frame.moments).toEqual({ ...none, glint: { x: 4, y: 5, untilTick: 163 } });
  });

  it('AM-28: the scramble from its call, and after it ends, to the end of the turn', () => {
    const running = { sinceTick: 9, untilTick: 309, needers: [LENA, OSSA], got: [LENA], over: null, leftOut: [] };
    expect(devFrame(floorWith({ moments: { scramble: running, scrambled: true } })).moments).toEqual({
      ...none,
      scramble: { untilTick: 309, needers: [LENA, OSSA], got: [LENA], over: null, leftOut: [] },
    });
    const over = { ...running, over: 'time' as const, leftOut: [OSSA] };
    expect(devFrame(floorWith({ moments: { scramble: over, scrambled: true } })).moments).toEqual({
      ...none,
      scramble: { untilTick: 309, needers: [LENA, OSSA], got: [LENA], over: 'time', leftOut: [OSSA] },
    });
  });

  it("AM-28: a MULE bolted and not caught, running or standing: its seat, the MULE at the colonist's lead", () => {
    for (const left of [2.5, 0]) {
      const frame = devFrame(floorWith({ lena: { space: 'map', x: 3, y: 3, lead: { good: 'food', x: 6.12345, y: 2.5 }, bolt: { dx: 1, dy: 0, left } } }));
      expect(frame.moments, `bolt with ${left} tiles to run`).toEqual({ ...none, bolted: [LENA] });
      expect(frame.colonists.find((c) => c.id === LENA)!.lead).toEqual({ good: 'food', x: 6.12, y: 2.5 });
    }
  });
});

describe('RULE-1: the tick keeps to the clock', () => {
  it('RULE-1: a late timer runs the ticks it missed, at most catchUpTicks, then resyncs and ticks on every tickMs', () => {
    const g = steered();
    g.game.handle(OSSA, { type: 'steer', x: 1, y: 0 });
    g.jump(40 * TICK);
    expect(floorOf(g.game).tick).toBe(DEV_STEER.catchUpTicks);
    expect(g.frames).toHaveLength(DEV_STEER.catchUpTicks);
    g.advance(5 * TICK);
    expect(floorOf(g.game).tick, 'resynced: one tick every tickMs from there').toBe(DEV_STEER.catchUpTicks + 5);
    const late = g.game.viewFor(LENA).me!.devEndsAt!;
    expect(late, 'the clock does not move with the ticks').toBe(g.start + DEVELOPMENT.fullSeconds * 1_000);
  });
});

describe('T-AC-4 at the room (AM-21): a press sends at most one full view, the tick\'s', () => {
  it("T-AC-4: on a real Room, Lena mashing the button five times in a tick gets one full view per screen, the tick's, already showing her through the door", async () => {
    vi.useFakeTimers();
    let room: Room<MuleIntent, MuleView> | null = null;
    try {
      const r = new Room<MuleIntent, MuleView>({
        code: 'PRESS',
        createGame: (ctx) => new MuleGame(ctx, 7, { devSteer: true, politics: false, maxMonths: 1, brain: createBrain({ gameId: 'press', env: {} }), log: () => {} }),
        aiNames: AI_NAMES,
        isUserError: (err) => err instanceof RuleError || err instanceof TableError,
      });
      room = r;
      const phones = ['Lena', 'Ossa'].map((name) => {
        const views: MuleView[] = [];
        const from = { seatId: null as string | null };
        const conn = { send: (m: ServerEnvelope<MuleView>) => void (m.t === 'view' && m.view.game && views.push(m.view.game)) };
        r.receive(conn, from, { t: 'join', code: 'PRESS', name });
        return { views, start: () => r.receive(conn, from, { t: 'start' }), send: (intent: MuleIntent) => r.receive(conn, from, { t: 'intent', intent }) };
      });
      const [lena] = phones as [(typeof phones)[number], (typeof phones)[number]];
      lena.start();
      const phase = () => r.viewFor(null).game?.phase;
      for (let i = 0; i < 20_000 && phase() !== 'development'; i++) {
        if (phase() === 'planning' || phase() === 'landGrant') for (const p of phones) p.send({ type: 'ready' });
        await vi.advanceTimersByTimeAsync(100);
      }
      expect(phase()).toBe('development');
      await vi.advanceTimersByTimeAsync(TICK);
      expect(lena.views.at(-1)!.me!.reach?.verb).toBe('ENTER STORE');
      const seen = phones.map((p) => p.views.length);
      for (let k = 0; k < 5; k++) lena.send({ type: 'act' });
      await vi.advanceTimersByTimeAsync(2 * TICK);
      for (const [i, p] of phones.entries()) {
        const after = p.views.slice(seen[i]);
        expect(after, `screen ${i}: one view, the tick's`).toHaveLength(1);
        expect(after[0]!.players[0]!.colonist!.space, `screen ${i}: it shows the press applied`).toBe('hall');
      }
      expect(lena.views.at(-1)!.me!.reach?.verb).toBe('LEAVE');
    } finally {
      room?.dispose();
      vi.useRealTimers();
    }
  });
});

describe('T-AC-9: development never stalls on a phone', () => {
  it('T-AC-9: with Ossa away for the whole turn, development still ends at devEndsAt, and the tick ran every tickMs until then', () => {
    const g = steered();
    g.game.connectionChanged(OSSA, false);
    const endsAt = g.game.viewFor(LENA).me!.devEndsAt!;
    expect(endsAt).toBe(g.start + DEVELOPMENT.fullSeconds * 1_000);
    g.advanceTo(endsAt - 1);
    expect(g.game.viewFor(null).phase).toBe('development');
    expect(floorOf(g.game).tick).toBe(Math.floor((endsAt - 1 - g.start) / TICK));
    g.advanceTo(endsAt);
    expect(g.game.viewFor(null).phase).toBe('production');
  });

  it("T-AC-9: a dropped phone's input is zeroed at once: its colonist stops where it is", () => {
    const g = steered();
    g.game.handle(OSSA, { type: 'steer', x: 1, y: 0 });
    g.advance(10 * TICK);
    g.game.connectionChanged(OSSA, false);
    const at = floorOf(g.game).colonists[1]!;
    g.advance(10 * TICK);
    expect(floorOf(g.game).colonists[1]!).toMatchObject({ x: at.x, y: at.y, moving: false });
    g.game.connectionChanged(OSSA, true);
    g.game.handle(OSSA, { type: 'steer', x: 1, y: 0 });
    g.advance(TICK);
    expect(floorOf(g.game).colonists[1]!.x, 'back, it steers again').toBeGreaterThan(at.x);
  });

  it('T-AC-9: a phone flooding steers at 100 a second does not slow the tick: one tick every tickMs, and development ends at devEndsAt', () => {
    const g = steered();
    const endsAt = g.game.viewFor(LENA).me!.devEndsAt!;
    let sent = 0;
    while (g.ctx.now() < endsAt - 10) {
      g.game.handle(LENA, { type: 'steer', x: sent % 2 ? 1 : -1, y: sent % 3 ? 0.5 : -0.5 });
      sent++;
      g.advance(10);
      if ((g.ctx.now() - g.start) % 1_000 === 0) expect(floorOf(g.game).tick, `at ${g.ctx.now() - g.start} ms`).toBe((g.ctx.now() - g.start) / TICK);
    }
    expect(sent).toBeGreaterThan(DEVELOPMENT.fullSeconds * 99);
    expect(g.frames.length).toBe(floorOf(g.game).tick);
    g.advanceTo(endsAt);
    expect(g.game.viewFor(null).phase).toBe('production');
  });

  it("T-AC-9 (AM-3, flag on): in month 1 with Ossa away the clock stands full until Lena's first MULE is in, then starts from that tick", () => {
    const g = steered({ firstMonthWaits: true, ossaHome: true });
    g.game.connectionChanged(OSSA, false);
    expect(g.game.viewFor(null).clockWaitsFor).toEqual([LENA]);
    expect(g.game.viewFor(LENA).me!.devEndsAt).toBeNull();
    lenaInstalls(g);
    const installedAt = g.ctx.now();
    expect(g.state.tiles[tileIndex(g.state.width, g.home.x, g.home.y)]!.outfit).toBe('food');
    expect(g.game.viewFor(null).clockWaitsFor).toBeUndefined();
    expect(g.game.viewFor(LENA).me!.devEndsAt).toBe(installedAt + DEVELOPMENT.fullSeconds * 1_000);
    expect(installedAt - g.start, 'the wait outlasted nothing: the tick ran meanwhile').toBe(floorOf(g.game).tick * TICK);
  });
});

describe('T-AC-9 (AM-3): month 1 refuses a seat already in on the floor too', () => {
  it("while the clock waits for Ossa's first MULE, Lena, already in, presses BUY MULE at the corral: refused, her money and her lead unchanged, and the press counted refused", () => {
    const g = steered({ firstMonthWaits: true, ossaHome: true });
    lenaInstalls(g);
    expect(g.game.viewFor(null).clockWaitsFor, 'Ossa is present and not in').toEqual([OSSA]);
    const mouth: SteerPoint = { space: 'map', ...doorOutside(g.state, 'doorL', serverCfg()) };
    steerTo(g.game, g, LENA, [mouth], { within: 0.1 });
    pressAct(g.game, g, LENA);
    steerTo(g.game, g, LENA, toRoom('corral'));
    expect(reachOfSeat(g, LENA)).toMatchObject({ verb: 'BUY MULE', enabled: true });
    const stats = (g.game as unknown as { steering: { stats: { acts: number; refused: number } } }).steering.stats;
    const { acts, refused } = stats;
    const before = { money: meOf(g, LENA).money, mule: meOf(g, LENA).carriedMule, corral: g.state.store.mules };
    pressAct(g.game, g, LENA);
    expect({ money: meOf(g, LENA).money, mule: meOf(g, LENA).carriedMule, corral: g.state.store.mules }).toEqual(before);
    expect([stats.acts, stats.refused], 'counted as refused, for the phase log').toEqual([acts, refused + 1]);
    expect(g.game.viewFor(null).clockWaitsFor).toEqual([OSSA]);
  });
});

describe('the steered view (flag on)', () => {
  it("ColonistView: the floor's colonist with its v1 fields; assayUntil is development's start + assayUntilTick × tickMs, and bitten only while true", () => {
    const g = steered();
    steerTo(g.game, g, LENA, [g.homeMiddle]);
    expect(reachOfSeat(g, LENA)?.verb).toBe('ANALYSE');
    const devSeconds = meOf(g, LENA).devSeconds;
    pressAct(g.game, g, LENA);
    const c = floorOf(g.game).colonists[0]!;
    expect(c.assayUntilTick).not.toBeNull();
    expect(meOf(g, LENA).devSeconds, 'the floor holds the assay; the server takes no seconds off the clock').toBe(devSeconds);
    const view = g.game.viewFor(null).players[0]!.colonist!;
    expect(view).toMatchObject({ at: tileIndex(g.state.width, g.home.x, g.home.y), walk: null, assayUntil: g.start + c.assayUntilTick! * TICK, space: 'map', facing: c.facing, pace: c.pace, pelts: 0, encounter: null, lead: null });
    expect(view.x).toBe(Math.round(c.x * 100) / 100);
    expect('bitten' in view).toBe(false);
    const bitten = (game: MuleGame) => {
      const s = (game as unknown as { steering: { floor: DevFloor } }).steering;
      s.floor = { ...s.floor, colonists: s.floor.colonists.map((k, i) => (i === 1 ? { ...k, bitten: true } : k)) };
    };
    bitten(g.game);
    expect(g.game.viewFor(null).players[1]!.colonist!.bitten).toBe(true);
    g.advance((c.assayUntilTick! - floorOf(g.game).tick + 1) * TICK);
    expect(g.game.viewFor(null).players[0]!.colonist!.assayUntil).toBeNull();
  });

  it("MyView.reach is the seat's reachWords where its colonist stands, the pub's payout priced by the clock", () => {
    const g = steered();
    expect(reachOfSeat(g, LENA)).toEqual(reachWords(reachOf(floorOf(g.game), g.state, LENA, serverCfg())));
    expect(reachOfSeat(g, LENA)?.verb).toBe('ENTER STORE');
    pressAct(g.game, g, LENA);
    steerTo(g.game, g, LENA, toRoom('pub'));
    expect(reachOfSeat(g, LENA)).toMatchObject({ verb: 'PUB · END TURN', enabled: true });
    expect(reachOfSeat(g, LENA)?.detail).toMatch(/^\+\d+ cr$/);
    pressAct(g.game, g, LENA);
    expect(meOf(g, LENA).doneDeveloping).toBe(true);
    expect(g.game.viewFor(null).news[0]).toMatch(/Lena went to the pub and won \d+/);
  });

  it("MyView.reach is priced at the last tick's time, the time its words were compared at, even after a late timer's catch-up", () => {
    const g = steered();
    pressAct(g.game, g, LENA);
    steerTo(g.game, g, LENA, toRoom('pub'));
    const steering = (g.game as unknown as { steering: { words: Map<string, string> } }).steering;
    // A late timer: 40 ticks due at once, 10 run, so the last tick stands 30 ticks before the clock.
    g.jump(40 * TICK);
    const view = reachOfSeat(g, LENA)!;
    expect(stableJson(view), 'the view shows what the tick compared').toBe(steering.words.get(LENA));
    const nowLeft = (g.game.viewFor(LENA).me!.devEndsAt! - g.ctx.now()) / 1_000;
    const atNow = reachWords(reachOf(floorOf(g.game), g.state, LENA, serverCfg(), { secondsLeft: nowLeft }));
    expect(atNow.detail, 'the row means something: priced at the clock, the payout would differ').not.toBe(view.detail);
  });

  it('with the flag on, the old taps are refused, and steer or act outside development changes nothing', () => {
    const g = steered();
    expect(() => g.game.handle(LENA, { type: 'buyMule' })).toThrow(/steer/i);
    g.advanceTo(g.game.viewFor(LENA).me!.devEndsAt!);
    expect(g.game.viewFor(null).phase).toBe('production');
    const view = g.game.viewFor(LENA);
    g.game.handle(LENA, { type: 'steer', x: 1, y: 0 });
    g.game.handle(LENA, { type: 'act' });
    expect(g.game.viewFor(LENA)).toEqual(view);
  });
});
