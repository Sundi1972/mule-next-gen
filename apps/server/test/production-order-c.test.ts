import { PRODUCTION_SHOW, productionEventAtMs, productionShowMs, RuleError, type GameState } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * The production show in Heiko's order C, the server's part (ws6-ux spec AM-19: RULE-3, B-AC-6, B-AC-20). The view
 * carries each plot's base and every part, so a screen can count the base up and land every bonus and loss; the
 * phase lasts RULE-3's length; and once every person at the table has asked, the rest of the show plays
 * PRODUCTION_SHOW.fast times faster on every screen, because the server ends the phase that much sooner.
 */
function inProduction(phaseScale = 1) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, { phaseScale });
  game.start(seats);
  readyAll(game);
  while (game.viewFor(null).phase === 'landGrant') fake.advance(GRANT_TICK_MS);
  // Small steps, so the AI seat develops its land.
  while (game.viewFor(null).phase === 'development') fake.advance(100);
  expect(game.viewFor(null).phase).toBe('production');
  const state: GameState = game['state']!;
  const enteredAt: number = game['phaseEnteredAt'];
  return { game, state, enteredAt, ...fake };
}

/** RULE-3's inputs as the view gives them: the goods made, and the events' length (intro and every play). */
function showInputs(game: MuleGame) {
  const p = game.viewFor(null).production!;
  const goods = new Set(p.lines.map((l) => l.good)).size;
  const eventsMs = p.events.length > 0 ? p.introMs + p.events.reduce((n, e) => n + e.playMs, 0) : 0;
  return { goods, eventsMs };
}

/** WS6's screens' clock (packages/ui showTime): the show second, played back from the phase's end. */
function screenShowSecond(game: MuleGame, now: number): number {
  const v = game.viewFor(null);
  const p = v.production!;
  const { goods, eventsMs } = showInputs(game);
  const end = productionShowMs(goods, eventsMs) / 1_000;
  const rate = p.hurry?.from != null ? PRODUCTION_SHOW.fast : 1;
  return end - ((v.phaseEndsAt! - now) * rate * end) / p.lengthMs;
}

describe('AM-19 B-AC-6: each plot carries its base and every part', () => {
  it('base is the ground (or the factory run), the parts every other reason in the engine’s order, and base + parts = made', () => {
    const { game, state } = inProduction();
    const farm = state.width + 3;
    const works = 5;
    Object.assign(state.tiles[farm]!, { owner: 's1', outfit: 'food' });
    Object.assign(state.tiles[works]!, { owner: 's2', outfit: 'alloy' });
    state.history.at(-1)!.lines = [
      {
        tile: farm,
        good: 'food',
        made: 2,
        parts: [
          { why: 'ground', delta: 3 },
          { why: 'species', delta: 1 },
          { why: 'trait', delta: 0 },
          { why: 'special', delta: 2 },
          { why: 'cluster', delta: 1 },
          { why: 'pollution', delta: -2 },
          { why: 'noWater', delta: -3 },
          { why: 'event', delta: 0, event: 'dustStorm' },
        ],
      },
      { tile: works, good: 'alloy', made: 3, parts: [{ why: 'factory', delta: 3 }] },
    ];
    const lines = game.viewFor('s2').production!.lines;
    expect(lines).toEqual([
      { x: 5, y: 0, owner: 's2', good: 'alloy', base: 3, made: 3, parts: [] },
      {
        x: 3,
        y: 1,
        owner: 's1',
        good: 'food',
        base: 3,
        made: 2,
        parts: [
          { why: 'species', delta: 1 },
          { why: 'special', delta: 2 },
          { why: 'cluster', delta: 1 },
          { why: 'pollution', delta: -2 },
          { why: 'noWater', delta: -3 },
        ],
      },
    ]);
  });

  it('a mine whose deposit fell to nothing still shows its own line at base 0, and the floor that lifts a plot to 0 is a part', () => {
    const { game, state } = inProduction();
    const mine = 4;
    Object.assign(state.tiles[mine]!, { owner: 's1', outfit: 'smithore' });
    state.history.at(-1)!.lines = [
      { tile: mine, good: 'smithore', made: 0, parts: [{ why: 'ground', delta: 1 }, { why: 'pollution', delta: -3 }, { why: 'floor', delta: 2 }] },
    ];
    const [line] = game.viewFor(null).production!.lines;
    expect(line).toMatchObject({ base: 1, made: 0, parts: [{ why: 'pollution', delta: -3 }, { why: 'floor', delta: 2 }] });
    expect(line!.base + line!.parts.reduce((n, p) => n + p.delta, 0)).toBe(line!.made);
  });

  it('in a real month every line adds up: base + Σ parts = made, the units before the events', () => {
    const { game, state } = inProduction();
    const report = state.history.at(-1)!;
    const lines = game.viewFor(null).production!.lines;
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const r = report.lines!.find((x) => x.tile === l.y * state.width + l.x)!;
      const events = r.parts.filter((p) => p.why === 'event').reduce((n, p) => n + p.delta, 0);
      expect(l.made).toBe(r.made - events);
      expect(l.base + l.parts.reduce((n, p) => n + p.delta, 0)).toBe(l.made);
    }
  });
});

describe('AM-19 RULE-3: production lasts the show', () => {
  for (const scale of [1, 0.25]) {
    it(`the phase ends at productionShowMs(goods made, the events' length), and the events start at productionEventAtMs (phaseScale ${scale})`, () => {
      const { game, enteredAt } = inProduction(scale);
      const v = game.viewFor(null);
      const { goods, eventsMs } = showInputs(game);
      const lengthMs = Math.round(productionShowMs(goods, eventsMs) * scale);
      expect(v.phaseEndsAt! - enteredAt).toBe(lengthMs);
      expect(v.production!.lengthMs).toBe(lengthMs);
      if (v.eventShow) expect(v.eventShow.startsAt - enteredAt).toBe(Math.round(productionEventAtMs(goods) * scale));
    });
  }
});

describe('AM-19 B-AC-20: everyone taps ⏩ and the rest plays 3× faster', () => {
  it('one tap speeds nothing; the second person’s tap ends the phase sooner, by the show left over PRODUCTION_SHOW.fast, and every screen agrees on the show second', () => {
    const { game, ctx, advance } = inProduction();
    advance(2_000);
    const before = game.viewFor(null).phaseEndsAt!;
    game.handle('s1', { type: 'hurry' });
    expect(game.viewFor(null).production!.hurry).toEqual({ asked: ['s1'], from: null });
    expect(game.viewFor(null).phaseEndsAt).toBe(before);
    advance(1_000);
    const second = screenShowSecond(game, ctx.now());
    game.handle('s2', { type: 'hurry' });
    const v = game.viewFor(null);
    expect(v.production!.hurry!.asked).toEqual(['s1', 's2']);
    expect(v.production!.hurry!.from).toBeCloseTo(second, 2);
    expect(v.phaseEndsAt).toBe(ctx.now() + Math.round((before - ctx.now()) / PRODUCTION_SHOW.fast));
    // The screens' clock carries on from the same second, three times as fast.
    expect(screenShowSecond(game, ctx.now())).toBeCloseTo(second, 2);
    advance(1_000);
    expect(screenShowSecond(game, ctx.now())).toBeCloseTo(second + PRODUCTION_SHOW.fast, 2);
    // And the phase ends at the new time, not the old.
    advance(v.phaseEndsAt! - ctx.now());
    expect(game.viewFor(null).phase).not.toBe('production');
  });

  it('an AI never has to tap, a tap again changes nothing, and a dropped phone is not waited for', () => {
    const { game, advance } = inProduction();
    game.handle('s1', { type: 'hurry' });
    game.handle('s1', { type: 'hurry' });
    expect(game.viewFor(null).production!.hurry).toEqual({ asked: ['s1'], from: null });
    const before = game.viewFor(null).phaseEndsAt!;
    game.connectionChanged('s2', false);
    const v = game.viewFor(null);
    expect(v.production!.hurry!.from).not.toBeNull();
    expect(v.phaseEndsAt!).toBeLessThan(before);
    advance(1);
  });

  it('a table with nobody asked never speeds up, even with every phone dropped', () => {
    const { game } = inProduction();
    const before = game.viewFor(null).phaseEndsAt;
    game.connectionChanged('s1', false);
    game.connectionChanged('s2', false);
    expect(game.viewFor(null).production!.hurry).toEqual({ asked: [], from: null });
    expect(game.viewFor(null).phaseEndsAt).toBe(before);
  });

  it('the AI seat cannot ask, and outside production a tap is refused with the rules’ words', () => {
    const { game, ctx, advance } = inProduction();
    expect(() => game.handle('s3', { type: 'hurry' })).toThrow(RuleError);
    advance(game.viewFor(null).phaseEndsAt! - ctx.now());
    expect(game.viewFor(null).phase).not.toBe('production');
    expect(() => game.handle('s1', { type: 'hurry' })).toThrow(new RuleError('Nothing to speed up now'));
  });

  it('the next month starts fresh: nobody has asked', () => {
    const { game, ctx, advance } = inProduction();
    game.handle('s1', { type: 'hurry' });
    game.handle('s2', { type: 'hurry' });
    advance(game.viewFor(null).phaseEndsAt! - ctx.now());
    expect(game['hurry'].asked.size).toBe(0);
  });
});
