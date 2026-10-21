/**
 * T-AC-1: a phone plays a whole two-month game, lobby to final scores, against the real server.
 * Run with `pnpm --filter @mule/web e2e`; replay a red run's map with `MULE_E2E_SEED=<seed>`.
 */
import { existsSync } from 'node:fs';
import { WALK } from '@mule/engine';
import { errors as playwrightErrors, type BrowserContext, type Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import { check, launch, PHONE, startServer, TV, type AuctionSteps } from './harness';

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
/** The auction offers at most 9 goods of 3 stages each; more Done presses than that means it is not moving on. */
const MAX_AUCTION_PRESSES = 40;

const SEED = seedFrom(process.env.MULE_E2E_SEED);
const steps = await loadAuctionSteps();
const { server, base } = await startServer({ maxMonths: 2, phaseScale: PHASE_SCALE, seed: () => SEED });
const browser = await launch();
let seen: Shown[] = [];
const errors: string[] = [];
try {
  const phoneContext = await browser.newContext(PHONE);
  seen = await recordPhases(phoneContext);
  const phone = await phoneContext.newPage();
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));

  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);

  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();

  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(2).waitFor();
  await phone.getByText('Big screen connected').waitFor();

  // B-AC-1: the host picks Mollox; the lobby rail and the TV lobby show it, the AI seats keep their defaults.
  const lobbySeats = phone.getByTestId('seats').locator('li');
  const hostMark = lobbySeats.nth(0).getByRole('img', { name: 'Mollox' });
  await phone.getByTestId('species-mollox').click({ timeout: 3_000 });
  await hostMark.waitFor({ timeout: 3_000 });
  check((await phone.getByTestId('species-mollox').getAttribute('aria-pressed')) === 'true', 'the Mollox chip shows as chosen');
  check((await lobbySeats.nth(1).getByRole('img', { name: 'Bramblet' }).count()) === 1, 'the first AI (seat 2) keeps its default, Bramblet');
  const tvLobbySeats = tv.locator('li');
  await tvLobbySeats.nth(0).getByRole('img', { name: 'Mollox' }).waitFor({ timeout: 3_000 });
  check((await tvLobbySeats.nth(1).getByRole('img', { name: 'Bramblet' }).count()) === 1, 'the TV lobby shows the first AI as a Bramblet');

  await phone.getByRole('button', { name: 'Start game' }).click();

  // B-AC-1: after Start the host plays a Mollox, on the phone and on the TV's game screen (not its lobby).
  await phone.locator('[data-phase]').getByRole('img', { name: 'You, Mollox', exact: true }).waitFor({ timeout: 5_000 });
  const tvGame = tv.locator('[data-phase]');
  await tvGame.waitFor({ timeout: 5_000 });
  await tvGame.locator('li').filter({ hasText: 'Heiko' }).getByRole('img', { name: 'Mollox' }).first().waitFor({ timeout: 3_000 });
  check((await tvGame.getByRole('img', { name: 'Zipwing' }).count()) === 0, 'nobody in the TV game plays the seat-1 default, Zipwing');
  check((await tvGame.getByRole('img', { name: 'Bramblet' }).count()) >= 1, 'the TV game still shows the first AI as a Bramblet');

  // Month 1.
  await phone.getByRole('button', { name: "I'm ready" }).click();
  const claim = phone.getByRole('button', { name: /CLAIM/ });
  await claim.waitFor({ timeout: 5_000 });
  check(await claim.isVisible(), 'CLAIM button visible');
  await tv.getByTestId('tv-phase').filter({ hasText: 'Land grant' }).waitFor({ timeout: 3_000 });

  // Reload: the phone takes its seat back by itself.
  await phone.reload();
  // The land grant may be over by now; any game screen will do.
  await phone.locator('[data-phase]').waitFor({ timeout: 5_000 });
  check((await phone.getByText("You're at the table").count()) === 0, 'back in the game, not the lobby');

  await pastTheLandGrant(phone);
  await steps.landAuction?.({ phone, tv, check }, 1);
  await goToThePub(phone);
  await pressDoneThroughTheAuction(phone);

  // Month 2.
  await phone.locator('[data-phase=planning]').waitFor({ timeout: within(PHASE_MS.upkeep) });
  await steps.listedSale?.({ phone, tv, check });
  await readyIfStillPlanning(phone);
  await pastTheLandGrant(phone);
  await steps.landAuction?.({ phone, tv, check }, 2);
  await goToThePub(phone);
  await pressDoneThroughTheAuction(phone);

  // Game over.
  const scores = phone.locator('[data-phase=gameOver] [data-testid=scores]');
  await scores.waitFor({ timeout: 5_000 });
  const rows = await scores.locator('li').allTextContents();
  check(rows.length === 3, `final scores for all three seats, got ${rows.length}`);
  check(rows.some((r) => r.includes('Heiko (you)')), `the human is on the final scores: ${rows.join(' | ')}`);
  await tv.getByTestId('tv-phase').filter({ hasText: 'Game over' }).waitFor({ timeout: 5_000 });

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
 * Presses "I'm ready" while planning still shows. A hook may use most of
 * planning, which can then end on its own clock first; that skips the press,
 * and the phase-order check still sees planning.
 */
async function readyIfStillPlanning(phone: Page): Promise<void> {
  const ready = phone.locator('[data-phase=planning]').getByRole('button', { name: "I'm ready" });
  const over = phone.locator('[data-phase]:not([data-phase=planning])');
  await ready.or(over).first().waitFor({ timeout: within(PHASE_MS.planning) });
  if (await over.count()) return;
  try {
    await ready.click({ timeout: PRESS_MS });
  } catch (err) {
    if (err instanceof playwrightErrors.TimeoutError && (await over.count())) return;
    throw err;
  }
}

/** Waits until the phone has moved past planning and the land grant. */
async function pastTheLandGrant(phone: Page): Promise<void> {
  await phone.locator('[data-phase]:not([data-phase=planning]):not([data-phase=landGrant])').waitFor({ timeout: within(PHASE_MS.planning + PHASE_MS.landGrant) });
}

/** Development: walk into the pub, which ends the human's turn. */
async function goToThePub(phone: Page): Promise<void> {
  await phone
    .locator('[data-phase=development]')
    .getByRole('button', { name: 'Go to the pub and end your turn' })
    .click({ timeout: within(PHASE_MS.landGrant + PHASE_MS.development) });
}

/**
 * The goods auction: press its Done button at every stage it shows ('Ready',
 * 'Done choosing', 'Done with <Good>') until the phone leaves the auction.
 */
async function pressDoneThroughTheAuction(phone: Page): Promise<void> {
  await phone.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });
  const done = phone.locator('[data-phase=auction]').getByRole('button', { name: /^(Ready|Done choosing|Done with .+)$/ });
  const over = phone.locator('[data-phase]:not([data-phase=auction])');
  for (let pressed = 0; ; pressed++) {
    check(pressed < MAX_AUCTION_PRESSES, `auction still running after ${MAX_AUCTION_PRESSES} Done presses`);
    await done.or(over).first().waitFor({ timeout: AUCTION_STAGE_MS });
    if (await over.count()) return;
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

type Shown = { phase: string; at: number };

/**
 * Every phase the phone puts on screen, in order, with when it appeared. Kept
 * on the test's side, so a reload doesn't lose what was seen before it.
 */
async function recordPhases(context: BrowserContext): Promise<Shown[]> {
  const seen: Shown[] = [];
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
  return seen;
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
