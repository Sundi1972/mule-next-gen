/**
 * B-AC-14 (C17, RULE-8): planning is the hub for the month. Run by smoke.ts in month-2 planning, right after
 * store-steps' makeHungry seated the human at 2 Food against a need of 5 (nine farms, which also burn Energy).
 * Quick by design: planning is about 4.5 s at the smoke's phase scale, and listedSale has used part of it.
 * B-AC-19 (AM-16), the host's Continue, is run by auction-steps.ts in its month-2 planning; its six-seat TV case
 * (sixSeatsOnTheTv) by shell.ts, in a room of its own; so is E-11's Governor's desk above the table chat
 * (governorsDeskFits), a room per phone size.
 */
import { join } from 'node:path';
import { GOODS, monthNeeds, type GameState, type Good, type TaxPromise } from '@mule/engine';
import type { Browser, Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, held as holding, PHONE, TV } from './harness';
import { ELECTION_WAIT_MS } from './politics-steps';
import { LAPTOP, railFits } from './shell-steps';

/** The human sits in seat 1. */
const SEAT = 's1';
/** makeHungry's Food: the seat holds 2. */
const HUNGRY_FOOD = 2;
/** RULE-8: these first, in this order; then the rest by need. */
const FIRST: Good[] = ['food', 'water', 'energy'];
/** C17: what exists today, and nothing else, is drawn; the Governor's desk only for the Governor. */
const TODAYS_DESKS = ['colony', 'talk', 'council', 'market'];
/** Every office's desk. AI seats run in month 1, so whether the smoke's seat holds an office is read from the game. */
const OFFICE_DESKS = ['governor', 'sheriff'] as const;
/** C17: the office desks built today; the Sheriff's is not, so a Sheriff sees no desk for it. */
const BUILT_OFFICE_DESKS: readonly string[] = ['governor'];
const TODAYS_TOOLS = ['look', 'drone', 'list'];
/** B-AC-12: the stage's content fills at least this share of the stage's height. */
const FILL = 0.8;

type Shown = {
  phase: string | null;
  onStage: { agenda: boolean; map: boolean; marketStrip: boolean };
  desks: string[];
  tools: string[];
  needs: { good: string; text: string }[];
  thisMonthInColony: boolean;
  nowFirst: boolean;
  nowTitle: string;
  nowDetail: string;
  /** Review-aid labels the mock carries and the game must not. */
  reviewLabels: string[];
  fill: number;
};

/**
 * B-AC-14: the hub shows "This month" and the colony map on the stage; the Colony desk's needs say SHORT or OK as
 * the engine's monthNeeds has them; a good with no need has no row; no office desk is drawn without the office.
 * With it, B-AC-12's planning part: `now` opens the rail at 844×390 and at 1440×900. Returns what it saw, to log.
 */
export async function planningIsTheHub(phone: Page, server: MuleServer, code: string, timeout = 2_000): Promise<string> {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const state = (room as unknown as { game: { state: GameState } }).game.state;
  check(state.phase === 'planning', `B-AC-14: the hub step runs in planning, not in ${state.phase}`);
  const me = state.players.find((p) => p.id === SEAT);
  check(me, `seat ${SEAT} in the game`);
  check(me.stock.food === HUNGRY_FOOD, `B-AC-14: makeHungry seated ${SEAT} at ${HUNGRY_FOOD} Food, got ${me.stock.food}`);
  const need = monthNeeds(state, SEAT);
  const have = { ...me.stock };

  const planning = phone.locator('[data-phase=planning]');
  await planning.getByTestId('desk-colony').click({ timeout });
  const verdict = (g: Good) => (have[g] >= need[g] ? 'OK' : `SHORT ${need[g] - have[g]}`);
  await planning.getByTestId('need-food').filter({ hasText: verdict('food') }).waitFor({ timeout });
  // An office holder's hub opens on the office's desk, which asks first, and folds Now to its title (E-9, E-11): with
  // the Colony desk open, Now is opened again to be read whole.
  const folded = planning.locator('button[data-testid=now]');
  if (await folded.count()) {
    await folded.click({ timeout });
    await planning.getByTestId('now-fold').waitFor({ timeout });
  }

  const held = OFFICE_DESKS.filter((o) => state.politics?.[o] === SEAT && BUILT_OFFICE_DESKS.includes(o));
  const narrow = await read(phone);
  checkHub(narrow, `${PHONE.viewport.width}×${PHONE.viewport.height}`, held);
  const expected = GOODS.filter((g) => need[g] > 0);
  const rows = narrow.needs.map((n) => n.good);
  check(JSON.stringify([...rows].sort()) === JSON.stringify([...expected].sort()), `B-AC-14: a row for each good she needs this month (${expected.join(', ')}), got ${rows.join(', ')}`);
  const firsts = rows.filter((g) => FIRST.includes(g as Good));
  check(JSON.stringify(rows.slice(0, firsts.length)) === JSON.stringify(FIRST.filter((g) => need[g] > 0)), `B-AC-14 (RULE-8): Food, Water and Energy lead the needs, got ${rows.join(', ')}`);
  for (const n of narrow.needs) {
    const g = n.good as Good;
    check(n.text.includes(verdict(g)), `B-AC-14: need-${g} says ${verdict(g)} (have ${have[g]}, need ${need[g]}), got "${n.text}"`);
    check(n.text.includes(`HAVE ${have[g]} · NEED ${need[g]}`), `B-AC-14: need-${g} shows have ${have[g]} against need ${need[g]}, got "${n.text}"`);
  }
  check(need.food - have.food === 3, `B-AC-14: the seeded shortfall is Food 2 of 5, got ${have.food} of ${need.food}`);
  check(need.smithore === 0 && !rows.includes('smithore'), `B-AC-14 (negative): with no mine or factory she needs no Smithore and has no row for it, got rows ${rows.join(', ')}`);
  // A Governor elected this month is first told to set the tax (C66, E-7); everyone else plans (RULE-8).
  const newGovernor = state.politics?.governor === SEAT && state.politics.election?.stage === 'over';
  if (newGovernor) {
    check(narrow.nowTitle === 'Set the sales tax', `C66 (E-7): the new Governor's Now says "Set the sales tax", got "${narrow.nowTitle}"`);
    check(/Then plan your month\. You are the new Governor/.test(narrow.nowDetail), `C66 (E-7): the new Governor's Now says to plan the month next, got "${narrow.nowDetail}"`);
  } else {
    check(narrow.nowTitle === 'Plan your month, then press Ready', `B-AC-14 (RULE-8): Now says "Plan your month, then press Ready", got "${narrow.nowTitle}"`);
    check(/land grant/.test(narrow.nowDetail) && /Food/.test(narrow.nowDetail), `B-AC-14 (RULE-8): Now names the land grant as next and the short Food, got "${narrow.nowDetail}"`);
  }

  let wide: Shown;
  try {
    await phone.setViewportSize(LAPTOP);
    wide = await read(phone);
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }
  checkHub(wide, `${LAPTOP.width}×${LAPTOP.height}`, held);
  check(wide.onStage.marketStrip, `B-AC-14: at ${LAPTOP.width} px the store's prices sit under the map, on the stage`);
  return `desks ${narrow.desks.join(', ')} (office desks held: ${held.join(', ') || 'none'}); needs ${narrow.needs.map((n) => `${n.good} ${verdict(n.good as Good)}`).join(', ')}; now first at 844 and 1440; stage filled ${(narrow.fill * 100).toFixed(0)}% / ${(wide.fill * 100).toFixed(0)}%`;
}

function checkHub(f: Shown, at: string, held: readonly string[]): void {
  check(f.phase === 'planning', `B-AC-14: planning still shows at ${at}, got ${f.phase}`);
  check(f.onStage.agenda, `B-AC-14: at ${at} "This month" (agenda) is on the stage`);
  check(f.onStage.map, `B-AC-14: at ${at} the colony map (hub-map) is on the stage`);
  check(f.thisMonthInColony, `B-AC-14: at ${at} the Colony desk holds "This month you need"`);
  const foreign = f.desks.filter((d) => (OFFICE_DESKS as readonly string[]).includes(d) && !held.includes(d));
  check(foreign.length === 0, `B-AC-14 (negative): a player sees no desk of an office they do not hold, got ${foreign.join(', ')}`);
  const expected = [...held, ...TODAYS_DESKS];
  check(JSON.stringify(f.desks) === JSON.stringify(expected), `B-AC-14: at ${at} the desks drawn are exactly ${expected.join(', ')}, got ${f.desks.join(', ')}`);
  check(JSON.stringify(f.tools) === JSON.stringify(TODAYS_TOOLS), `B-AC-14: at ${at} the map tools drawn are exactly ${TODAYS_TOOLS.join(', ')}, got ${f.tools.join(', ')}`);
  check(f.reviewLabels.length === 0, `C17: unbuilt slots are not drawn, and no SOON or slice label shows; got ${f.reviewLabels.join(' | ')}`);
  check(f.nowFirst, `B-AC-12: at ${at} planning's rail opens with Now`);
  check(f.fill >= FILL, `B-AC-12: at ${at} the hub fills ${(f.fill * 100).toFixed(0)}% of the stage's height, under ${FILL * 100}%`);
}

/** One read of the planning screen, after a paint, in one pass. */
async function read(phone: Page): Promise<Shown> {
  return phone.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const screen = document.querySelector('[data-phase]');
    const stage = screen?.querySelector('[data-testid=stage]');
    const guide = screen?.querySelector('[data-testid=guide]');
    const body = guide?.querySelector('header')?.nextElementSibling;
    const tabs = screen?.querySelector('[data-testid=desks]');
    const content = stage?.firstElementChild;
    const stageBox = stage?.getBoundingClientRect();
    const pad = stage ? parseFloat(getComputedStyle(stage).paddingTop) + parseFloat(getComputedStyle(stage).paddingBottom) : 0;
    const shell = screen?.querySelector('[data-testid=game-shell]') as HTMLElement | null;
    return {
      phase: screen?.getAttribute('data-phase') ?? null,
      onStage: {
        agenda: !!stage?.querySelector('[data-testid=agenda]'),
        map: !!stage?.querySelector('[data-testid=hub-map]'),
        marketStrip: !!stage?.querySelector('[data-testid=market-strip]') && (stage.querySelector('[data-testid=market-strip]') as HTMLElement).offsetParent !== null,
      },
      desks: [...(tabs?.querySelectorAll('[data-testid^="desk-"]') ?? [])].map((d) => d.getAttribute('data-testid')!.slice('desk-'.length)),
      tools: [...(screen?.querySelectorAll('[data-testid=map-tools] [data-testid^="tool-"]') ?? [])].map((t) => t.getAttribute('data-testid')!.slice('tool-'.length)),
      needs: [...(guide?.querySelectorAll('[data-testid^="need-"]') ?? [])].map((n) => ({ good: n.getAttribute('data-testid')!.slice('need-'.length), text: (n as HTMLElement).innerText })),
      thisMonthInColony: !!guide?.querySelector('[data-testid=desk-body-colony] [data-testid=this-month]'),
      // Now first: the card itself, or the card a folding Now wraps with its fold button (E-9).
      nowFirst: !!body?.firstElementChild && !!guide?.querySelector('[data-testid=now]') && body.firstElementChild.contains(guide.querySelector('[data-testid=now]')),
      nowTitle: guide?.querySelector('[data-testid=now-title]')?.textContent ?? '',
      nowDetail: (guide?.querySelector('[data-testid=now]') as HTMLElement | null)?.innerText ?? '',
      reviewLabels: (shell?.innerText ?? '').split('\n').filter((l) => /\bSOON\b|\bSLICE\b|\bWS7\b/.test(l)),
      fill: content && stageBox ? content.getBoundingClientRect().height / (stageBox.height - pad) : 0,
    };
  });
}

/** A phone at the table, as the e2e scripts hold it. */
type Seated = { page: Page; name: string };

/**
 * B-AC-19 (AM-16): planning has no clock. In planning proper `host` and `ready` press Ready and `left` does not; every
 * phone and the TV say `left` is still planning, and each phone's header shows the ready count. Only the host gets
 * Continue; once confirmed, the land grant opens on every screen and the server's news names who was left. With
 * MULE_SHOTS set to a directory, the step also saves the four screens there at night, for a look against the mock.
 */
/** Test fixture: a busy month's news, as many lines as the server keeps (three), told to every screen at once. */
function busyNews(room: unknown): void {
  const game = (room as { game?: { news?: unknown; ctx?: { changed?: unknown } } }).game;
  check(Array.isArray(game?.news) && typeof game?.ctx?.changed === 'function', 'the room game still exposes its news and ctx');
  (game as { news: string[] }).news = [
    'Brix is Governor (appointed) · the colony fund pays the Governor.',
    'Brix listed plot 3·4 for the land auction at 160 cr, and the colony lists plot 9·2.',
    'Welcome to the colony. Talk tactics, then grab land.',
  ];
  (game as { ctx: { changed(): void } }).ctx.changed();
}

export async function hostContinuesWithout({ host, ready, left, tv, server, code }: { host: Seated; ready: Seated; left: Seated; tv: Page; server: MuleServer; code: string }, timeout = 3_000): Promise<void> {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const table = () => room.viewFor(null);
  const seatOf = (p: Seated) => {
    const id = table().seats.find((s) => s.name === p.name)?.id;
    check(id, `${p.name} has a seat`);
    return id;
  };
  const [hostId, readyId, leftId] = [seatOf(host), seatOf(ready), seatOf(left)];
  const start = table().game;
  const election = start?.politics?.election;
  check(start?.phase === 'planning' && !(election && election.stage !== 'over'), `B-AC-19: the step runs in planning proper, got ${start?.phase}, election ${election?.stage}`);
  check(table().hostId === hostId, `B-AC-19: ${host.name} hosts the table, got ${table().hostId}`);
  const phones = [host, ready, left];
  const shots = process.env.MULE_SHOTS;
  const shot = async (page: Page, name: string) => {
    if (!shots) return;
    const now = page.locator('[data-phase=planning] [data-testid=now]');
    if (await now.count()) await now.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, `b-ac-19-${name}.png`) });
  };
  if (shots) await Promise.all([...phones.map((p) => p.page), tv].map((page) => page.getByRole('button', { name: 'Night', exact: true }).first().click({ timeout })));

  const planning = (p: Seated) => p.page.locator('[data-phase=planning]');
  await Promise.all(
    [host, ready].map(async (p) => {
      await planning(p).getByTestId('ready').click({ timeout });
      await planning(p).getByTestId('you-are-ready').waitFor({ timeout });
    }),
  );

  const players = start.players;
  const count = `${2 + players.filter((p) => p.isAi).length} / ${players.length} READY`;
  for (const p of phones) {
    const header = p.page.locator('[data-phase=planning] [data-testid=guide] header [data-testid=ready-count]');
    await header.filter({ hasText: count }).waitFor({ timeout });
    const waiting = planning(p).getByTestId('waiting-for');
    await waiting.getByTestId(`waiting-${leftId}`).waitFor({ timeout });
    const named = (await waiting.getByTestId(`waiting-${leftId}`).innerText()).trim();
    check(named === (p === left ? 'you' : left.name), `B-AC-19: ${p.name}'s phone names ${p === left ? 'her as "you"' : left.name} as still planning, got "${named}"`);
    const readyNamed = (await waiting.getByTestId(`waiting-${hostId}`).count()) + (await waiting.getByTestId(`waiting-${readyId}`).count());
    check(readyNamed === 0, `B-AC-19: ${p.name}'s phone waits for nobody who is Ready, got "${await waiting.innerText()}"`);
    if (p === left) continue;
    const now = (await planning(p).getByTestId('now-title').innerText()).trim();
    check(now.includes(left.name), `B-AC-19: once Ready, ${p.name}'s Now names ${left.name} as who the table waits for, got "${now}"`);
  }
  // The TV's side column at its fullest: the three news lines the server keeps, beside the waiting band.
  busyNews(room);
  const board = tv.locator('[data-phase=planning]');
  const tvWaiting = board.getByTestId('tv-waiting');
  await tvWaiting.getByTestId(`waiting-${leftId}`).filter({ hasText: left.name }).waitFor({ timeout });
  check((await tvWaiting.getByTestId(`waiting-${hostId}`).count()) + (await tvWaiting.getByTestId(`waiting-${readyId}`).count()) === 0, `B-AC-19: the TV waits for nobody who is Ready, got "${await tvWaiting.innerText()}"`);
  const row = (p: Seated) => board.getByTestId('tv-ready-list').locator('li', { hasText: p.name }).innerText();
  check(/\bPLANNING$/.test((await row(left)).trim()) && !(await row(left)).includes('AWAY'), `B-AC-19: the TV's list says ${left.name} is PLANNING, got "${await row(left)}"`);
  check(/\bREADY$/.test((await row(host)).trim()), `B-AC-19: the TV's list says ${host.name} is READY, got "${await row(host)}"`);
  check((await board.getByTestId('ready-count').innerText()).trim() === count, `B-AC-19: the TV shows ${count}, got "${await board.getByTestId('ready-count').innerText()}"`);
  // The waiting band takes room from the side column; the market prices must still show whole beside it.
  const market = await board.getByTestId('tv-market').evaluate((e) => [e.scrollHeight, e.clientHeight]);
  check(market[0]! <= market[1]! + 1, `B-AC-19: the TV keeps its market tiles whole beside the waiting band, got ${market[1]} of ${market[0]} px`);

  const go = planning(host).getByTestId('continue');
  await go.waitFor({ timeout });
  check((await go.innerText()).trim() === `Continue without ${left.name}`, `B-AC-19: the host's button reads "Continue without ${left.name}", got "${await go.innerText()}"`);
  for (const p of [ready, left]) check((await planning(p).getByTestId('continue').count()) === 0, `B-AC-19 (negative): ${p.name}, who is not the host, has no Continue`);
  await Promise.all([shot(host.page, 'host'), shot(ready.page, 'not-host'), shot(left.page, 'left'), shot(tv, 'tv')]);

  await go.click({ timeout });
  await planning(host).getByTestId('continue-confirm').waitFor({ timeout });
  await shot(host.page, 'confirm');
  check(table().game?.phase === 'planning', `B-AC-19: one tap on Continue ends nothing before the confirm, got ${table().game?.phase}`);
  await planning(host).getByTestId('continue-now').click({ timeout });

  await Promise.all([...phones.map((p) => p.page), tv].map((page) => page.locator('[data-phase=landGrant]').waitFor({ timeout })));
  const news = table().game?.news ?? [];
  const line = `${host.name} continued without ${left.name}.`;
  check(news.includes(line), `B-AC-19: the server's news says "${line}", got ${JSON.stringify(news)}`);
  console.log(`✓ B-AC-19: ${host.name} and ${ready.name} Ready, ${left.name} named on every phone and the TV (${count}); only ${host.name} had Continue; the land grant opened everywhere, and the news says "${line}"`);
}

/**
 * B-AC-19 at six seats: one person and five AIs, the TV in planning with a busy month's news. The ready list stays on
 * the canvas, the market tiles whole, and the newest news line, the election result, shows whole beside them.
 */
export async function sixSeatsOnTheTv({ browser, base, server }: { browser: Browser; base: string; server: MuleServer }, timeout = 5_000): Promise<string> {
  const phone = await (await browser.newContext(PHONE)).newPage();
  const tv = await (await browser.newContext(TV)).newPage();
  try {
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill('Mia');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor({ timeout });
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    for (let i = 1; i <= 5; i++) {
      await phone.getByRole('button', { name: 'Add AI player' }).click();
      await phone.locator('[data-testid=seats] li').nth(i).waitFor({ timeout });
    }
    await phone.getByRole('button', { name: 'Start game' }).click();
    await tv.goto(`${base}/table?room=${code}`);
    const board = tv.locator('[data-phase=planning]');
    // Election day holds the TV until it is over: Mia is Ready to vote, then abstains and casts if there is a ballot.
    const step = phone.locator('[data-testid=ready]:not([disabled])').filter({ hasText: /Ready to vote|Cast my vote/ });
    const abstain = phone.locator('[data-testid=ballot-card] [data-testid$="-abstain"] input:not(:checked)');
    for (const deadline = Date.now() + ELECTION_WAIT_MS + timeout; !(await board.getByTestId('tv-ready-list').isVisible()); ) {
      check(Date.now() < deadline, 'B-AC-19 (six seats): election day ends and the TV shows planning');
      for (const box of await abstain.all()) await box.check({ timeout });
      if (await step.isVisible()) await step.click({ timeout }).catch(() => {});
      await phone.waitForTimeout(100);
    }
    await board.getByTestId('tv-ready-list').waitFor({ timeout });
    busyNews(server.registry.get(code));
    const newest = board.getByTestId('tv-news').locator('li').first();
    await newest.filter({ hasText: 'is Governor' }).waitFor({ state: 'attached', timeout });

    // The column is checked twice: as it stands, then with the TV's chat ticker showing a line above it (C20).
    const fits = async (when: string) => {
      const canvas = await board.evaluate((e) => e.getBoundingClientRect().bottom);
      const list = await board.getByTestId('tv-ready-list').evaluate((e) => e.getBoundingClientRect().bottom);
      check(list <= canvas + 1, `B-AC-19 (six seats${when}): the TV's ready list stays on the canvas, got its bottom at ${list.toFixed(0)} of ${canvas.toFixed(0)} px`);
      const market = await board.getByTestId('tv-market').evaluate((e) => [e.scrollHeight, e.clientHeight]);
      check(market[0]! <= market[1]! + 1, `B-AC-19 (six seats${when}): the market tiles are whole, got ${market[1]} of ${market[0]} px`);
      // Whole means both edges of the line can be hit: clipped by its column or covered by the list, they can't.
      const shown = await newest.evaluate((li) => {
        const r = li.getBoundingClientRect();
        // No named function in here: tsx would wrap it in a helper the page doesn't have.
        const [top, bottom] = [r.top + 2, r.bottom - 2].map((y) => li.contains(document.elementFromPoint(r.left + 8, y)));
        return { top, bottom, height: r.height };
      });
      check(shown.height > 0 && shown.top && shown.bottom, `B-AC-19 (six seats${when}): the election result shows whole in the TV's news, got ${JSON.stringify(shown)}`);
      return `the ready list ends at ${list.toFixed(0)} of ${canvas.toFixed(0)} px`;
    };
    const quiet = await fits('');
    const room = server.registry.get(code) as unknown as { seats: { id: string }[]; chat: (from: string, text: string) => void };
    room.chat(room.seats[0]!.id, 'Six of us at one table, then.');
    await tv.getByText('Six of us at one table, then.').first().waitFor({ timeout });
    const talking = await fits(', with a chat line');
    return `six seats: ${quiet}, ${talking} with a chat line showing; the market whole, the election result whole in the news`;
  } finally {
    await phone.context().close();
    await tv.context().close();
  }
}

/** E-11's sizes: a small phone on its side, and a smaller one. */
const GOV_SIZES = [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
] as const;
/** E-11: at 844 × 390 the tax row and its verdict end at least this far above the footer (the PM's measured floor). */
const GOV_MARGIN_844 = 6;
/** Every desk tab, on the smaller phone: at least this wide and tall. */
const TAB_MIN = 32;

/** One read of the Governor's rail: where the row and verdict end against the footer, and where the table chat is. */
type GovFit = {
  footerTop: number;
  rowBottom: number;
  verdictBottom: number;
  verdict: string;
  railScroll: number;
  /** The seat row in the rail's body, under the desk (C20 on a phone), not its header. */
  seatRow: boolean;
  ticker: number;
  names: boolean;
  nowFolded: boolean;
  desk: string | null;
  tabs: { id: string; w: number; h: number; clipped: boolean }[];
};

/** Reads the rail after a paint, in one pass. Kept a string: tsx would wrap named functions in a helper the page lacks. */
const READ_GOV = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = document.querySelector('[data-phase=planning] [data-testid=guide]');
  const box = (sel) => g?.querySelector(sel)?.getBoundingClientRect() ?? null;
  const footer = box('[data-testid=actions]');
  const row = box('[data-testid=governor-tax-row]');
  const verdict = box('[data-testid=governor-verdict]');
  const tabs = [...(g?.querySelectorAll('[data-testid=desks] [role=tab]') ?? [])].map((t) => {
    const r = t.getBoundingClientRect();
    // The label is the tab's own text: whole when its box sits inside the tab's (a badge may overhang by design).
    const label = document.createRange();
    const text = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (text) label.selectNodeContents(text);
    const l = text ? label.getBoundingClientRect() : r;
    return { id: t.dataset.testid, w: r.width, h: r.height, clipped: l.left < r.left - 0.5 || l.right > r.right + 0.5 };
  });
  return {
    footerTop: footer?.top ?? NaN,
    rowBottom: row?.bottom ?? NaN,
    verdictBottom: verdict?.bottom ?? NaN,
    verdict: g?.querySelector('[data-testid=governor-verdict] [aria-hidden]')?.textContent ?? '',
    railScroll: g?.querySelector('header + div')?.scrollTop ?? -1,
    seatRow: !!g?.querySelector('header + div [data-testid=seat-row]') && !g?.querySelector('header [data-testid=seat-row]'),
    ticker: g?.querySelectorAll('[data-testid=chat-ticker] li').length ?? 0,
    // Shown, not just in the markup: a name kept for a screen reader only would not count.
    names: (() => { const w = g?.querySelector('[data-testid=actions] [data-testid=waiting-for]'); return !!w && !w.closest('.sr-only') && w.getBoundingClientRect().height > 1; })(),
    nowFolded: g?.querySelector('[data-testid=now]')?.tagName === 'BUTTON',
    desk: g?.querySelector('[data-testid=desks] [aria-selected=true]')?.dataset.testid ?? null,
    tabs,
  };
})()`;

/**
 * E-11 (C66, the Governor's desk with the table chat): Lena, the sitting Governor, plans at `size` with the chat's seat
 * row and a two-line ticker, and Ossa still planning. Under C20's rule on a phone the chat follows the rail's content,
 * so nothing folds: the footer names who is still planning, the ticker keeps both lines, and the seat row sits under the
 * desk. With her desk open the tax row and its verdict end above the footer, without the rail scrolling, as the desk
 * opens over her promise, after −, and after Set (at 844 × 390 by at least GOV_MARGIN_844); railFits reads the tax row
 * as it opens. Every desk tab is at least TAB_MIN square, its label whole. Clicks are DOM clicks, so the page never scrolls the rail to reach a button: what is measured is
 * what shows untouched. With MULE_SHOTS set to a directory, it saves the screen as the desk opens and after Set there.
 * Returns the numbers, to log.
 */
async function governorDeskFits(lena: Page, size: { width: number; height: number }, timeout = 3_000): Promise<string> {
  const at = `${size.width}×${size.height}`;
  await lena.setViewportSize(size);
  const guide = lena.locator('[data-phase=planning] [data-testid=guide]');
  await guide.getByTestId('governor-tax-row').waitFor({ timeout });
  const read = () => lena.evaluate(READ_GOV) as Promise<GovFit>;
  const click = (id: string) => guide.getByTestId(id).evaluate((el: HTMLElement) => el.click());
  const floor = size.width === GOV_SIZES[0].width ? GOV_MARGIN_844 : 0;
  const seen: string[] = [];
  const fits = (f: GovFit, state: string, verdict: string) => {
    check(f.desk === 'desk-governor', `E-11 at ${at} (${state}): the Governor's desk is open, got ${f.desk}`);
    check(f.seatRow, `E-11 at ${at} (${state}): the chat's seat row is in the rail's body, under the desk (C20)`);
    check(f.nowFolded, `E-11 at ${at} (${state}): the Now card is folded to its title (E-9)`);
    check(f.verdict === verdict, `E-11 at ${at} (${state}): the verdict reads "${verdict}", got "${f.verdict}"`);
    check(f.railScroll === 0, `E-11 at ${at} (${state}): the rail did not scroll, got scrollTop ${f.railScroll}`);
    const row = f.footerTop - f.rowBottom;
    const chip = f.footerTop - f.verdictBottom;
    seen.push(`${state}: row ${f.rowBottom.toFixed(1)}, verdict ${f.verdictBottom.toFixed(1)}, footer ${f.footerTop.toFixed(1)} (${row.toFixed(1)} / ${chip.toFixed(1)} px clear)`);
    check(row >= floor && chip >= floor, `E-11 at ${at} (${state}): the tax row and its verdict end at least ${floor} px above the footer, got row ${f.rowBottom.toFixed(1)} and verdict ${f.verdictBottom.toFixed(1)} against footer ${f.footerTop.toFixed(1)}`);
    check(f.names, `E-11 at ${at} (${state}): with the Governor's desk open the footer still names who is still planning (no fold)`);
    check(f.ticker === 2, `E-11 at ${at} (${state}): with the Governor's desk open the ticker keeps its two lines (no fold), got ${f.ticker}`);
  };

  const shots = process.env.MULE_SHOTS;
  const shot = (name: string) => (shots ? lena.screenshot({ path: join(shots, `e-11-${size.width}-${name}.png`) }).then(() => {}) : Promise.resolve());
  const opened = await read();
  await shot('opens');
  if (size.width === GOV_SIZES[1].width) {
    const tabs = opened.tabs.map((t) => `${t.id.slice('desk-'.length)} ${t.w.toFixed(1)}×${t.h.toFixed(1)}${t.clipped ? ' clipped' : ''}`).join(', ');
    const small = opened.tabs.filter((t) => t.w < TAB_MIN - 0.01 || t.h < TAB_MIN - 0.01 || t.clipped);
    check(opened.tabs.length >= 5 && small.length === 0, `E-11 at ${at}: every desk tab is at least ${TAB_MIN}×${TAB_MIN} with its label whole, got ${tabs}`);
    seen.push(`tabs ${tabs}`);
    // Test fixture: a sixth desk, as an office holder may have (E-11 sizes the row for six). No game draws six today, so
    // the Council's tab, the longest word, is drawn twice for one read, then taken away.
    await guide.getByTestId('desk-council').evaluate((t) => t.after(Object.assign(t.cloneNode(true), { id: 'sixth-desk' })));
    const six = (await read()).tabs;
    await lena.evaluate(() => document.getElementById('sixth-desk')?.remove());
    const sixTabs = six.map((t) => `${t.w.toFixed(1)}×${t.h.toFixed(1)}${t.clipped ? ' clipped' : ''}`).join(', ');
    check(six.length === opened.tabs.length + 1 && six.every((t) => t.w >= TAB_MIN - 0.01 && t.h >= TAB_MIN - 0.01 && !t.clipped), `E-11 at ${at}: six desk tabs each keep at least ${TAB_MIN}×${TAB_MIN} with the label whole, got ${sixTabs}`);
    seen.push(`six tabs ${sixTabs}`);
  }
  fits(opened, 'as it opens', 'breaks it');
  seen.push(`railFits ${await railFits(lena, { key: 'governor-tax-row', clear: { [GOV_SIZES[0].width]: GOV_MARGIN_844 }, sizes: [size] })}`);
  await click('tax-down');
  await guide.getByTestId('gov-within').waitFor({ timeout });
  fits(await read(), 'after −', 'within');
  await click('tax-confirm');
  await guide.getByTestId('gov-done').waitFor({ timeout });
  await shot('set');
  fits(await read(), 'after Set', 'done');
  return `${at}: ${seen.join('; ')}`;
}

/** E-11's fixture: Lena's promise of up to 4%, under the month's 5%, so the desk opens on "breaks it" and − brings it within. */
const GOV_PROMISE: TaxPromise = { kind: 'cap', percent: 4 };
const GOV_TAX = 0.05;
/** Two lines from Ossa, so the ticker holds two. */
const GOV_LINES = ['Anyone selling Smithore this month?', 'Lena, keep that tax low!'];

/** Test fixture: the month's election set aside, `lena` seated as Governor on GOV_PROMISE at GOV_TAX, told to every screen. */
function seatGovernor(room: unknown, lena: string): void {
  const { game, broadcast } = room as { game: { state: GameState }; broadcast(): void };
  const { state } = game;
  const p = state.politics;
  check(p && state.phase === 'planning', `E-11: the room plays politics and is in planning, got ${state.phase}`);
  p.election = null;
  p.candidates = { governor: [], sheriff: [] };
  p.promises = {};
  p.governor = lena;
  p.governorRun = { id: lena, terms: 1 };
  p.terms = { ...p.terms, [lena]: 1 };
  p.termStart = state.month;
  p.promise = GOV_PROMISE;
  state.treasury.salesTax = GOV_TAX;
  p.taxAtStart = GOV_TAX;
  p.promiseFrom = Math.round(GOV_TAX * 100);
  broadcast.call(room);
}

/**
 * E-11 (C66): the Governor's desk fits beside the table chat, at each of GOV_SIZES in a room of its own on `server`:
 * Lena and Ossa with two AI seats, so the header reads 2 / 4 READY and the footer waits for both. Month 1's election
 * is set aside and Lena seated as Governor (seatGovernor); Ossa says two lines. The game clock is held throughout, so
 * nothing scheduled moves the phase on. No page or console error on either phone. Returns the numbers, to log.
 */
export async function governorsDeskFits({ browser, base, server }: { browser: Browser; base: string; server: MuleServer }, timeout = 5_000): Promise<string> {
  const seen: string[] = [];
  for (const size of GOV_SIZES) {
    const errors: string[] = [];
    const open = async (name: string) => {
      const page = await (await browser.newContext(PHONE)).newPage();
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`);
      });
      return page;
    };
    const lena = await open('Lena');
    const ossa = await open('Ossa');
    try {
      await lena.goto(base);
      await lena.getByPlaceholder('Heiko').fill('Lena');
      await lena.getByRole('button', { name: 'Start a new game' }).click();
      await lena.getByText("You're at the table").waitFor({ timeout });
      const code = (await lena.getByTestId('room-code').textContent())?.trim() ?? '';
      await ossa.goto(`${base}/?room=${code}`);
      await ossa.getByPlaceholder('Heiko').fill('Ossa');
      await ossa.getByRole('button', { name: `Join game ${code}` }).click();
      await ossa.getByText("You're at the table").waitFor({ timeout });
      for (const n of [2, 3]) {
        await lena.getByRole('button', { name: 'Add AI player' }).click();
        await lena.locator('[data-testid=seats] li').nth(n).waitFor({ timeout });
      }
      await lena.getByRole('button', { name: 'Start game' }).click();
      await Promise.all([lena, ossa].map((p) => p.locator('[data-phase=planning]').waitFor({ timeout })));
      const room = server.registry.get(code);
      check(room, `a room ${code} on the server`);
      const idOf = (name: string) => {
        const id = room.viewFor(null).seats.find((s) => s.name === name)?.id;
        check(id, `${name} has a seat`);
        return id;
      };
      const [lenaId, ossaId] = [idOf('Lena'), idOf('Ossa')];
      await holding(server, code, async () => {
        seatGovernor(room, lenaId);
        const guide = lena.locator('[data-phase=planning] [data-testid=guide]');
        await guide.getByTestId('desk-governor').waitFor({ timeout });
        await guide.getByTestId('ready-count').filter({ hasText: '2 / 4 READY' }).waitFor({ timeout });
        const chat = room as unknown as { chat: (from: string, text: string) => void };
        for (const line of GOV_LINES) chat.chat(ossaId, line);
        await guide.getByTestId('chat-ticker').getByText(GOV_LINES[1]!).waitFor({ timeout });
        seen.push(await governorDeskFits(lena, size));
      });
      check(errors.length === 0, `E-11 at ${size.width}×${size.height}: no page or console error, got ${errors.join('; ')}`);
    } finally {
      await lena.context().close();
      await ossa.context().close();
    }
  }
  return seen.join(' | ');
}
