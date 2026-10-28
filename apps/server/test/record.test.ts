import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuleError, type GameRecord } from '@mule/engine';
import type { Decider } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { Room, TableError, type ClientEnvelope, type Connection, type GameContext, type ServerEnvelope } from '@tabletop/core';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { AI_NAMES } from '../src/mule-game.js';
import { createRecordedGame, replay, ReplayDiverged, type Recorder } from '../src/record.js';

const CODE = 'RECRD';
const SEED = 10;
/** Game time per step of the fake clock; every timer due in a step runs, with promises settled between them. */
const STEP_MS = 100;
const PLANNING_READY_MS = 3_000;
const GAME_LIMIT_MS = 30 * 60_000;
/** How long the Claude stand-in takes per call, in turn: some land within a tick, some many ticks later. */
const ANSWER_DELAYS_MS = [40, 1_300, 260, 3_100, 90, 700];

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
}

interface TableOptions {
  /** Absent: no recorder, the game as the server builds it with recording off. */
  record?: boolean;
  /** Fetches every view at these extra moments, as joins and pongs do. */
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
});

/**
 * A real Room hosting a recorded MuleGame: two humans on phones, a TV, a Smart AI (s3) and a Classic one (s4). The
 * script claims a lit plot, chats, sends one illegal intent, and drops and brings back s2's phone.
 */
function table(options: TableOptions = { record: true }) {
  let recorder: Recorder | null = null;
  let game: { viewFor(seat: string | null): MuleView } | null = null;
  const brain = stubBrain('s3');
  const room = new Room<MuleIntent, MuleView>({
    code: CODE,
    createGame: (ctx: GameContext) => {
      const made = createRecordedGame({ ctx, seed: SEED, options: { maxMonths: 1, politics: true }, brain, record: options.record ?? true });
      recorder = made.recorder;
      game = made.game;
      return made.game;
    },
    aiNames: AI_NAMES,
    isUserError: (err) => err instanceof RuleError || err instanceof TableError,
  });
  rooms.push(room);
  const screen = (): Screen => {
    const s: Screen = {
      from: { seatId: null },
      token: null,
      conn: {
        send: (msg: ServerEnvelope<MuleView>) => {
          if (msg.t === 'welcome' && msg.seatToken) s.token = msg.seatToken;
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

  const view = () => game!.viewFor(null);
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
    recorder: () => recorder!,
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
