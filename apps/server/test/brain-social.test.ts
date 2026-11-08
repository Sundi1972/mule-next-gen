/** The AI's monthly social reasoning at the table: what its replies' messages deliver, and who hears an AI's whisper. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, BRAIN, createGame, RuleError, type GameState, type Playbook } from '@mule/engine';
import { AiSeat, GOOD_NAME, playbookSource } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { Room, TableError, type ChatMessage, type ClientEnvelope, type Connection, type GameContext, type ServerEnvelope } from '@tabletop/core';
import { createBrain, type MeteredBrain } from '../src/brain/index.js';
import { Playbooks, type DropCause } from '../src/brain/playbooks.js';
import { AI_NAMES, MuleGame, type PlaybookNote } from '../src/mule-game.js';
import { fakeSdk, KEY, promptOf, sdkMessage, type FakeSdk, type SdkModuleFake, type SdkParams } from './brain-fakes.js';

/** The SDK module's constructor: records its options and builds nothing, so no network and no credential chain. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

const SEED = 10;
/** Long enough for a played game on the fake clock, many times over. */
const GAME_MS = 120_000;

let dir: string;
beforeEach(() => {
  sdkModule.built = [];
  sdkModule.create = null;
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-social-'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ledgerPath = () => path.join(dir, 'costs.jsonl');
const smartOn = (sdk: FakeSdk): MeteredBrain => createBrain({ gameId: 'g-social', env: KEY, logPath: ledgerPath(), sdkFactory: () => sdk });

/** What a request is: a land write with the social section (it may send messages), another write, or a decision. */
function requestKind(params: SdkParams): 'social' | 'write' | 'decision' {
  const properties = (params.output_config?.format?.schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  if ('messages' in properties) return 'social';
  return 'edits' in properties ? 'write' : 'decision';
}

/**
 * The brief's own seat name, the month it plans (asked at an upkeep, the next one's), and every other player by name
 * and id, as the social section lists them.
 */
function briefOf(user: string) {
  const [, name, month, phase] = /^You are (.+)\. Month (\d+) of \d+, phase (\w+)/m.exec(user) ?? [];
  const others = [...user.matchAll(/^- (.+) \(id ([^)]+)\):/gm)].map((m) => ({ name: m[1]!, id: m[2]! }));
  return { name: name!, month: Number(month) + (phase === 'upkeep' ? 1 : 0), others, user };
}
type Brief = ReturnType<typeof briefOf>;
interface SocialReply {
  edits?: { path: string; to: unknown; reason: string }[];
  messages: { to: string; purpose: string; text: string; facts: unknown[] }[];
}

/** A fake model: each social land write answers `compose`'s reply; every other write keeps its draft, every decision its top pick, all quiet. */
function socialModel(compose: (brief: Brief) => SocialReply) {
  return fakeSdk((_n, params) => {
    const kind = requestKind(params);
    if (kind === 'decision') return sdkMessage(JSON.stringify({ option: 'A', line: '' }));
    if (kind === 'write') return sdkMessage(JSON.stringify({ edits: [], line: '' }));
    const { edits = [], messages } = compose(briefOf(promptOf(params).user));
    return sdkMessage(JSON.stringify({ edits, line: '', messages }), { input: 2_000, output: 300 });
  });
}
const msg = (to: string, text: string, facts: unknown[] = []) => ({ to, purpose: 'goodwill', text, facts });

/** Advances the engine state phase by phase until `phase` opens. */
function advanceTo(state: GameState, phase: GameState['phase']): void {
  while (state.phase !== phase) advancePhase(state);
}

describe('T-AC-B1: which messages of a writer reply are sent (spec B RULE-B1)', () => {
  const PLAYERS = [
    { id: 'p0', name: 'Ada', isAi: true },
    { id: 'p1', name: 'Heiko', isAi: false },
    { id: 'p2', name: 'Mia', isAi: false },
  ];

  /**
   * Month 1 for one Smart seat on a fake model: its land write answers `messages`, `answerAtMs` after it is asked, and
   * the land grant starts at `grantAtMs`. Returns what the game was handed to say, and each message dropped, by cause.
   */
  async function month1(messages: SocialReply['messages'], options: { muted?: string[]; answerAtMs?: number; grantAtMs?: number } = {}) {
    const sdk = fakeSdk(
      (_n, params, call) =>
        new Promise((resolve, reject) => {
          const text = requestKind(params) === 'social' ? JSON.stringify({ edits: [], line: '', messages }) : JSON.stringify({ edits: [], line: '' });
          const timer = setTimeout(() => resolve(sdkMessage(text, { input: 900, output: 120 })), options.answerAtMs ?? 0);
          call.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(call.signal?.reason);
          });
        }),
    );
    const state = createGame({ seed: SEED, players: PLAYERS });
    const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
    const said: { seat: string; text: string; to?: string }[] = [];
    const dropped: DropCause[] = [];
    const playbooks = new Playbooks({
      brain: smartOn(sdk),
      source: playbookSource([seat]),
      seats: [seat],
      say: (s, text, to) => said.push({ seat: s, text, ...(to ? { to } : {}) }),
      muted: (listener) => (options.muted ?? []).includes(listener),
      dropped: (_s, cause) => dropped.push(cause),
    });
    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(options.grantAtMs ?? 1_000);
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sdk.requests.filter((r) => requestKind(r.params) === 'social'), 'the land write offered messages').toHaveLength(1);
    return { said, dropped, state };
  }

  it('T-AC-B1: RULE-B1 rows 1-6 with its examples', async () => {
    // Three that pass: all three sent, in order, each to its addressee or the table.
    const three = [msg('p1', 'Heiko, shall we share the river?'), msg('table', 'Good luck, all.'), msg('p2', "Mia, I'll vote for you.")];
    expect((await month1(three)).said).toEqual([
      { seat: 'p0', text: 'Heiko, shall we share the river?', to: 'p1' },
      { seat: 'p0', text: 'Good luck, all.' },
      { seat: 'p0', text: "Mia, I'll vote for you.", to: 'p2' },
    ]);

    // A fourth, past BRAIN.social.messagesPerMonth: dropped.
    const four = await month1([...three, msg('table', 'And one more thing.')]);
    expect(four.said).toHaveLength(BRAIN.social.messagesPerMonth);
    expect(four.dropped).toEqual(['month_cap']);

    // A whisper to a player who muted the AI: none; its table line is still sent.
    const muted = await month1([msg('p2', 'Mia, a word?'), msg('table', 'Fine weather.')], { muted: ['p2'] });
    expect(muted.said).toEqual([{ seat: 'p0', text: 'Fine weather.' }]);
    expect(muted.dropped).toEqual(['muted']);

    // A false declared price: dropped, with the cause a code.
    const { state } = await month1([]);
    const food = state.store.posted.food;
    const lie = await month1([msg('p1', `${GOOD_NAME.food} is at ${food + 50}.`, [{ price: 'food', value: food + 50 }]), msg('p1', 'Heiko, I bid high.')]);
    expect(lie.said.map((s) => s.text)).toEqual(['Heiko, I bid high.']);
    expect(lie.dropped).toEqual(['fact_mismatch']);

    // A bluff about its own vote declares no fact: sent.
    expect((await month1([msg('p1', "Heiko, I'll vote for you, promise.")])).said).toHaveLength(1);

    // More whispers to one player than BRAIN.social.whispersPerPlayerMonth: the rest dropped.
    const many = await month1(Array.from({ length: BRAIN.social.whispersPerPlayerMonth + 1 }, (_, i) => msg('p1', `Heiko, word ${['one', 'two', 'three'][i]}.`)));
    expect(many.said).toHaveLength(BRAIN.social.whispersPerPlayerMonth);
    expect(many.dropped).toEqual(['player_cap']);

    // Planning over: a reply that comes after the land grant started sends nothing.
    const late = await month1(three, { answerAtMs: 2_000, grantAtMs: 1_000 });
    expect(late.said).toEqual([]);
  }, GAME_MS);
});

/** Steps of the fake clock the table reads a waiting screen before every phone presses Ready. */
const READ_STEPS = 6;

/** A phone or the TV: every chat line the room sent it, with the month and phase the game was in. */
interface Screen {
  conn: Connection<MuleView>;
  from: { seatId: string | null };
  chat: (ChatMessage & { month: number; phase: string })[];
}

/** A real Room hosting MuleGame on `brain`: humans join in order (the first is host), a TV connects, the host adds AI seats and starts. */
function table(options: { humans: string[]; ais: number; brain?: MeteredBrain; maxMonths: number; recordPlaybook?: (note: PlaybookNote) => void; moderate?: (text: string) => string }) {
  let game: MuleGame | null = null;
  const room = new Room<MuleIntent, MuleView>({
    code: 'SOCIAL',
    createGame: (ctx: GameContext) => {
      game = new MuleGame(ctx, SEED, { maxMonths: options.maxMonths, phaseScale: 1, ...(options.brain ? { brain: options.brain } : {}), ...(options.recordPlaybook ? { recordPlaybook: options.recordPlaybook } : {}) });
      return game;
    },
    aiNames: AI_NAMES,
    isUserError: (err) => err instanceof RuleError || err instanceof TableError,
    ...(options.moderate ? { moderate: options.moderate } : {}),
  });
  const when = () => ({ month: game?.viewFor(null).month ?? 0, phase: game?.viewFor(null).phase ?? 'lobby' });
  const screen = (): Screen => {
    const s: Screen = { from: { seatId: null }, chat: [], conn: { send: (m: ServerEnvelope<MuleView>) => void (m.t === 'chat' && s.chat.push({ ...m.message, ...when() })) } };
    return s;
  };
  const send = (s: Screen, m: ClientEnvelope<MuleIntent>) => room.receive(s.conn, s.from, m);
  const phones = options.humans.map((name) => {
    const s = screen();
    send(s, { t: 'join', code: 'SOCIAL', name });
    return s;
  });
  const tv = screen();
  send(tv, { t: 'board', code: 'SOCIAL' });
  for (let i = 0; i < options.ais; i++) send(phones[0]!, { t: 'addAi' });
  const seats = room.viewFor(null).seats;
  send(phones[0]!, { t: 'start' });

  const state = () => (game as unknown as { state: GameState }).state;
  /** Every phone presses Ready where a phase waits for people: planning, the month end and a good's side pick. */
  let waited = 0;
  const pressReady = () => {
    const view = game!.viewFor(null);
    const waits = view.phase === 'planning' || view.phase === 'upkeep' || (view.phase === 'auction' && view.auction?.stage === 'status');
    waited = waits ? waited + 1 : 0;
    if (waited < READ_STEPS) return;
    for (const phone of phones) if (game!.viewFor(null).phase === view.phase) send(phone, { t: 'intent', intent: { type: 'ready' } });
  };
  /** Runs the fake clock until `done`, or game over; `each` runs every step. */
  const runUntil = async (done: () => boolean, each: () => void = () => {}) => {
    for (let t = 0; t < 60 * 60_000 && !done() && game!.viewFor(null).phase !== 'gameOver'; t += 500) {
      await vi.advanceTimersByTimeAsync(500);
      each();
      pressReady();
    }
  };
  const ids = (isAi: boolean) => seats.filter((s) => s.isAi === isAi).map((s) => s.id);
  return {
    room,
    game: () => game!,
    phones,
    tv,
    humans: ids(false),
    ais: ids(true),
    nameOf: (id: string) => seats.find((s) => s.id === id)!.name,
    state,
    say: (phone: Screen, text: string, to?: string) => send(phone, { t: 'chat', text, ...(to ? { to } : {}) }),
    runUntil,
    toGameOver: (each?: () => void) => runUntil(() => false, each),
    dispose: () => room.dispose(),
  };
}

/** Every chat line the screens received, once each, by its id. */
function delivered(screens: readonly Screen[]): (ChatMessage & { month: number; phase: string })[] {
  const byId = new Map<number, ChatMessage & { month: number; phase: string }>();
  for (const s of screens) for (const m of s.chat) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Marks every message the fake model writes, so the table's other lines are told apart. */
const SAID = 'Psst';

describe('B-AC-B1: the AIs reason about the table every month and message it (spec B C1-C4)', () => {
  /** Each month: a stance and a note on every other player; three whispers to the first, one to the next, one to the table. */
  const compose = (b: Brief): SocialReply => {
    const [first, second = first] = b.others;
    return {
      edits: b.others.flatMap((o) => [
        { path: `/strategy/stances/${o.id}`, to: 'neutral', reason: 'Too early to tell.' },
        { path: `/rivalReads/${o.id}`, to: [`${o.name} is one to watch`], reason: 'My read.' },
      ]),
      messages: [
        msg(first!.id, `${SAID}, ${first!.name}: a word?`),
        msg(first!.id, `${SAID}, ${first!.name}: think on it.`),
        msg(first!.id, `${SAID}, ${first!.name}: last time I ask.`),
        msg(second!.id, `${SAID}, ${second!.name}: and you?`),
        msg('table', `${SAID}: good luck, ${b.others.map((o) => o.name).join(' and ')}.`),
      ],
    };
  };

  it('B-AC-B1: one human and three Smart AIs on a fake model, a full game: each month every AI\'s recorded playbook has a stance and a note for every other player, and each AI sends at least 3 unprompted messages naming another player, never past the caps', async () => {
    const MONTHS = 3;
    const sdk = socialModel(compose);
    const notes: PlaybookNote[] = [];
    const t = table({ humans: ['Heiko'], ais: 3, brain: smartOn(sdk), maxMonths: MONTHS, recordPlaybook: (n) => notes.push(structuredClone(n)) });
    await t.toGameOver();
    expect(t.state().phase).toBe('gameOver');
    const everyone = [...t.humans, ...t.ais];

    for (const ai of t.ais) {
      const others = everyone.filter((p) => p !== ai);
      // The trap: the fake model was asked for the AI's social reasoning each month.
      const asked = sdk.requests.filter((r) => requestKind(r.params) === 'social' && briefOf(promptOf(r.params).user).name === t.nameOf(ai));
      expect(asked.map((r) => briefOf(promptOf(r.params).user).month), `${ai} asked each month`).toEqual(Array.from({ length: MONTHS }, (_, i) => i + 1));
      // Each month's recorded land playbook: a stance and a note on every other player, written by Claude.
      for (let month = 1; month <= MONTHS; month++) {
        const playbook = notes.find((n) => n.seat === ai && n.month === month && n.phase === 'landGrant')?.playbook as Playbook | undefined;
        expect(playbook?.by, `${ai}'s playbook for month ${month}`).toBe('llm');
        for (const p of others) {
          expect(playbook!.strategy.stances[p], `${ai}'s stance on ${p} in month ${month}`).toBe('neutral');
          expect(playbook!.rivalReads?.[p], `${ai}'s note on ${p} in month ${month}`).toEqual([`${t.nameOf(p)} is one to watch`]);
        }
      }
      // Its messages as the table received them: at least 3, each naming another player, within the month's caps.
      const sent = delivered([...t.phones, t.tv]).filter((m) => m.from === ai && m.text.startsWith(SAID));
      expect(sent.length, `${ai}'s messages`).toBeGreaterThanOrEqual(3);
      for (const m of sent) expect(others.some((p) => m.text.includes(t.nameOf(p))), m.text).toBe(true);
      for (let month = 1; month <= MONTHS; month++) {
        const inMonth = sent.filter((m) => m.month === month);
        expect(inMonth.length).toBeLessThanOrEqual(BRAIN.social.messagesPerMonth);
        for (const p of others) expect(inMonth.filter((m) => m.to === p).length).toBeLessThanOrEqual(BRAIN.social.whispersPerPlayerMonth);
      }
    }
    // A whisper reached only its two ends: the TV saw none of them.
    expect(t.tv.chat.filter((m) => m.to !== undefined)).toEqual([]);
    t.dispose();
  }, GAME_MS);

  it('B-AC-B1: with the key unset the game is today\'s: no social reasoning, no message, no stance or note recorded', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const notes: PlaybookNote[] = [];
    const t = table({ humans: ['Heiko'], ais: 3, maxMonths: 2, recordPlaybook: (n) => notes.push(structuredClone(n)) });
    await t.toGameOver();
    expect(t.state().phase).toBe('gameOver');
    expect(sdkModule.built).toEqual([]);
    expect(delivered([...t.phones, t.tv]).filter((m) => m.text.startsWith(SAID))).toEqual([]);
    for (const n of notes) {
      expect(n.playbook.rivalReads).toBeUndefined();
      expect((n.playbook.edits ?? []).filter((e) => e.path.startsWith('/strategy/stances/'))).toEqual([]);
    }
    t.dispose();
  }, GAME_MS);
});

describe('B-AC-B2: an AI asks the player who sells what its plan needs (spec B C1, C3, C4)', () => {
  /** The fake reads the brief as Claude would: short of Food, it whispers each other player whose plot makes Food. */
  const compose = (b: Brief): SocialReply => {
    const short = /^Food and Energy in units: Food — [^;]*: short by/m.test(b.user);
    const sellers = short ? b.others.filter((o) => new RegExp(`^${o.name}: .*${GOOD_NAME.food} MULE`, 'm').test(b.user)) : [];
    return {
      edits: sellers.map((o) => ({ path: `/rivalReads/${o.id}`, to: [`sells ${GOOD_NAME.food}, which I need`], reason: 'I am short.' })),
      messages: sellers.map((o) => msg(o.id, `${SAID}, ${o.name}: would you sell me ${GOOD_NAME.food} at the auction?`)),
    };
  };

  it('B-AC-B2: an AI whose strategy needs a good another player sells whispers that player a request naming the strategy item, and its recorded note names the same item', async () => {
    const sdk = socialModel(compose);
    const notes: PlaybookNote[] = [];
    const t = table({ humans: ['Heiko', 'Mia'], ais: 1, brain: smartOn(sdk), maxMonths: 2, recordPlaybook: (n) => notes.push(structuredClone(n)) });
    const [heiko, mia] = t.humans as [string, string];
    const [ai] = t.ais as [string];
    // From month 1's auction until its upkeep asks for month 2: Heiko's plot makes Food, and the AI has none.
    const arrange = () => {
      const state = t.state();
      if (state.month !== 1 || state.phase !== 'auction') return;
      const plot = state.tiles.find((p) => p.owner === heiko && p.outfit === 'food') ?? state.tiles.find((p) => p.owner === null && p.terrain !== 'store')!;
      Object.assign(plot, { owner: heiko, outfit: 'food' });
      state.players.find((p) => p.id === ai)!.stock.food = 0;
      const report = state.history.at(-1);
      if (report?.produced[ai]) report.produced[ai]!.food = 0;
    };
    await t.runUntil(() => t.state().month === 2 && t.state().phase === 'development', arrange);
    const month2 = sdk.requests.map((r) => briefOf(promptOf(r.params).user)).find((b) => b.month === 2 && b.name === t.nameOf(ai));
    expect(month2?.user, 'the precondition: the AI is short of Food at month 2, and Heiko owns a Food plot').toMatch(/short by/);

    const whispers = delivered(t.phones).filter((m) => m.from === ai && m.month === 2 && m.text.startsWith(SAID));
    expect(whispers).toHaveLength(1);
    expect(whispers[0]).toMatchObject({ to: heiko });
    expect(whispers[0]!.text).toContain(GOOD_NAME.food);
    const note = notes.find((n) => n.seat === ai && n.month === 2 && n.phase === 'landGrant')!.playbook.rivalReads?.[heiko];
    expect(note?.join(' ')).toContain(GOOD_NAME.food);
    // A player it needs nothing from: no request, no note.
    expect(delivered(t.phones).filter((m) => m.from === ai && m.to === mia)).toEqual([]);
    expect(notes.find((n) => n.seat === ai && n.month === 2 && n.phase === 'landGrant')!.playbook.rivalReads?.[mia]).toBeUndefined();
    t.dispose();
  }, GAME_MS);
});

describe('B-AC-B5: AIs hear each other (spec B C5)', () => {
  const MARK = 'MARK-ai-whisper';
  const HUMANS_MARK = 'MARK-between-humans';

  it("B-AC-B5: AI 1's whisper to AI 2 is quoted in AI 2's next monthly brief; a whisper between two humans never reaches either AI", async () => {
    // The room names its AI seats in AI_NAMES' order: AI 1 is the first, AI 2 the second.
    const [one, two] = AI_NAMES as [string, string];
    const sdk = socialModel((b) => {
      const aiTwo = b.others.find((o) => o.name === two);
      return { messages: b.name === one && aiTwo && b.month === 1 ? [msg(aiTwo.id, `${MARK}: back me at the vote?`)] : [] };
    });
    const t = table({ humans: ['Heiko', 'Mia'], ais: 2, brain: smartOn(sdk), maxMonths: 2 });
    const ais = t.ais;
    expect(ais.map(t.nameOf)).toEqual([one, two]);
    const [heiko, mia] = t.humans as [string, string];
    await t.runUntil(() => t.state().phase === 'development', () => {
      if (t.state().phase === 'landGrant') t.say(t.phones[0]!, `${HUMANS_MARK}, just us`, mia);
    });
    await t.runUntil(() => t.state().month === 2 && t.state().phase === 'landGrant');

    const briefs = sdk.requests.filter((r) => requestKind(r.params) === 'social').map((r) => briefOf(promptOf(r.params).user));
    const aiTwoMonth2 = briefs.find((b) => b.month === 2 && b.name === t.nameOf(ais[1]!));
    expect(aiTwoMonth2?.user).toContain(`${t.nameOf(ais[0]!)} (whispered to you): "${MARK}: back me at the vote?"`);
    // AI 1 never quotes its own whisper, and no prompt ever holds the humans' whisper.
    expect(briefs.find((b) => b.month === 2 && b.name === t.nameOf(ais[0]!))?.user).not.toContain(MARK);
    for (const r of sdk.requests) expect(promptOf(r.params).user).not.toContain(HUMANS_MARK);
    // The humans' whisper reached Mia, so it was said; and AI 1's whisper reached no human phone.
    expect(delivered(t.phones).some((m) => m.from === heiko && m.text.startsWith(HUMANS_MARK))).toBe(true);
    expect(delivered(t.phones).filter((m) => m.text.startsWith(MARK))).toEqual([]);
    t.dispose();
  }, GAME_MS);

  it('B-AC-B5: an AI hears another AI\'s line exactly as the table received it, trimmed, capped and moderated; a line moderation drops reaches no AI', async () => {
    const [one, two] = AI_NAMES as [string, string];
    const MODERATED = 'MARK-moderated';
    // The family filter as the room is given it: one word starred out, a line with another word dropped whole.
    const moderate = (text: string) => (text.includes('DROPME') ? '' : text.replace(/GOSH/g, '****'));
    const sdk = socialModel((b) => {
      const aiTwo = b.others.find((o) => o.name === two);
      return { messages: b.name === one && aiTwo && b.month === 1 ? [msg(aiTwo.id, `${MODERATED} GOSH, back me?`), msg(aiTwo.id, `${MODERATED} DROPME now`)] : [] };
    });
    const t = table({ humans: ['Heiko'], ais: 2, brain: smartOn(sdk), maxMonths: 2, moderate });
    const [aiOne, aiTwo] = t.ais as [string, string];
    await t.runUntil(() => t.state().phase === 'development');
    const inside = t.game() as unknown as { ai: Map<string, AiSeat>; playbooks: { options: { say: (seat: string, text: string, to?: string) => void } } };
    const heard = () => inside.ai.get(aiTwo)!.brain.heard();
    expect(heard()).toContainEqual({ from: one, text: `${MODERATED} ****, back me?`, to: 'me' });
    expect(heard().some((l) => l.text.includes('GOSH') || l.text.includes('DROPME'))).toBe(false);

    // A table line longer than the room's cap, padded with spaces: AI 2 hears what the TV received, no more.
    const long = `   ${MODERATED}-long ${'word '.repeat(120)}   `;
    inside.playbooks.options.say(aiOne, long);
    const onTv = t.tv.chat.find((m) => m.from === aiOne && m.text.includes(`${MODERATED}-long`))!;
    expect(onTv.text.length).toBeLessThan(long.length);
    expect(heard().at(-1)).toEqual({ from: one, text: onTv.text });
    t.dispose();
  }, GAME_MS);
});
