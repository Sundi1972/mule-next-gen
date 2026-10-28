/**
 * B-AC-1, B-AC-6 and UBER-AC-2: two phones and an AI seat play month 1's election on the default server, with the TV,
 * the AI seat running and voting through its own hand, each human Governor candidate on a tax promise,
 * through to the first sale at the auction. Run with `pnpm --filter @mule/web e2e`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { GAME, POLITICS, storeQuotes, WALK, type GameState, type Good, type TaxPromise } from '@mule/engine';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, CLAIM_MS, doneWithLand, held, launch, PHONE, startServer, TV } from './harness';
import { PRESS_MS } from './politics-steps';

const SCALE = 0.25;
/** How long the last phone's Ready takes to land and the land grant to show; planning has no clock. */
const READY_LANDS_MS = 3_000;
/** The rate the new Governor sets: UBER-AC-2's 8%. */
const NEW_TAX = 8;
/** How often the reveal is read on all three screens at once. */
const TICK_MS = 50;
/** B-AC-6: Lena's promise, stepped up from today's tax. */
const LENA_CAP = 8;

type Phone = { page: Page; name: string; runs: MuleIntent[] };

const within = (ms: number) => ms * SCALE + 3_000;

async function main(): Promise<void> {
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
    /** A phone, and every run intent it sends, read off its socket. */
    const phone = async (name: string): Promise<Phone> => {
      const page = await open(name);
      const runs: MuleIntent[] = [];
      page.on('websocket', (ws) =>
        ws.on('framesent', ({ payload }) => {
          const msg = typeof payload === 'string' ? (JSON.parse(payload) as { t?: string; intent?: MuleIntent }) : null;
          if (msg?.t === 'intent' && msg.intent?.type === 'run') runs.push(msg.intent);
        }),
      );
      return { page, name, runs };
    };
    const lena = await phone('Lena');
    await lena.page.getByPlaceholder('Heiko').fill(lena.name);
    await lena.page.getByRole('button', { name: 'Start a new game' }).click();
    await lena.page.getByText("You're at the table").waitFor();
    const code = (await lena.page.getByTestId('room-code').textContent())?.trim() ?? '';
    check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);
    const ossa = await phone('Ossa');
    await ossa.page.goto(`${base}/?room=${code}`);
    await ossa.page.getByPlaceholder('Heiko').fill(ossa.name);
    await ossa.page.getByRole('button', { name: `Join game ${code}` }).click();
    await ossa.page.getByText("You're at the table").waitFor();
    await lena.page.getByRole('button', { name: 'Add AI player' }).click();
    await lena.page.locator('[data-testid=seats] li').nth(2).waitFor();
    const tv = await (await browser.newContext(TV)).newPage();
    tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
    await tv.goto(`${base}/table?room=${code}`);
    await tv.getByTestId('room-code').waitFor();
    await lena.page.getByRole('button', { name: 'Start game' }).click();
    const truth = serverTruth(server, code);
    const phones = [lena, ossa];

    // B-AC-1, B-AC-6: in month 1 both humans run for Governor through the Election day door, each on a promise.
    const [lenaId, ossaId] = [truth.idOf(lena), truth.idOf(ossa)];
    const taxNow = truth.board().politics!.tax.percent;
    check(taxNow < LENA_CAP, `B-AC-6: today's tax ${taxNow}% is under Lena's ${LENA_CAP}%, so she steps the cap up`);
    const promises = () => truth.state().politics!.election!.promises;
    // Every tap below lands inside nominate (about 5 s here), so the game clock is held until the look-around is over.
    // The AI seat acts on that clock too: it runs, if it does, only after the release.
    await held(server, code, async () => {
      await everyone(phones, (p) => p.page.locator('[data-phase=planning]').getByTestId('agenda-election').click({ timeout: 5_000 }));
      await Promise.all([
        (async () => {
          // The cap starts at today's tax; plus steps it to her cap, and Run's label waits for it.
          await lena.page.getByTestId('run-governor').click({ timeout: PRESS_MS });
          check((await lena.page.getByTestId('promise-cap-value').innerText({ timeout: PRESS_MS })).trim() === `${taxNow}%`, `B-AC-6: the cap starts at today's ${taxNow}%`);
          for (let n = taxNow; n < LENA_CAP; n++) await lena.page.getByTestId('promise-cap-plus').click({ timeout: PRESS_MS });
          await lena.page.getByTestId('promise-run').filter({ hasText: `Run, promising “Tax no higher than ${LENA_CAP}%”` }).click({ timeout: PRESS_MS });
        })(),
        (async () => {
          // A Sheriff run is one tap and carries no promise.
          await ossa.page.getByTestId('run-sheriff').click({ timeout: PRESS_MS });
          await ossa.page.getByTestId('running').filter({ hasText: 'You run for Sheriff;' }).waitFor({ timeout: PRESS_MS });
          check(JSON.stringify(ossa.runs) === JSON.stringify([{ type: 'run', office: 'sheriff' }]), `B-AC-6 (negative): a Sheriff run sends no promise, got ${JSON.stringify(ossa.runs)}`);
          // A first look at the picker, then Cancel: nothing is sent.
          await ossa.page.getByTestId('run-governor').click({ timeout: PRESS_MS });
          const pick = ossa.page.getByTestId('promise-pick');
          await pick.waitFor({ timeout: PRESS_MS });
          check(await ossa.page.getByTestId('promise-run').isDisabled(), 'B-AC-6: "Run" waits until a promise is chosen');
          await ossa.page.getByTestId('promise-cancel').click({ timeout: PRESS_MS });
          await pick.waitFor({ state: 'hidden', timeout: PRESS_MS });
          check(ossa.runs.length === 1, `B-AC-6: Cancel sends nothing, got ${JSON.stringify(ossa.runs)}`);
          // Then she runs for Governor instead, holding the tax.
          await ossa.page.getByTestId('run-governor').click({ timeout: PRESS_MS });
          await ossa.page.getByTestId('promise-hold').click({ timeout: PRESS_MS });
          await ossa.page.getByTestId('promise-run').filter({ hasText: 'Run, promising “Hold the tax”' }).click({ timeout: PRESS_MS });
        })(),
      ]);
      const LENA_PROMISE: TaxPromise = { kind: 'cap', percent: LENA_CAP };
      const OSSA_PROMISE: TaxPromise = { kind: 'hold' };
      check(JSON.stringify(lena.runs) === JSON.stringify([{ type: 'run', office: 'governor', promise: LENA_PROMISE }]), `B-AC-6: Lena's phone sends exactly one Governor run with her promise, got ${JSON.stringify(lena.runs)}`);
      check(JSON.stringify(ossa.runs.slice(1)) === JSON.stringify([{ type: 'run', office: 'governor', promise: OSSA_PROMISE }]), `B-AC-6: Ossa's phone then sends one Governor run with her promise, got ${JSON.stringify(ossa.runs)}`);
      await lena.page.getByTestId('running').filter({ hasText: `You run for Governor, promising “Tax no higher than ${LENA_CAP}%”` }).waitFor({ timeout: PRESS_MS });
      await ossa.page.getByTestId('running').filter({ hasText: 'You run for Governor, promising “Hold the tax”' }).waitFor({ timeout: PRESS_MS });
      await everyone(phones, (p) => p.page.getByTestId('candidates').filter({ hasText: lena.name }).filter({ hasText: ossa.name }).waitFor({ timeout: PRESS_MS }));
      const running = truth.board().politics!.election!.candidates.governor;
      const aiIds = truth.board().players.filter((p) => p.isAi).map((p) => p.id);
      check(running.includes(lenaId) && running.includes(ossaId) && running.every((id) => id === lenaId || id === ossaId || aiIds.includes(id)), `B-AC-1: the server has both humans running for Governor, and nobody else but the AI seat, got ${running.join(', ')}`);
      check(JSON.stringify(promises()[lenaId]) === JSON.stringify(LENA_PROMISE) && JSON.stringify(promises()[ossaId]) === JSON.stringify(OSSA_PROMISE), `B-AC-6: the server holds Lena's and Ossa's promises, got ${JSON.stringify(promises())}`);
    });

    // Done with nominate on both phones; the AI seat runs and votes through its own hand. Both humans vote for Lena.
    await everyone(phones, (p) => p.page.getByTestId('ready').click({ timeout: PRESS_MS }));
    await everyone(phones, async (p) => {
      const ballot = p.page.locator('[data-phase=planning]').getByTestId('election');
      // Her row is named for her, then her promise.
      await ballot.getByRole('radio', { name: new RegExp(`^${lena.name}\\b`) }).check({ timeout: within(POLITICS.nominateMs) });
    });
    // B-AC-6: every phone's ballot quotes each Governor candidate's promise, the AI seat's too if it runs; no Sheriff candidate has one.
    const { governor: govs, sheriff: sheriffs } = truth.state().politics!.election!.candidates;
    await everyone(phones, async (p) => {
      for (const id of govs) {
        const line = (await p.page.getByTestId(`promise-${id}`).innerText({ timeout: PRESS_MS })).trim();
        check(line === `“${said(promises()[id]!)}”`, `B-AC-6: ${p.name}'s ballot quotes ${id}'s promise "${said(promises()[id]!)}", got "${line}"`);
      }
      for (const id of sheriffs) check((await p.page.getByTestId(`promise-${id}`).count()) === 0, `B-AC-6 (negative): ${p.name}'s ballot has no promise line for Sheriff candidate ${id}`);
    });
    console.log(`✓ B-AC-6: both phones' ballots quote ${govs.map((id) => `"${said(promises()[id]!)}"`).join(', ')} under the Governor candidates; ${sheriffs.length} Sheriff candidate(s), no promise line`);
    const ballots = () => truth.state().politics!.election!.ballots;
    await untilServer(lena.page, () => (ballots()[lenaId]?.governor === lenaId && ballots()[ossaId]?.governor === lenaId) || null, 'B-AC-1: the server holds both humans\' ballots for Lena');
    // The AI seat may vote before or after the humans, so a phone shows 2 or 3 of 3.
    await everyone(phones, (p) => p.page.getByTestId('voted').filter({ hasText: /\b[23] of 3\b/ }).waitFor({ timeout: PRESS_MS }));
    await everyone(phones, (p) => p.page.getByTestId('ready').click({ timeout: PRESS_MS }));

    // The TV counts down, then every screen shows the same result at the same moment.
    await tv.getByTestId('ballot-countdown').waitFor({ timeout: within(POLITICS.ballotMs) });
    const reveal = await readTheReveal(tv, lena.page, ossa.page, within(POLITICS.revealMs));
    // No wall-clock assertion in CI (lean CI rule 6): "the same moment" is one broadcast to every view, proven by B-AC-1 (server). The ticks are logged.
    // Every ballot cast for Lena, weighted: both humans' and, if it chose her, the AI seat's.
    const weights = truth.board().politics!.weights;
    const forLena = Object.entries(ballots()).filter(([, b]) => b.governor === lenaId).map(([id]) => id);
    check(forLena.includes(lenaId) && forLena.includes(ossaId), `B-AC-1: both humans' ballots count for Lena, got ${forLena.join(', ')}`);
    const expectedVotes = forLena.reduce((sum, id) => sum + weights.find((w) => w.id === id)!.votes, 0);
    const elected = reveal.tv.filter((r) => r.elected);
    check(elected.length === 1 && elected[0]!.id === lenaId, `B-AC-1: the TV names Lena Governor, got ${JSON.stringify(reveal.tv)}`);
    check(elected[0]!.votes === expectedVotes, `B-AC-1: the TV shows Lena's ${expectedVotes} votes (the ${forLena.length} ballots for her, weighted), got ${elected[0]!.votes}`);
    for (const [p, text] of [
      [lena, reveal.lena],
      [ossa, reveal.ossa],
    ] as const) {
      const row = /Governor\s*(.+?)\s*(\d+) votes/.exec(text);
      const name = p === lena ? 'You' : lena.name;
      check(row && row[1] === name && Number(row[2]) === elected[0]!.votes, `B-AC-1: ${p.name}'s phone names ${name} Governor with ${elected[0]!.votes} votes, as the TV does, in the same tick: "${text}"`);
    }
    // B-AC-6: the TV's result quotes Lena's promise under her name; a Sheriff row quotes nothing.
    const lenaRow = reveal.tv.find((r) => r.id === lenaId)!;
    check(lenaRow.text.includes(`${lena.name}“Tax no higher than ${LENA_CAP}%”`), `B-AC-6: the TV's result row for Lena quotes her promise, got "${lenaRow.text}"`);
    check(reveal.sheriff.length > 0 && reveal.sheriff.every((t) => !/[“”]/.test(t)), `B-AC-6 (negative): no Sheriff result row on the TV quotes a promise, got ${JSON.stringify(reveal.sheriff)}`);
    console.log(`✓ B-AC-6: the TV's result shows "${lenaRow.text}"; the Sheriff row(s) carry no promise`);
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
    await everyone(phones, (p) => doneWithLand(p.page));
    await everyone(phones, (p) => goToThePub(p.page));
    await lena.page.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });

    // Lena holds one unit of a good the store buys for 100 cr or more, seeded as the auction opens and before that good
    // comes up, so 7%, 8% and 9% (and the old rate) each take a different tax from the sale.
    const toAuction = within(WALK.statusMs);
    await untilServer(lena.page, () => truth.board().auction?.stage === 'status' || null, 'the goods auction opens on a status screen', toAuction);
    const good = aPinningGood(truth, [start, NEW_TAX - 1, NEW_TAX + 1]);
    holdOneUnit(server, code, lenaId, good);
    const upNext = within(WALK.order.length * (WALK.statusMs + WALK.goodMs / WALK.tradeClockRate));
    await untilServer(lena.page, () => { const a = truth.board().auction; return (a?.good === good && a.stage === 'status') || null; }, `UBER-AC-2: ${good} comes up at the auction`, upNext);
    // With one to spare she opens on Sell; a second tap on Sell would pass.
    const sideOf = () => truth.board().auction?.walkers.find((w) => w.id === lenaId)?.side;
    if (sideOf() !== 'seller') await lena.page.getByTestId('side-seller').click({ timeout: PRESS_MS });
    await untilServer(lena.page, () => sideOf() === 'seller' || null, `UBER-AC-2: Lena sells ${good}`);
    const before = money(await lena.page.getByTestId('money').innerText());
    const paidBefore = truth.taxPaid(lenaId);
    await hold(lena.page, 'down', within(WALK.statusMs));
    await untilServer(lena.page, () => truth.stockOf(lenaId, good) === 0 || null, `UBER-AC-2: Lena sells her one ${good}`, within(WALK.goodMs / WALK.tradeClockRate));
    await lena.page.mouse.up();
    await lena.page.waitForFunction((b) => Number((document.querySelector('[data-testid=money]')?.textContent ?? '').replace(/[^\d-]/g, '')) !== b, before, { timeout: PRESS_MS });
    const after = money(await lena.page.getByTestId('money').innerText());
    // The sale's gross: what reached Lena's phone plus what the fund took from her, measured apart.
    const tax = truth.taxPaid(lenaId) - paidBefore;
    const total = after - before + tax;
    check(total >= 100, `UBER-AC-2: the sale is worth 100 cr or more, so a point of tax shows; got ${total}`);
    check(after - before === total - Math.round(total * (NEW_TAX / 100)), `UBER-AC-2: Lena's phone rose by ${total} − round(${total} × ${NEW_TAX}%) = ${total - Math.round((total * NEW_TAX) / 100)}: ${before} → ${after}`);
    for (const other of [start, NEW_TAX - 1, NEW_TAX + 1]) {
      check(Math.round(total * (other / 100)) !== tax, `UBER-AC-2: at ${total} cr, ${other}% would take a tax other than ${tax}`);
    }
    console.log(`✓ UBER-AC-2: the winner sets 8% and the next auction sale is taxed at 8%: one ${good} sold for ${total}; Lena's phone ${before} → ${after}, ${tax} tax (${start}%, ${NEW_TAX - 1}% and ${NEW_TAX + 1}% would take ${[start, NEW_TAX - 1, NEW_TAX + 1].map((r) => Math.round((total * r) / 100)).join(', ')})`);

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
}

// Rooms keep their phase timers running after the test, so the process ends here.
main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);

type TvRow = { id: string; votes: number; elected: boolean; text: string };

/** RULE-10's words for a promise, as every screen quotes it. */
function said(p: TaxPromise): string {
  return p.kind === 'cap' ? `Tax no higher than ${p.percent}%` : p.kind === 'lower' ? 'Lower the tax' : 'Hold the tax';
}

/**
 * Reads the TV's reveal and both phones' result card in one tick, every TICK_MS, until all three show it.
 * Returns the tick each was first seen at, how far apart those are, and what each showed in the last tick.
 */
async function readTheReveal(tv: Page, a: Page, b: Page, timeout: number): Promise<{ firstTicks: number[]; tv: TvRow[]; sheriff: string[]; lena: string; ossa: string }> {
  const readTv = () => ({
    shown: !!document.querySelector('[data-testid=ballot-reveal]'),
    rows: [...document.querySelectorAll<HTMLElement>('[data-testid^="result-governor-"]')].map((el) => ({
      id: el.dataset.testid!.slice('result-governor-'.length),
      votes: Number(el.querySelector('[data-num]')?.textContent),
      elected: (el.textContent ?? '').includes('ELECTED'),
      text: el.textContent ?? '',
    })),
    sheriff: [...document.querySelectorAll<HTMLElement>('[data-testid^="result-sheriff-"]')].map((el) => el.textContent ?? ''),
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
      return { firstTicks: ticks, tv: t.rows, sheriff: t.sheriff, lena: x.text, ossa: y.text };
    }
    check(Date.now() < deadline, `B-AC-1: the result shows on every screen; seen on TV ${t.shown}, Lena ${x.shown}, Ossa ${y.shown}`);
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

type Truth = { board: () => MuleView; state: () => GameState; idOf: (p: Phone) => string; stockOf: (id: string, good: Good) => number; taxPaid: (id: string) => number };

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
    state,
    stockOf: (id, good) => state().players.find((p) => p.id === id)!.stock[good],
    taxPaid: (id) => state().treasury.paid[id] ?? 0,
  };
}

/**
 * A good still to come at this auction that the store buys at a price where each of `rates` (whole percent)
 * takes a different tax than NEW_TAX does, from the engine's own quote.
 */
function aPinningGood(truth: Truth, rates: number[]): Good {
  const state = truth.state();
  const a = state.auction;
  check(a?.good, 'the goods auction has a good up');
  const later = WALK.order.slice(WALK.order.indexOf(a.good) + 1);
  const pins = (price: number) => price >= 100 && rates.every((r) => Math.round((price * r) / 100) !== Math.round((price * NEW_TAX) / 100));
  const quotes = later.map((g) => [g, storeQuotes(state, g).buy] as const);
  const hit = quotes.find(([, buy]) => buy !== null && pins(buy));
  check(hit, `UBER-AC-2: a good still to come that the store buys for 100 cr or more; quotes ${quotes.map(([g, b]) => `${g} ${b}`).join(', ')}`);
  return hit[0];
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
    await claim.or(over).first().waitFor({ timeout: READY_LANDS_MS + CLAIM_MS });
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
  await page.locator('[data-phase=development]').getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: within(PHASE_MS.development) });
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
