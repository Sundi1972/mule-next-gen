/**
 * B-AC-6 at promise altitude (spec C5, C7, RULE-5, RULE-6): a real six-seat game with politics on, one phone, five AI
 * seats and two TVs. A Hospital going up and a Park standing are placed on the grounds as the server's tests place
 * them. Month 1's end is the first this TV sees: a still, and Ready during it goes to planning at once. Month 2's end,
 * where the Hospital has just come to stand: after any event show the TV shows the opener leaning in on it, ≈ 6 s, then
 * TvMonthEnd. A second TV with reduced motion, whose Hospital pictures are blocked, shows the still with the Hospital's
 * SVG shape and no glow. TV-FIT holds over the opener and the month end.
 * Run with `cd apps/web && npx vite build && npx tsx e2e/grounds-opener.ts`; replay with `MULE_E2E_SEED=<seed>`.
 */
import type { GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { errors as playwrightErrors, type Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import { check, doneWithLand, held, launch, PHONE, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS, readyThroughTheElection, voteThroughTheElection } from './politics-steps';
import { theTvScalesHeld, TV_SCALE_FLOOR, watchTvScales } from './tv-fit-steps';

const SCALE = 0.25;
const within = (ms: number) => ms * SCALE + 5_000;
/** The month end's event show plays on the server clock before the opener; this is how long one may take, and more. */
const SHOW_MS = 40_000;
/** RULE-6's lengths, as a player at the table sees them: the full opener ≈ 6 s, the still 3 s. */
const FULL_MS = 6_000;
const STILL_MS = 3_000;
const SEATS = 6;
/** Where the projects stand on the 5 × 5 grounds (RULE-32b: slot = y × 5 + x, the hall at (2,2)). */
const HOSPITAL_SLOT = 7;
const PARK_SLOT = 11;

/**
 * Kept a string: tsx would wrap named functions in a helper the page lacks. From the TV's first frame, every 50 ms,
 * what it shows: the event show (over anything), the opener and its kind, the month end, or the screen's phase.
 */
const TIMELINE = String.raw`{
  const seen = [];
  setInterval(() => {
    const shown = (sel) => { const e = document.querySelector(sel); return !!e && e.checkVisibility(); };
    const opener = document.querySelector('[data-testid=tv-grounds-opener]');
    const phase = document.querySelector('[data-phase]');
    const now = shown('[data-testid=tv-event-overlay]') ? 'show'
      : opener ? 'opener:' + opener.getAttribute('data-opener')
      : shown('[data-testid=tv-monthend]') ? 'monthend'
      : 'phase:' + (phase ? phase.getAttribute('data-phase') : 'none');
    if (seen.length === 0 || seen[seen.length - 1].what !== now) seen.push({ what: now, at: performance.now() });
  }, 50);
  window.__tvTimeline = () => seen;
}`;

type Seen = { what: string; at: number };
/** How deep a place sits from the camera: its block's centre, col + row (the painter's order). */
const depthOf = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => x + (w - 1) / 2 + y + (h - 1) / 2;

const timeline = async (tv: Page) => (await tv.evaluate('window.__tvTimeline()')) as Seen[];
/** The index of the last time the TV started showing `what`, -1 if never. */
const lastShown = (seen: Seen[], what: string) => seen.map((s) => s.what).lastIndexOf(what);

async function main(): Promise<void> {
  const SEED = seedFrom(process.env.MULE_E2E_SEED);
  const { server, base } = await startServer({ maxMonths: 3, phaseScale: SCALE, seed: () => SEED });
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
    for (let seat = 1; seat < SEATS; seat++) {
      await phone.getByRole('button', { name: 'Add AI player' }).click();
      await phone.locator('[data-testid=seats] li').nth(seat).waitFor();
    }

    // The TV the table watches, measured for TV-FIT from its first frame.
    const tv = await (await browser.newContext(TV)).newPage();
    tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
    await watchTvScales(tv);
    await tv.addInitScript(TIMELINE);
    await tv.goto(`${base}/table?room=${code}`);
    await tv.getByTestId('room-code').waitFor();
    // A second TV with reduced motion, whose Hospital pictures never load.
    const still = await (await browser.newContext(TV)).newPage();
    still.on('pageerror', (e) => errors.push(`reduced-motion tv: ${e.message}`));
    await still.emulateMedia({ reducedMotion: 'reduce' });
    let blocked = 0;
    await still.route('**/art/colony/hospital/**', (route) => {
      blocked++;
      return route.abort();
    });
    await still.goto(`${base}/table?room=${code}`);
    await still.getByTestId('room-code').waitFor();
    await phone.getByRole('button', { name: 'Start game' }).click();

    const room = () => {
      const r = server.registry.get(code);
      check(r, `room ${code} is on the server`);
      return r;
    };
    const board = (): MuleView => {
      const g = room().viewFor(null).game;
      check(g, `room ${code} has a game running`);
      return g;
    };

    // Month 1: through the election to planning, where the Hospital goes up (two months to build) and the Park stands,
    // placed as the server's colony tests place them; the fund can pay the Park's upkeep.
    await voteThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
    await held(server, code, async () => {
      const state = (room() as unknown as { game: { state: GameState } }).game.state;
      check(state.colony, 'the server plays with the colony (politics on)');
      const funded = { credits: 0, goods: {} };
      state.colony.projects.push(
        { id: 'hospital', stage: 'building', funded, monthsLeft: 2, since: 1, plaque: {}, slot: HOSPITAL_SLOT },
        { id: 'park', stage: 'standing', funded, monthsLeft: null, since: 1, plaque: {}, slot: PARK_SLOT },
      );
      state.treasury.money = Math.max(state.treasury.money, 5_000);
      room().broadcast();
    });
    await throughTheMonth(phone, board, false);

    // Month 1's end, the first this TV sees (RULE-5): the 3 s still, leaning in on nothing. Everyone Ready during it
    // (the AI seats are; Lena presses) ends it, and the TV goes to planning without the month end.
    const opener = tv.getByTestId('tv-grounds-opener');
    await opener.waitFor({ timeout: SHOW_MS });
    await tv.getByTestId('tv-event-overlay').waitFor({ state: 'hidden', timeout: SHOW_MS });
    check((await opener.getAttribute('data-opener')) === 'still', `T-AC-8: month 1's end, the first this TV sees, is the still, got ${await opener.getAttribute('data-opener')}`);
    check((await opener.getAttribute('data-leaning')) === null, 'T-AC-7: the first month end a TV sees leans in on nothing');
    const pressed = Date.now();
    await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: PRESS_MS });
    await opener.waitFor({ state: 'detached', timeout: STILL_MS });
    const gone = Date.now() - pressed;
    await phone.locator('[data-phase=planning]').waitFor({ timeout: PRESS_MS });
    check(board().phase === 'planning' && board().month === 2, `everyone Ready moves the game to month 2's planning, got ${board().phase} ${board().month}`);
    await tv.waitForFunction("window.__tvTimeline().at(-1).what !== 'opener:still'", undefined, { timeout: PRESS_MS });
    const month1 = await timeline(tv);
    const after = month1.slice(lastShown(month1, 'opener:still'));
    check(!after.some((s) => s.what === 'monthend'), `B-AC-6 (negative): Ready during the opener goes to planning without the month end, the TV showed ${after.map((s) => s.what).join(' → ')}`);
    console.log(`✓ B-AC-6 (negative): everyone Ready during month 1's still → the TV left the opener ${gone} ms after the press (the still is ${STILL_MS} ms) for ${after.map((s) => s.what).join(' → ')}`);

    // Month 2's end: the Hospital has just come to stand.
    await throughTheMonth(phone, board, true);
    // Read while its 3 s still is up, beside the main TV's reads: after it the month end shows no grounds.
    const reducedTv = readTheStill(still, board);
    // Awaited below; a failure before then is reported by the check that failed first.
    reducedTv.catch(() => undefined);
    await opener.and(tv.locator('[data-opener=full]')).waitFor({ timeout: SHOW_MS });
    const ending = board();
    check(ending.phase === 'upkeep' && ending.month === 2, `month 2 ends in upkeep, got ${ending.phase} ${ending.month}`);
    const hospital = ending.colony?.projects.find((p) => p.id === 'hospital');
    // A place's number is its project's place in commission order: an AI seat may commission one too.
    const placeOf = (id: string) => (ending.colony?.projects.findIndex((p) => p.id === id) ?? -1) + 1;
    const [h, k] = [placeOf('hospital'), placeOf('park')];
    check(hospital?.stage === 'standing', `the server has the Hospital standing at month 2's end, got ${hospital?.stage}`);
    check((await opener.getAttribute('data-leaning'))?.split(' ').includes('hospital'), `T-AC-7: the opener leans in on the Hospital, got ${await opener.getAttribute('data-leaning')}`);
    const caption = (await tv.getByTestId('opener-caption').innerText()).replace(/\s+/g, ' ').trim();
    check(/^New this month: .*the Hospital stands/.test(caption), `B-AC-6: the caption names the Hospital standing, got "${caption}"`);
    const header = (await opener.locator('h1').innerText()).trim();
    check(header === 'End of month 2', `B-AC-6: the opener's header reads "End of month 2", got "${header}"`);
    check((await opener.locator('[data-testid^=callout-]').count()) === 0, 'AM-7 v: no chips on the opener');

    // The pictures at dusk, back to front: each place drawn after every place behind it (col + row from the hall).
    const grounds = opener.getByTestId('colony-grounds');
    await grounds.locator(`[data-testid=glow-${h}]`).waitFor({ timeout: PRESS_MS });
    const order = await grounds.evaluate((svg) => [...svg.querySelectorAll('[data-testid^=place-]')].map((g) => Number(g.getAttribute('data-testid')!.slice('place-'.length))));
    const depth = (n: number) => depthOf(ending.colony!.projects[n - 1]!.place!);
    check(order.length >= 2 && order.every((n, i) => i === 0 || depth(order[i - 1]!) <= depth(n)), `the pictures sit back to front in the DOM, got places ${order.join(', ')} at depths ${order.map(depth).join(', ')}`);
    const href = await grounds.locator(`[data-testid=picture-${h}]`).getAttribute('href');
    check(href?.endsWith('hospital/standing-dusk@800.webp'), `B-AC-6: the Hospital shows its standing picture at dusk, got ${href}`);
    console.log(`✓ B-AC-6: month 2's end shows "${header}", "${caption}", leaning in on the Hospital, no chips; its picture ${href} with its glow; places ${order.join(', ')} back to front`);

    // ≈ 6 s, then TvMonthEnd, unchanged.
    await tv.getByTestId('tv-monthend').waitFor({ timeout: FULL_MS + 2_000 });
    const month2 = await timeline(tv);
    const from = lastShown(month2, 'opener:full');
    const shownFor = month2[from + 1]!.at - month2[from]!.at;
    const before = month2.slice(0, from).filter((s) => s.at > month1.at(-1)!.at).map((s) => s.what);
    check(month2[from + 1]!.what === 'monthend', `B-AC-6: the month end follows the opener, got ${month2.slice(from).map((s) => s.what).join(' → ')}`);
    check(shownFor >= FULL_MS - 500 && shownFor <= FULL_MS + 1_000, `RULE-6: the full opener shows ≈ ${FULL_MS} ms, got ${shownFor.toFixed(0)} ms`);
    check(before.at(-1) !== 'monthend', `B-AC-6: nothing shows the month end before the opener, got ${before.join(' → ')}`);
    const sawShow = before.includes('show');
    console.log(`✓ B-AC-6: the TV went ${[...new Set(before.slice(-3))].join(' → ')} → opener ${shownFor.toFixed(0)} ms → tv-monthend${sawShow ? ' (the opener waited for the event show)' : ' (no event show this month end)'}`);

    // The reduced-motion TV: the still, naming the change, no lean-in; its blocked Hospital its SVG shape, unlit.
    const read = await reducedTv;
    check(read.kind === 'still', `T-AC-8: with reduced motion a changed month is the still, got ${read.kind}`);
    check(read.leaning === null, `T-AC-8: with reduced motion nothing leans in, got ${read.leaning}`);
    check(read.caption.includes('the Hospital stands'), `T-AC-8: the still names the change, got "${read.caption}"`);
    console.log(`✓ T-AC-8: with reduced motion month 2's end is the still: "${read.caption}", no lean-in`);
    const [shape, picture, glow, park] = [`shape-${h}`, `picture-${h}`, `glow-${h}`, `picture-${k}`].map((id) => read.parts.includes(id));
    check(blocked > 0 && shape && !picture && !glow, `B-AC-4 (negative): the blocked Hospital picture shows its SVG shape and no glow (${blocked} requests blocked), got ${read.parts.join(', ')}`);
    check(park, 'the Park beside it still shows its picture');
    console.log(`✓ B-AC-4 (negative): ${blocked} Hospital picture requests blocked → its SVG shape, its glow gone; the Park keeps its picture`);

    // TV-FIT at six seats over the opener and the month end.
    const scales = await theTvScalesHeld(tv, 'six seats');
    check(/upkeep \(tv-grounds-opener\) /.test(scales) && /upkeep \(tv-monthend\) /.test(scales), `TV-FIT read the opener and the month end, got ${scales}`);
    console.log(`✓ TV-FIT floor ${TV_SCALE_FLOOR}, six seats, every screen incl. the opener and the month end: ${scales}`);

    check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
    console.log(`e2e grounds opener: ok (room ${code}, seed ${SEED}, ${((Date.now() - started) / 1_000).toFixed(1)}s)`);
  } catch (err) {
    console.error(`e2e grounds opener: FAILED (seed ${SEED})`);
    if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

/** The reduced-motion TV's opener at the month end, once the Hospital's blocked picture has fallen back to its shape; the place testids it draws. */
async function readTheStill(tv: Page, board: () => MuleView): Promise<{ kind: string | null; leaning: string | null; caption: string; parts: string[] }> {
  const opener = tv.getByTestId('tv-grounds-opener');
  await opener.waitFor({ timeout: SHOW_MS });
  await tv.getByTestId('tv-event-overlay').waitFor({ state: 'hidden', timeout: SHOW_MS });
  const hospital = (board().colony?.projects.findIndex((p) => p.id === 'hospital') ?? -1) + 1;
  await opener.getByTestId(`shape-${hospital}`).waitFor({ timeout: STILL_MS });
  return opener.evaluate((root) => ({
    kind: root.getAttribute('data-opener'),
    leaning: root.getAttribute('data-leaning'),
    caption: (root.querySelector('[data-testid=opener-caption]') as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
    parts: [...root.querySelectorAll('[data-testid^=shape-], [data-testid^=picture-], [data-testid^=glow-]')].map((e) => e.getAttribute('data-testid')!),
  }));
}

/** A month from planning to its end: the election (month 2's ready only), the land, the pub, the goods auction. */
async function throughTheMonth(phone: Page, board: () => MuleView, ready: boolean): Promise<void> {
  if (ready) await readyThroughTheElection(phone, within(ELECTION_WAIT_MS) + PRESS_MS);
  else await phone.locator('[data-phase=planning] [data-testid=ready]').click({ timeout: PRESS_MS });
  await doneWithLand(phone);
  await throughTheLandAuction(phone, board);
  await phone.locator('[data-phase=development]').waitFor({ timeout: within(PHASE_MS.development) });
  await pressDoneThroughTheAuction(phone, board);
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

// Rooms keep their phase timers running after the test, so the process ends here.
main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
