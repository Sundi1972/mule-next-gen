import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  castVote,
  createGame,
  createRng,
  electionDone,
  observe,
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
} from '@mule/engine';
import type { Act, AiAction } from '../src/actions.js';
import { nextTax, VoteHand } from '../src/hands/vote.js';
import type { Mind } from '../src/value.js';

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const PERSONAS: AiPersonaId[] = ['trader', 'cautious', 'aggressive', 'saboteur'];
/** Longer than any seat's seeded pause before it acts in a stage. */
const PAUSE_MS = POLITICS.ai.actMs[1] + WALK.tickMs;

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
          runFor(state, id, action.office);
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
  msLeft: number;
  ballots: Election['ballots'];
  candidates: Election['candidates'];
}

/** Ticks the hands and the election on the server's tick until the election is over. `view` is what a hand is handed. */
function playElection(state: GameState, hands: VoteHand[], view: (state: GameState, me: string) => GameState = (s) => s) {
  const refused: AiAction[] = [];
  const ends: StageEnd[] = [];
  for (let t = 0; t < 120_000 && electionOf(state).stage !== 'over'; t += WALK.tickMs) {
    for (const h of hands) h.tick(view(state, h.mind.me), WALK.tickMs, engineAct(state, h.mind.me, refused));
    const before = electionOf(state);
    const end: StageEnd = {
      stage: before.stage,
      everyoneDone: SEATS.every((id) => before.done.includes(id)),
      msLeft: before.clockMs - WALK.tickMs,
      ballots: structuredClone(before.ballots),
      candidates: structuredClone(before.candidates),
    };
    stepElection(state, WALK.tickMs);
    if (electionOf(state).stage !== end.stage) ends.push(end);
  }
  return { refused, ends };
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
  for (const [office, ids] of Object.entries(candidates) as [Office, string[]][]) for (const id of ids) runFor(state, id, office);
  stepElection(state, electionOf(state).clockMs);
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

describe('VoteHand on a Classic table', () => {
  it("T-AC-6: every Classic seat acts and presses Done within each stage's clock with no API key", () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    let ballotStages = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = newGame(seed);
      const { refused, ends } = playElection(state, classicHands(seed));

      expect(refused).toEqual([]);
      expect(electionOf(state).stage).toBe('over');
      expect(state.politics!.governor).not.toBeNull();
      const voting = ends.filter((e) => e.stage === 'nominate' || e.stage === 'ballot');
      expect(voting[0]?.stage).toBe('nominate');
      for (const end of voting) {
        expect(end.everyoneDone).toBe(true);
        expect(end.msLeft).toBeGreaterThan(0);
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
    { persona: 'aggressive' as const, percent: 8 },
    { persona: 'cautious' as const, percent: 4 },
    { persona: 'trader' as const, percent: 5 },
  ])('T-AC-6: an AI Governor sets a tax inside RULE-6 ($persona → $percent%)', ({ persona, percent }) => {
    const state = newGame();
    runFor(state, 'ai2', 'governor');
    while (electionOf(state).stage !== 'over') stepElection(state, electionOf(state).clockMs);
    expect(state.politics!.governor).toBe('ai2');
    state.treasury.money = 1_000;
    const hands = SEATS.map((id, i) => handOf(mindOf(id, id === 'ai2' ? persona : PERSONAS[i]!), i));
    const refused: AiAction[] = [];
    const sent = new Map(SEATS.map((id) => [id, [] as AiAction[]]));

    for (let t = 0; t < PAUSE_MS; t += WALK.tickMs)
      for (const h of hands) h.tick(state, WALK.tickMs, engineAct(state, h.mind.me, refused, sent.get(h.mind.me)));

    // The month opened at 5%: RULE-6 allows 0..10.
    expect(Math.round(state.treasury.salesTax * 100)).toBe(percent);
    expect(refused).toEqual([]);
    // Once per planning, and only to change the rate; nobody else touches it.
    expect(sent.get('ai2')).toEqual(percent === 5 ? [] : [{ type: 'setTax', percent }]);
    for (const id of ['ai0', 'ai1', 'ai3']) expect(sent.get(id)).toEqual([]);
  });
});

describe('RULE-8: how a seat votes', () => {
  it.each([
    { name: 'fewest plots', candidates: { governor: ['ai1', 'ai2', 'ai3'] }, plots: { ai1: 3, ai2: 1, ai3: 2 }, want: 'ai2' },
    { name: 'tie → lower seat', candidates: { governor: ['ai3', 'ai2', 'ai1'] }, plots: { ai1: 3, ai2: 1, ai3: 1 }, want: 'ai2' },
  ])('RULE-8: a non-candidate votes for the candidate with the fewest plots ($name)', ({ candidates, plots, want }) => {
    const state = ballotWith(candidates, plots);
    const hand = handOf(mindOf('ai0', 'trader'), 11);

    const { refused, sent } = tickAlone(state, hand);

    expect(refused).toEqual([]);
    expect(sent).toEqual([
      { type: 'vote', office: 'governor', candidate: want },
      { type: 'done', done: true },
    ]);
    expect(electionOf(state).ballots.ai0).toEqual({ governor: want });
    expect(electionOf(state).done).toContain('ai0');
  });

  it('RULE-8: a candidate votes for itself', () => {
    const state = ballotWith({ governor: ['ai1', 'ai2'], sheriff: ['ai0', 'ai3'] }, { ai0: 6, ai1: 5, ai2: 0, ai3: 1 });
    const hand = handOf(mindOf('ai1', 'cautious'), 12);

    const { refused } = tickAlone(state, hand);

    expect(refused).toEqual([]);
    expect(electionOf(state).ballots.ai1).toEqual({ governor: 'ai1', sheriff: 'ai3' });
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
  // Fund is low under 3 months of both offices' pay: 3 × (50 + 30) = 240.
  it.each([
    { current: 5, target: 8, fund: 1_000, low: 0, high: 10, want: 8 },
    { current: 5, target: 4, fund: 1_000, low: 0, high: 10, want: 4 },
    { current: 0, target: 10, fund: 1_000, low: 0, high: 15, want: 5 },
    { current: 12, target: 4, fund: 1_000, low: 0, high: 15, want: 7 },
    { current: 5, target: 5, fund: 239, low: 0, high: 10, want: 7 },
    { current: 5, target: 5, fund: 240, low: 0, high: 10, want: 5 },
    { current: 10, target: 10, fund: 0, low: 5, high: 10, want: 10 },
    { current: 8, target: 2, fund: 1_000, low: 5, high: 13, want: 5 },
  ])(
    'RULE-8: the tax steps toward the persona target by at most maxStep, +taxFundBump when the fund is low, clamped to the bounds ($current → $target, fund $fund, bounds $low to $high)',
    ({ current, target, fund, low, high, want }) => {
      expect(nextTax(current, target, fund, { low, high })).toBe(want);
    },
  );
});

/** The game as `me` is handed it, with every other seat's ballot booby-trapped. */
function guarded(state: GameState, me: string): GameState {
  const politics = state.politics;
  const election = politics?.election;
  if (!politics || !election) return state;
  const trap = (key: string | symbol) => {
    if (typeof key === 'string' && key !== me) throw new Error(`HC-4: ${me} read ${key}'s ballot`);
  };
  const ballots = new Proxy(election.ballots, {
    get: (target, key, receiver) => (trap(key), Reflect.get(target, key, receiver)),
    getOwnPropertyDescriptor: (target, key) => (trap(key), Reflect.getOwnPropertyDescriptor(target, key)),
  });
  return { ...state, politics: { ...politics, election: { ...election, ballots } } };
}

describe('HC-4: secret ballots', () => {
  it("HC-4: the hand never reads another seat's ballot", () => {
    let ballotStages = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = newGame(seed);
      const { refused, ends } = playElection(state, classicHands(seed), guarded);

      expect(refused).toEqual([]);
      expect(electionOf(state).stage).toBe('over');
      if (!ends.some((e) => e.stage === 'ballot')) continue;
      ballotStages++;
      // Positive control: the trap is live through observe(), on ballots that exist.
      expect(Object.keys(electionOf(state).ballots)).toContain('ai1');
      expect(() => observe(guarded(state, 'ai0'), 'ai0').politics!.election!.ballots.ai1).toThrow(/HC-4/);
    }
    expect(ballotStages).toBeGreaterThan(0);
  });
});
