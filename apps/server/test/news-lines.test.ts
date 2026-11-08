import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pactBreach, WALK, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import type { SeatInfo } from '@tabletop/core';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, throughSidePicks } from './fake-context.js';

/** F-11: each news line names its seats, so a screen can mark a computer seat in it without matching names. */

const TABLE: SeatInfo[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Lena', isAi: false, color: 1 },
  { id: 's3', name: 'The Accountant', isAi: true, color: 2 },
  { id: 's4', name: 'The Gambler', isAi: true, color: 3 },
];

beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** The game's engine state: private to MuleGame, so the cast; the tests set up the cards there. */
const stateOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

describe('MuleView.newsLines: the news, each line with the seats it names', () => {
  // trace-allow: the PM's F-11 ruling (7 Nov), newsLines texts always equal news; no spec AC covers it
  it('newsLines says exactly what news says, line for line, on every screen through a whole month', { timeout: 30_000 }, async () => {
    const fake = fakeContext({ table: TABLE });
    const game = new MuleGame(fake.ctx, 10, { maxMonths: 1, politics: true });
    game.start(TABLE);
    const step = throughSidePicks(game, (ms) => fake.advance(ms));
    const seen = new Set<string>();
    const named = new Set<string>();
    // Views cost: build them only when the news or the phase changes, which is every moment the two could drift apart.
    // The cast reads MuleGame's private news and engine state, so views are built only when either changes.
    const inside = game as unknown as { news: unknown; state: GameState };
    let news: unknown = null;
    let phase: string | null = null;

    for (let t = 0; t < 40 * 60_000 && inside.state.phase !== 'gameOver'; t += WALK.tickMs) {
      if (inside.news !== news) {
        news = inside.news;
        for (const viewer of [null, 's1']) {
          const v: MuleView = game.viewFor(viewer);
          expect(v.newsLines!.map((l) => l.text), `${v.phase} at ${t} ms`).toEqual(v.news);
          for (const l of v.newsLines!) {
            seen.add(l.text);
            if (l.who.length > 0) named.add(l.text);
          }
        }
      }
      if (inside.state.phase !== phase || t % 1000 === 0) {
        phase = inside.state.phase;
        readyAll(game);
      }
      step(WALK.tickMs);
      await Promise.resolve();
    }

    expect(inside.state.phase, 'the premise: the month was played to its end').toBe('gameOver');
    expect(seen.size, 'the premise: the news changed through the month').toBeGreaterThan(3);
    expect(named.size, 'the premise: some line named a seat').toBeGreaterThan(0);
  });

  it('S3-B-AC-4: a broken pact’s line names the breaker, then the other party (F-11)', () => {
    const fake = fakeContext({ table: TABLE });
    const game = new MuleGame(fake.ctx, 10, { politics: true });
    game.start(TABLE);
    game.handle('s1', { type: 'offerDeal', offer: { to: 's2', terms: { kind: 'pact' }, months: 3 } });
    const id = stateOf(game).politics!.deals.at(-1)!.id;
    game.handle('s2', { type: 'answerDeal', id, accept: true });
    pactBreach(stateOf(game), 's2', 's1', stateOf(game).month, true);

    // The next thing the table does: the server notices the break with it.
    game.handle('s1', { type: 'ready' });

    expect(game.viewFor(null).newsLines![0]).toEqual({ text: 'Lena broke a pact with Heiko. Reputation −20.', who: ['s2', 's1'] });
  });

  it('FM-news-who: a news list written from outside as bare strings, or a line without who, still renders on every screen and viewFor never throws', () => {
    const fake = fakeContext({ table: TABLE });
    const game = new MuleGame(fake.ctx, 10, { politics: true });
    game.start(TABLE);
    // As apps/web/e2e/hub-steps.ts's busyNews fixture wrote it before F-11: the room's game, its news replaced.
    (game as unknown as { news: unknown }).news = ['Brix is Governor (appointed).', { text: 'Brix listed plot 3·4.' }, { text: 'Welcome.', who: ['s1'] }];

    for (const viewer of [null, 's1']) {
      const v = game.viewFor(viewer);
      expect(v.news).toEqual(['Brix is Governor (appointed).', 'Brix listed plot 3·4.', 'Welcome.']);
      expect(v.newsLines).toEqual([
        { text: 'Brix is Governor (appointed).', who: [] },
        { text: 'Brix listed plot 3·4.', who: [] },
        { text: 'Welcome.', who: ['s1'] },
      ]);
    }
  });

  // trace-allow: the PM's F-11 ruling (7 Nov), who lists only the seats a line names; no spec AC covers it
  it('a line naming nobody names no seat', () => {
    const fake = fakeContext({ table: TABLE });
    const game = new MuleGame(fake.ctx, 10, { politics: true });
    game.start(TABLE);

    expect(game.viewFor(null).newsLines).toEqual([{ text: 'Welcome to the colony. Talk tactics, then grab land.', who: [] }]);
  });
});
