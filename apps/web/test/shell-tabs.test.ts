import { document, FakeElement } from './fake-dom';
import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider, type PhoneGame } from '../src/phone/game';
import type { TabButton } from '../src/phone/Shell';

/*
 * SB-1b (Heiko approved the tabbed planning hub, 8 Nov; mock design/mocks/hub-tabs, proposed/Shell.tsx, variant A):
 * PhoneShell gains a column of tabs at the stage's left and a slim rail head (PhaseLine, NowLine). Only the planning
 * hub passes them: without them every other phase draws the shell as it was.
 */

let Shell: typeof import('../src/phone/Shell');
beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Shell = await import('../src/phone/Shell');
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
  (FakeElement.prototype as unknown as { getBoundingClientRect?: () => object }).getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, width: 667, height: 375, right: 667, bottom: 375 });
});

const self: PlayerView = { id: 's1', name: 'Heiko', isAi: false, color: '', slot: 0, species: 'mollox', money: 1200, worth: 0, lastWorth: null, worthBeforeCut: null, plots: 2, ready: false, doneDeveloping: false, condition: null, colonist: null };
const viewWith = (listings: unknown[] = []) => ({ month: 3, maxMonths: 12, listings }) as unknown as MuleView;
const gameOf = (view: MuleView): PhoneGame => ({ table: {} as TableView<MuleView>, view, me: {} as MyView, self, slot: 0 });
/** A client with nothing said yet; one state object, so a mounted shell's store reads settle. */
const STATE = { chat: [], view: null, seatId: 's1' };
const client = { subscribe: () => () => {}, getState: () => STATE } as unknown as TableClient;

const ICON = 'M4 12h16';
const Badge = () => createElement('span', { 'data-testid': 'badge-talk' }, '2');
function tabs(picked: string[] = []): TabButton[] {
  return (['overview', 'politics', 'colony', 'talk'] as const).map((id, i) => ({
    id,
    label: ['Overview', 'Council', 'Colony', 'Talk'][i]!,
    icon: ICON,
    on: id === 'overview',
    ...(id === 'talk' ? { Badge } : {}),
    onPick: () => picked.push(id),
  }));
}

const within = (view: MuleView, screen: ReactNode) => createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: gameOf(view), children: screen }) });
const draw = (props: Record<string, unknown>, view = viewWith()) =>
  renderToStaticMarkup(within(view, createElement(Shell.PhoneShell, { phase: 'Planning', status: createElement('span', { 'data-testid': 'ready-count' }, '1 / 4 READY'), children: createElement('div', { 'data-testid': 'map' }), ...props })));

/** The markup from the element carrying this data-testid to the end of the document. */
function after(html: string, testid: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  expect(at, `an element with data-testid="${testid}"`).toBeGreaterThanOrEqual(0);
  return html.slice(at);
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
const words = (html: string) => html.replaceAll('<!-- -->', '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the tabbed hub shell (SB-1b)', () => {
  it('without tabs or a head the shell is as every other phase draws it: no tab column, the month over the phase', () => {
    const html = draw({});
    expect(html).not.toContain('role="tablist"');
    expect(words(element(html, 'month'))).toBe('Month 3 / 12');
    expect(after(html, 'month').indexOf('Planning')).toBeGreaterThan(0);
  });

  it('the tabs: a vertical tablist at the stage\'s left, before it, one real tab each, the open one selected, a badge drawn', () => {
    const html = draw({ tabs: tabs(), head: createElement('div', { 'data-testid': 'the-head' }) });
    const list = element(html, 'tabs');
    expect(list).toMatch(/^<nav[^>]*role="tablist"[^>]*aria-orientation="vertical"/);
    expect(list).toContain('aria-label="Planning"');
    // The column comes before the stage, and the stage before the rail.
    expect(html.indexOf('data-testid="tabs"')).toBeLessThan(html.indexOf('data-testid="stage"'));
    expect(html.indexOf('data-testid="stage"')).toBeLessThan(html.indexOf('data-testid="guide"'));
    for (const [id, label, on] of [['overview', 'Overview', true], ['politics', 'Council', false], ['colony', 'Colony', false], ['talk', 'Talk', false]] as const) {
      const tab = element(list, `tab-${id}`);
      expect(tab).toMatch(new RegExp(`^<button[^>]*role="tab"[^>]*aria-selected="${on}"`));
      expect(words(tab)).toContain(label);
      expect(tab).toContain(`<path d="${ICON}"`);
    }
    expect(element(list, 'tab-talk')).toContain('data-testid="badge-talk"');
    // 44 px targets at least: the column's tabs are 56 px square.
    expect(element(list, 'tab-overview')).toMatch(/class="[^"]*\bh-14\b[^"]*\bw-full\b/);
  });

  it('the head: in the rail\'s header under the money, the phase on one line with the ready count, the month moved out', () => {
    const html = draw({ tabs: tabs(), head: createElement('div', { 'data-testid': 'the-head' }) });
    const header = element(html, 'rail-head');
    expect(header.indexOf('data-testid="money"')).toBeLessThan(header.indexOf('data-testid="the-head"'));
    expect(words(element(header, 'phase-title-row'))).toBe('Planning 1 / 4 READY');
    // The month is the phase line's now (PhaseLine): the header draws none of its own.
    expect(header).not.toContain('data-testid="month"');
  });

  it('PhaseLine: a bar per step of the month, this one lit; the month and the next step by name', () => {
    const html = renderToStaticMarkup(within(viewWith(), createElement(Shell.PhaseLine)));
    const line = element(html, 'phase-line');
    expect(line).toContain('aria-label="Month 3: step 1 of 5, Plan. Next: Land grant."');
    expect([...line.matchAll(/data-testid="phase-step-([a-z]+)"/g)].map((m) => m[1])).toEqual(['plan', 'grant', 'develop', 'produce', 'auction']);
    expect(element(line, 'phase-step-plan')).toContain('bg-holo');
    expect(element(line, 'phase-step-grant')).not.toMatch(/\bbg-holo\b(?!-)/);
    expect(words(element(line, 'phase-next'))).toBe('Month 3/12 · next Land grant');
    // A month with a lot has the land auction among its steps.
    const lot = renderToStaticMarkup(within(viewWith([{}]), createElement(Shell.PhaseLine)));
    expect(lot).toContain('data-testid="phase-step-land"');
  });

  it("NowLine: the title (two lines at most), the step count, the door when it leads somewhere, and the \"?\"", () => {
    const now = { step: 1, of: 3, title: 'Vote for Governor' };
    const html = renderToStaticMarkup(createElement(Shell.NowLine, { now, onHelp: () => {}, onGo: () => {} }));
    expect(element(html, 'now')).toMatch(/^<section[^>]*aria-live="polite"/);
    expect(element(html, 'now-title')).toMatch(/class="[^"]*\bline-clamp-2\b/);
    expect(words(element(html, 'now-steps'))).toBe('1/3');
    expect(element(html, 'now-go')).toContain('Vote for Governor');
    expect(element(html, 'help-open')).toMatch(/aria-haspopup="dialog"/);
    // No door: the title is plain words; amber when the Now warns.
    const plain = renderToStaticMarkup(createElement(Shell.NowLine, { now: { title: 'Plan your month', warn: true }, onHelp: () => {} }));
    expect(plain).not.toContain('now-go');
    expect(element(plain, 'now')).toContain('border-warn');
  });
});

describe('the tabbed hub shell, tapped (SB-1b)', () => {
  let root: Root | null = null;
  const host = document.createElement('div') as unknown as FakeElement;
  afterEach(() => {
    const r = root;
    if (r) act(() => r.unmount());
    root = null;
  });
  function findTestid(testid: string, node: FakeElement = host): FakeElement | undefined {
    if (node.getAttribute('data-testid') === testid) return node;
    for (const child of node.childNodes) {
      const hit = child instanceof FakeElement ? findTestid(testid, child) : undefined;
      if (hit) return hit;
    }
    return undefined;
  }
  function tap(testid: string): void {
    const el = findTestid(testid);
    expect(el, `an element with data-testid="${testid}"`).toBeDefined();
    const key = Object.keys(el!).find((k) => k.startsWith('__reactProps$'))!;
    act(() => ((el as unknown as Record<string, { onClick: () => void }>)[key]!.onClick)());
  }
  const mount = (el: ReactNode) => {
    root = createRoot(host as unknown as Element);
    act(() => root!.render(el));
  };

  it('a tab tapped calls its onPick; the "?" calls onHelp, the door onGo', () => {
    const picked: string[] = [];
    const help = vi.fn();
    const go = vi.fn();
    mount(
      within(
        viewWith(),
        createElement(Shell.PhoneShell, {
          phase: 'Planning',
          tabs: tabs(picked),
          head: createElement(Shell.NowLine, { now: { title: 'Vote for Governor' }, onHelp: help, onGo: go }),
          children: createElement('div'),
        }),
      ),
    );
    tap('tab-talk');
    tap('tab-politics');
    expect(picked).toEqual(['talk', 'politics']);
    tap('help-open');
    tap('now-go');
    expect(help).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledTimes(1);
  });
});
