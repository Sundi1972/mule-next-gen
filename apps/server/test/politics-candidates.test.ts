import { describe, expect, it } from 'vitest';
import { lawImpact, POLITICS, type Council, type GameState, type LawId, type LawProposal } from '@mule/engine';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
const LAW_IDS = Object.keys(POLITICS.laws) as LawId[];

/** Month 1's planning with Heiko (s1) governing, the election over, nothing on the ballot, and a land tax in force. */
function governing() {
  const { ctx } = fakeContext();
  const game = new MuleGame(ctx, 7, { politics: true });
  game.start(seats);
  const state = engineOf(game);
  state.politics = { ...state.politics!, governor: 's1', election: null, council: null, laws: { landTax: { setting: 10, since: 1 } } };
  return { game, state };
}

/** The proposal a candidates key names: `<law>:<setting>` for an enact, `repeal:<law>` for a repeal. */
function proposalOf(key: string): LawProposal {
  const [a, b] = key.split(':') as [string, string];
  return a === 'repeal' ? { kind: 'repeal', law: b as LawId } : { kind: 'enact', law: a as LawId, setting: Number(b) };
}

describe("T-AC-46-5 (server): the Governor's own view carries every proposal's cost, before Propose", () => {
  it('T-AC-46-5: present in the Governor\'s own view, a key per law and setting and per law in force, each equal to lawImpact(state, proposal)', () => {
    const { game, state } = governing();
    const candidates = game.viewFor('s1').me!.politics!.candidates;
    expect(candidates, "the Governor's own view").toBeDefined();
    const enacts = LAW_IDS.flatMap((law) => POLITICS.laws[law].settings.map((s) => `${law}:${s}`));
    expect(Object.keys(candidates!).sort()).toEqual([...enacts, 'repeal:landTax'].sort());
    for (const [key, impact] of Object.entries(candidates!)) expect(impact, key).toEqual(lawImpact(state, proposalOf(key)));
  });

  it("T-AC-46-5 (negative): absent from every other seat's view and from the board", () => {
    const { game } = governing();
    expect(game.viewFor('s2').me!.politics!.candidates).toBeUndefined();
    expect(game.viewFor('s3').me!.politics!.candidates).toBeUndefined();
    const board = game.viewFor(null);
    expect(board.me).toBeNull();
    expect(JSON.stringify(board)).not.toMatch(/"candidates":\{"[a-zA-Z]+:/);
  });

  it('T-AC-46-5 (negative): absent while a vote is open, the law ballot or the election', () => {
    const { game, state } = governing();
    const council: Council = { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'exportTax', setting: 10 }, proposer: 's1', ballots: { s1: true }, done: [], result: null };
    state.politics = { ...state.politics!, council };
    expect(game.viewFor('s1').me!.politics!.candidates, 'the law ballot is open').toBeUndefined();
    // Month 1 opens on its election: the start's own, left as it is.
    const { ctx } = fakeContext();
    const g2 = new MuleGame(ctx, 7, { politics: true });
    g2.start(seats);
    const s2 = engineOf(g2);
    s2.politics = { ...s2.politics!, governor: 's1' };
    expect(s2.politics.election?.stage, 'month 1 opens on its election').not.toBe('over');
    expect(g2.viewFor('s1').me!.politics!.candidates, 'the election is open').toBeUndefined();
  });

  it('T-AC-46-5 (negative): absent outside planning, when no proposal is taken', () => {
    const { game, state } = governing();
    state.phase = 'development';
    expect(game.viewFor('s1').me!.politics!.candidates).toBeUndefined();
  });
});
