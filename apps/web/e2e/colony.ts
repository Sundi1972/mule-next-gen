/**
 * UBER-AC-7 at promise altitude (C34): a real game with politics on, one phone, an AI seat and the TV. A project is
 * commissioned and donated to through the phone's Colony desk (C35); the TV's four gauges, its month-end build site and the
 * game over's colony band, and the phone's colony score card, all carry the server's ColonyView.
 * Run with `pnpm --filter @mule/web exec tsx e2e/colony.ts`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { HAPPINESS, moodBand, PRESTIGE, type GameState, type PrestigeId } from '@mule/engine';
import type { ColonyView, MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { check, doneWithLand, held, launch, PHONE, PHONE_SMALL, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS, readyThroughTheElection, voteThroughTheElection } from './politics-steps';
import { shownWhole, theTvHeaderFits } from './tv-fit-steps';

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
    const score = colony().score;
    if (score === null) {
      check((await tv.getByTestId('colony-band').getByTestId('colony-score-pending').count()) === 1, 'B-AC-34-6: with the score null the band shows the pending line');
      check((await tv.getByTestId('colony-total').count()) === 0, 'B-AC-34-6: with the score null the TV shows no total');
    } else {
      const total = (await tv.getByTestId('colony-band').getByTestId('colony-total').innerText({ timeout: PRESS_MS })).trim();
      check(Number(total.replace(/[^\d-]/g, '')) === score.total, `UBER-AC-7: the TV's colony total is the server's ${score.total}, got "${total}"`);
    }
    await phone.locator('[data-phase=gameOver]').getByTestId('phone-colony-score').waitFor({ timeout: PRESS_MS });
    console.log(`✓ UBER-AC-7: game over shows the colony band, the score ${score?.total ?? 'pending'}, "The game goes to", and the phone’s colony card`);

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
main()
  .then(theMonthEndsMoodDrift)
  .then(theColonyScoreEveryMonthEnd)
  .then(theMonthEndScoreAtSixSeats)
  .then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);

/**
 * B-AC-23-6 / B-AC-23-8 front to back (WS8 PR-E2), a game of its own: three months, so month 2 has a month end with a
 * month before it. Month 1's end has no last gauges, so the TV shows the server's mood at once. In month 2 the mood is
 * moved a band down (as an event's moodShift would); at its end the TV's Happiness gauge opens on last month's number
 * and counts to the server's gauges.happiness, ending in the server's band.
 */
async function theMonthEndsMoodDrift(): Promise<void> {
  const SEED = seedFrom(process.env.MULE_E2E_SEED);
  const { server, base } = await startServer({ maxMonths: 3, phaseScale: SCALE, seed: () => SEED });
  const browser = await launch().catch(async (err: unknown) => {
    await server.close();
    throw err;
  });
  const errors: string[] = [];
  try {
    const phone = await (await browser.newContext(PHONE)).newPage();
    phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill('Lena');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor();
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
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
    const happiness = async () => (await tv.getByTestId('tv-monthend').getByTestId('gauge-happiness').innerText({ timeout: PRESS_MS })).replace(/\s+/g, ' ').trim();
    const throughTheMonth = async () => {
      await readyThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
      await doneWithLand(phone);
      await throughTheLandAuction(phone, board);
      await goToThePub(phone);
      await pressDoneThroughTheAuction(phone, board);
      await tv.getByTestId('tv-monthend').waitFor({ timeout: MONTH_END_MS });
    };

    // Month 1's end: no month before it, so no drift; the gauge reads the server's mood from the start.
    await throughTheMonth();
    const first = colony();
    check(first.lastGauges === null && first.gauges.happiness !== null, `month 1 ends with a mood and no last gauges, got ${JSON.stringify(first.lastGauges)}`);
    const monthOne = tv.getByTestId('tv-monthend').getByTestId('gauge-happiness');
    check((await monthOne.getAttribute('data-from', { timeout: PRESS_MS })) === null, 'B-AC-23-8: month 1’s end carries no drift on its Happiness gauge');
    const opened = (await monthOne.locator('[data-num]').innerText({ timeout: PRESS_MS })).trim();
    check(opened === `${first.gauges.happiness}`, `B-AC-23-8: month 1's end shows the server's ${first.gauges.happiness} at once, got "${opened}"`);
    console.log(`✓ B-AC-23-8: month 1's end has no last gauges, and the TV shows the server's mood ${first.gauges.happiness} at once`);

    // Month 2: the mood falls a band, as an event's moodShift would move it.
    await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS });
    await phone.locator('[data-phase=planning]').waitFor({ timeout: MONTH_END_MS });
    const fallen = first.gauges.happiness! - (HAPPINESS.bands.content - HAPPINESS.bands.restless);
    await held(server, code, async () => {
      const game = (room() as unknown as { game: { state: GameState } }).game;
      game.state.colony = { ...game.state.colony!, happiness: fallen };
      room().broadcast();
    });
    await throughTheMonth();

    // Month 2's end: the gauge carries the drift it counts (data-from, data-to: stable, not caught mid-count), from the
    // server's lastGauges to its gauges, and lands on exactly the server's number and band.
    const now = colony();
    const from = now.lastGauges?.happiness;
    const to = now.gauges.happiness!;
    check(from === first.gauges.happiness && to !== from, `the server's month 2 end moves the mood, ${from} → ${to}`);
    const band = { thriving: 'Thriving', content: 'Content', restless: 'Restless', unhappy: 'Unhappy', unrest: 'Unrest' }[now.gauges.band!];
    check(band && moodBand(to) === now.gauges.band, `the server's band ${now.gauges.band} is its number's`);
    const gauge = tv.getByTestId('tv-monthend').getByTestId('gauge-happiness');
    await gauge.and(tv.locator(`[data-from="${from}"][data-to="${to}"]`)).waitFor({ timeout: PRESS_MS });
    await gauge.locator('[data-num]').filter({ hasText: new RegExp(`^${to}$`) }).waitFor({ timeout: MONTH_END_MS });
    const ended = await happiness();
    const read = ended.match(/^happiness (\d+) (\w+)\b/i);
    check(read && Number(read[1]) === to && read[2]!.toLowerCase() === band.toLowerCase(), `B-AC-23-6: the gauge ends on the server's ${to} ${band}, got "${ended}"`);
    console.log(`✓ B-AC-23-6: at month 2's end the TV's Happiness counts ${from} → ${to} and ends "${ended}"`);

    check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    console.log(`e2e colony mood drift: ok (room ${code}, seed ${SEED})`);
  } catch (err) {
    console.error(`e2e colony mood drift: FAILED (seed ${SEED})`);
    if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * B-AC-27-2 / B-AC-27-3 / B-AC-27-5 front to back (G-5 AM-12), a game of its own: three months, so month 2 has a month end
 * with one before it. At month 1's end the TV shows the server's colony total and no change line; at month 2's end the
 * change is the server's score.total − lastScore. The phone beside the TV carries the line, and on a 667 × 375 phone the
 * league stays whole above it. In planning neither screen shows the month end's score.
 */
async function theColonyScoreEveryMonthEnd(): Promise<void> {
  const SEED = seedFrom(process.env.MULE_E2E_SEED);
  const { server, base } = await startServer({ maxMonths: 3, phaseScale: SCALE, seed: () => SEED });
  const browser = await launch().catch(async (err: unknown) => {
    await server.close();
    throw err;
  });
  const errors: string[] = [];
  try {
    const phone = await (await browser.newContext(PHONE)).newPage();
    phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill('Lena');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor();
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    await phone.getByRole('button', { name: 'Add AI player' }).click();
    await phone.locator('[data-testid=seats] li').nth(1).waitFor();
    const tv = await (await browser.newContext(TV)).newPage();
    tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
    await tv.goto(`${base}/table?room=${code}`);
    await tv.getByTestId('room-code').waitFor();
    await phone.getByRole('button', { name: 'Start game' }).click();
    const board = (): MuleView => {
      const g = server.registry.get(code)?.viewFor(null).game;
      check(g, `room ${code} has a game running`);
      return g;
    };
    const colony = (): ColonyView => {
      const c = board().colony;
      check(c, 'the server plays with the colony (politics on)');
      return c;
    };
    const band = tv.getByTestId('tv-monthend').getByTestId('colony-band');
    const line = phone.locator('[data-phase=upkeep]').getByTestId('phone-month-score');
    const throughTheMonth = async () => {
      await readyThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
      // B-AC-27-5: planning carries a score in the view, and no screen shows the month end's.
      check(board().colony?.score != null, 'the server fills the colony score in planning too');
      check((await tv.getByTestId('colony-band').count()) === 0 && (await phone.getByTestId('phone-month-score').count()) === 0, 'B-AC-27-5: in planning neither screen shows the month end’s colony score');
      await doneWithLand(phone);
      await throughTheLandAuction(phone, board);
      await goToThePub(phone);
      await pressDoneThroughTheAuction(phone, board);
      await tv.getByTestId('tv-monthend').waitFor({ timeout: MONTH_END_MS });
    };
    const shownTotal = async () => Number((await band.getByTestId('colony-total').innerText({ timeout: PRESS_MS })).replace(/[^\d-]/g, ''));

    // Month 1's end: the server's total, no last month, so no change line on either screen.
    await throughTheMonth();
    const first = colony();
    check(first.score !== null && (first.lastScore ?? null) === null, `month 1 ends with a score and no lastScore, got ${JSON.stringify({ score: first.score, lastScore: first.lastScore })}`);
    check((await shownTotal()) === first.score!.total, `B-AC-27-2: month 1's TV total is the server's ${first.score!.total}`);
    check((await band.getByTestId('colony-score-change').count()) === 0, 'B-AC-27-2: month 1’s end has no change line');
    await line.getByTestId('colony-total').filter({ hasText: fmt(first.score!.total) }).waitFor({ timeout: PRESS_MS });
    check((await line.getByTestId('colony-score-change').count()) === 0, 'B-AC-27-3: month 1’s phone line has no change');
    console.log(`✓ B-AC-27-2: month 1's end shows the server's colony score ${fmt(first.score!.total)} on the TV and the phone, with no change line`);

    // B-AC-27-3 at 667 × 375: the line fits under the league, every league row whole and in view.
    await phone.setViewportSize(PHONE_SMALL.viewport);
    await line.waitFor({ timeout: PRESS_MS });
    const fit = await phone.evaluate(() => {
      // No named helpers in here: tsx wraps them in a __name the page doesn't have.
      const end = document.querySelector('[data-phase=upkeep]');
      const rows = [...(end?.querySelectorAll('[data-testid=league-table] tbody tr') ?? [])].map((r) => r.getBoundingClientRect());
      const foot = end?.querySelector('[data-testid=colony-on-tv]')?.getBoundingClientRect() ?? null;
      const table = end?.querySelector('[data-testid=league-table]');
      // The innermost clipping box is the tightest bound the league's rows must fit in.
      let clip: DOMRect | null = null;
      for (let el = table?.parentElement; el && el !== end && !clip; el = el.parentElement) {
        if (getComputedStyle(el).overflowY !== 'visible') clip = el.getBoundingClientRect();
      }
      return { rows: rows.map((r) => ({ top: r.top, bottom: r.bottom })), foot: foot && { top: foot.top, bottom: foot.bottom }, clipBottom: clip?.bottom ?? null, vh: innerHeight };
    });
    const lastRow = fit.rows.at(-1);
    check(fit.rows.length === 2 && lastRow && fit.foot, `the phone's month end has the league's two rows and the colony line, got ${JSON.stringify(fit)}`);
    check(lastRow.bottom <= fit.foot.top + 0.5, `B-AC-27-3: at 667×375 the colony line sits under the league, not over it: ${JSON.stringify(fit)}`);
    check(lastRow.bottom <= (fit.clipBottom ?? fit.vh) + 0.5 && fit.foot.bottom <= fit.vh + 0.5, `B-AC-27-3: at 667×375 the league is whole and the line in view: ${JSON.stringify(fit)}`);
    console.log(`✓ B-AC-27-3: at 667×375 the phone's league stays whole (last row ends ${lastRow.bottom.toFixed(0)} px) above the colony line (${fit.foot.top.toFixed(0)}–${fit.foot.bottom.toFixed(0)} px)`);
    await phone.setViewportSize(PHONE.viewport);

    // Month 2's end: the change is the server's score.total − lastScore, on the TV and the phone.
    await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS });
    await phone.locator('[data-phase=planning]').waitFor({ timeout: MONTH_END_MS });
    await throughTheMonth();
    const now = colony();
    check(now.score !== null && typeof now.lastScore === 'number', `month 2 ends with a score and last month's, got ${JSON.stringify({ score: now.score, lastScore: now.lastScore })}`);
    const delta = now.score!.total - now.lastScore!;
    const words = delta > 0 ? `↑ +${fmt(delta)}` : delta < 0 ? `↓ −${fmt(-delta)}` : '± 0';
    check((await shownTotal()) === now.score!.total, `B-AC-27-2: month 2's TV total is the server's ${now.score!.total}`);
    const change = (await band.getByTestId('colony-score-change').innerText({ timeout: PRESS_MS })).replace(/\s+/g, ' ').trim();
    check(change === `${words} since month 1`, `B-AC-27-2: the TV's change is the server's ${now.score!.total} − ${now.lastScore} = "${words} since month 1", got "${change}"`);
    const onPhone = (await line.getByTestId('colony-score-change').innerText({ timeout: PRESS_MS })).replace(/\s+/g, ' ').trim();
    check(onPhone === change, `B-AC-27-3: the phone's change is the TV's "${change}", got "${onPhone}"`);
    check((await band.getByTestId('colony-verdict').count()) === 0, 'B-AC-27-2: no verdict at a month end');
    console.log(`✓ B-AC-27-2: month 2's end shows ${fmt(now.score!.total)} and "${change}" (server ${now.score!.total} − ${now.lastScore}) on the TV and the phone`);

    check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    console.log(`e2e colony score every month end: ok (room ${code}, seed ${SEED})`);
  } catch (err) {
    console.error(`e2e colony score every month end: FAILED (seed ${SEED})`);
    if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

/** Below this the month end's league is hard to read from the couch (WS4's fit condition for #416). */
const COUCH_SCALE = 0.8;

/**
 * B-AC-27-2 at a full table (WS4's TV-FIT, 1920×1080): six seats, month 2's end, the colony band up under the league.
 * Read on two TVs, the chat ticker full and empty: the header still fits, the band and the league show whole, and the
 * log gives the month end's scale with and without the band, against COUCH_SCALE. `MULE_E2E_SHOTS=<dir>` saves both TVs.
 */
async function theMonthEndScoreAtSixSeats(): Promise<void> {
  const SEED = seedFrom(process.env.MULE_E2E_SEED);
  const { server, base } = await startServer({ maxMonths: 3, phaseScale: SCALE, seed: () => SEED });
  const browser = await launch().catch(async (err: unknown) => {
    await server.close();
    throw err;
  });
  const errors: string[] = [];
  try {
    const phone = await (await browser.newContext(PHONE)).newPage();
    phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill('Lena');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor();
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    for (let seat = 1; seat < 6; seat++) {
      await phone.getByRole('button', { name: 'Add AI player' }).click();
      await phone.locator('[data-testid=seats] li').nth(seat).waitFor();
    }
    const tv = await (await browser.newContext(TV)).newPage();
    tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
    await tv.goto(`${base}/table?room=${code}`);
    await tv.getByTestId('room-code').waitFor();
    await phone.getByRole('button', { name: 'Start game' }).click();
    const board = (): MuleView => {
      const g = server.registry.get(code)?.viewFor(null).game;
      check(g, `room ${code} has a game running`);
      return g;
    };
    const throughTheMonth = async () => {
      await readyThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
      await doneWithLand(phone);
      await throughTheLandAuction(phone, board);
      await goToThePub(phone);
      await pressDoneThroughTheAuction(phone, board);
      await tv.getByTestId('tv-monthend').waitFor({ timeout: MONTH_END_MS });
    };
    await throughTheMonth();
    await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS });
    await phone.locator('[data-phase=planning]').waitFor({ timeout: MONTH_END_MS });
    await throughTheMonth();

    check(board().month === 2 && board().players.length === 6, `month 2's end at six seats, got month ${board().month}, ${board().players.length} seats`);
    // The full ticker: the TV that has watched the game. The empty one: a TV that joins now (the server replays no chat).
    const fresh = await (await browser.newContext(TV)).newPage();
    fresh.on('pageerror', (e) => errors.push(`fresh tv: ${e.message}`));
    await fresh.goto(`${base}/table?room=${code}`);
    for (const [page, name] of [
      [tv, 'ticker-full'],
      [fresh, 'ticker-empty'],
    ] as const) {
      const read = await readTheSixSeatMonthEnd(page, name);
      console.log(`✓ B-AC-27-2: six seats, month 2's end, ${read}`);
    }

    check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    console.log(`e2e colony six seats: ok (room ${code}, seed ${SEED})`);
  } catch (err) {
    console.error(`e2e colony six seats: FAILED (seed ${SEED})`);
    if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * The six-seat month end on one TV, once no event show covers it: the league's six rows and the band whole, the header
 * fitting, the FitHeight scale settled; then the scale it would have without the band, and the chat lines showing.
 */
async function readTheSixSeatMonthEnd(tv: Page, name: string): Promise<string> {
  const end = tv.getByTestId('tv-monthend');
  const overlay = tv.getByTestId('tv-event-overlay');
  for (let attempt = 0; ; attempt++) {
    check(attempt < 5, `the ${name} TV shows its month end clear of any event show`);
    await overlay.waitFor({ state: 'hidden', timeout: MONTH_END_MS + 20_000 });
    await end.getByTestId('colony-band').getByTestId('colony-score-change').waitFor({ state: 'visible', timeout: MONTH_END_MS });
    await end.getByTestId('league-table').waitFor({ state: 'visible', timeout: PRESS_MS });
    check((await end.locator('[data-testid^=league-row-]').count()) === 6, 'six league rows on the TV');
    const header = await theTvHeaderFits(tv, `six-seat month end (${name})`);
    let scale = Number(await end.locator('[data-fit]').getAttribute('data-fit'));
    for (let i = 0; i < 10; i++) {
      await tv.waitForTimeout(300);
      const again = Number(await end.locator('[data-fit]').getAttribute('data-fit'));
      if (again === scale) break;
      scale = again;
    }
    const parts = await end.evaluate((root) => {
      const box = root.querySelector('[data-fit]')!;
      const band = root.querySelector('[data-testid=colony-band]') as HTMLElement;
      // The left column holds the league, then the band; the right column the colony panel and the build site.
      const league = band.parentElement!.firstElementChild as HTMLElement;
      const right = band.parentElement!.nextElementSibling as HTMLElement;
      // The grid stretches the right column to the row; its content runs from its first child's top to its last's foot.
      const first = right.firstElementChild as HTMLElement;
      const last = right.lastElementChild as HTMLElement;
      const lines = [...root.querySelectorAll('[data-testid^=chat-line-]')].filter((l) => (l as HTMLElement).checkVisibility()).length;
      return { box: box.clientHeight, league: league.offsetHeight, band: band.offsetHeight, right: last.offsetTop + last.offsetHeight - first.offsetTop, lines };
    });
    await shownWhole(tv, `six-seat month end (${name})`, ['[data-testid=colony-band]', '[data-testid=league-table]']);
    const shot = process.env.MULE_E2E_SHOTS ? `${process.env.MULE_E2E_SHOTS}/tv-monthend-six-seats-month2-${name}.png` : null;
    if (shot) await tv.screenshot({ path: shot });
    // A show that came up while it was read: read it again once it has gone.
    if (await overlay.isVisible()) continue;
    const without = Math.min(1, parts.box / Math.max(parts.league, parts.right));
    const note = scale < COUCH_SCALE ? `; below the couch scale ${COUCH_SCALE}` : '';
    return `${name} (${parts.lines} chat lines): scale ${scale.toFixed(3)} with the band, ${without.toFixed(3)} without (box ${parts.box} px, league ${parts.league}, band ${parts.band}, right column ${parts.right})${note}; TV-FIT ${header}${shot ? `; ${shot}` : ''}`;
  }
}

/** Presses Done at each land auction lot's walk until the phase moves on; with nothing listed it is skipped. */
async function throughTheLandAuction(page: Page, board: () => MuleView): Promise<void> {
  const deadline = Date.now() + within(60_000);
  while (board().phase === 'landGrant' || board().phase === 'landAuction') {
    check(Date.now() < deadline, 'the land auction ends within its lots');
    if (board().landAuction?.stage === 'walk') await page.locator('[data-phase=landAuction] [data-testid=done]:not([disabled])').click({ timeout: 200 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Walking is on, so development is the arcade screen; like politics.ts and full-game.ts, it runs on its clock. */
async function goToThePub(page: Page): Promise<void> {
  await page.locator('[data-phase=development]').waitFor({ timeout: within(PHASE_MS.development) });
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
