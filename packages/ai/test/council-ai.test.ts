import { afterEach, describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  callStrike,
  COLONY,
  commission,
  createGame,
  createRng,
  HAPPINESS,
  POLITICS,
  stepVotes,
  votesOpen,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type Council,
  type GameState,
  type LawProposal,
  type Rng,
} from '@mule/engine';
import type { Act, AiAction } from '../src/actions.js';
import { VoteHand } from '../src/hands/vote.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import type { Mind } from '../src/value.js';

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const LAND_10: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

const savedChance = { ...POLITICS.ai.council.proposeChance };
const savedColony = structuredClone(POLITICS.ai.colony);
const savedOffices = [...POLITICS.offices];
afterEach(() => {
  POLITICS.offices = [...savedOffices];
  Object.assign(POLITICS.ai.council.proposeChance, savedChance);
  Object.assign(POLITICS.ai.colony, structuredClone(savedColony));
});

/** A seat's mind as the sim and the server build it (AiSeat), so it carries the seat's own seed. */
function mindOf(me: string, persona: AiPersonaId, level: AiLevelId = 'trader', seed = 1): Mind {
  return new AiSeat({ id: me, name: me, persona, level, seed }).mind;
}

/** The seat's election stream, wrapped so a test can count every draw from it. */
function counted(seed: number): Rng & { draws: () => number } {
  const rng = createRng(seed);
  let draws = 0;
  const tally = <F extends (...args: never[]) => unknown>(f: F) => ((...args: Parameters<F>) => (draws++, f(...args))) as F;
  return { next: tally(rng.next), int: tally(rng.int), pick: tally(rng.pick), chance: tally(rng.chance), weighted: tally(rng.weighted), draws: () => draws } as Rng & { draws: () => number };
}

/** Month 2's planning, no election, ai0 governing, a full fund. */
function governed(seed = 7): GameState {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'ai0', election: null, baron: null };
  state.treasury.money = 5_000;
  return state;
}

function give(state: GameState, id: string, plots: number): void {
  for (const t of state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(0, plots)) t.owner = id;
}

const act = (state: GameState, id: string): Act => (action) => applyAction(state, id, action);

/** One tick of a hand at planning's pace; the council and the colony act at once. Returns every move it sent. */
function tick(hand: VoteHand, state: GameState): AiAction[] {
  const sent: AiAction[] = [];
  hand.tick(state, 0, (action) => (sent.push(action), applyAction(state, hand.mind.me, action)));
  return sent;
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
    const sent = tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), waiting);
    expect(sent.filter((a) => a.type === 'propose' && a.proposal?.law === 'landTax'), 'it never even tries the waiting law').toEqual([]);
  });

  it('T-AC-50: a fourth law names as replaces the law in force that costs the AI Governor the most', () => {
    POLITICS.ai.council.proposeChance.aggressive = 1;
    const state = governed();
    give(state, 'ai1', 12);
    give(state, 'ai0', 1);
    // The emission cap is the only law in force that costs ai0 anything: its one plot mines Rare earth above the cap.
    Object.assign(state.tiles.find((t) => t.owner === 'ai0')!, { outfit: 'rareEarth' });
    state.air = 80;
    state.politics = { ...state.politics!, laws: { exportTax: { setting: 10, since: 1 }, pollutionTax: { setting: 10, since: 1 }, emissionCap: { setting: 50, since: 1 } } };
    tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), state);
    expect(state.politics!.proposal?.proposal).toEqual({ kind: 'enact', law: 'landTax', setting: 10, replaces: 'emissionCap' });
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

  it('T-AC-50: RULE-46 vote row 4 with an even count: the median is the mean of the middle two, not either middle cost', () => {
    const state = governed();
    give(state, 'ai1', 2);
    give(state, 'ai2', 6);
    give(state, 'ai3', 10);
    ballot(state, LAND_10);
    // Costs 0, 20, 60, 100: the median is 40, so ai2 at 60 votes against; the upper middle (60) would have said yes.
    tick(new VoteHand(mindOf('ai2', 'cautious'), createRng(1)), state);
    expect(state.politics!.council!.ballots.ai2).toBe(false);
  });

  it('T-AC-50: RULE-46 vote row 2 is the land tax only: on any other law the Land Baron votes by the median', () => {
    const state = governed();
    state.politics = { ...state.politics!, baron: 'ai3' };
    ballot(state, { kind: 'enact', law: 'exportTax', setting: 10 });
    tick(new VoteHand(mindOf('ai3', 'trader'), createRng(1)), state);
    expect(state.politics!.council!.ballots.ai3, 'it costs nobody anything, so the median says yes').toBe(true);
  });

  it('T-AC-50 (RULE-46 with the reveal): in a ballot month the AI Governor still acts once the ballot is over — it pays the strike and commissions — in the sim loop and the server alike', () => {
    POLITICS.ai.colony.commissions.trader = true;
    POLITICS.ai.colony.paysStrike.trader = true;
    const state = governed();
    state.month = 3;
    state.treasury.money = 1_000;
    callStrike(state, 'food');
    ballot(state, LAND_10);
    const hands = SEATS.map((id) => new VoteHand(mindOf(id, 'trader'), createRng(1)));
    const all = () => hands.forEach((h) => h.tick(state, WALK.tickMs, act(state, h.mind.me)));
    // As play.ts and the server step it: hands, then the votes, until every vote is over; then one more tick.
    for (let i = 0; i < 10_000 && votesOpen(state); i++) {
      all();
      stepVotes(state, WALK.tickMs);
    }
    expect(state.politics!.council!.stage, 'the ballot ran through its reveal').toBe('over');
    all();
    expect(state.colony!.strike!.paid, 'the strike is paid after the reveal').toBe(true);
    expect(state.colony!.projects.length, 'and an object commissioned').toBe(1);
  });

  it("T-AC-45 (HC-41): the council's stream is the seat's: across 40 seat seeds a Rookie's coin for the same month comes up both ways", () => {
    const votes = new Set<boolean>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = governed();
      ballot(state, LAND_10);
      tick(new VoteHand(mindOf('ai2', 'trader', 'rookie', seed), createRng(99)), state);
      votes.add(state.politics!.council!.ballots.ai2!);
    }
    expect([...votes].sort()).toEqual([false, true]);
  });

  it("T-AC-45 (HC-41): and it is the month's: over 20 months of one game a Rookie's coin for the same seat comes up both ways", () => {
    const votes = new Set<boolean>();
    for (let month = 2; month <= 21; month++) {
      const state = governed();
      state.month = month;
      ballot(state, LAND_10);
      tick(new VoteHand(mindOf('ai2', 'trader', 'rookie'), createRng(99)), state);
      votes.add(state.politics!.council!.ballots.ai2!);
    }
    expect([...votes].sort()).toEqual([false, true]);
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

  it("INV-41: no AI hand reads the game's seed — games that differ only in it get the same council coin and the same proposal", () => {
    POLITICS.ai.council.proposeChance.aggressive = 0.5;
    const plays = [3, 41, 977, 65_521, 2_147_483_647].map((gameSeed) => {
      const voting = governed();
      voting.seed = gameSeed;
      ballot(voting, LAND_10);
      tick(new VoteHand(mindOf('ai2', 'trader', 'rookie'), createRng(99)), voting);
      const proposing = governed();
      proposing.seed = gameSeed;
      give(proposing, 'ai1', 12);
      tick(new VoteHand(mindOf('ai0', 'aggressive'), createRng(1)), proposing);
      return { coin: voting.politics!.council!.ballots.ai2, proposal: proposing.politics!.proposal?.proposal ?? null };
    });
    expect(new Set(plays.map((p) => JSON.stringify(p))).size).toBe(1);
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

  it('T-AC-36: a strike paid this tick leaves less to build with — the Governor commissions only from the fund that is left', () => {
    POLITICS.ai.colony.commissions.trader = true;
    POLITICS.ai.colony.paysStrike.trader = true;
    const state = governed();
    state.treasury.money = 700; // the Hospital's price is within it, but not once the strike is paid
    callStrike(state, 'food');
    const sent = tick(new VoteHand(mindOf('ai0', 'trader'), createRng(1)), state);
    expect(state.colony!.strike!.paid).toBe(true);
    expect(sent.some((a) => a.type === 'commission'), 'it does not try a commission the fund can no longer pay').toBe(false);
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
      const sent = tick(new VoteHand(mindOf('ai0', persona), createRng(1)), state);
      expect(state.colony!.strike!.paid, `${persona} with ${fund} cr`).toBe(paid);
      expect(sent.some((a) => a.type === 'payStrike'), `${persona} with ${fund} cr only tries when it means to pay`).toBe(paid);
    }
  });

  it('T-AC-36: an AI voter leans against the sitting Governor when the colony is Unhappy or in Unrest, and not when Content or Restless', () => {
    const vote = (happiness: number, office: 'governor' | 'sheriff' = 'governor') => {
      // The sheriff is elected only when the table plays both offices.
      POLITICS.offices = office === 'sheriff' ? ['governor', 'sheriff'] : ['governor'];
      const state = governed();
      state.month = POLITICS.electionMonths[1]!;
      give(state, 'ai2', 3);
      state.colony!.happiness = happiness;
      const election = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) }).politics!.election!;
      const candidates = office === 'governor' ? { governor: ['ai1', 'ai2'], sheriff: [] } : { governor: [], sheriff: ['ai1', 'ai2'] };
      state.politics = { ...state.politics!, governor: 'ai1', election: { ...election, stage: 'ballot', candidates } };
      const hand = new VoteHand(mindOf('ai3', 'trader'), createRng(1));
      for (let i = 0; i < 100 && state.politics!.election!.ballots.ai3?.[office] === undefined; i++) hand.tick(state, POLITICS.ai.actMs[1], act(state, 'ai3'));
      return state.politics!.election!.ballots.ai3?.[office];
    };
    expect(vote(HAPPINESS.bands.content), 'content: the fewest plots, the sitting Governor').toBe('ai1');
    expect(vote(HAPPINESS.bands.restless), 'restless: still the fewest plots').toBe('ai1');
    expect(vote(HAPPINESS.bands.restless - 1), 'unhappy: against the sitting Governor').toBe('ai2');
    expect(vote(HAPPINESS.bands.restless - 1, 'sheriff'), 'the sheriff vote is not about the Governor').toBe('ai1');
  });
});
