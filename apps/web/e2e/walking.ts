/**
 * The arcade's walking against the real server, over the real WebSocket, before any screen draws it: what every
 * phone and the TV are sent while colonists are steered. Run with `pnpm --filter @mule/web exec tsx e2e/walking.ts`.
 *
 * W-2 (UBER-AC-2, the AI half): an AI colonist walks mountains at the config's share of its plains speed.
 * W-7 (T-AC-5 on the live server): every AI colonist walks the floor to the pub before development's clock.
 * In both, no colonist ever stands on land that blocks it, and development ends by its clock at the latest.
 */
import { DEV_STEER, type Terrain } from '@mule/engine';
import type { DevFrame, MuleView } from '@mule/protocol';
import { check } from './harness';
import { hostKeepsPlaying, steeredTable, until, type Wire } from './walking-wire';

const SEED = 20261104;
/** Development's 50 s of game time in about 12 s of real time. */
const PHASE_SCALE = 0.25;
/** Long enough to reach the first development from the lobby: planning, the grant and its short passes. */
const TO_DEVELOPMENT_MS = 60_000;
/** One development at PHASE_SCALE, with room for the server's end-of-phase work. */
const DEVELOPMENT_MS = 30_000;
/** A frame's lateness the TV tolerates when the phase ends: a few ticks. */
const END_SLACK_MS = 500;
/** Samples a colonist needs on a land before its speed there counts. */
const MIN_SAMPLES = 5;
/** How far the measured share may sit from the config's: frames land on ticks, so a sample's distance is quantised. */
const SHARE_TOLERANCE = 0.15;

const BLOCKED = (Object.entries(DEV_STEER.terrain) as [Terrain, number][]).filter(([, share]) => share === 0).map(([t]) => t);

const errors: string[] = [];
const soft = (cond: unknown, message: string) => {
  if (!cond) errors.push(message);
};

/** The land under a map position, read from the board's tiles; positions are in tiles, so the plot is the whole part. */
function terrainAt(view: MuleView, x: number, y: number): Terrain | null {
  const tile = view.tiles.find((t) => t.x === Math.floor(x) && t.y === Math.floor(y));
  return tile?.terrain ?? null;
}

type Sample = { id: string; terrain: Terrain; tilesPerSecond: number; leading: boolean };

/** Speeds between consecutive frames of one colonist, where it walked on one plot, out on the map. */
function speeds(frames: DevFrame[], view: MuleView): Sample[] {
  const samples: Sample[] = [];
  const last = new Map<string, { at: number; c: DevFrame['colonists'][number] }>();
  for (const frame of frames) {
    for (const c of frame.colonists) {
      const before = last.get(c.id);
      last.set(c.id, { at: frame.at, c });
      if (!before || before.c.space !== 'map' || c.space !== 'map' || !before.c.moving || !c.moving) continue;
      if ((before.c.lead === null) !== (c.lead === null)) continue;
      const dt = (frame.at - before.at) / 1000;
      const terrain = terrainAt(view, c.x, c.y);
      if (dt <= 0 || terrain === null || terrain !== terrainAt(view, before.c.x, before.c.y)) continue;
      samples.push({ id: c.id, terrain, tilesPerSecond: Math.hypot(c.x - before.c.x, c.y - before.c.y) / dt, leading: c.lead !== null });
    }
  }
  return samples;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** Every frame's colonists stand off blocked land when out on the map. */
function checkNeverOnBlockedLand(frames: DevFrame[], view: MuleView, who: string): void {
  for (const { tick, colonists } of frames) {
    for (const c of colonists) {
      const terrain = c.space === 'map' ? terrainAt(view, c.x, c.y) : null;
      if (terrain && BLOCKED.includes(terrain)) {
        soft(false, `${who}: colonist ${c.id} stands on ${terrain} at tick ${tick} (${c.x.toFixed(2)}, ${c.y.toFixed(2)})`);
        return;
      }
    }
  }
}

/** One AI-only development, watched from the board until it ends. */
async function watchADevelopment(board: Wire): Promise<{ frames: DevFrame[]; view: MuleView; endsAt: number; endedAt: number }> {
  check(await until(() => board.view()?.phase === 'development', TO_DEVELOPMENT_MS), 'the table never reached development');
  const start = board.view()!;
  const endsAt = start.phaseEndsAt ?? Number.POSITIVE_INFINITY;
  const firstFrame = board.frames.length;
  check(await until(() => board.view()?.phase !== 'development', DEVELOPMENT_MS), 'development never ended');
  return { frames: board.frames.slice(firstFrame).map((f) => f.frame), view: start, endsAt, endedAt: Date.now() };
}

const started = Date.now();
const table = await steeredTable({ seed: SEED, ais: 3, phaseScale: PHASE_SCALE, maxMonths: 1 });
const stopHost = hostKeepsPlaying(table.host);
try {
  const { frames, view, endsAt, endedAt } = await watchADevelopment(table.board);
  const ais = view.players.filter((p) => p.isAi);
  check(frames.length > 0, 'W-2/W-7: the board was sent no development frame: development is not steered');

  // W-7: every AI colonist walked the floor and was at the pub before the clock.
  for (const ai of ais) {
    soft(frames.some((f) => f.colonists.some((c) => c.id === ai.id && c.moving)), `W-7: ${ai.name}'s colonist never moved on the floor`);
    const done = table.board.views.find((v) => v.phase === 'development' && v.players.find((p) => p.id === ai.id)?.doneDeveloping);
    soft(done, `W-7: ${ai.name} never reached the pub in development`);
  }
  soft(endedAt <= endsAt + END_SLACK_MS, `development ran ${endedAt - endsAt} ms past its clock`);

  // W-2: each AI colonist's speed on mountains is the config's share of its own speed on plains.
  const expected = DEV_STEER.terrain.mountains / DEV_STEER.terrain.plains;
  const samples = speeds(frames, view);
  const shares: number[] = [];
  for (const ai of ais) {
    for (const leading of [false, true]) {
      const on = (terrain: Terrain) => samples.filter((s) => s.id === ai.id && s.leading === leading && s.terrain === terrain).map((s) => s.tilesPerSecond);
      const plains = on('plains');
      const mountains = on('mountains');
      if (plains.length >= MIN_SAMPLES && mountains.length >= MIN_SAMPLES) shares.push(median(mountains) / median(plains));
    }
  }
  soft(shares.length > 0, `W-2: no AI colonist walked both plains and mountains (${MIN_SAMPLES}+ frames each) in seed ${SEED}`);
  for (const share of shares) {
    soft(Math.abs(share - expected) <= expected * SHARE_TOLERANCE, `W-2: an AI colonist walks mountains at ${share.toFixed(2)} of its plains speed, not ${expected}`);
  }

  checkNeverOnBlockedLand(frames, view, 'W-2/W-7');
} catch (err) {
  errors.push(err instanceof Error ? err.message : String(err));
} finally {
  stopHost();
  await table.close();
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (errors.length) {
  console.error(`walking: ${errors.length} failed (${seconds} s)\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`walking: ok (${seconds} s)`);
