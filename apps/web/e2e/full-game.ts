/**
 * G-3, the whole game at the kitchen table: three phones and a TV play a two-month game against the real server, from
 * the lobby to the final scores. Each family member joins by the room code and picks a species; everyone claims land;
 * Lena buys a MULE and installs it; in month 2 Brix lists a plot and Ossa buys it at the bell; at game over every
 * phone and the TV show each seat's final score as the server has it, best first.
 * Run with `pnpm --filter @mule/web exec tsx e2e/full-game.ts`; replay a red run's map with `MULE_E2E_SEED=<seed>`.
 */
import { GAME, LOTS, WALK, type Species } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Browser, type Page } from 'playwright';
import { GRANT_PASS_MAX_MS, GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, launch, PHONE, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS, readyThroughTheElection } from './politics-steps';

/** Slow enough that a held Up can be let go a few board steps past its target; fast enough for CI. */
const SCALE = 0.25;
/** A phase's longest run at this scale, plus room for the browser and the network. */
const within = (ms: number) => ms * SCALE + 5_000;
/** The land grant's light passes every free plot once. */
const GRANT_WAIT_MS = GRANT_PASS_MAX_MS + 3_000;
/** A good's stage in the goods auction, its clock slowed the whole time by trading. */
const AUCTION_STAGE_MS = within(WALK.goodMs / WALK.tradeClockRate);
/** The month end has no clock (C20); this is how long a phone has to show its "On to month N". */
const MONTH_END_MS = 10_000;
/** How far over the minimum Ossa walks before she lets go. */
const OVER_THE_MINIMUM = 30;

type Phone = { page: Page; name: string; species: Species; id: string };

const SEED = process.env.MULE_E2E_SEED ? Number(process.env.MULE_E2E_SEED) : Math.floor(Math.random() * 2 ** 31);
check(Number.isSafeInteger(SEED), `bad MULE_E2E_SEED "${process.env.MULE_E2E_SEED}"`);
const { server, base } = await startServer({ maxMonths: 2, phaseScale: SCALE, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
/** Every screen in the game, for the evidence a failed run prints. */
const screensOpen: { name: string; page: Page }[] = [];
const started = Date.now();
let code = '';
try {
  // The lobby: Brix opens the table, the TV and the family join by its code, each picks a species, Brix starts.
  const brix = await open(browser, 'Brix');
  await brix.goto(base);
  await brix.getByPlaceholder('Heiko').fill('Brix');
  await brix.getByRole('button', { name: 'Start a new game' }).click();
  await brix.getByText("You're at the table").waitFor();
  code = (await brix.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  screensOpen.push({ name: 'the TV', page: tv });
  await tv.goto(`${base}/table?room=${code}`);
  const lena = await joinRoom(await open(browser, 'Lena'), code, 'Lena');
  const ossa = await joinRoom(await open(browser, 'Ossa'), code, 'Ossa');
  const pages = { Brix: brix, Lena: lena, Ossa: ossa };
  const picks: Record<keyof typeof pages, Species> = { Brix: 'mollox', Lena: 'glimmer', Ossa: 'quibbit' };
  for (const [name, page] of Object.entries(pages) as [keyof typeof pages, Page][]) await page.getByTestId(`species-${picks[name]}`).click({ timeout: PRESS_MS });
  const truth = serverTruth(server, code);
  const phones: Phone[] = (Object.keys(pages) as (keyof typeof pages)[]).map((name) => ({ page: pages[name], name, species: picks[name], id: truth.seatOf(name) }));
  await brix.locator('[data-testid=seats] li').nth(2).waitFor();
  await brix.getByRole('button', { name: 'Start game' }).click();
  // Each plays the species they picked, on their phone and on the TV.
  await everyone(phones, (p) => p.page.locator('[data-phase]').getByRole('img', { name: `You, ${title(p.species)}`, exact: true }).waitFor({ timeout: 5_000 }));
  for (const p of phones) check(truth.board().players.find((pl) => pl.id === p.id)?.species === p.species, `${p.name} plays the ${p.species} picked in the lobby`);
  console.log(`✓ lobby: Brix, Lena and Ossa at table ${code}, playing ${phones.map((p) => p.species).join(', ')}`);

  // Month 1: through the election and planning, the land grant, a MULE for Lena, the goods auction, the month end.
  await everyone(phones, (p) => readyThroughTheElection(p.page, within(ELECTION_WAIT_MS) + PRESS_MS));
  await everyone(phones, (p) => claimPlots(p.page));
  for (const p of phones) check(truth.plotsOf(p.id).length > 0, `month 1: ${p.name} owns a plot after the land grant`);
  console.log(`✓ month 1: everyone claimed land (${phones.map((p) => `${p.name} ${truth.plotsOf(p.id).length}`).join(', ')})`);
  await throughTheLandAuction(phones, truth, null);
  await Promise.all([buyAndInstallAMule(lena), goToThePub(brix), goToThePub(ossa)]);
  const lenaId = truth.seatOf('Lena');
  check(truth.plotsOf(lenaId).some((t) => t.outfit === 'energy'), `month 1: Lena's plot has the Energy MULE she installed, ${JSON.stringify(truth.plotsOf(lenaId).map((t) => t.outfit))}`);
  console.log(`✓ month 1: Lena bought a MULE, outfitted it for Energy and installed it on her plot`);
  await everyone(phones, (p) => pressDoneThroughTheAuction(p.page));
  await everyone(phones, (p) => p.page.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS }));

  // Month 2: Brix lists a plot; after the grant, Ossa bids it up past the minimum and wins it at the bell.
  await brix.locator('[data-phase=planning]').waitFor({ timeout: PRESS_MS * 5 });
  // The map names a plot's owner by their place in the server's players, from 1.
  const listed = await listAPlot(brix, truth.board().players.findIndex((p) => p.id === truth.seatOf('Brix')), truth);
  console.log(`✓ month 2: Brix listed ${listed.id} (plot ${listed.item.x},${listed.item.y}) at ${listed.minimum}`);
  await everyone(phones, (p) => readyThroughTheElection(p.page, within(ELECTION_WAIT_MS) + PRESS_MS));
  await everyone(phones, (p) => claimPlots(p.page));
  // Read from what the bell leaves behind, the plot's owner and the money, not from its result screen, which shows for
  // well under a second at this scale. Nothing but the land auction moves money in between: the month's events come in
  // production, and no one governs, so the tax stays the rate read here.
  const before = truth.moneys();
  const tax = truth.board().treasury.salesTax;
  const [seller, buyer] = [phones.find((p) => p.name === 'Brix')!, phones.find((p) => p.name === 'Ossa')!];
  await throughTheLandAuction(phones, truth, { listing: listed.id, buyer });
  const after = truth.moneys();
  const price = before[buyer.id]! - after[buyer.id]!;
  const proceeds = price - Math.round(price * tax);
  check(truth.board().tiles.find((t) => t.x === listed.item.x && t.y === listed.item.y)?.owner === buyer.id, `month 2: plot ${listed.item.x},${listed.item.y}, Brix's listing, is Ossa's on the server after the bell`);
  check(price >= listed.minimum, `month 2: Ossa paid at least the minimum ${listed.minimum}: ${before[buyer.id]} → ${after[buyer.id]}`);
  check(after[seller.id] === before[seller.id]! + proceeds, `month 2: Brix got ${proceeds} for ${price} after ${tax * 100}% tax: ${before[seller.id]} → ${after[seller.id]}`);
  console.log(`✓ month 2: Ossa bought Brix's plot at the bell for ${price}; Ossa −${price}, Brix +${proceeds}`);
  await everyone(phones, (p) => goToThePub(p.page));
  await everyone(phones, (p) => pressDoneThroughTheAuction(p.page));

  // Game over: every screen shows each seat's final score as the server has it, best first.
  await everyone(phones, (p) => p.page.locator('[data-phase=gameOver] [data-testid=scores]').waitFor({ timeout: MONTH_END_MS }));
  await tv.getByTestId('tv-scores').waitFor({ timeout: 5_000 });
  const scores = truth.board().scores;
  check(scores !== null && scores.length === phones.length, `the server has final scores for all three seats, got ${JSON.stringify(scores)}`);
  const best = [...scores].sort((a, b) => b.score - a.score).map((s) => s.id);
  const screens = [...phones.map((p) => ({ name: `${p.name}'s phone`, root: p.page.getByTestId('scores') })), { name: 'the TV', root: tv.getByTestId('tv-scores') }];
  for (const { name, root } of screens) {
    for (const { id, score } of scores) {
      const shown = money(await root.getByTestId(`worth-${id}`).innerText({ timeout: PRESS_MS }));
      check(shown === score, `game over: ${name} shows ${id}'s final score ${shown}, the server's is ${score}`);
    }
    const order = await root.locator('[data-testid^=league-row-]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid')!.slice('league-row-'.length)));
    check(JSON.stringify([...order].sort()) === JSON.stringify([...best].sort()), `game over: ${name} lists every seat once, got ${order.join(', ')}`);
    check(sameScoreOrder(order, best, scores), `game over: ${name} lists the seats best first, ${order.join(', ')} for ${JSON.stringify(scores)}`);
  }
  console.log(`✓ game over: the three phones and the TV show the server's final scores, best first: ${scores.map((s) => `${s.id} ${s.score}`).join(', ')}`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e full game: ok (room ${code}, seed ${SEED}, ${((Date.now() - started) / 1_000).toFixed(1)}s)`);
} catch (err) {
  console.error(`e2e full game: FAILED (room ${code}, seed ${SEED})`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  await printEvidence();
  throw err;
} finally {
  await browser.close();
  await server.close();
}

async function open(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext(PHONE)).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  screensOpen.push({ name: `${name}'s phone`, page });
  return page;
}

/** What a failed run leaves to read: the server's phase and stage, and each screen's phase and words. */
async function printEvidence(): Promise<void> {
  const room = code ? server.registry.get(code) : undefined;
  const game = room?.viewFor(null).game;
  console.error(`server: ${game ? `month ${game.month}, ${game.phase}, land auction ${game.landAuction?.stage ?? '-'} ${game.landAuction?.lot.id ?? ''}` : 'no game'}`);
  for (const { name, page } of screensOpen) {
    const phase = await page.locator('[data-phase]').first().getAttribute('data-phase', { timeout: 500 }).catch(() => '?');
    const words = await page.locator('body').innerText({ timeout: 500 }).catch(() => '');
    console.error(`--- ${name} (${phase}): ${words.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

async function joinRoom(page: Page, code: string, name: string): Promise<Page> {
  await page.goto(`${base}/?room=${code}`);
  await page.getByPlaceholder('Heiko').fill(name);
  await page.getByRole('button', { name: `Join game ${code}` }).click();
  await page.getByText("You're at the table").waitFor();
  return page;
}

async function everyone(phones: Phone[], step: (p: Phone) => Promise<unknown>): Promise<void> {
  await Promise.all(phones.map(step));
}

/** What the server holds for the room: the board everyone sees, each seat's plots and money, who sits where. */
function serverTruth(server: MuleServer, code: string) {
  const room = () => {
    const r = server.registry.get(code);
    check(r, `room ${code} is on the server`);
    return r;
  };
  const board = (): MuleView => {
    const g = room().viewFor(null).game;
    check(g, `room ${code} has a game running`);
    return g;
  };
  return {
    board,
    seatOf: (name: string) => {
      const id = room().viewFor(null).seats.find((s) => s.name === name)?.id;
      check(id, `${name} has a seat`);
      return id;
    },
    plotsOf: (id: string) => board().tiles.filter((t) => t.owner === id),
    moneys: () => Object.fromEntries(board().players.map((p) => [p.id, p.money])),
  };
}
type Truth = ReturnType<typeof serverTruth>;

/**
 * Presses CLAIM until this phone has no claims left or the grant is over (the last claim at the table ends it). Two
 * phones can press on the same lit plot; the loser's press is refused and it tries the next one. Unlike harness.ts's
 * claimAPlot, which claims one, this takes every claim the grant gives, so three phones race for the same light.
 */
async function claimPlots(page: Page): Promise<void> {
  const claim = page.locator('[data-phase=landGrant]').getByRole('button', { name: /CLAIMS LEFT/ });
  const over = page.locator('[data-phase]:not([data-phase=planning]):not([data-phase=landGrant])');
  for (let tries = 0; ; tries++) {
    check(tries < 40, 'the land grant let this phone claim its plots');
    await claim.or(over).first().waitFor({ timeout: GRANT_WAIT_MS });
    if (await over.count()) return;
    try {
      const left = Number(/(\d+) OF/.exec(await claim.innerText({ timeout: PRESS_MS }))?.[1]);
      if (left === 0) return;
      await claim.click({ timeout: GRANT_TICK_MS * 2 });
      await claim.filter({ hasText: `${left - 1} OF ${GAME.claimsPerGrant}` }).waitFor({ timeout: GRANT_TICK_MS * 2 });
    } catch (err) {
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}

/**
 * Plays the land auction to its end, if one runs. Every lot but `sell.listing` is passed: every phone presses Done.
 * On `sell.listing` the buyer holds Up to OVER_THE_MINIMUM past the minimum and lets go, while the others keep pressing
 * Done, so the bid never holds up their presses. What the lot came to is read afterwards from the server's state.
 */
async function throughTheLandAuction(phones: Phone[], truth: Truth, sell: { listing: string; buyer: Phone } | null): Promise<void> {
  const deadline = Date.now() + within(LOTS.maxLotsPerMonth * (LOTS.introMs + LOTS.walkMs + LOTS.resultMs));
  let bid: Promise<void> | null = null;
  while (truth.board().phase === 'landGrant' || truth.board().phase === 'landAuction') {
    check(Date.now() < deadline, 'the land auction ends within its lots');
    const lot = truth.board().landAuction;
    if (lot?.stage === 'walk') {
      const ours = lot.lot.id === sell?.listing;
      if (ours && bid === null) {
        bid = bidUpTo(sell!.buyer.page, lot.lot.minimum + OVER_THE_MINIMUM);
        // Awaited after the loop; a handler now keeps an early failure from being reported as unhandled meanwhile.
        bid.catch(() => undefined);
      }
      await Promise.all(
        phones
          .filter((p) => !(ours && p.id === sell!.buyer.id))
          .map((p) => p.page.locator('[data-phase=landAuction] [data-testid=done]:not([disabled])').click({ timeout: 200 }).catch(() => undefined)),
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (sell) check(bid !== null, `the land auction put up ${sell.listing}`);
  await bid;
}

/** Holds Up until the phone's bid reaches `target`, lets go and presses Done; the bell may ring first, which ends the bid too. */
async function bidUpTo(page: Page, target: number): Promise<void> {
  const up = page.locator('[data-testid=hold-up]:not([disabled])');
  await up.waitFor({ timeout: within(LOTS.introMs) });
  await up.hover();
  await page.mouse.down();
  try {
    await page.waitForFunction((t) => Number(/YOU BID (\d+)/.exec(document.querySelector('[data-testid=my-bid]')?.textContent ?? '')?.[1]) >= t, target, {
      timeout: within(LOTS.walkMs),
      polling: 'raf',
    });
  } catch (err) {
    // The bell rang first: whether she won is the plot's owner and her money afterwards, not this wait.
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
  } finally {
    await page.mouse.up();
  }
  await page.locator('[data-phase=landAuction] [data-testid=done]:not([disabled])').click({ timeout: PRESS_MS }).catch(() => undefined);
}

/** Development: buys a MULE in the store's corral, outfits it for Energy, walks it out and installs it on the plot. */
async function buyAndInstallAMule(page: Page): Promise<void> {
  const dev = page.locator('[data-phase=development]');
  await dev.waitFor({ timeout: within(LOTS.resultMs) + PRESS_MS * 5 });
  await page.locator('[data-shop=corral]:not([disabled])').click({ timeout: PRESS_MS * 3 });
  await page.locator('[data-shop=energy]:not([disabled])').click({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: PRESS_MS });
  await dev.getByRole('button', { name: 'Install here' }).click({ timeout: PRESS_MS });
  await dev.getByText(/Your MULE here makes/).waitFor({ timeout: PRESS_MS });
  await goToThePub(page);
}

async function goToThePub(page: Page): Promise<void> {
  await page.locator('[data-phase=development]').getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: within(LOTS.resultMs) + PRESS_MS * 5 });
}

/** The goods auction: presses Ready or Done at every stage it shows, until the phone leaves the auction. */
async function pressDoneThroughTheAuction(page: Page): Promise<void> {
  await page.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });
  const done = page.locator('[data-phase=auction]').getByRole('button', { name: /^(Ready|Done with .+)$/ });
  const over = page.locator('[data-phase]:not([data-phase=auction])');
  for (let pressed = 0; ; pressed++) {
    check(pressed < 40, 'the goods auction moves on when everyone is done');
    await done.or(over).first().waitFor({ timeout: AUCTION_STAGE_MS * 3 });
    if (await over.count()) return;
    try {
      const label = await done.innerText({ timeout: PRESS_MS });
      await done.click({ timeout: PRESS_MS });
      await page.locator('[data-phase=auction]').getByRole('button', { name: label, exact: true }).waitFor({ state: 'hidden', timeout: AUCTION_STAGE_MS * 3 });
    } catch (err) {
      // The stage moved on under the press; the wait above decides what comes next.
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}

/** Month 2 planning: lists the first plot of the seat in `slot` (from 0) with the hub's Sell a plot tool at the form's minimum, unsold kept. */
async function listAPlot(page: Page, slot: number, truth: Truth) {
  const planning = page.locator('[data-phase=planning]');
  await planning.getByTestId('tool-list').click({ timeout: PRESS_MS });
  const mine = planning.getByRole('button', { name: new RegExp(`owned by player ${slot + 1}(,|$)`) });
  await mine.first().click({ timeout: PRESS_MS });
  await planning.getByTestId('kind-plot').click({ timeout: PRESS_MS });
  await planning.getByTestId('unsold-keep').click({ timeout: PRESS_MS });
  await planning.getByTestId('list').click({ timeout: PRESS_MS });
  const row = planning.locator('[data-testid^="listing-"]').first();
  await row.waitFor({ timeout: PRESS_MS });
  const id = (await row.getAttribute('data-testid'))!.slice('listing-'.length);
  await planning.getByTestId('tool-look').click({ timeout: PRESS_MS });
  const listing = truth.board().listings.find((l) => l.id === id);
  check(listing && listing.item.kind === 'plot', `the server holds listing ${id} as a plot`);
  return listing as typeof listing & { item: { kind: 'plot'; x: number; y: number } };
}

/** Ties may come in either order; otherwise the screen's order is the server's, best first. */
function sameScoreOrder(order: string[], best: string[], scores: { id: string; score: number }[]): boolean {
  const scoreOf = (id: string) => scores.find((s) => s.id === id)?.score;
  return order.length === best.length && order.every((id, i) => scoreOf(id) === scoreOf(best[i]!));
}

function money(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''));
}

function title(species: Species): string {
  return species[0]!.toUpperCase() + species.slice(1);
}
