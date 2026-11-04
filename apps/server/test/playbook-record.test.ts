import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_HANDS, RuleError, type GameRecord, type GameState } from '@mule/engine';
import { unusableReply, type Decider } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { Room, TableError, type ClientEnvelope, type Connection, type GameContext, type ServerEnvelope } from '@tabletop/core';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { AI_NAMES } from '../src/mule-game.js';
import { createRecordedGame, type Recorder } from '../src/record.js';
import { replay } from '../src/replay.js';

type MuleRecord = GameRecord<MuleIntent>;

/** The month and the step seq in which the server opened planning proper, in order, for the game being recorded. */
const spies = vi.hoisted(() => ({
  openStep: null as (() => number) | null,
  planningOpened: [] as { month: number; seq: number }[],
}));
vi.mock('../src/mule-game.js', async (original) => {
  const real = await original<typeof import('../src/mule-game.js')>();
  type Planning = { startPlanning(this: InstanceType<typeof real.MuleGame>): void };
  const proto = real.MuleGame.prototype as unknown as Planning;
  const startPlanning = proto.startPlanning;
  proto.startPlanning = function () {
    const month = (this as unknown as { state: GameState }).state.month;
    if (spies.openStep) spies.planningOpened.push({ month, seq: spies.openStep() });
    startPlanning.call(this);
  };
  return real;
});
vi.mock('../src/brain/client.js', async (original) => ({
  ...(await original<typeof import('../src/brain/client.js')>()),
  createAnthropicSdk: () => {
    throw new Error('this test must never build the SDK');
  },
}));

const CODE = 'PLBKS';
const SEED = 10;
/** Month 1 opens with an election (POLITICS.electionMonths), month 2 does not: planning opens at both kinds of step. */
const GAME_OPTIONS = { maxMonths: 2, politics: true };
const STEP_MS = 100;
const PLANNING_READY_MS = 3_000;
const GAME_LIMIT_MS = 30 * 60_000;
/** A good's side pick has no clock (A-7): the phones read it past the AI seats' decision wait, then press Ready. */
const SIDE_PICK_READ_MS = AI_HANDS.auction.decideWaitMs + 500;
/** How the Claude stand-in answers each call, in turn: after a delay in ms, or by rejecting at once as a busy decider. */
const ANSWERS: readonly (number | 'busy')[] = [40, 'busy', 1_300, 260, 3_100, 90, 700];
const SMART = 's3';
const CLASSIC = 's4';

/** A Smart brain for seat `smartId` only, deciding as ANSWERS says; the rest play Classic, as with no key. */
function stubBrain(smartId: string): BrainService {
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
    // A Smart seat has a writer too, as createBrain gives one: this one never answers, so its land grant plays the
    // engine's draft. Cancelled at the grant, it settles no_reply, as the real writer does.
    writerFor: (seat) =>
      seat.id === smartId
        ? {
            write: (_kind, ask) =>
              new Promise((resolve) => {
                const noReply = () => resolve(unusableReply('no_reply'));
                if (ask.signal?.aborted) noReply();
                else ask.signal?.addEventListener('abort', noReply, { once: true });
              }),
          }
        : null,
    chatter: (seat, say) => chatter(seat.id, say),
    finish: () => {},
  };
}

let rooms: Room<MuleIntent, MuleView>[];

beforeEach(() => {
  rooms = [];
  spies.planningOpened = [];
  vi.useFakeTimers();
});
afterEach(() => {
  for (const room of rooms) room.dispose();
  vi.useRealTimers();
});

/** A real Room hosting a recorded MuleGame: two humans on phones, a Smart AI (s3) and a Classic one (s4), to game over. */
async function recordedGame(): Promise<MuleRecord> {
  let recorder: Recorder | null = null;
  const brain = stubBrain(SMART);
  const createGame = (ctx: GameContext) => {
    const made = createRecordedGame({ ctx, seed: SEED, options: GAME_OPTIONS, brain, dir: null });
    recorder = made.recorder;
    spies.openStep = () => made.recorder.record.events.filter(isStep).at(-1)!.seq;
    return made.game;
  };
  const room = new Room<MuleIntent, MuleView>({ code: CODE, createGame, aiNames: AI_NAMES, isUserError: (err) => err instanceof RuleError || err instanceof TableError });
  rooms.push(room);
  const screen = (): Connection<MuleView> => ({ send: (_msg: ServerEnvelope<MuleView>) => {} });
  const phones = ['Heiko', 'Mia'].map((name) => ({ conn: screen(), from: { seatId: null as string | null }, name }));
  const send = (p: (typeof phones)[number], msg: ClientEnvelope<MuleIntent>) => room.receive(p.conn, p.from, msg);
  for (const p of phones) send(p, { t: 'join', code: CODE, name: p.name });
  send(phones[0]!, { t: 'addAi' });
  send(phones[0]!, { t: 'addAi' });
  send(phones[0]!, { t: 'start' });

  const view = () => room.viewFor(null).game!;
  let planningFor = 0;
  let sidePickFor = 0;
  let sidePickOf = '';
  let claimed = false;
  for (let elapsed = 0; elapsed < GAME_LIMIT_MS && !view().finished; elapsed += STEP_MS) {
    await vi.advanceTimersByTimeAsync(STEP_MS);
    const v = view();
    planningFor = v.phase === 'planning' ? planningFor + STEP_MS : 0;
    if (v.phase === 'planning' && planningFor >= PLANNING_READY_MS) {
      send(phones[0]!, { t: 'intent', intent: { type: 'continue' } });
      for (const p of phones) if (view().phase === 'planning') send(p, { t: 'intent', intent: { type: 'ready' } });
    }
    if (v.phase === 'upkeep') for (const p of phones) send(p, { t: 'intent', intent: { type: 'ready' } });
    const pick = v.auction;
    if (v.phase === 'auction' && pick?.stage === 'status') {
      if (pick.good !== sidePickOf) [sidePickOf, sidePickFor] = [pick.good, 0];
      sidePickFor += STEP_MS;
      if (sidePickFor >= SIDE_PICK_READ_MS) for (const p of phones) if (!pick.walkers.find((w) => w.id === p.from.seatId)?.done) send(p, { t: 'intent', intent: { type: 'ready' } });
    } else sidePickFor = 0;
    if (v.phase === 'landGrant' && v.lit && !claimed) {
      claimed = true;
      send(phones[0]!, { t: 'intent', intent: { type: 'claim', x: v.lit.x, y: v.lit.y } });
    }
    // Month 1's development clock waits for every seat (A-1); the host starts it.
    if (v.phase === 'development' && v.clockWaitsFor) send(phones[0]!, { t: 'intent', intent: { type: 'continue' } });
  }
  expect(view().finished, 'the game reached game over').toBe(true);
  await vi.advanceTimersByTimeAsync(5_000);
  spies.openStep = null;
  const written = recorder!.finished;
  expect(written, 'the record is complete at game over').not.toBeNull();
  vi.useRealTimers();
  return JSON.parse(JSON.stringify(written)) as MuleRecord;
}

const isStep = (e: MuleRecord['events'][number]) => e.type !== 'notice' && e.type !== 'playbook';
const playbooksOf = (record: MuleRecord) => record.events.flatMap((e) => (e.type === 'playbook' ? [e] : []));

describe('AI playbooks in a keyless game record', { timeout: 60_000 }, () => {
  it("B-AC-7: a keyless server game records each AI seat's planning playbook, by 'engine'", async () => {
    const record = await recordedGame();
    expect(record.seats.filter((s) => s.isAi).map((s) => [s.id, s.smart])).toEqual([[SMART, true], [CLASSIC, false]]);

    const entries = playbooksOf(record);
    // A Smart seat drafts no playbook of its own (RULE-6 row 3); the land-grant ones WS2's writer records are not its.
    expect(entries.filter((e) => e.seat === SMART && e.phase === 'planning'), 'the Smart seat writes no planning playbook').toEqual([]);
    const classic = entries.filter((e) => e.seat === CLASSIC);
    expect(classic.map((e) => ({ month: e.month, phase: e.phase })), 'one planning playbook per month played').toEqual([
      { month: 1, phase: 'planning' },
      { month: 2, phase: 'planning' },
    ]);
    for (const e of classic) {
      expect(e.playbook).toMatchObject({ v: 1, seat: CLASSIC, month: e.month, phase: 'planning', by: 'engine' });
      expect(e.playbook.rejected ?? [], 'the validator rejected nothing of its own draft').toEqual([]);
      expect(e.playbook.edits ?? [], 'no one edited it').toEqual([]);
    }

    expect(spies.planningOpened.map((p) => p.month)).toEqual([1, 2]);
    expect(
      classic.map((e) => ({ month: e.month, seq: e.seq })),
      'each is written in the step that opened planning proper for its month',
    ).toEqual(spies.planningOpened);
    const stepAt = (seq: number) => record.events.find((s) => isStep(s) && s.seq === seq)!;
    for (const e of classic) expect(e.at, 'stamped with that step').toBe(stepAt(e.seq).at);
  });

  it('T-AC-4: a recorded keyless game replays with no ReplayDiverged, every playbook rewritten at its seq', async () => {
    const record = await recordedGame();
    const entries = playbooksOf(record);
    // The Classic seat's planning playbook and the Smart seat's land-grant one (WS2's writer, by 'engine' here), each month.
    expect(
      entries.map((e) => [e.seat, e.month, e.phase, e.playbook.by]).sort(),
      'the record holds playbooks to check',
    ).toEqual([
      [SMART, 1, 'landGrant', 'engine'],
      [SMART, 2, 'landGrant', 'engine'],
      [CLASSIC, 1, 'planning', 'engine'],
      [CLASSIC, 2, 'planning', 'engine'],
    ]);

    const result = await replay(record);
    expect(result.stateHash.replayed).toBe(result.stateHash.recorded);
    expect(result.identical).toBe(true);

    const altered = JSON.parse(JSON.stringify(record)) as MuleRecord;
    const last = playbooksOf(altered).at(-1)!;
    last.playbook.strategy.reason += '.';
    await expect(replay(altered), 'the replay compares every playbook it rewrites').rejects.toMatchObject({ name: 'ReplayDiverged', seq: last.seq });
  });
});
