import { describe, expect, it } from 'vitest';
import { GOOD_CONFIG, PRESTIGE, RuleError, type GameState } from '@mule/engine';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** A started game in month 1's planning with Heiko (s1) governing and no election open. */
function governed() {
  const { ctx } = fakeContext();
  const game = new MuleGame(ctx, 7, { politics: true });
  game.start(seats);
  const state = engineOf(game);
  state.politics = { ...state.politics!, governor: 's1', election: null };
  return { game, state };
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

describe('the colony at the table', () => {
  it("B-AC-23: the Governor's phone commissions and another phone donates; every screen's colony view shows the project and the plaque at once, and a non-Governor's commission is refused with RULE-22's message", () => {
    const { game, state } = governed();
    expect(refusal(() => game.handle('s2', { type: 'commission', id: 'hospital' }))).toBe('Only the Governor commissions for the colony');
    expect(game.viewFor(null).colony!.projects).toEqual([]);

    game.handle('s1', { type: 'commission', id: 'hospital' });
    state.players.find((p) => p.id === 's2')!.stock.electronics = 1;
    game.handle('s2', { type: 'donate', id: 'hospital', credits: 100, goods: { electronics: 1 } });

    for (const viewer of [null, 's1', 's2']) {
      const [project] = game.viewFor(viewer).colony!.projects;
      expect(project, `${viewer ?? 'the TV'}'s view`).toMatchObject({
        id: 'hospital',
        stage: 'commissioned',
        buildMonths: PRESTIGE.hospital.buildMonths,
        funded: { credits: 100, goods: { electronics: 1 } },
        plaque: [{ playerId: 's2', value: 100 + GOOD_CONFIG.electronics.refPrice }],
      });
    }
    const hospital = game.viewFor(null).colony!.catalogue.find((c) => c.id === 'hospital')!;
    expect(hospital).toMatchObject({ commissionable: false, why: 'The colony already has a Hospital' });
  });

  it('T-AC-29: every screen gets the same colony view, and it carries no ballot and no private hand', () => {
    const { game, state } = governed();
    state.politics = { ...state.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 's1', ballots: { s1: true, s2: false }, done: [], result: null } };
    const views = [null, 's1', 's2'].map((viewer) => game.viewFor(viewer).colony);
    expect(views[0]).not.toBeNull();
    for (const view of views) expect(view).toEqual(views[0]);
    const text = JSON.stringify(views[0]);
    expect(text).not.toMatch(/ballot|stock|drone|analysed/i);
  });

  it('the colony view is null with politics off', () => {
    const { ctx } = fakeContext();
    const game = new MuleGame(ctx, 7, { politics: false });
    game.start(seats);
    expect(game.viewFor(null).colony).toBeNull();
  });
});
