import type { ChatMessage, MuleView, TableView } from '@mule/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatStoreFor } from '../src/chat/store';
import { TableClient } from '../src/net/client';

/** A client fed by hand, as its socket would feed it; the store reads it as the screen does. */
function table() {
  const client = new TableClient({ url: 'ws://test/ws', socket: () => ({ readyState: 0, send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null }) });
  let id = 0;
  return {
    client,
    view(phase: string, month = 1) {
      const view = { code: 'ROOM', status: 'playing', hostId: 's1', seats: [], boards: 0, game: { month, phase, players: [] } } as unknown as TableView<MuleView>;
      client.receive({ t: 'view', view });
    },
    say(text: string, at = Date.now()) {
      const message: ChatMessage = { id: ++id, from: 's2', text, at };
      client.receive({ t: 'chat', message });
      return message;
    },
    /** A new room: its line ids start again at 1. */
    restart() {
      id = 0;
    },
    showing: () => chatStoreFor(client).get().showing?.text ?? null,
  };
}

describe('the chat store (C20)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('B-AC-17 (FM): a line counts in the phase it was received in, by order, even when its frame and the next view share a millisecond', () => {
    const t = table();
    t.view('planning');
    chatStoreFor(t.client);
    t.say('said in planning');
    t.view('landGrant');
    expect(t.showing()).toBeNull();
    t.say('said in the land grant');
    expect(t.showing()).toBe('said in the land grant');
  });

  it('B-AC-17 (FM): after leaving, the next room\'s line 1 gets its bubble', () => {
    const t = table();
    t.view('planning');
    chatStoreFor(t.client);
    t.say('first room');
    vi.advanceTimersByTime(10_000);
    t.client.leave();
    t.restart();
    t.view('planning');
    t.say('next room');
    expect(t.showing()).toBe('next room');
  });

  it('B-AC-17 (FM): a bubble times from its receipt, not from the server\'s clock', () => {
    const t = table();
    t.view('development');
    chatStoreFor(t.client);
    t.say('a server a minute behind', Date.now() - 60_000);
    expect(t.showing()).toBe('a server a minute behind');
    vi.advanceTimersByTime(4_499);
    expect(t.showing()).toBe('a server a minute behind');
    vi.advanceTimersByTime(1);
    expect(t.showing()).toBeNull();
  });

  it('B-AC-17 (negative): lines received before the screen first showed chat are history: in the ticker, never a bubble', () => {
    const t = table();
    t.view('planning');
    t.say('said in the lobby');
    const store = chatStoreFor(t.client);
    expect(store.get().lines.map((l) => l.text)).toEqual(['said in the lobby']);
    expect(t.showing()).toBeNull();
  });
});
