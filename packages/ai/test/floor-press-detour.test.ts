import { describe, expect, it } from 'vitest';
import { advancePhase, applyReach, buildFloor, createGame, doorPresses, MS_PER_SECOND, player, reachOf, settleMoments, stepFloor, terrainShare, tileIndex, type DevFloor, type FloorConfig, type FloorInput } from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';

describe('a moment never takes the hand off a press it has not read yet (FM-hurry-margin)', () => {
  it('FM-hurry-margin: a glint lit the tick after the MULE is bought is raced with the MULE counted bought, not bought again', () => {
    // Game 7 of T-AC-5's sim sample, month 3, ai0: a glint race started the tick after its BUY took, before its hand read
    // the press. Back from the race the hand walked the buy again, the corral offered nothing to a colonist already
    // leading a MULE, and the hand dropped the MULE's outfit and install and led it into the pub.
    const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    // A plains plot of its own to put the MULE on, as heldDoors gives it (floor-walker-stuck.test.ts).
    for (const t of state.tiles) if (t.owner === ME) t.owner = null;
    state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!.owner = ME;
    const live = simFloorConfig();
    // Every bot races every glint it can (test-local: the race has to happen for the case to mean anything).
    const cfg: FloorConfig = { ...live, glint: { ...live.glint, botShare: 1 } };
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    let floor: DevFloor = buildFloor(state, cfg);
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    // The glint lights on the open tile beside the store's right door: near, and worth the race.
    const lit = state.tiles.find((t) => t.x === store.x + 1 && t.y === store.y)!;
    let lightAt: number | null = null;
    const tickSeconds = cfg.steer.tickMs / MS_PER_SECOND;
    // literal-ok: a bound in ticks, under the clock's
    for (let tick = 0; tick < 500; tick++) {
      const left = 50 - tick * tickSeconds; // literal-ok: seconds on the clock, enough for a MULE and the race
      const input: FloorInput = seat.developSteer(state, floor, left, cfg);
      const spent = doorPresses(floor, state, { [ME]: input }, cfg);
      floor = settleMoments(state, stepFloor(floor, state, { [ME]: input }, cfg.steer.tickMs, cfg));
      if (input.act && !spent.has(ME) && reachOf(floor, state, ME, cfg, { secondsLeft: left }).enabled) {
        const bought = player(state, ME).carriedMule;
        floor = applyReach(state, floor, ME, left, cfg).floor;
        if (bought === null && player(state, ME).carriedMule !== null) lightAt = floor.tick;
      }
      if (lightAt === floor.tick) floor = { ...floor, moments: { ...floor.moments, glint: { x: lit.x, y: lit.y, sinceTick: floor.tick, untilTick: floor.tick + 1_000 } } }; // literal-ok: lit for the rest of the case
      if (player(state, ME).doneDeveloping) break;
    }
    const log = seat.developLog();
    expect(lightAt, 'it bought a MULE').not.toBeNull();
    expect(log.filter((s) => s.action.type === 'buyMule').map((s) => [s.ok, s.why ?? null]), JSON.stringify(log)).toEqual([[true, null]]);
  });
});

describe('a GRAB pressed is a GRAB taken (FM-glint-fade, for FM-hurry-margin)', () => {
  /**
   * One tick of ai0 standing on open land a tile from a glint that fades `fadesIn` ticks on, refereed as the sim's
   * floor-turn.ts does: its input, the step (which fades a glint whose time is up), then its press where Reach offers
   * one. What the press came to: the glint won, the land underfoot analysed, an assay started.
   */
  function pressBesideGlint(fadesIn: number): { won: boolean; analysedUnderfoot: boolean; assaying: boolean } {
    const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    const live = simFloorConfig();
    const cfg: FloorConfig = { ...live, wolves: { ...live.wolves, on: false }, glint: { ...live.glint, on: false } };
    const open = (x: number, y: number) => {
      const t = state.tiles.find((q) => q.x === x && q.y === y);
      return t !== undefined && t.terrain !== 'store' && terrainShare(t.terrain, cfg) > 0 && t.owner === null;
    };
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    // Unowned land not yet analysed, clear of the store, with the glint on the open tile beside it.
    const under = state.tiles.find((t) => open(t.x, t.y) && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) >= 2 && open(t.x + 1, t.y))!;
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    const built = buildFloor(state, cfg);
    let floor: DevFloor = {
      ...built,
      tick: 200,
      colonists: built.colonists.map((c) => (c.id === ME ? { ...c, x: under.x + 0.5, y: under.y + 0.5 } : c)),
      moments: { ...built.moments, glint: { x: under.x + 1, y: under.y, sinceTick: 100, untilTick: 200 + fadesIn } },
    };
    const left = 40; // literal-ok: seconds on the clock, plenty for a grab
    const input: FloorInput = seat.developSteer(state, floor, left, cfg);
    const spent = doorPresses(floor, state, { [ME]: input }, cfg);
    floor = settleMoments(state, stepFloor(floor, state, { [ME]: input }, cfg.steer.tickMs, cfg));
    let won = false;
    if (input.act && !spent.has(ME) && reachOf(floor, state, ME, cfg, { secondsLeft: left }).enabled) {
      const press = applyReach(state, floor, ME, left, cfg);
      floor = press.floor;
      won = press.reach.kind === 'grab';
    }
    const me = floor.colonists.find((c) => c.id === ME)!;
    return { won, analysedUnderfoot: player(state, ME).analysed.includes(tileIndex(state.width, under.x, under.y)), assaying: me.assayUntilTick !== null };
  }

  it('FM-glint-fade: a glint in reach is grabbed while it is lit, and never pressed for on the tick it fades, so the press never analyses the land underfoot', () => {
    // Game 4 of T-AC-5's sim sample, month 4, ai3: racing a glint with its MULE on the lead, it pressed GRAB on the glint's
    // last tick. The step faded the glint before the press applied, so the press fell to ANALYSE of the unowned river
    // underfoot: a 4 s assay no plan had priced, and the MULE was led into the pub a step short of its plot.
    expect(pressBesideGlint(2), 'lit a tick longer: grabbed').toEqual({ won: true, analysedUnderfoot: false, assaying: false });
    expect(pressBesideGlint(1), 'fading this step: no press').toEqual({ won: false, analysedUnderfoot: false, assaying: false });
  });
});
