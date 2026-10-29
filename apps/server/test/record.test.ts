import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { configSnapshot, RuleError, stableJson, type GameRecord, type Playbook, type PlaybookEntry } from '@mule/engine';
import type { Decider } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { Room, TableError, type ClientEnvelope, type Connection, type GameContext, type ServerEnvelope } from '@tabletop/core';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import type { HaikuSdk } from '../src/brain/client.js';
import { AI_NAMES, MuleGame, type Notice } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';
import { fakeSdk, KEY, sdkMessage } from './brain-fakes.js';
import { createRecordedGame, stateHash, type Recorder } from '../src/record.js';
import { RecordMismatch, replay, ReplayDiverged } from '../src/replay.js';

/** How many MuleGames this file built and SDKs it asked for; the SDK factory throws unless a test gives it a fake. */
const spies = vi.hoisted(() => ({
  games: 0,
  sdk: 0,
  client: null as HaikuSdk | null,
  viewReadsClock: false,
  /** The playbook a game writes after accepting an intent, as a playbook builder would; null writes none. */
  playbookFor: null as ((seat: string, intent: MuleIntent) => PlaybookNote | null) | null,
}));
vi.mock('../src/mule-game.js', async (original) => {
  const real = await original<typeof import('../src/mule-game.js')>();
  /** Counts constructions; with `viewReadsClock`, its views read the clock, as a view showing time left would. */
  class CountedMuleGame extends real.MuleGame {
    readonly #clock: GameContext;
    constructor(...args: ConstructorParameters<typeof real.MuleGame>) {
      super(...args);
      this.#clock = args[0];
      spies.games++;
    }
    override handle(seatId: string, intent: MuleIntent): void {
      super.handle(seatId, intent);
      const entry = spies.playbookFor?.(seatId, intent);
      if (entry) this.recordPlaybook(entry);
    }
    override viewFor(seatId: string | null): MuleView {
      if (spies.viewReadsClock) this.#clock.now();
      return super.viewFor(seatId);
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
/** Three months, so the export ship calls, and a lot sells to a player at the land auction: found by a seed sweep. */
const NOTICE_GAME = { seed: 4, maxMonths: 3 };
/** Game time per step of the fake clock; every timer due in a step runs, with promises settled between them. */
const STEP_MS = 100;
const PLANNING_READY_MS = 3_000;
const GAME_LIMIT_MS = 30 * 60_000;
/**
 * How the Claude stand-in answers each call, in turn: after a delay in ms (some land within a tick, some many ticks
 * later), or by rejecting at once, as the real decider does when the seat is busy.
 */
const ANSWERS: readonly (number | 'busy')[] = [40, 'busy', 1_300, 260, 3_100, 90, 700];
const GAME_OPTIONS = { maxMonths: 1, politics: true };
/** The rows beyond T-AC-1 run locally only (MULE_FULL=1, `pnpm test:full`); each plays one or two whole games. */
const FULL = process.env.MULE_FULL === '1';
/** What the script says: a public line from s1 and a whisper from s2 to the Smart seat, in words no record holds otherwise. */
const CHAT = {
  public: { from: 's1', text: 'Quokka keeps the riverbank.' },
  whisper: { from: 's2', to: 's3', text: 'psst Marzipan, sell me smithore' },
} as const;
const CHAT_WORDS = ['Quokka', 'riverbank', 'psst', 'Marzipan'];

type MuleRecord = GameRecord<MuleIntent>;
type PlaybookNote = Omit<PlaybookEntry, 'type' | 'at' | 'seq'>;

/** The smallest playbook schema v1 allows, for a land grant. */
const playbookOf = (seat: string, cashFloor: number): Playbook => ({
  v: 1,
  seat,
  month: 1,
  phase: 'landGrant',
  by: 'engine',
  strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor, landTarget: { plots: 1, byMonth: 1 }, stances: {}, reason: 'Land first.' },
  landGrant: { ranked: [], pressShare: { start: 1, end: 0 }, deny: [], planB: [], claims: 1 },
});

/** A Smart brain for seat `smartId` only, answering as ANSWERS says; the rest play Classic. */
function stubBrain(smartId: string): BrainService & { calls: () => number } {
  let calls = 0;
  const decider: Decider = {
    name: 'stub',
    decide: (shortlist) =>
      new Promise((resolve, reject) => {
        const answer = ANSWERS[calls++ % ANSWERS.length]!;
        if (answer === 'busy') return reject(new Error('busy'));
        const option = shortlist[Math.min(1, shortlist.length - 1)]!;
        setTimeout(() => resolve({ optionId: option.id, line: 'Mine.', by: 'llm' }), answer);
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
  /** Default SEED and GAME_OPTIONS' month count. */
  seed?: number;
  maxMonths?: number;
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
  let game: MuleGame | null = null;
  const brain = stubBrain('s3');
  const seed = options.seed ?? SEED;
  const gameOptions = { ...GAME_OPTIONS, maxMonths: options.maxMonths ?? GAME_OPTIONS.maxMonths };
  const createGame = (ctx: GameContext) => {
    if (options.record === false) {
      game = new MuleGame(ctx, seed, { ...gameOptions, brain, onGameOver: (state) => (unrecordedHash = stateHash(state)) });
      return game;
    }
    const made = createRecordedGame({ ctx, seed, options: gameOptions, brain, dir: options.dir ?? null });
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
  let hostContinued = false;
  let dropAt: number | null = null;
  let elapsed = 0;
  const script = () => {
    const [heiko, mia] = phones as [Screen, Screen];
    const phase = view().phase;
    if (phase === 'planning') {
      planningFor += STEP_MS;
      if (!refusedSent) {
        refusedSent = true;
        send(mia, { t: 'intent', intent: { type: 'continue' } });
        send(heiko, { t: 'chat', text: CHAT.public.text });
        send(mia, { t: 'chat', text: CHAT.whisper.text, to: CHAT.whisper.to });
      }
      if (planningFor >= PLANNING_READY_MS && !hostContinued) {
        hostContinued = true;
        send(heiko, { t: 'intent', intent: { type: 'continue' } });
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
    /** The unrecorded game itself, built with `record: false`. */
    game: () => game!,
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

/** The record's heard steps, as who spoke to whom. */
const heardIn = (record: MuleRecord) =>
  record.events.flatMap((e) => (e.type === 'heard' ? [e.to === undefined ? { from: e.from } : { from: e.from, to: e.to }] : []));

describe('the game record', { timeout: 60_000 }, () => {
  it('T-AC-1: a recorded game with a late Claude answer and a dropped phone replays identical', async () => {
    const { record, t } = await recordedGame();
    expect(t.brain.calls(), 'the Smart seat asked the stand-in').toBeGreaterThan(0);
    const steps = record.events.filter(isStep);
    expect(steps.some((e) => e.type === 'answer' && e.choice), 'an answer arrived as its own step').toBe(true);
    expect(steps.some((e) => e.type === 'answer' && e.error === 'busy'), 'a call was rejected busy').toBe(true);
    expect(steps.some((e) => e.type === 'intent' && e.seat === 's1' && e.intent.type === 'continue' && !e.refused && e.hosts?.length)).toBe(true);
    expect(steps.some((e) => e.type === 'connection' && !e.connected)).toBe(true);
    expect(steps.some((e) => e.type === 'connection' && e.connected)).toBe(true);
    expect(steps.some((e) => e.type === 'intent' && e.intent.type === 'claim' && !e.refused)).toBe(true);
    expect(steps.some((e) => e.type === 'intent' && e.seat === 's2' && e.refused === 'Only the host can continue' && e.hosts?.length)).toBe(true);
    expect(record.seats.filter((s) => s.smart).map((s) => s.id)).toEqual(['s3']);
    expect(heardIn(record), 'the chat lines are heard steps').toEqual([{ from: CHAT.public.from }, { from: CHAT.whisper.from, to: CHAT.whisper.to }]);

    const result = await replay(record);
    expect(result.scores.map((s) => s.replayed)).toEqual(result.scores.map((s) => s.recorded));
    expect(result.stateHash.replayed).toBe(result.stateHash.recorded);
    expect(result.identical).toBe(true);
  });

  it('T-AC-1 (positive control): the first answer that a tick reads, moved one step later, diverges or differs', async () => {
    const { record } = await recordedGame();
    const moved = fileCopy(record);
    const events = moved.events;
    const i = events.findIndex((e, k) => e.type === 'answer' && e.choice && events.slice(k + 1).find(isStep)?.type === 'fire');
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

  it('T-AC-6: a game whose views read the clock, fetched at extra moments, still replays identical', async () => {
    spies.viewReadsClock = true;
    try {
      const { record } = await recordedGame({ extraViews: true });
      expect((await replay(record)).identical).toBe(true);
    } finally {
      spies.viewReadsClock = false;
    }
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
    expect(refused).toMatchObject({ type: 'intent', seat: 's2', intent: { type: 'continue' }, refused: 'Only the host can continue' });
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

  it('FM-REC-1: a recorder that fails while closing the record at game over leaves the room at game over and answering, and writes no file', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = table({ dir });
    // An unprintable start time: naming the file throws once the game is over.
    t.recorder().record.t0 = Number.NaN;
    expect(await t.toGameOver()).toBe(true);
    expect(t.recorder().broken).toBe(true);
    expect(t.recorder().finished).toBeNull();
    expect(t.room.viewFor(null).game?.finished).toBe(true);
    const phone = t.phones[0]!;
    t.send(phone, { t: 'ping', clientTime: 1 });
    expect(phone.seen.at(-1)).toBe('pong');
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(errors).toHaveBeenCalled();
  });
});

describe.runIf(FULL)('chat in the record', { timeout: 60_000 }, () => {
  it('T-AC-12: a public line and a whisper to an AI are one heard step each, who to whom, the file holds none of their words, and the replay is identical', async () => {
    const { record } = await recordedGame();
    const heard = record.events.filter((e) => e.type === 'heard');
    const fields = new Set(['type', 'at', 'seq', 'reads', 'hosts', 'decides', 'from', 'to']);
    for (const step of heard) expect(Object.keys(step).filter((k) => !fields.has(k)), 'a heard step has no field for the words').toEqual([]);
    expect(heardIn(record)).toEqual([{ from: CHAT.public.from }, { from: CHAT.whisper.from, to: CHAT.whisper.to }]);

    const text = JSON.stringify(record);
    for (const line of [CHAT.public.text, CHAT.whisper.text]) expect(text).not.toContain(line);
    for (const word of CHAT_WORDS) expect(text, `the record holds the chat word "${word}"`).not.toContain(word);

    expect((await replay(record)).identical).toBe(true);
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

  /** Replays `record` with one step changed by `tamper`, and returns the error, which must name that step. */
  async function tampered(record: MuleRecord, pick: (e: MuleRecord['events'][number]) => boolean, tamper: (e: MuleRecord['events'][number]) => void) {
    const copy = fileCopy(record);
    const step = copy.events.find(pick)!;
    expect(step, 'the record has a step to tamper with').toBeDefined();
    tamper(step);
    const err: unknown = await replay(copy).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReplayDiverged);
    expect((err as ReplayDiverged).seq).toBe(step.seq);
    return err as ReplayDiverged;
  }

  it('T-AC-2: a step with one clock value too many diverges at that step', async () => {
    const { record } = await recordedGame();
    const err = await tampered(record, (e) => e.type === 'fire' && !!e.reads?.length, (e) => {
      if (e.type === 'fire') e.reads!.push(e.reads!.at(-1)!);
    });
    expect(err.reason).toBe('clock tape not consumed');
  });

  it("T-AC-2: a brain call recorded under another call number diverges at that step", async () => {
    const { record } = await recordedGame();
    await tampered(record, (e) => e.type !== 'notice' && e.type !== 'playbook' && !!e.decides?.length, (e) => {
      if (e.type !== 'notice' && e.type !== 'playbook') e.decides![0]!.call += 100;
    });
  });

  it('T-AC-2: a timer firing that names a timer never scheduled diverges at that step', async () => {
    const { record } = await recordedGame();
    const err = await tampered(record, (e) => e.type === 'fire', (e) => {
      if (e.type === 'fire') e.timer = 1_000_000;
    });
    expect(err.reason).toBe('timer 1000000 not live');
  });

  it("T-AC-2: a changed final state hash, or one seat's changed score, comes out not identical, without a throw", async () => {
    const { record } = await recordedGame();
    const hash = fileCopy(record);
    hash.outcome!.stateHash = '0'.repeat(64);
    const byHash = await replay(hash);
    expect(byHash.identical).toBe(false);
    expect(byHash.stateHash.replayed).toBe(record.outcome!.stateHash);

    const scored = fileCopy(record);
    scored.outcome!.scores.s1! += 1;
    const byScore = await replay(scored);
    expect(byScore.identical).toBe(false);
    expect(byScore.scores.find((s) => s.seat === 's1')).toMatchObject({ recorded: record.outcome!.scores.s1! + 1, replayed: record.outcome!.scores.s1 });
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

    vi.useRealTimers();
    expect((await replay(record)).identical, 'the file replays identical').toBe(true);
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

describe.runIf(FULL)('playbooks in the record', { timeout: 60_000 }, () => {
  /** Every accepted Ready writes the seat a playbook; returns what was written, in call order. Empty it before a replay. */
  function writeOnReady(): PlaybookNote[] {
    const written: PlaybookNote[] = [];
    spies.playbookFor = (seat, intent) => {
      if (intent.type !== 'ready') return null;
      const entry: PlaybookNote = { seat, month: 1, phase: 'landGrant', playbook: playbookOf(seat, 100 * (written.length + 1)) };
      written.push(entry);
      return entry;
    };
    return written;
  }
  afterEach(() => {
    spies.playbookFor = null;
  });

  it('T-AC-11: recordPlaybook entries come out in call order with their step\'s at and seq, and the replay ignores them', async () => {
    const written = writeOnReady();
    const { record, t } = await recordedGame();
    const entries = record.events.filter((e) => e.type === 'playbook');
    expect(entries.length, 'the game wrote playbooks').toBeGreaterThan(1);
    expect(entries.map(({ seat, month, phase, playbook }) => ({ seat, month, phase, playbook }))).toEqual(written);
    record.events.forEach((e, i) => {
      if (e.type !== 'playbook') return;
      const step = record.events.slice(0, i).filter(isStep).at(-1)!;
      expect(step).toMatchObject({ type: 'intent', seat: e.seat, intent: { type: 'ready' }, at: e.at, seq: e.seq });
    });

    const last = record.events.filter(isStep).at(-1)!;
    t.recorder().playbook({ seat: 's3', month: 1, phase: 'month', playbook: playbookOf('s3', 0) });
    expect(t.recorder().record.events.at(-1), 'between steps, the last step stamps it').toMatchObject({ type: 'playbook', seat: 's3', at: last.at, seq: last.seq });

    written.length = 0;
    expect((await replay(record)).identical).toBe(true);
  });

  it('T-AC-11 (positive control): a recorded playbook that differs from the one the replay writes diverges at its step', async () => {
    const written = writeOnReady();
    const { record } = await recordedGame();
    written.length = 0;
    expect((await replay(record)).identical).toBe(true);
    written.length = 0;
    const altered = fileCopy(record);
    const entry = altered.events.filter((e) => e.type === 'playbook')[1]!;
    if (entry.type === 'playbook') entry.playbook.strategy.cashFloor += 1;
    await expect(replay(altered)).rejects.toMatchObject({ name: 'ReplayDiverged', seq: entry.seq });
  });
});


describe.runIf(FULL)('notices in the record', { timeout: 120_000 }, () => {
  const factOf = (e: MuleRecord['events'][number]): Notice | null => {
    if (e.type !== 'notice') return null;
    const { type: _type, at: _at, seq: _seq, ...notice } = e;
    return notice;
  };

  it('T-AC-10: claims, declarations, trades (the ship included) and lot sales appear as notices, phaseNotices() holds them with recording off, and a replay without them is identical', async () => {
    const { record } = await recordedGame(NOTICE_GAME);
    const notices = record.events.map(factOf).filter((n) => n !== null);
    const phaseOf = { claim: 'landGrant', declare: 'auction', trade: 'auction', sale: 'landAuction' } as const;
    for (const n of notices) expect(n.phase, `a ${n.kind} settles in its phase`).toBe(phaseOf[n.kind]);
    expect(notices.some((n) => n.kind === 'claim' && n.seat === 's1'), "the human's claim").toBe(true);
    expect(notices.some((n) => n.kind === 'claim' && n.seat !== 's1'), "an AI seat's claim").toBe(true);
    expect(notices.some((n) => n.kind === 'declare' && n.side === 'pass')).toBe(true);
    expect(notices.some((n) => n.kind === 'declare' && n.side !== 'pass')).toBe(true);
    expect(notices.some((n) => n.kind === 'trade' && n.buyer === 'ship' && n.month === 3), 'a sale to the export ship').toBe(true);
    expect(notices.some((n) => n.kind === 'trade' && n.buyer !== 'ship' && n.buyer !== 'store' && n.seller !== 'store'), 'a trade between players').toBe(true);
    expect(notices.some((n) => n.kind === 'sale' && n.buyer !== 'store'), 'a lot sold to a player').toBe(true);
    record.events.forEach((e, i) => {
      if (e.type !== 'notice') return;
      const step = record.events.slice(0, i).filter(isStep).at(-1)!;
      expect({ at: e.at, seq: e.seq }).toEqual({ at: step.at, seq: step.seq });
    });

    const withoutNotices = fileCopy(record);
    withoutNotices.events = withoutNotices.events.filter((e) => e.type !== 'notice');
    expect((await replay(withoutNotices)).identical).toBe(true);

    vi.useFakeTimers();
    const kept: Notice[] = [];
    const phases = MuleGame.prototype as unknown as { enterPhase(this: MuleGame): void };
    const enterPhase = phases.enterPhase;
    vi.spyOn(phases, 'enterPhase').mockImplementation(function (this: MuleGame) {
      kept.push(...this.phaseNotices());
      enterPhase.call(this);
      expect(this.phaseNotices(), 'a new phase opens with none').toEqual([]);
    });
    const off = table({ ...NOTICE_GAME, record: false });
    expect(await off.toGameOver()).toBe(true);
    expect(kept).toEqual(notices);
  });
});
