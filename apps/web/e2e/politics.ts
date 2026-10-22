/**
 * B-AC-1 and UBER-AC-2: two phones and an AI seat play month 1's election on the default server, with the TV,
 * through to the first sale at the auction. Run with `pnpm --filter @mule/web e2e`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { GAME, POLITICS, WALK, type GameState, type Good } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, launch, PHONE, startServer, TV } from './harness';

const SCALE = 0.25;
const PRESS_MS = 2_000;
/** The rate the new Governor sets: UBER-AC-2's 8%. */
const NEW_TAX = 8;
/** How often the reveal is read on all three screens at once. */
const TICK_MS = 50;

type Phone = { page: Page; name: string };

const within = (ms: number) => ms * SCALE + 3_000;
const SEED = seedFrom(process.env.MULE_E2E_SEED);
const { server, base } = await startServer({ maxMonths: 1, phaseScale: SCALE, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
try {
  const open = async (name: string) => {
    const page = await (await browser.newContext(PHONE)).newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(base);
    return page;
  };
  const lena: Phone = { page: await open('Lena'), name: 'Lena' };
  await lena.page.getByPlaceholder('Heiko').fill(lena.name);
  await lena.page.getByRole('button', { name: 'Start a new game' }).click();
  await lena.page.getByText("You're at the table").waitFor();
  const code = (await lena.page.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);
  const ossa: Phone = { page: await open('Ossa'), name: 'Ossa' };
  await ossa.page.goto(`${base}/?room=${code}`);
  await ossa.page.getByPlaceholder('Heiko').fill(ossa.name);
  await ossa.page.getByRole('button', { name: `Join game ${code}` }).click();
  await ossa.page.getByText("You're at the table").waitFor();
  await lena.page.getByRole('button', { name: 'Add AI player' }).click();
  await lena.page.locator('[data-testid=seats] li').nth(2).waitFor();
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await lena.page.getByText('Big screen connected').waitFor();
  await lena.page.getByRole('button', { name: 'Start game' }).click();
  const truth = serverTruth(server, code);
  const phones = [lena, ossa];

  // B-AC-1: in month 1 both humans run for Governor through the Election day door.
  await everyone(phones, async (p) => {
    const planning = p.page.locator('[data-phase=planning]');
    await planning.getByTestId('agenda-election').click({ timeout: 5_000 });
    await planning.getByTestId('run-governor').click({ timeout: PRESS_MS });
  });
  const [lenaId, ossaId] = [truth.idOf(lena), truth.idOf(ossa)];
  await everyone(phones, (p) => p.page.getByTestId('candidates').filter({ hasText: lena.name }).filter({ hasText: ossa.name }).waitFor({ timeout: PRESS_MS }));
  check(JSON.stringify([...truth.board().politics!.election!.candidates.governor].sort()) === JSON.stringify([lenaId, ossaId].sort()), 'B-AC-1: the server has both humans running for Governor');

  // Done with nominate on both phones; the AI seat is Done for the server. Then both vote for Lena.
  await everyone(phones, (p) => p.page.getByTestId('ready').click({ timeout: PRESS_MS }));
  await everyone(phones, async (p) => {
    const ballot = p.page.locator('[data-phase=planning]').getByTestId('election');
    await ballot.getByRole('radio', { name: lena.name, exact: true }).check({ timeout: within(POLITICS.nominateMs) });
  });
  await everyone(phones, (p) => p.page.getByTestId('voted').filter({ hasText: `2 of 3` }).waitFor({ timeout: PRESS_MS }));
  const weights = truth.board().politics!.weights;
  const expectedVotes = [lenaId, ossaId].reduce((sum, id) => sum + weights.find((w) => w.id === id)!.votes, 0);
  await everyone(phones, (p) => p.page.getByTestId('ready').click({ timeout: PRESS_MS }));

  // The TV counts down, then every screen shows the same result at the same moment.
  await tv.getByTestId('ballot-countdown').waitFor({ timeout: within(POLITICS.ballotMs) });
  const reveal = await readTheReveal(tv, lena.page, ossa.page, within(POLITICS.revealMs));
  check(reveal.spread <= 1, `B-AC-1: the result appears on the TV and both phones within one tick of each other, first seen at ticks ${reveal.firstTicks.join(', ')}`);
  const elected = reveal.tv.filter((r) => r.elected);
  check(elected.length === 1 && elected[0]!.id === lenaId, `B-AC-1: the TV names Lena Governor, got ${JSON.stringify(reveal.tv)}`);
  check(elected[0]!.votes === expectedVotes, `B-AC-1: the TV shows Lena's ${expectedVotes} votes (both ballots, weighted), got ${elected[0]!.votes}`);
  for (const [p, text] of [
    [lena, reveal.lena],
    [ossa, reveal.ossa],
  ] as const) {
    const row = /Governor\s*(.+?)\s*(\d+) votes/.exec(text);
    const name = p === lena ? 'You' : lena.name;
    check(row && row[1] === name && Number(row[2]) === elected[0]!.votes, `B-AC-1: ${p.name}'s phone names ${name} Governor with ${elected[0]!.votes} votes, as the TV does, in the same tick: "${text}"`);
  }
  console.log(`✓ B-AC-1: both humans run, vote, and see the same result at the same moment: countdown, then Lena Governor with ${expectedVotes} votes on the TV and both phones, first seen at ticks ${reveal.firstTicks.join(', ')}`);

  // The winner's phone opens the tax desk; the other phone has no Governor's desk.
  const taxValue = lena.page.getByTestId('tax-value');
  await taxValue.waitFor({ timeout: within(POLITICS.revealMs) });
  const start = truth.board().politics!.tax.percent;
  check((await taxValue.innerText()).trim() === `${start}%`, `B-AC-1: the tax desk opens at the colony's ${start}%, got "${await taxValue.innerText()}"`);
  check((await ossa.page.getByTestId('desk-governor').count()) === 0, 'B-AC-1 (negative): Ossa, not Governor, has no Governor desk');
  console.log(`✓ B-AC-1: Lena's phone opened the tax desk at ${start}%`);

  // UBER-AC-2: the Governor sets 8%, and everyone's Colony desk says so.
  for (let n = start; n < NEW_TAX; n++) {
    await lena.page.getByTestId('tax-up').click({ timeout: PRESS_MS });
    await taxValue.filter({ hasText: `${n + 1}%` }).waitFor({ timeout: PRESS_MS });
  }
  await lena.page.getByTestId('tax-confirm').click({ timeout: PRESS_MS });
  await untilServer(lena.page, () => truth.board().politics!.tax.percent === NEW_TAX, `UBER-AC-2: the server's sales tax is ${NEW_TAX}%`);
  await ossa.page.getByTestId('desk-colony').click({ timeout: PRESS_MS });
  await ossa.page.getByTestId('tax-readonly').filter({ hasText: `Sales tax ${NEW_TAX}%` }).waitFor({ timeout: PRESS_MS });

  // On to the auction: ready, claim, the pub.
  await everyone(phones, (p) => p.page.getByTestId('ready').click({ timeout: PRESS_MS }));
  await everyone(phones, (p) => claimPlots(p.page));
  await everyone(phones, (p) => goToThePub(p.page));
  await lena.page.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.landGrant + PHASE_MS.development + PHASE_MS.production) });

  // Lena holds exactly one unit of the first good the store buys at a price where the old and the new rate round apart.
  const good = await aTellingGood(lena.page, truth, start / 100);
  holdOneUnit(server, code, lenaId, good);
  await pickSide(lena.page, 'Seller', within(WALK.statusMs + WALK.declareMs));
  const before = money(await lena.page.getByTestId('money').innerText());
  const paidBefore = truth.taxPaid(lenaId);
  await hold(lena.page, 'down', within(WALK.declareMs));
  await untilServer(lena.page, () => truth.stockOf(lenaId, good) === 0, `UBER-AC-2: Lena sells her one ${good}`, within(WALK.goodMs / WALK.tradeClockRate));
  await lena.page.mouse.up();
  await lena.page.waitForFunction((b) => Number((document.querySelector('[data-testid=money]')?.textContent ?? '').replace(/[^\d-]/g, '')) !== b, before, { timeout: PRESS_MS });
  const after = money(await lena.page.getByTestId('money').innerText());
  const tax = truth.taxPaid(lenaId) - paidBefore;
  const price = after - before + tax;
  check(price > 0 && tax === Math.round(price * (NEW_TAX / 100)), `UBER-AC-2: Lena's sale at ${price} is taxed at ${NEW_TAX}%: her phone went ${before} → ${after}, the fund took ${tax}`);
  check(tax !== Math.round(price * (start / 100)), `UBER-AC-2: at ${price} the old ${start}% would have taken a different tax than ${tax}`);
  console.log(`✓ UBER-AC-2: the winner sets 8% and the next auction sale is taxed at 8%: one ${good} sold at ${price}; Lena's phone ${before} → ${after}, ${tax} tax at ${NEW_TAX}%`);

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e politics: ok (room ${code}, seed ${SEED})`);
} catch (err) {
  console.error(`e2e politics: FAILED (seed ${SEED})`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running; the test is over, so stop here.
process.exit(0);

type TvRow = { id: string; votes: number; elected: boolean };

/**
 * Reads the TV's reveal and both phones' result card in one tick, every TICK_MS, until all three show it.
 * Returns the tick each was first seen at, how far apart those are, and what each showed in the last tick.
 */
async function readTheReveal(tv: Page, a: Page, b: Page, timeout: number): Promise<{ firstTicks: number[]; spread: number; tv: TvRow[]; lena: string; ossa: string }> {
  const readTv = () => ({
    shown: !!document.querySelector('[data-testid=ballot-reveal]'),
    rows: [...document.querySelectorAll<HTMLElement>('[data-testid^="result-governor-"]')].map((el) => ({
      id: el.dataset.testid!.slice('result-governor-'.length),
      votes: Number(el.querySelector('[data-num]')?.textContent),
      elected: (el.textContent ?? '').includes('ELECTED'),
    })),
  });
  const readPhone = () => {
    const card = document.querySelector<HTMLElement>('[data-testid=phone-election-result]');
    return { shown: !!card, text: card?.textContent ?? '' };
  };
  const first: (number | null)[] = [null, null, null];
  const deadline = Date.now() + timeout;
  for (let tick = 0; ; tick++) {
    const [t, x, y] = await Promise.all([tv.evaluate(readTv), a.evaluate(readPhone), b.evaluate(readPhone)]);
    [t.shown, x.shown, y.shown].forEach((shown, i) => {
      if (shown && first[i] === null) first[i] = tick;
    });
    if (t.shown && x.shown && y.shown) {
      const ticks = first as number[];
      return { firstTicks: ticks, spread: Math.max(...ticks) - Math.min(...ticks), tv: t.rows, lena: x.text, ossa: y.text };
    }
    check(Date.now() < deadline, `B-AC-1: the result shows on every screen; seen on TV ${t.shown}, Lena ${x.shown}, Ossa ${y.shown}`);
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

type Truth = { board: () => MuleView; idOf: (p: Phone) => string; stockOf: (id: string, good: Good) => number; taxPaid: (id: string) => number };

/** The server's own views and state: the ground truth the screens are checked against. */
function serverTruth(server: MuleServer, code: string): Truth {
  const room = () => {
    const r = server.registry.get(code);
    check(r, `room ${code} is on the server`);
    return r;
  };
  const state = () => (room() as unknown as { game: { state: GameState } }).game.state;
  return {
    board: () => {
      const g = room().viewFor(null).game;
      check(g, `room ${code} has a game running`);
      return g;
    },
    idOf: (p) => {
      const id = room().viewFor(null).seats.find((s) => s.name === p.name)?.id;
      check(id, `${p.name} has a seat`);
      return id;
    },
    stockOf: (id, good) => state().players.find((p) => p.id === id)!.stock[good],
    taxPaid: (id) => state().treasury.paid[id] ?? 0,
  };
}

/**
 * Waits through the goods as they come up until the store buys one at a price where `oldRate` and NEW_TAX round
 * to different taxes, so the sale tells the two apart. Returns it while its status or declare is still on.
 */
async function aTellingGood(page: Page, truth: Truth, oldRate: number): Promise<Good> {
  const telling = (price: number) => Math.round(price * oldRate) !== Math.round(price * (NEW_TAX / 100));
  const seen = new Map<string, number | null>();
  const deadline = Date.now() + within(WALK.order.length * (WALK.statusMs + WALK.declareMs + WALK.goodMs / WALK.tradeClockRate));
  for (;;) {
    const a = truth.board().auction;
    if (a && (a.stage === 'status' || a.stage === 'declare')) {
      if (a.storeBuys !== null && telling(a.storeBuys)) return a.good;
      seen.set(a.good, a.storeBuys);
    }
    check(truth.board().phase === 'auction' && Date.now() < deadline, `UBER-AC-2: a good the store buys at a price that tells ${oldRate * 100}% from ${NEW_TAX}%; saw ${[...seen].map(([g, p]) => `${g} at ${p}`).join(', ')}`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
}

/** Arranges the sale: the seat holds exactly one unit of the good, shown to its phone at once. */
function holdOneUnit(server: MuleServer, code: string, seat: string, good: Good): void {
  const room = server.registry.get(code) as unknown as { game: { state: GameState }; broadcast(): void };
  const p = room.game.state.players.find((q) => q.id === seat);
  check(p, `seat ${seat} in the game`);
  p.stock[good] = 1;
  room.broadcast();
}

/** Waits, a page frame at a time, until `read` gives a value that is not false or null. */
async function untilServer<T>(page: Page, read: () => T | false | null, what: string, timeout = PRESS_MS): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const got = read();
    if (got !== false && got !== null) return got;
    check(Date.now() < deadline, what);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
}

async function everyone(phones: Phone[], step: (p: Phone) => Promise<unknown>): Promise<void> {
  await Promise.all(phones.map(step));
}

/** Presses CLAIM until this phone has no claims left or the grant is over. */
async function claimPlots(page: Page): Promise<void> {
  const claim = page.locator('[data-phase=landGrant]').getByRole('button', { name: /CLAIMS LEFT/ });
  const over = page.locator('[data-phase]:not([data-phase=planning]):not([data-phase=landGrant])');
  for (let tries = 0; ; tries++) {
    check(tries < 40, 'the land grant let this phone claim its plots');
    await claim.or(over).first().waitFor({ timeout: within(PHASE_MS.planning + PHASE_MS.landGrant) });
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
  await page.locator('[data-phase=development]').getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: within(PHASE_MS.landGrant + PHASE_MS.development) });
}

/** Picks a side on the goods auction's declare. */
async function pickSide(page: Page, side: 'Buyer' | 'Seller' | 'Pass', timeout: number): Promise<void> {
  const auction = page.locator('[data-phase=auction]');
  await auction.locator('[role=radio]:not([disabled])', { hasText: side }).click({ timeout });
  await auction.getByRole('radio', { name: side, checked: true, exact: true }).waitFor({ timeout: PRESS_MS });
}

/** Presses and holds Up or Down once the button is enabled. */
async function hold(page: Page, dir: 'up' | 'down', timeout: number): Promise<void> {
  const button = page.locator(`[data-testid=hold-${dir}]:not([disabled])`);
  await button.waitFor({ timeout });
  await button.hover();
  await page.mouse.down();
}

function money(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''));
}

function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
