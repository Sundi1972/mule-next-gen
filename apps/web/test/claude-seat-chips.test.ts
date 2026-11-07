import { WALK } from '@mule/engine';
import type { MuleView, MyView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MuleGame } from '../../server/src/mule-game.js';
import { Chip, claudeChip } from '../src/components/ClaudeSeat';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { Auction } from '../src/phone/Auction';
import { PhoneGameProvider } from '../src/phone/game';
import { ReadyBar } from '../src/phone/hub/ReadyBar';
import { TableApp } from '../src/table/TableApp';

type GameContext = ConstructorParameters<typeof MuleGame>[0];
type Status = 'waiting' | 'connected' | 'thinking' | 'ready' | 'offline';

/** Heiko hosts; Juno is the Claude seat, The Baron a built-in AI. */
const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Kai', isAi: false, color: 1 },
  { id: 's3', name: 'Juno', isAi: true, color: 2 },
  { id: 's4', name: 'The Baron', isAi: true, color: 3 },
];
const JUNO = 's3';

/** The real game on a manual clock; `toSidePick` plays it on to the first good's side pick, Heiko having picked. */
function aGame({ toSidePick = false } = {}): MuleGame {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => {},
    frame: () => {},
    hostId: () => 's1',
  };
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  if (!toSidePick) return game;
  for (const s of seats) if (!s.isAi) game.handle(s.id, { type: 'ready' });
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.stage !== 'status'; i++) {
    now += WALK.tickMs;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now))
      for (const t of due) {
        const at = timers.indexOf(t);
        if (at < 0) continue;
        timers.splice(at, 1);
        t.fn();
      }
  }
  expect(game.viewFor(null).auction?.stage, "the first good's side pick comes up").toBe('status');
  game.handle('s1', { type: 'ready' });
  return game;
}

/** The room's seats, Juno played by Claude with this status. */
const tableOf = (game: MuleView, juno: Status): TableView<MuleView> => ({
  code: 'MULE',
  status: 'playing',
  hostId: 's1',
  seats: seats.map((s) => ({ ...s, connected: true, ...(s.id === JUNO ? { kind: 'claude' as const, claude: juno } : s.isAi ? { kind: 'builtin' as const } : {}) })),
  boards: 1,
  game,
});

/** The server's clock, as every screen reads it. */
const SERVER_NOW = 1_000_000;

/** Juno waited for at the side pick, its wait ending `seconds` from now. */
const waitedFor = (view: MuleView, seconds: number): MuleView => ({ ...view, auction: { ...view.auction!, waitingForClaude: [{ seatId: JUNO, until: SERVER_NOW + seconds * 1000 }] } });

/** Text with tags dropped, as a reader sees it. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** The words inside the element with this test id, nested elements and all. */
function part(html: string, testid: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  expect(at, `the screen has ${testid}`).toBeGreaterThan(0);
  const start = html.lastIndexOf('<', at);
  const tag = /^<(\w+)/.exec(html.slice(start))![1]!;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  tags.lastIndex = start;
  for (let depth = 0, m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return words(html.slice(start, m.index));
  }
  throw new Error(`${testid} is never closed`);
}

let state: { status: 'open'; role: 'board'; code: string; seatId: null; view: TableView<MuleView>; notice: null; chat: []; emotes: []; toasts: []; clockOffset: number };

// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => SERVER_NOW, watch: () => {}, intent: () => {} } as unknown as TableClient;

function render(el: ReactElement): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: el })).replaceAll('<!-- -->', '');
}

function onTv(view: MuleView, juno: Status): string {
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: tableOf(view, juno), notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  return render(createElement(TableApp, { room: 'MULE' }));
}

/** `seat`'s phone, showing `screen`. */
function onPhone(view: MuleView, juno: Status, screen: () => ReactElement, seat = 's1'): string {
  const self = view.players.find((p) => p.id === seat)!;
  const me = { id: seat, stock: { food: 0, energy: 0, smithore: 0, crystite: 0 } } as unknown as MyView;
  return render(createElement(PhoneGameProvider, { value: { table: tableOf(view, juno), view, me, self, slot: self.slot as Slot }, children: screen() }));
}

describe("C6: a Claude seat's chip says its status", () => {
  it('B-AC-2 (words): each status has its chip, in the mock words; THINKING pulses', () => {
    const expected: Record<Status, string> = {
      waiting: 'WAITING FOR CLAUDE',
      connected: 'CLAUDE · CONNECTED',
      thinking: 'CLAUDE · THINKING',
      ready: 'CLAUDE · READY',
      offline: 'CLAUDE · OFFLINE',
    };
    for (const [status, word] of Object.entries(expected)) {
      const seat = { id: JUNO, name: 'Juno', isAi: true, connected: true, color: 2, kind: 'claude' as const, claude: status as Status };
      expect(claudeChip(seat), status).toBe(word);
      expect(words(renderToStaticMarkup(createElement(Chip, { word: claudeChip(seat) })))).toBe(word);
    }
    expect(renderToStaticMarkup(createElement(Chip, { word: 'CLAUDE · THINKING' }))).toContain('animate-pulse');
    expect(renderToStaticMarkup(createElement(Chip, { word: 'CLAUDE · READY' }))).not.toContain('animate-pulse');
  });
});

describe('HC-3: in planning a Claude seat is a label, never a wait (mock #tv-ready, #phone-ready)', () => {
  it("B-AC-2 (TV): the ready list says Juno's status beside its name; offline, that it plays its built-in plan; the count still counts it ready", () => {
    const view = aGame().viewFor(null);
    expect(view.phase).toBe('planning');
    const thinking = onTv(view, 'thinking');
    expect(part(thinking, `tv-ready-${JUNO}`)).toMatch(/^\S+ Juno Claude CLAUDE · THINKING$/);
    expect(part(thinking, `tv-state-${JUNO}`)).toBe('CLAUDE · THINKING');
    expect(part(thinking, `tv-ready-${JUNO}`)).not.toContain('plays its built-in plan');
    expect(part(thinking, 'tv-waiting'), 'nobody waits for a thinking Claude seat').not.toContain('Juno');
    expect(part(thinking, 'ready-count'), 'the AIs, Juno among them, are ready').toBe('2 / 4 READY');
    expect(part(onTv(view, 'connected'), `tv-state-${JUNO}`)).toBe('CLAUDE · CONNECTED');
    const offline = onTv(view, 'offline');
    expect(part(offline, `tv-state-${JUNO}`)).toBe('CLAUDE · OFFLINE');
    expect(part(offline, `tv-ready-${JUNO}`)).toContain('plays its built-in plan');
    expect(part(offline, 'tv-ready-s4'), 'a built-in seat is as before').toContain('AI · READY');
    // WS6 ruling (#663): a chat that never connected plays the built-in plan too, and the row says so, in the warn tone.
    const waiting = onTv(view, 'waiting');
    expect(part(waiting, `tv-state-${JUNO}`)).toBe('WAITING FOR CLAUDE');
    expect(part(waiting, `tv-ready-${JUNO}`)).toContain('plays its built-in plan');
    expect(waiting).toMatch(new RegExp(`class="[^"]*text-warn[^"]*" data-testid="tv-state-${JUNO}"`));
    expect(part(waiting, 'ready-count'), 'and never holds the table').toBe('2 / 4 READY');
  });

  it("B-AC-2 (phone): the planning bar has Juno's own line with its chip, before and after Ready, never under Waiting for", () => {
    const view = aGame().viewFor(null);
    const before = onPhone(view, 'thinking', () => createElement(ReadyBar));
    expect(part(before, 'claude-line')).toBe('Juno CLAUDE · THINKING');
    expect(part(before, 'waiting-for')).not.toContain('Juno');
    const ready = { ...view, players: view.players.map((p) => (p.id === 's1' ? { ...p, ready: true } : p)) };
    const offline = onPhone(ready, 'offline', () => createElement(ReadyBar));
    expect(offline).toContain('data-testid="you-are-ready"');
    expect(words(offline)).toContain('Juno CLAUDE · OFFLINE plays its built-in plan');
    expect(words(onPhone(ready, 'waiting', () => createElement(ReadyBar))), 'WS6 ruling (#663): never connected plays built-in too').toContain('Juno WAITING FOR CLAUDE plays its built-in plan');
  });
});

describe("RULE-6: the first good's side pick waits for a thinking Claude seat, with its countdown (mock #tv-ready, #phone-ready)", () => {
  it('the TV lists Juno as thinking with the seconds left by the server clock, under Waiting for, and does not count it picked', () => {
    const view = waitedFor(aGame({ toSidePick: true }).viewFor(null), 32);
    const html = onTv(view, 'thinking');
    expect(part(html, `tv-picked-${JUNO}`)).toBe('Juno CLAUDE · THINKING · 0:32');
    expect(part(html, 'waiting-to-pick')).toContain('Juno CLAUDE · THINKING · 0:32');
    expect(part(html, 'ready-count'), 'Heiko and The Baron have picked; Kai and Juno have not').toBe('2 / 4 PICKED');
  });

  it("once its plan is taken Juno leaves the list: the TV shows its side, and the count has it picked", () => {
    const html = onTv(aGame({ toSidePick: true }).viewFor(null), 'ready');
    expect(part(html, `tv-picked-${JUNO}`)).toMatch(/^Juno (BUY|SELL|PASS) ✓$/);
    expect(part(html, 'waiting-to-pick')).not.toContain('Juno');
    expect(part(html, 'ready-count')).toBe('3 / 4 PICKED');
  });

  it("the host's phone, once picked, waits for Kai and Juno, Juno's chip counting down; the host can move on for them", () => {
    const view = waitedFor(aGame({ toSidePick: true }).viewFor('s1'), 45);
    const html = onPhone(view, 'thinking', () => createElement(Auction));
    expect(part(html, 'waiting-to-pick')).toBe('Waiting for Kai Juno CLAUDE · THINKING · 0:45 to pick');
    expect(part(html, 'move-on')).toBe('Move on for them');
    expect(part(html, 'ready-count')).toBe('2 / 4 PICKED');
    expect(html, 'shown once: in the waiting line, not on a line of its own').not.toContain('data-testid="claude-line"');
  });
});
