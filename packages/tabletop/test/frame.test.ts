import { describe, expect, it } from 'vitest';
import { Room, type Connection, type Game, type GameContext, type ServerEnvelope } from '../src/index.js';

/** A tap changes the game; a steer only nudges a position the game streams in frames; `framing` sends a frame mid-move. */
type Intent = { kind: 'tap' | 'steer' | 'steerAndChange'; framing?: unknown };
type View = { taps: number };

/** A game that streams frames through its context; with `quiet`, it says a steer needs no full view. */
function arcadeGame(ctx: GameContext, quiet: boolean): Game<Intent, View> {
  let taps = 0;
  return {
    start() {},
    handle(_seatId, intent) {
      if (intent.framing !== undefined) ctx.frame(intent.framing);
      if (intent.kind === 'tap') taps++;
      // A steer that changes what a screen shows asks for its own view, as a seat whose reach changed would.
      if (intent.kind === 'steerAndChange') ctx.changed();
    },
    viewFor() {
      return { taps };
    },
    ...(quiet ? { quiet: (intent: Intent) => intent.kind !== 'tap' } : {}),
  };
}

/** A screen whose socket can fall behind: while `lagging`, the room should skip its frames. */
class Screen implements Connection<View> {
  readonly inbox: ServerEnvelope<View>[] = [];
  readonly from = { seatId: null as string | null };
  lagging = false;
  send(msg: ServerEnvelope<View>) {
    this.inbox.push(msg);
  }
  behind() {
    return this.lagging;
  }
  frames() {
    return this.inbox.filter((m) => m.t === 'frame').map((m) => (m as Extract<ServerEnvelope<View>, { t: 'frame' }>).payload);
  }
  kinds() {
    return this.inbox.map((m) => m.t);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Heiko and Mia seated, a board watching, the game started, and every inbox emptied. */
async function table(options: { quiet?: boolean } = {}) {
  let ctx!: GameContext;
  let tokens = 0;
  const room = new Room<Intent, View>({
    code: 'ARCD',
    createGame: (c) => {
      ctx = c;
      return arcadeGame(c, options.quiet ?? false);
    },
    emotes: ['Nice!'],
    newToken: () => `t${++tokens}`,
  });
  const seat = (name: string) => {
    const screen = new Screen();
    room.receive(screen, screen.from, { t: 'join', code: room.code, name });
    return screen;
  };
  const heiko = seat('Heiko');
  const mia = seat('Mia');
  const tv = new Screen();
  room.receive(tv, tv.from, { t: 'board', code: room.code });
  room.receive(heiko, heiko.from, { t: 'start' });
  await flush();
  const screens = [heiko, mia, tv];
  for (const s of screens) s.inbox.length = 0;
  const intent = (by: Screen, i: Intent) => room.receive(by, by.from, { t: 'intent', intent: i });
  return { room, ctx, heiko, mia, tv, screens, intent };
}

describe('the frame channel', () => {
  it('T-AC-4: one frame per tick reaches every connection', async () => {
    const { ctx, screens } = await table();
    const ticks = [{ tick: 1, colonists: [{ id: 's1', x: 5.42, y: 3.08 }] }, { tick: 2, colonists: [{ id: 's1', x: 5.5, y: 3.08 }] }];
    for (const payload of ticks) ctx.frame(payload);
    for (const screen of screens) {
      expect(screen.frames(), 'each seat and the board, one per tick, in order').toHaveLength(2);
      // The room passes the payload through as the game built it: never rounded, copied or wrapped.
      expect(screen.frames()[0]).toBe(ticks[0]);
      expect(screen.frames()[1]).toBe(ticks[1]);
    }
    await flush();
    for (const screen of screens) expect(screen.kinds(), 'a frame is not a change: no full view follows it').toEqual(['frame', 'frame']);
  });

  it('T-AC-4: a frame is dropped, not queued, for a connection that is behind', async () => {
    const { ctx, heiko, mia, tv } = await table();
    mia.lagging = true;
    ctx.frame({ tick: 1 });
    ctx.frame({ tick: 2 });
    expect(mia.frames(), 'nothing while behind').toEqual([]);
    expect(heiko.frames()).toEqual([{ tick: 1 }, { tick: 2 }]);
    expect(tv.frames()).toEqual([{ tick: 1 }, { tick: 2 }]);
    mia.lagging = false;
    ctx.frame({ tick: 3 });
    ctx.changed();
    await flush();
    expect(mia.frames(), 'caught up: the next frame only; the skipped ones never arrive').toEqual([{ tick: 3 }]);
    expect(heiko.frames()).toEqual([{ tick: 1 }, { tick: 2 }, { tick: 3 }]);
  });

  it('T-AC-4 (negative): a full view is never held back for a connection that is behind', async () => {
    const { room, ctx, mia, tv } = await table();
    mia.lagging = true;
    tv.lagging = true;
    ctx.frame({ tick: 1 });
    ctx.changed();
    await flush();
    expect(mia.kinds(), 'a seat that is behind still gets its view').toEqual(['view']);
    expect(tv.kinds(), 'a board that is behind still gets the shared view').toEqual(['view']);
    // Nor anything else the room says to everyone.
    room.receive(mia, mia.from, { t: 'emote', emote: 'Nice!' });
    room.receive(mia, mia.from, { t: 'chat', text: 'wait for me' });
    expect(mia.kinds()).toEqual(['view', 'emote', 'chat']);
    expect(tv.kinds()).toEqual(['view', 'emote', 'chat']);
  });

  it('T-AC-4 (negative, AM-13): a quiet intent sends no full view', async () => {
    const quiet = await table({ quiet: true });
    quiet.intent(quiet.heiko, { kind: 'steer' });
    await flush();
    for (const screen of quiet.screens) expect(screen.kinds(), 'nothing goes out after a steer').toEqual([]);

    quiet.intent(quiet.heiko, { kind: 'tap' });
    await flush();
    for (const screen of quiet.screens) expect(screen.kinds(), 'another intent still broadcasts').toEqual(['view']);
    expect(quiet.tv.inbox.at(-1)).toMatchObject({ t: 'view', view: { game: { taps: 1 } } });

    for (const screen of quiet.screens) screen.inbox.length = 0;
    quiet.intent(quiet.heiko, { kind: 'steerAndChange' });
    await flush();
    for (const screen of quiet.screens) expect(screen.kinds(), 'a change the game makes itself still goes out').toEqual(['view']);

    const loud = await table();
    loud.intent(loud.heiko, { kind: 'steer' });
    await flush();
    for (const screen of loud.screens) expect(screen.kinds(), 'a game without quiet broadcasts as before').toEqual(['view']);
  });

  it('T-AC-4: a frame goes out at once, not in the next view\'s batch', async () => {
    const { heiko, mia, tv, intent } = await table();
    intent(heiko, { kind: 'tap', framing: { tick: 7 } });
    for (const screen of [heiko, mia, tv]) expect(screen.kinds(), 'already sent, before the view is').toEqual(['frame']);
    await flush();
    for (const screen of [heiko, mia, tv]) expect(screen.kinds(), 'the frame first, then the view the tap changed').toEqual(['frame', 'view']);
  });
});
