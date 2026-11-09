import { document, FakeElement } from './fake-dom';
import { GAME } from '@mule/engine';
import type { MuleView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { LOT, month4, myView, NO_GOODS, PLAYERS } from './fixtures/month4';

/*
 * The "?" sheet (SB-2, D1, D2): the month in full, which the tabbed hub keeps behind Now's "?" rather than on the stage
 * (the roadmap with the offices folded in, Now's detail, what you need this month, the ship), on Lena's phone in month
 * 4, opened as she opens it. Moved from hub-audit.test.ts, whose static render cannot tap; the markup is the fake
 * DOM's, serialized for the same checks.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Planning: typeof import('../src/phone/Planning').Planning;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ Planning } = await import('../src/phone/Planning'));
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (FakeElement.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
  (FakeElement.prototype as unknown as { getBoundingClientRect?: () => object }).getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, width: 844, height: 390, right: 844, bottom: 390 });
});

/** An element as markup: tags, attributes in the order React set them, raw text. */
function markup(n: FakeElement): string {
  const attrs = [...n.attributes].map(([k, v]) => ` ${k}="${v.replaceAll('"', '&quot;')}"`).join('');
  const inner = n.childNodes.map((c) => (c instanceof FakeElement ? markup(c) : c.textContent)).join('');
  const tag = n.tagName.toLowerCase();
  return `<${tag}${attrs}>${inner}</${tag}>`;
}
const find = (id: string, n: FakeElement): FakeElement | undefined =>
  n.getAttribute('data-testid') === id ? n : n.childNodes.reduce<FakeElement | undefined>((hit, c) => hit ?? (c instanceof FakeElement ? find(id, c) : undefined), undefined);

/** The tab open under the sheet when `help` last read it. */
let openUnder: string | null = null;

/** Lena's planning, `from` tapped first (Overview by default), then the "?": the sheet's markup, or with `whole` the whole phone's under it. */
function help(game: MuleView, part: 'sheet' | 'whole' = 'sheet', from?: string): string {
  const state = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: { game }, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, intent: () => {} } as unknown as TableClient;
  const self = game.players.find((p) => p.id === 's1')!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  const host = document.createElement('div');
  const root = createRoot(host as unknown as HTMLElement);
  act(() => root.render(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view: game, me: game.me!, self, slot: self.slot as Slot }, children: createElement(Planning) }) })));
  const tap = (id: string) => {
    const el = find(id, host);
    expect(el, `an element with data-testid="${id}"`).toBeDefined();
    act(() => (Object.entries(el!).find(([k]) => k.startsWith('__reactProps$'))![1] as { onClick(): void }).onClick());
  };
  if (from) tap(from);
  const open = find('help-open', host);
  expect(open, "Now's \"?\"").toBeDefined();
  const props = Object.entries(open!).find(([k]) => k.startsWith('__reactProps$'))![1] as { onClick(): void };
  act(() => props.onClick());
  const sheet = find('help-sheet', host);
  expect(sheet, 'the "?" opens the sheet').toBeDefined();
  const html = markup(part === 'sheet' ? sheet! : host);
  openUnder = find('tabs', host)?.findAll('button').find((b) => b.getAttribute('aria-selected') === 'true')?.getAttribute('data-testid') ?? null;
  act(() => root.unmount());
  return html;
}

/** The markup of the element carrying this data-testid, through its closing tag (the tags of its kind balanced). */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  const from = open!.index!;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = from + 1;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + m[0].length);
  }
  return html.slice(from);
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
const textOf = (html: string, testid: string) => plain(element(html, testid));
/** "up to 2 free plots", "up to 1 free plot": the grant's claims, as config has them. */
const CLAIMS = `up to ${GAME.claimsPerGrant} free ${GAME.claimsPerGrant === 1 ? 'plot' : 'plots'}`;

describe('the "?" sheet: the month in full (D1, D2, H-1, H-2, H-6)', () => {
  it("H-1 (D2): the sheet opens on the month's roadmap: its steps in order with Plan lit, one now/next line, the offices line under it", () => {
    const html = help(month4({ listings: [LOT] }));
    const roadmap = element(html, 'roadmap');
    const steps = [...roadmap.matchAll(/data-testid="step-([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['plan', 'grant', 'land', 'develop', 'produce', 'auction']);
    expect(element(roadmap, 'step-plan')).toMatch(/aria-current="step"/);
    expect(roadmap.match(/aria-current="step"/g), 'only this step is lit').toHaveLength(1);
    expect(roadmap).toMatch(/aria-label="Month 4: step 1 of 6, planning"/);
    expect(textOf(roadmap, 'roadmap-now')).toBe(`Now: look around, scout land if you like, then press Ready. Next: you claim ${CLAIMS}.`);
    // WS7's offices line, its words as it builds them, folded in under the roadmap rather than a banner of its own.
    expect(textOf(roadmap, 'roadmap-offices')).toBe('Governor: Ossa, until month 6 · promised up to 4% · tax 4%, kept · Next election: month 7');
    expect(html.match(/data-testid="roadmap-offices"/g), 'drawn once').toHaveLength(1);
    // The roadmap comes first in the sheet, then Now's detail, then the needs, then the ship.
    const at = ['roadmap', 'help-now', 'needs-strip', 'help-ship'].map((id) => html.indexOf(`data-testid="${id}"`));
    expect(at[0]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));

    // D8: the sheet's offices line opens nothing, not even for the rest of an election month once its result is out.
    const over = { stage: 'over' as const, ceremony: null, candidates: {}, promises: {}, voted: [], done: [], waitingFor: [], result: {} };
    help(month4({ politics: { ...month4().politics!, election: over } }), 'sheet', 'tab-colony');
    expect(openUnder, 'the "?" leaves Colony open under the sheet').toBe('tab-colony');
  });

  it('H-1 (negative): with no lot this month the roadmap draws no land auction step', () => {
    const roadmap = element(help(month4()), 'roadmap');
    expect(roadmap).not.toContain('data-testid="step-land"');
    expect(roadmap).not.toContain('Land auction');
    expect(roadmap).toMatch(/aria-label="Month 4: step 1 of 5, planning"/);
  });

  it("H-1: once you're ready the now line says the rest are still planning", () => {
    const ready = PLAYERS.map((p) => (p.id === 's1' ? { ...p, ready: true } : p));
    expect(textOf(help(month4({ players: ready })), 'roadmap-now')).toBe(`Now: you're ready; the rest are still planning. Next: the land grant, where you claim ${CLAIMS}.`);
  });

  it('H-2 (D2): the sheet says "This month you need" with each of Food, Energy and Water against what you hold, red where short', () => {
    const strip = element(help(month4()), 'needs-strip');
    expect(strip).toMatch(/^<button/);
    expect(textOf(strip, 'needs-strip')).toMatch(/^This month you need/);
    expect([...strip.matchAll(/data-testid="strip-([a-z]+)"/g)].map((m) => m[1])).toEqual(['food', 'energy', 'water']);
    expect(textOf(strip, 'strip-food')).toBe('Food2 of 5short 3');
    expect(element(strip, 'strip-food')).toMatch(/text-alert/);
    expect(textOf(strip, 'strip-energy')).toBe('Energy3 of 2✓');
    expect(element(strip, 'strip-energy')).not.toMatch(/text-alert/);
    expect(strip.match(/<button[^>]*>/)![0]).toMatch(/border-alert/);
    expect(strip).toMatch(/aria-label="This month you need: Food, 2 of 5, short 3; Energy, 3 of 2; Water, 1 of 1\. Opens the Colony tab\."/);
  });

  it('H-2 (negative): with nothing short the strip shows no red', () => {
    const fed = myView('s1', { stock: { ...NO_GOODS, food: 5, energy: 3, water: 1 } });
    const strip = element(help(month4({}, fed)), 'needs-strip');
    expect(strip).not.toMatch(/alert/);
    expect(strip).not.toContain('short');
    expect(strip.match(/✓/g)).toHaveLength(3);
  });

  it("H-6 (D2): the ship's line is plain words, and no code is left on the hub or its sheet", () => {
    const html = help(month4({ ship: { arrives: 6, inPort: false, wants: null } }), 'whole');
    expect(textOf(html, 'help-ship')).toBe('Export ship in month 6: it buys the colony’s leftovers.');
    expect(html).not.toMatch(/EXPORT SHIP|export ship in month|· month 4</);
    expect(html).not.toMatch(/\bM\d+–\d+\b|NEXT ELECTION M\d/);
  });

  it('H-6: while the export ship is in port, the line says so', () => {
    expect(textOf(help(month4({ ship: { arrives: 4, inPort: true, wants: null } })), 'help-ship')).toBe('Export ship in port: it buys the colony’s leftovers.');
  });
});
