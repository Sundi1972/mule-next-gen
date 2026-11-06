import { describe, expect, it } from 'vitest';
import { advancePhase, applyReach, buildFloor, createGame, doorPresses, glintMiddle, MS_PER_SECOND, player, pressOrder, reachOf, settleMoments, stepFloor, terrainShare, tileIndex, type DevFloor, type FloorConfig, type FloorInput } from '@mule/engine';
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
  const RIVAL = 'ai1';

  /**
   * ai1 on the map `gap` tiles from the glint's middle: pressing GRAB this tick (`presses`), walking towards the glint
   * as it does (`walks`, so a rival a step short of GRAB's reach is in it when the press applies), or standing idle.
   */
  type Rival = { gap: number; presses: boolean; walks?: boolean };

  /** What the tick came to: who holds the glint, whether ai0 analysed the land underfoot or started an assay, and how far it then stands from the glint. */
  type GlintTick = { holder: string | null; analysedUnderfoot: boolean; assaying: boolean; belowGrab: boolean; rivalInReach: boolean; rivalFirst: boolean; gapBefore: number; gapAfter: number };

  /**
   * One tick of ai0 standing on open land a tile from a glint that fades `fadesIn` ticks on, refereed as the sim's
   * floor-turn.ts does: every seat's input, the step (which fades a glint whose time is up, and gives it to a colonist
   * on its tile), then the presses in the tick's press order, each where Reach then offers one. With `rival`, ai1 stands
   * by the glint; with `analysed`, ai0 has analysed the land underfoot already, so no row below GRAB is on offer to it.
   * `belowGrab`: whether a row below GRAB was on offer to ai0 as it chose (what its press becomes with the glint gone).
   */
  function glintTick(fadesIn: number, { rival, analysed = false }: { rival?: Rival; analysed?: boolean } = {}): GlintTick {
    const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    const live = simFloorConfig();
    const cfg: FloorConfig = { ...live, wolves: { ...live.wolves, on: false }, glint: { ...live.glint, on: false } };
    const tile = (x: number, y: number) => state.tiles.find((q) => q.x === x && q.y === y);
    const open = (x: number, y: number) => {
      const t = tile(x, y);
      return t !== undefined && t.terrain !== 'store' && terrainShare(t.terrain, cfg) > 0 && t.owner === null;
    };
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    // Unowned land not yet analysed, clear of the store, with the glint on the open tile beside it.
    const under = state.tiles.find((t) => open(t.x, t.y) && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) >= 2 && open(t.x + 1, t.y))!;
    if (analysed) player(state, ME).analysed.push(tileIndex(state.width, under.x, under.y));
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    const built = buildFloor(state, cfg);
    // With a rival by, the first tick from 200 on whose presses (read after its step) put the rival ahead of ai0.
    const ahead = (t: number) => pressOrder({ ...built, tick: t + 1 }, [ME, RIVAL])[0] === RIVAL;
    let tick = 200; // literal-ok: a tick well into the turn
    while (rival && !ahead(tick)) tick++;
    const glint = { x: under.x + 1, y: under.y, sinceTick: 100, untilTick: tick + fadesIn };
    const mid = glintMiddle(glint);
    // The rival's spot: `gap` from the glint's middle, away from ai0, on open land off the glint's tile.
    const spot = rival && [[1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: mid.x + dx! * rival.gap, y: mid.y + dy! * rival.gap })).find((p) => {
      const [x, y] = [Math.floor(p.x), Math.floor(p.y)];
      return open(x, y) && !(x === glint.x && y === glint.y);
    })!;
    let floor: DevFloor = {
      ...built,
      tick,
      colonists: built.colonists.map((c) => (c.id === ME ? { ...c, x: under.x + 0.5, y: under.y + 0.5 } : c.id === RIVAL && spot ? { ...c, space: 'map' as const, ...spot } : c)),
      moments: { ...built.moments, glint },
    };
    const left = 40; // literal-ok: seconds on the clock, plenty for a grab
    const gapOf = (f: DevFloor, id: string) => {
      const c = f.colonists.find((x) => x.id === id)!;
      return Math.hypot(c.x - mid.x, c.y - mid.y);
    };
    const belowGrab = reachOf({ ...floor, moments: { ...floor.moments, glint: null } }, state, ME, cfg, { secondsLeft: left }).enabled;
    const gapBefore = gapOf(floor, ME);
    const inputs: Record<string, FloorInput> = { [ME]: seat.developSteer(state, floor, left, cfg) };
    if (rival) {
      const toward = { x: (mid.x - spot!.x) / rival.gap, y: (mid.y - spot!.y) / rival.gap };
      inputs[RIVAL] = { ...(rival.walks ? toward : { x: 0, y: 0 }), act: rival.presses };
    }
    const spent = doorPresses(floor, state, inputs, cfg);
    floor = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
    const rivalInReach = rival !== undefined && gapOf(floor, RIVAL) <= cfg.glint.grabReach;
    const rivalFirst = pressOrder(floor, [ME, RIVAL])[0] === RIVAL;
    const pressing = Object.keys(inputs).filter((id) => inputs[id]!.act && !spent.has(id));
    for (const id of pressOrder(floor, pressing)) {
      if (reachOf(floor, state, id, cfg, { secondsLeft: left }).enabled) floor = applyReach(state, floor, id, left, cfg).floor;
    }
    const holder = floor.moments.beats.find((b) => b.kind === 'glint' && b.who !== null)?.who ?? null;
    const me = floor.colonists.find((c) => c.id === ME)!;
    // Analysed this tick: the land underfoot, if it was not before.
    const analysedUnderfoot = !analysed && player(state, ME).analysed.includes(tileIndex(state.width, under.x, under.y));
    return { holder, analysedUnderfoot, assaying: me.assayUntilTick !== null, belowGrab, rivalInReach, rivalFirst, gapBefore, gapAfter: gapOf(floor, ME) };
  }

  /** ai0 alone by the glint: the tick as FM-glint-fade's rows read it. */
  function pressBesideGlint(fadesIn: number): { won: boolean; analysedUnderfoot: boolean; assaying: boolean } {
    const t = glintTick(fadesIn);
    return { won: t.holder === ME, analysedUnderfoot: t.analysedUnderfoot, assaying: t.assaying };
  }

  it('FM-glint-fade: a glint in reach is grabbed while it is lit, and never pressed for on the tick it fades, so the press never analyses the land underfoot', () => {
    // Game 4 of T-AC-5's sim sample, month 4, ai3: racing a glint with its MULE on the lead, it pressed GRAB on the glint's
    // last tick. The step faded the glint before the press applied, so the press fell to ANALYSE of the unowned river
    // underfoot: a 4 s assay no plan had priced, and the MULE was led into the pub a step short of its plot.
    expect(pressBesideGlint(2), 'lit a tick longer: grabbed').toEqual({ won: true, analysedUnderfoot: false, assaying: false });
    expect(pressBesideGlint(1), 'fading this step: no press').toEqual({ won: false, analysedUnderfoot: false, assaying: false });

    // Seed 1 of T-AC-5's sim sample, month 11, ai0 (c20e1360): leading its MULE out to its plot, it pressed GRAB on a glint
    // lit beside it, and ai3, ahead of it in the tick's press order, grabbed it first. Its press fell to ANALYSE of the
    // land underfoot: an 8 s assay no plan had priced, and the hurry for the pub gave the MULE's install up. So where a
    // row below GRAB is on offer, it never presses for a glint a rival may take first: it races for the glint's tile, or
    // stands, and starts no assay.
    const lit = 1_000; // literal-ok: ticks the glint stays lit, far past this tick
    const reach = simFloorConfig().glint.grabReach;
    const inReach = glintTick(lit, { rival: { gap: reach - 0.3, presses: true } }); // literal-ok: well inside GRAB's reach
    expect([inReach.belowGrab, inReach.rivalInReach, inReach.rivalFirst], 'the case: ANALYSE below GRAB, a rival in reach ahead in the press order').toEqual([true, true, true]);
    expect.soft({ holder: inReach.holder, analysedUnderfoot: inReach.analysedUnderfoot, assaying: inReach.assaying }, 'a rival in reach, pressing first').toEqual({ holder: 'ai1', analysedUnderfoot: false, assaying: false });
    expect.soft(inReach.gapAfter, 'it walks for the glint, or stands').toBeLessThanOrEqual(inReach.gapBefore);

    // A rival a step short of GRAB's reach, walking in as it presses: in reach when the press applies.
    const stepShort = glintTick(lit, { rival: { gap: reach + 0.05, presses: true, walks: true } }); // literal-ok: under one step outside GRAB's reach
    expect([stepShort.belowGrab, stepShort.rivalInReach, stepShort.rivalFirst], 'the case: ANALYSE below GRAB, the rival in reach after its step, ahead in the press order').toEqual([true, true, true]);
    expect.soft({ holder: stepShort.holder, analysedUnderfoot: stepShort.analysedUnderfoot, assaying: stepShort.assaying }, 'a rival a step short of reach').toEqual({ holder: 'ai1', analysedUnderfoot: false, assaying: false });
    expect.soft(stepShort.gapAfter, 'it walks for the glint, or stands').toBeLessThanOrEqual(stepShort.gapBefore);

    // The control: the same rival in reach (idle, which the seat cannot tell from about to press), but the land underfoot
    // analysed already, so a GRAB lost costs nothing. The guard does not make it timid where nothing is at stake: it grabs.
    const noCost = glintTick(lit, { rival: { gap: reach - 0.3, presses: false }, analysed: true }); // literal-ok: as above
    expect([noCost.belowGrab, noCost.rivalInReach], 'the case: nothing below GRAB, a rival in reach').toEqual([false, true]);
    expect.soft({ holder: noCost.holder, assaying: noCost.assaying }, 'no row below GRAB: grabbed').toEqual({ holder: ME, assaying: false });

    // No rival near, a row below GRAB on offer: it grabs while the glint is lit, as before.
    const alone = glintTick(lit);
    expect(alone.belowGrab, 'the case: ANALYSE below GRAB').toBe(true);
    expect.soft({ holder: alone.holder, assaying: alone.assaying }, 'no rival near: grabbed').toEqual({ holder: ME, assaying: false });
  });
});
