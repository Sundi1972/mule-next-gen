/**
 * A person steering the arcade's development against the real server, over the real WebSocket: one host seat steered
 * by stick and button only, three AI seats, and a board. Run with `pnpm --filter @mule/web exec tsx e2e/walking-steer.ts`.
 *
 * W-6 (T-AC-9, HC-3): a seat sending 100 steers a second never slows the frames anyone receives.
 * W-1 (UBER-AC-2, the person half): held on the stick, the colonist crosses plains at the config's full speed and
 *   mountains at its share of it, times its pace.
 * W-3 (B-AC-1, the server half): store, corral, an outfitter, out with the MULE on its lead, the own plot, the pub,
 *   by stick and button alone; each press changes the game as its rule says, and a press with nothing in reach
 *   changes nothing.
 * W-5 (B-AC-8): a seat that drops stops where it is; back with its token, it steers again; the turn still ends on
 *   the clock.
 * W-4 (B-AC-2, T-AC-4, the wire half): every connection is sent the same frame for every tick, in order, one a tick.
 * In all of them no colonist stands on land that blocks it, and development ends by its clock at the latest.
 */
import { boxOf, DEV_STEER, HALL, type HallPlace, type Terrain } from '@mule/engine';
import type { DevFrame, MuleView } from '@mule/protocol';
import { check } from './harness';
import { connect, keepsPlaying, me, press, reachOf, steerHall, steerTo, steeredTable, until, type Wire } from './walking-wire';

/** A map where the store's left door opens onto a river plot and then plains, and its right door onto mountains. */
const SEED = 24;
/** Development at a quarter of its game time: 50 s of clock in 12.5 s. */
const PHASE_SCALE = 0.25;
const TO_DEVELOPMENT_MS = 60_000;
const DEVELOPMENT_MS = 60_000;
/** A real development tick at PHASE_SCALE. */
const TICK_MS = DEV_STEER.tickMs * PHASE_SCALE;
/** How near a point the thumb stops: well inside a door's reach and a room's box. */
const NEAR_TILES = 0.15;
const NEAR_HALL = 0.3;
/** The hall's corridor runs between the top rooms and the bottom ones. */
const CORRIDOR_Y = HALL.h / 2;
/**
 * How far W-1 walks each land, in tiles: what this map has of it in a row from where the hold starts, with room to
 * spare. The hold lasts that distance at the config's speed, so a faster walk never carries the colonist off the land
 * it measures.
 */
const PLAINS_TILES = 1.2;
const MOUNTAIN_TILES = 1.4;
/** Measured speed against the config's: frames land on ticks, and the first and last tick of a hold carry no step. */
const SPEED_TOLERANCE = 0.15;
/** W-6's flood: steers a second, for this long. */
const FLOOD_PER_S = 100;
const FLOOD_MS = 2_000;
/** The share of the quiet frame rate a flooded one must keep. */
const FLOOD_KEEPS = 0.9;
/** The server counts a screen's messages a second at a time. */
const RATE_WINDOW_MS = 1_100;
/** Ticks a dropped colonist may still show moving: the one in flight when the socket closed. */
const DROP_TICKS = 2;
const END_SLACK_MS = 500;
/** On the own plot, out of the door's reach: ENTER wins the button within doorHalfTiles of the door. */
const ON_PLOT_X = 0.3;
/** Far enough into the plains beyond the plot that the hold starts on them. */
const INTO_PLAINS_X = 0.3;

/** Each land's share of full speed; the store is not walked. */
const SHARE = DEV_STEER.terrain as Partial<Record<Terrain, number>>;
const BLOCKED = (Object.entries(SHARE) as [Terrain, number][]).filter(([, s]) => s === 0).map(([t]) => t);
const errors: string[] = [];
const soft = (cond: unknown, message: string) => {
  if (!cond) errors.push(message);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Where to stand for a place: a door's spot inside the hall (past it, a step walks out); a room's middle. */
const middle = (place: HallPlace) => {
  if (place === 'doorL' || place === 'doorR') return HALL.spots[place];
  const b = boxOf(place);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
};
/** Along the corridor to below or above `place`, then into it. */
const hallRoute = (from: { x: number }, place: HallPlace) => {
  const to = middle(place);
  return [{ x: from.x, y: CORRIDOR_Y }, { x: to.x, y: CORRIDOR_Y }, to];
};

function terrainAt(view: MuleView, x: number, y: number): Terrain | null {
  return view.tiles.find((t) => t.x === Math.floor(x) && t.y === Math.floor(y))?.terrain ?? null;
}

const started = Date.now();
// Ossa stays at the table doing nothing: with no human left playing, development would end at once (HC-3), and W-5
// drops Brix.
const table = await steeredTable({ seed: SEED, ais: 2, phaseScale: PHASE_SCALE, maxMonths: 1, guests: ['Ossa'] });
const ossa = table.guests[0]!;
const stopOssa = keepsPlaying(ossa);
const { board } = table;
let host: Wire = table.host;
const store = await (async () => {
  check(await until(() => board.view() !== null, TO_DEVELOPMENT_MS), 'the board was sent no view');
  return board.view()!.tiles.find((t) => t.terrain === 'store')!;
})();
const plot = { x: store.x - 1, y: store.y };
let stopHost = keepsPlaying(host, plot);

try {
  check(await until(() => host.view()?.phase === 'development', TO_DEVELOPMENT_MS), 'the table never reached development');
  check(await until(() => me(host) !== null, TO_DEVELOPMENT_MS), 'the host was sent no frame with its colonist: development is not steered');
  const view = board.view()!;
  const id = host.seatId!;
  const mine = () => host.view()!.players.find((p) => p.id === id)!;
  const myPlot = () => host.view()!.tiles.find((t) => t.x === plot.x && t.y === plot.y)!;
  check(myPlot().owner === id, `the host does not own the plot left of the store (${plot.x}, ${plot.y}) it claimed`);
  const pace = mine().colonist?.pace ?? 1;

  // W-6: 100 steers a second for 2 s; the board's frames keep their rate.
  const rate = async (during: () => Promise<void>) => {
    const from = board.frames.length;
    const t0 = Date.now();
    await during();
    return (board.frames.length - from) / ((Date.now() - t0) / 1000);
  };
  const quiet = await rate(() => sleep(FLOOD_MS));
  const flooded = await rate(async () => {
    const until = Date.now() + FLOOD_MS;
    // Standing-still steers: a load on the server that leaves the colonist where it is, by the store's door.
    while (Date.now() < until) {
      host.intent({ type: 'steer', x: 0, y: 0 });
      await sleep(1000 / FLOOD_PER_S);
    }
  });
  // The server dropped the flood past its per-screen rate; once its window has passed, the stick is let go.
  await sleep(RATE_WINDOW_MS);
  host.intent({ type: 'steer', x: 0, y: 0 });
  soft(flooded >= quiet * FLOOD_KEEPS, `W-6: flooded with steers the board got ${flooded.toFixed(1)} frames/s, against ${quiet.toFixed(1)} quiet`);

  // W-1: held left over plains for 2 s of game time, then right over mountains past the other door.
  /** Holds the stick for `seconds` of game time, read from the frames' own clock; tiles a second while it moved. */
  const hold = async (dx: number, seconds: number) => {
    const at = (f: DevFrame) => ({ at: f.at, c: f.colonists.find((c) => c.id === id)! });
    const from = host.frames.length;
    host.intent({ type: 'steer', x: dx, y: 0 });
    const t0 = host.frames.at(-1)!.frame.at;
    await until(() => host.frames.at(-1)!.frame.at >= t0 + seconds * 1000, 10_000);
    host.intent({ type: 'steer', x: 0, y: 0 });
    const walked = host.frames.slice(from).map((f) => at(f.frame)).filter((f) => f.c.moving);
    const first = walked[0]!;
    const last = walked.at(-1)!;
    return { from: first.c, to: last.c, tilesPerSecond: Math.abs(last.c.x - first.c.x) / ((last.at - first.at) / 1000) };
  };
  const expectSpeed = (terrain: Terrain) => DEV_STEER.mapTilesPerSecond * (SHARE[terrain] ?? 0) * pace;
  check(await steerTo(host, 'map', plot.x + ON_PLOT_X, plot.y + 0.5, NEAR_TILES), 'W-1: the host never reached its own plot');
  check(await steerTo(host, 'map', plot.x - INTO_PLAINS_X, plot.y + 0.5, NEAR_TILES), 'W-1: the host never reached the plains');
  const plains = await hold(-1, PLAINS_TILES / expectSpeed('plains'));
  const plainsLand = terrainAt(view, plains.to.x, plains.to.y);
  soft(plainsLand === 'plains' && terrainAt(view, plains.from.x, plains.from.y) === 'plains', `W-1: the plains hold ran from ${terrainAt(view, plains.from.x, plains.from.y)} to ${plainsLand}`);
  soft(Math.abs(plains.tilesPerSecond - expectSpeed('plains')) <= expectSpeed('plains') * SPEED_TOLERANCE, `W-1: held on plains it walked ${plains.tilesPerSecond.toFixed(2)} tiles/s, not ${expectSpeed('plains').toFixed(2)}`);

  // W-3 starts here, and W-1's mountains are past the hall's other door.
  const money0 = mine().money;
  check(await steerTo(host, 'map', store.x - DEV_STEER.bodyTiles, store.y + 0.5, NEAR_TILES), 'W-3: never back at the store door');
  check(reachOf(host)?.enabled, 'W-3: no ENTER at the store door');
  check(await press(host), 'W-3: ENTER changed nothing');
  check(await until(() => me(host)?.space === 'hall', 2_000), 'W-3: ENTER did not take the colonist into the hall');

  // A press in the corridor with nothing in reach changes nothing.
  check(await steerHall(host, [{ x: me(host)!.x, y: CORRIDOR_Y }, { x: middle('greenBelt').x, y: CORRIDOR_Y }], NEAR_HALL), 'W-3: never reached the corridor');
  const dim = reachOf(host);
  const before = JSON.stringify({ money: mine().money, plot: myPlot(), lead: me(host)?.lead ?? null });
  host.intent({ type: 'act' });
  await sleep(20 * TICK_MS);
  soft(dim && !dim.enabled, `W-3: the button is lit in the corridor (${dim?.verb})`);
  soft(JSON.stringify({ money: mine().money, plot: myPlot(), lead: me(host)?.lead ?? null }) === before, 'W-3: a press with nothing in reach changed the money, the plot or the lead');

  // W-1's mountains: out of the right door, held right.
  check(await steerHall(host, hallRoute(me(host)!, 'doorR'), NEAR_HALL), 'W-1: never reached the right door');
  check(await press(host), 'W-1: LEAVE by the right door changed nothing');
  check(await until(() => me(host)?.space === 'map', 2_000), 'W-1: LEAVE did not take the colonist onto the map');
  const mountains = await hold(1, MOUNTAIN_TILES / expectSpeed('mountains'));
  soft(terrainAt(view, mountains.to.x, mountains.to.y) === 'mountains', `W-1: the mountains hold ended on ${terrainAt(view, mountains.to.x, mountains.to.y)}`);
  soft(Math.abs(mountains.tilesPerSecond - expectSpeed('mountains')) <= expectSpeed('mountains') * SPEED_TOLERANCE, `W-1: held on mountains it walked ${mountains.tilesPerSecond.toFixed(2)} tiles/s, not ${expectSpeed('mountains').toFixed(2)}`);

  // W-3: back in, buy at the corral, outfit for Food, out of the left door with the MULE on its lead.
  check(await steerTo(host, 'map', store.x + 1 + DEV_STEER.bodyTiles, store.y + 0.5, NEAR_TILES), 'W-3: never back at the right door');
  check(await press(host) && (await until(() => me(host)?.space === 'hall', 2_000)), 'W-3: ENTER by the right door did not work');
  check(await steerHall(host, hallRoute(me(host)!, 'corral'), NEAR_HALL), 'W-3: never reached the corral');
  check(reachOf(host)?.enabled, `W-3: the corral's button is dim (${reachOf(host)?.verb})`);
  check(await press(host), 'W-3: BUY changed nothing');
  soft(mine().money < money0, 'W-3: buying a MULE cost nothing');
  check(await until(() => me(host)?.lead != null, 2_000), 'W-3: the bought MULE is not on its lead');
  check(await steerHall(host, hallRoute(me(host)!, 'food'), NEAR_HALL), 'W-3: never reached the Food outfitter');
  check(await press(host), 'W-3: OUTFIT changed nothing');
  check(await until(() => me(host)?.lead?.good === 'food', 2_000), 'W-3: the MULE on the lead is not outfitted for Food');
  check(await steerHall(host, hallRoute(me(host)!, 'doorL'), NEAR_HALL), 'W-3: never reached the left door');
  check(await press(host) && (await until(() => me(host)?.space === 'map', 2_000)), 'W-3: LEAVE by the left door did not work');
  soft(me(host)?.lead?.good === 'food', 'W-3: the MULE did not come out on its lead');

  // W-3: installed on the own plot by the button.
  check(await steerTo(host, 'map', plot.x + ON_PLOT_X, plot.y + 0.5, NEAR_TILES), 'W-3: never reached the own plot');
  check(await press(host), 'W-3: INSTALL changed nothing');
  soft(await until(() => myPlot().outfit === 'food', 2_000), `W-3: the own plot's outfit is ${myPlot().outfit}, not food`);
  soft(await until(() => me(host)?.lead === null, 1_000), 'W-3: the MULE is still on its lead after INSTALL');

  // W-5: the clock runs; the host drops, its colonist stops; back with its token, it steers again.
  host.intent({ type: 'continue' });
  check(await until(() => board.view()?.phaseEndsAt != null, 2_000), 'W-5: the host\'s Continue did not start the clock');
  const endsAt = board.view()!.phaseEndsAt!;
  host.intent({ type: 'steer', x: 0, y: 1 });
  await sleep(10 * TICK_MS);
  stopHost();
  const token = host.seatToken!;
  host.close();
  const dropTick = board.frames.at(-1)!.frame.tick;
  await sleep(10 * TICK_MS);
  const after = board.frames.filter((f) => f.frame.tick > dropTick + DROP_TICKS).map((f) => f.frame.colonists.find((c) => c.id === id)!);
  soft(after.length > 0 && after.every((c) => !c.moving && c.x === after[0]!.x && c.y === after[0]!.y), 'W-5: the dropped seat\'s colonist kept moving');
  host = await connect(table.base);
  host.send({ t: 'join', code: table.code, name: 'Brix', seatToken: token });
  check(await until(() => host.seatId === id && me(host) !== null, 5_000), 'W-5: the host did not get its seat back');
  const back = me(host)!;
  soft(await steerTo(host, 'map', back.x, back.y - 0.3, 0.1), 'W-5: back with its token, the host could not steer');

  // W-3 ends at the pub, by the left door.
  check(await steerTo(host, 'map', store.x - DEV_STEER.bodyTiles, store.y + 0.5, NEAR_TILES), 'W-3: never back at the store door');
  check(await press(host) && (await until(() => me(host)?.space === 'hall', 2_000)), 'W-3: ENTER for the pub did not work');
  check(await steerHall(host, hallRoute(me(host)!, 'pub'), NEAR_HALL), 'W-3: never reached the pub');
  const beforePub = mine().money;
  check(await press(host), 'W-3: PUB changed nothing');
  soft(await until(() => mine().doneDeveloping, 2_000), 'W-3: the host is not done developing after the pub');
  soft(mine().money > beforePub, 'W-3: the pub paid nothing');

  // W-5: the turn still ends on the clock (the AI seats stand still until PR-4 steers them).
  check(await until(() => board.view()?.phase !== 'development', DEVELOPMENT_MS), 'development never ended');
  soft(Date.now() <= endsAt + END_SLACK_MS, `W-5: development ran ${Date.now() - endsAt} ms past its clock`);

  // W-4: the host and the board were sent the same frame for every tick both saw, one a tick, in order.
  const byTick = (w: Wire) => new Map(w.frames.map((f) => [f.frame.tick, JSON.stringify(f.frame)]));
  const boardTicks = byTick(board);
  const hostFrames = table.host.frames;
  const shared = hostFrames.filter((f) => boardTicks.has(f.frame.tick));
  soft(shared.length > 0 && shared.every((f) => boardTicks.get(f.frame.tick) === JSON.stringify(f.frame)), 'W-4: the host and the board were sent different frames for one tick');
  const ticks = board.frames.map((f) => f.frame.tick);
  soft(ticks.every((t, i) => i === 0 || t > ticks[i - 1]!), 'W-4: the board was sent frames out of order or twice');
  soft(new Set(ticks).size === ticks.length, 'W-4: a tick came twice');
  const missing = ticks.at(-1)! - ticks[0]! + 1 - ticks.length;
  soft(missing <= ticks.length * 0.01, `W-4: the board missed ${missing} of ${ticks.length} ticks with nothing slowing it`);
  for (const f of board.frames.map((x) => x.frame) as DevFrame[]) {
    soft(f.colonists.length === view.players.length, `W-4: frame ${f.tick} carries ${f.colonists.length} colonists, not ${view.players.length}`);
    const blocked = f.colonists.find((c) => c.space === 'map' && BLOCKED.includes(terrainAt(view, c.x, c.y)!));
    if (blocked) soft(false, `colonist ${blocked.id} stands on blocked land at tick ${f.tick}`);
  }
} catch (err) {
  errors.push(err instanceof Error ? err.message : String(err));
} finally {
  stopHost();
  stopOssa();
  host.close();
  await table.close();
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (errors.length) {
  console.error(`walking-steer: ${errors.length} failed (${seconds} s)\n  ${[...new Set(errors)].join('\n  ')}`);
  process.exit(1);
}
console.log(`walking-steer: ok (${seconds} s)`);
