import { boxOf, doorOutside, floorConfig, HALL, pathTo, type GameState, type HallDoor, type HallPlace, type Outfit } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import type { SeatInfo } from '@tabletop/core';
import type { MuleGame } from '../src/mule-game.js';
import { pressAct, pressThroughSidePick, readyAll, seats, steerTo, toDevelopment as reachDevelopment, type SteerPoint } from './fake-context.js';

/**
 * Month 1 into development with Heiko (s1) owning a land plot two tiles left of the store, on his door's side and out
 * of its reach: a steered colonist installs where it stands, and the grant's first lit plot on seed 7 is a lake that no
 * shore reaches.
 */
function toDevelopment(players?: SeatInfo[]) {
  let plot: { x: number; y: number } | null = null;
  const g = reachDevelopment({
    ...(players && { players }),
    prepare: (state) => {
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const t = state.tiles.find((k) => k.y === store.y && k.x === store.x - 2 && k.owner === null && k.terrain !== 'lake')!;
      t.owner = 's1';
      plot = { x: t.x, y: t.y };
    },
  });
  return { ...g, plot: plot! };
}

// --- Steered development, walked as dev-steer.test.ts walks it: steerTo and pressAct, nothing tapped. ---

/** A steered development as these tests drive it: the game, its fake clock, and its engine state for the map's routes. */
type Floor = { game: MuleGame; advance: (ms: number) => void; state: GameState };
type Spot = { x: number; y: number };

/** Where a seat's colonist stands, as the TV reads it. */
function standing(g: Floor, seat: string): SteerPoint {
  const c = g.game.viewFor(null).players.find((p) => p.id === seat)!.colonist!;
  return { space: c.space!, x: c.x!, y: c.y! };
}

/** The one button, once its words say `verb`: pressed as a phone presses it. */
function press(g: Floor, seat: string, verb: string): void {
  expect(g.game.viewFor(seat).me?.reach?.verb, `${seat}'s button`).toMatch(verb);
  pressAct(g.game, g, seat);
}

/** In the hall: onto the walkway, along it, and into `place` (a door's own spot, else the middle of its room). */
function hallTo(g: Floor, seat: string, place: HallPlace): void {
  const walkway = HALL.floor[0]!;
  const y = (walkway.y0 + walkway.y1) / 2;
  const box = boxOf(place);
  const to = place === 'doorL' || place === 'doorR' ? HALL.spots[place] : { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const at = standing(g, seat);
  steerTo(g.game, g, seat, [{ space: 'hall', x: at.x, y }, { space: 'hall', x: to.x, y }, { space: 'hall', ...to }]);
}

/** On the map: by the engine's quickest route (pathTo, the AI's own), tile centre by tile centre, to `to`. */
function mapTo(g: Floor, seat: string, to: Spot, within?: number): void {
  const path = pathTo(g.state, standing(g, seat), to, floorConfig());
  if (!path) throw new Error(`no route for ${seat} to (${to.x}, ${to.y})`);
  const turns = path.tiles.slice(1, -1).map((t): SteerPoint => ({ space: 'map', x: Math.floor(t.x) + 0.5, y: Math.floor(t.y) + 0.5 }));
  steerTo(g.game, g, seat, [...turns, { space: 'map', ...to }], within === undefined ? {} : { within });
}

/** The store door on a point's side of the store. */
const doorFor = (g: Floor, at: Spot): HallDoor => (at.x < g.state.tiles.find((t) => t.terrain === 'store')!.x ? 'doorL' : 'doorR');

/** Into the store from wherever on the map the colonist stands: to the nearer door's mouth, and ENTER STORE. */
function goIn(g: Floor, seat: string): void {
  const at = standing(g, seat);
  if (at.space === 'hall') return;
  mapTo(g, seat, doorOutside(g.state, doorFor(g, at), floorConfig()), 0.1);
  press(g, seat, 'ENTER STORE');
}

/** BUY MULE at the corral and OUTFIT at `outfit`'s shopfront; the colonist stays in the hall. */
function buyAndOutfit(g: Floor, seat: string, outfit: Outfit): void {
  goIn(g, seat);
  hallTo(g, seat, 'corral');
  press(g, seat, 'BUY MULE');
  hallTo(g, seat, outfit);
  press(g, seat, 'OUTFIT');
}

/** Out by the door on the plot's side with the MULE on its lead, across the map, and INSTALL on the plot. */
function installOn(g: Floor, seat: string, plot: Spot): void {
  if (standing(g, seat).space === 'hall') {
    hallTo(g, seat, doorFor(g, plot));
    press(g, seat, 'LEAVE');
  }
  mapTo(g, seat, { x: plot.x + 0.5, y: plot.y + 0.5 });
  press(g, seat, 'INSTALL');
}

describe("MyView.installedThisTurn: the store's Now line after a reload", () => {
  it('FM-reload-install: true on the installer\'s own view after an install and on a fresh view after a reload, never on another seat\'s, and false again when their next development turn starts', () => {
    const g = toDevelopment();
    const { game, advance, plot } = g;
    expect(game.viewFor('s1').me!.installedThisTurn).toBe(false);
    buyAndOutfit(g, 's1', 'food');
    expect(game.viewFor('s1').me!.installedThisTurn, 'an outfitted MULE still in hand is not installed').toBe(false);
    hallTo(g, 's1', doorFor(g, plot));
    press(g, 's1', 'LEAVE');
    expect(game.viewFor('s1').me!.installedThisTurn, 'leading it out to the plot, nothing is installed yet').toBe(false);
    installOn(g, 's1', plot);

    expect(game.viewFor('s1').me!.installedThisTurn).toBe(true);
    game.connectionChanged('s1', false);
    game.connectionChanged('s1', true);
    expect(game.viewFor('s1').me!.installedThisTurn, 'a fresh view for the same seat after a reload').toBe(true);

    expect(game.viewFor('s2').me!.installedThisTurn).toBe(false);
    const board = game.viewFor(null);
    expect(board.me).toBeNull();
    for (const view of [board, game.viewFor('s2')]) {
      for (const p of view.players) expect(Object.keys(p)).not.toContain('installedThisTurn');
    }

    for (let i = 0; i < 10_000 && !(game.viewFor(null).phase === 'development' && game.viewFor(null).month === 2); i++) {
      // Planning and the month end have no clock (C20).
      if (game.viewFor(null).phase === 'planning' || game.viewFor(null).phase === 'upkeep') readyAll(game);
      pressThroughSidePick(game);
      advance(100);
    }
    expect(game.viewFor(null)).toMatchObject({ phase: 'development', month: 2 });
    expect(game.viewFor('s1').me!.installedThisTurn, "the next development turn starts with nothing installed").toBe(false);
  });

  it('FM-reload-install: a second MULE bought and outfitted after the install leaves it true, and it holds through production and the next planning until that month\'s development starts', () => {
    const g = toDevelopment();
    const { game, advance, plot } = g;
    buyAndOutfit(g, 's1', 'food');
    installOn(g, 's1', plot);
    buyAndOutfit(g, 's1', 'energy');
    expect(game.viewFor('s1').me).toMatchObject({ carriedMule: 'energy', installedThisTurn: true });

    // The flag as s1's phone saw it on entering each phase, keyed "month phase".
    const seen = new Map<string, boolean>();
    for (let i = 0; i < 10_000 && !(game.viewFor(null).phase === 'development' && game.viewFor(null).month === 2); i++) {
      // Planning and the month end have no clock (C20).
      if (game.viewFor(null).phase === 'planning' || game.viewFor(null).phase === 'upkeep') readyAll(game);
      pressThroughSidePick(game);
      advance(100);
      const { month, phase, me } = game.viewFor('s1');
      if (!seen.has(`${month} ${phase}`)) seen.set(`${month} ${phase}`, me!.installedThisTurn);
    }
    expect([...seen.keys()]).toEqual(expect.arrayContaining(['1 production', '1 auction', '1 upkeep', '2 planning', '2 landGrant', '2 development']));
    for (const [at, installed] of seen) expect(installed, at).toBe(at !== '2 development');
  });
});

describe('Installing over a MULE swaps it (Heiko at the table, 5 Nov)', () => {
  /** The plot's MULE as every screen sees it. */
  const outfitOn = (g: Floor, plot: Spot) => g.game.viewFor(null).tiles.find((t) => t.x === plot.x && t.y === plot.y)!.outfit;

  it('B-AC-SWAP-1: after installing a Water MULE over her Food MULE, Heiko leads the Food MULE, and the plot makes Water', () => {
    const g = toDevelopment();
    const { game, plot } = g;
    buyAndOutfit(g, 's1', 'food');
    installOn(g, 's1', plot);
    expect(outfitOn(g, plot)).toBe('food');
    buyAndOutfit(g, 's1', 'water');
    hallTo(g, 's1', doorFor(g, plot));
    press(g, 's1', 'LEAVE');
    mapTo(g, 's1', { x: plot.x + 0.5, y: plot.y + 0.5 });
    press(g, 's1', 'SWAP');
    expect(outfitOn(g, plot)).toBe('water');
    expect(game.viewFor('s1').me!.carriedMule, 'the Food MULE is on his lead, not gone').toBe('food');
  });

  it('B-AC-SWAP-4: a double tap on SWAP never swaps back: right after the swap the plot\'s SWAP is dimmed ("just swapped"), and a second press changes nothing', () => {
    const g = toDevelopment();
    const { game, plot } = g;
    buyAndOutfit(g, 's1', 'food');
    installOn(g, 's1', plot);
    buyAndOutfit(g, 's1', 'water');
    hallTo(g, 's1', doorFor(g, plot));
    press(g, 's1', 'LEAVE');
    mapTo(g, 's1', { x: plot.x + 0.5, y: plot.y + 0.5 });
    press(g, 's1', 'SWAP');
    expect(game.viewFor('s1').me?.reach, 'SWAP stays on the plot the Food MULE just came off, dimmed').toMatchObject({ verb: 'SWAP', enabled: false, detail: expect.stringMatching(/just swapped/i) });
    const seat = () => (game as unknown as { state: GameState }).state.players.find((p) => p.id === 's1')!;
    const before = { money: seat().money, alloy: seat().stock.alloy, analysed: seat().analysed.slice() };
    pressAct(game, g, 's1');
    expect(outfitOn(g, plot), 'the Water MULE stays').toBe('water');
    expect(game.viewFor('s1').me!.carriedMule, 'he still leads the Food MULE').toBe('food');
    expect({ money: seat().money, alloy: seat().stock.alloy, analysed: seat().analysed }, 'the press fell through to nothing else on the tile').toEqual(before);
  });

  it.each(['the pub', 'the clock'] as const)('B-AC-SWAP-2: Heiko\'s turn ends at %s with the swapped-out Food MULE still on his lead: it goes to the corral, and his plot keeps the Water MULE', (end) => {
    // The human seats only: the corral then changes, between the swap and the check, by the Food MULE alone. Re-picked
    // for #366, the plotless-seat fix: with the AI seat at the table, its month-1 plot moved and it now buys a MULE
    // in that window, so the corral read one short of before + 1.
    const g = toDevelopment(seats.filter((s) => !s.isAi));
    const { game, plot } = g;
    buyAndOutfit(g, 's1', 'food');
    installOn(g, 's1', plot);
    buyAndOutfit(g, 's1', 'water');
    hallTo(g, 's1', doorFor(g, plot));
    press(g, 's1', 'LEAVE');
    mapTo(g, 's1', { x: plot.x + 0.5, y: plot.y + 0.5 });
    press(g, 's1', 'SWAP');
    const corral = game.viewFor(null).storeMules;
    if (end === 'the pub') {
      goIn(g, 's1');
      hallTo(g, 's1', 'pub');
      press(g, 's1', 'PUB');
    }
    for (let i = 0; i < 10_000 && game.viewFor(null).phase === 'development'; i++) g.advance(100);
    expect(outfitOn(g, plot), 'never sent home over the new MULE').toBe('water');
    expect(game.viewFor(null).storeMules, 'the Food MULE is in the corral, on every screen').toBe(corral + 1);
    expect(game.viewFor('s1').me!.carriedMule).toBeNull();
  });

  it('B-AC-SWAP-5: Heiko\'s own view says he leads a swapped-out MULE (the phone\'s warning) only from the swap until his turn ends; a MULE he bought never, nor any other seat\'s view', () => {
    const g = toDevelopment(seats.filter((s) => !s.isAi));
    const { game, plot } = g;
    buyAndOutfit(g, 's1', 'food');
    installOn(g, 's1', plot);
    buyAndOutfit(g, 's1', 'water');
    hallTo(g, 's1', doorFor(g, plot));
    press(g, 's1', 'LEAVE');
    mapTo(g, 's1', { x: plot.x + 0.5, y: plot.y + 0.5 });
    expect(game.viewFor('s1').me!.leadsSwapped, 'the Water MULE he bought').toBeUndefined();
    press(g, 's1', 'SWAP');
    expect(game.viewFor('s1').me!.leadsSwapped, 'the Food MULE he swapped off').toBe(true);
    expect(game.viewFor('s2').me!.leadsSwapped, "another seat's own view").toBeUndefined();
    for (const view of [game.viewFor(null), game.viewFor('s2')]) for (const p of view.players) expect(Object.keys(p)).not.toContain('leadsSwapped');
    for (let i = 0; i < 10_000 && game.viewFor(null).phase === 'development'; i++) g.advance(100);
    expect(game.viewFor('s1').me!.leadsSwapped, 'the turn ended: the MULE is in the corral').toBeUndefined();
  });

  it('B-AC-SWAP-3: over a MULE with the same outfit the button is dimmed and says so, and a press changes nothing: Heiko keeps his MULE, the plot keeps its own', () => {
    const g = toDevelopment();
    const { game, plot } = g;
    buyAndOutfit(g, 's1', 'food');
    installOn(g, 's1', plot);
    buyAndOutfit(g, 's1', 'food');
    hallTo(g, 's1', doorFor(g, plot));
    press(g, 's1', 'LEAVE');
    mapTo(g, 's1', { x: plot.x + 0.5, y: plot.y + 0.5 });
    expect(game.viewFor('s1').me?.reach).toMatchObject({ verb: 'SWAP', detail: 'same outfit, nothing to swap', enabled: false });
    expect(() => press(g, 's1', 'SWAP')).not.toThrow();
    expect(outfitOn(g, plot)).toBe('food');
    expect(game.viewFor('s1').me!.carriedMule, 'still on his lead').toBe('food');
  });
});
