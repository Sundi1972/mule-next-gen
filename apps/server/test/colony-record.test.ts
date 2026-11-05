import { RuleError, type GameState } from '@mule/engine';
import type { MuleIntent } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { MuleGame } from '../src/mule-game.js';
import { Recorder } from '../src/record.js';
import { replay } from '../src/replay.js';
import { fakeContext, seats } from './fake-context.js';

/** Every seat plays Classic: no Claude call to record. */
const classic: BrainService = { deciderFor: () => null, writerFor: () => null, chatter: (seat, say) => chatter(seat.id, say), finish: () => {} };
const KEY_VAR = 'ANTHROPIC_API_KEY';

describe('T-AC-30: the record replays the colony', () => {
  it('T-AC-30: a recorded game with a commission and a donation replays to the same state hash with the key unset', { timeout: 60_000 }, async () => {
    const savedKey = process.env[KEY_VAR];
    delete process.env[KEY_VAR];
    try {
      // As createRecordedGame builds it, keeping the game itself so the test can read the colony at game over.
      const fake = fakeContext({});
      const options = { maxMonths: 2, politics: true };
      const recorder = new Recorder(fake.ctx, 21, options, classic, null);
      let final: GameState | null = null;
      const inner = new MuleGame(recorder.ctx, 21, {
        ...options,
        brain: recorder.brain,
        // As createRecordedGame wires it: the AI's playbooks belong to the record, or the replay finds ones it lacks.
        recordPlaybook: (entry) => recorder.playbook(entry),
        onGameOver: (state) => {
          final = structuredClone(state);
          recorder.gameOver(state);
        },
      });
      const game = recorder.wrap(inner);
      // Every intent goes through the recorder, so the record holds it; a refusal is recorded with its message too.
      const send = (seat: string, intent: MuleIntent) => {
        try {
          game.handle(seat, intent);
        } catch (err) {
          if (!(err instanceof RuleError)) throw err;
        }
      };
      const sent = new Set<string>();
      const once = (key: string, seat: string, intent: MuleIntent) => {
        if (sent.has(key)) return;
        sent.add(key);
        send(seat, intent);
      };

      game.start(seats);
      for (let i = 0; i < 200_000 && !final; i++) {
        const view = game.viewFor(null);
        const election = view.politics?.election ?? null;
        // Month 1's election: Heiko runs for Governor and both phones vote for him.
        if (view.phase === 'planning' && election?.stage === 'announce') once('run', 's1', { type: 'run', office: 'governor', promise: { kind: 'hold' } });
        if (view.phase === 'planning' && election?.stage === 'ballot') {
          once('vote-s1', 's1', { type: 'vote', office: 'governor', candidate: 's1' });
          once('vote-s2', 's2', { type: 'vote', office: 'governor', candidate: 's1' });
        }
        // Once the votes are over, the Governor commissions a Hospital and Mia gives toward it.
        if (view.phase === 'planning' && (!election || election.stage === 'over') && view.politics?.governor === 's1') {
          once('commission', 's1', { type: 'commission', id: 'hospital' });
          once('donate', 's2', { type: 'donate', id: 'hospital', credits: 50, goods: {} });
        }
        const phase = game.viewFor(null).phase;
        if (phase === 'planning' || phase === 'upkeep') for (const s of seats) if (!s.isAi && game.viewFor(null).phase === phase) game.handle(s.id, { type: 'ready' });
        // A good's side pick has no clock (A-7): each person not yet Done presses Ready there, once an event's show has let go.
        const now = game.viewFor(null);
        const pick = now.phase === 'auction' && now.auction?.stage === 'status' ? now.auction : null;
        if (pick && !(now.eventShow?.held && fake.ctx.now() < now.eventShow.endsAt))
          for (const s of seats) if (!s.isAi && !pick.walkers.find((w) => w.id === s.id)?.done) game.handle(s.id, { type: 'ready' });
        fake.advance(100);
      }
      expect(final, 'the game reached game over').not.toBeNull();
      await new Promise((resolve) => setImmediate(resolve));
      const record = JSON.parse(JSON.stringify(recorder.finished)) as NonNullable<typeof recorder.finished>;

      // The record holds the commission and the donation, both accepted, and the game over shows them.
      const accepted = (type: string) => record.events.filter((e) => e.type === 'intent' && e.intent.type === type && e.refused === undefined);
      expect(accepted('commission'), 'an accepted commission is in the record').toHaveLength(1);
      expect(accepted('donate'), 'an accepted donation is in the record').toHaveLength(1);
      const hospital = (final! as GameState).colony!.projects.find((p) => p.id === 'hospital');
      expect(hospital?.plaque).toEqual({ s2: 50 });

      const result = await replay(record);
      expect(result.stateHash.replayed).toBe(record.outcome!.stateHash);
      expect(result.identical).toBe(true);
    } finally {
      if (savedKey !== undefined) process.env[KEY_VAR] = savedKey;
    }
  });
});
