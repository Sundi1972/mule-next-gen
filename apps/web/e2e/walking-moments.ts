/**
 * The arcade's three moments in AI games on the real server: wolves, the glint race and the corral scramble. Each
 * happens at least once, what it pays or costs lands in the game's state, and the TV is sent a wolf encounter and a
 * glint race with an AI colonist in each. Local only: a 12-month game takes minutes. Run with
 * `pnpm --filter @mule/web exec tsx e2e/walking-moments.ts`.
 *
 * Wolves and the glint are proved in a whole natural game. The scramble is proved in a second game whose corral
 * starts short (START.storeMules), because a natural game almost never runs the corral down: upkeep refills it to
 * its target every month, and the AI buys about one MULE a seat every other turn.
 */
import { GLINT, START, WOLVES, type GameState } from '@mule/engine';
import type { DevFrame, MuleView } from '@mule/protocol';
import { check } from './harness';
import { keepsPlaying, steeredTable, until, type SteeredTable } from './walking-wire';

/** A map where, in 12 months, packs are met, pelts sold, a bolted MULE caught or lost, and glints won. */
const SEED = 7;
const MONTHS = 12;
/** Development's 50 s of game time in about 12 s of real time. */
const PHASE_SCALE = 0.25;
/** Lobby to game over at PHASE_SCALE, with room for the auctions and the server's month ends. */
const GAME_MS = 8 * 60_000;
/** One development at PHASE_SCALE, month 1's wait for the first MULEs included, with room for the server's end-of-phase work. */
const DEVELOPMENT_MS = 60_000;
/** An AI colonist this close to a lit glint's tile, in tiles, took part in the race. */
const RACED_TILES = 1;
/** The staged corral: one MULE over the scramble's call, for four seats that each need one (three AIs and the host). */
const STAGED_MULES = 3;

/**
 * The game's state and the floor's moments, read from the room the server holds. The test reaches into the running
 * game, as the server's own record does, because a bolted MULE and the scramble's left-out seats reach no screen.
 */
type Floor = {
  colonists: readonly { id: string; pelts: number; encounter: unknown }[];
  moments: { scramble: { leftOut: readonly string[] } | null };
};
type Running = { state: GameState | null; steering: { floor: Floor } | null };

const errors: string[] = [];
const soft = (cond: unknown, message: string) => {
  if (!cond) errors.push(message);
};

/** What the server's state showed happening in one game, gathered sample by sample. */
function noneSeen() {
  return {
    wolvesMetBy: new Set<string>(),
    peltsSoldBy: new Set<string>(),
    bolted: new Set<string>(),
    boltCaught: new Set<string>(),
    boltLost: new Set<string>(),
    glintWonBy: new Set<string>(),
    /** Left out by a scramble, with no MULE carried when development ended. */
    scrambleLeftOut: new Set<string>(),
    /** For a failure's message: pelts won in fights, and the fewest MULEs the store held in a development. */
    peltsWonBy: new Set<string>(),
    fewestMules: Number.POSITIVE_INFINITY,
  };
}
type Seen = ReturnType<typeof noneSeen>;

/** Reads the server's state every few ms while `table` plays, until `done` holds; what happened is in the result. */
async function watch(table: SteeredTable, done: (state: GameState) => boolean, timeoutMs: number, what: string): Promise<Seen> {
  const seen = noneSeen();
  const running = () => {
    const room = table.server.registry.get(table.code) as unknown as { game: Running } | undefined;
    check(room, `room ${table.code} is on the server`);
    return room.game;
  };
  let before: GameState | null = null;
  let floorBefore: Floor | null = null;
  let wasDeveloping = false;
  let developingSince = 0;
  let leftOut: readonly string[] = [];
  const finished = await until(() => {
    const { state, steering } = running();
    if (!state) return false;
    const developing = state.phase === 'development';
    if (developing && !wasDeveloping) developingSince = Date.now();
    check(!developing || Date.now() - developingSince < DEVELOPMENT_MS, `month ${state.month}'s development ran past ${DEVELOPMENT_MS / 1000} s: its AI colonists never finished it`);
    const now = structuredClone(state);
    const floor = steering ? structuredClone(steering.floor) : null;
    if (developing && wasDeveloping && before && floor && floorBefore) {
      seen.fewestMules = Math.min(seen.fewestMules, now.store.mules);
      for (const p of now.players) {
        const was = before.players.find((q) => q.id === p.id)!;
        const c = floor.colonists.find((q) => q.id === p.id);
        const cWas = floorBefore.colonists.find((q) => q.id === p.id);
        if (c?.encounter) seen.wolvesMetBy.add(p.id);
        if (c && cWas && c.pelts > cWas.pelts) seen.peltsWonBy.add(p.id);
        // Pelts gone from a colonist as its money rises by their price: sold at the store.
        if (c && cWas && cWas.pelts > 0 && c.pelts === 0 && p.money - was.money === cWas.pelts * WOLVES.peltPrice) seen.peltsSoldBy.add(p.id);
        // Development produces nothing, so Crystite gained in it is the glint's prize.
        if (p.stock.crystite - was.stock.crystite === GLINT.crystite) seen.glintWonBy.add(p.id);
        if (p.muleBolted) seen.bolted.add(p.id);
        if (was.muleBolted && !p.muleBolted && p.carriedMule !== null) seen.boltCaught.add(p.id);
        // Ending the turn at the pub with it still loose, the MULE runs off: lost, as to the clock.
        if (was.muleBolted && !p.muleBolted && p.carriedMule === null) seen.boltLost.add(p.id);
      }
      leftOut = floor.moments.scramble?.leftOut ?? leftOut;
    }
    if (wasDeveloping && !developing && before) {
      // Still loose when the clock ends development: lost to the clock.
      for (const p of before.players) if (p.muleBolted) seen.boltLost.add(p.id);
      // Left out by the scramble, and still without a MULE as the turn ended.
      for (const id of leftOut) if (before.players.find((p) => p.id === id)?.carriedMule === null) seen.scrambleLeftOut.add(id);
      leftOut = [];
    }
    before = now;
    floorBefore = floor;
    wasDeveloping = developing;
    return done(state);
  }, timeoutMs);
  const view = table.board.view();
  check(finished, `${what} did not finish in ${timeoutMs / 60_000} min (month ${view?.month}, ${view?.phase})`);
  return seen;
}

const names = (view: MuleView, ids: Set<string>) => [...ids].map((id) => view.players.find((p) => p.id === id)?.name ?? id).join(', ') || 'nobody';

const started = Date.now();

// The whole natural game: wolves and the glint, in the state and on the TV.
{
  const table = await steeredTable({ seed: SEED, ais: 3, phaseScale: PHASE_SCALE, maxMonths: MONTHS });
  const stopHost = keepsPlaying(table.host);
  try {
    const seen = await watch(table, () => table.board.view()?.finished === true, GAME_MS, `the ${MONTHS}-month game`);
    const view = table.board.view()!;
    const ais = view.players.filter((p) => p.isAi);

    soft(seen.wolvesMetBy.size > 0, 'wolves: no colonist met a pack in the game');
    soft(seen.peltsSoldBy.size > 0, `wolves: no pelts were sold at the store (packs met by ${names(view, seen.wolvesMetBy)}; pelts won by ${names(view, seen.peltsWonBy)})`);
    soft(seen.boltCaught.size + seen.boltLost.size > 0, `wolves: no bolted MULE was caught or lost (bolted: ${names(view, seen.bolted)})`);
    soft(seen.glintWonBy.size > 0, 'glint: nobody gained the glint\'s Crystite in a development');

    const frames = table.board.frames.map((f) => f.frame);
    const aiNames = ais.map((p) => p.name);
    soft(
      frames.some((f) => f.beats.some((b) => aiNames.some((n) => b.startsWith(`Wolves! ${n}:`)))),
      `TV: the board was sent no wolf encounter with an AI colonist (${frames.reduce((n, f) => n + f.beats.length, 0)} moment lines in ${frames.length} frames)`,
    );
    soft(aiRacedAGlint(frames, ais.map((p) => p.id), aiNames), 'TV: the board was sent no glint race with an AI colonist in it');
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    stopHost();
    await table.close();
  }
}

// The scramble, on a corral staged short: month 1's development, in the state and on the TV.
{
  const storeMules = START.storeMules;
  START.storeMules = STAGED_MULES;
  const table = await steeredTable({ seed: SEED, ais: 3, phaseScale: PHASE_SCALE, maxMonths: MONTHS });
  // The host claims the plot beside the store, so it is a fourth seat that needs a MULE.
  check(await until(() => (table.board.view()?.tiles.length ?? 0) > 0, 10_000), 'the board was sent no map');
  const store = table.board.view()!.tiles.find((t) => t.terrain === 'store')!;
  const plot = { x: store.x - 1, y: store.y };
  const stopHost = keepsPlaying(table.host, plot);
  // Month 1's clock waits for every seat's first MULE, and the host will have none: its Continue starts the clock.
  const startsClock = setInterval(() => {
    if (table.host.view()?.phase === 'development' && table.host.view()?.phaseEndsAt == null) table.host.intent({ type: 'continue' });
  }, 500);
  try {
    const seen = await watch(table, (state) => state.month > 1 || state.phase === 'auction', GAME_MS, 'month 1 on the staged corral');
    soft(table.board.view()!.tiles.find((t) => t.x === plot.x && t.y === plot.y)?.owner === table.host.seatId, `scramble: the host did not get the plot beside the store (${plot.x}, ${plot.y}), so only three seats needed a MULE`);
    const view = table.board.view()!;
    const beats = table.board.frames.flatMap((f) => f.frame.beats);
    soft(beats.some((b) => b.endsWith('left! Race to the corral')), `scramble: the TV was sent no call to the corral (the store held ${seen.fewestMules} MULEs at its fewest)`);
    soft(seen.scrambleLeftOut.size > 0, `scramble: no colonist was left without a MULE by it (the store held ${seen.fewestMules} MULEs at its fewest)`);
    soft(beats.some((b) => b.startsWith('No MULE this turn for ')), `scramble: the TV was not told who was left out (${names(view, seen.scrambleLeftOut)} were)`);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    clearInterval(startsClock);
    stopHost();
    await table.close();
    START.storeMules = storeMules;
  }
}

/** A glint lit in the frames, and while it was lit an AI colonist won it or came within RACED_TILES of its tile. */
function aiRacedAGlint(frames: DevFrame[], aiIds: string[], aiNames: string[]): boolean {
  let lit: { x: number; y: number } | null = null;
  for (const f of frames) {
    for (const b of f.beats) {
      const at = /A Crystite glint at (\d+)·(\d+)/.exec(b);
      if (at) lit = { x: Number(at[1]) - 1 + 0.5, y: Number(at[2]) - 1 + 0.5 };
      if (aiNames.some((n) => b.startsWith(`${n} got the glint`))) return true;
      if (b.startsWith('The glint faded') || b.includes('got the glint')) lit = null;
    }
    if (lit && f.colonists.some((c) => aiIds.includes(c.id) && c.space === 'map' && Math.hypot(c.x - lit!.x, c.y - lit!.y) <= RACED_TILES)) return true;
  }
  return false;
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (errors.length) {
  console.error(`walking-moments: ${errors.length} failed (${seconds} s)\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`walking-moments: ok (${seconds} s)`);
