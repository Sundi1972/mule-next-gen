import { describe, expect, it } from 'vitest';
import { POLITICS, RuleError, WALK, type Council, type GameState } from '@mule/engine';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
const LAND_10 = { kind: 'enact', law: 'landTax', setting: 10 } as const;

/** Month 1's planning with Heiko (s1, the host) governing, the election over and his land tax of 10 on the open ballot. */
function onTheBallot() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7, { politics: true });
  game.start(seats);
  const state = engineOf(game);
  const council: Council = { stage: 'ballot', clockMs: 0, proposal: LAND_10, proposer: 's1', ballots: { s1: true }, done: [], result: null };
  state.politics = { ...state.politics!, governor: 's1', election: null, council };
  /** The server ticks the vote every WALK.tickMs; the fake clock runs one tick per advance, so step it tick by tick. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += WALK.tickMs) advance(WALK.tickMs);
  };
  return { game, state, advance: run };
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

describe('C45: the server runs the law ballot as it runs the election', () => {
  it("B-AC-43: with a human not voted nothing closes, however long; the host's Continue closes it and the news names them; in the reveal Continue is refused", () => {
    const { game, state, advance } = onTheBallot();
    advance(10 * 60_000);
    expect(state.politics!.council!.stage).toBe('ballot');
    expect(state.politics!.council!.done, 'the AI seat abstains at once').toContain('s3');
    expect(game.viewFor(null).phase).toBe('planning');
    expect(game.viewFor(null).politics!.council!.waitingFor.sort(), 'every screen shows who the ballot waits for').toEqual(['s1', 's2']);

    game.handle('s1', { type: 'continue' });
    advance(1_000);
    expect(state.politics!.council!.stage).toBe('reveal');
    expect(game.viewFor(null).news, 'the news names the phone it closed without, not the host').toContain('Heiko closed the law ballot without Mia.');
    expect(refusal(() => game.handle('s1', { type: 'continue' }))).toBe('The result is being announced');
    advance(POLITICS.council.revealMs + 1_000);
    expect(state.politics!.council!.stage).toBe('over');
    expect(game.viewFor(null).news.filter((line) => /Land tax at 10 (passes|fails)/.test(line)), 'the result is news once').toHaveLength(1);
  });

  it("B-AC-43: Ready is Done on the open law ballot, and once every player is Done it closes on its own", () => {
    const { game, state, advance } = onTheBallot();
    game.handle('s1', { type: 'ready' });
    const ready = () => Object.fromEntries(game.viewFor(null).players.map((p) => [p.id, p.ready]));
    expect(ready(), "every screen shows Heiko Done on the ballot, Mia not yet").toMatchObject({ s1: true, s2: false });
    game.handle('s2', { type: 'voteLaw', yes: true });
    advance(1_000);
    expect(state.politics!.council!.stage).toBe('reveal');
    advance(POLITICS.council.revealMs + 1_000);
    expect(state.politics!.laws.landTax?.setting).toBe(10);
    expect(game.viewFor(null).politics!.laws).toEqual({ landTax: { setting: 10, since: state.month } });
  });

  it("T-AC-51: RULE-47 — a ballot reaches only its voter; who voted is public, how never; the totals from the reveal; each player's cost on every screen", () => {
    const { game, advance } = onTheBallot();
    game.handle('s2', { type: 'voteLaw', yes: false });
    expect(game.viewFor('s2').me?.politics?.lawBallot).toBe(false);
    expect(game.viewFor('s1').me?.politics?.lawBallot).toBe(true);
    for (const viewer of [null, 's1', 's2']) {
      const council = game.viewFor(viewer).politics!.council!;
      expect(council.voted.sort()).toEqual(['s1', 's2']);
      expect(council.result).toBeNull();
      expect(Object.keys(council.impact).sort()).toEqual(['s1', 's2', 's3']);
      expect(JSON.stringify(game.viewFor(viewer).politics)).not.toMatch(/"ballots"/);
    }
    game.handle('s1', { type: 'continue' });
    advance(1_000);
    const shown = game.viewFor(null).politics!.council!.result;
    expect(shown).not.toBeNull();
    expect(game.viewFor('s2').me?.politics?.lawBallot, "RULE-47: a voter's own ballot shows until the reveal").toBeNull();
    expect(game.viewFor('s1').politics!.council!.result).toEqual(shown);
  });
});
