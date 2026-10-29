/**
 * The land auction in a real browser against the real server (spec C13).
 * Exports WS4's smoke hooks (CT-3); run directly, it plays UBER-AC-1 with three phones and a TV,
 * and checks month 1's goods auction and the lots against the WS6 spec's readability ACs.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPORT_DEMAND, GAME, goodsMarket, LOTS, TAX, WALK, type Good } from '@mule/engine';
import type { AuctionView, MuleView } from '@mule/protocol';
import { GOOD_NAME } from '@mule/ui';
import { errors as playwrightErrors, type Browser, type Page } from 'playwright';
import { AI_NAMES, GRANT_PASS_MAX_MS, GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, headerSlot, held, launch, PHONE, PHONE_SMALL, startServer, TV, type AuctionSteps } from './harness';
import { hostContinuesWithout } from './hub-steps';
import { ELECTION_WAIT_MS, readyThroughTheElection, voteThroughTheElection } from './politics-steps';
import { AUDIT_JS, MIN_TEXT, type AuditRead } from './small-phone-audit';

const PRESS_MS = 2_000;
/** Once the month's last good has closed, how long a phone has to show the month end's "On to month N". */
const MONTH_END_MS = 10_000;
/** The minimum the Sell form starts at, which listPlot leaves unchanged. */
const LOTS_MINIMUM = 250;

// --- CT-3 hooks, called by smoke.ts --------------------------------------------

/** What listedSale put up, for month 2's landAuction to follow. */
let smokeListing: string | null = null;

/** Month 2 planning: list one of the phone's plots with the hub's Sell a plot tool, unsold kept. Returns within ~2 s. */
export const listedSale: NonNullable<AuctionSteps['listedSale']> = async ({ phone, check }) => {
  const planning = phone.locator('[data-phase=planning]');
  await planning.getByTestId('tool-list').click({ timeout: PRESS_MS });
  smokeListing = await listPlot(phone, await headerSlot(phone, "the smoke's phone"), 0);
  if (smokeListing === null) {
    check(false, "the smoke's phone owns a plot to list");
  } else {
    check(await planning.getByTestId(`listing-${smokeListing}`).isVisible(), `the phone's line-up shows ${smokeListing}`);
    console.log(`auction steps: listed ${smokeListing}`);
  }
  await planning.getByTestId('tool-look').click({ timeout: PRESS_MS });
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
  // The room card shrinks to its compact QR once the TV has joined.
  await brix.page.waitForFunction(() => (document.querySelector('[data-testid=room-qr]')?.getBoundingClientRect().width ?? Infinity) < 60);
  await brix.page.getByRole('button', { name: 'Start game' }).click();
  console.log(`✓ three phones and a TV at table ${code}`);
  const truth = serverTruth(server, code);
  shipInPortThisMonth(server, code);

  // Month 1: everyone claims (Brix and Lena list theirs in month 2), so the grant ends early. Nothing is listed, so only the colony's lot can follow.
  // Month 1 opens on election day, which holds the desks until it is over.
  await everyone(phones, (p) => voteThroughTheElection(p.page, within(SCALE, ELECTION_WAIT_MS) + READY_LANDS_MS));
  await fillTheTvTicker(lena.page, tv);
  await everyone(phones, (p) => readyInPlanning(p.page));
  await everyone(phones, (p) => claimPlots(p.page));
  await brix.page.locator('[data-phase]:not([data-phase=landGrant])').waitFor({ timeout: GRANT_WAIT_MS });
  if ((await brix.page.locator('[data-phase=landAuction]').count()) > 0) await followTheColonyLot(phones, tv, 1, truth);
  await everyone(phones, (p) => goToThePub(p.page));
  const screens = [...phones.map((p) => ({ name: `${p.name}'s phone`, page: p.page })), { name: 'the TV', page: tv }];
  await Promise.all(screens.map((s) => recordStages(s.page)));
  const serverStages = recordServerStages(truth);
  let onServer: string[] = [];
  try {
    await readTheGoodsWalk({ seller: brix, buyer: lena, stayer: ossa }, tv, truth);
    const receipt = readTheReceipt({ seller: brix, buyer: lena }, tv, truth);
    receipt.catch(() => undefined);
    const shipGood = readTheShipGoodsOwnStatus(phones, tv, truth);
    shipGood.catch(() => undefined);
    await holdUpIntoTheNextGood(truth, ossa, [brix, lena]);
    await receipt;
    await shipGood;
  } finally {
    // Stopped on a failure too: left running, it would throw once the room closes and bury the real error.
    onServer = serverStages();
  }
  checkStages('the server', onServer);
  for (const s of screens) {
    const seen = await s.page.evaluate(() => (window as unknown as { stagesSeen: string[] }).stagesSeen);
    checkStages(s.name, seen);
    const missing = seen.filter((e) => !onServer.includes(e));
    check(missing.length === 0, `UBER-AC-1: ${s.name} draws only stages the server had, got ${missing.join(' ')} beyond ${onServer.join(' ')}`);
  }
  console.log(`✓ UBER-AC-1 (WS6): month 1's goods went ${onServer.join(' → ')} on the server, with no declare stage on it, any phone or the TV`);
  console.log('✓ month 1: everyone claimed');

  // Month 1's end has no clock (C20): every phone moves on to month 2.
  await everyone(phones, (p) => onToTheNextMonth(p.page));
  // Month 2 planning: Brix lists both plots; the others see them in their line-up (B-AC-1).
  const planning = brix.page.locator('[data-phase=planning]');
  await planning.waitFor({ timeout: PRESS_MS });
  await planning.getByTestId('tool-list').click();
  const first = await listPlot(brix.page, brix.slot, 0);
  const second = await listPlot(brix.page, brix.slot, 1);
  check(first !== null && second !== null, `Brix listed two plots, got ${first} and ${second}`);
  const minimum = LOTS_MINIMUM;
  for (const p of [lena, ossa]) {
    const lineup = p.page.locator('[data-phase=planning]');
    await lineup.getByTestId('tool-list').click();
    await lineup.getByTestId(`listing-${first}`).waitFor({ timeout: PRESS_MS });
    await lineup.getByTestId(`listing-${second}`).waitFor({ timeout: PRESS_MS });
    const slots = await lineup.getByTestId('slots').innerText();
    check(slots.includes(`${LOTS.maxLotsPerMonth - 2} OF ${LOTS.maxLotsPerMonth}`), `${p.name}'s line-up counts two slots used: "${slots}"`);
  }
  console.log(`✓ B-AC-1: ${first} and ${second} listed at ${minimum}, on Lena's and Ossa's phones`);
  await fillTheMonthThenUnlist(lena, ossa);

  await hostContinuesWithout({ host: brix, ready: lena, left: ossa, tv, server, code });
  await everyone(phones, (p) => claimPlots(p.page));

  // Brix's lot 1: Lena stops low, Ossa holds Up past her and is still holding when the bell rings. The colony's lot may come up before it.
  await everyone(phones, (p) => p.page.locator('[data-phase=landAuction]').waitFor({ timeout: GRANT_WAIT_MS }));
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

  // Month 2's goods: Brix sold all his Food in month 1, so he opens Food's status screen with none to sell.
  await everyone(phones, (p) => goToThePub(p.page));
  await readTheEmptyHandedStatus(phones, truth);
  await everyone(phones, (p) => pressDoneThroughTheAuction(p.page));
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
}

/**
 * WS6 B-AC-4 with nothing to sell: someone who holds none of the first good and needs some opens its
 * status screen as a buyer, with Sell off, and a tap on Buy passes them. Leaves the status screen running.
 */
async function readTheEmptyHandedStatus(phones: Phone[], truth: Truth): Promise<void> {
  const toStatus = within(SCALE, PHASE_MS.development + PHASE_MS.production);
  await everyone(phones, (p) => p.page.getByTestId('side-buyer').waitFor({ timeout: toStatus }));
  const a = await untilServer(truth, phones[0]!.page, (x) => x.stage === 'status', 'B-AC-4: the goods auction opens on its status screen', toStatus);
  const needOf = (p: Phone) => a.status.find((r) => r.id === truth.idOf(p))?.need ?? 0;
  const empty = phones.find((p) => truth.stockOf(p, a.good) === 0 && needOf(p) > 0);
  check(empty, `B-AC-4 needs a player with no ${a.good} who needs some, got ${phones.map((p) => `${p.name} ${truth.stockOf(p, a.good)}/${needOf(p)}`).join(', ')}`);
  check(sideOf(a, truth.idOf(empty)) === 'buyer', `B-AC-4: ${empty.name}, with no ${a.good} and a need of ${needOf(empty)}, opens the status screen as a buyer on the server, got ${sideOf(a, truth.idOf(empty))}`);
  await untilShows({ name: `${empty.name}'s phone`, page: empty.page }, readPicker, { side: 'buyer', sellOff: true }, 'B-AC-4: with none to sell, the status screen opens on Buy with Sell off');
  await tapSide(truth, empty, 'buyer', 'pass', `B-AC-4: ${empty.name} taps Buy and sits ${a.good} out`);
  console.log(`✓ B-AC-4 (WS6): ${empty.name}, with no ${a.good} and a need of ${needOf(empty)}, opens ${a.good}'s status screen on Buy with Sell off, as the server holds him; a tap on Buy passes`);
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
type Truth = {
  board: () => MuleView;
  idOf: (p: Phone) => string;
  stockOf: (p: Phone, good: Good) => number;
  /** The seat's own auction view: the board's, plus its receipt and month's total (A-5). */
  auctionOf: (p: Phone) => AuctionView | null;
  held: <T>(step: () => Promise<T>) => Promise<T>;
  /** The houses that buy the good up now, in the order the engine sells to them when they pay the same. */
  houseOrder: () => string[];
};

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
    held: (step) => held(server, code, step),
    houseOrder: () => {
      const state = (room() as unknown as { game: { state: Parameters<typeof goodsMarket>[0] } }).game.state;
      return goodsMarket(state).houseBuys.map((h) => h.id);
    },
    idOf,
    auctionOf: (p) => game(idOf(p)).auction,
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
  const seen = new Set<string>();
  for (;;) {
    const got = JSON.stringify(await s.page.evaluate(read));
    if (got === JSON.stringify(want)) return;
    seen.add(got);
    check(Date.now() < deadline, `${what} on ${s.name}: want ${JSON.stringify(want)}, saw ${[...seen].join(' then ')}`);
    await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
}

const readLines = () => ({
  ask: document.querySelectorAll('[data-testid=line-ask]').length,
  bid: document.querySelectorAll('[data-testid=line-bid]').length,
  gap: document.querySelectorAll('[data-testid=gap-label]').length,
});
const readTags = () => ({
  ask: document.querySelector('[data-testid=tag-ask]')?.textContent ?? null,
  bid: document.querySelector('[data-testid=tag-bid]')?.textContent ?? null,
  gap: document.querySelector('[data-testid=gap-label]')?.textContent ?? null,
});
const readReadout = () => [...document.querySelectorAll('[data-testid=tv-readout] dd')].slice(0, 2).map((dd) => dd.textContent);
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

/** The status screen's side picker on a phone: the side it shows as held, and whether Sell can be tapped. */
const readPicker = () => {
  const buy = document.querySelector('[data-testid=side-buyer]');
  const sell = document.querySelector<HTMLButtonElement>('[data-testid=side-seller]');
  if (!buy || !sell) return null;
  const side = buy.getAttribute('aria-checked') === 'true' ? 'buyer' : sell.getAttribute('aria-checked') === 'true' ? 'seller' : 'pass';
  return { side, sellOff: sell.disabled };
};

const sideOf = (a: AuctionView, id: string) => a.walkers.find((w) => w.id === id)?.side;

/**
 * Taps Buy or Sell on a phone's status screen and waits until the server holds `lands` for that seat,
 * still on the status screen, and the phone shows it. A status screen that closes first fails as timing.
 */
async function tapSide(truth: Truth, p: Phone, tap: 'buyer' | 'seller', lands: 'buyer' | 'seller' | 'pass', what: string): Promise<void> {
  const id = truth.idOf(p);
  const good = truth.board().auction?.good;
  await p.page.getByTestId(`side-${tap}`).click({ timeout: PRESS_MS });
  const deadline = Date.now() + PRESS_MS;
  for (;;) {
    const a = truth.board().auction;
    const open = a?.good === good && a?.stage === 'status';
    check(open, `${what}: the ${good} status screen closed before the tap landed (timing, not B-AC-4)`);
    if (sideOf(a, id) === lands) {
      console.log(`  ${p.name}'s tap landed with ${a.seconds.toFixed(1)} s of the status clock left (${(a.seconds * SCALE).toFixed(2)} s real)`);
      break;
    }
    check(Date.now() < deadline, `${what}: the server holds ${lands} for ${p.name}, got ${sideOf(a, id)}`);
    await p.page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
  await untilShows({ name: `${p.name}'s phone`, page: p.page }, readPicker, { side: lands, sellOff: truth.stockOf(p, good!) === 0 }, what);
}

/** What a screen draws of the goods auction, as "<good>:<stage>"; null off the auction. */
const stageShown = () => {
  const root = document.querySelector('[data-phase=auction]');
  if (!root) return null;
  let good = '?';
  for (const el of root.querySelectorAll('h1, span')) {
    const m = /^Auction · (.+)$/.exec(el.textContent ?? '') ?? /^(.+) · buy or sell\?$/.exec(el.textContent ?? '') ?? /^(.+) auction$/.exec(el.textContent ?? '');
    if (m) {
      good = m[1]!.toLowerCase().replace(/\s/g, '');
      break;
    }
  }
  if (root.querySelector('[data-testid=status-table]')) return `${good}:status`;
  // A-5: the close stage, a phone's receipt over the still board or the TV's data-stage.
  if (root.matches('[data-stage=close]') || root.querySelector('[data-testid=receipt-layer], [data-stage=close]')) return `${good}:close`;
  if (root.querySelector('[data-testid=walk-board]')) return `${good}:walk`;
  return null;
};

/** Starts noting, every frame, each new stage the page draws (see stageShown). */
async function recordStages(page: Page): Promise<void> {
  // Plain source, not a compiled callback: tsx names inner functions with a helper the page doesn't have.
  await page.evaluate(`(() => {
    const shown = ${stageShown.toString()};
    window.stagesSeen = [];
    const tick = () => {
      const now = shown();
      if (now && window.stagesSeen.at(-1) !== now) window.stagesSeen.push(now);
      requestAnimationFrame(tick);
    };
    tick();
  })()`);
}

/** Notes each new stage of the server's goods auction, as "<good>:<stage>", until stopped. */
function recordServerStages(truth: Truth): () => string[] {
  const seen: string[] = [];
  const timer = setInterval(() => {
    const a = truth.board().auction;
    const now = a && `${a.good.toLowerCase()}:${a.stage}`;
    if (now && seen.at(-1) !== now) seen.push(now);
  }, 5);
  return () => {
    clearInterval(timer);
    return seen;
  };
}

/** UBER-AC-1's last clause on one screen's (or the server's) stages: never a declare, and each walk straight after its good's status. */
function checkStages(who: string, seen: string[]): void {
  const all = seen.join(' ');
  seen.forEach((entry, i) => {
    const [good, stage] = entry.split(':');
    check(stage !== 'declare', `UBER-AC-1: ${who} never shows a stage called declare, got ${all}`);
    check(stage === 'status' || stage === 'walk' || stage === 'close', `UBER-AC-1: ${who} shows only status, walk and close, got "${entry}" in ${all}`);
    if (stage === 'walk') check(seen[i - 1] === `${good}:status`, `UBER-AC-1: on ${who} the ${good} walk comes straight after its status screen, got ${all}`);
    if (stage === 'close') check(seen[i - 1] === `${good}:walk`, `A-5: on ${who} the ${good} close stage comes straight after its walk, got ${all}`);
  });
  const food = seen.indexOf('food:status');
  check(food >= 0 && seen[food + 1] === 'food:walk', `UBER-AC-1: on ${who} Food's status screen is followed by its walk, got ${all}`);
}

/** Passes once the page shows two players trading with neither moving line nor the gap drawn: they became the trade bar. */
async function linesGiveWayToTheTrade(s: Screen, timeout: number): Promise<void> {
  try {
    await s.page.waitForFunction(
      () => {
        // A house's trade bar is labelled "×2 @ 66 · STORE"; one between two players carries only units and price.
        const players = [...document.querySelectorAll('[data-testid=deal]')].some((d) => /^×\d+ @ \d+$/.test(d.textContent?.trim() ?? ''));
        return players && !document.querySelector('[data-testid=line-ask], [data-testid=line-bid], [data-testid=gap-label]');
      },
      undefined,
      { timeout, polling: 'raf' },
    );
  } catch (err) {
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    check(false, `B-AC-1: on ${s.name} the two lines give way to the players' trade bar while units change hands`);
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
 * Month 1's first good, played so every step lands on a known price: on the status screen the buyer
 * switches from Sell to Buy; in the walk the stayer steps up out of the way, the buyer walks up to the
 * store's line and buys it out, then the seller walks down to the buyer and they trade. At each step every
 * phone and the TV must draw what the server holds (WS6 B-AC-1, B-AC-2, B-AC-3, B-AC-4, HC-2). Leaves the
 * walk running; the caller presses Done through the rest of the auction.
 */
async function readTheGoodsWalk(cast: { seller: Phone; buyer: Phone; stayer: Phone }, tv: Page, truth: Truth): Promise<void> {
  const { seller, buyer, stayer } = cast;
  const phones = [seller, buyer, stayer];
  const [sellerId, buyerId, stayerId] = [truth.idOf(seller), truth.idOf(buyer), truth.idOf(stayer)];
  const screens: Screen[] = [...phones.map((p) => ({ name: `${p.name}'s phone`, page: p.page, seat: p })), { name: 'the TV', page: tv }];
  const theTv = screens[3]!;
  const toStatus = within(SCALE, PHASE_MS.development + PHASE_MS.production);
  await everyone(phones, (p) => p.page.getByTestId('side-buyer').waitFor({ timeout: toStatus }));
  const opened = await untilServer(truth, seller.page, (x) => x.stage === 'status', 'B-AC-4: the goods auction opens on its status screen', toStatus);
  for (const p of phones) {
    const row = opened.status.find((r) => r.id === truth.idOf(p));
    check(row && truth.stockOf(p, opened.good) > row.need, `B-AC-4 needs ${p.name} to have ${opened.good} to spare, got ${truth.stockOf(p, opened.good)} for a need of ${row?.need}`);
    check(sideOf(opened, truth.idOf(p)) === 'seller', `B-AC-4: ${p.name}, with ${opened.good} to spare, opens the status screen as a seller on the server, got ${sideOf(opened, truth.idOf(p))}`);
  }
  await everyone(phones, (p) => untilShows({ name: `${p.name}'s phone`, page: p.page }, readPicker, { side: 'seller', sellOff: false }, 'B-AC-4: a player with some to spare opens the status screen on Sell'));
  await tapSide(truth, buyer, 'buyer', 'buyer', `B-AC-4: ${buyer.name} taps Buy from Sell and buys`);
  console.log(`✓ B-AC-4 (WS6): with ${opened.good} to spare, all three phones open ${opened.good}'s status screen on Sell, as the server holds them; ${buyer.name}'s tap on Buy makes her a buyer`);
  await truth.held(async () => {
    await readTheStatusWords(phones, tv, truth);
    await smallPhoneReads(buyer, 'status');
  });

  const walking = { ask: 1, bid: 1, gap: 1 };
  await Promise.all(screens.map((s) => untilShows(s, readLines, walking, 'B-AC-1: the lowest-ask and highest-bid lines and the gap during the walk', within(SCALE, WALK.statusMs))));
  // Both sellers start level at the top. The stayer steps above it, so the lowest ask is the seller's alone and the buyer never meets the stayer.
  const at = (a: AuctionView, id: string) => a.walkers.find((w) => w.id === id)?.at ?? NaN;
  await walkUntil(truth, stayer, 'up', (a) => Math.round(at(a, stayerId)) >= Math.round(at(a, sellerId)) + 2, `B-AC-1: ${stayer.name} walks up over ${seller.name}`);
  const view = truth.board();
  const a = view.auction;
  check(a?.stage === 'walk', `the server is walking, got ${a?.stage}`);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const ask = a.walkers.filter((w) => w.side === 'seller' && (w.units ?? 1) > 0).sort((x, y) => x.at - y.at)[0];
  const bid = a.walkers.filter((w) => w.side === 'buyer').sort((x, y) => y.at - x.at)[0];
  check(ask && bid && ask.id === sellerId && bid.id === buyerId, `${seller.name} holds the lowest ask and ${buyer.name} the highest bid, got ${ask?.id} and ${bid?.id}`);
  const tvAsk = bestOffer(a, 'seller', name, truth.houseOrder());
  const tvBid = bestOffer(a, 'buyer', name, truth.houseOrder());
  await untilShows(theTv, readReadout, [`${tvAsk.price} · ${tvAsk.who}`, `${tvBid.price} · ${tvBid.who}`], "B-AC-1, G-4: the TV's readout names who holds each line, the store and the ship counted");
  check(await tv.getByTestId('tv-walk').isVisible(), "the TV's walk stage carries tv-walk");
  await truth.held(async () => {
    await readTheWalkWords(phones, truth, name);
    await smallPhoneReads(buyer, 'walk');
  });
  const tags = { ask: String(ask.price), bid: String(bid.price), gap: `${ask.price - bid.price} APART` };
  await Promise.all(screens.map((s) => untilShows(s, readTags, tags, "B-AC-1: the lines sit at the server's lowest ask and highest bid, with the gap between them")));
  console.log(
    `✓ B-AC-1 (WS6): ${a.good} walk, the red line tagged ${ask.price} and the green ${bid.price}, "${tags.gap}", on three phones and the TV; the TV's readout names ${tvAsk.who} and ${tvBid.who}`,
  );

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
  console.log(`✓ HC-2 (WS6): the TV draws one units label per walker, each equal to their ${a.good} stock, ${JSON.stringify(before)}`);

  // The buyer stops at the store's selling line, under every ask, and buys the store out from there.
  const tradeBudget = within(SCALE, WALK.goodMs);
  await walkUntil(truth, buyer, 'up', (x) => x.deals.some((d) => d.seller === 'store' && d.buyer === buyerId), `B-AC-3: ${buyer.name} walks up to the store's line and buys`);
  await untilServer(truth, buyer.page, (x) => x.storeForSale === 0 && x.deals.length === 0, `B-AC-3: ${buyer.name} buys the store out`, tradeBudget);
  await storeShows(0, null);

  const giveWay = Promise.all(screens.map((s) => linesGiveWayToTheTrade(s, tradeBudget)));
  giveWay.catch(() => undefined);
  await walkUntil(truth, seller, 'down', (x) => x.deals.some((d) => d.seller === sellerId && d.buyer === buyerId), `B-AC-1: ${seller.name} walks down to ${buyer.name}'s bid and they trade`);
  await giveWay;
  console.log(`✓ B-AC-1 (WS6): while ${seller.name} and ${buyer.name} trade, neither line nor the gap is drawn on any phone or the TV`);

  const traded = await untilServer(truth, tv, (x) => x.deals.length === 0, `B-AC-2: ${seller.name} and ${buyer.name}'s trade ends`, tradeBudget);
  check(traded.good === a.good && traded.stage === 'walk', `the ${a.good} walk goes on after the trade, got ${traded.good} ${traded.stage}`);
  const after = unitsFromTheServer(truth, phones);
  for (const id of [sellerId, buyerId]) check(after[id] !== before[id], `${name(id)}'s label changed in the trades: ${before[id]} → ${after[id]}`);
  await Promise.all(screens.map((s) => untilShows(s, readUnits, after, "B-AC-2: units and surplus under the creatures after the trade, from the engine's stock")));
  const zero = Object.values(after).some((l) => l.endsWith(' (0)'));
  const moved = (id: string) => `${name(id)} ${before[id]} → ${after[id]}`;
  console.log(`✓ B-AC-2 (WS6): after ${traded.units} units traded, ${moved(sellerId)} and ${moved(buyerId)} on three phones and the TV${zero ? ', a surplus of 0 drawn "(0)"' : ''}`);
}

const fmtCr = (n: number) => Math.round(n).toLocaleString('en');
const signedCr = (n: number) => (n > 0 ? `+${fmtCr(n)}` : n < 0 ? `−${fmtCr(-n)}` : '±0');

/**
 * A-5 (UX audit G-5, mock #audit-auction-receipt): when the good walked in readTheGoodsWalk closes, the seller's phone
 * shows "Food: you sold N for X cr" with the sales tax spelled out, the buyer's "you bought", each header the month's
 * total from the server, and the TV the close stage, with no seat's receipt on it. Read with the room held, since the
 * close stage lasts WALK.closeMs of game time.
 */
async function readTheReceipt(cast: { seller: Phone; buyer: Phone }, tv: Page, truth: Truth): Promise<void> {
  const { seller, buyer } = cast;
  const walked = truth.board().auction;
  check(walked?.stage === 'walk', `A-5 starts on a walk, got ${walked?.stage}`);
  const good = walked.good;
  await untilServer(truth, tv, (a) => a.good === good && a.stage === 'close', `A-5: ${GOOD_NAME[good]}'s walk ends in the close stage`, within(SCALE, WALK.goodMs + WALK.statusMs));
  await truth.held(async () => {
    const sold = truth.auctionOf(seller)!.receipt!.sold;
    const bought = truth.auctionOf(buyer)!.receipt!.bought;
    check(sold.units > 0 && bought.units > 0, `A-5 needs ${seller.name} to have sold and ${buyer.name} to have bought, got ${sold.units} and ${bought.units}`);
    const net = sold.gross - sold.tax;
    const text = async (p: Page, id: string) => (await p.getByTestId(id).first().innerText({ timeout: PRESS_MS })).replace(/\s+/g, ' ').trim();
    const sellerTitle = await text(seller.page, 'receipt-title-sold');
    check(sellerTitle === `${GOOD_NAME[good]}: you sold ${sold.units} for ${fmtCr(net)} cr`, `A-5: ${seller.name}'s receipt says what he sold after tax, got "${sellerTitle}"`);
    const tax = await text(seller.page, 'receipt-tax');
    const taxWords = `${fmtCr(sold.gross)} cr, less ${fmtCr(sold.tax)} cr sales tax: ${fmtCr(net)} The tax goes to the colony fund.`;
    check(tax === taxWords, `A-5: ${seller.name}'s receipt spells out the tax, "${taxWords}", got "${tax}"`);
    const buyerTitle = await text(buyer.page, 'receipt-title-bought');
    check(buyerTitle === `${GOOD_NAME[good]}: you bought ${bought.units} for ${fmtCr(bought.gross)} cr`, `A-5: ${buyer.name}'s receipt says what she bought, got "${buyerTitle}"`);
    check((await buyer.page.getByTestId('receipt-tax').count()) === 0, `A-5: ${buyer.name}'s purchase has no tax line`);
    for (const p of [seller, buyer]) {
      // The words and the number sit side by side in a flex row: innerText may or may not put a space between them.
      const tally = (await text(p.page, 'receipt-tally')).replace(/^This month: ?/, 'This month: ');
      const want = `This month: ${signedCr(truth.auctionOf(p)!.tally!)} cr`;
      check(tally === want, `A-5: ${p.name}'s receipt ends with the month's total "${want}", got "${tally}"`);
      check((await p.page.locator('[data-testid=guide] > header').getByText(/this month/i).count()) === 0, `A-5: ${p.name}'s header shows the money only`);
    }
    await tv.locator('[data-phase=auction][data-stage=close]').waitFor({ timeout: PRESS_MS });
    const stage = await text(tv, 'tv-stage');
    check(stage === 'Closed', `A-5: the TV names the close stage, got "${stage}"`);
    check((await tv.getByTestId('receipt').count()) === 0, "A-5: the TV shows no seat's receipt");
    console.log(`✓ A-5: ${GOOD_NAME[good]} closed: "${sellerTitle}" with "${tax}" on ${seller.name}'s phone, "${buyerTitle}" on ${buyer.name}'s, the month's totals on both receipts, and "Closed" on the TV`);
  });
}

/** The best price a walker on `side` can meet, the store and the ship counted, and who holds it, as the TV names them. */
function bestOffer(a: AuctionView, side: 'seller' | 'buyer', name: (id: string) => string, houses: string[], without?: string): { price: number; who: string; id: string } {
  const named = (id: string) => (id === 'store' ? 'the store' : id === 'ship' ? 'the ship' : name(id));
  const housePays: Record<string, number | null> = { store: a.storeBuys, ship: a.shipPays };
  const list =
    side === 'seller'
      ? [
          ...a.walkers.filter((w) => w.side === 'seller' && w.units > 0 && w.id !== without).map((w) => ({ id: w.id, price: w.price })),
          ...(a.storeSells !== null && a.storeForSale > 0 ? [{ id: 'store', price: a.storeSells }] : []),
        ].sort((x, y) => x.price - y.price)
      : [
          ...a.walkers.filter((w) => w.side === 'buyer' && w.id !== without).map((w) => ({ id: w.id, price: w.price })),
          // In the engine's order, so a stable sort leaves a tie with the house it sells to.
          ...houses.flatMap((id) => (housePays[id] == null ? [] : [{ id, price: housePays[id]! }])),
        ].sort((x, y) => y.price - x.price);
  const best = list[0];
  check(best, `someone stands on the ${side} side of ${a.good}`);
  return { ...best, who: named(best.id) };
}

/** The store's prices as a player can use them: "You can buy from the store at 30 · sell to it at 24". */
function storeFromYourSide(a: AuctionView): string {
  const sells = a.storeSells !== null && a.storeForSale > 0;
  const buy = sells ? `You can buy from the store at ${a.storeSells}` : 'The store has none to sell';
  const sell = a.storeBuys !== null ? `${sells ? 'sell to it' : 'you can sell to it'} at ${a.storeBuys}` : 'it isn’t buying';
  return `${buy} · ${sell}`;
}

const readText = (page: Page, testid: string) => page.getByTestId(testid).first().innerText({ timeout: PRESS_MS }).then((t) => t.replace(/\s+/g, ' ').trim());

/**
 * G-8, G-4 and G-6 on the status screen, held still: the table in plain words, the store's prices from your side on
 * every phone, and, with the ship in port, what it wants on every phone and the TV.
 */
async function readTheStatusWords(phones: Phone[], tv: Page, truth: Truth): Promise<void> {
  const view = truth.board();
  const a = view.auction;
  check(a?.stage === 'status', `the status screen is up, got ${a?.stage}`);
  const store = `${storeFromYourSide(a)}${a.storeForSale > 0 ? ` · it has ${a.storeForSale} for sale` : ''}`;
  const wants = view.ship.wants;
  check(view.ship.inPort && wants, 'G-6 needs the ship in port this month (the fixture brings it in)');
  const order = [a.good, ...a.next];
  const wanted = order.filter((g) => (wants[g] ?? 0) > 0);
  check(wanted.length > 1 && wanted[0] !== a.good, `G-6 needs two or more wanted goods still to come after ${a.good}, wants ${JSON.stringify(wants)}`);
  const head = wanted[0]!;
  const pays = view.market.find((r) => r.good === head)?.shipPays;
  const shipText = `The ship wants ${wants[head]} ${GOOD_NAME[head]} this month. ${GOOD_NAME[head]} comes up after ${GOOD_NAME[order[order.indexOf(head) - 1]!]}: the ship pays ${pays} cr for the first.`;
  const also = alsoSentence(wanted.slice(1).map((g) => ({ good: g, wants: wants[g]! })));
  const tidy = (all: string[]) => all.map((t) => t.replace(/\s+/g, ' ').trim());
  for (const p of phones) {
    const page = p.page;
    // The heads are drawn in capitals: read as shown, any case.
    const heads = (await page.getByTestId('status-table').locator('th').allInnerTexts()).map((t) => t.trim().toLowerCase());
    check(heads.includes('goes bad') && heads.includes('spare') && !heads.some((t) => /spoils|surplus/.test(t)), `G-8: ${p.name}'s status table says "Goes bad" and "Spare", got ${JSON.stringify(heads)}`);
    const mine = await readText(page, 'my-store');
    check(mine === store, `G-4: ${p.name}'s status screen says the store's prices from your side: want "${store}", got "${mine}"`);
    const ships = tidy(await page.getByTestId('ship-wants').allInnerTexts());
    const want = [`${shipText} You have ${truth.stockOf(p, head)}.${also}`];
    check(JSON.stringify(ships) === JSON.stringify(want), `G-6: ${p.name}'s status screen has one ship panel saying what it wants: want ${JSON.stringify(want)}, got ${JSON.stringify(ships)}`);
  }
  check(await tv.getByTestId('tv-status').isVisible(), "the TV's status stage carries tv-status");
  const onTv = tidy(await tv.getByTestId('ship-wants').allInnerTexts());
  check(JSON.stringify(onTv) === JSON.stringify([`${shipText}${also}`]), `G-6: the TV's status screen has one ship panel: want ${JSON.stringify([`${shipText}${also}`])}, got ${JSON.stringify(onTv)}`);
  await checkTvStatusRoom(tv, a.good, false);
  console.log(`✓ G-8, G-4, G-6: ${a.good}'s status screen says "Goes bad" and "Spare" and "${store}" on three phones; one ship panel, "${shipText}${also}", on the phones and the TV`);
}

/** Lines said at the table in month 1's planning, so the TV's header ticker shows its full three through the auction. */
const TABLE_TALK = ['Anyone need Water? Cheap today.', 'Smithore is going to spike, I hear.', 'The ship is in: hold your Crystite.'];

/** Says TABLE_TALK from `phone`'s Talk desk, then waits until the TV's ticker shows three lines. */
async function fillTheTvTicker(phone: Page, tv: Page): Promise<void> {
  const planning = phone.locator('[data-phase=planning]');
  await planning.waitFor({ timeout: PRESS_MS * 5 });
  await planning.getByTestId('desk-talk').click({ timeout: PRESS_MS });
  for (const line of TABLE_TALK) {
    await planning.getByPlaceholder('Say something to everyone').fill(line);
    await planning.getByRole('button', { name: 'Send' }).click({ timeout: PRESS_MS });
    await tv.getByTestId('chat-ticker').getByText(line).waitFor({ timeout: PRESS_MS });
  }
  const lines = await tv.locator('[data-testid=chat-ticker] [data-testid^=chat-line-]').count();
  check(lines === 3, `the TV's chat ticker shows three lines, got ${lines}`);
}

/**
 * The TV's status stage at 1920×1080 with its chat ticker full: the store box keeps its prices, the ship panel ends
 * inside the screen and the TV's frame with its words whole, and a skipped line sits in the time bar's row, on one line.
 */
async function checkTvStatusRoom(tv: Page, good: Good, skipped: boolean): Promise<void> {
  const room = (await tv.evaluate(`(() => {
    const box = (id) => { const el = document.querySelector('[data-testid=' + id + ']'); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, full: el.scrollHeight <= el.clientHeight + 1 }; };
    const store = document.querySelector('[data-testid=status-store]').getBoundingClientRect();
    const prices = [...document.querySelectorAll('[data-testid=status-store] dd')].map((dd) => dd.getBoundingClientRect());
    const skip = document.querySelector('[data-testid=tv-status] [data-testid=skipped]');
    const cs = skip && getComputedStyle(skip);
    return {
      store: { ...box('status-store'), pricesShown: prices.length === 3 && prices.every((p) => p.height > 0 && p.top >= store.top - 0.5 && p.bottom <= store.bottom + 0.5) },
      ship: box('ship-wants'),
      frame: box('tv-status'),
      bar: box('time-bar'),
      skipped: skip ? { ...box('skipped'), oneLine: cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis', lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 } : null,
      ticker: document.querySelectorAll('[data-testid=chat-ticker] [data-testid^=chat-line-]').length,
      w: window.innerWidth,
      h: window.innerHeight,
    };
  })()`)) as {
    store: { height: number; full: boolean; pricesShown: boolean };
    ship: { top: number; bottom: number; left: number; right: number; full: boolean };
    frame: { bottom: number };
    bar: { top: number; bottom: number; right: number };
    skipped: { top: number; bottom: number; left: number; height: number; oneLine: boolean; lineHeight: number } | null;
    ticker: number;
    w: number;
    h: number;
  };
  const where = room.skipped ? `; skipped words y ${room.skipped.top.toFixed(0)}–${room.skipped.bottom.toFixed(0)}, the time bar y ${room.bar.top.toFixed(0)}–${room.bar.bottom.toFixed(0)}` : '';
  console.log(
    `  TV on ${GOOD_NAME[good]} at ${room.w}×${room.h}, ${room.ticker} chat lines in the ticker: store box ${room.store.height.toFixed(1)} px tall${room.store.full && room.store.pricesShown ? ', prices whole' : ', prices cut'}; ship panel y ${room.ship.top.toFixed(0)}–${room.ship.bottom.toFixed(0)} (the TV's frame ends at ${room.frame.bottom.toFixed(0)}), x ${room.ship.left.toFixed(0)}–${room.ship.right.toFixed(0)}${where}`,
  );
  check(room.ticker === 3, `G-6 is read with the TV's chat ticker full: 3 lines, got ${room.ticker}`);
  check(room.store.full && room.store.pricesShown && room.store.height >= TV_STORE_MIN, `G-6: the TV's store box keeps its prices beside the ship panel and a full ticker: ${room.store.height} px, prices ${room.store.pricesShown && room.store.full ? 'whole' : 'cut'}`);
  check(
    room.ship.top >= 0 && room.ship.left >= 0 && room.ship.bottom <= Math.min(room.h, room.frame.bottom + 0.5) && room.ship.right <= room.w && room.ship.full,
    `G-6: on ${GOOD_NAME[good]} the TV's ship panel ends inside the ${room.w}×${room.h} screen and the TV's frame: y ${room.ship.top}–${room.ship.bottom}, frame to ${room.frame.bottom}, its words ${room.ship.full ? 'whole' : 'cut'}`,
  );
  if (!skipped) return;
  const s = room.skipped;
  check(s, `on ${GOOD_NAME[good]} the TV's status stage says which goods were skipped`);
  const mid = (s.top + s.bottom) / 2;
  check(
    mid >= room.bar.top && mid <= room.bar.bottom && s.left >= room.bar.right - 0.5,
    `on ${GOOD_NAME[good]} the TV's skipped words sit in the time bar's row, to its right: y ${s.top}–${s.bottom} beside the bar's ${room.bar.top}–${room.bar.bottom}, x from ${s.left} after the bar's ${room.bar.right}`,
  );
  check(s.oneLine && s.height <= s.lineHeight * 1.5, `on ${GOOD_NAME[good]} the TV's skipped words take one line, cut with an ellipsis: ${s.height} px for a ${s.lineHeight} px line, ${s.oneLine ? 'nowrap with an ellipsis' : 'wrapping'}`);
}

/** The TV's store box on the status stage: a label, a number and its padding, about 78 px; a squeezed box is a few px. */
const TV_STORE_MIN = 60;

/** The ship's other wanted goods in one sentence, as the status screen says it: one with its count, several by name. */
function alsoSentence(also: { good: Good; wants: number }[]): string {
  if (also.length === 0) return '';
  if (also.length === 1) return ` It also wants ${also[0]!.wants} ${GOOD_NAME[also[0]!.good]}.`;
  return ` It also wants ${also.slice(0, -1).map((x) => GOOD_NAME[x.good]).join(', ')} and ${GOOD_NAME[also.at(-1)!.good]}.`;
}

/**
 * G-6 on the wanted good's own status screen: watches month 1's goods after the first; the first wanted good to open
 * its status screen is held still and read on every phone and the TV. Fails if the auction ends without one.
 */
async function readTheShipGoodsOwnStatus(phones: Phone[], tv: Page, truth: Truth): Promise<void> {
  const from = truth.board().auction?.good;
  for (;;) {
    const view = truth.board();
    const a = view.auction;
    check(a, `G-6: a good the ship wants opens its status screen in month 1 (the wishlist is ${JSON.stringify(view.ship.wants)})`);
    const wants = view.ship.inPort ? (view.ship.wants?.[a.good] ?? 0) : 0;
    if (a.good !== from && a.stage === 'status' && wants > 0) {
      await truth.held(async () => {
        const held = truth.board().auction!;
        const pays = held.shipPays ?? view.market.find((r) => r.good === held.good)?.shipPays;
        const line = `The ship wants ${wants} ${GOOD_NAME[held.good]} this month: it pays ${pays} cr for the first.`;
        const also = alsoSentence(held.next.filter((g) => (view.ship.wants?.[g] ?? 0) > 0).map((g) => ({ good: g, wants: view.ship.wants![g]! })));
        const panel = async (page: Page) => {
          const all = await page.getByTestId('ship-wants').allInnerTexts();
          check(all.length === 1, `G-6: one ship panel on ${GOOD_NAME[held.good]}'s own status screen, got ${all.length}`);
          return all[0]!.replace(/\s+/g, ' ').trim();
        };
        await Promise.all([...phones.map((p) => p.page), tv].map((page) => page.getByTestId('ship-wants').first().waitFor({ timeout: PRESS_MS })));
        for (const p of phones) {
          const got = await panel(p.page);
          const want = `${line} You have ${truth.stockOf(p, held.good)}.${also}`;
          check(got === want, `G-6: on ${GOOD_NAME[held.good]}'s own status screen ${p.name}'s phone says "${want}", got "${got}"`);
        }
        const onTv = await panel(tv);
        check(onTv === `${line}${also}`, `G-6: on ${GOOD_NAME[held.good]}'s own status screen the TV says "${line}${also}", got "${onTv}"`);
        check(held.skipped.length > 0, `G-6 reads ${GOOD_NAME[held.good]}'s own status screen with a skipped good above it, got none skipped`);
        await checkTvStatusRoom(tv, held.good, true);
        console.log(`✓ G-6: on ${GOOD_NAME[held.good]}'s own status screen, "${line}" on three phones (with what each has) and the TV`);
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

/**
 * G-2, G-3 and G-4 on the walk, held still: the walk buttons say Hold, the hint names the price to walk to and who
 * stands there, and over the board the store's prices from your side.
 */
async function readTheWalkWords(phones: Phone[], truth: Truth, name: (id: string) => string): Promise<void> {
  const a = truth.board().auction;
  check(a?.stage === 'walk', `the walk is up, got ${a?.stage}`);
  const store = storeFromYourSide(a);
  for (const p of phones) {
    const id = truth.idOf(p);
    const side = a.walkers.find((w) => w.id === id)?.side;
    check(side === 'buyer' || side === 'seller', `${p.name} walks, got ${side}`);
    const page = p.page;
    const holds = [await readText(page, 'hold-up'), await readText(page, 'hold-down')];
    check(holds[0] === 'Hold ▲ to walk up' && holds[1] === 'Hold ▼ to walk down', `G-2: ${p.name}'s walk buttons say Hold, got ${JSON.stringify(holds)}`);
    const how = await readText(page, 'hint-how');
    const wantHow = side === 'buyer' ? 'Hold ▲ to walk up.' : 'Hold ▼ to walk down.';
    check(how === wantHow, `G-2: ${p.name}'s hint says "${wantHow}", got "${how}"`);
    // A buyer meets the cheapest seller, a seller the best payer: from where this player stands, never themselves.
    const best = bestOffer(a, side === 'buyer' ? 'seller' : 'buyer', name, truth.houseOrder(), id);
    const line = await readText(page, 'hint-line');
    const where = best.id === 'store' ? 'the store' : best.id === 'ship' ? 'the ship' : `${best.who}’s ${side === 'buyer' ? 'ask' : 'bid'}`;
    const names = line.startsWith(side === 'buyer' ? 'Walk up' : 'Walk down') && line.includes(where) && new RegExp(`\\b${best.price}\\b`).test(line);
    check(names, `G-3: ${p.name}'s hint names ${where} at ${best.price}, got "${line}"`);
    const said = await readText(page, 'store-words');
    check(said === store, `G-4: over ${p.name}'s board, "${store}", got "${said}"`);
    check((await page.getByTestId('tv-readout').count()) === 0, `G-4: ${p.name}'s phone has no LOWEST ASK readout, the hint says it`);
    console.log(`  ${p.name}: "${line}" / "${how}"`);
  }
  console.log(`✓ G-2, G-3, G-4: on three phones the walk buttons say Hold, each hint names its line, and "${store}" over the board`);
}

/**
 * The goods auction on the small landscape phone (667×375) and the base one (844×390), held still: the status table
 * fits its space, and no text in the stage or the rail is under MIN_TEXT px. Prints every read; leaves the phone at PHONE.
 */
async function smallPhoneReads(p: Phone, stage: 'status' | 'walk'): Promise<void> {
  const scope = { roots: ['[data-testid=stage]', '[data-testid=rail]', '[data-testid=actions]'], skip: ['[data-testid=table-chat]'] };
  for (const size of [PHONE_SMALL.viewport, PHONE.viewport]) {
    await p.page.setViewportSize(size);
    await p.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // The cast's names are short; every other player is read under the longest AI name, as a game with AIs shows it.
    await p.page.evaluate(`(${LONG_NAMES_ON})(${JSON.stringify(LONGEST_AI)})`);
    try {
      const read = (await p.page.evaluate(`(${AUDIT_JS})(${JSON.stringify(scope)})`)) as AuditRead;
      const small = read.fails.filter((f) => /: text [\d.]+ px /.test(f));
      // A long name in the names strip ends in an ellipsis by design; NAMES_ONE_LINE reads it.
      const cut = read.fails.filter((f) => /(walk-names|limit-|units-|walker-)/.test(f) && !/^walk-names span "[^"]*": truncated /.test(f));
      const at = `${size.width}×${size.height}`;
      console.log(`  ${stage} at ${at}: ${read.fails.length ? read.fails.join('; ') : 'nothing broken'}`);
      check(small.length === 0, `the goods auction's ${stage} at ${at} has text under ${MIN_TEXT} px: ${small.join('; ')}`);
      check(cut.length === 0, `the goods auction's ${stage} at ${at}: the board shows every label whole: ${cut.join('; ')}`);
      if (stage === 'status') {
        const fit = await p.page.getByTestId('status-table').evaluate((t) => {
          const box = t.parentElement!;
          return { table: Math.round(t.getBoundingClientRect().width), space: box.clientWidth, scrolls: box.scrollWidth > box.clientWidth + 1 };
        });
        console.log(`  status table at ${at}: ${fit.table} px wide in ${fit.space} px${fit.scrolls ? ', scrolls sideways' : ''}`);
        check(!fit.scrolls && fit.table <= fit.space + 1, `the status table fits its space at ${at}: ${fit.table} px in ${fit.space}`);
      } else {
        const names = (await p.page.evaluate(NAMES_ONE_LINE)) as string[];
        console.log(`  names strip at ${at}: ${names.length ? names.join('; ') : 'every name on one line, a long one ending in an ellipsis'}`);
        check(names.length === 0, `the board's names strip at ${at}: one line each, an ellipsis where cut, never clipped mid-word: ${names.join('; ')}`);
        const overlaps = (await p.page.evaluate(BOARD_LABEL_OVERLAPS)) as string[];
        console.log(`  board labels at ${at}: ${overlaps.length ? overlaps.join('; ') : 'none overlap'}`);
        check(overlaps.length === 0, `the board's labels at ${at} don't overlap: ${overlaps.join('; ')}`);
      }
    } finally {
      await p.page.evaluate(LONG_NAMES_OFF);
    }
  }
  await p.page.setViewportSize(PHONE.viewport);
}

const LONGEST_AI = AI_NAMES.reduce((a, b) => (b.length > a.length ? b : a));

/** In the page: writes `name` over every other player's name in the status table and the board's names strip, keeping what was there. */
const LONG_NAMES_ON = `(name) => {
  const els = [...document.querySelectorAll('[data-testid=status-table] tbody td:first-child span.truncate, [data-testid=walk-names] > span > span:nth-child(2)')].filter((el) => el.textContent !== 'You');
  window.namesWere = els.map((el) => [el, el.textContent]);
  for (const el of els) el.textContent = name;
}`;
const LONG_NAMES_OFF = `(() => { for (const [el, text] of window.namesWere || []) el.textContent = text; window.namesWere = []; })()`;

/** In the page: each name in the board's names strip that takes two lines, or is cut without an ellipsis. */
const NAMES_ONE_LINE = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-testid=walk-names] > span > span:nth-child(2)')) {
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top)));
    if (tops.size > 1) out.push('"' + el.textContent + '" takes ' + tops.size + ' lines');
    if (el.scrollWidth > el.clientWidth + 1 && (cs.textOverflow !== 'ellipsis' || cs.whiteSpace !== 'nowrap')) out.push('"' + el.textContent + '" is clipped without an ellipsis');
  }
  return out;
})()`;

/** In the page: every pair of the board's labels (store lines, units, ASK/BID tags) whose boxes overlap, named. */
const BOARD_LABEL_OVERLAPS = `(() => {
  const labels = [
    ...[...document.querySelectorAll('[data-testid^=limit-] > span')].map((el) => [el.parentElement.dataset.testid, el]),
    ...[...document.querySelectorAll('[data-testid^=units-]')].map((el) => [el.dataset.testid, el]),
    ...[...document.querySelectorAll('[data-testid^=walker-] > span:last-child')].map((el) => [el.parentElement.dataset.testid + ' price', el]),
  ].map(([id, el]) => [id, el.getBoundingClientRect()]);
  const out = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const [a, x] = labels[i], [b, y] = labels[j];
      const w = Math.min(x.right, y.right) - Math.max(x.left, y.left), h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
      if (w > 0.5 && h > 0.5) out.push(a + ' over ' + b + ' (' + w.toFixed(1) + '×' + h.toFixed(1) + ' px)');
    }
  return out;
})()`;

/**
 * FU-1, front to back: with the walk of the good up now running, `holder` holds ArrowUp, presses Done with
 * the key still down and keeps it down through the bell into the next good. On the first later good it can
 * walk (it taps Buy there), its first ArrowUp must move its walker on the server. Everyone then presses
 * Done through the rest of the auction.
 */
async function holdUpIntoTheNextGood(truth: Truth, holder: Phone, others: Phone[]): Promise<void> {
  const id = truth.idOf(holder);
  const mine = (a: AuctionView) => a.walkers.find((w) => w.id === id);
  const held = truth.board().auction;
  check(held?.stage === 'walk' && mine(held)?.side !== 'pass', `FU-1 needs ${holder.name} on the walking board, got ${held?.good} ${held?.stage} as ${held && mine(held)?.side}`);
  const from = held.good;
  await holder.page.keyboard.down('ArrowUp');
  await untilServer(truth, holder.page, (a) => a.good === from && mine(a)?.dir === 1, `FU-1: ${holder.name}'s ArrowUp walks her up on ${from}`);
  const rest = Promise.all(others.map((p) => pressDoneThroughTheAuction(p.page)));
  rest.catch(() => undefined);
  await holder.page.getByTestId('done').click({ timeout: PRESS_MS });

  const toNext = within(SCALE, WALK.goodMs + WALK.statusMs);
  for (let n = 0; ; n++) {
    check(n < 10, `FU-1: a good after ${from} has a walk ${holder.name} can join`);
    const status = await untilServer(truth, holder.page, (a) => a.good !== from && a.stage === 'status', `FU-1: a good after ${from} opens its status screen`, toNext);
    const good = status.good;
    if (mine(status)?.side !== 'buyer') await holder.page.getByTestId('side-buyer').click({ timeout: PRESS_MS });
    await untilServer(truth, holder.page, (a) => a.good !== good || mine(a)?.side === 'buyer', `FU-1: ${holder.name} buys on ${good}`);
    try {
      await holder.page.locator('[data-phase=auction]').getByRole('button', { name: 'Ready' }).click({ timeout: PRESS_MS });
    } catch (err) {
      // The status clock closed it under the press; the wait below sees where it went.
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
    const next = await untilServer(truth, holder.page, (a) => a.good !== good || a.stage === 'walk', `FU-1: ${good}'s status screen closes`, toNext);
    if (next.good !== good || mine(next)?.side !== 'buyer') continue;
    await holder.page.locator('[data-testid=hold-up]:not([disabled])').waitFor({ timeout: PRESS_MS });
    const start = mine(truth.board().auction!)!.at;
    // The same key, never let go since `from`: this keydown is the next good's first press.
    await holder.page.keyboard.down('ArrowUp');
    const moved = await untilServer(truth, holder.page, (a) => a.good === good && (mine(a)?.at ?? start) > start, `FU-1: ${holder.name}'s first ArrowUp on ${good}, after holding it through ${from}'s bell, moves her walker from ${start.toFixed(1)}`);
    await holder.page.keyboard.up('ArrowUp');
    console.log(`✓ FU-1: ${holder.name} held Up through ${from}'s bell; her first press on ${good}'s walk moved her walker ${start.toFixed(1)} → ${mine(moved)!.at.toFixed(1)}`);
    break;
  }
  await Promise.all([rest, pressDoneThroughTheAuction(holder.page)]);
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

/** How long the last phone's Ready takes to land and the next screen to show; planning has no clock. */
const READY_LANDS_MS = 3_000;

/** A budget for the land grant: one pass of its light, which phaseScale never shortens, plus room for the browser and the network. */
const GRANT_WAIT_MS = GRANT_PASS_MAX_MS + 3_000;

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

/**
 * Presses ready through planning, election stages included, until the phone leaves it. Every phone's Done ends a stage
 * early, but the reveal always runs its clock, so the budget is every stage at full length: a slow runner must not fail here.
 */
async function readyInPlanning(page: Page): Promise<void> {
  await readyThroughTheElection(page, within(SCALE, ELECTION_WAIT_MS) + READY_LANDS_MS);
}

/** The month end holds until everyone taps "On to month N", the phone's Ready there (C20). */
async function onToTheNextMonth(page: Page): Promise<void> {
  await page.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS });
}

/**
 * Presses CLAIM until this phone has no claims left or the grant is over (the
 * last claim at the table ends it). Two phones can press on the same lit plot;
 * the loser's press is refused and it tries the next one.
 */
async function claimPlots(page: Page): Promise<void> {
  const claim = page.locator('[data-phase=landGrant]').getByRole('button', { name: /CLAIMS LEFT/ });
  const over = page.locator('[data-phase]:not([data-phase=planning]):not([data-phase=landGrant])');
  await claim.waitFor({ timeout: READY_LANDS_MS });
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

async function goToThePub(page: Page): Promise<void> {
  await page
    .locator('[data-phase=development]')
    .getByRole('button', { name: 'Go to the pub and end your turn' })
    .click({ timeout: GRANT_WAIT_MS });
}

/** The goods auction: press Done at every stage it shows until the phone leaves the auction. */
async function pressDoneThroughTheAuction(page: Page): Promise<void> {
  await page.locator('[data-phase=auction]').waitFor({ timeout: within(SCALE, PHASE_MS.development + PHASE_MS.production) });
  const done = page.locator('[data-phase=auction]').getByRole('button', { name: /^(Ready|Done with .+)$/ });
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

/**
 * Test fixture: the export ship calls this month, so month 1's status screens have it in port. Its wishlist takes
 * Smithore too, the raw good most likely to come up in month 1, so a wanted good's own status screen is reached.
 */
function shipInPortThisMonth(server: MuleServer, code: string): void {
  type Ship = { arrives: number; goods: Good[]; hold: Partial<Record<Good, number>> };
  const room = server.registry.get(code) as unknown as { game: { state: { month: number; players: unknown[]; ship: Ship }; ctx: { changed(): void } } } | undefined;
  check(room, `room ${code} is on the server`);
  const { state } = room.game;
  state.ship.arrives = state.month;
  if (!state.ship.goods.includes('smithore')) state.ship.goods.push('smithore');
  state.ship.hold.smithore ??= Math.ceil((EXPORT_DEMAND.smithore ?? 0) * state.players.length * GAME.exportShipEvery);
  room.game.ctx.changed();
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
