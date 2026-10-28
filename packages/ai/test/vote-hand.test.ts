import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  advancePhase,
  canRun,
  castVote,
  createGame,
  createRng,
  electionDone,
  POLITICS,
  RuleError,
  runFor,
  setSalesTax,
  stepElection,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type Election,
  type GameState,
  type Office,
  type Rng,
  type TaxPromise,
} from '@mule/engine';
import type { Act, AiAction } from '../src/actions.js';
import { nextTax, VoteHand } from '../src/hands/vote.js';
import type { Mind } from '../src/value.js';

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const PERSONAS: AiPersonaId[] = ['trader', 'cautious', 'aggressive', 'saboteur'];
/** Longer than any seat's seeded pause before it acts in announce or the ballot. */
const PAUSE_MS = POLITICS.ai.actMs[1] + WALK.tickMs;
/** RULE-10: a Governor run carries a promise; tests about something else hold the tax. */
const HOLD: TaxPromise = { kind: 'hold' };

function newGame(seed = 7): GameState {
  return createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
}

function mindOf(me: string, persona: AiPersonaId, level: AiLevelId = 'trader'): Mind {
  return { me, personaId: persona, persona: AI_PERSONAS[persona], levelId: level, level: AI_LEVELS[level] };
}

/** Seeded as its caller seeds it: the seat seed XOR 0x165667b1. */
function handOf(mind: Mind, seatSeed: number): VoteHand {
  return new VoteHand(mind, createRng((seatSeed ^ 0x165667b1) >>> 0));
}

/** The classic table: one seat per persona, all at one non-rookie level. */
function classicHands(gameSeed: number, level: AiLevelId = 'trader'): VoteHand[] {
  return SEATS.map((id, i) => handOf(mindOf(id, PERSONAS[i]!, level), gameSeed * 10 + i));
}

/** Each AiAction through the engine call a phone's intent reaches, as play.ts and the server map it; false on a RuleError. */
function engineAct(state: GameState, id: string, refused: AiAction[], sent: AiAction[] = []): Act {
  return (action) => {
    sent.push(action);
    try {
      switch (action.type) {
        case 'run':
          runFor(state, id, action.office, action.promise);
          break;
        case 'vote':
          castVote(state, id, action.office, action.candidate);
          break;
        case 'setTax':
          setSalesTax(state, id, action.percent);
          break;
        case 'done':
          electionDone(state, id, action.done);
          break;
        default:
          throw new Error(`VoteHand sent a non-politics move: ${action.type}`);
      }
      return true;
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      refused.push(action);
      return false;
    }
  };
}

function electionOf(state: GameState): Election {
  expect(state.politics?.election).toBeTruthy();
  return state.politics!.election!;
}

interface StageEnd {
  stage: Election['stage'];
  everyoneDone: boolean;
  /** Game time the stage ran, the step that ended it included. */
  msIn: number;
  ballots: Election['ballots'];
  /** Who ran: Politics' candidacy in announce, the election's after. */
  candidates: Election['candidates'];
  promises: Election['promises'];
}

/** Ticks the hands and the election on the server's tick until the election is over. */
function playElection(state: GameState, hands: VoteHand[]) {
  const refused: AiAction[] = [];
  const ends: StageEnd[] = [];
  let msIn = 0;
  for (let t = 0; t < 120_000 && electionOf(state).stage !== 'over'; t += WALK.tickMs) {
    for (const h of hands) h.tick(state, WALK.tickMs, engineAct(state, h.mind.me, refused));
    const before = electionOf(state);
    const running = before.stage === 'announce' ? state.politics! : before;
    msIn += WALK.tickMs;
    const end: StageEnd = {
      stage: before.stage,
      everyoneDone: SEATS.every((id) => before.done.includes(id)),
      msIn,
      ballots: structuredClone(before.ballots),
      candidates: structuredClone(running.candidates),
      promises: structuredClone(running.promises),
    };
    stepElection(state, WALK.tickMs);
    if (electionOf(state).stage !== end.stage) {
      ends.push(end);
      msIn = 0;
    }
  }
  return { refused, ends };
}

/** Everyone Done through announce and the ballot, then the ceremony to its end. */
function finishElection(state: GameState): void {
  for (let i = 0; i < 100 && electionOf(state).stage !== 'over'; i++) {
    for (const id of state.players.map((p) => p.id)) electionDone(state, id);
    stepElection(state, electionOf(state).ceremony?.clockMs ?? 0);
  }
  expect(electionOf(state).stage).toBe('over');
}

function contestedOffices(candidates: Election['candidates']): Office[] {
  return (['governor', 'sheriff'] as const).filter((o) => candidates[o].length > 1);
}

/** Gives each player exactly this many plots. */
function givePlots(state: GameState, plots: Record<string, number>): void {
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  for (const [id, n] of Object.entries(plots)) for (let i = 0; i < n; i++) free.shift()!.owner = id;
}

/** Month 1 in the ballot stage with these candidates and plot counts. */
function ballotWith(candidates: Partial<Record<Office, string[]>>, plots: Record<string, number>, seed = 7): GameState {
  const state = newGame(seed);
  givePlots(state, plots);
  for (const [office, ids] of Object.entries(candidates) as [Office, string[]][]) for (const id of ids) runFor(state, id, office, office === 'governor' ? HOLD : undefined);
  for (const id of SEATS) electionDone(state, id);
  stepElection(state, 0);
  expect(electionOf(state).stage).toBe('ballot');
  return state;
}

/** Ticks one seat's hand through the ballot stage's opening, nobody else acting. */
function tickAlone(state: GameState, hand: VoteHand): { refused: AiAction[]; sent: AiAction[] } {
  const refused: AiAction[] = [];
  const sent: AiAction[] = [];
  for (let t = 0; t < PAUSE_MS; t += WALK.tickMs) hand.tick(state, WALK.tickMs, engineAct(state, hand.mind.me, refused, sent));
  return { refused, sent };
}

afterEach(() => vi.unstubAllEnvs());

/** The Sheriff path: each test of the calling block runs with both offices elected, and the config's list comes back after it. */
function bothOffices(): void {
  let saved: Office[];
  beforeEach(() => {
    saved = POLITICS.offices;
    POLITICS.offices = ['governor', 'sheriff'];
  });
  afterEach(() => {
    POLITICS.offices = saved;
  });
}

describe('VoteHand on a Classic table', () => {
  bothOffices();

  it('T-AC-6, T-AC-63: on an AI-only table every Classic seat acts and presses Done in announce and the ballot within its longest pause, with no API key, so the election ends with no clock', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    let ballotStages = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = newGame(seed);
      const { refused, ends } = playElection(state, classicHands(seed));

      expect(refused).toEqual([]);
      expect(electionOf(state).stage).toBe('over');
      expect(state.politics!.governor).not.toBeNull();
      const voting = ends.filter((e) => e.stage === 'announce' || e.stage === 'ballot');
      expect(voting[0]?.stage).toBe('announce');
      for (const end of voting) {
        expect(end.everyoneDone).toBe(true);
        expect(end.msIn).toBeLessThanOrEqual(PAUSE_MS);
      }
      const ballot = voting.find((e) => e.stage === 'ballot');
      if (!ballot) continue;
      ballotStages++;
      for (const office of contestedOffices(ballot.candidates))
        for (const id of SEATS) expect(ballot.candidates[office]).toContain(ballot.ballots[id]?.[office]);
    }
    expect(ballotStages).toBeGreaterThan(0);
  });

  it.each([
    { persona: 'aggressive' as const, fund: 1_000, month1: 8, month2: 5 },
    { persona: 'cautious' as const, fund: 1_000, month1: 4, month2: 4 },
    { persona: 'trader' as const, fund: 1_000, month1: null, month2: 5 },
    // AM-9: in month 1 the fund is empty because nothing is collected yet, not low, so no bump: the trader holds 5%.
    { persona: 'trader' as const, fund: 0, month1: null, month2: 5 },
    { persona: 'saboteur' as const, fund: 0, month1: 10, month2: 5 },
  ])('T-AC-6: an AI Governor sets a tax inside RULE-6 ($persona, fund $fund → $month1, then $month2)', ({ persona, fund, month1, month2 }) => {
    const state = newGame();
    runFor(state, 'ai2', 'governor', HOLD);
    finishElection(state);
    expect(state.politics!.governor).toBe('ai2');
    const hands = SEATS.map((id, i) => handOf(mindOf(id, id === 'ai2' ? persona : PERSONAS[i]!), i));
    const refused: AiAction[] = [];
    const sent = new Map(SEATS.map((id) => [id, [] as AiAction[]]));
    const plan = () => {
      state.treasury.money = fund;
      for (let t = 0; t < PAUSE_MS; t += WALK.tickMs)
        for (const h of hands) h.tick(state, WALK.tickMs, engineAct(state, h.mind.me, refused, sent.get(h.mind.me)));
    };
    const rate = () => Math.round(state.treasury.salesTax * 100);

    // Month 1 opened at 5%: RULE-6 allows 0..10.
    plan();
    expect(rate()).toBe(month1 ?? 5);
    // Month 2 has no election and opens at 0%: RULE-6 allows 0..5.
    state.treasury.salesTax = 0;
    while (state.phase !== 'planning' || state.month !== 2) advancePhase(state);
    plan();
    expect(rate()).toBe(month2);

    expect(refused).toEqual([]);
    // Once per planning, only to change the rate, and nobody else touches it.
    const percents = month1 === null ? [month2] : [month1, month2];
    expect(sent.get('ai2')).toEqual(percents.map((percent) => ({ type: 'setTax', percent })));
    for (const id of ['ai0', 'ai1', 'ai3']) expect(sent.get(id)).toEqual([]);
  });
});

/** An Rng that hands out the given draws to next() and chance(), and always the shortest pause. */
function drawsOf(draws: number[]): Rng {
  const next = () => {
    const draw = draws.shift();
    if (draw === undefined) throw new Error('VoteHand drew more than the test arranged');
    return draw;
  };
  return { ...createRng(1), next, chance: (p: number) => next() < p, int: (min: number) => min };
}

/** One announce tick that covers the longest pause: the moves the seat sends. */
function announce(state: GameState, mind: Mind, rng: Rng): AiAction[] {
  const sent: AiAction[] = [];
  const refused: AiAction[] = [];
  new VoteHand(mind, rng).tick(state, POLITICS.ai.actMs[1], engineAct(state, mind.me, refused, sent));
  expect(refused).toEqual([]);
  return sent;
}

describe('RULE-8: who runs', () => {
  bothOffices();

  const { runGovernor, runSheriff } = POLITICS.ai;
  const g = runGovernor.aggressive;
  const sh = runSheriff.aggressive;
  it.each([
    { name: 'draw under the Governor chance', draws: [g - 0.01], want: [{ type: 'run', office: 'governor', promise: { kind: 'cap', percent: 8 } }] },
    { name: 'draw at the Governor chance, under the Sheriff one', draws: [g, sh - 0.01], want: [{ type: 'run', office: 'sheriff' }] },
    { name: 'draws at both chances', draws: [g, sh], want: [] },
    { name: 'draws over both chances', draws: [g + 0.01, sh + 0.01], want: [] },
  ])("T-AC-63 row 2, RULE-8: in month 1 a seat decides at the last call: it runs for Governor, else Sheriff, by its persona's seeded chances ($name), then is Done", ({ draws, want }) => {
    const sent = announce(newGame(), mindOf('ai2', 'aggressive'), drawsOf([...draws]));

    expect(sent).toEqual([...want, { type: 'done', done: true }]);
  });

  it('RULE-8: a term-limited seat never runs for Governor', () => {
    const state = newGame();
    for (let term = 0; term < POLITICS.maxGovernorTermsInRow; term++) {
      runFor(state, 'ai2', 'governor', HOLD);
      finishElection(state);
      const next = POLITICS.electionMonths.find((m) => m > state.month)!;
      while (state.phase !== 'planning' || state.month !== next) advancePhase(state);
    }
    expect(canRun(state, 'ai2').governor).toBe('termLimit');

    const sent = announce(state, mindOf('ai2', 'aggressive'), drawsOf([0, 0]));

    expect(sent).toEqual([
      { type: 'run', office: 'sheriff' },
      { type: 'done', done: true },
    ]);
  });

  it('RULE-8: after planning ends (AM-1) the hand sends nothing in any later phase', () => {
    const state = newGame();
    const hands = classicHands(1);
    const sent: AiAction[] = [];
    const refused: AiAction[] = [];
    for (const h of hands) h.tick(state, WALK.tickMs, engineAct(state, h.mind.me, refused, sent));
    // Planning ends inside every seat's pause: the election closes at once.
    advancePhase(state);
    expect(electionOf(state).stage).toBe('over');
    while (state.phase !== 'planning') {
      for (const h of hands) h.tick(state, 60_000, engineAct(state, h.mind.me, refused, sent));
      advancePhase(state);
    }

    expect(sent).toEqual([]);
  });
});

describe('RULE-63: a seat declares ahead of the election', () => {
  bothOffices();

  /** Plays on, nobody acting, to the planning phase of `month`; ai0 is the richest, so the appointed Governor. */
  function toMonth(state: GameState, month: number): void {
    state.players.find((p) => p.id === 'ai0')!.money += 1_000;
    while (state.phase !== 'planning' || state.month !== month) advancePhase(state);
  }

  /** One tick that covers the longest pause: what the seat sends. */
  function planTick(state: GameState, hand: VoteHand): AiAction[] {
    const sent: AiAction[] = [];
    const refused: AiAction[] = [];
    hand.tick(state, PAUSE_MS, engineAct(state, hand.mind.me, refused, sent));
    expect(refused).toEqual([]);
    return sent;
  }

  const { runGovernor, runSheriff } = POLITICS.ai;
  it.each([
    { name: 'it runs for Governor', draws: [0], run: [{ type: 'run', office: 'governor', promise: { kind: 'cap', percent: 8 } }], running: ['ai2'] },
    { name: 'it stays out', draws: [runGovernor.aggressive, runSheriff.aggressive], run: [], running: [] },
  ])('T-AC-63 rows 1, 2: a seat decides once per cycle, in the first planning phase POLITICS.ai.declareLeadMonths or fewer months before the election, and at the last call only presses Done ($name)', ({ draws, run, running }) => {
    const state = newGame();
    const hand = new VoteHand(mindOf('ai2', 'aggressive'), drawsOf([...draws]));
    const declareIn = Math.max(2, 4 - POLITICS.ai.declareLeadMonths);
    for (let month = 2; month < 4; month++) {
      toMonth(state, month);
      // Twice a month: the second tick draws nothing, or drawsOf throws.
      expect([...planTick(state, hand), ...planTick(state, hand)], `month ${month}`).toEqual(month === declareIn ? run : []);
    }
    toMonth(state, 4);
    expect(electionOf(state).stage).toBe('announce');

    expect(planTick(state, hand)).toEqual([{ type: 'done', done: true }]);
    expect(state.politics!.candidates.governor).toEqual(running);
  });

  it('T-AC-63 row 3: a seat that declared for Governor ahead refreshes its promise against the tax at the last call, keeping its place in the list, then is Done', () => {
    const state = newGame();
    const hand = new VoteHand(mindOf('ai2', 'aggressive'), drawsOf([0]));
    toMonth(state, 4 - POLITICS.ai.declareLeadMonths);
    runFor(state, 'ai1', 'governor', HOLD);
    expect(planTick(state, hand)).toEqual([{ type: 'run', office: 'governor', promise: { kind: 'cap', percent: 8 } }]);
    toMonth(state, 4);
    // The tax reached the aggressive target, 8%, since the seat declared: its cap becomes a hold.
    state.treasury.salesTax = 0.08;

    expect(planTick(state, hand)).toEqual([
      { type: 'run', office: 'governor', promise: { kind: 'hold' } },
      { type: 'done', done: true },
    ]);
    expect(state.politics).toMatchObject({ candidates: { governor: ['ai1', 'ai2'] }, promises: { ai1: HOLD, ai2: { kind: 'hold' } } });
  });
});

describe("RULE-8, RULE-10: an AI Governor candidate's promise (C12)", () => {
  bothOffices();

  // RULE-10's AI row: persona target T against the tax at the last call C. Month 1 opens at 5%.
  it.each([
    { persona: 'aggressive' as const, tax: 5, want: { kind: 'cap', percent: 8 } },
    { persona: 'saboteur' as const, tax: 5, want: { kind: 'cap', percent: 10 } },
    { persona: 'trader' as const, tax: 5, want: { kind: 'hold' } },
    { persona: 'cautious' as const, tax: 5, want: { kind: 'lower' } },
    { persona: 'aggressive' as const, tax: 8, want: { kind: 'hold' } },
    { persona: 'trader' as const, tax: 8, want: { kind: 'lower' } },
    { persona: 'cautious' as const, tax: 0, want: { kind: 'cap', percent: 4 } },
  ])('T-AC-9: running for Governor, a $persona seat at a $tax percent tax promises by its target and is never refused', ({ persona, tax, want }) => {
    const state = newGame();
    state.treasury.salesTax = tax / 100;
    state.politics!.taxAtStart = tax / 100;

    // One draw under every Governor chance: it runs for Governor, and draws nothing more for its promise.
    const sent = announce(state, mindOf('ai2', persona), drawsOf([0]));

    expect(sent).toEqual([{ type: 'run', office: 'governor', promise: want }, { type: 'done', done: true }]);
    expect(state.politics!.candidates.governor).toEqual(['ai2']);
    expect(state.politics!.promises).toEqual({ ai2: want });
  });

  it('T-AC-9: running for Sheriff, a seat makes no promise', () => {
    const state = newGame();
    const { runGovernor } = POLITICS.ai;

    const sent = announce(state, mindOf('ai2', 'saboteur'), drawsOf([runGovernor.saboteur, 0]));

    expect(sent).toEqual([{ type: 'run', office: 'sheriff' }, { type: 'done', done: true }]);
    expect(state.politics!.candidates.sheriff).toEqual(['ai2']);
    expect(state.politics!.promises).toEqual({});
  });

  it('T-AC-9: on a seeded Classic table every Governor candidate holds a promise and no run is refused', () => {
    let governorRuns = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = newGame(seed);
      const { refused, ends } = playElection(state, classicHands(seed));
      const nominated = ends.find((e) => e.stage === 'announce')!;

      expect(refused).toEqual([]);
      expect(Object.keys(nominated.promises).sort()).toEqual([...nominated.candidates.governor].sort());
      governorRuns += nominated.candidates.governor.length;
    }
    expect(governorRuns).toBeGreaterThan(0);
  });
});

describe('RULE-8: how a seat votes', () => {
  bothOffices();

  it.each([
    { name: 'fewest plots', candidates: { governor: ['ai1', 'ai2', 'ai3'] }, plots: { ai1: 3, ai2: 1, ai3: 2 }, want: 'ai2' },
  ])('T-AC-63 row 4, RULE-8: in the ballot a non-candidate waits its seeded pause, votes for the candidate with the fewest plots ($name), then is Done', ({ candidates, plots, want }) => {
    const state = ballotWith(candidates, plots);
    const hand = handOf(mindOf('ai0', 'trader'), 11);
    const refused: AiAction[] = [];
    const sent: AiAction[] = [];
    const act = engineAct(state, 'ai0', refused, sent);

    let t = 0;
    for (; t + WALK.tickMs < POLITICS.ai.actMs[0]; t += WALK.tickMs) hand.tick(state, WALK.tickMs, act);
    expect(sent).toEqual([]);
    for (; t < PAUSE_MS; t += WALK.tickMs) hand.tick(state, WALK.tickMs, act);

    expect(refused).toEqual([]);
    expect(sent).toEqual([
      { type: 'vote', office: 'governor', candidate: want },
      { type: 'done', done: true },
    ]);
    expect(electionOf(state).ballots.ai0).toEqual({ governor: want });
    expect(electionOf(state).done).toContain('ai0');
  });

  // AM-10: was "tie → lower seat", which in month 1 (nobody owns land) handed every vote to the lowest seat.
  it.each([
    { name: 'two tied, one with more', candidates: { governor: ['ai3', 'ai2', 'ai1'] }, plots: { ai1: 3, ai2: 1, ai3: 1 }, tied: ['ai2', 'ai3'] },
    { name: 'month 1, nobody owns land', candidates: { governor: ['ai1', 'ai2', 'ai3'] }, plots: {} as Record<string, number>, tied: ['ai1', 'ai2', 'ai3'] },
  ])('RULE-8 (AM-10): a tie on fewest plots is broken by a seeded draw among the tied, not by seat ($name)', ({ candidates, plots, tied }) => {
    const picks = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const state = ballotWith(candidates, plots);
      const { refused } = tickAlone(state, handOf(mindOf('ai0', 'trader'), seed));

      expect(refused).toEqual([]);
      const pick = electionOf(state).ballots.ai0?.governor;
      expect(tied).toContain(pick);
      picks.add(pick!);
    }
    expect([...picks].sort()).toEqual(tied);
  });

  it.each([
    { level: 'trader' as const, candidates: { governor: ['ai1', 'ai2'], sheriff: ['ai0', 'ai3'] }, want: { governor: 'ai1', sheriff: 'ai3' } },
    // AM-7: a Rookie candidate votes for itself too; only a Rookie that does not run guesses.
    { level: 'rookie' as const, candidates: { governor: ['ai1', 'ai2'] }, want: { governor: 'ai1' } },
  ])('RULE-8: a candidate votes for itself ($level)', ({ level, candidates, want }) => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = ballotWith(candidates, { ai0: 6, ai1: 5, ai2: 0, ai3: 1 });
      const hand = handOf(mindOf('ai1', 'cautious', level), seed);
      const refused: AiAction[] = [];
      const sent: AiAction[] = [];

      // One late tick that covers the longest pause acts at once.
      hand.tick(state, POLITICS.ai.actMs[1], engineAct(state, 'ai1', refused, sent));

      expect(refused).toEqual([]);
      expect(electionOf(state).ballots.ai1).toEqual(want);
      expect(sent.at(-1)).toEqual({ type: 'done', done: true });
    }
  });

  it('RULE-8: Rookie votes for some candidate and is never refused', () => {
    const candidates = ['ai1', 'ai2', 'ai3'];
    const picks = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const state = ballotWith({ governor: candidates }, { ai1: 0, ai2: 2, ai3: 4 });
      const hand = handOf(mindOf('ai0', 'trader', 'rookie'), seed);

      const { refused } = tickAlone(state, hand);

      expect(refused).toEqual([]);
      const pick = electionOf(state).ballots.ai0?.governor;
      expect(candidates).toContain(pick);
      picks.add(pick!);
    }
    // Seeded random, not the fewest-plots rule: over twelve seats it does not always pick ai1.
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('RULE-8: the Governor steps the tax', () => {
  // Fund is low under 3 months of both offices' pay: 3 × (50 + 30) = 240, from month 2 (AM-9: the fund starts empty, before any payday).
  it.each([
    { month: 2, current: 5, target: 8, fund: 1_000, low: 0, high: 10, want: 8 },
    { month: 2, current: 5, target: 4, fund: 1_000, low: 0, high: 10, want: 4 },
    { month: 2, current: 0, target: 10, fund: 1_000, low: 0, high: 15, want: 5 },
    { month: 2, current: 12, target: 4, fund: 1_000, low: 0, high: 15, want: 7 },
    { month: 2, current: 5, target: 5, fund: 239, low: 0, high: 10, want: 7 },
    { month: 2, current: 5, target: 5, fund: 240, low: 0, high: 10, want: 5 },
    { month: 2, current: 10, target: 10, fund: 0, low: 5, high: 10, want: 10 },
    { month: 2, current: 8, target: 2, fund: 1_000, low: 5, high: 13, want: 5 },
    { month: 1, current: 5, target: 5, fund: 0, low: 0, high: 10, want: 5 },
    { month: 1, current: 5, target: 8, fund: 239, low: 0, high: 10, want: 8 },
  ])(
    'RULE-8 (AM-9): the tax steps toward the persona target by at most maxStep, +taxFundBump when the fund is low after the first payday, clamped to the bounds (month $month, $current → $target, fund $fund, bounds $low to $high)',
    ({ month, current, target, fund, low, high, want }) => {
      expect(nextTax(current, target, fund, { low, high }, month)).toBe(want);
    },
  );
});

const HUMANS = ['h1', 'h2', 'h3'];

/**
 * One election with ai0 and three humans: h1 and h2 run for Governor, h3 for
 * Sheriff, and at the ballot's opening the humans vote for `pick`. Returns
 * the moves ai0's hand sent and who became Governor.
 */
function electionWithHumans(hand: Pick<VoteHand, 'tick'>, pick: string): { sent: AiAction[]; governor: string | null } {
  const state = createGame({ seed: 7, players: ['ai0', ...HUMANS].map((id) => ({ id, name: id, isAi: id === 'ai0' })) });
  runFor(state, 'h1', 'governor', HOLD);
  runFor(state, 'h2', 'governor', HOLD);
  runFor(state, 'h3', 'sheriff');
  const sent: AiAction[] = [];
  const act = engineAct(state, 'ai0', [], sent);
  for (let t = 0; t < 120_000 && electionOf(state).stage !== 'over'; t += WALK.tickMs) {
    const stage = electionOf(state).stage;
    if ((stage === 'announce' || stage === 'ballot') && !electionOf(state).done.includes('h1')) {
      if (stage === 'ballot') for (const h of HUMANS) castVote(state, h, 'governor', pick);
      for (const h of HUMANS) electionDone(state, h);
    }
    hand.tick(state, WALK.tickMs, act);
    stepElection(state, WALK.tickMs);
  }
  return { sent, governor: state.politics!.governor };
}

/** A stand-in that cheats: it reads every ballot from the raw game, past observe(), and votes with the majority. */
const bandwagon: Pick<VoteHand, 'tick'> = {
  tick(state, _dt, act) {
    const election = state.politics?.election;
    if (!election || election.done.includes('ai0')) return;
    if (election.stage === 'announce') return void act({ type: 'done', done: true });
    if (election.stage !== 'ballot') return;
    const votes = Object.values(election.ballots).map((b) => b.governor);
    const leader = election.candidates.governor.reduce((a, b) => (votes.filter((v) => v === b).length > votes.filter((v) => v === a).length ? b : a));
    act({ type: 'vote', office: 'governor', candidate: leader });
    act({ type: 'done', done: true });
  },
};

describe('HC-4: secret ballots', () => {
  bothOffices();

  it("HC-4: the hand never reads another seat's ballot", () => {
    // Positive control: the humans' ballots decide the race, and a hand that reads them moves with them.
    expect(electionWithHumans(bandwagon, 'h1')).toMatchObject({ governor: 'h1' });
    expect(electionWithHumans(bandwagon, 'h2')).toMatchObject({ governor: 'h2' });
    expect(electionWithHumans(bandwagon, 'h1').sent).not.toEqual(electionWithHumans(bandwagon, 'h2').sent);

    let votedForAnother = 0;
    for (const persona of PERSONAS)
      for (const seed of [1, 2, 3, 4]) {
        const mind = mindOf('ai0', persona);
        const one = electionWithHumans(handOf(mind, seed), 'h1').sent;
        const other = electionWithHumans(handOf(mind, seed), 'h2').sent;

        expect(other).toEqual(one);
        if (one.some((a) => a.type === 'vote' && a.candidate !== 'ai0')) votedForAnother++;
      }
    // The comparison bites only where the hand votes for someone else.
    expect(votedForAnother).toBeGreaterThan(0);
  });
});

describe('T-AC-62: Governor only, the default POLITICS.offices', () => {
  it('T-AC-62: by default a seat never runs for Sheriff: a draw that misses the Governor chance draws no Sheriff chance, and the seat only presses Done', () => {
    expect(POLITICS.offices).toEqual(['governor']);
    const draws = [POLITICS.ai.runGovernor.aggressive, 0];

    const sent = announce(newGame(), mindOf('ai2', 'aggressive'), drawsOf(draws));

    expect(sent).toEqual([{ type: 'done', done: true }]);
    expect(draws, 'the Sheriff draw is left unused').toEqual([0]);
  });
});
