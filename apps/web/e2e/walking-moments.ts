/**
 * The arcade's three moments in a whole AI game on the real server: wolves, the glint race and the corral scramble.
 * Each happens at least once, what it pays or costs lands in the game's state, and the TV is sent a wolf encounter
 * and a glint race with an AI colonist in each. Local only: a 12-month game takes minutes. Run with
 * `pnpm --filter @mule/web exec tsx e2e/walking-moments.ts`.
 */
import { GLINT, WOLVES, type GameState } from '@mule/engine';
import type { DevFrame, MuleView } from '@mule/protocol';
import { check } from './harness';
import { keepsPlaying, steeredTable, until } from './walking-wire';

const SEED = 1;
const MONTHS = 12;
/** Development's 50 s of game time in about 12 s of real time. */
const PHASE_SCALE = 0.25;
/** Lobby to game over at PHASE_SCALE, with room for the auctions and the server's month ends. */
const GAME_MS = 8 * 60_000;
/** How often the server's state is read while a development runs: a few ticks. */
const SAMPLE_MS = 25;
/** One development at PHASE_SCALE, month 1's wait for the first MULEs included, with room for the server's end-of-phase work. */
const DEVELOPMENT_MS = 60_000;
/** An AI colonist this close to a lit glint's tile, in tiles, took part in the race. */
const RACED_TILES = 1;

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

/** What the server's state showed happening, gathered sample by sample. */
const seen = {
  wolvesMetBy: new Set<string>(),
  peltsSoldBy: new Set<string>(),
  bolted: new Set<string>(),
  boltCaught: new Set<string>(),
  boltLostToClock: new Set<string>(),
  glintWonBy: new Set<string>(),
  scrambleLeftOut: new Set<string>(),
  /** For a failure's message: pelts won in fights, scrambles called, and the fewest MULEs the store held in a development. */
  peltsWonBy: new Set<string>(),
  scramblesCalled: 0,
  fewestMules: Number.POSITIVE_INFINITY,
};

const started = Date.now();
const table = await steeredTable({ seed: SEED, ais: 3, phaseScale: PHASE_SCALE, maxMonths: MONTHS });
const stopHost = keepsPlaying(table.host);
const running = () => {
  const room = table.server.registry.get(table.code) as unknown as { game: Running } | undefined;
  check(room, `room ${table.code} is on the server`);
  return room.game;
};
const board = (): MuleView | null => table.board.view();

try {
  let before: GameState | null = null;
  let floorBefore: Floor | null = null;
  let wasDeveloping = false;
  let developingSince = 0;
  check(
    await until(() => {
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
        }
        for (const id of floor.moments.scramble?.leftOut ?? []) seen.scrambleLeftOut.add(id);
      }
      if (wasDeveloping && !developing && before) {
        for (const p of before.players) if (p.muleBolted) seen.boltLostToClock.add(p.id);
      }
      before = now;
      floorBefore = floor;
      wasDeveloping = developing;
      return board()?.finished === true;
    }, GAME_MS),
    `the ${MONTHS}-month game did not finish in ${GAME_MS / 60_000} min (month ${board()?.month}, ${board()?.phase})`,
  );

  const ais = board()!.players.filter((p) => p.isAi);
  const names = (ids: Set<string>) => [...ids].map((id) => board()!.players.find((p) => p.id === id)?.name ?? id).join(', ') || 'nobody';

  // Each moment happened, and what it pays or costs is in the state.
  soft(seen.wolvesMetBy.size > 0, 'wolves: no colonist met a pack in the game');
  soft(seen.peltsSoldBy.size > 0, `wolves: no pelts were sold at the store (packs met by ${names(seen.wolvesMetBy)}; pelts won by ${names(seen.peltsWonBy)})`);
  soft(seen.boltCaught.size + seen.boltLostToClock.size > 0, `wolves: no bolted MULE was caught or lost to the clock (bolted: ${names(seen.bolted)})`);
  soft(seen.glintWonBy.size > 0, 'glint: nobody gained the glint\'s Crystite in a development');
  seen.scramblesCalled = table.board.frames.filter((f) => f.frame.beats.some((b) => b.includes('Race to the corral'))).length;
  soft(seen.scrambleLeftOut.size > 0, `scramble: no colonist was left without a MULE by a scramble (${seen.scramblesCalled} called; the store held ${seen.fewestMules} MULEs at its fewest)`);

  // The TV: a wolf encounter and a glint race, each with an AI colonist in it.
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
