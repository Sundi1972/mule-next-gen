import { describe, expect, it } from 'vitest';
import { GOODS, newPolitics, player, POLITICS, POLLUTION, scoreParts, type GameState, type Phase } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats, toDevelopment } from './fake-context.js';

/** Two phones and the board: every kind of viewer. */
const VIEWERS = ['s1', 's2', null] as const;

const airIn = (band: 'clean' | 'collapse') => POLLUTION.bands.find((b) => b.name === band)!.from;
const stateOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
const worthIn = (view: MuleView) => Object.fromEntries(view.players.map((p) => [p.id, p.worth]));
const ruleWorth = (state: GameState) => Object.fromEntries(seats.map((s) => [s.id, scoreParts(state, s.id).total]));
const leaderBy = (view: MuleView, key: 'money' | 'worth') => [...view.players].sort((a, b) => b[key] - a[key])[0]!.id;

/**
 * Plays a two-month game to game over, calling `look` once per step in every phase. The last upkeep turns straight
 * into game over, so month 1 is the one that shows upkeep. s1 claims the first plot lit in each land grant, so the
 * two phones' parts differ.
 */
function playTwoMonths(look: (game: MuleGame, state: GameState) => void): Set<Phase> {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7, { maxMonths: 2, phaseScale: 0.1 });
  game.start(seats);
  const state = stateOf(game);
  const phases = new Set<Phase>();
  let claimedIn = 0;
  for (let n = 0; n < 100_000 && !game.viewFor(null).finished; n++) {
    phases.add(state.phase);
    look(game, state);
    if (state.phase === 'planning') readyAll(game);
    const lit = state.phase === 'landGrant' && claimedIn !== state.month ? game.viewFor('s1').lit : null;
    if (lit) {
      game.handle('s1', { type: 'claim', ...lit });
      claimedIn = state.month;
    }
    advance(100);
  }
  expect(game.viewFor(null).finished).toBe(true);
  phases.add(state.phase);
  look(game, state);
  return phases;
}

/** The viewer's own breakdown, summed the way the spec's RULE-3 adds it up. */
function partsTotal(view: MuleView): number {
  const p = view.me!.worthParts;
  return p.money + p.goods + p.land + p.muleValue + p.office - p.cut;
}

describe('Worth in every view (C18)', () => {
  it("T-AC-14: in every phase, every player's worth in every view is scoreParts().total, and your own worthParts add up to yours", () => {
    let atEnd: MuleView | null = null;
    const phases = playTwoMonths((game, state) => {
      for (const viewer of VIEWERS) {
        const view = game.viewFor(viewer);
        expect(worthIn(view), `${viewer ?? 'the board'} in ${state.phase}`).toEqual(ruleWorth(state));
        if (viewer === null) continue;
        const { total, ...parts } = scoreParts(state, viewer);
        expect(view.me!.worthParts, `${viewer}'s own parts in ${state.phase}`).toEqual(parts);
        expect(partsTotal(view)).toBe(total);
        expect(view.air.band, 'this game never reaches Collapse, so no cut is due').not.toBe('collapse');
        expect(view.me!.worthParts.cut, 'clean air cuts nothing').toBe(0);
      }
      if (state.phase === 'gameOver') atEnd = game.viewFor(null);
    });

    expect([...phases]).toEqual(expect.arrayContaining(['planning', 'landGrant', 'development', 'production', 'auction', 'upkeep', 'gameOver']));
    const end = atEnd as MuleView | null;
    expect(end!.scores!.map((s) => [s.id, s.score]), "game over's final scores are each player's worth").toEqual(end!.players.map((p) => [p.id, p.worth]));
    expect(
      end!.players.some((p) => p.worth !== Math.round(p.money)),
      'worth is more than cash: someone holds goods, land or MULEs',
    ).toBe(true);
    expect(end!.players.find((p) => p.id === 's1')!.plots, "s1's claims, so the phones' parts differ").toBeGreaterThan(0);
  });

  it('T-AC-14: the cash leader is not the Worth leader when another player holds goods, land and MULEs worth more', () => {
    const { game, state } = toDevelopment();
    const rich = player(state, 's1');
    const holder = player(state, 's2');
    for (const g of GOODS) rich.stock[g] = 0;
    rich.money = 4_000;
    holder.money = 1_500;
    holder.stock.food = 12;
    holder.stock.smithore = 10;
    for (const tile of state.tiles.filter((t) => t.owner === null).slice(0, 6)) {
      tile.owner = 's2';
      tile.outfit = 'food';
    }

    for (const viewer of VIEWERS) {
      const view = game.viewFor(viewer);
      const who = viewer ?? 'the board';
      expect(worthIn(view), who).toEqual(ruleWorth(state));
      expect(leaderBy(view, 'money'), `${who}: the cash leader`).toBe('s1');
      expect(leaderBy(view, 'worth'), `${who}: the Worth leader`).toBe('s2');
    }
    const own = game.viewFor('s2').me!.worthParts;
    expect(own.goods).toBeGreaterThan(0);
    expect(own.land).toBeGreaterThan(0);
    expect(own.muleValue).toBeGreaterThan(0);
  });

  it('T-AC-14: a Collapse mid-game cuts every worth, a term in office included, while the air stays in Collapse; outside Collapse the cut is 0', () => {
    const { game, state, advance } = toDevelopment();
    const office = 2 * POLITICS.termScore;
    state.politics = { ...newPolitics(), terms: { s2: 2 } };
    // Cash only, so the Governor's worth before any cut is money + office.
    for (const g of GOODS) player(state, 's2').stock[g] = 0;
    player(state, 's2').money = 1_000;
    const governor = (view: MuleView) => view.players.find((p) => p.id === 's2')!.worth;

    const clean = game.viewFor('s2');
    expect(clean.air.band).toBe('clean');
    expect(clean.me!.worthParts).toMatchObject({ office, cut: 0 });
    expect(governor(clean)).toBe(1_000 + office);

    state.air = airIn('collapse');
    const cutWorth = Math.round((1_000 + office) * POLLUTION.collapseScore);
    const check = () => {
      for (const viewer of VIEWERS) {
        const view = game.viewFor(viewer);
        const who = viewer ?? 'the board';
        expect(view.air.band).toBe('collapse');
        expect(worthIn(view), who).toEqual(ruleWorth(state));
        expect(governor(view), `${who}: the Governor's worth carries the cut office`).toBe(cutWorth);
        if (viewer === null) continue;
        expect(view.me!.worthParts.cut, `${viewer}'s cut`).toBeGreaterThan(0);
        expect(view.players.find((p) => p.id === viewer)!.worth).toBe(partsTotal(view));
      }
      expect(game.viewFor('s2').me!.worthParts).toMatchObject({ office, cut: 1_000 + office - cutWorth });
    };
    check();
    advance(2_000);
    expect(game.viewFor(null).phase).toBe('development');
    check();

    state.air = airIn('clean');
    for (const viewer of ['s1', 's2'] as const) expect(game.viewFor(viewer).me!.worthParts.cut, `${viewer} out of Collapse`).toBe(0);
  });

  it("T-AC-14 (negative, HC-4): the board has no me, and in every phase no player entry in any view carries parts; a phone's parts are only on its own me", () => {
    playTwoMonths((game, state) => {
      const board = game.viewFor(null);
      expect(board.me, `the board in ${state.phase}`).toBeNull();
      expect(JSON.stringify(board), `the board in ${state.phase}`).not.toContain('muleValue');
      for (const viewer of VIEWERS) {
        const view = game.viewFor(viewer);
        expect(JSON.stringify(view.players), `${viewer ?? 'the board'}'s players in ${state.phase}`).not.toContain('muleValue');
        for (const p of view.players) expect(Object.keys(p).filter((k) => /parts/i.test(k)), `${p.id} in ${viewer ?? 'the board'}'s view`).toEqual([]);
        if (viewer === null) continue;
        expect(view.me!.id).toBe(viewer);
        // Outside your own me and your own game-over score line, nothing carries parts.
        expect(JSON.stringify({ ...view, me: null, scores: null })).not.toContain('muleValue');
      }
    });
  });
});
