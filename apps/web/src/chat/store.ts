import type { ChatMessage } from '@mule/protocol';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { TableClient } from '../net/client';
import { useClient } from '../net/react';
import { bubbleAt, bubbleSchedule } from './queue';

export interface ChatView {
  /** Every line this screen received, oldest first. */
  lines: readonly ChatMessage[];
  /** The one line whose bubble shows now (RULE-9). */
  showing: ChatMessage | null;
  /** For each seat this screen draws as a creature, the anchor that holds its bubble. */
  anchors: ReadonlyMap<string, symbol>;
}

/**
 * One screen's table chat over time: when each line arrived, when the phase began, which line's bubble shows, and
 * which seats the screen draws. It lives as long as the client, not the screen, because every phase remounts its
 * screen and a bubble's time must survive that.
 */
class ChatStore {
  /** When each line arrived, and in which phase: the count of phase changes this screen had seen by then. */
  private readonly heard = new Map<number, { at: number; phase: number }>();
  private chat: readonly ChatMessage[] = [];
  private phase: string | null = null;
  private phaseSeq = 0;
  private anchorQueue = new Map<string, symbol[]>();
  private view: ChatView = { lines: [], showing: null, anchors: new Map() };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: TableClient) {
    // Lines already here when the screen first shows chat are history: they join the ticker without a bubble.
    for (const m of client.getState().chat) this.heard.set(m.id, { at: -Infinity, phase: -1 });
    client.subscribe(() => this.update());
    this.update();
  }

  get = (): ChatView => this.view;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** A creature drawn for this seat; the first one drawn holds the bubble. Returns its release. */
  anchor(seatId: string, token: symbol): () => void {
    this.anchorQueue.set(seatId, [...(this.anchorQueue.get(seatId) ?? []), token]);
    this.publish({ anchors: this.anchorsNow() });
    return () => {
      const left = (this.anchorQueue.get(seatId) ?? []).filter((t) => t !== token);
      if (left.length > 0) this.anchorQueue.set(seatId, left);
      else this.anchorQueue.delete(seatId);
      this.publish({ anchors: this.anchorsNow() });
    };
  }

  private anchorsNow(): Map<string, symbol> {
    return new Map([...this.anchorQueue].map(([seat, tokens]) => [seat, tokens[0]!]));
  }

  private update(): void {
    const { chat, view } = this.client.getState();
    const now = Date.now();
    const game = view?.game;
    const phase = game ? `${game.month}-${game.phase}` : null;
    // The client hands over one frame at a time, so a line before this view was counted in the phase before.
    // A game going to null (the lobby, leaving) bumps the sequence too; the e2e's inOrder counts only in-game views,
    // and the two agree because nothing chats outside a game.
    if (phase !== this.phase) {
      this.phase = phase;
      this.phaseSeq++;
    }
    if (chat !== this.chat) {
      this.chat = chat;
      // Ids start again at 1 in every room, so a line no longer kept must not leave its stamp behind.
      const kept = new Set(chat.map((m) => m.id));
      for (const id of this.heard.keys()) if (!kept.has(id)) this.heard.delete(id);
      for (const m of chat) if (!this.heard.has(m.id)) this.heard.set(m.id, { at: now, phase: this.phaseSeq });
    }
    this.reschedule(now);
  }

  private reschedule(now: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const schedule = bubbleSchedule(
      this.chat.map((message) => ({ message, ...(this.heard.get(message.id) ?? { at: now, phase: this.phaseSeq }) })),
      this.phaseSeq,
    );
    const showing = bubbleAt(schedule, now)?.line.message ?? null;
    const next = Math.min(...schedule.flatMap((b) => [b.from, b.to]).filter((t) => t > now));
    if (Number.isFinite(next)) this.timer = setTimeout(() => this.reschedule(Date.now()), next - now);
    if (showing !== this.view.showing || this.chat !== this.view.lines) this.publish({ lines: this.chat, showing });
  }

  private publish(patch: Partial<ChatView>): void {
    this.view = { ...this.view, ...patch };
    for (const fn of this.listeners) fn();
  }
}

const stores = new WeakMap<TableClient, ChatStore>();

/** The one chat store for this client (one per screen). */
export function chatStoreFor(client: TableClient): ChatStore {
  let store = stores.get(client);
  if (!store) {
    store = new ChatStore(client);
    stores.set(client, store);
  }
  return store;
}

/** This screen's table chat. */
export function useTableChat(): ChatView {
  const store = chatStoreFor(useClient());
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** Registers a drawn creature as its seat's anchor while it is mounted; true when it holds the seat's bubble. */
export function useAnchor(seatId: string): boolean {
  const store = chatStoreFor(useClient());
  const [token] = useState(() => Symbol(seatId));
  useBeforePaint(() => store.anchor(seatId, token), [store, seatId, token]);
  return useSyncExternalStore(store.subscribe, store.get, store.get).anchors.get(seatId) === token;
}
