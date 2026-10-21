/**
 * The land auction in a real browser against the real server (spec C13).
 * Exports WS4's smoke hooks (CT-3); run directly, it plays UBER-AC-1 with three phones and a TV,
 * and checks month 1's goods auction and the lots against the WS6 spec's readability ACs.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME, LOTS, TAX, WALK, type Good } from '@mule/engine';
import type { AuctionView, MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Browser, type Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
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
    check(false, "the smoke's phone owns a plot to list");
  } else {
    check(await planning.getByTestId(`listing-${smokeListing}`).isVisible(), `the phone's line-up shows ${smokeListing}`);
    console.log(`auction steps: listed ${smokeListing}`);
  }
  await planning.getByTestId('tab-colony').click({ timeout: PRESS_MS });
};

/**
 * After each land grant: every lot shows on the phone and the TV and runs to its bell, pressing nothing.
 * Any month may open with the colony's lot (B-AC-8); in month 2 the phone's own listing follows it.
 */
export const landAuction: NonNullable<AuctionSteps['landAuction']> = async ({ phone, tv, check }, month) => {
  const listing = month === 2 ? smokeListing : null;
  smokeListing = null;
  await phone.locator('[data-phase]:not([data-phase=landGrant])').waitFor({ timeout: within(0.1, LOTS.introMs) });
  if ((await phone.locator('[data-phase=landAuction]').count()) === 0) {
    check(listing === null, `month ${month}: the phone's listing ${listing} opens a land auction`);
    return;
  }
  const rang = (kind: string) => kind === 'kept' || kind === 'sold';
  for (let n = 1; n <= LOTS.maxLotsPerMonth; n++) {
    const lot = await lotUp(phone, within(0.1, LOTS.resultMs + LOTS.introMs));
    if (!lot) {
      check(listing === null, `month ${month}: the phone's listing ${listing} came up before the land auction ended`);
      return;
    }
    const colony = lot.seller.includes(COLONY_NAME);
    check(colony || listing !== null, `month ${month}: with nothing listed only the colony sells, got a lot from "${lot.seller}"`);
    if (colony) check(lot.number === 1, `B-AC-8: the colony's lot is first in line, got lot ${lot.number} of ${lot.count}`);
    // Whether an AI bids decides sold or kept (both lots stay with their seller unsold); either way both screens show the bell.
    const [mine, shown] = await Promise.all([resultOn(phone, 'result', 0.1), resultOn(tv, 'tv-result', 0.1)]);
    check(rang(mine.kind) && rang(shown.kind), `month ${month}: lot ${lot.number} ends sold or kept, phone ${mine.kind}, TV ${shown.kind}`);
    if (colony) console.log(`auction steps: B-AC-8, month ${month} opened with the colony's lot, ${shown.kind}`);
    if (colony && listing === null) check(lot.count === 1, `month ${month}: with nothing listed the colony's lot is the only one, got ${lot.count}`);
    if (!colony || listing === null) return;
    await Promise.all([phone.getByTestId('result').waitFor({ state: 'hidden', timeout: within(0.1, LOTS.resultMs) }), tv.getByTestId('tv-result').waitFor({ state: 'hidden', timeout: within(0.1, LOTS.resultMs) })]);
  }
  check(false, `month ${month}: the land auction ends within ${LOTS.maxLotsPerMonth} lots`);
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
    await playTheLandAuction(browser, base, server);
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

async function playTheLandAuction(browser: Browser, base: string, server: MuleServer): Promise<void> {
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
  const truth = serverTruth(server, code);

  // Month 1: everyone claims (Brix and Lena list theirs in month 2), so the grant ends early. Nothing is listed, so only the colony's lot can follow.
  await everyone(phones, (p) => readyInPlanning(p.page));
  await everyone(phones, (p) => claimPlots(p.page));
  await brix.page.locator('[data-phase]:not([data-phase=landGrant])').waitFor({ timeout: within(SCALE, PHASE_MS.landGrant) });
  if ((await brix.page.locator('[data-phase=landAuction]').count()) > 0) await followTheColonyLot(phones, tv, 1, truth);
  await everyone(phones, (p) => goToThePub(p.page));
  await readTheGoodsWalk({ seller: brix, buyer: lena, stayer: ossa }, tv, truth);
  await everyone(phones, (p) => pressDoneThroughTheAuction(p.page));
  console.log('✓ month 1: everyone claimed');

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
  await fillTheMonthThenUnlist(lena, ossa);

  await everyone(phones, (p) => readyInPlanning(p.page));
  await everyone(phones, (p) => claimPlots(p.page));

  // Brix's lot 1: Lena stops low, Ossa holds Up past her and is still holding when the bell rings. The colony's lot may come up before it.
  await everyone(phones, (p) => p.page.locator('[data-phase=landAuction]').waitFor({ timeout: within(SCALE, PHASE_MS.landGrant) }));
  const opening = await lotUp(brix.page, within(SCALE, LOTS.introMs));
  if (opening?.seller.includes(COLONY_NAME)) await followTheColonyLot(phones, tv, 2, truth);
  await brix.page.getByTestId('seller-wait').or(brix.page.getByTestId('seller-note')).waitFor({ timeout: within(SCALE, LOTS.resultMs + LOTS.introMs) });
  await tv.getByTestId('tv-lot').waitFor({ timeout: within(SCALE, LOTS.introMs) });
  const before = await moneyOf(phones);
  const bell1 = watchTheBell(phones, tv);
  bell1.catch(() => undefined);
  let lenaBid = 0;
  await Promise.all([
    oneBidLine([{ name: "Brix's phone", page: brix.page }, { name: 'the TV', page: tv }], 'lot 1'),
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

  // Brix's lot 2: Ossa held Up through lot 1's bell; her first press now must move her walker.
  await nextLotFrom(ossa.page, brix.name);
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

/**
 * B-AC-8, when the seed rolls it: the colony's lot is first on every phone and the TV, every phone
 * can hold Up on it, and with nobody bidding it stays free land. Presses nothing; returns once its result is gone.
 */
async function followTheColonyLot(phones: Phone[], tv: Page, month: number, truth: Truth): Promise<void> {
  const bell = watchTheBell(phones, tv);
  bell.catch(() => undefined);
  const screens = [...phones.map((p) => ({ name: `${p.name}'s phone`, page: p.page })), { name: 'the TV', page: tv }];
  const lots = await Promise.all(screens.map((s) => lotUp(s.page, within(SCALE, LOTS.introMs))));
  lots.forEach((lot, i) => check(lot?.seller.includes(COLONY_NAME) && lot.number === 1, `B-AC-8: ${screens[i]!.name} shows the colony's lot first, got ${JSON.stringify(lot)}`));
  await everyone(phones, (p) => p.page.locator('[data-testid=hold-up]:not([disabled])').waitFor({ timeout: within(SCALE, LOTS.introMs + LOTS.walkMs) }));
  await oneBidLine(screens, `month ${month}'s colony lot`);
  await bidLineAtTheTopBid(screens, truth, month);
  const rang = await bell;
  check(rang.tv.kind === 'kept' && rang.tv.text.includes('Stays free land'), `B-AC-8: nobody bid, so the TV says it stays free land: "${rang.tv.text}"`);
  for (const p of phones) check(rang.phones[p.name]!.kind === 'kept', `B-AC-8: ${p.name}'s phone shows the colony's lot unsold, got ${rang.phones[p.name]!.kind}`);
  await everyone(phones, (p) => p.page.getByTestId('result').waitFor({ state: 'hidden', timeout: within(SCALE, LOTS.resultMs) }));
  console.log(`✓ B-AC-8: month ${month} opened with the colony's lot on every phone and the TV; every phone could bid, and unbid it stays free land`);
}

// --- WS6 spec G-1: the auctions readable at a glance ----------------------------------

type Screen = { name: string; page: Page; seat?: Phone };

/** The server's own views: the public one every TV gets, and each seat's private one, whose stock is the engine's. */
type Truth = { board: () => MuleView; idOf: (p: Phone) => string; stockOf: (p: Phone, good: Good) => number };

function serverTruth(server: MuleServer, code: string): Truth {
  const room = () => {
    const r = server.registry.get(code);
    check(r, `room ${code} is on the server`);
    return r;
  };
  const game = (seat: string | null) => {
    const g = room().viewFor(seat).game;
    check(g, `room ${code} has a game running`);
    return g;
  };
  const idOf = (p: Phone) => {
    const id = room().viewFor(null).seats.find((s) => s.name === p.name)?.id;
    check(id, `${p.name} has a seat`);
    return id;
  };
  return {
    board: () => game(null),
    idOf,
    stockOf: (p, good) => {
      const me = game(idOf(p)).me;
      check(me, `${p.name}'s view carries their own stock`);
      return me.stock[good];
    },
  };
}

/** Units under a creature and the surplus over this month's need, as B-AC-2 writes them: "10 (+6)", "3 (0)", "0 (-4)". */
function unitsLabel(units: number, need: number): string {
  const surplus = units - need;
  return `${units} (${surplus > 0 ? '+' : ''}${surplus})`;
}

/** Every walker's label by seat id, from the engine's stock and the status row's need. Passing players carry none. */
function unitsFromTheServer(truth: Truth, phones: Phone[]): Record<string, string> {
  const a = truth.board().auction;
  check(a, 'the goods auction is running on the server');
  const labels: [string, string][] = [];
  for (const p of phones) {
    const id = truth.idOf(p);
    const w = a.walkers.find((x) => x.id === id);
    const row = a.status.find((r) => r.id === id);
    check(w && row, `${p.name} walks and has a status row`);
    if (w.side !== 'pass') labels.push([id, unitsLabel(truth.stockOf(p, a.good), row.need)]);
  }
  return Object.fromEntries(labels.sort(([x], [y]) => x.localeCompare(y)));
}

/** Waits a frame at a time until `read`, run in the page, returns `want`; fails naming what the screen showed instead. */
async function untilShows<T>(s: Screen, read: () => T, want: T, what: string, timeout = PRESS_MS): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const got = await s.page.evaluate(read);
    if (JSON.stringify(got) === JSON.stringify(want)) return;
    check(Date.now() < deadline, `${what} on ${s.name}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
}

const readLines = () => ({
  ask: document.querySelectorAll('[data-testid=line-ask]').length,
  bid: document.querySelectorAll('[data-testid=line-bid]').length,
  gap: document.querySelectorAll('[data-testid=gap-label]').length,
});
const readReadout = () => [...document.querySelectorAll('[data-testid=line-readout] dd')].slice(0, 2).map((dd) => dd.textContent);
const readUnits = () =>
  Object.fromEntries(
    [...document.querySelectorAll<HTMLElement>('[data-testid^="units-"]')]
      .map((el) => [el.dataset.testid!.slice('units-'.length), el.innerText.trim()] as const)
      .sort(([x], [y]) => x.localeCompare(y)),
  );
/** The store's selling line's words on the board, "SELLS 66 · 2 LEFT", or "SOLD OUT" in its place. */
const readStoreLine = () => {
  const el = document.querySelector<HTMLElement>('[data-testid=limit-sells]') ?? document.querySelector<HTMLElement>('[data-testid=store-sold-out]');
  return el?.innerText.trim().split('\n').pop() ?? null;
};
const readTvStock = () => document.querySelector('[data-testid=tv-store] > div:nth-child(3) dd')?.textContent ?? null;

/** Picks a side on the goods auction's declare, or on the walk's row of sides if the walk has begun. */
async function pickSide(page: Page, side: 'Buyer' | 'Seller' | 'Pass', timeout: number): Promise<void> {
  const auction = page.locator('[data-phase=auction]');
  await auction.locator('[role=radio]:not([disabled])', { hasText: side }).click({ timeout });
  await auction.getByRole('radio', { name: side, checked: true, exact: true }).waitFor({ timeout: PRESS_MS });
}

/** Passes once the page shows units changing hands with neither moving line nor the gap drawn: they became the trade bar. */
async function linesGiveWayToTheTrade(s: Screen, timeout: number): Promise<void> {
  try {
    await s.page.waitForFunction(
      () => document.querySelector('[data-testid=deal]') && !document.querySelector('[data-testid=line-ask], [data-testid=line-bid], [data-testid=gap-label]'),
      undefined,
      { timeout, polling: 'raf' },
    );
  } catch (err) {
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    check(false, `B-AC-1: on ${s.name} the two lines give way to the trade bar while units change hands`);
  }
}

/** Waits, a page frame at a time, until the server's goods auction passes `ok`. */
async function untilServer(truth: Truth, page: Page, ok: (a: AuctionView) => boolean, what: string, timeout = PRESS_MS): Promise<AuctionView> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const a = truth.board().auction;
    if (a && ok(a)) return a;
    check(Date.now() < deadline, what);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
}

/** Holds Up or Down on a phone until the server's auction passes `until`, then lets go and waits for the walker to stand. */
async function walkUntil(truth: Truth, p: Phone, dir: 'up' | 'down', until: (a: AuctionView) => boolean, what: string): Promise<void> {
  const id = truth.idOf(p);
  await hold(p.page, dir, PRESS_MS);
  await untilServer(truth, p.page, until, what);
  await p.page.mouse.up();
  await untilServer(truth, p.page, (a) => a.walkers.find((w) => w.id === id)?.dir === 0, `${p.name} stands once ${dir} is let go`);
}

/**
 * Month 1's first good, played so every step lands on a known price: the stayer steps up out of the way,
 * the buyer walks up to the store's line and buys it out, then the seller walks down to the buyer and
 * they trade. At each step every phone and the TV must draw what the server holds (WS6 B-AC-1, B-AC-2,
 * B-AC-3, HC-2). Leaves the walk running; the caller presses Done through the rest of the auction.
 */
async function readTheGoodsWalk(cast: { seller: Phone; buyer: Phone; stayer: Phone }, tv: Page, truth: Truth): Promise<void> {
  const { seller, buyer, stayer } = cast;
  const phones = [seller, buyer, stayer];
  const [sellerId, buyerId, stayerId] = [truth.idOf(seller), truth.idOf(buyer), truth.idOf(stayer)];
  const screens: Screen[] = [...phones.map((p) => ({ name: `${p.name}'s phone`, page: p.page, seat: p })), { name: 'the TV', page: tv }];
  const theTv = screens[3]!;
  const toDeclare = within(SCALE, PHASE_MS.development + PHASE_MS.production + WALK.statusMs);
  await Promise.all([pickSide(seller.page, 'Seller', toDeclare), pickSide(buyer.page, 'Buyer', toDeclare), pickSide(stayer.page, 'Seller', toDeclare)]);

  const walking = { ask: 1, bid: 1, gap: 1 };
  await Promise.all(screens.map((s) => untilShows(s, readLines, walking, 'B-AC-1: the lowest-ask and highest-bid lines and the gap during the walk', within(SCALE, WALK.declareMs))));
  // Both sellers start level at the top. The stayer steps above it, so the lowest ask is the seller's alone and the buyer never meets the stayer.
  const at = (a: AuctionView, id: string) => a.walkers.find((w) => w.id === id)?.at ?? NaN;
  await walkUntil(truth, stayer, 'up', (a) => Math.round(at(a, stayerId)) >= Math.round(at(a, sellerId)) + 2, `${stayer.name} walks up over ${seller.name}`);
  const view = truth.board();
  const a = view.auction;
  check(a?.stage === 'walk', `the server is walking, got ${a?.stage}`);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const ask = a.walkers.filter((w) => w.side === 'seller' && (w.units ?? 1) > 0).sort((x, y) => x.at - y.at)[0];
  const bid = a.walkers.filter((w) => w.side === 'buyer').sort((x, y) => y.at - x.at)[0];
  check(ask && bid && ask.id === sellerId && bid.id === buyerId, `${seller.name} holds the lowest ask and ${buyer.name} the highest bid, got ${ask?.id} and ${bid?.id}`);
  await Promise.all(
    screens.map((s) => {
      const who = (id: string) => (s.seat && truth.idOf(s.seat) === id ? 'You' : name(id));
      return untilShows(s, readReadout, [`${ask.price} · ${who(ask.id)}`, `${bid.price} · ${who(bid.id)}`], 'B-AC-1: the readout names who holds each line');
    }),
  );
  console.log(`✓ B-AC-1 (WS6): ${a.good} walk, the red line at ${ask.price} and the green at ${bid.price} with the gap on three phones and the TV; the readout names ${seller.name} and ${buyer.name}, "You" on their own phones`);

  const storeShows = async (forSale: number, sells: number | null) => {
    const line = forSale > 0 ? `SELLS ${sells} · ${forSale} LEFT` : 'SOLD OUT';
    await Promise.all([
      ...screens.map((s) => untilShows(s, readStoreLine, line, "B-AC-3: the store's line counts what it will sell")),
      untilShows(theTv, readTvStock, String(forSale), "B-AC-3: the TV's Stock is what the store will sell"),
    ]);
    const raw = truth.board().market.find((r) => r.good === a.good)!.storeStock;
    check(raw !== forSale, `B-AC-3 needs the store's raw ${a.good} stock to differ from what it will sell, both ${raw}`);
    console.log(`✓ B-AC-3 (WS6): "${line}" on three phones and the TV, whose Stock reads ${forSale}; the store holds ${raw}, the rest is the colonists' reserve`);
  };
  await storeShows(a.storeForSale, a.storeSells);

  const before = unitsFromTheServer(truth, phones);
  await Promise.all(screens.map((s) => untilShows(s, readUnits, before, 'B-AC-2: units and surplus under the creatures before the trade')));
  console.log(`✓ HC-2 (WS6): the TV shows only the ${a.good} units under the creatures, ${JSON.stringify(before)}, and no other good's stock`);

  // The buyer stops at the store's selling line, under every ask, and buys the store out from there.
  const tradeBudget = within(SCALE, WALK.goodMs);
  await walkUntil(truth, buyer, 'up', (x) => x.deals.some((d) => d.seller === 'store' && d.buyer === buyerId), `${buyer.name} walks up to the store's line and buys`);
  await untilServer(truth, buyer.page, (x) => x.storeForSale === 0 && x.deals.length === 0, `${buyer.name} buys the store out`, tradeBudget);
  await storeShows(0, null);

  const giveWay = Promise.all(screens.map((s) => linesGiveWayToTheTrade(s, tradeBudget)));
  giveWay.catch(() => undefined);
  await walkUntil(truth, seller, 'down', (x) => x.deals.some((d) => d.seller === sellerId && d.buyer === buyerId), `${seller.name} walks down to ${buyer.name}'s bid and they trade`);
  await giveWay;
  console.log(`✓ B-AC-1 (WS6): while ${seller.name} and ${buyer.name} trade, neither line nor the gap is drawn on any phone or the TV`);

  const traded = await untilServer(truth, tv, (x) => x.deals.length === 0, `${seller.name} and ${buyer.name}'s trade ends`, tradeBudget);
  check(traded.good === a.good && traded.stage === 'walk', `the ${a.good} walk goes on after the trade, got ${traded.good} ${traded.stage}`);
  const after = unitsFromTheServer(truth, phones);
  for (const id of [sellerId, buyerId]) check(after[id] !== before[id], `${name(id)}'s label changed in the trades: ${before[id]} → ${after[id]}`);
  await Promise.all(screens.map((s) => untilShows(s, readUnits, after, "B-AC-2: units and surplus under the creatures after the trade, from the engine's stock")));
  const zero = Object.values(after).some((l) => l.endsWith(' (0)'));
  const moved = (id: string) => `${name(id)} ${before[id]} → ${after[id]}`;
  console.log(`✓ B-AC-2 (WS6): after ${traded.units} units traded, ${moved(sellerId)} and ${moved(buyerId)} on three phones and the TV${zero ? ', a surplus of 0 drawn "(0)"' : ''}`);
}

/** WS6 B-AC-5: once a land lot's walk is drawn, each screen shows one highest-bid line and no ask line. */
async function oneBidLine(screens: Screen[], what: string): Promise<void> {
  await Promise.all(
    screens.map(async (s) => {
      try {
        const handle = await s.page.waitForFunction(
          () => {
            const lines = { bid: document.querySelectorAll('[data-testid=line-bid]').length, ask: document.querySelectorAll('[data-testid=line-ask]').length };
            return lines.bid + lines.ask > 0 ? lines : null;
          },
          undefined,
          { timeout: within(SCALE, LOTS.introMs + LOTS.walkMs), polling: 'raf' },
        );
        const lines = (await handle.jsonValue()) as { bid: number; ask: number };
        check(lines.bid === 1 && lines.ask === 0, `B-AC-5: ${what} on ${s.name} draws one bid line and no ask line, got ${JSON.stringify(lines)}`);
      } catch (err) {
        if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
        check(false, `B-AC-5: ${what} on ${s.name} draws the highest-bid line`);
      }
    }),
  );
  console.log(`✓ B-AC-5 (WS6): ${what} shows one highest-bid line and no ask line on ${screens.map((s) => s.name).join(', ')}`);
}

/** WS6 B-AC-5 while nobody walks: the bid line's tag is the server's highest bid, under the minimum or not. */
async function bidLineAtTheTopBid(screens: Screen[], truth: Truth, month: number): Promise<void> {
  const lot = truth.board().landAuction;
  check(lot?.stage === 'walk', `the server is walking a lot, got ${lot?.stage}`);
  const top = lot.walkers.filter((w) => w.side === 'buyer').sort((x, y) => y.at - x.at)[0];
  check(top, 'someone can bid on the lot');
  const readTag = () => document.querySelector('[data-testid=tag-bid]')?.textContent ?? null;
  await Promise.all(screens.map((s) => untilShows(s, readTag, String(top.price), "B-AC-5: the bid line sits at the server's highest bid")));
  console.log(`✓ B-AC-5 (WS6): month ${month}'s colony lot, the bid line at ${top.price} (minimum ${lot.lot.minimum}) on every phone and the TV`);
}

/**
 * B-AC-6: with two lots already up, Lena lists two more and fills the month;
 * Ossa's Sell tab then reads full and refuses a fifth. Lena unlists both, so
 * the auction that follows is the one with Brix's two lots.
 */
async function fillTheMonthThenUnlist(lena: Phone, ossa: Phone): Promise<void> {
  const lenas = [await listPlot(lena.page, lena.slot, 0), await listPlot(lena.page, lena.slot, 1)];
  check(lenas.every((id) => id !== null), `Lena listed two plots, got ${lenas.join(' and ')}`);

  const sell = ossa.page.locator('[data-phase=planning]');
  const slots = sell.getByTestId('slots');
  await slots.filter({ hasText: 'FULL' }).waitFor({ timeout: PRESS_MS });
  const read = await slots.innerText();
  check(read === 'FULL', `Ossa's line-up reads full with ${LOTS.maxLotsPerMonth} lots up: "${read}"`);
  const hers = sell.getByRole('button', { name: new RegExp(`owned by player ${ossa.slot + 1}(,|$)`) });
  check((await hers.count()) > 0, 'Ossa owns a plot to try listing');
  await hers.first().click({ timeout: PRESS_MS });
  const list = sell.getByTestId('list');
  const footer = await list.innerText({ timeout: PRESS_MS });
  check(footer === 'The auction is full this month.', `Ossa's footer refuses a fifth lot: "${footer}"`);
  check(await list.isDisabled(), "Ossa's list button is disabled while the month is full");
  await sell.getByTestId('sell-cancel').click({ timeout: PRESS_MS });
  console.log(`✓ B-AC-6: with ${LOTS.maxLotsPerMonth} lots up, Ossa's Sell tab reads FULL and "The auction is full this month." with list disabled`);

  for (const id of lenas) await lena.page.getByTestId(`unlist-${id}`).click({ timeout: PRESS_MS });
  const twoUsed = `${LOTS.maxLotsPerMonth - 2} OF ${LOTS.maxLotsPerMonth}`;
  await slots.filter({ hasText: twoUsed }).waitFor({ timeout: PRESS_MS });
}

// --- Steps on one page -------------------------------------------------------------

/** The seller of the colony's lot, as the lot card names it. */
const COLONY_NAME = 'The colony';

type LotUp = { number: number; count: number; seller: string };

/** The lot on a phone's or the TV's land auction screen, once its card shows; null once the page has left the land auction. */
async function lotUp(page: Page, timeout: number): Promise<LotUp | null> {
  const handle = await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-phase]');
      if (!root) return null;
      if (root.getAttribute('data-phase') !== 'landAuction') return { over: true };
      const header = /Land auction · (\d+) of (\d+)/.exec(root.textContent ?? '');
      const card = root.querySelector('[data-testid=lot-seller], [data-testid=tv-lot]');
      if (!header || !card) return null;
      return { over: false, number: Number(header[1]), count: Number(header[2]), seller: card.textContent ?? '' };
    },
    undefined,
    { timeout, polling: 'raf' },
  );
  const r = (await handle.jsonValue()) as ({ over: true } | ({ over: false } & LotUp));
  return r.over ? null : { number: r.number, count: r.count, seller: r.seller };
}

/** Waits for the next lot from `seller`: the last lot's result gone and the card naming them. */
async function nextLotFrom(page: Page, seller: string): Promise<void> {
  await page.waitForFunction(
    (name) => !document.querySelector('[data-testid=result]') && (document.querySelector('[data-testid=lot-seller]')?.textContent ?? '').includes(name),
    seller,
    { timeout: within(SCALE, LOTS.resultMs + LOTS.introMs), polling: 'raf' },
  );
}

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
  await hold(page, 'up', within(SCALE, LOTS.resultMs + LOTS.introMs));
}

/** Presses and holds Up or Down once the button is enabled. */
async function hold(page: Page, dir: 'up' | 'down', timeout: number): Promise<void> {
  const button = page.locator(`[data-testid=hold-${dir}]:not([disabled])`);
  await button.waitFor({ timeout });
  await button.hover();
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
