import type { ChatMessage, MuleView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ticker } from '../src/chat/Chat';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { devView, NOW, tableOf } from './fixtures/arcade';

/** The table chat's ticker, as another screen mounts it (WS6's arcade, in place of its own ChatTicker). */

const CHAT: ChatMessage[] = [
  { id: 1, from: 's2', text: 'Race you to the corral', at: 0 },
  { id: 2, from: 's3', text: 'Who takes the crystite?', at: 1 },
  { id: 3, from: 's2', text: 'Not me, I am on food this month and every month after it', at: 2 },
];

function clientFor(view: MuleView, chat: ChatMessage[]): TableClient {
  const state = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: tableOf(view), chat, emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  return {
    subscribe: () => () => {},
    getState: () => state,
    serverNow: () => NOW,
    savedSeat: () => null,
    join: () => {},
    watch: () => {},
    intent: () => {},
    onFrame: () => () => {},
    roundTripMs: () => null,
  } as unknown as TableClient;
}

const render = (props: Parameters<typeof Ticker>[0]) =>
  renderToStaticMarkup(createElement(ClientProvider, { client: clientFor(devView(), CHAT), children: createElement(Ticker, props) })).replaceAll('<!-- -->', '');

/** The ticker's lines, newest first, as `<li>` tags with their text. */
const linesOf = (html: string) => [...html.matchAll(/<li class="([^"]*)" data-testid="chat-line-(\d+)">([\s\S]*?)<\/li>/g)].map((m) => ({ id: Number(m[2]), cls: m[1]!, html: m[3]! }));

describe('the table chat ticker, exported for other screens', () => {
  it('keeps the phone 2 and the TV 3 lines by default; `lines` keeps that many, newest first', () => {
    expect(linesOf(render({})).map((l) => l.id)).toEqual([3, 2]);
    expect(linesOf(render({ size: 'tv' })).map((l) => l.id)).toEqual([3, 2, 1]);
    expect(linesOf(render({ lines: 1 })).map((l) => l.id)).toEqual([3]);
    expect(linesOf(render({ lines: 3 })).map((l) => l.id)).toEqual([3, 2, 1]);
    expect(linesOf(render({ lines: 0 }))).toEqual([]);
  });

  it("`wide` sets each line in text-sm where no /shell container is around it; every line keeps its rows whole (shrink-0), so a short holder loses its oldest line", () => {
    const wide = linesOf(render({ lines: 2, wide: true }));
    for (const l of wide) {
      expect(l.cls.split(' ')).toContain('text-sm');
      expect(l.cls).not.toContain('text-[11px]');
    }
    for (const l of [...linesOf(render({ lines: 2 })), ...linesOf(render({ lines: 2, wrap: true })), ...wide]) expect(l.cls.split(' ')).toContain('shrink-0');
  });

  it('cuts each line to one row; with `wrap` a line runs on, speaker and words as one sentence, over at most three rows', () => {
    const [cut] = linesOf(render({ lines: 1 }));
    expect(cut!.cls.split(' ')).toContain('truncate');
    expect(cut!.html).toContain('<span class="truncate">Not me');

    const [wrapped] = linesOf(render({ lines: 1, wrap: true }));
    expect(wrapped!.cls.split(' ')).toContain('line-clamp-3');
    expect(wrapped!.cls.split(' ')).not.toContain('truncate');
    expect(wrapped!.html).not.toContain('truncate');
    // The words follow the speaker's name in the same flow, so they wrap under it.
    expect(wrapped!.html).toMatch(/<strong[^>]*>[^<]*:<\/strong><span[^>]*> Not me/);
  });
});
