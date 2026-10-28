/**
 * T-AC-1: a phone plays a whole two-month game, lobby to final scores, against the real server.
 * On the way it proves B-AC-1 (the species you pick is the one you play) and B-AC-4 (the room card with no TV).
 * Run with `pnpm --filter @mule/web e2e`; replay a red run's map with `MULE_E2E_SEED=<seed>`.
 */
import { existsSync } from 'node:fs';
import { WALK } from '@mule/engine';
import { errors as playwrightErrors, type BrowserContext, type Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import { check, CLAIM_MS, claimAPlot, doneWithLand, headerSlot, held, launch, PHONE, startServer, TV, type AuctionSteps, type GameStepContext } from './harness';
import { planningIsTheHub } from './hub-steps';
import { ELECTION_WAIT_MS, readyThroughTheElection } from './politics-steps';
import { checkTheShow, watchShow, type ShowWatch } from './production-steps';
import { fedPlayerSeesNoHunger, hungryPlayerSeesHerPace, makeHungry, outfittersOpenWithAnEmptyMule, storeIsOneHallWithTwoRows, theCorralGlowsWithNoMule, theLedMuleLightsUp } from './store-steps';
import { specialFieldsShowTheirGlyphs } from './special-steps';
import { doneThroughTheElection, doubleTapZoomsToYourLand, moveDialogOpensInProduction, moveDialogOutlivedThePhase, noZoomBeforeYourFirstPlot, thePhonePicksRose, thePhoneShowsItsSelectedPlot, theSeatMovesToAnotherDevice, theTvDrawsRose, theTvShowsWhoOwnsEachPlot, watchIntents, zoomButtonOnceYouOwnAPlot } from './table-steps';

/** Loaded by a path held in a variable, so tsc never resolves a file that may not exist yet. */
async function loadAuctionSteps(): Promise<AuctionSteps> {
  const path = new URL('./auction-steps.ts', import.meta.url);
  if (!existsSync(path)) {
    console.log('auction steps: not present (WS3)');
    return {};
  }
  const steps = (await import(path.href)) as AuctionSteps;
  check(steps.landAuction === undefined || typeof steps.landAuction === 'function', 'auction-steps landAuction is a function');
  check(steps.listedSale === undefined || typeof steps.listedSale === 'function', 'auction-steps listedSale is a function');
  return steps;
}

/** Every phase of months 1 and 2 the phone must show, in order. The last month's upkeep ends straight in game over. */
const MONTH = ['planning', 'landGrant', 'development', 'production', 'auction', 'upkeep'];
const EXPECTED_PHASES = [...MONTH, ...MONTH.slice(0, -1), 'gameOver'];

const PHASE_SCALE = 0.1;
/** A phase's longest run at this scale, plus room for the browser and the network. */
const within = (ms: number) => ms * PHASE_SCALE + 3_000;
/** A good's walk, its clock slowed the whole time by trading. */
const AUCTION_STAGE_MS = within(WALK.goodMs / WALK.tradeClockRate);
const PRESS_MS = 2_000;
/** How long the phone has to find Ready and press its way out of planning, which has no clock and waits for it. */
const READY_MS = 7_500;
/** Once the land grant is over: its land auction, when one runs, and development's first frame. */
const PAST_THE_GRANT_MS = 9_000;
/** The auction offers at most 9 goods of 3 stages each; more Done presses than that means it is not moving on. */
const MAX_AUCTION_PRESSES = 40;
/** The host sits in seat 1. */
const HOST_WALKER = 'walker-s1';
/** The phone's score lines at game over that add up; a Collapse line, when there is one, is taken off them. */
const PART_LINES = ['money', 'goods', 'land', 'mules'] as const;

/** Month 2 of this seed rolls a production event: a run with MULE_E2E_SEED=1 checks the event's show (B-AC-7). */
const SHOW_SEED = 1;
const SEED = seedFrom(process.env.MULE_E2E_SEED);
const steps = await loadAuctionSteps();
const { server, base } = await startServer({ maxMonths: 2, phaseScale: PHASE_SCALE, seed: () => SEED });
const browser = await launch();
/** Every phase the player's devices showed: the phone, and from the move on the second device. */
const seen: Shown[] = [];
const errors: string[] = [];
try {
  let { page: phone, show: phoneShow } = await newPhone('phone');
  const phoneIntents = watchIntents(phone);

  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);
  // B-AC-4: with no big screen, the phone lobby's QR is big enough to scan across the table.
  const qrWidth = async () => (await phone.getByTestId('room-qr').boundingBox())?.width ?? 0;
  const bigQr = await qrWidth();
  check(bigQr >= 100, `B-AC-4: with no big screen the lobby QR is at least 100 px wide, got ${bigQr}`);

  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  const tvShow = await watchShow(tv);
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();
  let ctx: GameStepContext = { phone, tv, check, server, code, held: (step) => held(server, code, step) };

  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  // Once the TV has joined, the card shrinks; the check below fails if it never does.
  await phone
    .waitForFunction(() => (document.querySelector('[data-testid=room-qr]')?.getBoundingClientRect().width ?? Infinity) < 60, null, { timeout: 5_000 })
    .catch(() => undefined);
  const compactQr = await qrWidth();
  check(compactQr > 0 && compactQr < 60, `B-AC-4: with a big screen the lobby shows the compact room card, QR ${compactQr} px`);

  // B-AC-1: the host picks Mollox; the lobby rail and the TV lobby show it, the AI seats keep their defaults.
  const lobbySeats = phone.getByTestId('seats').locator('li');
  const hostMark = lobbySeats.nth(0).getByRole('img', { name: 'Mollox' });
  await phone.getByTestId('species-mollox').click({ timeout: 3_000 });
  await hostMark.waitFor({ timeout: 3_000 });
  check((await phone.getByTestId('species-mollox').getAttribute('aria-pressed')) === 'true', 'B-AC-1: the Mollox chip shows as chosen');
  check((await lobbySeats.nth(1).getByRole('img', { name: 'Bramblet' }).count()) === 1, 'B-AC-1: the first AI (seat 2) keeps its default, Bramblet');
  const tvLobbySeats = tv.locator('li');
  await tvLobbySeats.nth(0).getByRole('img', { name: 'Mollox' }).waitFor({ timeout: 3_000 });
  check((await tvLobbySeats.nth(1).getByRole('img', { name: 'Bramblet' }).count()) === 1, 'B-AC-1: the TV lobby shows the first AI as a Bramblet');
  await thePhonePicksRose(ctx);

  await phone.getByRole('button', { name: 'Start game' }).click();

  // B-AC-1: after Start the host plays a Mollox, on the phone and on the TV's game screen (not its lobby).
  await phone.locator('[data-phase]').getByRole('img', { name: 'You, Mollox', exact: true }).waitFor({ timeout: 5_000 });
  const tvGame = tv.locator('[data-phase]');
  await tvGame.waitFor({ timeout: 5_000 });
  await tvGame.locator('li').filter({ hasText: 'Heiko' }).getByRole('img', { name: 'Mollox' }).first().waitFor({ timeout: 3_000 });
  check((await tvGame.getByRole('img', { name: 'Zipwing' }).count()) === 0, 'B-AC-1: nobody in the TV game plays the seat-1 default, Zipwing');
  check((await tvGame.getByRole('img', { name: 'Bramblet' }).count()) >= 1, 'B-AC-1: the TV game still shows the first AI as a Bramblet');

  // Month 1: the election, then planning's steps, then Ready.
  console.log(`election: ${await doneThroughTheElection(ctx, within(ELECTION_WAIT_MS))}`);
  await theTvDrawsRose(ctx, 'planning');
  await specialFieldsShowTheirGlyphs(ctx);
  await readyThroughTheElection(phone, READY_MS);
  const claim = phone.getByRole('button', { name: /CLAIM/ });
  await claim.waitFor({ timeout: 5_000 });
  check(await claim.isVisible(), 'CLAIM button visible');
  await tv.getByTestId('tv-phase').filter({ hasText: 'Land grant' }).waitFor({ timeout: 3_000 });
  await noZoomBeforeYourFirstPlot(ctx);
  await claimAPlot(phone, CLAIM_MS, 'AM-7: the phone claims a plot in the month-1 land grant');
  await zoomButtonOnceYouOwnAPlot(ctx, phoneIntents);

  // Reload: the phone takes its seat back by itself.
  await phone.reload();
  // The land grant may be over by now; any game screen will do.
  await phone.locator('[data-phase]').waitFor({ timeout: 5_000 });
  check((await phone.getByText("You're at the table").count()) === 0, 'back in the game, not the lobby');

  await pastTheLandGrant(phone);
  await steps.landAuction?.({ phone, tv, check }, 1);
  // B-AC-10 and B-AC-9's fed case as development starts; the phone buys a MULE through the start-of-turn card.
  await storeIsOneHallWithTwoRows(phone, PAST_THE_GRANT_MS);
  // B-AC-15 and B-AC-16: the store says what to do next, and the MULE is a character.
  await theCorralGlowsWithNoMule(phone, server, code);
  await fedPlayerSeesNoHunger(phone, server, code);
  await outfittersOpenWithAnEmptyMule(phone);
  console.log(`store hall fills the stage: ${await theLedMuleLightsUp(phone, server, code)}`);
  await checkOwnsAPlot(phone);
  // B-AC-9 (WS4, plot look A): with a plot of its own selected and its MULE installed, then the TV's map.
  console.log(`plots, phone: ${await thePhoneShowsItsSelectedPlot(ctx)}`);
  console.log(`zoom: ${await doubleTapZoomsToYourLand(ctx, phoneIntents)}`);
  await theTvDrawsRose(ctx, 'development');
  console.log(`plots, TV: ${await theTvShowsWhoOwnsEachPlot(ctx)}`);
  await goToThePub(phone);
  // B-AC-6 and B-AC-8, from what both screens drew of month 1's show.
  await phone.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });
  console.log(`production show, month 1: ${await checkTheShow({ tv: tvShow, phone: phoneShow })}`);
  let measured = false;
  await pressDoneThroughTheAuction(phone, async (button) => {
    if (!measured && button.startsWith('Done with')) measured = await checkTheFloorClearsTheNames(phone, tv);
  });
  check(measured, 'FM-2: the month-1 auction reached a walk to measure');

  // Month 2.
  await phone.locator('[data-phase=planning]').waitFor({ timeout: within(PHASE_MS.upkeep) });
  await steps.listedSale?.({ phone, tv, check });
  makeHungry(server, code);
  // B-AC-14: planning is the hub, its needs read from that seed; with B-AC-12's planning part.
  console.log(`hub: ${await planningIsTheHub(phone, server, code)}`);
  // B-AC-7 (in game): the player moves to a second device, which plays the rest of the game.
  const second = await newPhone('second device');
  console.log(`move: ${await theSeatMovesToAnotherDevice(ctx, second.page)}`);
  ({ page: phone, show: phoneShow } = second);
  ctx = { ...ctx, phone };
  await readyIfStillPlanning(phone);
  await pastTheLandGrant(phone);
  await steps.landAuction?.({ phone, tv, check }, 2);
  await hungryPlayerSeesHerPace(phone, server, code, PAST_THE_GRANT_MS);
  await goToThePub(phone);
  const moveLink = await moveDialogOpensInProduction(ctx, within(PHASE_MS.development));
  // B-AC-6, B-AC-7 and B-AC-8: month 2's show, with the seed's event.
  await phone.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });
  await moveDialogOutlivedThePhase(ctx, moveLink);
  console.log(`production show, month 2: ${await checkTheShow({ tv: tvShow, phone: phoneShow, event: SEED === SHOW_SEED })}`);
  await pressDoneThroughTheAuction(phone);

  // Game over.
  const scores = phone.locator('[data-phase=gameOver] [data-testid=scores]');
  await scores.waitFor({ timeout: 5_000 });
  const rows = await scores.locator('li').allTextContents();
  check(rows.length === 3, `final scores for all three seats, got ${rows.length}`);
  check(rows.some((r) => r.includes('Heiko (you)')), `the human is on the final scores: ${rows.join(' | ')}`);
  await tv.getByTestId('tv-phase').filter({ hasText: 'Game over' }).waitFor({ timeout: 5_000 });
  await checkTheScoresAddUp(phone, tv);

  const phases = seen.map((s) => s.phase);
  check(isSubsequence(EXPECTED_PHASES, phases), `phone showed every phase of months 1 and 2 in order: ${phases.join(' > ')}`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`phases: ${timeline(seen)}`);
  console.log(`e2e smoke: ok (room ${code}, seed ${SEED})`);
} catch (err) {
  console.error(`e2e smoke: FAILED (seed ${SEED})`);
  console.error(`phases so far: ${timeline(seen)}`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running; the test is over, so stop here.
process.exit(0);

/**
 * Presses "I'm ready" while planning still shows. Planning has no clock, so it
 * waits for this press; if a hook already ended it, the press is skipped and
 * the phase-order check still sees planning.
 */
async function readyIfStillPlanning(phone: Page): Promise<void> {
  const ready = phone.locator('[data-phase=planning]').getByRole('button', { name: "I'm ready" });
  const over = phone.locator('[data-phase]:not([data-phase=planning])');
  await ready.or(over).first().waitFor({ timeout: READY_MS });
  if (await over.count()) return;
  try {
    await ready.click({ timeout: PRESS_MS });
  } catch (err) {
    if (err instanceof playwrightErrors.TimeoutError && (await over.count())) return;
    throw err;
  }
}

/** Development: walk out to the map and tap a plot in your colour; the phone calls it yours. */
async function checkOwnsAPlot(phone: Page): Promise<void> {
  const dev = phone.locator('[data-phase=development]');
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: within(PHASE_MS.development) });
  await dev.getByRole('button', { name: /, free\b/ }).first().waitFor({ timeout: 3_000 });
  // The map names each plot's owner by colour slot, counted from 1.
  const mine = dev.getByRole('button', { name: new RegExp(`owned by player ${(await headerSlot(phone, 'T-AC-1')) + 1}\\b`) });
  const plots = await mine.count();
  check(plots >= 1, `T-AC-1: the phone owns a plot before month 2; its map shows ${plots} plots in its colour`);
  await mine.first().click({ timeout: PRESS_MS });
  try {
    await dev.getByText('YOURS', { exact: true }).waitFor({ timeout: PRESS_MS });
  } catch (err) {
    if (err instanceof playwrightErrors.TimeoutError) check(false, 'T-AC-1: the phone calls the plot in its colour YOURS');
    throw err;
  }
}

/** Done with land: the phone presses Ready in the land grant and waits until it has moved past planning and the grant. */
async function pastTheLandGrant(phone: Page): Promise<void> {
  await doneWithLand(phone);
}

/** Development: walk into the pub, which ends the human's turn. */
async function goToThePub(phone: Page): Promise<void> {
  await phone
    .locator('[data-phase=development]')
    .getByRole('button', { name: 'Go to the pub and end your turn' })
    .click({ timeout: within(PHASE_MS.development) });
}

/**
 * The goods auction: press its Done button at every stage it shows ('Ready',
 * 'Done with <Good>') until the phone leaves the auction.
 * `beforePress` gets the button's label first.
 */
async function pressDoneThroughTheAuction(phone: Page, beforePress?: (button: string) => Promise<void>): Promise<void> {
  await phone.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });
  const done = phone.locator('[data-phase=auction]').getByRole('button', { name: /^(Ready|Done with .+)$/ });
  const over = phone.locator('[data-phase]:not([data-phase=auction])');
  for (let pressed = 0; ; pressed++) {
    check(pressed < MAX_AUCTION_PRESSES, `auction still running after ${MAX_AUCTION_PRESSES} Done presses`);
    await done.or(over).first().waitFor({ timeout: AUCTION_STAGE_MS });
    if (await over.count()) return;
    const [showing] = await done.allInnerTexts();
    if (showing !== undefined) await beforePress?.(showing);
    let label: string;
    try {
      // The button was on screen a moment ago, so pressing it is quick or the stage has moved on.
      label = await done.innerText({ timeout: PRESS_MS });
      await done.click({ timeout: PRESS_MS });
    } catch (err) {
      // The stage closed on its own clock under the press; the bounded wait above decides what comes next.
      if (err instanceof playwrightErrors.TimeoutError) continue;
      throw err;
    }
    // Pressed, it turns to 'Done · waiting'; 'Ready' on the status screen stays until the next stage.
    await phone.locator('[data-phase=auction]').getByRole('button', { name: label, exact: true }).waitFor({ state: 'hidden', timeout: AUCTION_STAGE_MS });
  }
}

/**
 * FM-2 during a walk: declares Buyer, which puts the host's walker on the board's floor, then checks that
 * every walker on the phone and the TV clears the names strip. False when the walk closed first, since the
 * host's walker then stands on the next good's board instead.
 */
async function checkTheFloorClearsTheNames(phone: Page, tv: Page): Promise<boolean> {
  try {
    await phone.locator('[data-phase=auction]').getByRole('radio', { name: 'Buyer' }).click({ timeout: PRESS_MS });
    for (const page of [phone, tv]) {
      const host = page.locator(`[data-phase=auction] [data-testid=walk-board] [data-testid=${HOST_WALKER}][data-side=buyer]`);
      await host.waitFor({ timeout: PRESS_MS });
      // A walker that switched sides slides to its new edge; measure where it stops. A slide cut short still stops.
      await host.evaluate((el) => Promise.allSettled(el.getAnimations().map((a) => a.finished)), undefined, { timeout: PRESS_MS });
    }
    return (await checkWalkersClearTheNames(phone, 'phone')) && (await checkWalkersClearTheNames(tv, 'TV'));
  } catch (err) {
    if (err instanceof playwrightErrors.TimeoutError) return false;
    throw err;
  }
}

/**
 * FM-2: every walker on the auction board is drawn above the names strip. Read in one pass, since walkers move.
 * False, measuring nothing, unless the host's walker is still a buyer on that board and has stopped sliding.
 */
async function checkWalkersClearTheNames(page: Page, screen: string): Promise<boolean> {
  const board = page.locator('[data-phase=auction]').getByTestId('walk-board');
  const { hostSide, hostSliding, namesTop, walkers } = await board.evaluate(
    (el, host) => ({
      hostSide: el.querySelector(`[data-testid=${host}]`)?.getAttribute('data-side') ?? null,
      hostSliding: (el.querySelector(`[data-testid=${host}]`)?.getAnimations().length ?? 0) > 0,
      namesTop: el.querySelector('[data-testid=walk-names]')?.getBoundingClientRect().top ?? null,
      walkers: [...el.querySelectorAll('[data-testid^="walker-"]')].map((w) => ({ id: w.getAttribute('data-testid'), bottom: w.getBoundingClientRect().bottom })),
    }),
    HOST_WALKER,
    { timeout: PRESS_MS },
  );
  if (hostSide !== 'buyer' || hostSliding) return false;
  check(namesTop !== null, `FM-2: the ${screen} board has a names strip`);
  check(walkers.length > 0, `FM-2: the ${screen} board draws a walker`);
  for (const w of walkers) {
    const overlap = w.bottom - namesTop;
    check(overlap <= 1, `FM-2: on the ${screen}, ${w.id} is drawn ${overlap.toFixed(1)} px into the names strip`);
  }
  return true;
}

/**
 * B-AC-3 at game over: the phone's score lines add up to its final score, which is the host's score on the
 * TV, and both screens give the colony verdict the TV's air gauge shows. The TV shows no score parts at all.
 */
async function checkTheScoresAddUp(phone: Page, tv: Page): Promise<void> {
  const end = phone.locator('[data-phase=gameOver]');
  const tvEnd = tv.locator('[data-phase=gameOver]');
  const line = async (part: string) => {
    const row = end.getByTestId(`part-${part}`);
    const rows = await row.count();
    if ((part === 'collapse' || part === 'office') && rows === 0) return 0;
    check(rows === 1, `B-AC-3: the phone shows one part-${part} line, got ${rows}`);
    // The office line is shown with a plus sign.
    const shown = (await row.locator('td').last().textContent())?.replace(/^\s*\+/, '') ?? null;
    return readNumber(shown, `the phone's part-${part}`);
  };
  const parts = Object.fromEntries(await Promise.all(PART_LINES.map(async (p) => [p, await line(p)] as const)));
  // The Collapse line is shown as a negative number; read it signed so a positive one fails.
  const cut = -(await line('collapse'));
  check(cut >= 0, `B-AC-3: the phone's Collapse line takes points off, but it reads +${-cut}`);
  const office = await line('office');
  const total = await line('total');
  const sum = PART_LINES.reduce((s, p) => s + parts[p]!, 0) + office - cut;
  check(sum === total, `B-AC-3: the phone's lines ${PART_LINES.map((p) => `${p} ${parts[p]}`).join(' + ')} + office ${office} − collapse ${cut} = ${sum}, but its final score reads ${total}`);

  await tvEnd.getByTestId('tv-scores').waitFor({ timeout: 5_000 });
  const hostRow = tvEnd.getByTestId('tv-scores').locator('li').filter({ has: tv.getByText('Heiko', { exact: true }) });
  check((await hostRow.count()) === 1, 'B-AC-3: the TV lists the host once in its final scores');
  const onTv = readNumber(await hostRow.locator('[data-num]').last().textContent(), "the host's TV score");
  check(onTv === total, `B-AC-3: the phone's final score ${total} is the host's score on the TV, ${onTv}`);

  // The band as the TV's air gauge names it, which everyone in the room reads.
  const gauge = (await tvEnd.getByText(/^\d+ · (CLEAN|SMOGGY|TOXIC|COLLAPSE)$/).textContent()) ?? '';
  const expected = gauge.endsWith('COLLAPSE') ? 'failed' : 'passed';
  for (const [screen, verdict] of [
    ['phone', end.getByTestId('verdict')],
    ['TV', tvEnd.getByTestId('tv-verdict')],
  ] as const) {
    // As read on screen: textContent runs the title into the gauge ("passedColony air"), innerText keeps them apart.
    const text = await verdict.innerText();
    const says = /\bfailed\b/.test(text) ? 'failed' : /\bpassed\b/.test(text) ? 'passed' : 'neither';
    check(says === expected, `B-AC-3: the ${screen} verdict reads "${says}", but the TV's air gauge shows ${gauge}: "${text}"`);
  }
  check(expected === 'failed' || cut === 0, `B-AC-3: the colony passed, yet the phone shows a Collapse line of ${cut}`);

  const tvParts = await tv.locator('[data-testid^="part-"]').count();
  check(tvParts === 0, `B-AC-3: the TV shows no score parts (HC-4), found ${tvParts} part- elements`);
}

/** A number as the screens print it: thousands separators, and a minus sign when negative. */
function readNumber(text: string | null, what: string): number {
  const shown = (text ?? '').trim();
  check(/^[−-]?[\d,]+$/.test(shown), `B-AC-3: ${what} is a number, got "${shown}"`);
  const n = Number(shown.replace(/[^\d]/g, ''));
  return /^[−-]/.test(shown) ? -n : n;
}

type Shown = { phase: string; at: number };

/** A phone on its own browser context, played sideways: its phases recorded into `seen`, its shows watched, its page errors kept. */
async function newPhone(who: string): Promise<{ page: Page; show: ShowWatch }> {
  const context = await browser.newContext(PHONE);
  await recordPhases(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  return { page, show: await watchShow(page) };
}

/**
 * Adds every phase the context's pages put on screen to `seen`, in order, with when it appeared. Kept on the test's
 * side, so a reload doesn't lose what was seen before it. A device that steps aside shows no phase, so two devices
 * add one timeline.
 */
async function recordPhases(context: BrowserContext): Promise<void> {
  await context.exposeBinding('__phaseShown', (_source, phase: string) => {
    if (seen.at(-1)?.phase !== phase) seen.push({ phase, at: Date.now() });
  });
  // Kept a string: tsx's keepNames wraps any named function inside with `__name`, which the page lacks.
  await context.addInitScript(`{
    let last = null;
    new MutationObserver(() => {
      const phase = document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? null;
      if (phase === last) return;
      last = phase;
      if (phase) window.__phaseShown(phase);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase'] });
  }`);
}

/** Each phase with how long it stayed on screen, e.g. "planning 1.2s, landGrant 5.9s". */
function timeline(seen: Shown[]): string {
  return seen.map((s, i) => `${s.phase} ${(((seen[i + 1]?.at ?? s.at) - s.at) / 1_000).toFixed(1)}s`).join(', ');
}

/** The game's seed: MULE_E2E_SEED when set, a fresh random one otherwise. */
function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  // Digits only, since Number('') is 0 and would pass the checks below.
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(Number.isSafeInteger(n) && n >= 0)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}

function isSubsequence(wanted: string[], got: string[]): boolean {
  let i = 0;
  for (const phase of got) if (phase === wanted[i]) i++;
  return i === wanted.length;
}
