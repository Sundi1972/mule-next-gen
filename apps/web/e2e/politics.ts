/**
 * B-AC-63, restating UBER-AC-2: two phones and an AI seat play month 1's election on the default server, with the TV,
 * the AI seat running and voting through its own hand. Both humans run in month 1's announce, each on a tax promise;
 * each phone casts, and nothing closes until the last Cast, though Ossa's phone drops first; every screen shows the
 * Governor's ceremony; the promise stays beside the tax; the next sale is taxed at the new Governor's rate.
 * Run with `pnpm --filter @mule/web e2e`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { GAME, POLITICS, storeQuotes, WALK, type GameState, type Good, type TaxPromise } from '@mule/engine';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, CLAIM_MS, doneWithLand, held, launch, PHONE, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS } from './politics-steps';

const SCALE = 0.25;
/** How long the last phone's Ready takes to land and the land grant to show; planning has no clock. */
const READY_LANDS_MS = 3_000;
/** The rate the new Governor sets: UBER-AC-2's 8%. */
const NEW_TAX = 8;
/** How often the ceremony is read on all three screens at once. */
const TICK_MS = 50;
/** How long a ballot with every pick in, but one Cast missing, is watched for staying open: several election ticks. */
const STILL_OPEN_MS = 1_000;
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

    // B-AC-63, T-AC-66: month 1's announce is the time to run. Both humans run for Governor from the run block under
    // Now, each on a promise, while the TV shows the announcement.
    const [lenaId, ossaId] = [truth.idOf(lena), truth.idOf(ossa)];
    const aiIds = truth.board().players.filter((p) => p.isAi).map((p) => p.id);
    const taxNow = truth.board().politics!.tax.percent;
    check(taxNow < LENA_CAP, `B-AC-6: today's tax ${taxNow}% is under Lena's ${LENA_CAP}%, so she steps the cap up`);
    // Politics' until the ballot opens, the election's after.
    const promises = () => {
      const politics = truth.state().politics!;
      return politics.election!.stage === 'announce' ? politics.promises : politics.election!.promises;
    };
    await tv.getByTestId('tv-announce').waitFor({ timeout: 5_000 });
    // Every tap below lands in announce; the game clock is held until the look-around is over, so the AI seat, which
    // acts on that clock, runs (if it does) only after the release.
    await held(server, code, async () => {
      await Promise.all([
        (async () => {
          // The cap starts at today's tax; plus steps it to her cap, and Run's label follows it.
          await lena.page.locator('[data-phase=planning] [data-testid=guide]').getByTestId('run-governor').click({ timeout: 5_000 });
          check((await lena.page.getByTestId('promise-cap-value').innerText({ timeout: PRESS_MS })).trim() === `${taxNow}%`, `B-AC-6: the cap starts at today's ${taxNow}%`);
          for (let n = taxNow; n < LENA_CAP; n++) await lena.page.getByTestId('promise-cap-plus').click({ timeout: PRESS_MS });
          await lena.page.getByTestId('promise-run').filter({ hasText: `Run · up to ${LENA_CAP}%` }).click({ timeout: PRESS_MS });
        })(),
        (async () => {
          // Only the Governor is elected (T-AC-62): no Sheriff run to offer.
          await ossa.page.getByTestId('run-governor').waitFor({ timeout: 5_000 });
          check((await ossa.page.getByTestId('run-sheriff').count()) === 0, 'T-AC-62: the phone offers no Sheriff run');
          // A first look at the sheet, then Cancel: nothing is sent.
          await ossa.page.getByTestId('run-governor').click({ timeout: PRESS_MS });
          const sheet = ossa.page.getByTestId('promise-sheet');
          await sheet.waitFor({ timeout: PRESS_MS });
          const run = (await ossa.page.getByTestId('promise-run').innerText()).trim();
          check(run === `Run · up to ${taxNow}%`, `E-4: the sheet opens on a cap at today's tax, "Run · up to ${taxNow}%", got "${run}"`);
          await ossa.page.getByTestId('promise-cancel').click({ timeout: PRESS_MS });
          await sheet.waitFor({ state: 'hidden', timeout: PRESS_MS });
          check(ossa.runs.length === 0, `B-AC-6: Cancel sends nothing, got ${JSON.stringify(ossa.runs)}`);
          // Then she runs for Governor, holding the tax.
          await ossa.page.getByTestId('run-governor').click({ timeout: PRESS_MS });
          await ossa.page.getByTestId('promise-hold').click({ timeout: PRESS_MS });
          await ossa.page.getByTestId('promise-run').filter({ hasText: `Run · keep it at ${taxNow}%` }).click({ timeout: PRESS_MS });
        })(),
      ]);
      const LENA_PROMISE: TaxPromise = { kind: 'cap', percent: LENA_CAP };
      const OSSA_PROMISE: TaxPromise = { kind: 'hold' };
      check(JSON.stringify(lena.runs) === JSON.stringify([{ type: 'run', office: 'governor', promise: LENA_PROMISE }]), `B-AC-6: Lena's phone sends exactly one Governor run with her promise, got ${JSON.stringify(lena.runs)}`);
      check(JSON.stringify(ossa.runs) === JSON.stringify([{ type: 'run', office: 'governor', promise: OSSA_PROMISE }]), `B-AC-6: Ossa's phone then sends one Governor run with her promise, got ${JSON.stringify(ossa.runs)}`);
      await lena.page.getByTestId('running').filter({ hasText: `You run for Governor, promising up to ${LENA_CAP}% (it's ${taxNow}% now).` }).waitFor({ timeout: PRESS_MS });
      await ossa.page.getByTestId('running').filter({ hasText: `You run for Governor, promising keep it at ${taxNow}%.` }).waitFor({ timeout: PRESS_MS });
      // E-4: every phone's announcement and the TV list both, each on a promise as a change from today.
      await everyone(phones, (p) => p.page.getByTestId(`announce-field-governor-${lenaId}`).filter({ hasText: `up to ${LENA_CAP}% (it's ${taxNow}% now)` }).waitFor({ timeout: PRESS_MS }));
      await everyone(phones, (p) => p.page.getByTestId(`announce-field-governor-${ossaId}`).filter({ hasText: `keep it at ${taxNow}%` }).waitFor({ timeout: PRESS_MS }));
      await tv.getByTestId(`tv-field-governor-${lenaId}`).filter({ hasText: `up to ${LENA_CAP}%` }).waitFor({ timeout: PRESS_MS });
      const running = truth.board().politics!.candidates.governor!;
      check(running.includes(lenaId) && running.includes(ossaId) && running.every((id) => id === lenaId || id === ossaId || aiIds.includes(id)), `B-AC-63: the server has both humans running for Governor, and nobody else but the AI seat, got ${running.join(', ')}`);
      check(JSON.stringify(promises()[lenaId]) === JSON.stringify(LENA_PROMISE) && JSON.stringify(promises()[ossaId]) === JSON.stringify(OSSA_PROMISE), `B-AC-6: the server holds Lena's and Ossa's promises, got ${JSON.stringify(promises())}`);
    });
    console.log(`✓ B-AC-63, T-AC-66: both humans ran in month 1's announce, Lena up to ${LENA_CAP}% and Ossa keeping ${taxNow}%`);

    // Ready to vote on both phones; the AI seat runs and votes through its own hand. Both phones and the TV get the ballot.
    await everyone(phones, (p) => p.page.getByTestId('ready').filter({ hasText: 'Ready to vote' }).click({ timeout: PRESS_MS }));
    const radio = (p: Phone, id: string) => p.page.getByTestId(`ballot-governor-${id}`).locator('input');
    await everyone(phones, (p) => radio(p, lenaId).waitFor({ timeout: within(POLITICS.ai.actMs[1]) }));
    await tv.getByTestId('tv-ballot').waitFor({ timeout: PRESS_MS });
    // B-AC-6: every phone's ballot gives each Governor candidate's promise, the AI seat's too if it runs.
    const govs = truth.state().politics!.election!.candidates.governor;
    await everyone(phones, async (p) => {
      for (const id of govs) {
        const row = (await p.page.getByTestId(`ballot-governor-${id}`).innerText({ timeout: PRESS_MS })).trim();
        check(row.endsWith(said(promises()[id]!, taxNow)), `B-AC-6: ${p.name}'s ballot gives ${id}'s promise "${said(promises()[id]!, taxNow)}", got "${row}"`);
      }
    });
    console.log(`✓ B-AC-6: both phones' ballots give ${govs.map((id) => `"${said(promises()[id]!, taxNow)}"`).join(', ')} beside the Governor candidates`);

    // Lena's tax paid adds two votes, so she wins whoever the AI seat votes for, with Ossa abstaining.
    truth.state().treasury.paid[lenaId] = POLITICS.weight.taxPerVote * POLITICS.weight.taxCap;
    const election = () => truth.board().politics!.election!;
    const ballots = () => truth.state().politics!.election!.ballots;
    const cast = lena.page.getByTestId('ready').filter({ hasText: 'Cast my vote' });
    check(await cast.isDisabled(), 'AM-21: Cast my vote waits for a pick');
    await radio(lena, lenaId).check({ timeout: PRESS_MS });
    await untilServer(lena.page, () => ballots()[lenaId]?.governor === lenaId || null, "B-AC-63: the server holds Lena's ballot for herself");
    check(!election().done.includes(lenaId), 'AM-21: picking alone is not Done');
    await cast.click({ timeout: PRESS_MS });
    await untilServer(lena.page, () => election().done.includes(lenaId) || null, 'B-AC-63: Lena has cast her vote');

    // B-AC-63, HC-64: Ossa's phone drops before she casts. Once the AI seat has voted the ballot still waits for her.
    const ossaUrl = ossa.page.url();
    await ossa.page.goto('about:blank');
    const seatOf = (id: string) => truth.room().viewFor(null).seats.find((seat) => seat.id === id);
    await untilServer(lena.page, () => seatOf(ossaId)?.connected === false || null, "the server sees Ossa's phone drop");
    await untilServer(lena.page, () => aiIds.every((id) => election().done.includes(id)) || null, 'B-AC-63: the AI seat casts', within(POLITICS.ai.actMs[1]));
    await lena.page.getByTestId(`waiting-${ossaId}`).filter({ hasText: 'AWAY' }).waitFor({ timeout: PRESS_MS });
    check(election().stage === 'ballot', `B-AC-63: with everyone else cast the ballot still waits for Ossa, got ${election().stage}`);
    check(JSON.stringify(election().waitingFor) === JSON.stringify([ossaId]), `B-AC-63: every screen is told it waits for Ossa, got ${JSON.stringify(election().waitingFor)}`);
    // She comes back and abstains: picking is still not Done, so nothing closes until her Cast.
    await ossa.page.goto(ossaUrl);
    await untilServer(lena.page, () => seatOf(ossaId)?.connected === true || null, "Ossa's phone is back", within(PRESS_MS));
    await ossa.page.getByTestId('ballot-governor-abstain').locator('input').check({ timeout: PRESS_MS * 2 });
    await ossa.page.waitForTimeout(STILL_OPEN_MS);
    check(election().stage === 'ballot', `B-AC-63: Ossa's pick alone closes nothing, got ${election().stage}`);
    await ossa.page.getByTestId('ready').filter({ hasText: 'Cast my vote' }).click({ timeout: PRESS_MS });
    await untilServer(lena.page, () => election().stage === 'ceremony' || null, "B-AC-63: the ballot closes at Ossa's Cast, the last one");
    console.log(`✓ B-AC-63: each phone cast; the ballot waited for Ossa's dropped phone, her pick alone closed nothing, and her Cast closed it`);

    // B-AC-63, B-AC-62: every screen shows the Governor's ceremony: the TV carries it, both phones say look up and give
    // the result only once the server's clock has reached the winner beat.
    const reveal = await readTheReveal(tv, lena.page, ossa.page, () => election().ceremony?.reached.governor?.beat ?? null, within(ELECTION_WAIT_MS));
    const weights = truth.board().politics!.weights;
    const forLena = Object.entries(ballots()).filter(([, b]) => b.governor === lenaId).map(([id]) => id);
    check(forLena.includes(lenaId) && ballots()[ossaId] === undefined, `B-AC-63: Lena's ballot counts for her and Ossa abstained, got ${JSON.stringify(ballots())}`);
    const expectedVotes = forLena.reduce((sum, id) => sum + weights.find((w) => w.id === id)!.votes, 0);
    check(reveal.congrats.startsWith(`Congratulations, Governor ${lena.name}!`), `B-AC-63: the TV congratulates Governor Lena, got "${reveal.congrats}"`);
    check(reveal.tvVotes[lenaId] === expectedVotes, `B-AC-63: the TV's bar for Lena grows to her ${expectedVotes} votes (the ${forLena.length} ballots for her, weighted), got ${JSON.stringify(reveal.tvVotes)}`);
    for (const [p, text] of [
      [lena, reveal.lena],
      [ossa, reveal.ossa],
    ] as const) {
      const name = p === lena ? 'You' : lena.name;
      check(text.startsWith(`${name}${expectedVotes}ELECTED`), `B-AC-63: ${p.name}'s phone names ${name} Governor with ${expectedVotes} votes, as the TV does: "${text}"`);
    }
    check(reveal.mine, "B-AC-63: Lena's own phone congratulates her");
    check((await tv.locator('[data-testid^="reveal-row-sheriff-"]').count()) === 0 && ![reveal.lena, reveal.ossa].some((t) => t.includes('Sheriff')), 'T-AC-62: no screen names a Sheriff');
    console.log(`✓ B-AC-63: every screen showed the Governor's ceremony: the TV's title, candidates, bars and winner at ticks ${reveal.tvTicks.join(', ')}; both phones the result at ticks ${reveal.phoneTicks.join(', ')}, never before the server's winner beat`);

    // The winner's phone opens the tax desk with her promise above it; the other phone has no Governor's desk and keeps
    // the whole result in its Council desk (E-6).
    const taxValue = lena.page.getByTestId('tax-value');
    await taxValue.waitFor({ timeout: within(ELECTION_WAIT_MS) });
    const start = truth.board().politics!.tax.percent;
    check((await taxValue.innerText()).trim() === `${start}%`, `B-AC-63: the tax desk opens at the colony's ${start}%, got "${await taxValue.innerText()}"`);
    await lena.page.getByTestId('gov-promise').filter({ hasText: `You promised: no higher than ${LENA_CAP}%` }).waitFor({ timeout: PRESS_MS });
    check((await ossa.page.getByTestId('desk-governor').count()) === 0, 'B-AC-63 (negative): Ossa, not Governor, has no Governor desk');
    await ossa.page.getByTestId('result-how-governor').waitFor({ timeout: PRESS_MS });
    // T-AC-70: the promise stands beside the tax on every phone.
    await everyone(phones, (p) => p.page.getByTestId('office-governor').filter({ hasText: `promised up to ${LENA_CAP}%` }).getByTestId('promise-status').filter({ hasText: `tax ${start}%, kept` }).waitFor({ timeout: PRESS_MS }));
    console.log(`✓ B-AC-63: Lena's phone opened the tax desk at ${start}% under her promise; both phones' offices line reads "promised up to ${LENA_CAP}% · tax ${start}%, kept"`);

    // UBER-AC-2: the Governor sets 8%, and everyone's Colony desk says so.
    for (let n = start; n < NEW_TAX; n++) {
      await lena.page.getByTestId('tax-up').click({ timeout: PRESS_MS });
      await taxValue.filter({ hasText: `${n + 1}%` }).waitFor({ timeout: PRESS_MS });
    }
    await lena.page.getByTestId('tax-confirm').filter({ hasText: `Set ${NEW_TAX}%` }).click({ timeout: PRESS_MS });
    await untilServer(lena.page, () => truth.board().politics!.tax.percent === NEW_TAX, `UBER-AC-2: the server's sales tax is ${NEW_TAX}%`);
    await lena.page.getByTestId('gov-done').filter({ hasText: `Done: ${NEW_TAX}% from now on.` }).waitFor({ timeout: PRESS_MS });
    // T-AC-70: the promise stays beside the new tax on every phone.
    await everyone(phones, (p) => p.page.getByTestId('promise-status').filter({ hasText: `tax ${NEW_TAX}%, kept` }).waitFor({ timeout: PRESS_MS }));
    await ossa.page.getByTestId('desk-colony').click({ timeout: PRESS_MS });
    await ossa.page.getByTestId('fund-in').filter({ hasText: `the ${NEW_TAX}% sales tax` }).waitFor({ timeout: PRESS_MS });

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

/** E-4's words for a promise beside a candidate, as every screen gives them. */
function said(p: TaxPromise, tax: number): string {
  return p.kind === 'cap' ? `up to ${p.percent}% (it's ${tax}% now)` : p.kind === 'lower' ? 'lower it' : `keep it at ${tax}%`;
}

type Reveal = { tvTicks: number[]; phoneTicks: number[]; tvVotes: Record<string, number>; congrats: string; lena: string; ossa: string; mine: boolean };

/**
 * Reads the TV's ceremony and both phones' companion every TICK_MS until the TV has congratulated the Governor and
 * both phones give the result. Each beat the TV draws (title, candidates, bars, winner) must be seen; a phone giving the
 * result before the server's clock has reached the winner beat fails. Returns the tick each was first seen at.
 */
async function readTheReveal(tv: Page, a: Page, b: Page, beat: () => string | null, timeout: number): Promise<Reveal> {
  const readTv = () => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid^="reveal-count-governor-"]')];
    return {
      title: !!document.querySelector('[data-testid=reveal-title]'),
      rows: rows.length,
      votes: Object.fromEntries(rows.map((el) => [el.dataset.testid!.slice('reveal-count-governor-'.length), Number(el.textContent || 0)])),
      congrats: document.querySelector('[data-testid=reveal-congrats]')?.textContent ?? '',
    };
  };
  const readPhone = () => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid^="companion-governor-"]')];
    return {
      lookUp: !!document.querySelector('[data-testid=look-up]'),
      result: rows.map((el) => el.textContent ?? '').join(' | '),
      mine: !!document.querySelector('[data-testid=companion-mine]'),
    };
  };
  const first = { title: -1, candidates: -1, bars: -1, winner: -1, lena: -1, ossa: -1, lenaLooks: -1, ossaLooks: -1 };
  const seen = (key: keyof typeof first, tick: number, now: boolean) => {
    if (now && first[key] < 0) first[key] = tick;
  };
  const deadline = Date.now() + timeout;
  for (let tick = 0; ; tick++) {
    const [t, x, y] = await Promise.all([tv.evaluate(readTv), a.evaluate(readPhone), b.evaluate(readPhone)]);
    // Read after the screens: the clock only runs on, so a screen ahead of it would show here.
    const reached = beat();
    for (const [p, name] of [
      [x, 'Lena'],
      [y, 'Ossa'],
    ] as const) {
      check(!p.result || reached === 'winner' || reached === 'end' || reached === null, `B-AC-62: ${name}'s phone gave the result at the server's ${reached} beat, before the winner`);
    }
    seen('title', tick, t.title);
    seen('candidates', tick, t.rows > 0);
    seen('bars', tick, Object.values(t.votes).some((v) => v > 0));
    seen('winner', tick, t.congrats !== '');
    seen('lena', tick, x.result !== '');
    seen('ossa', tick, y.result !== '');
    seen('lenaLooks', tick, x.lookUp);
    seen('ossaLooks', tick, y.lookUp);
    if (t.congrats && x.result && y.result) {
      check(first.title >= 0 && first.candidates >= 0 && first.bars >= 0, `B-AC-63: the TV drew the title, the candidates and the bars before the winner, first seen at ${JSON.stringify(first)}`);
      check(first.lenaLooks >= 0 && first.ossaLooks >= 0, `B-AC-63: both phones said look up at the TV during the ceremony, first seen at ${JSON.stringify(first)}`);
      return { tvTicks: [first.title, first.candidates, first.bars, first.winner], phoneTicks: [first.lena, first.ossa], tvVotes: t.votes, congrats: t.congrats, lena: x.result, ossa: y.result, mine: x.mine };
    }
    check(Date.now() < deadline, `B-AC-63: the result shows on every screen; seen on TV "${t.congrats}", Lena "${x.result}", Ossa "${y.result}"`);
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

type Room = NonNullable<ReturnType<MuleServer['registry']['get']>>;
type Truth = { room: () => Room; board: () => MuleView; state: () => GameState; idOf: (p: Phone) => string; stockOf: (id: string, good: Good) => number; taxPaid: (id: string) => number };

/** The server's own views and state: the ground truth the screens are checked against. */
function serverTruth(server: MuleServer, code: string): Truth {
  const room = () => {
    const r = server.registry.get(code);
    check(r, `room ${code} is on the server`);
    return r;
  };
  const state = () => (room() as unknown as { game: { state: GameState } }).game.state;
  return {
    room,
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
