import { EVENTS, type GameState, type Phase } from '@mule/engine';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { MuleGame } from '../src/mule-game.js';
import { Recorder } from '../src/record.js';
import { replay } from '../src/replay.js';
import { fakeContext, seats } from './fake-context.js';

const WAVE_TWO = ['federationTax', 'federationGrant', 'immigrationWave', 'epidemic', 'coldSnap', 'meteorStrike', 'pirateRaid', 'storeFire', 'inheritance', 'muleTheft', 'ratsInSilo', 'crookedAccountant', 'packageFromHome'];
type Row = { phases: Partial<Record<Phase, number>>; cap: number };
const rows = () => (Object.entries({ ...EVENTS.colony, ...EVENTS.player }) as [string, Row][]).filter(([key]) => WAVE_TWO.includes(key)).map(([, row]) => row);
const saved = { firstMonth: EVENTS.firstMonth, rows: rows().map((row) => ({ row, phases: { ...row.phases }, cap: row.cap })) };
afterEach(() => {
  EVENTS.firstMonth = saved.firstMonth;
  for (const { row, phases, cap } of saved.rows) Object.assign(row, { phases, cap });
});

/** Every seat plays Classic: no Claude call to record. */
const classic: BrainService = { deciderFor: () => null, writerFor: () => null, chatter: (seat, say) => chatter(seat.id, say), finish: () => {} };

describe('T-AC-4: a game record replays every wave-2 event', () => {
  it('a recorded two-month game with wave-2 events in every phase replays to the same final state', { timeout: 60_000 }, async () => {
    // Every wave-2 row at an even chance from month 1, the rest as configured: a short game fires many of them.
    EVENTS.firstMonth = 1;
    for (const row of rows()) Object.assign(row, { phases: Object.fromEntries(Object.keys(row.phases).map((p) => [p, 0.5])), cap: 1 });

    // As createRecordedGame builds it, keeping the game itself so the test can read what fired.
    const fake = fakeContext({});
    const options = { maxMonths: 2, politics: false };
    const recorder = new Recorder(fake.ctx, 21, options, classic, null);
    let final: GameState | null = null;
    const inner = new MuleGame(recorder.ctx, 21, {
      ...options,
      brain: recorder.brain,
      recordPlaybook: (entry) => recorder.playbook(entry),
      onGameOver: (state) => {
        final = structuredClone(state);
        recorder.gameOver(state);
      },
    });
    const game = recorder.wrap(inner);
    game.start(seats);
    for (let i = 0; i < 200_000 && !final; i++) {
      const phase = game.viewFor(null).phase;
      if (phase === 'planning' || phase === 'upkeep') for (const s of seats) if (!s.isAi && game.viewFor(null).phase === phase) game.handle(s.id, { type: 'ready' });
      // A good's side pick has no clock (A-7): each person not yet Done presses Ready there, through the recorder so the
      // record holds it, once an event's show has let go of the table.
      const view = game.viewFor(null);
      const pick = view.phase === 'auction' && view.auction?.stage === 'status' ? view.auction : null;
      if (pick && !(view.eventShow?.held && fake.ctx.now() < view.eventShow.endsAt))
        for (const s of seats) if (!s.isAi && !pick.walkers.find((w) => w.id === s.id)?.done) game.handle(s.id, { type: 'ready' });
      fake.advance(100);
    }
    expect(final, 'the game reached game over').not.toBeNull();
    await new Promise((resolve) => setImmediate(resolve));
    const record = JSON.parse(JSON.stringify(recorder.finished)) as NonNullable<typeof recorder.finished>;

    const fired = (final! as GameState).history.flatMap((h) => h.events ?? []).filter((e) => WAVE_TWO.includes(e.key));
    const phases = new Set(fired.map((e) => e.phase));
    expect([...phases].sort(), 'wave-2 events fired in every phase that rolls them').toEqual(['auction', 'development', 'planning', 'production', 'upkeep']);

    const result = await replay(record);
    // The state hash covers every month report's events and the month's own list: the replay fired the same ones.
    expect(result.stateHash.replayed).toBe(record.outcome!.stateHash);
    expect(result.identical).toBe(true);
  });
});
