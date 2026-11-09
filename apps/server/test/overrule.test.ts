import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLITICS, RuleError, WALK, type GameState } from '@mule/engine';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/*
 * S5-C7 (server): the overrule ballot opens as planning would end, the three intents reach the rules, and a Governor's
 * change clears the other humans' Ready. Heiko (s1, the host) governs; Mia (s2) is the other human; s3 is an AI seat.
 * The AI seat's own vote is the OverruleHand's (S5-PR-2): these tests cast it by hand so they hold with or without it.
 */

const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
/** The game's private seams the tests arrange or watch: the AI seats, their vote hands, the ready set and the hands' tick. */
interface Seams {
  ai: Map<string, { planMonth: (...args: unknown[]) => void }>;
  voteHands: Map<string, { tick: (state: GameState, dt: number, act: (action: unknown) => boolean) => void }>;
  startPlanning: () => void;
  tickVoteHands: (dt: number) => void;
}
const seamsOf = (game: MuleGame) => game as unknown as Seams;

/** Month 1's planning proper: Heiko governing, no vote open, the tax at its start (5%). */
function planningProper() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7, { politics: true });
  game.start(seats);
  const state = engineOf(game);
  state.politics = { ...state.politics!, governor: 's1', election: null, council: null, taxAtStart: state.treasury.salesTax };
  /** The server ticks the vote every WALK.tickMs; the fake clock runs one tick per advance, so step it tick by tick. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += WALK.tickMs) advance(WALK.tickMs);
  };
  const ready = () => Object.fromEntries(game.viewFor(null).players.map((p) => [p.id, p.ready]));
  return { game, state, run, ready };
}

/** Heiko raises the tax to 10% and Mia calls the overrule on it. */
function called() {
  const t = planningProper();
  t.game.handle('s1', { type: 'setTax', percent: 10 });
  t.game.handle('s2', { type: 'callOverrule', target: 'tax' });
  return t;
}

/** The last Ready of the two humans: the overrule ballot opens. */
function onTheBallot() {
  const t = called();
  t.game.handle('s1', { type: 'ready' });
  t.game.handle('s2', { type: 'ready' });
  return t;
}

function refusal(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'accepted';
}

// S5-PR-3 pin: these rows predate the AI's overrule calls. With minGain out of reach no AI seat calls, so the call each row
// makes is the human's (S5-B-AC-6 proves the AI's calls).
const SAVED_MIN_GAIN = POLITICS.ai.overrule.minGain;
beforeEach(() => {
  POLITICS.ai.overrule.minGain = Infinity;
});
afterEach(() => {
  POLITICS.ai.overrule.minGain = SAVED_MIN_GAIN;
});

describe('S5-C7: the server opens the overrule ballot where planning already ends', () => {
  it('S5-T-AC-10: a call opens the ballot at the last Ready; after the reveal planning ends at once, with no second planning proper', () => {
    const { game, state, run } = called();
    // Planning proper opened once, with the AI seat's planMonth; the ballot and its end must not plan the month a second time.
    const planned = vi.spyOn(seamsOf(game).ai.get('s3')!, 'planMonth');
    seamsOf(game).startPlanning();
    expect(planned).toHaveBeenCalledTimes(1);
    game.handle('s1', { type: 'ready' });
    expect(game.viewFor(null).phase, 'one Ready is not the last').toBe('planning');
    expect(state.politics!.overrule!.stage).toBe('called');
    game.handle('s2', { type: 'ready' });
    expect(game.viewFor(null).phase, 'planning does not end: the ballot opens').toBe('planning');
    expect(state.politics!.overrule).toMatchObject({ stage: 'ballot', caller: 's2' });
    expect(game.viewFor('s2').me!.politics!.overruleBallot, "the caller's yes is preset").toBe(true);

    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'voteOverrule', yes: true });
    game.handle('s3', { type: 'voteOverrule', yes: true });
    run(1_000);
    expect(state.politics!.overrule!.stage).toBe('reveal');
    expect(game.viewFor(null).phase).toBe('planning');
    run(POLITICS.overrule.revealMs + 1_000);
    expect(state.politics!.overrule!.stage, 'over, and planning with it').toBe('over');
    expect(game.viewFor(null).phase, 'no second planning proper').not.toBe('planning');
    expect(planned, 'no second planMonth across the ballot and the reveal').toHaveBeenCalledTimes(1);
    expect(state.treasury.salesTax, 'two of three votes: a majority undoes the raise').toBeCloseTo(state.politics!.taxAtStart);
  });

  it("S5-T-AC-10: the host's Continue opens the ballot as the last Ready does", () => {
    const { game, state } = called();
    game.handle('s1', { type: 'continue' });
    expect(state.politics!.overrule!.stage).toBe('ballot');
    expect(game.viewFor(null).phase).toBe('planning');
    expect(game.viewFor(null).news.join(' '), 'the news names the call, not a vote').toMatch(/Mia called an overrule vote on the tax/);
  });

  it('S5-T-AC-10 negative: a month with no call ends planning at the last Ready, as today', () => {
    const { game, state } = planningProper();
    game.handle('s1', { type: 'setTax', percent: 10 });
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    expect(game.viewFor(null).phase).not.toBe('planning');
    expect(state.politics!.overrule).toBeNull();
  });

  it('S5-T-AC-10: a withdrawn call ends planning at the last Ready', () => {
    const { game, state } = called();
    game.handle('s2', { type: 'callOverrule', target: null });
    expect(game.viewFor(null).news.join(' ')).toMatch(/Mia withdrew/);
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    expect(game.viewFor(null).phase).not.toBe('planning');
    expect(state.politics!.overrule).toBeNull();
  });

  it("S5-T-AC-10: a Governor's setTax or setBudget clears the other humans' Ready, and the Governor's own stays", () => {
    const { game, ready } = planningProper();
    game.handle('s2', { type: 'ready' });
    game.handle('s1', { type: 'setTax', percent: 7 });
    expect(ready(), 'Mia has to look at the new tax').toMatchObject({ s1: false, s2: false });
    game.handle('s2', { type: 'ready' });
    expect(ready().s2).toBe(true);
    game.handle('s1', { type: 'setBudget', shares: { projects: 70, welfare: 20, security: 0 } });
    expect(ready().s2, 'and at the new budget').toBe(false);
    expect(game.viewFor(null).politics!.budget).toMatchObject({ setBy: 's1', kept: 10 });
    expect(game.viewFor(null).news.join(' ')).toMatch(/Heiko/);
  });

  it("S5-T-AC-10: the Governor's own Ready stays when they change the tax or the budget", () => {
    const { game, ready } = planningProper();
    game.handle('s1', { type: 'ready' });
    game.handle('s1', { type: 'setTax', percent: 7 });
    game.handle('s1', { type: 'setBudget', shares: { projects: 70, welfare: 20, security: 0 } });
    expect(ready(), "Heiko's own Ready is not Mia's to look again at").toMatchObject({ s1: true, s2: false });
  });

  it("S5-T-AC-10: a setTax or setBudget that changes nothing leaves the others' Ready as it was", () => {
    const { game, state, ready } = planningProper();
    const budget = { projects: 100, welfare: 0, security: 0 };
    game.handle('s2', { type: 'ready' });
    game.handle('s1', { type: 'setTax', percent: Math.round(state.treasury.salesTax * 100) });
    expect(ready().s2, 'the same tax').toBe(true);
    game.handle('s1', { type: 'setBudget', shares: budget });
    expect(ready().s2, 'the same budget, the default in force').toBe(true);
    game.handle('s1', { type: 'setBudget', shares: { projects: 90, welfare: 10, security: 0 } });
    expect(ready().s2, 'a different budget').toBe(false);
    game.handle('s2', { type: 'ready' });
    game.handle('s1', { type: 'setBudget', shares: { projects: 90, welfare: 10, security: 0 } });
    expect(ready().s2, 'the same budget again').toBe(true);
  });

  it('S5-T-AC-10: every non-Governor seat judges an AI Governor\'s tax, even a seat whose hand ticks before the Governor\'s (S5-RULE-12)', () => {
    const { ctx } = fakeContext();
    const game = new MuleGame(ctx, 7, { politics: true });
    const table = [seats[0]!, seats[1]!, { id: 's3', name: 'Early', isAi: true, color: 2 }, { id: 's4', name: 'Late', isAi: true, color: 3 }];
    game.start(table);
    const state = engineOf(game);
    state.politics = { ...state.politics!, governor: 's4', election: null, council: null, taxAtStart: state.treasury.salesTax };
    // Seat order: s3's hand ticks before s4's. s4 governs and raises the tax inside the loop; s3 only watches the tax it is shown.
    const seen: number[] = [];
    const hands = seamsOf(game).voteHands;
    hands.set('s3', { tick: (st) => void seen.push(Math.round(st.treasury.salesTax * 100)) });
    // The Governor's hand raises once (as the real one acts once a month), then rests.
    let raised = false;
    hands.set('s4', { tick: (_st, _dt, act) => void (raised || ((raised = true), act({ type: 'setTax', percent: 6 }))) });
    const was = Math.round(state.treasury.salesTax * 100);
    seamsOf(game).tickVoteHands(0);
    expect(state.treasury.salesTax, "the Governor's raise stood").toBeCloseTo(0.06);
    expect(seen.at(-1), 'the earlier seat saw the new tax before any ballot').toBe(6);
    expect(seen[0], 'it first ticked before the raise').toBe(was);

    // Outside a tick (planMonth, an LLM move): an AI Governor's change is judged at once, not on some later tick.
    seen.length = 0;
    game.handle('s4', { type: 'setTax', percent: 7 });
    expect(seen, 'the earlier seat ticked at once and saw the new tax').toEqual([7]);
  });

  it('S5-T-AC-10: a tick in which the AI Governor changes nothing ticks each hand exactly once', () => {
    const { ctx } = fakeContext();
    const game = new MuleGame(ctx, 7, { politics: true });
    game.start([seats[0]!, seats[1]!, { id: 's3', name: 'Early', isAi: true, color: 2 }, { id: 's4', name: 'Late', isAi: true, color: 3 }]);
    const state = engineOf(game);
    state.politics = { ...state.politics!, governor: 's4', election: null, council: null, taxAtStart: state.treasury.salesTax };
    let early = 0;
    const hands = seamsOf(game).voteHands;
    hands.set('s3', { tick: () => void early++ });
    hands.set('s4', { tick: () => undefined });
    seamsOf(game).tickVoteHands(0);
    expect(early, 'no change, no second look').toBe(1);
  });
});

describe('S5-C7: the three intents on the rules', () => {
  it('S5-B-AC-4: with Mia\'s call standing, Heiko\'s setTax is refused with the words the phone receives; with no call it succeeds', () => {
    const { game } = planningProper();
    game.handle('s1', { type: 'setTax', percent: 8 });
    game.handle('s2', { type: 'callOverrule', target: 'tax' });
    expect(refusal(() => game.handle('s1', { type: 'setTax', percent: 7 }))).toBe('An overrule vote on the tax is called: it holds until it is settled');
    game.handle('s2', { type: 'callOverrule', target: null });
    expect(refusal(() => game.handle('s1', { type: 'setTax', percent: 7 }))).toBe('accepted');
  });

  it('S5-B-AC-4: refusals come in words: the Governor can\'t call, a vote needs an open ballot, only the Governor sets the budget', () => {
    const { game } = planningProper();
    expect(refusal(() => game.handle('s1', { type: 'callOverrule', target: 'tax' }))).toBe("The Governor can't overrule themself");
    expect(refusal(() => game.handle('s2', { type: 'voteOverrule', yes: true }))).toBe('The overrule vote is not open');
    expect(refusal(() => game.handle('s2', { type: 'setBudget', shares: { projects: 80, welfare: 10, security: 0 } }))).toBe('Only the Governor sets the budget');
  });
});

describe('S5-C7: the open ballot waits for every human', () => {
  it("S5-B-AC-5: with a human not voted nothing closes, however long; the host's Continue closes it and the news names them; in the reveal Continue is refused", () => {
    const { game, state, run } = onTheBallot();
    game.handle('s3', { type: 'voteOverrule', yes: false });
    run(10 * 60_000);
    expect(state.politics!.overrule!.stage).toBe('ballot');
    expect(game.viewFor(null).phase).toBe('planning');
    expect(game.viewFor(null).politics!.overrule!.waitingFor.sort(), 'every screen shows who it waits for').toEqual(['s1', 's2']);

    game.handle('s1', { type: 'continue' });
    run(1_000);
    expect(state.politics!.overrule!.stage).toBe('reveal');
    expect(game.viewFor(null).news, 'the news names the phone it closed without, not the host').toContain('Heiko closed the overrule vote without Mia.');
    expect(refusal(() => game.handle('s1', { type: 'continue' }))).toBe('The result is being announced');
    run(POLITICS.overrule.revealMs + 1_000);
    expect(state.politics!.overrule!.stage).toBe('over');
    expect(game.viewFor(null).phase).not.toBe('planning');
    expect(game.viewFor(null).news.filter((line) => /overrule vote on the tax (passes|fails)/.test(line)), 'the result is news once').toHaveLength(1);
  });

  it('S5-B-AC-5 negative: every human cast, the ballot closes with no Continue; Ready is Done on it and never ends planning by itself', () => {
    const { game, state, run } = onTheBallot();
    game.handle('s3', { type: 'voteOverrule', yes: false });
    expect(game.viewFor(null).players.find((p) => p.id === 's1')!.ready, "the Governor's preset no is not Done").toBe(false);
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'voteOverrule', yes: true });
    run(1_000);
    expect(state.politics!.overrule!.stage).toBe('reveal');
    run(POLITICS.overrule.revealMs + 1_000);
    expect(state.politics!.overrule!.result).toMatchObject({ passed: false });
    expect(game.viewFor(null).phase).not.toBe('planning');
    expect(game.viewFor(null).news.join(' ')).not.toMatch(/without/);
  });
});
