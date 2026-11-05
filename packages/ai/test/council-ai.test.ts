import { afterEach, describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  callStrike,
  COLONY,
  commission,
  createGame,
  createRng,
  POLITICS,
  type AiLevelId,
  type AiPersonaId,
  type Council,
  type GameState,
  type LawProposal,
  type Rng,
} from '@mule/engine';
import type { Act } from '../src/actions.js';
import { VoteHand } from '../src/hands/vote.js';
import { applyAction } from '../src/play.js';
import type { Mind } from '../src/value.js';

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const LAND_10: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

const savedChance = { ...POLITICS.ai.council.proposeChance };
const savedColony = structuredClone(POLITICS.ai.colony);
afterEach(() => {
  Object.assign(POLITICS.ai.council.proposeChance, savedChance);
  Object.assign(POLITICS.ai.colony, structuredClone(savedColony));
});

function mindOf(me: string, persona: AiPersonaId, level: AiLevelId = 'trader'): Mind {
  return { me, personaId: persona, persona: AI_PERSONAS[persona], levelId: level, level: AI_LEVELS[level] };
}

/** The seat's election stream, wrapped so a test can count every draw from it. */
function counted(seed: number): Rng & { draws: () => number } {
  const rng = createRng(seed);
  let draws = 0;
  const tally = <F extends (...args: never[]) => unknown>(f: F) => ((...args: Parameters<F>) => (draws++, f(...args))) as F;
  return { next: tally(rng.next), int: tally(rng.int), pick: tally(rng.pick), chance: tally(rng.chance), weighted: tally(rng.weighted), draws: () => draws } as Rng & { draws: () => number };
}

/** Month 2's planning, no election, ai0 governing, a full fund. */
function governed(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'ai0', election: null, baron: null };
  state.treasury.money = 5_000;
  return state;
}

function give(state: GameState, id: string, plots: number): void {
  for (const t of state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(0, plots)) t.owner = id;
}

const act = (state: GameState, id: string): Act => (action) => applyAction(state, id, action);

/** One tick of a hand at planning's pace; the council and the colony act at once. */
function tick(hand: VoteHand, state: GameState): void {
  hand.tick(state, 0, act(state, hand.mind.me));
}

function ballot(state: GameState, proposal: LawProposal, proposer = 'ai0'): void {
  const council: Council = { stage: 'ballot', clockMs: 0, proposal, proposer, ballots: { [proposer]: true }, done: [], result: null };
  state.politics = { ...state.politics!, council };
}

describe("C44: the AI's council acts (slice 2a RULE-46)", () => {
  it('T-AC-50: an AI Governor proposes the law that costs the leader most against itself, at its middle setting', () => {
    POLITICS.ai.council.proposeChance.aggressive = 1;
    const state = governed();
    give(state, 'ai1', 12);
    tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), state);
    const pending = state.politics!.proposal;
    expect(pending?.by).toBe('ai0');
    expect(pending?.proposal).toEqual({ kind: 'enact', law: 'landTax', setting: POLITICS.laws.landTax.settings[Math.floor(POLITICS.laws.landTax.settings.length / 2)] });
  });

  it('T-AC-50: with no law that costs the leader minGap more than itself, the AI Governor proposes nothing', () => {
    POLITICS.ai.council.proposeChance.aggressive = 1;
    const state = governed();
    tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), state);
    expect(state.politics!.proposal).toBeNull();
  });

  it("T-AC-50: a law in force that costs the AI Governor more than the leader is the one it repeals; a law still waiting after failing is never put", () => {
    POLITICS.ai.council.proposeChance.aggressive = 1;
    const repeal = governed();
    give(repeal, 'ai0', 12);
    repeal.politics = { ...repeal.politics!, laws: { landTax: { setting: 20, since: 1 } } };
    tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), repeal);
    expect(repeal.politics!.proposal?.proposal).toEqual({ kind: 'repeal', law: 'landTax' });

    const waiting = governed();
    give(waiting, 'ai1', 12);
    waiting.politics = { ...waiting.politics!, failed: { 'enact:landTax': 1 } };
    tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), waiting);
    expect(waiting.politics!.proposal?.proposal.law).not.toBe('landTax');
  });

  it('T-AC-50: a fourth law names as replaces the law in force that costs the AI Governor the most', () => {
    POLITICS.ai.council.proposeChance.aggressive = 1;
    const state = governed();
    give(state, 'ai1', 12);
    give(state, 'ai0', 1);
    state.politics = { ...state.politics!, laws: { exportTax: { setting: 10, since: 1 }, pollutionTax: { setting: 10, since: 1 }, emissionCap: { setting: 50, since: 1 } } };
    tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), state);
    const proposal = state.politics!.proposal?.proposal;
    expect(proposal).toMatchObject({ kind: 'enact', law: 'landTax' });
    expect(proposal && 'replaces' in proposal ? proposal.replaces : undefined).toBeDefined();
  });

  it.each([
    { row: 1, who: 'the Governor keeps its yes', seat: 'ai0', persona: 'trader' as AiPersonaId, level: 'trader' as AiLevelId, plots: 20, yes: true },
    { row: 2, who: 'the Land Baron fights a land tax', seat: 'ai3', persona: 'trader' as AiPersonaId, level: 'trader' as AiLevelId, plots: 0, yes: false, baron: true },
    { row: 4, who: 'a seat paying at most the median votes for it', seat: 'ai1', persona: 'cautious' as AiPersonaId, level: 'trader' as AiLevelId, plots: 0, yes: true },
    { row: 4, who: 'a seat paying above the median votes against it', seat: 'ai2', persona: 'cautious' as AiPersonaId, level: 'trader' as AiLevelId, plots: 8, yes: false },
  ])('T-AC-50: RULE-46 vote row $row — $who', ({ seat, persona, level, plots, yes, baron }) => {
    const state = governed();
    give(state, seat, plots);
    if (baron) state.politics = { ...state.politics!, baron: seat };
    ballot(state, LAND_10);
    tick(new VoteHand(mindOf(seat, persona, level), createRng(1)), state);
    expect(state.politics!.council!.ballots[seat]).toBe(yes);
    expect(state.politics!.council!.done, 'it presses Done after voting').toContain(seat);
  });

  it('T-AC-50: RULE-46 vote rows 4-5 against the median — an enact passes for the cheap half, a repeal for the dear half', () => {
    const state = governed();
    give(state, 'ai2', 2);
    give(state, 'ai3', 6);
    state.politics = { ...state.politics!, laws: { landTax: { setting: 10, since: 1 } } };
    ballot(state, { kind: 'repeal', law: 'landTax' });
    for (const seat of ['ai1', 'ai3']) tick(new VoteHand(mindOf(seat, 'cautious'), createRng(1)), state);
    expect(state.politics!.council!.ballots).toMatchObject({ ai1: false, ai3: true });
  });

  it("T-AC-45 (HC-41): the council's acts, a Rookie's coin included, draw nothing from the hand's election stream", () => {
    const state = governed();
    ballot(state, LAND_10);
    const stream = counted(11);
    tick(new VoteHand(mindOf('ai2', 'trader', 'rookie'), stream), state);
    expect(typeof state.politics!.council!.ballots.ai2).toBe('boolean');
    expect(stream.draws()).toBe(0);

    POLITICS.ai.council.proposeChance.aggressive = 1;
    const proposing = governed();
    give(proposing, 'ai1', 12);
    const governor = counted(12);
    tick(new VoteHand(mindOf('ai0', 'aggressive'), governor), proposing);
    expect(proposing.politics!.proposal).not.toBeNull();
    expect(governor.draws(), "the proposal's chance comes from the council's own stream").toBe(0);
  });

  it("T-AC-45: a Rookie's council coin is the same for the same game, month and seat", () => {
    const votes = [0, 1].map(() => {
      const state = governed();
      ballot(state, LAND_10);
      tick(new VoteHand(mindOf('ai2', 'trader', 'rookie'), createRng(99)), state);
      return state.politics!.council!.ballots.ai2;
    });
    expect(votes[0]).toBe(votes[1]);
  });
});

describe('C25: AI Governors build and pay, AI voters weigh the mood (G-5)', () => {
  it('T-AC-36: an AI Governor whose persona builds commissions the most prestige the fund can pay for, a plot-free object, once the votes are over', () => {
    POLITICS.ai.colony.commissions.trader = true;
    const state = governed();
    state.treasury.money = 700;
    tick(new VoteHand(mindOf('ai0', 'trader'), createRng(1)), state);
    expect(state.colony!.projects.map((p) => p.id)).toEqual(['hospital']);
  });

  it("T-AC-36: no commission when the persona doesn't build, when nothing plot-free is affordable, or while an object is open", () => {
    POLITICS.ai.colony.commissions.saboteur = false;
    const wontBuild = governed();
    tick(new VoteHand(mindOf('ai0', 'saboteur'), createRng(1)), wontBuild);
    expect(wontBuild.colony!.projects).toEqual([]);

    POLITICS.ai.colony.commissions.trader = true;
    const poor = governed();
    poor.treasury.money = 600;
    tick(new VoteHand(mindOf('ai0', 'trader'), createRng(1)), poor);
    expect(poor.colony!.projects).toEqual([]);

    const busy = governed();
    commission(busy, 'ai0', 'observatory');
    tick(new VoteHand(mindOf('ai0', 'trader'), createRng(1)), busy);
    expect(busy.colony!.projects.map((p) => p.id)).toEqual(['observatory']);
  });

  it('T-AC-36: an AI Governor whose persona pays strikes pays one the fund can afford; one that does not, or a fund too short, leaves it', () => {
    POLITICS.ai.colony.paysStrike.trader = true;
    POLITICS.ai.colony.paysStrike.aggressive = false;
    for (const [persona, fund, paid] of [['trader', 1_000, true], ['aggressive', 1_000, false], ['trader', COLONY.strike.cost - 1, false]] as const) {
      const state = governed();
      state.treasury.money = fund;
      callStrike(state, 'food');
      tick(new VoteHand(mindOf('ai0', persona), createRng(1)), state);
      expect(state.colony!.strike!.paid, `${persona} with ${fund} cr`).toBe(paid);
    }
  });

  it('T-AC-36: an AI voter leans against the sitting Governor when the mood is below leanBelow, and not above it', () => {
    const vote = (happiness: number) => {
      const state = governed();
      state.month = POLITICS.electionMonths[1]!;
      give(state, 'ai2', 3);
      state.colony!.happiness = happiness;
      const election = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) }).politics!.election!;
      state.politics = { ...state.politics!, governor: 'ai1', election: { ...election, stage: 'ballot', candidates: { governor: ['ai1', 'ai2'], sheriff: [] } } };
      const hand = new VoteHand(mindOf('ai3', 'trader'), createRng(1));
      for (let i = 0; i < 100 && state.politics!.election!.ballots.ai3?.governor === undefined; i++) hand.tick(state, POLITICS.ai.actMs[1], act(state, 'ai3'));
      return state.politics!.election!.ballots.ai3?.governor;
    };
    expect(vote(POLITICS.ai.colony.leanBelow + 20), 'content: the fewest plots, the sitting Governor').toBe('ai1');
    expect(vote(POLITICS.ai.colony.leanBelow - 1), 'unhappy: against the sitting Governor').toBe('ai2');
  });
});
