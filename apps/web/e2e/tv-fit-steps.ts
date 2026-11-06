/**
 * The TV at a real table, measured at 1920×1080 (the couch read, PM ruling 5 Nov): what a screen draws stays on the
 * screen, and the parts the ruling moved don't sit on each other. Each step reads the TV as it stands and throws, with
 * the numbers, on the first broken promise; it returns a line for the log.
 */
import type { Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { EVENT_SHOW } from '@mule/engine';
import { check, held } from './harness';

/** Kept a string: tsx would wrap named functions in a helper the page lacks. What the TV stage draws past the screen. */
const PAST_THE_FOOT = String.raw`(() => {
  const stage = document.querySelector('[data-phase]');
  if (!stage) return { past: ['no TV stage'], foot: 0 };
  const vh = window.innerHeight;
  const past = [];
  let foot = 0;
  for (const el of stage.querySelectorAll('*')) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0 || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    foot = Math.max(foot, b.bottom);
    if (b.bottom <= vh + 1) continue;
    // Below the foot but inside a box that clips it is the clipping box's to judge, and that box is read too.
    let clipped = false;
    for (let a = el.parentElement; a && a !== stage.parentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowY !== 'visible' && a.getBoundingClientRect().bottom <= vh + 1) { clipped = true; break; }
    }
    if (clipped) continue;
    const id = el.getAttribute('data-testid') || el.tagName.toLowerCase() + ' "' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '"';
    past.push(id + ' to y ' + b.bottom.toFixed(1));
  }
  return { past: past.slice(0, 6), foot };
})()`;

/** Kept a string: each box the selectors name, and whether it shows whole: inside the screen and every box that clips it. */
const WHOLE = String.raw`((selectors) => selectors.flatMap((sel) => [...document.querySelectorAll(sel)].filter((el) => el.checkVisibility()).map((el) => {
  const b = el.getBoundingClientRect();
  // Squeezed shorter than its words (a truncating line given less than its height), it cuts itself.
  let cut = b.top < -1 || b.left < -1 || b.bottom > window.innerHeight + 1 || b.right > window.innerWidth + 1 ? 'the screen' : el.scrollHeight > el.clientHeight + 1 ? 'itself' : null;
  for (let a = el.parentElement; a && !cut; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const c = a.getBoundingClientRect();
    if (b.top < c.top - 1 || b.left < c.left - 1 || b.bottom > c.bottom + 1 || b.right > c.right + 1) cut = (a.getAttribute('data-testid') || a.tagName.toLowerCase()) + ' to y ' + c.bottom.toFixed(1);
  }
  return { id: el.getAttribute('data-testid') || sel, top: b.top, bottom: b.bottom, cut };
})))`;

/** Every box the selectors name shows whole on the TV; returns their tops and bottoms. */
export async function shownWhole(tv: Page, screen: string, selectors: string[]): Promise<{ id: string; top: number; bottom: number }[]> {
  const boxes = (await tv.evaluate(`(${WHOLE})(${JSON.stringify(selectors)})`)) as { id: string; top: number; bottom: number; cut: string | null }[];
  for (const b of boxes) check(b.cut === null, `TV-FIT: on the ${screen} TV ${b.id} shows whole, y ${b.top.toFixed(1)}–${b.bottom.toFixed(1)}, cut by ${b.cut}`);
  return boxes;
}

/** Nothing the TV stage draws runs past the screen's foot, unless a box that clips it ends above the foot; returns the lowest bottom. */
export async function nothingPastTheFoot(tv: Page, screen: string): Promise<number> {
  const { past, foot } = (await tv.evaluate(PAST_THE_FOOT)) as { past: string[]; foot: number };
  const vh = await tv.evaluate(() => window.innerHeight);
  check(past.length === 0, `TV-FIT: on the ${screen} TV nothing runs past y ${vh}, got ${past.join('; ')}`);
  return foot;
}

/** Kept a string, as PAST_THE_FOOT: in the shown TV header, what of the header's right side the title runs over. */
const TITLE_CLEAR = String.raw`(() => {
  const header = [...document.querySelectorAll('[data-testid=tv-header]')].find((h) => h.checkVisibility());
  if (!header) return null;
  const title = header.querySelector('[data-testid=tv-phase]');
  // Where its words end, not its box: a title squeezed narrower than its words draws them on past the box's edge.
  const box = title.getBoundingClientRect();
  const scale = title.offsetWidth ? box.width / title.offsetWidth : 1;
  const t = { left: box.left, top: box.top, bottom: box.bottom, right: box.left + Math.max(box.width, title.scrollWidth * scale) };
  const right = header.lastElementChild;
  const under = [...right.children].filter((c) => c.checkVisibility()).filter((c) => {
    const b = c.getBoundingClientRect();
    return b.left < t.right - 1 && t.left < b.right - 1 && b.top < t.bottom - 1 && t.top < b.bottom - 1;
  });
  return { title: title.textContent, right: t.right, under: under.map((c) => (c.getAttribute('data-testid') || c.tagName.toLowerCase() + ' "' + (c.textContent || '').trim().slice(0, 20) + '"')) };
})()`;

/** TV-FIT title: the shown TV header's title runs over nothing on the header's right (the toggle, the gauges, the clock). */
export async function theTvTitleIsClear(tv: Page, screen: string): Promise<string> {
  const read = (await tv.evaluate(TITLE_CLEAR)) as { title: string; right: number; under: string[] } | null;
  check(read !== null, `TV-FIT: the ${screen} TV shows its header`);
  check(read.under.length === 0, `TV-FIT: on the ${screen} TV the title "${read.title}" runs over ${read.under.join(', ')}`);
  return `"${read.title}" clear of the header's right, ending at x ${read.right.toFixed(0)}`;
}

/** Kept a string, as PAST_THE_FOOT: in the shown TV header, what runs past the screen's right edge, and the colony gauges' row. */
const HEADER_ON_SCREEN = String.raw`(() => {
  const header = [...document.querySelectorAll('[data-testid=tv-header]')].find((h) => h.checkVisibility());
  if (!header) return null;
  const vw = window.innerWidth;
  const off = [...header.querySelectorAll('*')].filter((c) => c.checkVisibility() && c.getBoundingClientRect().right > vw + 1);
  // The outermost only: a clock past the edge names the clock, not each of its digits.
  const named = off.filter((c) => !off.includes(c.parentElement)).map((c) => (c.getAttribute('data-testid') || c.tagName.toLowerCase() + ' "' + (c.textContent || '').trim().slice(0, 20) + '"') + ' to x ' + Math.round(c.getBoundingClientRect().right));
  const gauges = header.parentElement.querySelector(':scope > [data-testid=colony-gauges]');
  const crowd = [...header.querySelectorAll('[role=timer], [data-testid=ready-count], [data-testid=strike-badge]')].filter((c) => c.checkVisibility()).map((c) => c.getAttribute('data-testid') || 'clock');
  return { off: named, vw, crowd, ownRow: !!gauges && gauges.checkVisibility() };
})()`;

/**
 * GAUGES-ROW (PM ruling 5 Nov): a TV header with a clock, the strike badge or a ready count has nothing past the screen's
 * right edge; with the colony on, its gauges sit on their own row under the title; and nothing runs past the foot.
 */
export async function theTvHeaderStaysOnScreen(tv: Page, screen: string, colony: boolean): Promise<string> {
  const read = (await tv.evaluate(HEADER_ON_SCREEN)) as { off: string[]; vw: number; crowd: string[]; ownRow: boolean } | null;
  check(read !== null, `TV-FIT: the ${screen} TV shows its header`);
  check(read.off.length === 0, `GAUGES-ROW: on the ${screen} TV the header runs past the right edge (x ${read.vw}): ${read.off.join(', ')}`);
  const crowded = read.crowd.length > 0;
  if (colony) check(read.ownRow === crowded, `GAUGES-ROW: on the ${screen} TV, with ${crowded ? read.crowd.join(' and ') : 'no clock, badge or ready count'} in the header, the colony's gauges sit ${crowded ? 'on their own row' : 'beside the title'}`);
  // The row costs height: the screen's foot is read too.
  const foot = await nothingPastTheFoot(tv, screen);
  return `${crowded ? read.crowd.join(' and ') : 'no clock'}, nothing past x ${read.vw}${colony ? `, the gauges ${read.ownRow ? 'on their own row' : 'beside the title'}` : ''}, the foot at y ${foot.toFixed(0)}`;
}

/** Kept a string, as PAST_THE_FOOT: the ready chip, the gauges it may sit on, and how many lines the title takes. */
const HEADER = String.raw`(() => {
  // The screen's own chip, gauges and title: the shown ones, in the one TV screen that holds the chip.
  const chipEl = [...document.querySelectorAll('[data-phase] [data-testid=ready-count]')].find((e) => e.checkVisibility()) || null;
  const chip = chipEl ? chipEl.getBoundingClientRect() : null;
  const screenEl = chipEl ? chipEl.closest('[data-phase]') : document;
  const gauges = [...screenEl.querySelectorAll('[data-testid=colony-gauges] > *')].filter((g) => g.checkVisibility()).map((g) => ({ id: g.getAttribute('data-testid') || '', b: g.getBoundingClientRect() }));
  const title = screenEl.querySelector('[data-testid=tv-phase]');
  const tb = title ? title.getBoundingClientRect() : null;
  const lineHeight = title ? parseFloat(getComputedStyle(title).fontSize) * 1.3 : 0;
  const overlaps = chip ? gauges.filter(({ b }) => b.left < chip.right - 1 && chip.left < b.right - 1 && b.top < chip.bottom - 1 && chip.top < b.bottom - 1).map(({ id }) => id) : [];
  return { chip: !!chip, gauges: gauges.length, overlaps, titleLines: tb && lineHeight ? Math.round(tb.height / lineHeight + 0.2) : 0, title: title ? title.textContent : '' };
})()`;

/**
 * TV-FIT header (planning, month end): with a ready count up, the colony's gauges sit on a row of their own under the
 * title, so the ready chip overlaps none of them; the title is one line; and nothing the screen draws runs past the
 * foot of the screen.
 */
export async function theTvHeaderFits(tv: Page, screen: string): Promise<string> {
  // A month event's show plays over the screen first, with a header of its own: the screen is read once it has ended.
  await tv.locator('[data-testid=tv-event-overlay]').waitFor({ state: 'hidden', timeout: EVENT_SHOW.introMs + EVENT_SHOW.capMs + 5_000 });
  const read = (await tv.evaluate(HEADER)) as { chip: boolean; gauges: number; overlaps: string[]; titleLines: number; title: string };
  check(read.chip, `TV-FIT: the ${screen} TV shows its ready count`);
  check(read.gauges > 0, `TV-FIT: the ${screen} TV shows the colony's gauges`);
  check(read.overlaps.length === 0, `TV-FIT: on the ${screen} TV the ready chip sits on no gauge, got it over ${read.overlaps.join(', ')}`);
  check(read.titleLines === 1, `TV-FIT: on the ${screen} TV "${read.title}" is one line, got ${read.titleLines}`);
  await theTvTitleIsClear(tv, screen);
  // Planning's news gives way under a clip; who is ready, at the column's foot, never does.
  await shownWhole(tv, screen, ['[data-testid=tv-ready-list] > li']);
  const foot = await nothingPastTheFoot(tv, screen);
  return `"${read.title}" on one line and clear of the header's right, the chip clear of ${read.gauges} gauges, the foot at y ${foot.toFixed(0)}`;
}

/**
 * TV-FIT auction (the walk), with deals put on the board through the server while the room is held, then taken off
 * again: the walk has no chat ticker (the bubbles on the board carry the chat), said lines or not, so the board keeps
 * one size as deals come and go; with nothing trading the help and the room line show whole, with two deals up each
 * deal row is whole inside the deal list, and either way nothing runs past the foot.
 */
/**
 * TV-FIT month end (PM ruling C, 5 Nov): the header fits as theTvHeaderFits reads it; with two chat lines said, the
 * ticker shows only the newest; and the colony's gauges sit in the screen's body, beside the league, not in a row of
 * their own under the header, so the league and the colony's score keep the height. Logs the body's scale.
 */
export async function theMonthEndTvFits(tv: Page, server: MuleServer, code: string): Promise<string> {
  const header = await theTvHeaderFits(tv, 'month end');
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const end = tv.getByTestId('tv-monthend');
  const host = (room as unknown as { game: { state: { players: { id: string }[] } } }).game.state.players[0]!.id;
  const said = ['Who sold the Food?', 'Not me, I ate it.'];
  for (const text of said) (room as unknown as { deliver(from: string, text: string): void }).deliver(host, text);
  await end.getByTestId('chat-ticker').getByText(said[1]!).waitFor({ timeout: 2_000 });
  const lines = await end.locator('[data-testid=chat-ticker] [data-testid^=chat-line-]').count();
  check(lines === 1, `TV-FIT: the month end's ticker shows only the newest chat line, got ${lines}`);
  const gauges = await end.getByTestId('colony-gauges').count();
  if (gauges > 0) {
    const inBody = await end.locator('[data-fit] [data-testid=colony-gauges]').count();
    check(inBody === 1, "TV-FIT: the month end's colony gauges sit in its body beside the league, not in a row under the header");
  }
  // The worth rule is one truncated line; the table reads it whole, donations and all, or the cut falls on the rule itself.
  const rule = await end.getByTestId('worth-rule').evaluate((p) => ({ text: (p as HTMLElement).innerText, cut: p.scrollWidth > p.clientWidth }));
  check(!rule.cut, `TV-FIT: the month end's worth rule fits its one line, got it cut: "${rule.text}"`);
  const scale = Number(await end.locator('[data-fit]').getAttribute('data-fit'));
  return `${header}; the worth rule whole on one line; one chat line of ${said.length}, the gauges ${gauges > 0 ? 'beside the league' : 'not drawn (no colony)'}, the body at scale ${scale.toFixed(3)} with ${await end.locator('[data-testid^=league-row-]').count()} league rows`;
}

export async function theAuctionTvFits(tv: Page, server: MuleServer, code: string): Promise<string> {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const lines = () => tv.locator('[data-testid=chat-ticker] [data-testid^=chat-line-]').count();
  const boardHeight = () => tv.locator('[data-testid=tv-walk] [data-testid=walk-board]').evaluate((b) => b.getBoundingClientRect().height);
  return held(server, code, async () => {
    // Held first, so the walk cannot move on to the next good's status screen while it is read.
    await tv.locator('[data-testid=tv-walk]').waitFor({ timeout: 5_000 });
    const state = (room as unknown as { game: { state: { auction: { deals: unknown[] }; players: { id: string; name: string }[] } } }).game.state;
    const a = state.auction;
    // The two longest names at the table trade with each other, and the host sells to the store.
    const [p, q] = [...state.players].sort((x, y) => y.name.length - x.name.length);
    check(p && q, 'TV-FIT: two players at the table to trade');
    const kept = a.deals;
    try {
      // The help shows while nothing trades.
      a.deals = [];
      (room as unknown as { broadcast(): void }).broadcast();
      await tv.locator('[data-testid=tv-deal]').first().waitFor({ state: 'detached', timeout: 2_000 });
      // Chat lines said now still put up no ticker on the walk, whatever the AIs have said.
      for (const text of ['Anyone selling?', 'Food is cheap today.']) (room as unknown as { deliver(from: string, text: string): void }).deliver(state.players[0]!.id, text);
      await tv.waitForTimeout(300);
      const helpLines = await lines();
      check(helpLines === 0, `TV-FIT: the auction TV's walk shows no chat ticker, got ${helpLines} lines`);
      const helpBoard = await boardHeight();
      const help = await shownWhole(tv, 'auction (the help)', ['[data-testid=tv-help]', '[data-testid=tv-room-line]']);
      check(help.length === 2, `TV-FIT: the auction TV shows its help and its room line, got ${help.map((b) => b.id).join(', ')}`);
      const helpFoot = await nothingPastTheFoot(tv, 'auction (the help)');
      a.deals = [
        { buyer: p.id, seller: q.id, price: 31, units: 6 },
        { buyer: 'store', seller: state.players[0]!.id, price: 25, units: 2 },
      ];
      (room as unknown as { broadcast(): void }).broadcast();
      await tv.locator('[data-testid=tv-deal]').nth(1).waitFor({ timeout: 2_000 });
      const dealLines = await lines();
      check(dealLines === 0, `TV-FIT: while deals run the auction TV shows no chat ticker, got ${dealLines} lines`);
      const dealsBoard = await boardHeight();
      check(Math.abs(dealsBoard - helpBoard) <= 1, `TV-FIT: the walk board keeps its size as deals start, ${helpBoard.toFixed(1)} px then ${dealsBoard.toFixed(1)} px`);
      const rows = await tv.evaluate(() => {
        const list = document.querySelector('[data-testid=tv-deal]')?.parentElement?.getBoundingClientRect();
        return [...document.querySelectorAll('[data-testid=tv-deal]')].map((d) => {
          const b = d.getBoundingClientRect();
          return { whole: !!list && b.top >= list.top - 1 && b.bottom <= list.bottom + 1 && b.left >= list.left - 1 && b.right <= list.right + 1, top: b.top, bottom: b.bottom, left: b.left, list: list ? `${list.left.toFixed(0)},${list.top.toFixed(0)}–${list.right.toFixed(0)},${list.bottom.toFixed(0)}` : 'none' };
        });
      });
      check(rows.length === 2, `TV-FIT: the auction TV lists both deals, got ${rows.length}`);
      for (const [i, r] of rows.entries()) check(r.whole, `TV-FIT: the auction TV's deal row ${i + 1} is whole in its list, at x ${r.left.toFixed(1)}, y ${r.top.toFixed(1)}–${r.bottom.toFixed(1)}, in the list at ${r.list}`);
      await shownWhole(tv, 'auction (two deals)', ['[data-testid=tv-deal]', '[data-testid=tv-room-line]']);
      const dealsFoot = await nothingPastTheFoot(tv, 'auction (two deals)');
      return `no ticker on the walk, the board ${helpBoard.toFixed(0)} px with or without deals; the help whole, its foot at y ${helpFoot.toFixed(0)}; two deal rows whole, y ${rows[0]!.top.toFixed(0)}–${rows[1]!.bottom.toFixed(0)}, the foot at y ${dealsFoot.toFixed(0)}`;
    } finally {
      a.deals = kept;
      (room as unknown as { broadcast(): void }).broadcast();
    }
  });
}
