/**
 * B-AC-14 (C17, RULE-8): planning is the hub for the month. Run by smoke.ts in month-2 planning, right after
 * store-steps' makeHungry seated the human at 2 Food against a need of 5 (nine farms, which also burn Energy).
 * Quick by design: planning is about 4.5 s at the smoke's phase scale, and listedSale has used part of it.
 * B-AC-19 (AM-16), the host's Continue, is run by auction-steps.ts in its month-2 planning; its six-seat TV case
 * (sixSeatsOnTheTv) by shell.ts, in a room of its own.
 */
import { join } from 'node:path';
import { GOODS, monthNeeds, type GameState, type Good } from '@mule/engine';
import type { Browser, Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, PHONE, TV } from './harness';
import { ELECTION_WAIT_MS } from './politics-steps';
import { LAPTOP } from './shell-steps';

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
  check(narrow.nowTitle === 'Plan your month, then press Ready', `B-AC-14 (RULE-8): Now says "Plan your month, then press Ready", got "${narrow.nowTitle}"`);
  check(/land grant/.test(narrow.nowDetail) && /Food/.test(narrow.nowDetail), `B-AC-14 (RULE-8): Now names the land grant as next and the short Food, got "${narrow.nowDetail}"`);

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
  const expected = [...TODAYS_DESKS, ...held];
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
      nowFirst: !!body && body.firstElementChild === guide?.querySelector('[data-testid=now]'),
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
