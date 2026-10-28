import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { configSnapshot, RuleError, stableJson, type GameRecord } from '@mule/engine';
import type { Decider } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { Room, TableError, type ClientEnvelope, type Connection, type GameContext, type ServerEnvelope } from '@tabletop/core';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import type { HaikuSdk } from '../src/brain/client.js';
import { AI_NAMES, MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeSdk, KEY, sdkMessage } from './brain-fakes.js';
import { createRecordedGame, stateHash, type Recorder } from '../src/record.js';
import { RecordMismatch, replay, ReplayDiverged } from '../src/replay.js';

/** How many MuleGames this file built and SDKs it asked for; the SDK factory throws unless a test gives it a fake. */
const spies = vi.hoisted(() => ({ games: 0, sdk: 0, client: null as HaikuSdk | null }));
vi.mock('../src/mule-game.js', async (original) => {
  const real = await original<typeof import('../src/mule-game.js')>();
  class CountedMuleGame extends real.MuleGame {
    constructor(...args: ConstructorParameters<typeof real.MuleGame>) {
      super(...args);
      spies.games++;
    }
  }
  return { ...real, MuleGame: CountedMuleGame };
});
vi.mock('../src/brain/client.js', async (original) => ({
  ...(await original<typeof import('../src/brain/client.js')>()),
  createAnthropicSdk: () => {
    spies.sdk++;
    if (!spies.client) throw new Error('this test must never build the SDK');
    return spies.client;
  },
}));

const CODE = 'RECRD';
const SEED = 10;
/** Game time per step of the fake clock; every timer due in a step runs, with promises settled between them. */
const STEP_MS = 100;
const PLANNING_READY_MS = 3_000;
const GAME_LIMIT_MS = 30 * 60_000;
/** How long the Claude stand-in takes per call, in turn: some land within a tick, some many ticks later. */
const ANSWER_DELAYS_MS = [40, 1_300, 260, 3_100, 90, 700];
const GAME_OPTIONS = { maxMonths: 1, politics: true };
/** The rows beyond T-AC-1 run locally only (MULE_FULL=1, `pnpm test:full`); each plays one or two whole games. */
const FULL = process.env.MULE_FULL === '1';

type MuleRecord = GameRecord<MuleIntent>;

/** A Smart brain for seat `smartId` only, whose answers arrive by timer after ANSWER_DELAYS_MS; the rest play Classic. */
function stubBrain(smartId: string): BrainService & { calls: () => number } {
  let calls = 0;
  const decider: Decider = {
    name: 'stub',
    decide: (shortlist) =>
      new Promise((resolve) => {
        const delay = ANSWER_DELAYS_MS[calls++ % ANSWER_DELAYS_MS.length]!;
        const option = shortlist[Math.min(1, shortlist.length - 1)]!;
        setTimeout(() => resolve({ optionId: option.id, line: 'Mine.', by: 'llm' }), delay);
      }),
  };
  return {
    deciderFor: (seat) => (seat.id === smartId ? decider : null),
    chatter: (seat, say) => chatter(seat.id, say),
    finish: () => {},
    calls: () => calls,
  };
}

interface Screen {
  conn: Connection<MuleView>;
  from: { seatId: string | null };
  token: string | null;
  handoff: string | null;
  /** Every message type the screen received, in order. */
  seen: string[];
}

interface TableOptions {
  /** A room the server made; absent, the table builds its own around the stub brain. */
  room?: Room<MuleIntent, MuleView>;
  /** Default true. False builds the game as the server does with recording off. */
  record?: boolean;
  /** Where the recorder writes the file at game over; absent writes nothing. */
  dir?: string;
  /** Fetches views and pongs at extra moments, as joins and pings do. */
  extraViews?: boolean;
}

let rooms: Room<MuleIntent, MuleView>[];

beforeEach(() => {
  rooms = [];
  vi.useFakeTimers();
});
afterEach(() => {
  for (const room of rooms) room.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/**
 * A real Room hosting a recorded MuleGame: two humans on phones, a TV, a Smart AI (s3) and a Classic one (s4). The
 * script claims a lit plot, chats, sends one illegal intent, and drops and brings back s2's phone.
 */
function table(options: TableOptions = {}) {
  let recorder: Recorder | null = null;
  let unrecordedHash: string | null = null;
  const brain = stubBrain('s3');
  const createGame = (ctx: GameContext) => {
    if (options.record === false) {
      return new MuleGame(ctx, SEED, { ...GAME_OPTIONS, brain, onGameOver: (state) => (unrecordedHash = stateHash(state)) });
    }
    const made = createRecordedGame({ ctx, seed: SEED, options: GAME_OPTIONS, brain, dir: options.dir ?? null });
    recorder = made.recorder;
    return made.game;
  };
  const room = options.room ?? new Room<MuleIntent, MuleView>({ code: CODE, createGame, aiNames: AI_NAMES, isUserError: (err) => err instanceof RuleError || err instanceof TableError });
  rooms.push(room);
  const screen = (): Screen => {
    const s: Screen = {
      from: { seatId: null },
      token: null,
      handoff: null,
      seen: [],
      conn: {
        send: (msg: ServerEnvelope<MuleView>) => {
          if (msg.t === 'welcome' && msg.seatToken) s.token = msg.seatToken;
          if (msg.t === 'handoffCode') s.handoff = msg.code;
          s.seen.push(msg.t);
        },
      },
    };
    return s;
  };
  const send = (s: Screen, msg: ClientEnvelope<MuleIntent>) => room.receive(s.conn, s.from, msg);
  const phones = ['Heiko', 'Mia'].map((name) => {
    const s = screen();
    send(s, { t: 'join', code: CODE, name });
    return s;
  });
  const tv = screen();
  send(tv, { t: 'board', code: CODE });
  send(phones[0]!, { t: 'addAi' });
  send(phones[0]!, { t: 'addAi' });
  send(phones[0]!, { t: 'start' });

  const view = () => room.viewFor(null).game!;
  const finished = () => room.viewFor(null).game?.finished ?? false;
  let planningFor = 0;
  let claimed = false;
  let refusedSent = false;
  let dropAt: number | null = null;
  let elapsed = 0;
  const script = () => {
    const [heiko, mia] = phones as [Screen, Screen];
    const phase = view().phase;
    if (phase === 'planning') {
      planningFor += STEP_MS;
      if (!refusedSent) {
        refusedSent = true;
        send(mia, { t: 'intent', intent: { type: 'setTax', percent: 5 } });
        send(heiko, { t: 'chat', text: 'Leave the river to me.' });
        send(mia, { t: 'chat', text: 'psst, sell me food', to: 's3' });
      }
      if (planningFor >= PLANNING_READY_MS) for (const phone of phones) if (view().phase === 'planning') send(phone, { t: 'intent', intent: { type: 'ready' } });
    } else planningFor = 0;
    const lit = view().lit;
    if (phase === 'landGrant' && lit && !claimed) {
      claimed = true;
      send(heiko, { t: 'intent', intent: { type: 'claim', x: lit.x, y: lit.y } });
    }
    if (phase === 'development' && dropAt === null) {
      dropAt = elapsed;
      room.disconnect(mia.conn);
    }
    if (dropAt !== null && elapsed === dropAt + 20 * STEP_MS) {
      mia.from.seatId = null;
      send(mia, { t: 'join', code: CODE, name: 'Mia', seatToken: mia.token! });
    }
    if (options.extraViews && elapsed % (7 * STEP_MS) === 0) {
      room.viewFor('s1');
      send(tv, { t: 'ping', clientTime: elapsed });
    }
  };
  const runUntil = async (done: () => boolean, limitMs = GAME_LIMIT_MS) => {
    for (; elapsed < limitMs && !done(); elapsed += STEP_MS) {
      await vi.advanceTimersByTimeAsync(STEP_MS);
      script();
    }
    return done();
  };
  return {
    room,
    brain,
    phones,
    send,
    recorder: () => recorder!,
    unrecordedHash: () => unrecordedHash,
    finished,
    /** Plays to game over, then lets the record be written. */
    toGameOver: async () => {
      const over = await runUntil(finished);
      await vi.advanceTimersByTimeAsync(5_000);
      return over;
    },
  };
}

/** The record as it reaches the file: a plain JSON copy. */
const fileCopy = (record: MuleRecord): MuleRecord => JSON.parse(JSON.stringify(record)) as MuleRecord;

/** Plays the scripted game to its written record, then hands the clock back for the replay. */
async function recordedGame(options?: TableOptions): Promise<{ record: MuleRecord; t: ReturnType<typeof table> }> {
  const t = table(options);
  expect(await t.toGameOver()).toBe(true);
  const written = t.recorder().finished;
  expect(written, 'the record is complete at game over').not.toBeNull();
  vi.useRealTimers();
  return { record: fileCopy(written!), t };
}

const isStep = (e: MuleRecord['events'][number]) => e.type !== 'notice' && e.type !== 'playbook';

describe('the game record', { timeout: 60_000 }, () => {
  it('T-AC-1: a recorded game with a late Claude answer and a dropped phone replays identical', async () => {
    const { record, t } = await recordedGame();
    expect(t.brain.calls(), 'the Smart seat asked the stand-in').toBeGreaterThan(0);
    const steps = record.events.filter(isStep);
    expect(steps.some((e) => e.type === 'answer'), 'an answer arrived as its own step').toBe(true);
    expect(steps.some((e) => e.type === 'connection' && !e.connected)).toBe(true);
    expect(steps.some((e) => e.type === 'connection' && e.connected)).toBe(true);
    expect(steps.some((e) => e.type === 'intent' && e.intent.type === 'claim' && !e.refused)).toBe(true);
    expect(steps.some((e) => e.type === 'intent' && e.refused)).toBe(true);
    expect(record.seats.filter((s) => s.smart).map((s) => s.id)).toEqual(['s3']);

    const result = await replay(record);
    expect(result.scores.map((s) => s.replayed)).toEqual(result.scores.map((s) => s.recorded));
    expect(result.stateHash.replayed).toBe(result.stateHash.recorded);
    expect(result.identical).toBe(true);
  });

  it('T-AC-1 (positive control): the first answer that a tick reads, moved one step later, diverges or differs', async () => {
    const { record } = await recordedGame();
    const moved = fileCopy(record);
    const events = moved.events;
    const i = events.findIndex((e, k) => e.type === 'answer' && events.slice(k + 1).find(isStep)?.type === 'fire');
    expect(i, 'some answer is followed by a timer firing').toBeGreaterThanOrEqual(0);
    const j = events.findIndex((e, k) => k > i && isStep(e));
    const [answer] = events.splice(i, 1);
    events.splice(j, 0, answer!);
    let seq = 0;
    for (const e of events) if (isStep(e)) e.seq = seq++;

    const outcome = await replay(moved).then(
      (r) => r.identical,
      (err: unknown) => {
        if (!(err instanceof ReplayDiverged)) throw err;
        return false;
      },
    );
    expect(outcome).toBe(false);
  });
});

describe.runIf(FULL)('the recorder', { timeout: 60_000 }, () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mule-record-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('T-AC-6: a game whose views and pongs are fetched at extra moments still replays identical', async () => {
    const { record } = await recordedGame({ extraViews: true });
    expect((await replay(record)).identical).toBe(true);
  });

  it('T-AC-7: the same game recorded and unrecorded ends in the same state hash, and nothing is written before game over', async () => {
    const t = table({ dir });
    const written: boolean[] = [];
    const promised = fs.promises.writeFile.bind(fs.promises);
    vi.spyOn(fs.promises, 'writeFile').mockImplementation((...args: Parameters<typeof fs.promises.writeFile>) => {
      written.push(t.finished());
      return promised(...args);
    });
    const sync = vi.spyOn(fs, 'writeFileSync');
    expect(await t.toGameOver()).toBe(true);
    await vi.waitFor(() => expect(fs.readdirSync(dir)).toHaveLength(1));
    expect(written, 'one write, after game over').toEqual([true]);
    expect(sync).not.toHaveBeenCalled();
    const recordedHash = t.recorder().finished!.outcome!.stateHash;

    const off = table({ record: false });
    expect(await off.toGameOver()).toBe(true);
    expect(off.unrecordedHash()).toBe(recordedHash);
  });

  it('T-AC-9: a refused intent is recorded with its message, and the replay refuses it with the same message', async () => {
    const { record } = await recordedGame();
    const refused = record.events.find((e) => e.type === 'intent' && e.refused !== undefined);
    expect(refused).toMatchObject({ type: 'intent', seat: 's2', intent: { type: 'setTax' } });
    const message = refused!.type === 'intent' ? refused!.refused! : '';
    expect(message.length).toBeGreaterThan(0);
    expect((await replay(record)).identical).toBe(true);

    const reworded = fileCopy(record);
    const step = reworded.events.find((e) => e.type === 'intent' && e.refused !== undefined)!;
    if (step.type === 'intent') step.refused = `${message} (reworded)`;
    await expect(replay(reworded)).rejects.toMatchObject({ name: 'ReplayDiverged', seq: refused!.seq });
  });

  it('FM-REC-1: a recorder whose bookkeeping throws still lets the game reach game over, and writes no file', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = table({ dir });
    t.recorder().record.events.push = () => {
      throw new Error('bookkeeping fault');
    };
    expect(await t.toGameOver()).toBe(true);
    expect(t.recorder().broken).toBe(true);
    expect(t.recorder().finished).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(errors).toHaveBeenCalled();
  });
});

describe.runIf(FULL)('the replay', { timeout: 60_000 }, () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mule-replay-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('T-AC-2: an intent tampered to claim another plot diverges at that step or later, never a silent pass', async () => {
    const { record } = await recordedGame();
    const tampered = fileCopy(record);
    const claim = tampered.events.find((e) => e.type === 'intent' && e.intent.type === 'claim' && !e.refused)!;
    if (claim.type === 'intent' && claim.intent.type === 'claim') claim.intent.x = (claim.intent.x + 1) % 9;
    const err: unknown = await replay(tampered).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReplayDiverged);
    expect((err as ReplayDiverged).seq).toBeGreaterThanOrEqual(claim.seq);
  });

  it('T-AC-3: a record made under one changed config value is refused before any game is built', async () => {
    const { record } = await recordedGame();
    const changed = structuredClone(configSnapshot()) as { GAME: { claimsPerGrant: number } };
    changed.GAME.claimsPerGrant += 1;
    const other = { ...fileCopy(record), configFingerprint: createHash('sha256').update(stableJson(changed)).digest('hex') };
    const built = spies.games;
    await expect(replay(other)).rejects.toBeInstanceOf(RecordMismatch);
    expect(spies.games - built).toBe(0);
  });

  it('T-AC-4: a replay with the key set and an SDK that throws if built completes, with no call and no ledger line', async () => {
    const { record } = await recordedGame();
    const ledger = path.join(dir, 'costs.jsonl');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real');
    vi.stubEnv('MULE_BRAIN_LOG', ledger);
    const sdkBefore = spies.sdk;
    expect((await replay(record)).identical).toBe(true);
    expect(spies.sdk - sdkBefore).toBe(0);
    expect(fs.existsSync(ledger)).toBe(false);
  });
});

describe.runIf(FULL)('the server writes the record', { timeout: 60_000 }, () => {
  let dir: string;
  let server: MuleServer | null;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mule-records-'));
    server = null;
  });
  afterEach(async () => {
    spies.client = null;
    await server?.close();
    for (const entry of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, entry), 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A table in a room the server made, recording into `recordDir`. */
  const serverTable = (recordDir: string) => {
    server = createMuleServer({ recordDir, seed: () => SEED, maxMonths: 1 });
    return table({ room: server.registry.create() });
  };

  it('T-AC-5: the file a Smart game writes at game over holds no seat token, handoff code, room code or API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', KEY.ANTHROPIC_API_KEY);
    spies.client = fakeSdk(() => sdkMessage(JSON.stringify({ option: 'A', line: 'Mine.' })));
    const t = serverTable(dir);
    t.send(t.phones[0]!, { t: 'handoff' });
    expect(await t.toGameOver()).toBe(true);
    await vi.waitFor(() => expect(fs.readdirSync(dir)).toHaveLength(1));

    const text = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]!), 'utf8');
    const record = JSON.parse(text) as MuleRecord;
    expect(record.seats.filter((s) => s.smart).length, 'the AI seats played Smart').toBeGreaterThan(0);
    const secrets = [...t.phones.map((p) => p.token), t.phones[0]!.handoff, t.room.code, KEY.ANTHROPIC_API_KEY];
    expect(secrets.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
    for (const secret of secrets) expect(text).not.toContain(secret);
  });

  it('T-AC-8: an unwritable record folder at game over logs one error naming the path, and the room still shows game over and answers', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const readOnly = path.join(dir, 'read-only');
    fs.mkdirSync(readOnly);
    fs.chmodSync(readOnly, 0o500);
    const t = serverTable(readOnly);
    expect(await t.toGameOver()).toBe(true);
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());

    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![0])).toContain(readOnly);
    expect(server!.registry.get(t.room.code)).toBe(t.room);
    expect(t.room.viewFor(null).game?.finished).toBe(true);
    const phone = t.phones[0]!;
    t.send(phone, { t: 'ping', clientTime: 1 });
    expect(phone.seen.at(-1)).toBe('pong');
  });
});
