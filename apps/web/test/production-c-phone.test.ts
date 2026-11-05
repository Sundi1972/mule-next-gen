import { document, FakeElement } from './fake-dom';
import { productionShowMs } from '@mule/engine';
import type { MuleView, MyView, PlayerView, ProductionView, TableView } from '@mule/protocol';
import { showEnd } from '@mule/ui';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider, type PhoneGame } from '../src/phone/game';
import { Production } from '../src/phone/Production';

/**
 * The phone's footer during the production show in Heiko's order C (ws6-ux AM-19, mock b65c3972 variant C): with a
 * TV in the room, ⏩ Speed up asks for the rest to play faster and then says how many have asked; Ready waits for the
 * show to end. A phone alone keeps its tap-the-map skip and has no Speed up.
 */

// The fake document has no dataset and no layout (the shell and the fly targets measure).
Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [] });

const W = 4;
const H = 2;
const NOW = 1_000_000;
const LENA = 's1';
const BRIX = 's2';

const month = (hurry: ProductionView['hurry'] = { asked: [], from: null }): ProductionView => ({
  lines: [{ x: 1, y: 0, owner: LENA, good: 'food', base: 3, made: 3, parts: [] }],
  events: [],
  lengthMs: productionShowMs(1, 0),
  introMs: 0,
  hurry,
});

const person = (id: string, name: string, slot: number, isAi = false): PlayerView =>
  ({ id, name, isAi, color: '', slot, species: 'mollox', money: 1000, worth: 0, plots: 1, ready: false, doneDeveloping: false, colonist: null, condition: null }) as PlayerView;
// Two people and an AI: the AI never has to ask.
const players = [person(LENA, 'Lena', 0), person(BRIX, 'Brix', 1), person('s3', 'The Baron', 2, true)];
const tiles = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: i === 1 ? LENA : null, outfit: i === 1 ? 'food' : null }));

function game(boards: number, t: number, production: ProductionView): PhoneGame {
  const phaseEndsAt = NOW + production.lengthMs - t * 1000;
  const view = { phase: 'production', month: 2, maxMonths: 12, phaseEndsAt, width: W, height: H, tiles, players, production } as unknown as MuleView;
  const me = { id: LENA, stock: { food: 3, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 } } as unknown as MyView;
  return { table: { code: 'ABCD', status: 'playing', hostId: LENA, boards, seats: [], game: null } as TableView<MuleView>, view, me, self: players[0]!, slot: 0 };
}

const sent: unknown[] = [];
// One state object: the client's store must return the same snapshot while nothing changed.
const state = { chat: [], view: null, seatId: LENA };
const client = {
  subscribe: () => () => undefined,
  getState: () => state,
  serverNow: () => NOW,
  intent: (i: unknown) => sent.push(i),
} as unknown as TableClient;

const screen = (boards: number, t: number, production: ProductionView) =>
  createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: game(boards, t, production), children: createElement(Production, { production }) }) });
const render = (boards: number, t: number, production = month()) => renderToStaticMarkup(screen(boards, t, production));

/** The opening tag of the element carrying this data-testid, or ''. */
const tag = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';
/** The text inside the first element carrying this data-testid, tags stripped. */
function text(html: string, testid: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  if (at < 0) return '';
  const from = html.indexOf('>', at) + 1;
  return html.slice(from, html.indexOf('</button>', from)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const MID = 2;
const END = showEnd(month());

afterEach(() => {
  sent.length = 0;
  vi.unstubAllGlobals();
});

describe('B-AC-20 (AM-19): the phone asks to speed the show up', () => {
  it('with a TV in the room, mid-show, the phone offers ⏩ Speed up; once Lena has asked it says how many have, and waits', () => {
    const fresh = render(1, MID);
    expect(text(fresh, 'speed-up-button')).toBe('⏩ Speed up');
    expect(tag(fresh, 'speed-up-button')).not.toMatch(/disabled/);

    const asked = render(1, MID, month({ asked: [LENA], from: null }));
    // Two people at the table; the AI is never waited for.
    expect(text(asked, 'speed-up-button')).toBe('⏩ Asked: 1 of 2');
    expect(tag(asked, 'speed-up-button')).toMatch(/disabled/);
  });

  it('a tap on ⏩ Speed up sends the hurry intent, and nothing else', () => {
    Object.assign(window, { matchMedia: (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} }) });
    const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
    doc.createElementNS ??= (_ns, t) => document.createElement(t);
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host as unknown as HTMLElement);
    flushSync(() => root.render(screen(1, MID, month())));
    try {
      const button = find(host, (e) => e.getAttribute('data-testid') === 'speed-up-button');
      expect(button, 'the phone shows ⏩ Speed up').not.toBeNull();
      const props = Object.entries(button!).find(([k]) => k.startsWith('__reactProps$'))?.[1] as { onClick?: () => void };
      flushSync(() => props.onClick!());
      expect(sent).toEqual([{ type: 'hurry' }]);
    } finally {
      root.unmount();
      document.body.removeChild(host);
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('a phone alone has no Speed up (its tap-the-map skip stays), and none is offered once the show has ended', () => {
    expect(render(0, MID)).not.toContain('data-testid="speed-up-button"');
    expect(render(1, END + 0.5)).not.toContain('data-testid="speed-up-button"');
  });

  it('Ready waits for the show: "Watching the show" while it plays, "On to the auction" once it has ended', () => {
    const playing = render(1, MID);
    expect(text(playing, 'ready')).toBe('Watching the show');
    expect(tag(playing, 'ready')).toMatch(/disabled/);
    const over = render(1, END + 0.5);
    expect(text(over, 'ready')).toBe('On to the auction');
    expect(tag(over, 'ready')).not.toMatch(/disabled/);
  });
});

function find(node: FakeElement, ok: (e: FakeElement) => boolean): FakeElement | null {
  for (const c of node.childNodes) {
    if (!(c instanceof FakeElement)) continue;
    if (ok(c)) return c;
    const deep = find(c, ok);
    if (deep) return deep;
  }
  return null;
}
