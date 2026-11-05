/**
 * UBER-AC-7 at promise altitude (C34): a real game with politics on, one phone, an AI seat and the TV. A project is
 * commissioned and donated to through the phone's Colony desk (C35); the TV's four gauges, its month-end build site and the
 * game over's colony band, and the phone's colony score card, all carry the server's ColonyView.
 * Run with `pnpm --filter @mule/web exec tsx e2e/colony.ts`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { PRESTIGE, type GameState, type PrestigeId } from '@mule/engine';
import type { ColonyView, MuleView } from '@mule/protocol';
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
const PROJECT: PrestigeId = 'hospital';

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
    // Commissioning needs a sitting Governor. When nobody ran, or another seat won, there is none for Lena; so she is
    // seated the way the server's colony tests do it. The AI never commissions, so the colony has no project yet.
    await held(server, code, async () => {
      const game = (room() as unknown as { game: { state: GameState } }).game;
      const politics = game.state.politics!;
      if (politics.governor !== lenaId) game.state.politics = { ...politics, governor: lenaId };
      check(game.state.colony!.projects.length === 0, `no project before Lena commissions, got ${JSON.stringify(game.state.colony!.projects)}`);
      room().broadcast();
    });
    // B-AC-35-1, front to back: the Governor's phone commissions through the Colony desk.
    const planning = phone.locator('[data-phase=planning]');
    await planning.getByTestId('desk-colony').click({ timeout: PRESS_MS });
    await planning.getByTestId('commission-open').click({ timeout: PRESS_MS });
    await planning.getByTestId(`cat-${PROJECT}`).click({ timeout: PRESS_MS });
    await planning.getByTestId('commission-go').click({ timeout: PRESS_MS });
    await until(() => colony().projects.some((p) => p.id === PROJECT && p.stage === 'commissioned'), `B-AC-35-1: the server has the ${PRESTIGE[PROJECT].name} commissioned`);
    await planning.getByTestId('commission-news').filter({ hasText: `Lena commissions a ${PRESTIGE[PROJECT].name}` }).waitFor({ timeout: PRESS_MS });
    console.log(`✓ B-AC-35-1: Lena's phone commissions the ${PRESTIGE[PROJECT].name} from the Colony desk; the server's ColonyView has it`);

    // B-AC-35-2, front to back: she donates through the chips, and the plaque the preview promised is the server's.
    await planning.getByTestId(`donate-${PROJECT}`).click({ timeout: PRESS_MS });
    await planning.getByTestId(`chip-cr-${DONATION}`).click({ timeout: PRESS_MS });
    const preview = (await planning.getByTestId('donate-preview').innerText({ timeout: PRESS_MS })).replace(/\s+/g, ' ');
    check(preview.includes(`0 → ${fmt(DONATION)} cr`), `B-AC-35-2: the preview shows the plaque 0 → ${DONATION} cr, got "${preview}"`);
    await planning.getByTestId('donate-give').click({ timeout: PRESS_MS });
    await until(() => colony().projects.find((p) => p.id === PROJECT)?.plaque.some((d) => d.playerId === lenaId) ?? false, "B-AC-35-2: the server has Lena's gift on the plaque");
    const project = colony().projects.find((p) => p.id === PROJECT);
    check(project?.plaque.some((d) => d.playerId === lenaId && d.value === DONATION), `the server has Lena's ${DONATION} cr on the ${PRESTIGE[PROJECT].name}'s plaque, got ${JSON.stringify(project?.plaque)}`);
    await planning.getByTestId(`donate-hint-${PROJECT}`).filter({ hasText: `Your plaque ${fmt(DONATION)} cr` }).waitFor({ timeout: PRESS_MS });
    console.log(`✓ B-AC-35-2: Lena gives ${DONATION} cr through the chips; the server's plaque and her phone both read ${DONATION} cr`);

    // 1. The TV's header carries the four gauges, its wealth the server's, happiness "not yet" while it has none.
    const gauges = tv.getByTestId('colony-gauges');
    await gauges.waitFor({ timeout: PRESS_MS });
    check((await gauges.locator('[data-testid^=gauge-]').count()) === 4, 'B-AC-34-3: the TV header shows four gauges');
    const wealth = `${fmt(colony().gauges.wealth)} cr`;
    await gauges.getByTestId('gauge-wealth').locator('[data-num]').filter({ hasText: wealth }).waitFor({ timeout: PRESS_MS });
    // The mood (C23) has its first value once planning opens; the gauge shows the server's, or "not yet" while it is null.
    const mood = colony().gauges.happiness;
    const happiness = gauges.getByTestId('gauge-happiness');
    if (mood === null) await happiness.filter({ hasText: 'not yet' }).waitFor({ timeout: PRESS_MS });
    else await happiness.locator('[data-num]').filter({ hasText: String(mood) }).waitFor({ timeout: PRESS_MS });
    console.log(`✓ B-AC-34-3: the TV header shows the four gauges, wealth ${wealth} and happiness ${mood ?? 'not yet'} as the server has them`);

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

/** Waits for the server to get there. */
async function until(ok: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + PRESS_MS;
  while (!ok()) {
    check(Date.now() < deadline, what);
    await new Promise((r) => setTimeout(r, 50));
  }
}

function seedFrom(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
