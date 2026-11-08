import type { MuleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * S3-C19 on the TV (Heiko approved the P1 deal cards mock, #695): every name the TV lists with room carries its
 * reputation chip, the number with its band (a star at 70+, a warning under 30): the planning ready list's every row,
 * the waiting box, the players strip the other phases draw, and the month end's league. Only with politics on.
 */

// Lena good (72), Kai fair (50), Ossa low (25); in the six-seat game Juno and Rex are Claude, Mo and Ida built-in.
const SMALL: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, reputation: 72 }),
  aPlayer({ id: 's2', name: 'Kai', slot: 1, reputation: 50, ready: true }),
  aPlayer({ id: 's3', name: 'Ossa', slot: 2, reputation: 25, isAi: true, ready: true }),
];
const SIX: PlayerView[] = [
  ...SMALL.slice(0, 2),
  aPlayer({ id: 's4', name: 'Juno', slot: 3, reputation: 61, isAi: true }),
  aPlayer({ id: 's5', name: 'Rex', slot: 4, reputation: 44, isAi: true }),
  aPlayer({ id: 's6', name: 'Mo', slot: 5, reputation: 80, isAi: true, ready: true }),
  aPlayer({ id: 's7', name: 'Ida', slot: 6, reputation: 20, isAi: true, ready: true }),
];
const CLAUDE = new Set(['s4', 's5']);

function politics(): PoliticsView {
  return {
    governor: null, sheriff: null, term: null, next: 4, baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 }, fund: 0, pay: { governor: 50 },
    weights: [], candidates: { governor: [] }, promises: {}, promise: null, promiseFrom: null, election: null,
    brokenDeals: [], reputationReasons: {},
  };
}

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(game: MuleView): string {
  const seats = game.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot, ...(CLAUDE.has(p.id) ? { kind: 'claude' as const, claude: 'thinking' as const } : p.isAi ? { kind: 'builtin' as const } : {}) }));
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats, boards: 1, game };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

/** The markup of the element carrying this data-testid, through its matching closing tag. */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = open!.index!;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open!.index!, m.index + m[0].length);
  }
  throw new Error(`no closing tag for ${testid}`);
}
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/** The chip inside `html` with this testid: its number and its band. */
function chip(html: string, testid: string): { rep: string; band: string | undefined } {
  const el = element(html, testid);
  return { rep: text(el), band: el.match(/data-band="([a-z]+)"/)?.[1] };
}

const planning = (players: PlayerView[], on = true) => aMuleView({ phase: 'planning', month: 2, players, me: null, politics: on ? politics() : null });

describe('reputation chips on the TV (S3-C19, mock #695)', () => {
  it('planning, three seats: each ready-list row carries its chip after the name, and the waiting box its own', () => {
    const html = onTv(planning(SMALL));
    expect(chip(element(html, 'tv-ready-s1'), 'tv-ready-rep-s1')).toEqual({ rep: '72', band: 'good' });
    expect(chip(element(html, 'tv-ready-s2'), 'tv-ready-rep-s2')).toEqual({ rep: '50', band: 'fair' });
    expect(chip(element(html, 'tv-ready-s3'), 'tv-ready-rep-s3')).toEqual({ rep: '25', band: 'low' });
    // The chip sits outside the name's truncation, so a long name gives way first.
    expect(element(element(html, 'tv-ready-s1'), 'tv-ready-name')).not.toContain('tv-ready-rep');
    expect(chip(element(html, 'tv-waiting'), 'waiting-s1-rep')).toEqual({ rep: '72', band: 'good' });
  });

  it("planning, six seats: the Claude row's and the folded AI row's names each carry theirs", () => {
    const html = onTv(planning(SIX));
    const claude = element(html, 'tv-ready-claude-thinking');
    expect(chip(claude, 'tv-ready-rep-s4')).toEqual({ rep: '61', band: 'fair' });
    expect(chip(claude, 'tv-ready-rep-s5')).toEqual({ rep: '44', band: 'fair' });
    const ais = element(html, 'tv-ready-ais');
    expect(chip(ais, 'tv-ready-rep-s6')).toEqual({ rep: '80', band: 'good' });
    expect(chip(ais, 'tv-ready-rep-s7')).toEqual({ rep: '20', band: 'low' });
  });

  it('the land grant: the players strip carries each chip after the name and its AI mark', () => {
    const html = onTv(aMuleView({ phase: 'landGrant', month: 2, players: SMALL, me: null, politics: politics() }));
    expect(chip(element(html, 'tv-player-s3'), 'tv-player-rep-s3')).toEqual({ rep: '25', band: 'low' });
    // Name, then its AI mark, then the chip.
    const ossa = element(html, 'tv-player-s3');
    expect(ossa.indexOf('tv-player-name')).toBeLessThan(ossa.indexOf('ai-mark'));
    expect(ossa.indexOf('ai-mark')).toBeLessThan(ossa.indexOf('tv-player-rep-s3'));
  });

  it("the month end: the league's every name carries its chip", () => {
    const html = onTv(aMuleView({ phase: 'upkeep', month: 2, players: SMALL, me: null, politics: politics() }));
    expect(chip(element(html, 'league-row-s1'), 'league-rep-s1')).toEqual({ rep: '72', band: 'good' });
    expect(chip(element(html, 'league-row-s3'), 'league-rep-s3')).toEqual({ rep: '25', band: 'low' });
  });

  it('with politics off, no chip anywhere', () => {
    for (const game of [planning(SIX, false), aMuleView({ phase: 'landGrant', players: SMALL, me: null, politics: null }), aMuleView({ phase: 'upkeep', month: 2, players: SMALL, me: null, politics: null })])
      expect(onTv(game)).not.toMatch(/data-testid="[a-z-]*rep-s\d"/);
  });
});
