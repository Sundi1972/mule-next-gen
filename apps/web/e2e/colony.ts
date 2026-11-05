/**
 * UBER-AC-7 at promise altitude (C34): a real game with politics on, one phone, an AI seat and the TV. A project is
 * commissioned and donated to through the game's own intents; the TV's four gauges, its month-end build site and the
 * game over's colony band, and the phone's colony score card, all carry the server's ColonyView.
 * Run with `pnpm --filter @mule/web exec tsx e2e/colony.ts`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { PRESTIGE, type GameState, type PrestigeId } from '@mule/engine';
import type { ColonyView, MuleIntent, MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, doneWithLand, held, launch, PHONE, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS, readyThroughTheElection, voteThroughTheElection } from './politics-steps';

const SCALE = 0.25;
const within = (ms: number) => ms * SCALE + 5_000;
/** The month end has no clock; this is how long a screen has to show it. */
const MONTH_END_MS = 10_000;
/** What the phone gives to the project: well under any object's price, so it stays a donation. */
const DONATION = 100;
let PROJECT: PrestigeId = 'hospital';

type Room = NonNullable<ReturnType<MuleServer['registry']['get']>>;
const fmt = (n: number) => Math.round(n).toLocaleString('en');

async function main(): Promise<void> {
  const SEED = seedFrom(process.env.MULE_E2E_SEED);
  // Two months: the last month's upkeep goes straight to game over, so only month 1 has a month end to read.
  const { server, base } = await startServer({ maxMonths: 2, phaseScale: SCALE, seed: () => SEED });
  // A browser that fails to start still closes the server it would have used.
  const browser = await launch().catch(async (err: unknown) => {
    await server.close();
    throw err;
  });
  const errors: string[] = [];
  const started = Date.now();
  try {
    const phone = await (await browser.newContext(PHONE)).newPage();
    phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill('Lena');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor();
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);
    await phone.getByRole('button', { name: 'Add AI player' }).click();
    await phone.locator('[data-testid=seats] li').nth(1).waitFor();
    const tv = await (await browser.newContext(TV)).newPage();
    tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
    await tv.goto(`${base}/table?room=${code}`);
    await tv.getByTestId('room-code').waitFor();
    await phone.getByRole('button', { name: 'Start game' }).click();

    const room = (): Room => {
      const r = server.registry.get(code);
      check(r, `room ${code} is on the server`);
      return r;
    };
    const board = (): MuleView => {
      const g = room().viewFor(null).game;
      check(g, `room ${code} has a game running`);
      return g;
    };
    const colony = (): ColonyView => {
      const c = board().colony;
      check(c, 'the server plays with the colony (politics on)');
      return c;
    };
    const lenaId = room().viewFor(null).seats.find((s) => s.name === 'Lena')?.id;
    check(lenaId, 'Lena has a seat');

    // Month 1: through the election to planning proper, where the Governor commissions and anyone donates.
    await voteThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
    await held(server, code, async () => {
      const game = (room() as unknown as { game: { state: GameState; handle(seat: string, intent: MuleIntent): void } }).game;
      const politics = game.state.politics!;
      // Commissioning needs a sitting Governor. When nobody ran in the election there is none, and the Governor's desk
      // (C35) that would commission is not built yet; so the Governor is seated the way the server's colony tests do it.
      if (!politics.governor) game.state.politics = { ...politics, governor: lenaId };
      // An AI Governor may have commissioned already; the colony funds one project at a time, so Lena gives to that one.
      const open = game.state.colony!.projects.find((p) => p.stage === 'commissioned');
      if (open) PROJECT = open.id;
      else game.handle(game.state.politics!.governor!, { type: 'commission', id: PROJECT });
      game.handle(lenaId, { type: 'donate', id: PROJECT, credits: DONATION });
      room().broadcast();
    });
    const project = colony().projects.find((p) => p.id === PROJECT);
    check(project?.plaque.some((d) => d.playerId === lenaId && d.value >= DONATION), `the server has Lena's ${DONATION} cr on the ${PRESTIGE[PROJECT].name}'s plaque, got ${JSON.stringify(project?.plaque)}`);

    // 1. The TV's header carries the four gauges, its wealth the server's, happiness "not yet" while it has none.
    const gauges = tv.getByTestId('colony-gauges');
    await gauges.waitFor({ timeout: PRESS_MS });
    check((await gauges.locator('[data-testid^=gauge-]').count()) === 4, 'B-AC-34-3: the TV header shows four gauges');
    const wealth = `${fmt(colony().gauges.wealth)} cr`;
    await gauges.getByTestId('gauge-wealth').locator('[data-num]').filter({ hasText: wealth }).waitFor({ timeout: PRESS_MS });
    check(colony().gauges.happiness === null, 'this base has no mood yet: the server’s happiness is null');
    const happiness = (await gauges.getByTestId('gauge-happiness').innerText()).replace(/\s+/g, ' ').trim();
    check(happiness.includes('—') && happiness.includes('not yet'), `B-AC-34-3: happiness reads "—" and "not yet", got "${happiness}"`);
    console.log(`✓ B-AC-34-3: the TV header shows the four gauges, wealth ${wealth} as the server has it, happiness not yet`);

    // On through the month: ready, done with land, the pub, the auction.
    await phone.locator('[data-phase=planning] [data-testid=ready]').click({ timeout: PRESS_MS });
    await doneWithLand(phone);
    await throughTheLandAuction(phone, board);
    await goToThePub(phone);
    await pressDoneThroughTheAuction(phone, board);

    // 2. The month end: the build site's row for the project at the server's stage, with Lena on its plaque.
    await tv.getByTestId('tv-monthend').waitFor({ timeout: MONTH_END_MS });
    check(board().phase === 'upkeep', `month 1 ends in upkeep, got ${board().phase}`);
    const stage = colony().projects.find((p) => p.id === PROJECT)!.stage;
    const row = tv.getByTestId('build-site').getByTestId(`project-${PROJECT}`);
    const shown = await row.getAttribute('data-stage', { timeout: PRESS_MS });
    check(shown === stage, `B-AC-34-4: the TV's build site shows the ${PRESTIGE[PROJECT].name} at the server's stage "${stage}", got "${shown}"`);
    const plaque = (await row.getByTestId(`plaque-${PROJECT}`).innerText({ timeout: PRESS_MS })).replace(/\s+/g, ' ');
    check(plaque.includes('Lena'), `B-AC-34-4: the plaque names Lena, got "${plaque}"`);
    console.log(`✓ B-AC-34-4: the month end's build site shows the ${PRESTIGE[PROJECT].name} ${stage}, Lena on its plaque`);

    // Month 2, to game over.
    await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS });
    await phone.locator('[data-phase=planning]').waitFor({ timeout: MONTH_END_MS });
    await readyThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
    await doneWithLand(phone);
    await throughTheLandAuction(phone, board);
    await goToThePub(phone);
    await pressDoneThroughTheAuction(phone, board);

    // 3. Game over: the TV's colony band with the score still to count, "The game goes to", the phone's colony card.
    await tv.getByTestId('tv-gameover').waitFor({ timeout: MONTH_END_MS });
    check(board().phase === 'gameOver', `the game is over on the server, got ${board().phase}`);
    await tv.getByTestId('colony-band').waitFor({ timeout: PRESS_MS });
    const winner = (await tv.getByTestId('tv-winner').innerText()).replace(/\s+/g, ' ').trim();
    check(/^the game goes to/i.test(winner), `UBER-AC-7: the TV's winner card reads "The game goes to", got "${winner}"`);
    check(colony().score === null, 'this base counts no colony score yet: the server’s score is null');
    check((await tv.getByTestId('colony-band').getByTestId('colony-score-pending').count()) === 1, 'B-AC-34-6: with the score null the band shows the pending line');
    check((await tv.getByTestId('colony-total').count()) === 0, 'B-AC-34-6: with the score null the TV shows no total');
    await phone.locator('[data-phase=gameOver]').getByTestId('phone-colony-score').waitFor({ timeout: PRESS_MS });
    console.log('✓ UBER-AC-7: game over shows the colony band, the score pending, "The game goes to", and the phone’s colony card');

    // 4. No page errors on either screen.
    check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    console.log(`e2e colony: ok (room ${code}, seed ${SEED}, ${((Date.now() - started) / 1_000).toFixed(1)}s)`);
  } catch (err) {
    console.error(`e2e colony: FAILED (seed ${SEED})`);
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

/** Presses Done at each land auction lot's walk until the phase moves on; with nothing listed it is skipped. */
async function throughTheLandAuction(page: Page, board: () => MuleView): Promise<void> {
  const deadline = Date.now() + within(60_000);
  while (board().phase === 'landGrant' || board().phase === 'landAuction') {
    check(Date.now() < deadline, 'the land auction ends within its lots');
    if (board().landAuction?.stage === 'walk') await page.locator('[data-phase=landAuction] [data-testid=done]:not([disabled])').click({ timeout: 200 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function goToThePub(page: Page): Promise<void> {
  await page.locator('[data-phase=development]').getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: within(PHASE_MS.development) });
}

/** The goods auction: presses Ready or Done at every stage it shows, until the phone leaves the auction. */
async function pressDoneThroughTheAuction(page: Page, board: () => MuleView): Promise<void> {
  await page.locator('[data-phase=auction]').waitFor({ timeout: within(PHASE_MS.development + PHASE_MS.production) });
  const done = page.locator('[data-phase=auction]').getByRole('button', { name: /^(Ready|Done with .+)$/ });
  const over = page.locator('[data-phase]:not([data-phase=auction])');
  const stageMs = within(60_000);
  for (let pressed = 0; ; pressed++) {
    check(pressed < 40, 'the goods auction moves on when everyone is done');
    await done.or(over).first().waitFor({ timeout: stageMs });
    if (await over.count()) return;
    try {
      const label = await done.innerText({ timeout: PRESS_MS });
      const stage = () => `${board().auction?.good}:${board().auction?.stage}`;
      const at = stage();
      await done.click({ timeout: PRESS_MS });
      const still = page.locator('[data-phase=auction]').getByRole('button', { name: label, exact: true });
      const deadline = Date.now() + stageMs;
      while (stage() === at && (await still.isVisible())) {
        if (Date.now() > deadline) throw new playwrightErrors.TimeoutError(`${label} stayed up at ${at}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      // The stage moved on under the press.
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
  }
}

function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
