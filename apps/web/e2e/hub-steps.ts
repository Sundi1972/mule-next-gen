/**
 * B-AC-14 (C17, RULE-8): planning is the hub for the month. Run by smoke.ts in month-2 planning, right after
 * store-steps' makeHungry seated the human at 2 Food against a need of 5 (nine farms, which also burn Energy).
 * Quick by design: planning is about 4.5 s at the smoke's phase scale, and listedSale has used part of it.
 * B-AC-19 (AM-16), the host's Continue, is run by auction-steps.ts in its month-2 planning; its six-seat TV case
 * (sixSeatsOnTheTv) by shell.ts, in a room of its own; so is E-11's Governor's sub-tab beside the table chat
 * (governorsDeskFits), a room per phone size.
 */
import { join } from 'node:path';
import { GOODS, monthNeeds, type GameState, type Good, type TaxPromise } from '@mule/engine';
import type { Browser, Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, held as holding, PHONE, PHONE_SMALL, TV } from './harness';
import { ELECTION_WAIT_MS } from './politics-steps';
import { LAPTOP, railFits } from './shell-steps';
import { fitSettled, theTvScaleHolds } from './tv-fit-steps';

/** The human sits in seat 1. */
const SEAT = 's1';
/** makeHungry's Food: the seat holds 2. */
const HUNGRY_FOOD = 2;
/** RULE-8: these first, in this order; then the rest by need. */
const FIRST: Good[] = ['food', 'water', 'energy'];
/** SB-2: the planning tabs, in their order; Governor / Council only while the table plays politics. */
const TABS = (politics: boolean) => ['overview', ...(politics ? ['politics'] : []), 'colony', 'talk'];
/** Every office's desk, a Governor / Council sub-tab. AI seats run in month 1, so whether the smoke's seat holds an office is read from the game. */
const OFFICE_DESKS = ['governor', 'sheriff'] as const;
/** Governor / Council's sub-tabs, in their order: Laws, Budget and Elections for all, the Sheriff's for its holder. */
const SUBS = (held: readonly string[]) => ['laws', 'budget', 'elections', ...(held.includes('sheriff') ? ['sheriff'] : [])];
const TODAYS_TOOLS = ['look', 'plots', 'drone', 'list'];
/** B-AC-12: the stage's content fills at least this share of the stage's height. */
const FILL = 0.8;

type Shown = {
  phase: string | null;
  onStage: { agenda: boolean; map: boolean; marketStrip: boolean };
  tabs: string[];
  tools: string[];
  /** Where the tool row stands against the map. */
  toolsAt: 'above' | 'elsewhere';
  nowFirst: boolean;
  nowTitle: string;
  /** Review-aid labels the mock carries and the game must not. */
  reviewLabels: string[];
  fill: number;
};

/**
 * B-AC-14 (SB-2, the tabbed hub): planning opens on Overview, "This month" and the colony map on its stage; the Colony
 * tab's needs say SHORT or OK as the engine's monthNeeds has them; a good with no need has no row; no office's sub-tab
 * is drawn without the office. The "?" sheet holds the month in full (H-1, H-2, H-6, D2). With it, B-AC-12's planning
 * part: `now` opens the rail at 844×390 and at 1440×900. Returns what it saw, to log.
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
  check(await planning.getByTestId('tab-overview').getAttribute('aria-selected') === 'true', 'B-AC-14 (D3): planning opens on Overview');
  await planning.getByTestId('tab-colony').click({ timeout });
  const verdict = (g: Good) => (have[g] >= need[g] ? 'OK' : `SHORT ${need[g] - have[g]}`);
  await planning.getByTestId('need-food').filter({ hasText: verdict('food') }).waitFor({ timeout });
  const colony = await readColony(phone);
  check(colony.thisMonthInColony, 'B-AC-14: the Colony tab holds "This month you need"');

  const held = OFFICE_DESKS.filter((o) => state.politics?.[o] === SEAT);
  const politics = state.politics !== null;
  if (politics) {
    await planning.getByTestId('tab-politics').click({ timeout });
    await planning.getByTestId('sub-tabs').waitFor({ timeout });
    const subs = await planning.locator('[data-testid=sub-tabs] [role=tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('sub-'.length)));
    const foreign = subs.filter((d) => (OFFICE_DESKS as readonly string[]).includes(d) && !held.includes(d as (typeof OFFICE_DESKS)[number]));
    check(foreign.length === 0, `B-AC-14 (negative): a player sees no sub-tab of an office they do not hold, got ${foreign.join(', ')}`);
    check(JSON.stringify(subs) === JSON.stringify(SUBS(held)), `B-AC-14: Governor / Council's sub-tabs are exactly ${SUBS(held).join(', ')}, got ${subs.join(', ')}`);
  }
  await planning.getByTestId('tab-overview').click({ timeout });
  await planning.getByTestId('hub-map').waitFor({ timeout });
  const narrow = await read(phone);
  checkHub(narrow, `${PHONE.viewport.width}×${PHONE.viewport.height}`, TABS(politics));
  const expected = GOODS.filter((g) => need[g] > 0);
  const rows = colony.needs.map((n) => n.good);
  check(JSON.stringify([...rows].sort()) === JSON.stringify([...expected].sort()), `B-AC-14: a row for each good she needs this month (${expected.join(', ')}), got ${rows.join(', ')}`);
  const firsts = rows.filter((g) => FIRST.includes(g as Good));
  check(JSON.stringify(rows.slice(0, firsts.length)) === JSON.stringify(FIRST.filter((g) => need[g] > 0)), `B-AC-14 (RULE-8): Food, Water and Energy lead the needs, got ${rows.join(', ')}`);
  for (const n of colony.needs) {
    const g = n.good as Good;
    check(n.text.includes(verdict(g)), `B-AC-14: need-${g} says ${verdict(g)} (have ${have[g]}, need ${need[g]}), got "${n.text}"`);
    check(n.text.includes(`HAVE ${have[g]} · NEED ${need[g]}`), `B-AC-14: need-${g} shows have ${have[g]} against need ${need[g]}, got "${n.text}"`);
  }
  check(need.food - have.food === 3, `B-AC-14: the seeded shortfall is Food 2 of 5, got ${have.food} of ${need.food}`);
  check(need.smithore === 0 && !rows.includes('smithore'), `B-AC-14 (negative): with no mine or factory she needs no Smithore and has no row for it, got rows ${rows.join(', ')}`);
  // The UX audit's hub (H-1…H-7), on the phone held sideways: the "?" sheet's roadmap, needs strip and ship's line (D2);
  // the rank in the header. Now's detail is the sheet's too.
  await planning.getByTestId('help-open').click({ timeout });
  await planning.getByTestId('help-sheet').waitFor({ timeout });
  const audit = await readAudit(phone);
  const nowDetail = (await planning.getByTestId('help-now').innerText()).trim();
  await planning.getByTestId('help-close').click({ timeout });
  await planning.getByTestId('help-sheet').waitFor({ state: 'detached', timeout });
  const lot = state.listings.length > 0;
  const steps = ['plan', 'grant', ...(lot ? ['land'] : []), 'develop', 'produce', 'auction'];
  check(JSON.stringify(audit.steps) === JSON.stringify(steps), `H-1: the roadmap's steps are ${steps.join(', ')} (${state.listings.length} lots listed), got ${audit.steps.join(', ')}`);
  check(audit.lit === 'plan', `H-1: the roadmap lights Plan, got ${audit.lit}`);
  check(/^Now: .*Next: /.test(audit.now), `H-1: the roadmap says what to do now and what comes next, got "${audit.now}"`);
  check(audit.offices === (state.politics !== null), `H-1: the offices line sits under the roadmap while the table plays politics (${state.politics !== null}), got ${audit.offices}`);
  check(audit.food.includes(`${have.food} of ${need.food}`) && audit.food.includes(`short ${need.food - have.food}`) && audit.foodRed, `H-2: the needs strip says Food ${have.food} of ${need.food}, short ${need.food - have.food}, in red, got "${audit.food}" (red ${audit.foodRed})`);
  const worths = (room.viewFor(null).game?.players ?? []).map((p) => ({ id: p.id, worth: p.worth }));
  const mine = worths.find((p) => p.id === SEAT)?.worth ?? NaN;
  const place = 1 + worths.filter((p) => p.worth > mine).length;
  const label = `${place}${['th', 'st', 'nd', 'rd'][place] ?? 'th'} of ${worths.length}`;
  check(audit.rank === label, `H-4: under the money the header says "${label}" by Worth (${worths.map((p) => `${p.id} ${p.worth}`).join(', ')}), got "${audit.rank}"`);
  check(audit.ship === `Export ship in month ${state.ship.arrives}: it buys the colony’s leftovers.`, `H-6: the "?" sheet names the ship in plain words, got "${audit.ship}"`);
  check(narrow.toolsAt === 'above', `D4: at ${PHONE.viewport.width} px the map's tools are one row above the map, got ${narrow.toolsAt}`);
  // H-4: a tap on the rank opens the standings, every player's Worth and your own lines; Close shuts them.
  await planning.getByTestId('standing').click({ timeout });
  const sheet = planning.getByTestId('standings-sheet');
  await sheet.waitFor({ timeout });
  const listed = await sheet.locator('[data-testid^="standing-s"]').count();
  check(listed === worths.length, `H-4: the standings list every player, ${worths.length}, got ${listed}`);
  check((await sheet.getByTestId('standings-mine').count()) === 1, 'H-4: the standings show your own Worth line by line');
  await sheet.getByTestId('standings-close').click({ timeout });
  await sheet.waitFor({ state: 'detached', timeout });

  // A Governor elected this month is first told to set the tax (C66, E-7); everyone else plans (RULE-8).
  const newGovernor = state.politics?.governor === SEAT && state.politics.election?.stage === 'over';
  if (newGovernor) {
    check(narrow.nowTitle === 'Set the sales tax', `C66 (E-7): the new Governor's Now says "Set the sales tax", got "${narrow.nowTitle}"`);
    check(/Then plan your month\. You are the new Governor/.test(nowDetail), `C66 (E-7): the new Governor's Now says to plan the month next, got "${nowDetail}"`);
  } else {
    check(narrow.nowTitle === 'Plan your month', `B-AC-14 (RULE-8): Now says "Plan your month", got "${narrow.nowTitle}"`);
    check(/^Then press Ready\./m.test(nowDetail), `B-AC-14 (RULE-8): Now's detail starts "Then press Ready.", got "${nowDetail}"`);
    check(/land grant/.test(nowDetail) && /Food/.test(nowDetail), `B-AC-14 (RULE-8): Now names the land grant as next and the short Food, got "${nowDetail}"`);
  }

  let wide: Shown;
  try {
    await phone.setViewportSize(LAPTOP);
    wide = await read(phone);
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }
  checkHub(wide, `${LAPTOP.width}×${LAPTOP.height}`, TABS(politics));
  check(wide.onStage.marketStrip, `B-AC-14: at ${LAPTOP.width} px the store's prices sit under the map, on the stage`);
  check(wide.toolsAt === 'above', `D4: at ${LAPTOP.width} px the map's tools sit above the map, got ${wide.toolsAt}`);
  const plots = await theMapIgnoresTheNeeds(phone, server, code);
  return `${plots}; roadmap ${audit.steps.join(' > ')}; strip "${audit.food}"; ${audit.rank}; tools above the map at 844 and 1440; tabs ${narrow.tabs.join(', ')} (offices held: ${held.join(', ') || 'none'}); needs ${colony.needs.map((n) => `${n.good} ${verdict(n.good as Good)}`).join(', ')}; now first at 844 and 1440; stage filled ${(narrow.fill * 100).toFixed(0)}% / ${(wide.fill * 100).toFixed(0)}%`;
}

function checkHub(f: Shown, at: string, tabs: readonly string[]): void {
  check(f.phase === 'planning', `B-AC-14: planning still shows at ${at}, got ${f.phase}`);
  check(f.onStage.agenda, `B-AC-14: at ${at} "This month" (agenda) is on Overview's stage`);
  check(f.onStage.map, `B-AC-14: at ${at} the colony map (hub-map) is on Overview's stage`);
  check(JSON.stringify(f.tabs) === JSON.stringify(tabs), `B-AC-14 (D3): at ${at} the tabs drawn are exactly ${tabs.join(', ')}, got ${f.tabs.join(', ')}`);
  check(JSON.stringify(f.tools) === JSON.stringify(TODAYS_TOOLS), `B-AC-14: at ${at} the map tools drawn are exactly ${TODAYS_TOOLS.join(', ')}, got ${f.tools.join(', ')}`);
  check(f.reviewLabels.length === 0, `C17: unbuilt slots are not drawn, and no SOON or slice label shows; got ${f.reviewLabels.join(' | ')}`);
  check(f.nowFirst, `B-AC-12: at ${at} planning's rail opens with Now`);
  check(f.fill >= FILL, `B-AC-12: at ${at} the hub fills ${(f.fill * 100).toFixed(0)}% of the stage's height, under ${FILL * 100}%`);
}

/** The Colony tab's This month: its need rows (the build sites carry need-<project>-<good> ids of their own). */
async function readColony(phone: Page): Promise<{ needs: { good: string; text: string }[]; thisMonthInColony: boolean }> {
  return phone.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const body = document.querySelector('[data-phase=planning] [data-testid=tab-body-colony]');
    return {
      needs: [...(body?.querySelectorAll('[data-testid=this-month] [data-testid^="need-"]') ?? [])].map((n) => ({ good: n.getAttribute('data-testid')!.slice('need-'.length), text: (n as HTMLElement).innerText })),
      thisMonthInColony: !!body?.querySelector('[data-testid=this-month]'),
    };
  });
}

/** One read of the planning screen, after a paint, in one pass. */
async function read(phone: Page): Promise<Shown> {
  return phone.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const screen = document.querySelector('[data-phase]');
    const stage = screen?.querySelector('[data-testid=stage]');
    const guide = screen?.querySelector('[data-testid=guide]');
    const tabs = screen?.querySelector('[data-testid=tabs]');
    const content = stage?.firstElementChild;
    const toolRow = screen?.querySelector('[data-testid=map-tools]')?.getBoundingClientRect();
    const mapBox = screen?.querySelector('[data-testid=hub-map]')?.getBoundingClientRect();
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
      tabs: [...(tabs?.querySelectorAll('[role=tab]') ?? [])].map((d) => d.getAttribute('data-testid')!.slice('tab-'.length)),
      tools: [...(screen?.querySelectorAll('[data-testid=map-tools] [data-testid^="tool-"]') ?? [])].map((t) => t.getAttribute('data-testid')!.slice('tool-'.length)),
      toolsAt: !toolRow || !mapBox ? 'elsewhere' : toolRow.bottom <= mapBox.top + 0.5 ? 'above' : 'elsewhere',
      // Now first: in the rail's head, the header (the phase line, then the Now line), above the rail's body.
      nowFirst: !!guide?.querySelector('header [data-testid=now]'),
      nowTitle: guide?.querySelector('[data-testid=now-title]')?.textContent ?? '',
      reviewLabels: (shell?.innerText ?? '').split('\n').filter((l) => /\bSOON\b|\bSLICE\b|\bWS7\b/.test(l)),
      fill: content && stageBox ? content.getBoundingClientRect().height / (stageBox.height - pad) : 0,
    };
  });
}

/** The UX audit's parts of the hub, as the player sees them. */
type Audit = {
  steps: string[];
  lit: string | null;
  now: string;
  /** WS7's offices line, inside the roadmap. */
  offices: boolean;
  food: string;
  foodRed: boolean;
  rank: string;
  ship: string;
};

/** One read of the audit's parts, the "?" sheet open, after a paint. Kept a string: tsx would wrap named functions in a helper the page lacks. */
const READ_AUDIT = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const p = document.querySelector('[data-phase=planning]');
  const s = p?.querySelector('[data-testid=help-sheet]');
  const text = (sel) => s?.querySelector(sel)?.innerText?.trim() ?? '';
  const roadmap = s?.querySelector('[data-testid=roadmap]');
  const food = s?.querySelector('[data-testid=needs-strip] [data-testid=strip-food]');
  return {
    steps: [...(roadmap?.querySelectorAll('[data-testid^="step-"]') ?? [])].map((li) => li.dataset.testid.slice('step-'.length)),
    lit: roadmap?.querySelector('[aria-current=step]')?.dataset.testid?.slice('step-'.length) ?? null,
    now: text('[data-testid=roadmap-now]'),
    offices: !!roadmap?.querySelector('[data-testid=roadmap-offices]'),
    food: food?.innerText?.replace(/\\s+/g, ' ').trim() ?? '',
    foodRed: !!food?.classList.contains('text-alert'),
    rank: p?.querySelector('[data-testid=standing-rank]')?.innerText?.trim() ?? '',
    ship: text('[data-testid=help-ship]'),
  };
})()`;

const readAudit = (phone: Page) => phone.evaluate(READ_AUDIT) as Promise<Audit>;

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
  // The server keeps each line with the seats it names (F-11); the fixture's lines mark none.
  (game as { news: { text: string; who: string[] }[] }).news = [
    { text: 'Brix is Governor (appointed) · the colony fund pays the Governor.', who: [] },
    { text: 'Brix listed plot 3·4 for the land auction at 160 cr, and the colony lists plot 9·2.', who: [] },
    { text: 'Welcome to the colony. Talk tactics, then grab land.', who: [] },
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
    const named = (await waiting.getByTestId(`waiting-${leftId}`).getByTestId('waiting-name').innerText()).trim();
    check(named === (p === left ? 'you' : left.name), `B-AC-19: ${p.name}'s phone names ${p === left ? 'her as "you"' : left.name} as still planning, got "${named}"`);
    const readyNamed = (await waiting.getByTestId(`waiting-${hostId}`).count()) + (await waiting.getByTestId(`waiting-${readyId}`).count());
    check(readyNamed === 0, `B-AC-19: ${p.name}'s phone waits for nobody who is Ready, got "${await waiting.innerText()}"`);
    if (p === left) continue;
    // Once Ready, the Now line is its title alone (D1); its "?" opens the month in full, Now's detail with it (D2).
    const line = planning(p).getByTestId('now-title').filter({ hasText: "You're ready" });
    await line.waitFor({ timeout });
    const title = (await line.innerText()).trim();
    check(title === "You're ready", `B-AC-19: once Ready, ${p.name}'s Now line reads exactly "You're ready", no names in it, got "${title}"`);
    await planning(p).getByTestId('help-open').click({ timeout });
    const now = (await planning(p).getByTestId('help-now').innerText()).trim();
    check(now.includes(`Waiting for ${left.name}.`), `B-AC-19: once Ready, ${p.name}'s Now, in the "?" sheet, names ${left.name} as who the table waits for, got "${now}"`);
    // Shut again, so the step's shots show the hub as the table sees it.
    await planning(p).getByTestId('help-close').click({ timeout });
    await planning(p).getByTestId('help-sheet').waitFor({ state: 'detached', timeout });
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
 * the canvas, the market tiles whole, and the newest news line, the election result, shows whole beside them. With
 * `claude`, the AIs are Claude seats the game reports in that status (C6); `ais` sets how many, five by default; `busy`
 * false leaves the month's news as the game has it, so the body can stand at full size.
 */
export async function sixSeatsOnTheTv(
  { browser, base, server, claude, ais: count = 5, busy = true }: { browser: Browser; base: string; server: MuleServer; claude?: 'waiting' | 'connected' | 'thinking' | 'ready' | 'offline'; ais?: number; busy?: boolean },
  timeout = 5_000,
): Promise<string> {
  const phone = await (await browser.newContext(PHONE)).newPage();
  const tv = await (await browser.newContext(TV)).newPage();
  try {
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill('Mia');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor({ timeout });
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    for (let i = 1; i <= count; i++) {
      await phone.getByRole('button', { name: 'Add AI player' }).click();
      await phone.locator('[data-testid=seats] li').nth(i).waitFor({ timeout });
    }
    const ais = server.registry.get(code)!.viewFor(null).seats.filter((s) => s.isAi).map((s) => s.id);
    if (claude)
      for (const id of ais) {
        await phone.getByTestId(`seat-${id}-open`).click({ timeout });
        await phone.getByTestId('sheet-kind-claude').click({ timeout });
        await phone.getByTestId('sheet-setup-code-text').waitFor({ timeout });
        await phone.getByTestId('sheet-done').click({ timeout });
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
    if (claude) {
      const room = server.registry.get(code)!;
      Object.assign((room as unknown as { game: object }).game, { claudeStatus: () => claude });
      room.broadcast();
      // A Claude seat with nothing to report folds into the AI row from five seats; the others keep their rows.
      if (claude === 'ready' || claude === 'connected') await board.locator(`[data-testid=tv-ready-ais][data-count="${count}"]`).waitFor({ timeout });
      else await board.getByTestId(`tv-ready-list`).getByText(claude === 'waiting' ? 'WAITING FOR CLAUDE' : `CLAUDE · ${claude.toUpperCase()}`).first().waitFor({ timeout });
    }
    const newest = board.getByTestId('tv-news').locator('li').first();
    if (busy) {
      busyNews(server.registry.get(code));
      // The election's own line was already newest: wait for a line only busyNews adds, so the busy month is on the TV.
      await board.getByTestId('tv-news').locator('li').filter({ hasText: 'listed plot 3·4' }).waitFor({ state: 'attached', timeout });
    }
    await newest.filter({ hasText: 'is Governor' }).waitFor({ state: 'attached', timeout });

    // The column is checked twice: as it stands, then with the TV's chat ticker showing a line above it (C20).
    const fits = async (when: string) => {
      // The body measures the news it renders up to REFIT_MS later: read before that, the new news sits at the old scale
      // and the ready list covers the newest line's foot (3 runs in 4). Read once the scale has settled.
      await fitSettled(tv);
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
      // A Claude seat's row carries its chip, and maybe its built-in note: its name still shows whole.
      for (const name of await board.getByTestId('tv-ready-name').all()) {
        const { shown, needs, text } = await name.evaluate((el) => ({ shown: el.clientWidth, needs: el.scrollWidth, text: el.textContent }));
        check(shown > 0 && needs <= shown + 1, `TV-FIT (six seats${when}): the ready list shows "${text}" whole, got ${shown} of ${needs} px`);
      }
      // No row runs past the list's right edge: a folded Claude row's words wrap rather than push out of the column.
      const past = await board.getByTestId('tv-ready-list').evaluate((list) => {
        const edge = list.getBoundingClientRect().right;
        return [...list.querySelectorAll(':scope > li, :scope > li *')]
          // A line cut short with an ellipsis (the folded names, the AI row) gives way by design, and so does what it cuts.
          .filter((el) => {
            for (let a: Element | null = el; a && a !== list; a = a.parentElement) if (getComputedStyle(a).textOverflow === 'ellipsis') return false;
            return el.getBoundingClientRect().right > edge + 1 || el.scrollWidth > el.clientWidth + 1;
          })
          .map((el) => `${el.getAttribute('data-testid') ?? el.tagName.toLowerCase()} "${(el.textContent ?? '').slice(0, 40)}" to x ${el.getBoundingClientRect().right.toFixed(0)} of ${edge.toFixed(0)}`);
      });
      check(past.length === 0, `TV-FIT (${count + 1} seats${when}): the ready list stays inside its column, got ${past.slice(0, 3).join('; ')}`);
      const widths = await board.locator('[data-testid^=tv-ready-claude-]:not([data-testid=tv-ready-claude-names])').evaluateAll((rows) =>
        rows.map((li) => `${li.getAttribute('data-testid')} ${li.clientWidth} px, its words ${(li.lastElementChild as HTMLElement).offsetWidth} px`),
      );
      // A folded Claude row names its seats when they fit, cut short when not.
      const folded = [];
      for (const names of await board.locator('[data-testid=tv-ready-claude-names]').all()) folded.push(await names.evaluate((el) => `"${el.textContent}" ${el.clientWidth} of ${el.scrollWidth} px`));
      // TV-FIT's floor holds at the fullest table (PM ruling 6 Nov).
      const scale = await theTvScaleHolds(tv, `six-seat planning${when}`);
      return `the ready list ends at ${list.toFixed(0)} of ${canvas.toFixed(0)} px, the body at scale ${scale}${folded.length ? `, folded Claude names ${folded.join('; ')}` : ''}${widths.length ? ` (${widths.join('; ')})` : ''}`;
    };
    const quiet = await fits('');
    const room = server.registry.get(code) as unknown as { seats: { id: string }[]; chat: (from: string, text: string) => void };
    room.chat(room.seats[0]!.id, 'Six of us at one table, then.');
    await tv.getByText('Six of us at one table, then.').first().waitFor({ timeout });
    const talking = await fits(', with a chat line');
    const rows = await board.getByTestId('tv-ready-list').locator(':scope > li').count();
    return `${count + 1} seats${claude ? `, ${count} Claude seats ${claude}` : ''}, ${rows} rows: ${quiet}, ${talking} with a chat line showing; the market whole, the election result whole in the news`;
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
/** E-11: at 844 × 390 the tax row and its verdict end at least this far above the Governor sub-tab's visible end (the PM's measured floor). */
const GOV_MARGIN_844 = 6;
/** Every tab and sub-tab, on the smaller phone: at least this wide and tall. */
const TAB_MIN = 32;

/** One read of the Governor's sub-tab and the rail: where the row and verdict end against the body's visible end, and where the table chat is. */
type GovFit = {
  bodyBottom: number;
  rowBottom: number;
  verdictBottom: number;
  verdict: string;
  bodyScroll: number;
  /** The seat row in the rail's body (C20 on a phone), not its header. */
  seatRow: boolean;
  ticker: number;
  names: boolean;
  nowLine: boolean;
  desk: string | null;
  tabs: { id: string; w: number; h: number; clipped: boolean }[];
};

/** Reads the screen after a paint, in one pass. Kept a string: tsx would wrap named functions in a helper the page lacks. */
const READ_GOV = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const p = document.querySelector('[data-phase=planning]');
  const g = p?.querySelector('[data-testid=guide]');
  const body = p?.querySelector('[data-testid=sub-body-laws]');
  const box = (sel) => p?.querySelector(sel)?.getBoundingClientRect() ?? null;
  const row = box('[data-testid=governor-tax-row]');
  const verdict = box('[data-testid=governor-verdict]');
  const tabs = [...(p?.querySelectorAll('[data-testid=tabs] [role=tab], [data-testid=sub-tabs] [role=tab]') ?? [])].map((t) => {
    const r = t.getBoundingClientRect();
    // The label is the tab's own words: whole when nothing of them is cut short, and when their box sits inside the
    // tab's (a truncating span is only as wide as its text, so the box check is the one that fails; a badge may overhang).
    const label = [...t.querySelectorAll('span')].find((el) => el.textContent.trim() && !el.querySelector('span'));
    const l = label ? label.getBoundingClientRect() : r;
    const cut = !!label && label.scrollWidth > label.clientWidth + 0.5;
    return { id: t.dataset.testid, w: r.width, h: r.height, clipped: cut || l.left < r.left - 0.5 || l.right > r.right + 0.5 };
  });
  return {
    bodyBottom: body?.getBoundingClientRect().bottom ?? NaN,
    rowBottom: row?.bottom ?? NaN,
    verdictBottom: verdict?.bottom ?? NaN,
    verdict: p?.querySelector('[data-testid=governor-verdict] [aria-hidden]')?.textContent ?? '',
    bodyScroll: body?.scrollTop ?? -1,
    seatRow: !!g?.querySelector('header + div [data-testid=seat-row]') && !g?.querySelector('header [data-testid=seat-row]'),
    ticker: g?.querySelectorAll('[data-testid=chat-ticker] li').length ?? 0,
    // Shown, not just in the markup: a name kept for a screen reader only would not count.
    names: (() => { const w = g?.querySelector('[data-testid=actions] [data-testid=waiting-for]'); return !!w && !w.closest('.sr-only') && w.getBoundingClientRect().height > 1; })(),
    nowLine: !!g?.querySelector('section[data-testid=now] [data-testid=now-title]'),
    desk: p?.querySelector('[data-testid=sub-tabs] [aria-selected=true]')?.dataset.testid ?? null,
    tabs,
  };
})()`;

/**
 * E-11 (C66, SB-2: the Governor's desk on its sub-tab, the table chat in the rail): Lena, the sitting Governor, plans at
 * `size` with the chat's seat row and a two-line ticker, and Ossa still planning. Her Now line is the door to the
 * Governor's sub-tab (E-9, D8); its tax row and verdict end inside the sub-tab's visible body, without it scrolling, as
 * the desk opens over her promise, after −, and after Set (at 844 × 390 by at least GOV_MARGIN_844). The rail keeps
 * the Now line, the footer names who is still planning, the ticker keeps both lines, and the seat row sits in the rail's
 * body (C20). Every tab and sub-tab is at least TAB_MIN square, its label whole. Clicks are DOM clicks, so the page
 * never scrolls to reach a button: what is measured is what shows untouched. With MULE_SHOTS set to a directory, it
 * saves the screen as the desk opens and after Set there. Returns the numbers, to log.
 */
async function governorDeskFits(lena: Page, size: { width: number; height: number }, timeout = 3_000): Promise<string> {
  const at = `${size.width}×${size.height}`;
  await lena.setViewportSize(size);
  const planning = lena.locator('[data-phase=planning]');
  // The Governor's sub-tab asks first: from Overview the Now line is the door to it (D8); nothing opens it by itself.
  await planning.getByTestId('now-go').evaluate((el: HTMLElement) => el.click());
  await planning.getByTestId('governor-tax-row').waitFor({ timeout });
  const read = () => lena.evaluate(READ_GOV) as Promise<GovFit>;
  const click = (id: string) => planning.getByTestId(id).evaluate((el: HTMLElement) => el.click());
  const floor = size.width === GOV_SIZES[0].width ? GOV_MARGIN_844 : 0;
  const seen: string[] = [];
  const fits = (f: GovFit, state: string, verdict: string) => {
    check(f.desk === 'sub-laws', `E-11 at ${at} (${state}): the Governor's sub-tab is open, got ${f.desk}`);
    check(f.seatRow, `E-11 at ${at} (${state}): the chat's seat row is in the rail's body (C20)`);
    check(f.nowLine, `E-11 at ${at} (${state}): the rail keeps the Now line (D1)`);
    check(f.verdict === verdict, `E-11 at ${at} (${state}): the verdict reads "${verdict}", got "${f.verdict}"`);
    check(f.bodyScroll === 0, `E-11 at ${at} (${state}): the sub-tab did not scroll, got scrollTop ${f.bodyScroll}`);
    const row = f.bodyBottom - f.rowBottom;
    const chip = f.bodyBottom - f.verdictBottom;
    seen.push(`${state}: row ${f.rowBottom.toFixed(1)}, verdict ${f.verdictBottom.toFixed(1)}, body ends ${f.bodyBottom.toFixed(1)} (${row.toFixed(1)} / ${chip.toFixed(1)} px clear)`);
    check(row >= floor && chip >= floor, `E-11 at ${at} (${state}): the tax row and its verdict end at least ${floor} px inside the sub-tab's visible end, got row ${f.rowBottom.toFixed(1)} and verdict ${f.verdictBottom.toFixed(1)} against ${f.bodyBottom.toFixed(1)}`);
    check(f.names, `E-11 at ${at} (${state}): with the Governor's sub-tab open the footer still names who is still planning (no fold)`);
    check(f.ticker === 2, `E-11 at ${at} (${state}): with the Governor's sub-tab open the ticker keeps its two lines (no fold), got ${f.ticker}`);
  };

  const shots = process.env.MULE_SHOTS;
  const shot = (name: string) => (shots ? lena.screenshot({ path: join(shots, `e-11-${size.width}-${name}.png`) }).then(() => {}) : Promise.resolve());
  const opened = await read();
  await shot('opens');
  if (size.width === GOV_SIZES[1].width) {
    const tabs = opened.tabs.map((t) => `${t.id} ${t.w.toFixed(1)}×${t.h.toFixed(1)}${t.clipped ? ' clipped' : ''}`).join(', ');
    const small = opened.tabs.filter((t) => t.w < TAB_MIN - 0.01 || t.h < TAB_MIN - 0.01 || t.clipped);
    check(opened.tabs.length >= 6 && small.length === 0, `E-11 at ${at}: every tab and sub-tab is at least ${TAB_MIN}×${TAB_MIN} with its label whole, got ${tabs}`);
    seen.push(`tabs ${tabs}`);
    // Test fixture: a fourth sub-tab beside Laws, Budget and Elections, as the Sheriff's will be for its holder. No game
    // draws it here, so Elections, the longest label, is drawn twice for one read, then taken away.
    await planning.getByTestId('sub-elections').evaluate((t) => t.after(Object.assign(t.cloneNode(true), { id: 'extra-sub' })));
    const more = (await read()).tabs.filter((t) => t.id.startsWith('sub-'));
    await lena.evaluate(() => document.getElementById('extra-sub')?.remove());
    const moreTabs = more.map((t) => `${t.w.toFixed(1)}×${t.h.toFixed(1)}${t.clipped ? ' clipped' : ''}`).join(', ');
    check(more.length === opened.tabs.filter((t) => t.id.startsWith('sub-')).length + 1 && more.every((t) => t.w >= TAB_MIN - 0.01 && t.h >= TAB_MIN - 0.01 && !t.clipped), `E-11 at ${at}: one sub-tab more, each keeps at least ${TAB_MIN}×${TAB_MIN} with the label whole, got ${moreTabs}`);
    seen.push(`one more sub-tab ${moreTabs}`);
  }
  fits(opened, 'as it opens', 'breaks it');
  // C20 in the rail beside it: its key element (Now) above the footer, the seat row under it in order, each seat tall enough.
  seen.push(`railFits ${await railFits(lena, { key: 'now', sizes: [size] })}`);
  await click('tax-down');
  await planning.getByTestId('gov-within').waitFor({ timeout });
  fits(await read(), 'after −', 'within');
  await click('tax-confirm');
  await planning.getByTestId('gov-done').waitFor({ timeout });
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
        await lena.locator('[data-phase=planning]').getByTestId('tab-politics').filter({ hasText: 'Governor' }).waitFor({ timeout });
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

/**
 * B-AC-14 (PM rulings on #723 and #751, carried to SB-2's Overview): Overview's map plot is the same size whatever the
 * needs say, at 844×390 and at 667×375: everything OK on small figures (no Short row in This month), Water short, all
 * three short (the longest Short row), two- and three-digit holdings, and short goods beside a three-digit one. The
 * needs strip is the "?" sheet's now (D2): there, at 844 it is one line in every case, and at both sizes no good is cut
 * off at its edge. Prints what it measured, so CI's log, in CI's fonts, is the evidence. Seeded on the server with the
 * clock held, and undone.
 */
export async function theMapIgnoresTheNeeds(phone: Page, server: MuleServer, code: string, timeout = 2_000): Promise<string> {
  const room = server.registry.get(code) as unknown as { game: { state: GameState }; broadcast(): void } | undefined;
  check(room, `a room ${code} on the server`);
  return holding(server, code, async () => {
    const state = room.game.state;
    const me = state.players.find((p) => p.id === SEAT);
    check(me, `seat ${SEAT} in the game`);
    const need = monthNeeds(state, SEAT);
    check(need.food > 0 && need.water > 0 && need.energy > 0, `B-AC-14: the seat needs Food, Water and Energy this month, got ${need.food}, ${need.water} and ${need.energy}`);
    const before = { food: me.stock.food, water: me.stock.water, energy: me.stock.energy };
    const planning = phone.locator('[data-phase=planning]');
    type Stocks = { food: number; water: number; energy: number };
    const each = (n: number): Stocks => ({ food: n, water: n, energy: n });
    const cases: [string, Stocks][] = [
      ['all OK', { food: need.food, water: need.water, energy: need.energy }],
      ['Water short', { food: need.food, water: 0, energy: need.energy }],
      ['all short', each(0)],
      ['20 of each', each(20)],
      ['120 of each', each(120)],
      ['Food and Energy short, 120 Water', { food: 0, water: 120, energy: 0 }],
    ];
    type Read = { plot: number; strip: number; rows: number; label: number; cut: string[] };
    /** The plot's side and the strip's shape with the seat's stock at `stock`, once the strip shows it. */
    const readWith = async (stock: Stocks): Promise<Read> => {
      Object.assign(me.stock, stock);
      room.broadcast();
      // The strip in the "?" sheet first: it shows the new stock's figures, so once it does, the stock has drawn (20 of
      // each and 120 of each leave This month alike).
      await planning.getByTestId('help-open').click({ timeout });
      for (const g of ['food', 'water', 'energy'] as const) {
        const shows = stock[g] >= need[g] ? '✓' : `short ${need[g] - stock[g]}`;
        await planning.getByTestId(`strip-${g}`).filter({ hasText: `${stock[g]} of ${need[g]}` }).filter({ hasText: shows }).waitFor({ timeout });
      }
      const strip = await phone.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const strip = document.querySelector('[data-phase=planning] [data-testid=help-sheet] [data-testid=needs-strip]')!;
        const box = strip.getBoundingClientRect();
        const goods = [...strip.querySelectorAll('[data-testid^=strip-]')];
        const label = strip.firstElementChild as HTMLElement;
        const tops = new Set([label, ...goods].map((g) => Math.round(g.getBoundingClientRect().top)));
        return {
          strip: box.height,
          rows: tops.size,
          label: label.getBoundingClientRect().width,
          // A good whose box reaches past the strip's is cut off where the strip clips it.
          cut: goods.filter((g) => g.getBoundingClientRect().right > box.right + 0.5 || g.getBoundingClientRect().bottom > box.bottom + 0.5).map((g) => g.getAttribute('data-testid')!),
        };
      });
      await planning.getByTestId('help-close').click({ timeout });
      await planning.getByTestId('help-sheet').waitFor({ state: 'detached', timeout });
      // Then Overview: This month's Short row, or none, as the stock says, and the plot as it stands.
      const short = (['food', 'water', 'energy'] as const).filter((g) => stock[g] < need[g]);
      const row = planning.getByTestId('agenda-needs');
      if (short.length > 0) await row.filter({ hasText: `Short ${need[short[0]!] - stock[short[0]!]}` }).waitFor({ timeout });
      else await row.waitFor({ state: 'detached', timeout });
      const plot = await phone.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const p = document.querySelector('[data-phase=planning] [data-testid=hub-map] [data-testid^=map-plot-]')!.getBoundingClientRect();
        return Math.min(p.width, p.height);
      });
      return { plot, ...strip };
    };
    const lines: string[] = [];
    try {
      for (const size of [PHONE.viewport, PHONE_SMALL.viewport]) {
        await phone.setViewportSize(size);
        const at = `${size.width}×${size.height}`;
        const reads: Read[] = [];
        for (const [, stock] of cases) reads.push(await readWith(stock));
        const seen = cases.map(([name], i) => `${name}: plot ${reads[i]!.plot.toFixed(1)} px, strip ${reads[i]!.strip.toFixed(1)} px in ${reads[i]!.rows} row(s), label ${reads[i]!.label.toFixed(0)} px`).join('; ');
        console.log(`B-AC-14 at ${at}: ${seen}`);
        const plots = reads.map((r) => r.plot);
        check(Math.max(...plots) - Math.min(...plots) < 0.05, `B-AC-14: at ${at} Overview's map plot must not change with the needs: ${seen}`);
        for (const [i, r] of reads.entries()) check(r.cut.length === 0, `B-AC-14: at ${at} with ${cases[i]![0]} no good is cut off at the strip's edge, got ${r.cut.join(', ')}`);
        if (size === PHONE.viewport) for (const [i, r] of reads.entries()) check(r.rows === 1, `B-AC-14: at ${at} the needs strip is one line with ${cases[i]![0]}, got ${r.rows} rows`);
        lines.push(`${plots[0]!.toFixed(1)} px at ${at}`);
      }
    } finally {
      Object.assign(me.stock, before);
      room.broadcast();
      await phone.setViewportSize(PHONE.viewport);
    }
    return `the plot holds ${lines.join(' and ')} whatever the needs say`;
  });
}
