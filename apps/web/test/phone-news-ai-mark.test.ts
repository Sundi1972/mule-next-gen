import type { MuleView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneGameProvider, type PhoneGame } from '../src/phone/game';
import { News } from '../src/phone/hub/desks';
import { NewsPanel } from '../src/phone/parts';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * Heiko, 7 Nov, ruled for the news lists on 8 Nov: a quiet "· AI" wherever a computer seat is named. The phone's two
 * news lists (the results screen's and the colony desk's) mark it as the TV's news column does, from newsLines' seats.
 */

const PLAYERS = [aPlayer({ id: 's1', name: 'Lena', slot: 0, isAi: false }), aPlayer({ id: 's2', name: 'Ossa', slot: 1, isAi: true })];
const BROKE = 'Ossa broke a promise to Lena: a vote for Ossa. Reputation −10.';
const withLines = (lines?: MuleView['newsLines']) => aMuleView({ players: PLAYERS, me: null, politics: null, news: [BROKE], ...(lines ? { newsLines: lines } : {}) });

const text = (html: string) => html.replaceAll('<!-- -->', '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const items = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => text(m[1]!));

const SCREENS: [string, (view: MuleView) => string][] = [
  ['the results screen', (view) => renderToStaticMarkup(createElement(NewsPanel, { view }))],
  ['the colony desk', (view) => renderToStaticMarkup(createElement(PhoneGameProvider, { value: { view } as unknown as PhoneGame, children: createElement(News) }))],
];

describe.each(SCREENS)("%s's news marks a computer seat (Heiko, 7 Nov)", (_, render) => {
  it('each computer seat named in a line reads "· AI" where it stands; a person has no mark', () => {
    const html = render(withLines([{ text: BROKE, who: ['s2', 's1', 's2'] }]));
    expect(items(html)).toEqual(['Ossa · AI broke a promise to Lena: a vote for Ossa · AI. Reputation −10.']);
    expect(html.match(/data-testid="ai-mark"/g)).toHaveLength(2);
  });

  it('without newsLines (an older server) the words show as they are', () => {
    const html = render(withLines());
    expect(items(html)).toEqual([BROKE]);
    expect(html).not.toContain('ai-mark');
  });
});
