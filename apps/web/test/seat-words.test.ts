import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeatWords } from '../src/components/SeatWords';
import { aPlayer } from './fixtures/views';

/**
 * The one "· AI" marker for words that name seats by id (Heiko, 7 Nov: a quiet mark wherever a computer seat is named):
 * the news lists draw through it, and so do the deal cards' break words (WS6's TvDeals and BrokenCards).
 */

const PLAYERS = [aPlayer({ id: 'k', name: 'Kai', slot: 0, isAi: false }), aPlayer({ id: 'o', name: 'Ossa', slot: 1, isAi: true })];
const words = (text: string, who: string[], players = PLAYERS) =>
  renderToStaticMarkup(createElement(SeatWords, { text, who, players })).replaceAll('<!-- -->', '').replace(/<[^>]+>/g, '');

describe('SeatWords: words with each computer seat marked where its id names it', () => {
  it('a break line reads "Ossa · AI broke a promise to Kai"; the person has no mark', () => {
    expect(words('Ossa broke a promise to Kai: a vote for Ossa.', ['o', 'k', 'o'])).toBe('Ossa · AI broke a promise to Kai: a vote for Ossa · AI.');
  });

  it('a person named first keeps no mark when a computer seat shares the name', () => {
    const twins = [aPlayer({ id: 'h', name: 'Kai', slot: 0, isAi: false }), aPlayer({ id: 'a', name: 'Kai', slot: 1, isAi: true })];
    expect(words('Kai broke a pact with Kai.', ['h', 'a'], twins)).toBe('Kai broke a pact with Kai · AI.');
  });

  it('with no ids, the words show as they are', () => {
    expect(words('Ossa broke a promise to Kai.', [])).toBe('Ossa broke a promise to Kai.');
  });
});
