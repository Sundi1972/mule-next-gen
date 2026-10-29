/**
 * B-AC-1 and B-AC-2 front to back: two rooms play against the real server, one with a TV and one phone alone, and
 * month 2's production fires two events. Local tier. Run after `vite build`: `pnpm --filter @mule/web exec tsx e2e/events.ts`.
 * MULE_E2E_EVENTS picks the pair (default the spec's drought then pest swarm); MULE_E2E_SHOTS=<dir> saves screenshots.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildEvent, createRng, eventOutput, EVENTS, type EventKey, type GameState, type MonthEvent, type MonthReport } from '@mule/engine';
import type { MuleView, ProductionView } from '@mule/protocol';
import { eventScript, finalUnits, GOOD_NAME, SHOW, showEnd, type Good } from '@mule/ui';
import { errors as playwrightErrors, type Browser, type Page } from 'playwright';
import { check, held, launch, PHONE, startServer, TV } from './harness';
import { watchShow, type ShowWatch } from './production-steps';

const PHASE_SCALE = 0.5;
const FIRED = (process.env.MULE_E2E_EVENTS ?? 'drought,pestSwarm').split(',') as EventKey[];
const SHOTS = process.env.MULE_E2E_SHOTS;
const SEED = Number(process.env.MULE_E2E_SEED ?? 1);
/** The month whose production fires the pair: month 1's colony is often one or two working plots, or none. */
const MONTH = Number(process.env.MULE_E2E_MONTH ?? 2);
/** How long a check waits for a screen to show what it looks for. */
const SHOWN_MS = 5_000;
/** Longest one step of the phone's part may take before the loop looks at the phase again. */
const PRESS_MS = 1_000;
/** Longest the game may take to reach MONTH's production. */
const PLAY_MS = 6 * 60_000;
/** A click lands this much before the show would have got there by itself, or the click did not cause the jump. */
const AHEAD_MS = 300;
/** Each event's own story element on a map that plays it. */
const STORY_MARK: Partial<Record<EventKey, string>> = { dustStorm: 'front-dustStorm', drought: 'front-drought', acidRain: 'front-acidRain', pestSwarm: 'swarm-', wildfire: 'fire-' };

/** Lines the AI seats post when they have not said three yet: the ticker's most, as in a real game. */
const CHATTER = ['Money is for spending on MULEs.', 'Quietly building.', 'Better safe than sorry: keep the cash.'];

/** T-AC-5's phone sizes (AM-1, AM-2): the reference, the small one, and the reference with a notch held sideways. */
const PHONE_SIZES = [
  { name: '844x390', viewport: PHONE.viewport, insets: null },
  { name: '667x375', viewport: { width: 667, height: 375 }, insets: null },
  { name: '844x390+notch', viewport: PHONE.viewport, insets: { top: 0, left: 47, right: 47, bottom: 21 } },
] as const;

const started = Date.now();
const { server, base } = await startServer({ maxMonths: MONTH + 1, phaseScale: PHASE_SCALE, politics: false, seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
/** Why a room's production could not fire the pair, for the check that reads the view. */
const unfired: string[] = [];
try {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const [withTv, alone] = await Promise.all([theTvPlaysEachStory(browser), thePhoneAlonePlaysAndSkips(browser)]);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`B-AC-1: ${withTv}`);
  console.log(`B-AC-2: ${alone}`);
  console.log(`e2e events: ok (seed ${SEED}, month ${MONTH}, ${FIRED.join(' then ')}, ${seconds()} s)`);
} catch (err) {
  console.error(`e2e events: FAILED (seed ${SEED}, month ${MONTH}, ${FIRED.join(' then ')}, ${seconds()} s)`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
// Rooms keep their phase timers running; the test is over, so stop here.
process.exit(0);

function seconds(): string {
  return ((Date.now() - started) / 1000).toFixed(1);
}

/** B-AC-1, with B-AC-2's negative: the TV plays each event's own story in fired order and states the view's figures; the phone keeps the light card. */
async function theTvPlaysEachStory(browser: Browser): Promise<string> {
  const { phone, code, watch: phoneShow } = await openRoom(browser, 'tv room');
  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  const tvShow = await watchShow(tv);
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();
  await startAndReachProduction(phone, code, 'tv room');

  const view = await productionOn(tvShow, 'tv room');
  const order = view.events.map((e) => e.key);
  await phone.locator(`[data-testid=phone-card][data-event=${order[0]}]`).waitFor({ timeout: SHOWN_MS });
  check((await phone.getByTestId('skip').count()) === 0, 'B-AC-2 negative: with a TV the phone has no skip control');
  check((await phone.getByTestId('skip-hint').count()) === 0, 'B-AC-2 negative: with a TV the phone shows no skip hint');
  check((await phone.locator('[data-testid=event-map][data-event]').count()) === 0, 'B-AC-2 negative: with a TV the phone map never plays the event');
  await shoot(phone, 'phone-844x390-withtv-1');
  await shoot(tv, 'tv-1920x1080-1');

  return held(server, code, async () => {
    const logged = tv.locator('[data-testid=log] [data-log]');
    await logged.nth(order.length - 1).waitFor({ timeout: view.lengthMs + SHOWN_MS });
    await shoot(tv, 'tv-1920x1080-2-logged');
    const keys = await logged.evaluateAll((els) => els.map((el) => el.getAttribute('data-log')));
    check(JSON.stringify(keys) === JSON.stringify(order), `B-AC-1: the TV log lists ${keys.join(', ')}, fired ${order.join(', ')}`);
    const lines = await logged.evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ')));
    for (const [i, ev] of view.events.entries()) checkLogLine(lines[i] ?? '', ev, view, tvShow.view()!.players);
    await checkColonyChips(tv, view);
    await theTvFitsWithChat(tv, code, tvShow.view()!.players);
    checkStories((await tvShow.recording())?.layers ?? [], order, 'the TV');
    check(!((await phoneShow.recording())?.layers ?? []).some((l) => l.startsWith('event:')), 'B-AC-2 negative: with a TV the phone never played an event on its map');
    return `the TV played ${order.join(' then ')} over ${view.lines.length} working plots, logging "${lines.join('" and "')}"; the colony bar holds the view's figures; the phone kept the light card`;
  });
}

/** B-AC-2: alone, the phone plays each event on its own map; a real click skips to the result, then to the next event. */
async function thePhoneAlonePlaysAndSkips(browser: Browser): Promise<string> {
  const { phone, code, watch: phoneShow } = await openRoom(browser, 'phone room');
  await startAndReachProduction(phone, code, 'phone room');

  const view = await productionOn(phoneShow, 'phone room');
  const [first, second] = view.events.map((e) => e.key) as [EventKey, EventKey];
  const s = eventScript(view, SHOW.eventAt, 'solo');
  const endsAt = phoneShow.view()!.phaseEndsAt!;
  const realAt = (t: number) => endsAt - view.lengthMs + (t / showEnd(view)) * view.lengthMs;
  const map = phone.locator('[data-testid=event-map]');
  const result = (key: EventKey) => phone.locator(`[data-testid=phone-card][data-at=you][data-event=${key}]`);

  await map.and(phone.locator(`[data-event=${first}]`)).waitFor({ timeout: SHOWN_MS });
  const story = STORY_MARK[first];
  if (story) await map.locator(`[data-testid^=${story}]`).first().waitFor({ timeout: SHOWN_MS });
  await shoot(phone, 'phone-844x390-alone-1-playing');
  check((await result(first).count()) === 0, `B-AC-2: the ${first} result is not up while its story plays`);
  check((await phone.getByTestId('skip-hint').textContent())?.includes('skip'), 'B-AC-2: while the story plays the hint says a tap skips');

  await phone.getByTestId('skip').click();
  await result(first).waitFor({ timeout: SHOWN_MS });
  const settles = realAt(s.segments[0]!.settleAt);
  check(Date.now() < settles - AHEAD_MS, `B-AC-2: the click put the ${first} result up ${settles - Date.now()} ms before the show would have`);
  check((await phone.getByTestId('skip-hint').textContent())?.includes('next'), 'B-AC-2: on a result the hint says a tap goes to the next event');
  await shoot(phone, 'phone-844x390-alone-2-result');

  await phone.getByTestId('skip').click();
  await map.and(phone.locator(`[data-event=${second}]`)).waitFor({ timeout: SHOWN_MS });
  const nextAt = realAt(s.segments[0]!.endAt);
  check(Date.now() < nextAt - AHEAD_MS, `B-AC-2: the second click brought ${second} on ${nextAt - Date.now()} ms before the show would have`);
  await result(second).waitFor({ timeout: view.lengthMs + SHOWN_MS });
  const fits = await theRailFitsEachPhone(phone, code, view.events[0]!);
  checkStories((await phoneShow.recording())?.layers ?? [], [first, second], 'the phone alone');
  return `alone, the phone played ${first} then ${second} on its own map; a click skipped to the ${first} result, a second to ${second}; ${fits}`;
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number };
/** Where the rail's parts sit, in CSS pixels, read in the page at one size. */
interface RailBoxes {
  label: (Box & { lineHeight: number }) | null;
  card: Box | null;
  /** The earlier event's line once scrolled into view, and the rail's scroll body that holds it. */
  tail: Box | null;
  scrollBody: Box | null;
  actions: Box | null;
  hint: (Box & { inActions: boolean; visible: boolean }) | null;
  map: Box | null;
  rail: Box | null;
}

/**
 * T-AC-5 at every phone size, on the last event's result, with the earlier event's line under it and the skip hint
 * by the actions: the card's label is one line and the card sits above the actions; the line may be below the fold
 * (the shell's rail carries chat lines above the show) but its scroll body brings it into view, never under the
 * actions; the hint is inside the actions and visible; the map stays clear of the rail. The page's time is paused and the room held, so the one
 * moment stands while the same page is resized (the result is up for well under a second before the hint goes).
 */
async function theRailFitsEachPhone(phone: Page, code: string, earlier: { key: string; title: string }): Promise<string> {
  return held(server, code, async () => {
    const cdp = await phone.context().newCDPSession(phone);
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
    const seen: string[] = [];
    try {
      const shown = await phone.locator('[data-testid=phone-card]').getAttribute('data-event');
      check(shown !== earlier.key, `T-AC-5: the card is the last event's, not ${earlier.key}'s`);
      check((await phone.getByTestId('skip-hint').count()) === 1, 'T-AC-5: the moment is held while the skip hint is up');
      for (const size of PHONE_SIZES) {
        await phone.setViewportSize(size.viewport);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets ?? { top: 0, left: 0, bottom: 0, right: 0 } });
        const at = `T-AC-5 at ${size.name}`;
        const b = await railBoxes(phone, earlier.title);
        check(b.label, `${at}: the card's label is on the page`);
        check(b.label.height < 1.5 * b.label.lineHeight, `${at}: the card's label is one line, ${b.label.height} px for a ${b.label.lineHeight} px line`);
        check(b.card && b.actions, `${at}: the card and the actions are on the page`);
        check(b.card.bottom <= b.actions.top + 0.5, `${at}: the card ends above the actions (card ${b.card.bottom}, actions ${b.actions.top})`);
        check(b.tail && b.scrollBody, `${at}: the earlier event's line is in the rail's scroll body`);
        check(
          b.tail.bottom <= b.actions.top + 0.5 && b.tail.top >= b.scrollBody.top - 0.5,
          `${at}: scrolled into view, the earlier event's line sits in the scroll body above the actions (line ${b.tail.top}..${b.tail.bottom}, body from ${b.scrollBody.top}, actions ${b.actions.top})`,
        );
        check(b.hint, `${at}: the skip hint is on the page`);
        check(b.hint.inActions, `${at}: the skip hint sits in the actions`);
        check(b.hint.visible && b.hint.top >= b.actions.top - 0.5 && b.hint.bottom <= b.actions.bottom + 0.5 && b.hint.right <= size.viewport.width, `${at}: the skip hint is visible inside the actions`);
        check(b.map && b.rail, `${at}: the map and the rail are on the page`);
        check(b.map.right <= b.rail.left + 0.5, `${at}: the map ends clear of the rail (map ${b.map.right}, rail ${b.rail.left})`);
        seen.push(size.name);
      }
    } finally {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0 } });
      await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance' });
      await cdp.detach();
      await phone.setViewportSize(PHONE.viewport);
    }
    return `the result card and the skip hint fit, and the ${earlier.key} line scrolls into view, at ${seen.join(', ')}`;
  });
}

/** The rail's parts at the current size; `earlier` is the title on the earlier event's line. */
function railBoxes(phone: Page, earlier: string): Promise<RailBoxes> {
  // No named functions in the page's code: tsx would wrap them in a helper the page does not have.
  return phone.evaluate((earlier) => {
    const card = document.querySelector('[data-testid=phone-card]');
    const label = card?.querySelector('.label-caps') ?? null;
    const rail = document.querySelector('[data-testid=guide]');
    // The earlier event's line: the row in the rail, outside the card, that carries its title.
    const tail = [...(rail?.querySelectorAll('span') ?? [])].find((s) => !card?.contains(s) && s.textContent === earlier)?.parentElement ?? null;
    const actions = document.querySelector('[data-testid=actions]');
    const hint = document.querySelector('[data-testid=skip-hint]');
    const map = document.querySelector('[data-testid=event-map-box]');
    const [cardBox, labelBox, railBox, tailBox, actionsBox, hintBox, mapBox] = [card, label, rail, tail, actions, hint, map].map((el) => (el ? (el.getBoundingClientRect().toJSON() as Box) : null));
    const style = label ? getComputedStyle(label) : null;
    const lineHeight = style ? (style.lineHeight === 'normal' ? 1.2 * parseFloat(style.fontSize) : parseFloat(style.lineHeight)) : 0;
    // Everything else is read where it stands; then the line is scrolled into view in the body that holds it (the
    // body is the rail's child it sits in), read, and the body scrolled back.
    const scrollBody = [...(rail?.children ?? [])].find((c) => tail && c.contains(tail)) ?? null;
    const scrolledFrom = scrollBody?.scrollTop ?? 0;
    tail?.scrollIntoView({ block: 'nearest' });
    const scrolledTail = tail ? (tail.getBoundingClientRect().toJSON() as Box) : null;
    const scrollBodyBox = scrollBody ? (scrollBody.getBoundingClientRect().toJSON() as Box) : null;
    if (scrollBody) scrollBody.scrollTop = scrolledFrom;
    return {
      label: labelBox ? { ...labelBox, lineHeight } : null,
      card: cardBox ?? null,
      tail: tailBox ? scrolledTail : null,
      scrollBody: scrollBodyBox,
      actions: actionsBox ?? null,
      hint: hint && hintBox ? { ...hintBox, inActions: Boolean(actions?.contains(hint)), visible: hintBox.width > 0 && hintBox.height > 0 && getComputedStyle(hint).visibility !== 'hidden' } : null,
      map: mapBox ?? null,
      rail: railBox ?? null,
    };
  }, earlier);
}

/** A host phone, its show watched, that opens a room with three AI players. */
async function openRoom(browser: Browser, tag: string): Promise<{ phone: Page; code: string; watch: ShowWatch }> {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  const watch = await watchShow(phone);
  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `${tag}: room code, got "${code}"`);
  for (let i = 1; i <= 3; i++) {
    await phone.getByRole('button', { name: 'Add AI player' }).click();
    await phone.locator('[data-testid=seats] li').nth(i).waitFor();
  }
  return { phone, code, watch };
}

/** Starts the game and plays the phone through to MONTH's production, which fires FIRED. */
async function startAndReachProduction(phone: Page, code: string, tag: string): Promise<void> {
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phone.locator('[data-phase]').waitFor({ timeout: SHOWN_MS });
  const game = () => (server.registry.get(code) as unknown as { game: { state: GameState } }).game.state;
  const deadline = Date.now() + PLAY_MS;
  let armed = false;
  for (;;) {
    const { month, phase } = game();
    check(Date.now() < deadline, `${tag}: month ${MONTH}'s production within ${PLAY_MS} ms, still in month ${month}'s ${phase}`);
    if (month === MONTH && phase === 'production') break;
    // The report is pushed as production starts, so the state read in development is the one it is built from.
    if (month === MONTH && phase === 'development' && !armed) {
      fireOnNextProduction(game(), FIRED, tag);
      armed = true;
    }
    await act(phone, phase);
  }
  check(armed, `${tag}: month ${MONTH}'s production was armed in its development`);
  await phone.locator('[data-phase=production]').waitFor({ timeout: SHOWN_MS });
}

/** The phone's part in `phase`, one step: Ready, a claim, the pub, Done, on to the next month. A control not there yet is no failure. */
async function act(phone: Page, phase: string): Promise<void> {
  const press = (name: string | RegExp) => phone.locator(`[data-phase=${phase}]`).getByRole('button', { name }).first().click({ timeout: PRESS_MS });
  try {
    if (phase === 'planning') await press("I'm ready");
    else if (phase === 'landGrant') await press(/CLAIM/);
    else if (phase === 'development') await press('Go to the pub and end your turn');
    else if (phase === 'auction') await press(/^(Ready|Done with .+)$/);
    // The month end has no clock: it waits for the phone's "On to month N", as month-end-steps.ts presses it.
    else if (phase === 'upkeep') await phone.locator('[data-phase=upkeep]').getByTestId('ready').click({ timeout: PRESS_MS });
    else await phone.waitForTimeout(PRESS_MS);
  } catch (err) {
    if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
  }
}

/**
 * Replaces the events of the next month report with `keys`, each built by the engine on the room's own plots, its
 * deltas worked out from what each plot made. A seed fires at most one production event today (spec AM-3).
 */
function fireOnNextProduction(state: GameState, keys: EventKey[], tag: string): void {
  const push = state.history.push.bind(state.history);
  state.history.push = (...reports: MonthReport[]) => {
    state.history.push = push;
    return push(...reports.map((r) => ({ ...r, events: eventsOn(state, r, keys, tag) ?? r.events ?? [] })));
  };
}

function eventsOn(state: GameState, report: MonthReport, keys: EventKey[], tag: string): MonthEvent[] | null {
  const before = new Map((report.lines ?? []).map((l) => [l.tile, l.made - l.parts.reduce((n, p) => n + (p.why === 'event' ? p.delta : 0), 0)]));
  const events: MonthEvent[] = [];
  for (const [i, key] of keys.entries()) {
    // A player row's event lands on one seat's own plots, tried in seat order as rollPhase rolls them.
    const ev =
      key in EVENTS.player ? (state.players.map((p) => buildEvent(state, key, createRng(SEED + i), p.id)).find((e) => e !== null) ?? null) : buildEvent(state, key, createRng(SEED + i));
    if (!ev) {
      unfired.push(`${tag}: month ${MONTH} has no plot a ${key} could hit (seed ${SEED})`);
      return null;
    }
    const plots = ev.plots.map((p, order) => {
      const made = before.get(p.index) ?? 0;
      const after = eventOutput(key, made, order === 0);
      before.set(p.index, after);
      return { ...p, delta: after - made };
    });
    events.push({ ...ev, plots });
  }
  return events;
}

/** The production view a screen received, once it holds the events this step fires. */
async function productionOn(watch: ShowWatch, tag: string): Promise<ProductionView> {
  for (let i = 0; i < SHOWN_MS / 50 && !watch.view()?.production?.events.length; i++) await new Promise((r) => setTimeout(r, 50));
  const production = watch.view()?.production;
  check(production, `${tag}: the screen received a production view`);
  const fired = production.events.map((e) => e.key);
  check(JSON.stringify(fired) === JSON.stringify(FIRED), `${tag}: production fired ${fired.join(', ') || 'nothing'}, not ${FIRED.join(', ')}. ${unfired.join('; ')}`);
  return production;
}

/** Each event played its own story on the map, in fired order. */
function checkStories(layers: string[], order: EventKey[], who: string): void {
  const played = layers.filter((l) => l.startsWith('event:')).map((l) => l.slice(6));
  check(JSON.stringify(played) === JSON.stringify(order), `${who} played ${played.join(', ')}, fired ${order.join(', ')}`);
  for (const key of order) {
    const mark = STORY_MARK[key];
    if (mark) check(layers.some((id) => id.startsWith(mark)), `${who} drew the ${key} story's ${mark}, saw ${layers.join()}`);
  }
}

/** With three chat lines under the TV's header, the map ends at or above the colony bar, and both sit inside the stage. */
async function theTvFitsWithChat(tv: Page, code: string, players: MuleView['players']): Promise<void> {
  const ticker = tv.locator('[data-testid=chat-ticker] [data-testid^=chat-line-]');
  const room = server.registry.get(code) as unknown as { deliver(from: string, text: string): unknown };
  const ais = players.filter((p) => p.isAi);
  for (let i = await ticker.count(); i < CHATTER.length; i++) room.deliver(ais[i % ais.length]!.id, CHATTER[i]!);
  await ticker.nth(CHATTER.length - 1).waitFor({ timeout: SHOWN_MS });
  const box = async (selector: string) => {
    const b = await tv.locator(selector).first().boundingBox();
    check(b, `F4: the TV draws ${selector}`);
    return b;
  };
  const stage = await box('[data-phase=production]');
  const map = await box('[data-phase=production] [data-testid=map-show]');
  const bar = await box('[data-testid=colony-bar]');
  const inside = (b: typeof stage) => b.x >= stage.x - 0.5 && b.y >= stage.y - 0.5 && b.x + b.width <= stage.x + stage.width + 0.5 && b.y + b.height <= stage.y + stage.height + 0.5;
  const at = (b: typeof stage) => `${Math.round(b.y)}..${Math.round(b.y + b.height)}`;
  check(map.y + map.height <= bar.y + 0.5, `F4: with three chat lines the map (${at(map)}) ends at or above the colony bar (${at(bar)})`);
  check(inside(map) && inside(bar), `F4: the map (${at(map)}) and the colony bar (${at(bar)}) sit inside the stage (${at(stage)})`);
}

/** What the log calls the plots: by their one good's kind, "plots" when the goods mix. */
function plotNoun(good: Good | undefined, n: number): string {
  const kind: Partial<Record<Good, [string, string]>> = { food: ['farm', 'farms'], water: ['well', 'wells'], energy: ['plant', 'plants'], smithore: ['mine', 'mines'], crystite: ['mine', 'mines'] };
  const [one, many] = (good && kind[good]) ?? ['plot', 'plots'];
  return n === 1 ? one : many;
}

function signed(n: number): string {
  return `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
}

/** B-AC-1: a log line states what the view holds for its event: per good, the sum and the plots; a personal event's player. */
function checkLogLine(text: string, ev: ProductionView['events'][number], view: ProductionView, players: MuleView['players']): void {
  const goodAt = (x: number, y: number) => view.lines.find((l) => l.x === x && l.y === y)?.good;
  // A hit that changed nothing is no loss: in no figure and no plot count.
  const counted = ev.hits.filter((h) => h.delta !== 0);
  const per = new Map<Good | undefined, number>();
  for (const h of counted) per.set(goodAt(h.x, h.y), (per.get(goodAt(h.x, h.y)) ?? 0) + h.delta);
  const [only] = per.keys();
  const noun = plotNoun(per.size === 1 ? only : undefined, counted.length);
  const holds = counted.length ? `${[...per].map(([g, n]) => `${signed(n)} ${g ? GOOD_NAME[g] : '?'}`).join(', ')} on ${counted.length} ${noun}` : '';
  // "Drought −2 Food, −2 Water on 4 plots": each good's figure, then the plots they fell on, named by kind.
  const figures = [...text.matchAll(/([−+]\d+) ([A-Z][\w ]*?)(?=,| on )/g)].map(([, n, good]) => `${n} ${good}`);
  const on = / on (\d+ \w+)/.exec(text)?.[1];
  const stated = figures.length ? `${figures.join(', ')} on ${on}` : '';
  check(stated === holds, `B-AC-1: the TV log says "${text}" for ${ev.key}; the view holds "${holds}"`);
  if (ev.scope === 'personal') {
    const owner = view.lines.find((l) => l.x === ev.origin.x && l.y === ev.origin.y)?.owner;
    const name = players.find((p) => p.id === owner)?.name;
    check(name && text.includes(`${name}: `), `B-AC-1: the TV log names ${owner}'s player for ${ev.key}: "${text}"`);
  }
}

/** B-AC-1: each player's slot carries what the month's events did to their plots (RULE-2), per good, and nothing else. */
async function checkColonyChips(tv: Page, view: ProductionView): Promise<void> {
  for (const owner of new Set(view.lines.map((l) => l.owner))) {
    const change = new Map<Good, number>();
    for (const l of view.lines.filter((x) => x.owner === owner)) change.set(l.good, (change.get(l.good) ?? 0) + finalUnits(l, view.events) - l.made);
    const want = [...change.values()].filter((n) => n !== 0).sort((a, b) => a - b);
    const got = (await tv.getByTestId(`slot-${owner}`).locator('[data-delta]').evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-delta'))))).sort((a, b) => a - b);
    check(JSON.stringify(got) === JSON.stringify(want), `B-AC-1: ${owner}'s slot shows ${got.join()} from the events, the view holds ${want.join()}`);
  }
}

async function shoot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-e2e.png`) });
}
