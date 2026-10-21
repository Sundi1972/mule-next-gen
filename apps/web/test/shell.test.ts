import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneGameProvider, type PhoneGame } from '../src/phone/game';
import { PhoneShell, WIDE_PX, type Now } from '../src/phone/Shell';

const self: PlayerView = { id: 's1', name: 'Heiko', isAi: false, color: '', species: 'mollox', money: 1200, plots: 2, ready: false, doneDeveloping: false };
const game: PhoneGame = {
  table: {} as TableView<MuleView>,
  view: { month: 3, maxMonths: 12 } as MuleView,
  me: {} as MyView,
  self,
  slot: 0,
};

const RAIL = '<p data-testid="rail-content">the screen controls</p>';
const NOW: Now = { step: 2, of: 3, title: 'Claim a plot', detail: 'The lit plot is free.' };

/** PhoneShell as a screen draws it, inside the phone's game. */
function shell(now?: Now): string {
  const rail: ReactNode = createElement('p', { 'data-testid': 'rail-content' }, 'the screen controls');
  return renderToStaticMarkup(
    createElement(PhoneGameProvider, { value: game }, createElement(PhoneShell, { phase: 'Land grant', seconds: 30, rail, ...(now ? { now } : {}) }, createElement('div', { 'data-testid': 'map' }))),
  );
}

/** The markup inside the element carrying this data-testid, to the end of the document. */
function after(html: string, testid: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  expect(at, `an element with data-testid="${testid}"`).toBeGreaterThanOrEqual(0);
  return html.slice(at);
}

describe('the player shell (C15)', () => {
  it('B-AC-12: a screen that gives `now` opens the guide rail with it, before its own controls', () => {
    const html = shell(NOW);
    const guide = after(html, 'guide');
    expect(guide).toContain('data-testid="now"');
    expect(guide.indexOf('data-testid="now"')).toBeLessThan(guide.indexOf(RAIL));
    expect(after(html, 'now-title')).toMatch(/^data-testid="now-title">Claim a plot</);
    expect(after(html, 'now-steps')).toContain('aria-label="Step 2 of 3"');
    // The stage holds the screen's content; Now is in the rail, not on the stage.
    expect(after(html, 'stage').indexOf('data-testid="map"')).toBeLessThan(after(html, 'stage').indexOf('data-testid="guide"'));
  });

  it('B-AC-12 (negative): a screen without `now` draws no Now card, and its rail starts with its own controls', () => {
    const html = shell();
    expect(html).not.toContain('data-testid="now"');
    expect(html).toContain(RAIL);
    expect(html).toContain('data-testid="money"');
  });

  it('B-AC-12 (HC-8): every width switch in the shell is the container query at WIDE_PX, never the window', () => {
    const source = readFileSync(new URL('../src/phone/Shell.tsx', import.meta.url), 'utf8');
    const switches = [...source.matchAll(/@min-\[(\d+)px\]:/g)].map((m) => Number(m[1]));
    expect(switches.length).toBeGreaterThan(0);
    expect(new Set(switches)).toEqual(new Set([WIDE_PX]));
    expect(WIDE_PX).toBe(1100);
    // No window-width breakpoints (sm: md: lg: xl: 2xl: max-*:) and no media queries in code.
    expect(source).not.toMatch(/(^|[\s'"`])(sm|md|lg|xl|2xl|max-[a-z0-9[\]]+):/m);
    expect(source).not.toMatch(/matchMedia|innerWidth/);
  });
});
