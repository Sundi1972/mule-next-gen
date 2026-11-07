import type { AddressInfo } from 'node:net';
import type { MuleView, ServerEnvelope } from '@mule/protocol';
import type { GameContext } from '@tabletop/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { familyFilter } from '../src/family-filter.js';
import { MuleGame } from '../src/mule-game.js';
import { createMuleServer, type MuleServer } from '../src/server.js';

describe('the family filter: a matched word is masked, the rest of the line is kept', () => {
  it.each([
    ['what the fuck', 'what the ****'],
    ['sh1t happens', '**** happens'],
    ['FUCK this market', '**** this market'],
    ['du Arschloch', 'du *********'],
    ['Das ist Scheiße', 'Das ist *******'],
    ['scheisse!', '********!'],
    ['fick dich, Kai', '**** dich, Kai'],
    ['HURENSOHN', '*********'],
  ])('masks %j as %j', (line, masked) => {
    expect(familyFilter(line)).toBe(masked);
  });

  it('masks a stretched word', () => {
    expect(familyFilter('fuuuuuck you')).toMatch(/^\*+ you$/);
  });

  it.each([
    'Scunthorpe',
    'class act, assess the bass',
    'I will assassinate the price',
    'a fickle market',
    'Spaß haben',
    'pass it to Kai',
    'buy at 30, sell at 40',
    'the analysis',
    'a cocky move',
    'Ich biete 4 Food für 120',
    '',
  ])('lets %j through unchanged', (line) => {
    expect(familyFilter(line)).toBe(line);
  });
});

let running: MuleServer | null = null;
afterEach(async () => {
  vi.restoreAllMocks();
  await running?.close();
  running = null;
});

async function start() {
  running = createMuleServer({ seed: () => 42 });
  await new Promise<void>((r) => running!.server.listen(0, r));
  const { port } = running.server.address() as AddressInfo;
  return { http: `http://localhost:${port}`, ws: `ws://localhost:${port}/ws` };
}

/** A test screen that records everything the server sends it. */
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
  return { socket, inbox, send, waitFor };
}

/** A table of two phones and the TV in one room's lobby. */
async function table(names = ['Heiko', 'Lena']) {
  const { http, ws } = await start();
  const { code } = (await (await fetch(`${http}/rooms`, { method: 'POST' })).json()) as { code: string };
  const phones = [];
  for (const name of names) {
    const phone = await screen(ws);
    phone.send({ t: 'join', code, name });
    await phone.waitFor('welcome');
    phones.push(phone);
  }
  const tv = await screen(ws);
  tv.send({ t: 'board', code });
  await tv.waitFor('welcome');
  return { code, phones, tv, screens: [...phones, tv] };
}

const chats = (s: Awaited<ReturnType<typeof screen>>) => s.inbox.flatMap((m) => (m.t === 'chat' ? [m.message.text] : []));

describe('every chat line at the table passes the family filter (the server hands it to the room)', () => {
  it("a player's public line with a swear word reaches every phone and the TV masked, and the rest of the line stays", async () => {
    const { phones, tv, screens } = await table();

    phones[0]!.send({ t: 'chat', text: 'what the fuck, Lena' });

    await tv.waitFor('chat');
    for (const s of screens) {
      await s.waitFor('chat');
      expect(chats(s)).toEqual(['what the ****, Lena']);
    }
    expect(tv.inbox.some((m) => JSON.stringify(m).includes('fuck')), 'the word reaches no screen in any message').toBe(false);
  });

  it("a player's name is masked on every screen, the TV's too", async () => {
    const { tv } = await table(['Heiko', 'Shithead']);

    const view = await tv.waitFor('view', (m) => m.view.seats.length === 2);

    expect(view.view.seats.map((s) => s.name)).toEqual(['Heiko', '****head']);
  });

  it('a whisper to a computer seat reaches the game masked, so an AI never hears the word', async () => {
    const heard = vi.spyOn(MuleGame.prototype, 'heard');
    const { phones } = await table(['Heiko']);
    phones[0]!.send({ t: 'addAi' });
    const lobby = await phones[0]!.waitFor('view', (m) => m.view.seats.length === 2);
    const ai = lobby.view.seats.find((s) => s.isAi)!.id;
    phones[0]!.send({ t: 'start' });
    await phones[0]!.waitFor('view', (m) => m.view.status === 'playing');

    phones[0]!.send({ t: 'chat', text: 'sell me your Food, Arschloch', to: ai });
    await phones[0]!.waitFor('chat');

    expect(heard).toHaveBeenCalledWith(expect.any(String), 'sell me your Food, *********', ai);
  });

  it("a computer seat's own line is masked on every screen, as a player's is", async () => {
    const started: GameContext[] = [];
    const start = MuleGame.prototype.start;
    vi.spyOn(MuleGame.prototype, 'start').mockImplementation(function (this: MuleGame, seats) {
      // The context the room hands the game: the brain's chatter says an AI's line through its `say`.
      started.push((this as unknown as { ctx: GameContext }).ctx);
      return start.call(this, seats);
    });
    const { phones, tv } = await table(['Heiko']);
    phones[0]!.send({ t: 'addAi' });
    const lobby = await phones[0]!.waitFor('view', (m) => m.view.seats.length === 2);
    const ai = lobby.view.seats.find((s) => s.isAi)!.id;
    phones[0]!.send({ t: 'start' });
    await phones[0]!.waitFor('view', (m) => m.view.status === 'playing');

    started[0]!.say!(ai, 'that was a shit trade');

    for (const s of [phones[0]!, tv]) {
      const line = await s.waitFor('chat');
      expect(line.message).toMatchObject({ from: ai, text: 'that was a **** trade' });
    }
  });
});
