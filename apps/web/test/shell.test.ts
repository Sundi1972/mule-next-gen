import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider, type PhoneGame } from '../src/phone/game';
import { PhoneShell, type Now } from '../src/phone/Shell';

const self: PlayerView = { id: 's1', name: 'Heiko', isAi: false, color: '', slot: 0, species: 'mollox', money: 1200, plots: 2, ready: false, doneDeveloping: false };
const game: PhoneGame = {
  table: {} as TableView<MuleView>,
  view: { month: 3, maxMonths: 12 } as MuleView,
  me: {} as MyView,
  self,
  slot: 0,
};

/** A client with nothing said yet: the shell's chat block reads it. */
const client = { subscribe: () => () => {}, getState: () => ({ chat: [], view: null, seatId: 's1' }) } as unknown as TableClient;

const RAIL_CONTENT: ReactNode = createElement('p', { 'data-testid': 'rail-content' }, 'the screen controls');
const RAIL = renderToStaticMarkup(RAIL_CONTENT);
const NOW: Now = { step: 2, of: 3, title: 'Claim a plot', detail: 'The lit plot is free.' };

/** PhoneShell as a screen draws it, inside the phone's game. */
function shell(now?: Now): string {
  const screen = createElement(PhoneShell, { phase: 'Land grant', seconds: 30, now, rail: RAIL_CONTENT, children: createElement('div', { 'data-testid': 'map' }) });
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: game, children: screen }) }));
}

/** The markup inside the element carrying this data-testid, to the end of the document. */
function after(html: string, testid: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  expect(at, `an element with data-testid="${testid}"`).toBeGreaterThanOrEqual(0);
  return html.slice(at);
}

/** The rail's scrolling body, from its first child on: the element right after the rail's header. */
function railBody(html: string): string {
  const open = after(html, 'guide').match(/<\/header><div[^>]*>/);
  expect(open, "the rail's body after its header").not.toBeNull();
  return after(html, 'guide').slice(open!.index! + open![0].length);
}

describe('the player shell (C15)', () => {
  it('B-AC-12: a screen that gives `now` opens the rail body with it, before its own controls', () => {
    const html = shell(NOW);
    // First child of the rail body: not in the header above it, not after the screen's controls.
    expect(railBody(html)).toMatch(/^<section[^>]*data-testid="now"/);
    expect(railBody(html).indexOf(RAIL)).toBeGreaterThan(0);
    expect(after(html, 'now-title')).toMatch(/^data-testid="now-title">Claim a plot</);
    expect(html).toContain('aria-label="Step 2 of 3" data-testid="now-steps"');
    // The screen's content is on the stage, which closes before the guide opens; Now is not on the stage.
    const stage = after(html, 'stage');
    expect(stage.indexOf('data-testid="map"')).toBeLessThan(stage.indexOf('data-testid="guide"'));
    expect(stage.indexOf('data-testid="now"')).toBeGreaterThan(stage.indexOf('data-testid="guide"'));
  });

  it('B-AC-12 (negative): a screen without `now` draws no Now card, and its rail body starts with its own controls', () => {
    const html = shell();
    expect(html).not.toContain('data-testid="now"');
    expect(railBody(html).startsWith(RAIL)).toBe(true);
    expect(html).toContain('data-testid="money"');
  });
});
