/** A whatIf month on the server gives the event loop back every slice, so every other room keeps ticking (WS1's review of #326). */
import { describe, expect, it } from 'vitest';
import { BRAIN, createGame } from '@mule/engine';
import { toolsFor, type WhatIfSim } from '@mule/ai';
import { timeSlicer } from '../src/brain/slice.js';

describe('timeSlicer: the pause a whatIf month takes between its steps', () => {
  it('yields nothing until a slice has run, then yields to the event loop and starts the next slice', async () => {
    let t = 0;
    let yields = 0;
    const pause = timeSlicer(10, () => t, () => (yields++, Promise.resolve()));
    t = 9;
    expect(pause()).toBeUndefined();
    t = 10;
    await pause();
    expect(yields).toBe(1);
    t = 19;
    expect(pause()).toBeUndefined();
    t = 20;
    await pause();
    expect(yields).toBe(2);
  });

  it("another room's timer due now fires while a whatIf is still playing its month", async () => {
    const state = createGame({ seed: 7, players: [{ id: 'a', name: 'Ada', isAi: true }, { id: 'b', name: 'Bo', isAi: false }] });
    const sim: WhatIfSim = {
      seats: state.players.map((p, i) => ({ id: p.id, persona: 'trader', level: 'trader', seed: 500 + i })),
      playbook: () => ({
        playbook: { v: 1, seat: 'a', month: 1, phase: 'planning', strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 3, byMonth: 3 }, stances: {}, reason: 'test' }, by: 'engine' },
        rejected: [],
      }),
      pause: timeSlicer(BRAIN.whatIfSliceMs),
    };
    let ticked = false;
    let answered = false;
    setTimeout(() => {
      ticked = true;
      expect(answered).toBe(false);
    }, 0);
    const answer = await toolsFor(state, 'a', sim).run('whatIf', { edits: [] });
    answered = true;
    expect(answer.is_error).toBeUndefined();
    expect(ticked).toBe(true);
  });
});
