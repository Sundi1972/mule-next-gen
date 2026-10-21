import type { AddressInfo } from 'node:net';
import { PLAYER_COLORS, type MuleView, type ServerEnvelope } from '@mule/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMuleServer, type MuleServer } from '../src/server.js';

let running: MuleServer | null = null;
afterEach(async () => {
  await running?.close();
  running = null;
});

async function newRoom() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  const { code } = (await (await fetch(`http://localhost:${port}/rooms`, { method: 'POST' })).json()) as { code: string };
  return { code, ws: `ws://localhost:${port}/ws` };
}

async function screen(url: string) {
  const socket = new WebSocket(url);
  const inbox: ServerEnvelope<MuleView>[] = [];
  socket.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => socket.once('open', r));
  const send = (msg: object) => socket.send(JSON.stringify(msg));
  const waitFor = async <T extends ServerEnvelope<MuleView>['t']>(t: T, pred: (m: Extract<ServerEnvelope<MuleView>, { t: T }>) => boolean = () => true) => {
    for (let i = 0; i < 200; i++) {
      const hit = inbox.filter((m) => m.t === t).reverse().find((m) => pred(m as never));
      if (hit) return hit as Extract<ServerEnvelope<MuleView>, { t: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${t} message`);
  };
  return { send, waitFor };
}

/** Heiko hosts, Mia joins, an AI is added, and a board watches. */
async function table() {
  const { code, ws } = await newRoom();
  const heiko = await screen(ws);
  heiko.send({ t: 'join', code, name: 'Heiko' });
  await heiko.waitFor('welcome');
  const mia = await screen(ws);
  mia.send({ t: 'join', code, name: 'Mia' });
  await mia.waitFor('welcome');
  const tv = await screen(ws);
  tv.send({ t: 'board', code });
  heiko.send({ t: 'addAi' });
  await tv.waitFor('view', (m) => m.view.seats.length === 3);
  return { heiko, mia, tv };
}

const slots = (view: MuleView) => view.players.map((p) => [p.name, p.slot, p.color]);

describe('the game draws each player in the colour their seat chose', () => {
  it("T-AC-13: players carry their seat's colour — Mia picks 4, Heiko takes the AI's 2, and every screen's game view says so", async () => {
    const { heiko, mia, tv } = await table();
    mia.send({ t: 'color', color: 4 });
    await tv.waitFor('view', (m) => m.view.seats[1]?.color === 4);
    heiko.send({ t: 'color', color: 2 });
    await tv.waitFor('view', (m) => m.view.seats[0]?.color === 2);

    heiko.send({ t: 'start' });

    const shared = await tv.waitFor('view', (m) => m.view.status === 'playing');
    const mine = await mia.waitFor('view', (m) => m.view.status === 'playing');
    const expected = [
      ['Heiko', 2, PLAYER_COLORS[2]],
      ['Mia', 4, PLAYER_COLORS[4]],
      [shared.view.seats[2]!.name, 0, PLAYER_COLORS[0]],
    ];
    expect(slots(shared.view.game!)).toEqual(expected);
    expect(slots(mine.view.game!)).toEqual(expected);
  });

  it('T-AC-13: a room where nobody picks gives slot i to player i, exactly as before', async () => {
    const { heiko, tv } = await table();

    heiko.send({ t: 'start' });

    const shared = await tv.waitFor('view', (m) => m.view.status === 'playing');
    expect(shared.view.game!.players.map((p) => p.slot)).toEqual([0, 1, 2]);
  });

  it('T-AC-13: a colour that is not a number is a bad message, and changes nothing', async () => {
    const { mia, tv } = await table();

    mia.send({ t: 'color', color: 'red' });

    expect((await mia.waitFor('error')).message).toBe('Bad message');
    mia.send({ t: 'color', color: 5 });
    const after = await tv.waitFor('view', (m) => m.view.seats[1]?.color === 5);
    expect(after.view.seats.map((s) => s.color)).toEqual([0, 5, 2]);
  });
});
