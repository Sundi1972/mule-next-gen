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
import { Auction, MoveOn, sideWords } from '../src/phone/Auction';
import { PhoneGameProvider } from '../src/phone/game';
import { readyRows, stillPicking } from '../src/phone/hub/ready';
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
const BARON = 's4';
/** A full table: Heiko and Kai, and four computer seats. */
const sixSeats = [...seats, { id: 's5', name: 'Ossa', isAi: true, color: 4 }, { id: 's6', name: 'Brix', isAi: true, color: 5 }];

/** The real game on a manual clock; `toSidePick` plays it on to the first good's side pick, Heiko having picked. */
function aGame({ toSidePick = false, at = seats } = {}): MuleGame {
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
  game.start(at);
  if (!toSidePick) return game;
  for (const s of at) if (!s.isAi) game.handle(s.id, { type: 'ready' });
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

/** The room's seats: Juno played by Claude with this status, or each seat named played by Claude with its own; `away` dropped. */
const tableOf = (game: MuleView, claude: Status | Partial<Record<string, Status>>, away: readonly string[] = []): TableView<MuleView> => {
  const of: Partial<Record<string, Status>> = typeof claude === 'string' ? { [JUNO]: claude } : claude;
  return {
    code: 'MULE',
    status: 'playing',
    hostId: 's1',
    seats: game.players.map((p) => {
      const status = of[p.id];
      return { id: p.id, name: p.name, isAi: p.isAi, color: p.slot, connected: !away.includes(p.id), ...(status ? { kind: 'claude' as const, claude: status } : p.isAi ? { kind: 'builtin' as const } : {}) };
    }),
    boards: 1,
    game,
  };
};

/** The server's clock, as every screen reads it. */
const SERVER_NOW = 1_000_000;

/** Juno, or each seat named, waited for at the side pick, its wait ending that many seconds from now. */
const waitedFor = (view: MuleView, seconds: number | Record<string, number>): MuleView => {
  const left = typeof seconds === 'number' ? { [JUNO]: seconds } : seconds;
  return { ...view, auction: { ...view.auction!, waitingForClaude: Object.entries(left).map(([seatId, s]) => ({ seatId, until: SERVER_NOW + s * 1000 })) } };
};

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

function onTv(view: MuleView, claude: Parameters<typeof tableOf>[1], away: readonly string[] = []): string {
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: tableOf(view, claude, away), notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  return render(createElement(TableApp, { room: 'MULE' }));
}

/** `seat`'s phone, showing `screen`. */
function onPhone(view: MuleView, claude: Parameters<typeof tableOf>[1], screen: () => ReactElement, seat = 's1'): string {
  const self = view.players.find((p) => p.id === seat)!;
  const me = { id: seat, stock: { food: 0, energy: 0, smithore: 0, crystite: 0 } } as unknown as MyView;
  return render(createElement(PhoneGameProvider, { value: { table: tableOf(view, claude), view, me, self, slot: self.slot as Slot }, children: screen() }));
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
    // The countdown shows once on the TV, in the picked list: the waiting box beside it is too narrow for it (TV-FIT).
    expect(part(html, 'waiting-to-pick')).toBe('Waiting for Kai Juno to pick');
    expect(part(html, 'ready-count'), 'Heiko and The Baron have picked; Kai and Juno have not').toBe('2 / 4 PICKED');
  });

  it('once its plan is taken Juno leaves the list: the same TV then shows its side, and the count has it picked', () => {
    const view = aGame({ toSidePick: true }).viewFor(null);
    const waited = onTv(waitedFor(view, 32), 'thinking');
    expect(part(waited, `tv-picked-${JUNO}`)).toBe('Juno CLAUDE · THINKING · 0:32');
    expect(part(waited, 'ready-count')).toBe('2 / 4 PICKED');
    const taken = onTv(view, 'ready');
    expect(part(taken, `tv-picked-${JUNO}`)).toMatch(/^Juno (BUY|SELL|PASS) ✓$/);
    expect(part(taken, 'waiting-to-pick')).not.toContain('Juno');
    expect(part(taken, 'ready-count')).toBe('3 / 4 PICKED');
  });

  it('two Claude seats waited for: each counts down its own seconds beside its own status; only THINKING pulses', () => {
    const view = waitedFor(aGame({ toSidePick: true }).viewFor(null), { [JUNO]: 32, [BARON]: 9 });
    const statuses = { [JUNO]: 'thinking', [BARON]: 'offline' } as const;
    const tv = onTv(view, statuses);
    expect(part(tv, `tv-picked-${JUNO}`)).toBe('Juno CLAUDE · THINKING · 0:32');
    expect(part(tv, `tv-picked-${BARON}`)).toBe('The Baron CLAUDE · OFFLINE · 0:09');
    expect(part(tv, 'ready-count'), 'only Heiko has picked').toBe('1 / 4 PICKED');
    const phone = onPhone(view, statuses, () => createElement(Auction));
    expect(part(phone, 'waiting-to-pick')).toBe('Waiting for Kai Juno CLAUDE · THINKING · 0:32 The Baron CLAUDE · OFFLINE · 0:09 to pick');
    expect(part(phone, `waiting-${BARON}`)).toBe('The Baron CLAUDE · OFFLINE · 0:09');
    expect(phone).not.toMatch(new RegExp(`data-testid="waiting-${BARON}".*?animate-pulse[^>]*>CLAUDE · OFFLINE`));
  });

  it("the host's Move on confirm, Kai away and Juno waited for, says Kai sits out and Juno starts on the side shown", () => {
    const view = waitedFor(aGame({ toSidePick: true }).viewFor('s1'), 32);
    const left = stillPicking(view, (id) => id !== 's2').filter((s) => s.id !== 's1');
    expect(left.map((s) => s.name)).toEqual(['Kai', 'Juno']);
    const juno = sideWords(view.auction!, left[1]!, view.auction!.good).line;
    const text = words(renderToStaticMarkup(createElement(MoveOn, { auction: view.auction!, seats: left, onNow: () => {}, onKeep: () => {} })));
    expect(text).toContain('Move on without Kai and Juno?');
    expect(text).toContain('Kai is away and sits');
    expect(text).toContain(juno);
    expect(text).toContain('The others start on the side shown; the walk starts.');
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

describe('HC-3 at a full table: the TV keeps its ready list short (B-AC-19)', () => {
  it('from five seats a Claude seat that is READY or CONNECTED folds into the AI row; THINKING, OFFLINE or WAITING keeps its own', () => {
    const view = aGame({ at: sixSeats }).viewFor(null);
    const claude = { s3: 'thinking', s4: 'ready', s5: 'connected', s6: 'offline' } as const;
    const rows = readyRows(view.players, () => true, (id) => claude[id as keyof typeof claude]);
    expect(rows.map((r) => (r.kind === 'ais' ? r.seats.map((s) => s.name) : r.seat.name))).toEqual(['Heiko', 'Kai', 'Juno', 'Brix', ['The Baron', 'Ossa']]);
    const tv = onTv(view, claude);
    expect(tv).toMatch(/data-testid="tv-ready-ais" data-count="2"/);
    for (const id of ['s3', 's6']) expect(tv, id).toContain(`data-testid="tv-ready-${id}"`);
    for (const id of ['s4', 's5']) expect(tv, id).not.toContain(`data-testid="tv-ready-${id}"`);
  });
});

describe('the Claude line shows where a Claude seat can be waited for or not: planning proper and the side pick', () => {
  it('never on the election or law ballot, which share the ready bar', () => {
    const view = aGame().viewFor(null);
    expect(onPhone(view, 'thinking', () => createElement(ReadyBar))).toContain('data-testid="claude-line"');
    for (const politics of [{ election: { stage: 'ballot' } }, { election: { stage: 'announce' } }, { council: { stage: 'ballot' } }]) {
      const html = onPhone({ ...view, politics } as unknown as MuleView, 'thinking', () => createElement(ReadyBar));
      expect(html, JSON.stringify(politics)).not.toContain('data-testid="claude-line"');
    }
  });
});
