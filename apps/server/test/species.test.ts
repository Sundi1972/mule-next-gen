import type { MuleIntent, MuleView, ServerEnvelope } from '@mule/protocol';
import type { Connection, Room } from '@tabletop/core';
import { afterEach, expect, it } from 'vitest';
import { createMuleServer, type MuleServer } from '../src/server.js';

let running: MuleServer | null = null;
let room: Room<MuleIntent, MuleView> | null = null;
afterEach(async () => {
  room?.dispose();
  room = null;
  await running?.close();
  running = null;
});

/** A phone talking to its room the way server.ts's socket handler does, minus the socket. */
function phone(target: Room<MuleIntent, MuleView>) {
  const inbox: ServerEnvelope<MuleView>[] = [];
  const conn: Connection<MuleView> = { send: (msg) => inbox.push(msg) };
  const from = { seatId: null as string | null };
  return {
    inbox,
    send: (msg: object) => target.receive(conn, from, msg as never),
    lastView: () => inbox.filter((m) => m.t === 'view').at(-1) as Extract<ServerEnvelope<MuleView>, { t: 'view' }>,
    lastError: () => (inbox.filter((m) => m.t === 'error').at(-1) as { message: string } | undefined)?.message,
  };
}

/** The room sends views on a microtask, so several changes in one tick go out as one. */
const settled = () => new Promise<void>((r) => setTimeout(r, 0));

it('T-AC-3: a picked species reaches the game; a seat that never picked and an AI seat keep the default', async () => {
  running = createMuleServer({ seed: () => 42 });
  room = running.registry.create();

  const heiko = phone(room);
  heiko.send({ t: 'join', code: room.code, name: 'Heiko' });
  const mia = phone(room);
  mia.send({ t: 'join', code: room.code, name: 'Mia' });

  mia.send({ t: 'pick', pick: 'quibbit' });
  heiko.send({ t: 'pick', pick: 'dragon' });
  expect(heiko.lastError()).toBe('Unknown choice');

  heiko.send({ t: 'addAi' });
  heiko.send({ t: 'start' });
  await settled();

  const view = heiko.lastView().view;
  expect(view.status).toBe('playing');
  expect(view.game?.players.map((p) => [p.name, p.isAi, p.species])).toEqual([
    ['Heiko', false, 'zipwing'], // never picked (its refused pick stored nothing): DEFAULT_SPECIES[0]
    ['Mia', false, 'quibbit'], // picked: not DEFAULT_SPECIES[1], which is bramblet
    ['The Accountant', true, 'gearling'], // AI seats never pick: DEFAULT_SPECIES[2]
  ]);
  expect(mia.lastView().view.game?.me?.species).toBe('quibbit');
});
