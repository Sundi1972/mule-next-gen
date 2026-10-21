/**
 * The land auction in a real browser against the real server (spec C13).
 * Exports WS4's smoke hooks (CT-3); run directly, it plays UBER-AC-1 with three phones and a TV.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME, LOTS, TAX } from '@mule/engine';
import { errors as playwrightErrors, type Browser, type Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import { check, launch, PHONE, startServer, TV, type AuctionSteps } from './harness';

const PRESS_MS = 2_000;
/** The minimum the Sell form starts at, which listPlot leaves unchanged. */
const LOTS_MINIMUM = 250;

// --- CT-3 hooks, called by smoke.ts --------------------------------------------

/** The smoke's phone started the room, so it holds the first seat. */
const SMOKE_PHONE_SLOT = 0;

/** What listedSale put up, for month 2's landAuction to follow. */
let smokeListing: string | null = null;

/** Month 2 planning: list one of the phone's plots from the Sell tab, unsold kept. Returns within ~2 s. */
export const listedSale: NonNullable<AuctionSteps['listedSale']> = async ({ phone, check }) => {
  const planning = phone.locator('[data-phase=planning]');
  await planning.getByTestId('tab-sell').click({ timeout: PRESS_MS });
  smokeListing = await listPlot(phone, SMOKE_PHONE_SLOT, 0);
  if (smokeListing === null) {
    console.log('auction steps: the phone owns no plot to list');
  } else {
    check(await planning.getByTestId(`listing-${smokeListing}`).isVisible(), `the phone's line-up shows ${smokeListing}`);
    console.log(`auction steps: listed ${smokeListing}`);
  }
  await planning.getByTestId('tab-colony').click({ timeout: PRESS_MS });
};

/** After each land grant: with the phone's listing up, the lot shows on the phone and the TV and runs to its bell. */
export const landAuction: NonNullable<AuctionSteps['landAuction']> = async ({ phone, tv, check }, month) => {
  if (month !== 2 || smokeListing === null) {
    check((await phone.locator('[data-phase=landAuction]').count()) === 0, `month ${month}: no land auction without a listing`);
    return;
  }
  const lots = phone.locator('[data-phase=landAuction]');
  await lots.waitFor({ timeout: within(0.1, LOTS.introMs) });
  await tv.locator('[data-phase=landAuction]').getByTestId('tv-lot').waitFor({ timeout: within(0.1, LOTS.introMs) });
  // No AI bids in PR-1, so nobody reaches the minimum and the seller keeps the plot.
  const [mine, shown] = await Promise.all([resultOn(phone, 'result', 0.1), resultOn(tv, 'tv-result', 0.1)]);
  check(mine.kind === 'kept' && shown.kind === 'kept', `the unbid lot is kept, phone ${mine.kind}, TV ${shown.kind}`);
  smokeListing = null;
};

// --- UBER-AC-1, front to back ----------------------------------------------------

/** Fast enough for a quick run, slow enough that a held Up can be let go between two ticks of the board. */
const SCALE = 0.25;
const SALES_TAX = TAX.salesTax;
/** Bids the two buyers walk to on lot 1. Several board steps apart, so a release a tick late still leaves the order intact. */
const LOW_BID = 260;
const HIGH_BID = 360;

type Phone = { page: Page; name: string; slot: number };
type Outcome = { kind: string; text: string; money: number };

async function main(): Promise<void> {
  const seed = seedFrom(process.env.MULE_E2E_SEED);
  const { server, base } = await startServer({ maxMonths: 2, phaseScale: SCALE, seed: () => seed });
  const browser = await launch();
  const started = Date.now();
  try {
    await playTheLandAuction(browser, base);
    console.log(`✓ UBER-AC-1: list, bid on two phones, sold at the bell (${((Date.now() - started) / 1_000).toFixed(1)}s, seed ${seed})`);
  } catch (err) {
    console.error(`✗ UBER-AC-1: list, bid on two phones, sold at the bell (seed ${seed})`);
    await keepEvidence(browser, seed);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function playTheLandAuction(browser: Browser, base: string): Promise<void> {
  const errors: string[] = [];
  const open = async (name: string) => {
    const page = await (await browser.newContext(PHONE)).newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(base);
    return page;
  };

  // Seats go in join order, so the seller sits first and the two buyers after.
  const brix: Phone = { page: await open('Brix'), name: 'Brix', slot: 0 };
  await brix.page.getByPlaceholder('Heiko').fill(brix.name);
  await brix.page.getByRole('button', { name: 'Start a new game' }).click();
  await brix.page.getByText("You're at the table").waitFor();
  const code = (await brix.page.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);
  const lena: Phone = { page: await joinRoom(await open('Lena'), base, code, 'Lena'), name: 'Lena', slot: 1 };
  const ossa: Phone = { page: await joinRoom(await open('Ossa'), base, code, 'Ossa'), name: 'Ossa', slot: 2 };
  const phones = [brix, lena, ossa];

  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await brix.page.locator('[data-testid=seats] li').nth(2).waitFor();
  await brix.page.getByText('Big screen connected').waitFor();
  await brix.page.getByRole('button', { name: 'Start game' }).click();
  console.log(`✓ three phones and a TV at table ${code}`);

  // Month 1: everyone claims, so the grant ends early; nothing is listed, so no land auction.
  await everyone(phones, (p) => readyInPlanning(p.page));
  await everyone(phones, (p) => claimPlots(p.page));
  await everyone(phones, (p) => goToThePub(p.page));
  await everyone(phones, (p) => pressDoneThroughTheAuction(p.page));
  console.log('✓ month 1: Brix claimed two plots');

  // Month 2 planning: Brix lists both plots; the others see them in their line-up (B-AC-1).
  const planning = brix.page.locator('[data-phase=planning]');
  await planning.waitFor({ timeout: within(SCALE, PHASE_MS.upkeep) });
  await planning.getByTestId('tab-sell').click();
  const first = await listPlot(brix.page, brix.slot, 0);
  const second = await listPlot(brix.page, brix.slot, 1);
  check(first !== null && second !== null, `Brix listed two plots, got ${first} and ${second}`);
  const minimum = LOTS_MINIMUM;
  for (const p of [lena, ossa]) {
    const lineup = p.page.locator('[data-phase=planning]');
    await lineup.getByTestId('tab-sell').click();
    await lineup.getByTestId(`listing-${first}`).waitFor({ timeout: PRESS_MS });
    await lineup.getByTestId(`listing-${second}`).waitFor({ timeout: PRESS_MS });
    const slots = await lineup.getByTestId('slots').innerText();
    check(slots.includes(`${LOTS.maxLotsPerMonth - 2} OF ${LOTS.maxLotsPerMonth}`), `${p.name}'s line-up counts two slots used: "${slots}"`);
  }
  console.log(`✓ B-AC-1: ${first} and ${second} listed at ${minimum}, on Lena's and Ossa's phones`);

  await everyone(phones, (p) => readyInPlanning(p.page));
  await everyone(phones, (p) => claimPlots(p.page));

  // Lot 1: Lena stops low, Ossa holds Up past her and is still holding when the bell rings.
  await everyone(phones, (p) => p.page.locator('[data-phase=landAuction]').waitFor({ timeout: within(SCALE, PHASE_MS.landGrant) }));
  await brix.page.getByTestId('seller-wait').or(brix.page.getByTestId('seller-note')).waitFor({ timeout: within(SCALE, LOTS.introMs) });
  await tv.getByTestId('tv-lot').waitFor({ timeout: within(SCALE, LOTS.introMs) });
  const before = await moneyOf(phones);
  const bell1 = watchTheBell(phones, tv);
  bell1.catch(() => undefined);
  let lenaBid = 0;
  await Promise.all([
    (async () => {
      await pressUp(lena.page);
      await untilBid(lena.page, LOW_BID);
      await lena.page.mouse.up();
      await lena.page.getByTestId('done').click({ timeout: PRESS_MS });
    })(),
    (async () => {
      await pressUp(ossa.page);
      await untilBid(ossa.page, HIGH_BID);
      lenaBid = await bidOf(lena.page);
      await tapDoneWhileHolding(ossa.page);
      // Let go only once the result shows: off the board, so the phone must forget the held Up by itself.
      await ossa.page.getByTestId('result').waitFor({ timeout: within(SCALE, LOTS.walkMs) });
      await ossa.page.mouse.up();
    })(),
  ]);
  const lot1 = await bell1;
  const price = priceOn(lot1.tv.text, ossa.name);
  check(lot1.tv.kind === 'sold', `TV shows lot 1 sold, got ${lot1.tv.kind}: "${lot1.tv.text}"`);
  for (const p of phones) check(lot1.phones[p.name]!.kind === 'sold', `${p.name}'s phone shows lot 1 sold, got ${lot1.phones[p.name]!.kind}`);
  check(lot1.phones[ossa.name]!.text.startsWith('Yours!'), `Ossa's phone says the plot is hers: "${lot1.phones[ossa.name]!.text}"`);
  check(lot1.phones[lena.name]!.text.startsWith(`Sold to ${ossa.name}`), `Lena's phone names Ossa: "${lot1.phones[lena.name]!.text}"`);
  check(price >= minimum && price > lenaBid, `Ossa's winning bid ${price} beats Lena's ${lenaBid} and the minimum ${minimum}`);
  check(lot1.phones[ossa.name]!.money === before[ossa.name]! - price, `Ossa paid ${price}: ${before[ossa.name]} → ${lot1.phones[ossa.name]!.money}`);
  check(lot1.phones[lena.name]!.money === before[lena.name]!, `Lena, outbid, paid nothing: ${before[lena.name]} → ${lot1.phones[lena.name]!.money}`);
  const proceeds = price - Math.round(price * SALES_TAX);
  check(lot1.phones[brix.name]!.money === before[brix.name]! + proceeds, `Brix got ${proceeds} after tax: ${before[brix.name]} → ${lot1.phones[brix.name]!.money}`);
  console.log(`✓ B-AC-2: lot 1 sold to Ossa at ${price} over Lena's ${lenaBid}; Ossa −${price}, Brix +${proceeds}, on the phones and the TV`);

  // Lot 2: Ossa held Up through lot 1's bell; her first press now must move her walker.
  await ossa.page.getByText(`Land auction · 2 of 2`).waitFor({ timeout: within(SCALE, LOTS.resultMs + LOTS.introMs) });
  const before2 = await moneyOf([ossa]);
  const bell2 = watchTheBell(phones, tv);
  bell2.catch(() => undefined);
  await Promise.all([
    lena.page.locator('[data-testid=done]:not([disabled])').click({ timeout: within(SCALE, LOTS.resultMs + LOTS.introMs) }),
    (async () => {
      const start = await walkingBid(ossa.page);
      await pressUp(ossa.page);
      await untilBid(ossa.page, start + 1);
      console.log(`✓ lot 2: Ossa's first press after holding through the bell moved her walker from ${start}`);
      await untilBid(ossa.page, minimum + 10);
      await ossa.page.mouse.up();
      await ossa.page.getByTestId('done').click({ timeout: PRESS_MS });
    })(),
  ]);
  const lot2 = await bell2;
  const price2 = priceOn(lot2.tv.text, ossa.name);
  check(lot2.phones[ossa.name]!.kind === 'sold' && lot2.phones[ossa.name]!.text.startsWith('Yours!'), `lot 2 sold to Ossa: "${lot2.phones[ossa.name]!.text}"`);
  check(lot2.phones[ossa.name]!.money === before2[ossa.name]! - price2, `Ossa paid ${price2} for lot 2: ${before2[ossa.name]} → ${lot2.phones[ossa.name]!.money}`);
  console.log(`✓ lot 2 sold to Ossa at ${price2}`);

  // After the land auction both plots are Ossa's on the TV's map (her phone opens development in the store).
  await tv.locator('[data-phase=development]').waitFor({ timeout: within(SCALE, LOTS.resultMs) });
  for (const id of [first, second]) {
    const label = await plotLabel(tv, id!);
    check(label.includes(`owned by player ${ossa.slot + 1}`), `${id} is Ossa's on the TV's map: "${label}"`);
  }
  console.log(`✓ ${first} and ${second} are Ossa's on the TV's map in development`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
}

// --- Steps on one page -------------------------------------------------------------

/** A budget for a phase of `ms` game time at this scale, plus room for the browser and the network. */
function within(scale: number, ms: number): number {
  return ms * scale + 3_000;
}

async function everyone(phones: Phone[], step: (p: Phone) => Promise<unknown>): Promise<void> {
  await Promise.all(phones.map(step));
}

async function joinRoom(page: Page, base: string, code: string, name: string): Promise<Page> {
  await page.goto(`${base}/?room=${code}`);
  await page.getByPlaceholder('Heiko').fill(name);
  await page.getByRole('button', { name: `Join game ${code}` }).click();
  await page.getByText("You're at the table").waitFor();
  return page;
}

async function readyInPlanning(page: Page): Promise<void> {
  await page.locator('[data-phase=planning]').getByRole('button', { name: "I'm ready" }).click({ timeout: within(SCALE, PHASE_MS.upkeep) });
}

/**
 * Presses CLAIM until this phone has no claims left or the grant is over (the
 * last claim at the table ends it). Two phones can press on the same lit plot;
 * the loser's press is refused and it tries the next one.
 */
async function claimPlots(page: Page): Promise<void> {
  const claim = page.locator('[data-phase=landGrant]').getByRole('button', { name: /CLAIMS LEFT/ });
  const over = page.locator('[data-phase]:not([data-phase=planning]):not([data-phase=landGrant])');
  await claim.waitFor({ timeout: within(SCALE, PHASE_MS.planning) });
  for (let tries = 0; ; tries++) {
    check(tries < 40, 'the land grant let this phone claim its plots');
    await claim.or(over).first().waitFor({ timeout: within(SCALE, PHASE_MS.landGrant) });
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

async function goToThePub(page: Page): Promise<void> {
  await page
    .locator('[data-phase=development]')
    .getByRole('button', { name: 'Go to the pub and end your turn' })
    .click({ timeout: within(SCALE, PHASE_MS.landGrant) });
}

/** The goods auction: press Done at every stage it shows until the phone leaves the auction. */
async function pressDoneThroughTheAuction(page: Page): Promise<void> {
  await page.locator('[data-phase=auction]').waitFor({ timeout: within(SCALE, PHASE_MS.development + PHASE_MS.production) });
  const done = page.locator('[data-phase=auction]').getByRole('button', { name: /^(Ready|Done choosing|Done with .+)$/ });
  const over = page.locator('[data-phase]:not([data-phase=auction])');
  for (let pressed = 0; ; pressed++) {
    check(pressed < 40, 'the goods auction moves on when everyone is done');
    await done.or(over).first().waitFor({ timeout: within(SCALE, 20_000 * 4) });
    if (await over.count()) return;
    try {
      const label = await done.innerText({ timeout: PRESS_MS });
      await done.click({ timeout: PRESS_MS });
      await page.locator('[data-phase=auction]').getByRole('button', { name: label, exact: true }).waitFor({ state: 'hidden', timeout: within(SCALE, 20_000 * 4) });
    } catch (err) {
      // The stage moved on under the press; the wait above decides what comes next.
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}

/**
 * On the Sell tab: picks this seat's `nth` plot on the map and lists it at the
 * form's starting minimum, unsold kept. Returns the listing id, or null if the
 * seat has no such plot.
 */
async function listPlot(page: Page, slot: number, nth: number): Promise<string | null> {
  const planning = page.locator('[data-phase=planning]');
  const mine = planning.getByRole('button', { name: new RegExp(`owned by player ${slot + 1}(,|$)`) });
  if ((await mine.count()) <= nth) return null;
  const listings = planning.locator('[data-testid^="listing-"]');
  const listed = await listings.count();
  await mine.nth(nth).click({ timeout: PRESS_MS });
  await planning.getByTestId('kind-plot').click({ timeout: PRESS_MS });
  const minimum = Number((await planning.getByTestId('minimum').innerText()).replace(/\D/g, ''));
  check(minimum === LOTS_MINIMUM, `the Sell form starts at ${LOTS_MINIMUM}, got ${minimum}`);
  await planning.getByTestId('unsold-keep').click({ timeout: PRESS_MS });
  await planning.getByTestId('list').click({ timeout: PRESS_MS });
  await listings.nth(listed).waitFor({ timeout: PRESS_MS });
  const id = await listings.nth(listed).getAttribute('data-testid');
  return id!.slice('listing-'.length);
}

/** The phone's bid on the board, from "YOU BID 283 · MAX 1,040". */
async function bidOf(page: Page): Promise<number> {
  const text = await page.getByTestId('my-bid').innerText({ timeout: PRESS_MS });
  const bid = Number(/YOU BID (\d+)/.exec(text)?.[1]);
  check(Number.isFinite(bid), `a bid on the board, got "${text}"`);
  return bid;
}

/** Once the walk opens and Up can be held: where this phone's walker starts. */
async function walkingBid(page: Page): Promise<number> {
  await page.locator('[data-testid=hold-up]:not([disabled])').waitFor({ timeout: within(SCALE, LOTS.resultMs + LOTS.introMs) });
  return bidOf(page);
}

/** Presses and holds Up once the walk lets this phone bid. */
async function pressUp(page: Page): Promise<void> {
  const up = page.locator('[data-testid=hold-up]:not([disabled])');
  await up.waitFor({ timeout: within(SCALE, LOTS.resultMs + LOTS.introMs) });
  await up.hover();
  await page.mouse.down();
}

/** Waits, Up held, until the phone's bid reaches `target`. */
async function untilBid(page: Page, target: number): Promise<void> {
  try {
    await page.waitForFunction(
      (t) => Number(/YOU BID (\d+)/.exec(document.querySelector('[data-testid=my-bid]')?.textContent ?? '')?.[1]) >= t,
      target,
      { timeout: within(SCALE, LOTS.walkMs), polling: 'raf' },
    );
  } catch (err) {
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    check(false, `holding Up takes the bid to ${target}, it stayed at "${await page.getByTestId('my-bid').textContent()}"`);
  }
}

/** Taps Done with a second finger while the mouse still holds Up. */
async function tapDoneWhileHolding(page: Page): Promise<void> {
  const box = await page.getByTestId('done').boundingBox();
  check(box, 'Done is on screen');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function moneyOf(phones: Phone[]): Promise<Record<string, number>> {
  const entries = await Promise.all(phones.map(async (p) => [p.name, money(await p.page.getByTestId('money').innerText())] as const));
  return Object.fromEntries(entries);
}

function money(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''));
}

/**
 * Waits for a lot's result on a page and reads it in one go, with the phone's
 * money from the same render: the result is on screen for only LOTS.resultMs.
 */
async function resultOn(page: Page, testId: 'result' | 'tv-result', scale: number): Promise<Outcome> {
  const handle = await page.waitForFunction(
    (id) => {
      const el = document.querySelector(`[data-testid=${id}]`);
      if (!el) return null;
      return { kind: el.getAttribute('data-kind') ?? '', text: el.textContent ?? '', money: document.querySelector('[data-testid=money]')?.textContent ?? '' };
    },
    testId,
    { timeout: within(scale, LOTS.introMs + LOTS.walkMs + LOTS.resultMs), polling: 'raf' },
  );
  const r = (await handle.jsonValue()) as { kind: string; text: string; money: string };
  return { kind: r.kind, text: r.text, money: money(r.money) };
}

/** Starts watching every phone and the TV for the coming bell, so none misses the short result. */
async function watchTheBell(phones: Phone[], tv: Page): Promise<{ phones: Record<string, Outcome>; tv: Outcome }> {
  const [shown, ...each] = await Promise.all([resultOn(tv, 'tv-result', SCALE), ...phones.map((p) => resultOn(p.page, 'result', SCALE))]);
  return { phones: Object.fromEntries(phones.map((p, i) => [p.name, each[i]!])), tv: shown! };
}

/** The price on the TV's result, "Ossa · 372", checking it names the buyer. */
function priceOn(text: string, buyer: string): number {
  const m = new RegExp(`${buyer} · (\\d+)`).exec(text);
  check(m, `the TV names ${buyer} as the buyer: "${text}"`);
  return Number(m[1]);
}

/** The aria label of a listed plot's square on the page's map; the map lays squares out row by row. */
async function plotLabel(page: Page, listingId: string): Promise<string> {
  const [, x, y] = /^plot-(\d+)-(\d+)$/.exec(listingId) ?? [];
  check(x !== undefined && y !== undefined, `a plot listing id, got ${listingId}`);
  return page.evaluate(
    ([px, py]) => {
      const grid = document.querySelector<HTMLElement>('[data-phase] [style*="grid-template-columns"]');
      const width = Number(/repeat\((\d+)/.exec(grid?.style.gridTemplateColumns ?? '')?.[1]);
      return grid?.children[py * width + px]?.getAttribute('aria-label') ?? '';
    },
    [Number(x), Number(y)] as const,
  );
}

/** A red run's screenshot and visible text of every page, in the system's temp dir. */
async function keepEvidence(browser: Browser, seed: number): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), `mule-e2e-${seed}-`));
  const pages = browser.contexts().flatMap((c) => c.pages());
  await Promise.all(
    pages.map(async (page, i) => {
      await page.screenshot({ path: join(dir, `page-${i}.png`) }).catch(() => undefined);
      const text = await page.locator('body').innerText({ timeout: PRESS_MS }).catch(() => '');
      console.error(`--- page ${i} (${page.url()}):\n${text}`);
    }),
  );
  console.error(`screenshots: ${dir}`);
}

/** The game's seed: MULE_E2E_SEED when set, a fresh random one otherwise. */
function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}

// Rooms keep their phase timers running after the test, so the process ends here.
if (process.argv[1]?.endsWith('auction-steps.ts')) {
  main().then(
    () => process.exit(0),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
