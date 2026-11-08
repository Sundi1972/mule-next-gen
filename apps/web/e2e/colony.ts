/**
 * UBER-AC-7 at promise altitude (C34): a real game with politics on, one phone, an AI seat and the TV. A project is
 * commissioned and donated to through the phone's Colony desk (C35); the TV's four gauges, its month-end build site and the
 * game over's colony band, and the phone's colony score card, all carry the server's ColonyView.
 * Run with `pnpm --filter @mule/web exec tsx e2e/colony.ts`; replay with `MULE_E2E_SEED=<seed>`.
 */
import { callStrike, COLONY, GOODS, HAPPINESS, moodBand, PRESTIGE, type FundLine, type GameState, type PrestigeId } from '@mule/engine';
import type { ColonyProjectView, ColonyView, IncidentView, MuleView } from '@mule/protocol';
import { GOOD_NAME } from '@mule/ui';
import { errors as playwrightErrors, type Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import type { MuleServer } from '../../server/src/server.js';
import { theTvMonthEnd } from './grounds-opener-steps';
import { check, doneWithLand, held, launch, PHONE, PHONE_SMALL, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS, readyThroughTheElection, voteThroughTheElection } from './politics-steps';
import { shownWhole, theTvHeaderFits, theTvScaleHolds, theTvScalesHeld, TV_SCALE_FLOOR, watchTvScales } from './tv-fit-steps';

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
    // seated the way the server's colony tests do it. An AI Governor commissions too (pace set C), but only once the
    // fund holds commissionShare of a building's credits; the fund starts at 0 and takes no tax or grant before
    // month 1's planning, so the colony has no project yet.
    await held(server, code, async () => {
      const game = (room() as unknown as { game: { state: GameState } }).game;
      const politics = game.state.politics!;
      if (politics.governor !== lenaId) game.state.politics = { ...politics, governor: lenaId };
      check(game.state.colony!.projects.length === 0, `no project before Lena commissions, got ${JSON.stringify(game.state.colony!.projects)}`);
      room().broadcast();
    });
    // B-AC-35-1, front to back: the Governor's phone commissions through the Colony tab.
    const planning = phone.locator('[data-phase=planning]');
    await planning.getByTestId('tab-colony').click({ timeout: PRESS_MS });
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

    await theGovernorPaysTheStrike({ server, code, phone, tv, lenaId, room, colony });

    // On through the month: ready, done with land, the pub, the auction.
    await phone.locator('[data-phase=planning] [data-testid=ready]').click({ timeout: PRESS_MS });
    await doneWithLand(phone);
    await throughTheLandAuction(phone, board);
    await goToThePub(phone);
    await pressDoneThroughTheAuction(phone, board);

    // 2. The month end: the build site's line for the project at the server's stage. With politics on it is one line
    // (PM ruling 7 Nov, TV-FIT): its name, stage and figure; the plaque is the phones' (B-AC-35-2 read it on Lena's).
    await theTvMonthEnd(tv, MONTH_END_MS);
    check(board().phase === 'upkeep', `month 1 ends in upkeep, got ${board().phase}`);
    const stage = colony().projects.find((p) => p.id === PROJECT)!.stage;
    const row = tv.getByTestId('build-site').getByTestId(`project-${PROJECT}`);
    const shown = await row.getAttribute('data-stage', { timeout: PRESS_MS });
    check(shown === stage, `B-AC-34-4: the TV's build site shows the ${PRESTIGE[PROJECT].name} at the server's stage "${stage}", got "${shown}"`);
    const figure = (await row.getByTestId(`figure-${PROJECT}`).innerText({ timeout: PRESS_MS })).trim();
    const expected = figureFor(colony().projects.find((p) => p.id === PROJECT)!);
    check(figure === expected, `B-AC-34-4: the ${PRESTIGE[PROJECT].name}'s line reads the server's "${expected}", got "${figure}"`);
    console.log(`✓ B-AC-34-4: the month end's build site shows the ${PRESTIGE[PROJECT].name} ${stage} on one line, "${figure}"`);
    console.log(`✓ #tv-month-end-paid-out: two seats, month 1's end, the Wealth note reads ${await theFundPaidOut(tv, board())}`);

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
      await theTvMonthEnd(tv, MONTH_END_MS);
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
      await theTvMonthEnd(tv, MONTH_END_MS);
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
    // TV-FIT's floor (PM ruling 6 Nov) is read on every screen this six-seat TV shows, over both months.
    await watchTvScales(tv);
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
      await theTvMonthEnd(tv, MONTH_END_MS);
    };
    await throughTheMonth();
    await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: MONTH_END_MS });
    await phone.locator('[data-phase=planning]').waitFor({ timeout: MONTH_END_MS });
    await throughTheMonth();

    check(board().month === 2 && board().players.length === 6, `month 2's end at six seats, got month ${board().month}, ${board().players.length} seats`);
    // The longest build site a game can have (PM ruling 7 Nov: a long game reaches five projects): all five, the most
    // lines they can take once the standing ones fold into one. Three under way (COLONY.maxOpen), one damaged, the park
    // standing: five lines, as many as five with none standing. Staged as the server's colony tests stage them:
    // commissioning is planning's, and this is the month end.
    await held(server, code, async () => {
      const room = server.registry.get(code);
      check(room, `room ${code} on the server`);
      const state = (room as unknown as { game: { state: GameState } }).game.state;
      const donors = state.players.slice(0, 3).map((p, i) => [p.id, 60 * (i + 1)] as const);
      const staged: { id: PrestigeId; stage: 'standing' | 'building' | 'commissioned' | 'damaged'; monthsLeft: number | null }[] = [
        { id: 'park', stage: 'standing', monthsLeft: null },
        { id: 'hospital', stage: 'building', monthsLeft: 1 },
        { id: 'observatory', stage: 'commissioned', monthsLeft: null },
        { id: 'stadium', stage: 'commissioned', monthsLeft: null },
        { id: 'spaceport', stage: 'damaged', monthsLeft: null },
      ];
      check(staged.filter((p) => p.stage === 'building' || p.stage === 'commissioned').length === COLONY.maxOpen, `the staging has the most projects under way, ${COLONY.maxOpen}`);
      state.colony!.projects = staged.map(({ id, stage, monthsLeft }) => ({ id, stage, monthsLeft, since: 1, slot: null, funded: { credits: 120, goods: {} }, plaque: Object.fromEntries(donors) }));
      // And the longest Wealth note a month end can have (#tv-month-end-paid-out): five figures on both sides, every line
      // of the ledger paid, in the widest digits.
      const report = [...state.history].reverse().find((r) => r.ledger);
      check(report?.ledger?.month === state.month, `month ${state.month}'s end has its own ledger, got month ${report?.ledger?.month}`);
      report.ledger.out = LONGEST_LEDGER;
      state.treasury.money = 88_888;
      // WS4's named edit (S4-C17, PM ruling 8 Nov): two sabotage incidents this month, so the TV's colony panel carries
      // its "Sabotage ×2" tag while TV-FIT is read. Staged in the view, as claude-seat-tv.ts stages waitingForClaude:
      // the engine builds sabotage off.
      const [lena, ossa, brix] = state.players.map((p) => p.id);
      const incidents: IncidentView[] = [
        { id: 'sab-e2e-1', month: state.month, kind: 'powerCut', victim: ossa!, at: { x: 0, y: 0 }, good: 'smithore', worked: false, culprit: lena!, how: 'guard', investigated: false, fine: null },
        { id: 'sab-e2e-2', month: state.month, kind: 'rumour', victim: null, at: null, good: 'food', dir: 'up', worked: true, culprit: brix!, how: 'caught', investigated: false, fine: null },
      ];
      const game = (room as unknown as { game: { viewFor(seat: string | null): MuleView } }).game;
      const viewFor = game.viewFor.bind(game);
      game.viewFor = (seat) => {
        const view = viewFor(seat);
        if (!view.politics) return view;
        const sabotage = view.politics.sabotage ?? { terms: { powerCut: { cost: 0, success: 0, detect: 0 }, rumour: { cost: 0, success: 0, detect: 0 } }, sheriff: { guards: 0, investigations: 0, investigationsLeft: 0 }, incidents: [] };
        return { ...view, politics: { ...view.politics, sabotage: { ...sabotage, incidents: [...sabotage.incidents, ...incidents] } } };
      };
      room.broadcast();
    });
    check(board().politics?.sabotage?.incidents.length === 2, `two sabotage incidents staged in month ${board().month}'s view, got ${board().politics?.sabotage?.incidents.length}`);
    check(board().colony?.projects.length === 5, `five projects at the build site, got ${board().colony?.projects.length}`);
    // The full ticker: the TV that has watched the game. The empty one: a TV that joins now (the server replays no chat).
    const fresh = await (await browser.newContext(TV)).newPage();
    fresh.on('pageerror', (e) => errors.push(`fresh tv: ${e.message}`));
    await fresh.goto(`${base}/table?room=${code}`);
    for (const [page, name] of [
      [tv, 'ticker-full'],
      [fresh, 'ticker-empty'],
    ] as const) {
      const read = await readTheSixSeatMonthEnd(page, name);
      // The TV counts the month's sabotage on the colony panel's header row; the lines are the phone's (PM ruling 8 Nov).
      const tag = page.getByTestId('tv-monthend').getByTestId('colony-panel').getByTestId('sabotage-tag');
      await tag.waitFor({ timeout: PRESS_MS });
      check((await tag.innerText()).trim().toUpperCase() === 'SABOTAGE ×2', `the ${name} TV's colony panel reads SABOTAGE ×2, got "${await tag.innerText()}"`);
      check((await page.getByTestId('tv-monthend').getByTestId('sabotage-news').count()) === 0, `the ${name} TV draws no sabotage line`);
      console.log(`✓ S4-C17 (PM ruling 8 Nov): six seats, month 2's end, two sabotage incidents, the TV's tag SABOTAGE ×2 and TV-FIT held: ${read.match(/scale [\d.]+ with the band/)?.[0]}`);
      const site = page.getByTestId('tv-monthend').getByTestId('build-site');
      check((await site.locator('li').count()) === 5, `the ${name} TV's build site has five lines, the standing park folded into one`);
      await site.getByTestId('projects-standing').filter({ hasText: 'Standing: Park' }).waitFor({ timeout: PRESS_MS });
      console.log(`✓ B-AC-27-2: six seats, month 2's end, five projects, ${read}`);
      console.log(`✓ #tv-month-end-paid-out: six seats, the longest ledger, the Wealth note reads ${await theFundPaidOut(page, board())}`);
    }
    // A late game's other end: all five standing share one line, and every name shows, wrapping rather than cut (review
    // of #672). The fewer lines leave the room.
    await held(server, code, async () => {
      const room = server.registry.get(code)!;
      const state = (room as unknown as { game: { state: GameState } }).game.state;
      for (const p of state.colony!.projects) Object.assign(p, { stage: 'standing', monthsLeft: null });
      room.broadcast();
    });
    const standing = tv.getByTestId('tv-monthend').getByTestId('projects-standing');
    await standing.filter({ hasText: PRESTIGE.spaceport.name }).waitFor({ timeout: PRESS_MS });
    const names = await standing.evaluate((li) => {
      const span = li.firstElementChild as HTMLElement;
      return { scroll: span.scrollWidth, client: span.clientWidth, lines: Math.round(span.getBoundingClientRect().height / parseFloat(getComputedStyle(span).lineHeight)) };
    });
    check(names.scroll <= names.client, `all five standing names show whole on the TV, ${names.scroll} px in ${names.client}`);
    check((await tv.getByTestId('tv-monthend').getByTestId('build-site').locator('li').count()) === 1, 'all five standing take one line');
    console.log(`✓ PM ruling 7 Nov: all five standing on one line, every name whole (${names.lines} text lines), scale ${await theTvScaleHolds(tv, 'six-seat month end, five standing')}`);
    console.log(`✓ TV-FIT floor ${TV_SCALE_FLOOR}, every screen at six seats over two months: ${await theTvScalesHeld(tv, 'six seats')}`);

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

/** Every line the fund can pay, in the widest digits: 88,888 in all, beside a fund of 88,888. */
const LONGEST_LEDGER: Partial<Record<FundLine, number>> = { officePay: 8_888, upkeep: 8_888, repair: 8_888, strikePay: 8_888, welfare: 8_888, security: 8_888, project: 35_560 };

/**
 * #tv-month-end-paid-out (PM ruling 7 Nov): the TV month end's Wealth note reads the fund and this month's paid-out total
 * as the server has them, every line summed, and shows whole. The note is one line that truncates, so it never costs height.
 */
async function theFundPaidOut(tv: Page, g: MuleView): Promise<string> {
  const c = g.colony;
  check(c?.ledger?.month === g.month, `the month end's ledger is this month's (${g.month}), got ${c?.ledger?.month}`);
  const total = Object.values(c.ledger.out).reduce((sum: number, n) => sum + (n ?? 0), 0);
  const want = `fund ${c.fund.toLocaleString('en-US')} cr · paid out ${total.toLocaleString('en-US')}`;
  const note = tv.getByTestId('tv-monthend').getByTestId('note-gauge-wealth');
  await note.filter({ hasText: want }).waitFor({ timeout: PRESS_MS });
  // A note that fits sizes to its words; one that does not is cut to its row, its words running past (scroll > client).
  const fit = await note.evaluate((el) => ({ text: (el as HTMLElement).innerText, scroll: el.scrollWidth, client: el.clientWidth, row: el.parentElement!.clientWidth }));
  check(fit.text === want, `the Wealth note reads "${want}", got "${fit.text}"`);
  check(fit.scroll <= fit.client, `TV-FIT: the Wealth note "${want}" shows whole, ${fit.scroll} px in ${fit.client}`);
  return `"${want}", whole (${fit.scroll} px of its ${fit.row} px row)`;
}

/**
 * What the TV month end's line should read for a project, from the server's view of it (RULE-21): collecting, the share
 * of its credits paid, then the goods it still waits for; building, when it stands, the upkeep having counted this month.
 */
function figureFor(p: ColonyProjectView): string {
  if (p.stage === 'building') return p.monthsLeft === 1 ? 'stands next month' : `stands in ${p.monthsLeft} months`;
  if (p.stage !== 'commissioned') return `+${p.prestige} prestige`;
  if (p.funded.credits < p.cost.credits) return `${Math.round((100 * p.funded.credits) / p.cost.credits)}% paid`;
  const short = GOODS.filter((g) => (p.cost.goods[g] ?? 0) > (p.funded.goods[g] ?? 0)).map((g) => `${p.cost.goods[g]! - (p.funded.goods[g] ?? 0)} ${GOOD_NAME[g]}`);
  return short.length > 0 ? `needs ${short.join(' · ')}` : '100% paid';
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
    // Settled, and at TV-FIT's floor or more (PM ruling 6 Nov).
    const scale = Number(await theTvScaleHolds(tv, `six-seat month end (${name})`));
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

/**
 * The general strike (C37), front to back: C26's event that calls it is not built yet, so it starts as the server's
 * tests start it, with Lena governing and the fund able to pay. Her phone's Now card pays; the server and the TV agree.
 */
async function theGovernorPaysTheStrike({ server, code, phone, tv, lenaId, room, colony }: { server: MuleServer; code: string; phone: Page; tv: Page; lenaId: string; room: () => Room; colony: () => ColonyView }): Promise<void> {
  const fundBefore = await held(server, code, async () => {
    const state = (room() as unknown as { game: { state: GameState } }).game.state;
    state.politics = { ...state.politics!, governor: lenaId };
    state.treasury.money = Math.max(state.treasury.money, COLONY.strike.cost * 2);
    callStrike(state, 'food');
    room().broadcast();
    return state.treasury.money;
  });
  const badge = tv.getByTestId('strike-badge');
  await badge.filter({ hasText: 'STRIKE · Food 20%' }).waitFor({ timeout: PRESS_MS });
  await phone.getByTestId('pay-strike').click({ timeout: PRESS_MS });
  await phone.getByTestId('strike-paid').waitFor({ timeout: PRESS_MS });
  check(colony().strike?.paid === true, `B-AC-37-2: the server has the strike paid, got ${JSON.stringify(colony().strike)}`);
  check(colony().fund === fundBefore - COLONY.strike.cost, `B-AC-37-2: the fund drops by ${COLONY.strike.cost} cr, from ${fundBefore} to ${colony().fund}`);
  const paid = `PAID · −${fmt(COLONY.strike.cost)} cr`;
  await badge.filter({ hasText: paid }).waitFor({ timeout: PRESS_MS });
  const news = `Lena pays the food strikers ${COLONY.strike.cost} cr.`;
  await tv.getByTestId('tv-news').getByText(news).waitFor({ timeout: PRESS_MS });
  console.log(`✓ B-AC-37-2/4: Lena's phone pays the Food strikers; the server has it paid, the fund ${fmt(fundBefore)} → ${fmt(colony().fund)} cr, the TV reads "${paid}" and "${news}"`);
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
