/**
 * Plot info as a step of the whole game: the geo drone's Scan and its Drone report in the rail (B-AC-1), then every plot
 * you own listed with its dots, in planning's My plots and on the walking screen's Plots chip (B-AC-2). smoke.ts calls
 * it once, in month 2's planning, with the hub open and nobody ready; the walking screen is read in a second room of
 * the same server, taken to its first development. Each room's part runs held.
 */
import { DEVELOPMENT, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { bestOf, dotsOf, gemsIn, GOOD_NAME, type RawGood } from '@mule/ui';
import { errors as playwrightErrors, type Locator, type Page } from 'playwright';
import { fmt, mapTiles } from '../src/game/derive';
import { check, doneWithLand, held as heldIn, PHONE, PHONE_SMALL, type GameStepContext } from './harness';
import { readyThroughTheElection } from './politics-steps';
import { plotName, tapPlot, type Plot } from './special-steps';

/** The promise: the report shows within this long of the tap on Scan. */
const REPORT_MS = 2_000;
/** A screen's wait for what a tap shows at once. */
const STEP_MS = 2_000;
const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

type Room = {
  game: { state: GameState; handle(seat: string, intent: unknown): void };
  viewFor(seat: string | null): { game?: MuleView | null };
  broadcast(): void;
  dispose(): void;
};

const B_AC_1 = 'B-AC-1 (plot info): two free plots picked, Scan, the rail\'s Drone report shows both with each good\'s 0–3 dots and "best for", 60 cr gone, before Ready';
const B_AC_2 = 'B-AC-2 (plot info): My plots in planning and the Plots chip on the walking screen list every owned plot once, analysed ones with 0–3 dots and the gem, others "Not analysed …"';
/** How long the second room has to get through month 1's election, planning and land grant to its development. */
const TO_DEVELOPMENT_MS = 90_000;

/** The phone sizes the whole report must fit at, both plots in the rail with no scroll (UBER-AC-1, spec §8). */
const FIT_SIZES = [PHONE.viewport, PHONE_SMALL.viewport];

/** Where a row of the report lies against the rail's scroll box as the rail stands, in px from the box's visible top. */
type Fit = { id: string; top: number; bottom: number; box: number };

/**
 * Measures each `report-x-y` row's box against the rail's visible box as the rail stands, never scrolling it: what the
 * player sees without touching it, whatever else the rail holds above the report (a strike alert, the Now card).
 */
async function reportFit(report: Locator): Promise<Fit[]> {
  return report.evaluate(async (el) => {
    let box = el.parentElement;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!box) throw new Error('the Drone report sits in no scroll box');
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const top = box.getBoundingClientRect().top;
    return [...el.querySelectorAll<HTMLElement>('[data-testid^=report-]')].map((row) => {
      const r = row.getBoundingClientRect();
      return { id: row.dataset.testid!, top: Math.round(r.top - top), bottom: Math.round(r.bottom - top), box: box.clientHeight };
    });
  });
}

/** Both scanned plots' rows, fully inside the rail without a scroll, at every FIT_SIZES size; the phone is left at its own. */
async function bothPlotsFit(phone: Page, report: Locator, picks: Plot[]): Promise<string> {
  const said: string[] = [];
  try {
    for (const size of FIT_SIZES) {
      await phone.setViewportSize(size);
      const rows = await reportFit(report);
      for (const p of picks) {
        const row = rows.find((r) => r.id === `report-${p.x}-${p.y}`);
        check(row, `${B_AC_1}: at ${size.width}×${size.height} the report has a row for plot ${plotName(p)}`);
        check(row.top >= 0 && row.bottom <= row.box, `${B_AC_1}: at ${size.width}×${size.height} plot ${plotName(p)}'s row lies inside the rail without a scroll: rows ${row.top}–${row.bottom} px in a ${row.box} px box`);
      }
      const last = rows.at(-1)!;
      said.push(`${size.width}×${size.height}: the second plot ends at ${last.bottom} of ${last.box} px`);
    }
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }
  return said.join(', ');
}

/** Waits for `locator`; a timeout fails as the check it stands for. */
async function appears(locator: Locator, timeout: number, promise: string): Promise<void> {
  try {
    await locator.waitFor({ timeout });
  } catch (err) {
    if (err instanceof playwrightErrors.TimeoutError) check(false, `${promise}: not shown within ${timeout} ms`);
    throw err;
  }
}

/** B-AC-1, front to back: the phone's rail in the browser, and the server's views for every seat and the TV. */
export async function theDroneReportsInTheRail({ phone, server, code, held }: GameStepContext, seat = 's1'): Promise<string> {
  const room = server.registry.get(code) as unknown as Room | undefined;
  check(room, `a room ${code} on the server`);
  const state = room.game.state;
  /** What the server sends that seat, or the TV with null. */
  const viewOf = (who: string | null): MuleView => {
    const view = room.viewFor(who).game;
    check(view, `${B_AC_1}: the server has a game view for ${who ?? 'the TV'}`);
    return view;
  };
  const said = await held(async () => {
    check(state.phase === 'planning', `${B_AC_1}: runs in planning, not in ${state.phase}`);
    const me = state.players.find((p) => p.id === seat);
    check(me, `${B_AC_1}: seat ${seat} in the game`);
    check(me.droneOrder.length === 0, `${B_AC_1}: no drone sent yet this planning`);
    const others = state.players.filter((p) => p.id !== seat);
    const index = (p: Plot) => p.y * state.width + p.x;
    // Free for the drone, and no seat's geology yet, so any ground a view holds for them afterwards came from this Scan.
    const free = mapTiles(viewOf(seat)).filter((t) => t.owner === null && !t.object && t.terrain !== 'store' && !state.players.some((p) => p.analysed.includes(index(t))));
    check(free.length >= DEVELOPMENT.dronePlots + 1, `${B_AC_1}: ${DEVELOPMENT.dronePlots + 1} free plots nobody has analysed, got ${free.length}`);
    const picks: Plot[] = free.slice(0, DEVELOPMENT.dronePlots).map((t) => ({ x: t.x, y: t.y }));
    const moneyBefore = me.money;

    const planning = phone.locator('[data-phase=planning]');
    const hubMap = planning.getByTestId('hub-map');
    // Now open, as a player who read it leaves it: the rail then holds more above the report than its box can show, on
    // every seed, so the report fits only by keeping itself in view (a strike alert above does the same).
    if (!(await planning.getByTestId('now-fold').count())) await planning.getByTestId('now').click({ timeout: STEP_MS });
    await planning.getByTestId('tool-drone').click({ timeout: STEP_MS });
    for (const p of picks) await tapPlot(phone, hubMap, p, state.width, STEP_MS);
    const scan = planning.getByTestId('scan');
    const words = `Scan · ${picks.length} of ${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`;
    await appears(scan.filter({ hasText: words }), STEP_MS, `${B_AC_1}: the drone's button reads "${words}"`);

    const tapped = Date.now();
    await scan.click({ timeout: STEP_MS });
    const report = planning.getByTestId('scan-report');
    for (const p of picks) await appears(report.getByTestId(`report-${p.x}-${p.y}`), Math.max(1, tapped + REPORT_MS - Date.now()), `${B_AC_1}: the rail's Drone report shows plot ${plotName(p)} within ${REPORT_MS} ms of Scan`);
    const tookMs = Date.now() - tapped;
    check(tookMs <= REPORT_MS, `${B_AC_1}: the report shows within ${REPORT_MS} ms of Scan, took ${tookMs} ms`);
    check((await report.getByText('Only you').count()) === 1, `${B_AC_1}: the report is marked Only you`);
    const fit = await bothPlotsFit(phone, report, picks);

    // Each plot's row against the ground the server holds for it.
    for (const p of picks) {
      const dots = dotsOf(state.tiles[index(p)]!.ground);
      const row = report.getByTestId(`report-${p.x}-${p.y}`);
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      check(text.startsWith(`${plotName(p)} · `), `${B_AC_1}: the row names plot ${plotName(p)} first, got "${text}"`);
      const best = dots[bestOf(dots)] > 0 ? `best for ${GOOD_NAME[bestOf(dots)]}` : 'nothing worth working';
      check(text.toLowerCase().includes(best.toLowerCase()), `${B_AC_1}: plot ${plotName(p)} says "${best}", got "${text}"`);
      for (const g of RAW) {
        const shown = await row.getByTestId(`dots-${g}`).getAttribute('data-n', { timeout: STEP_MS });
        check(shown === String(dots[g]), `${B_AC_1}: plot ${plotName(p)} shows ${g} as ${dots[g]} of 3, got ${shown}`);
      }
    }

    // 60 cr gone, on the server and on the phone; still planning, nobody pressed Ready.
    const fee = DEVELOPMENT.droneFee;
    check(me.money === moneyBefore - fee, `${B_AC_1}: the server took ${fee} cr, money ${moneyBefore} → ${me.money}`);
    await appears(planning.getByTestId('money').filter({ hasText: `${fmt(moneyBefore - fee)} cr` }), STEP_MS, `${B_AC_1}: the phone shows ${fmt(moneyBefore - fee)} cr`);
    const mine = viewOf(seat);
    check(mine.phase === 'planning' && mine.players.find((p) => p.id === seat)?.ready === false, `${B_AC_1}: the report came before Ready, still in planning`);
    for (const p of picks) check(mine.tiles[index(p)]?.ground, `${B_AC_1}: the server's view for ${seat} holds plot ${plotName(p)}'s ground`);

    // Negative: only this seat's view holds that ground; never the TV's, never another seat's.
    for (const p of picks) {
      check(viewOf(null).tiles[index(p)]?.ground === undefined, `${B_AC_1} (negative): the TV's view holds no ground for plot ${plotName(p)}`);
      for (const o of others) check(viewOf(o.id).tiles[index(p)]?.ground === undefined, `${B_AC_1} (negative): ${o.name}'s view holds no ground for plot ${plotName(p)}`);
    }

    // Negative: a second Scan this planning is refused; the phone offers none, and the server turns one down.
    await appears(planning.getByTestId('drone-used'), STEP_MS, `${B_AC_1} (negative): the rail says one drone each planning`);
    check((await planning.getByTestId('scan').count()) === 0, `${B_AC_1} (negative): once scanned, the phone offers no second Scan`);
    const again = free.slice(DEVELOPMENT.dronePlots, DEVELOPMENT.dronePlots + 1).map((t) => ({ x: t.x, y: t.y }));
    let refused = '';
    try {
      room.game.handle(seat, { type: 'drone', plots: again });
    } catch (err) {
      refused = err instanceof Error ? err.message : String(err);
    }
    check(refused !== '', `${B_AC_1} (negative): the server refuses a second Scan in the same planning`);
    check(me.money === moneyBefore - fee, `${B_AC_1} (negative): the refused Scan cost nothing, money ${me.money}`);

    // Leave the hub as smoke found it.
    await planning.getByTestId('tool-look').click({ timeout: STEP_MS });
    return `plots ${picks.map(plotName).join(', ')} reported in ${tookMs} ms, both in the rail unscrolled (${fit}), ${fee} cr gone; the TV and ${others.length} other seats hold no ground for them; a second Scan refused ("${refused}")`;
  });
  console.log(`✓ ${B_AC_1}: ${said}`);
  const listed = `${await myPlotsInPlanning({ phone, server, code, held }, seat)}; ${await thePlotsChipOnTheWalkingScreen({ phone, server })}`;
  console.log(`✓ ${B_AC_2}: ${listed}`);
  return `${said}; ${listed}`;
}

/** The room behind `code` on the in-process server, as these steps reach into it. */
function roomOf(server: GameStepContext['server'], code: string): Room {
  const room = server.registry.get(code) as unknown as Room | undefined;
  check(room, `a room ${code} on the server`);
  return room;
}

/**
 * B-AC-2's Given, seeded on the server as makeHungry seeds hunger: `seat` owns at least two plots, one of them holding
 * Crystite or Rare earth (a free one is given when none of its own does), and every plot of its but one is analysed.
 * Sends every screen the view that makes.
 */
function someOfMyPlotsAnalysed(room: Room, seat: string): void {
  const state = room.game.state;
  const me = state.players.find((p) => p.id === seat);
  check(me, `${B_AC_2}: seat ${seat} in the game`);
  const index = (t: Plot) => t.y * state.width + t.x;
  const view = room.viewFor(seat).game;
  check(view, `${B_AC_2}: a view for ${seat}`);
  const free = mapTiles(view).filter((t) => t.owner === null && !t.object && t.terrain !== 'store');
  const give = (t: Plot) => Object.assign(state.tiles[index(t)]!, { owner: seat, outfit: null });
  const hasGem = (t: Plot) => gemsIn(dotsOf(state.tiles[index(t)]!.ground)).length > 0;
  const owned = () => state.tiles.filter((t) => t.owner === seat);
  if (!owned().some(hasGem)) {
    const gem = free.find(hasGem);
    check(gem, `${B_AC_2}: a free plot holding Crystite or Rare earth to give ${seat}`);
    give(gem);
  }
  for (const t of free.filter((t) => !hasGem(t) && !me.analysed.includes(index(t)))) {
    if (owned().length >= 2) break;
    give(t);
  }
  const mine = owned();
  const kept = mine.find((t) => !hasGem(t) && !me.analysed.includes(index(t)));
  check(kept, `${B_AC_2}: a plot of ${seat}'s to leave unanalysed`);
  for (const t of mine) if (t !== kept && !me.analysed.includes(index(t))) me.analysed.push(index(t));
  room.broadcast();
}

/**
 * Every plot `seat` owns in its view is listed in `list` exactly once, and nothing else is: an analysed plot with each
 * good's dots and its gems, the others "Not analysed". Returns how many of each it saw.
 */
async function listsEveryPlot(list: Locator, view: MuleView, seat: string, where: string): Promise<{ analysed: number; gems: number; not: number }> {
  const owned = view.tiles.filter((t) => t.owner === seat);
  const ids = await list.locator('[data-testid^=plot-row-]').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.testid ?? ''));
  for (const t of owned) {
    const n = ids.filter((id) => id === `plot-row-${t.x}-${t.y}`).length;
    check(n === 1, `${B_AC_2}: ${where} lists plot ${plotName(t)} once, got ${n}`);
  }
  for (const t of view.tiles.filter((t) => t.owner !== null && t.owner !== seat)) {
    check(!ids.includes(`plot-row-${t.x}-${t.y}`), `${B_AC_2} (negative): ${where} never lists ${t.owner}'s plot ${plotName(t)}`);
  }
  check(ids.length === owned.length, `${B_AC_2}: ${where} lists ${owned.length} plots, the ones ${seat} owns, got ${ids.length}`);
  const seen = { analysed: 0, gems: 0, not: 0 };
  for (const t of owned) {
    const row = list.getByTestId(`plot-row-${t.x}-${t.y}`);
    if (!t.ground) {
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      check(text.includes('Not analysed'), `${B_AC_2}: ${where}: plot ${plotName(t)}, not analysed, says "Not analysed …", got "${text}"`);
      check((await row.getByTestId('good-dots').count()) === 0, `${B_AC_2}: ${where}: plot ${plotName(t)}, not analysed, draws no dots`);
      seen.not++;
      continue;
    }
    const dots = dotsOf(t.ground);
    for (const g of RAW) {
      const shown = await row.getByTestId(`dots-${g}`).getAttribute('data-n', { timeout: STEP_MS });
      check(shown === String(dots[g]), `${B_AC_2}: ${where}: plot ${plotName(t)} shows ${g} as ${dots[g]} of 3, got ${shown}`);
    }
    const gems = gemsIn(dots);
    for (const g of ['crystite', 'rareEarth'] as const) {
      const n = await row.getByTestId(`gem-${g}`).count();
      check(n === (gems.includes(g) ? 1 : 0), `${B_AC_2}: ${where}: plot ${plotName(t)} ${gems.includes(g) ? 'carries' : 'carries no'} the ${g} gem, got ${n}`);
    }
    seen.analysed++;
    if (gems.length > 0) seen.gems++;
  }
  check(seen.gems > 0 && seen.not > 0, `${B_AC_2}: ${where} was read with a plot holding a gem and one not analysed: ${JSON.stringify(seen)}`);
  return seen;
}

/** B-AC-2 in planning: the My plots tool lists every plot the seat owns, against the server's view for it. */
async function myPlotsInPlanning({ phone, server, code, held: inRoom }: Pick<GameStepContext, 'phone' | 'server' | 'code' | 'held'>, seat: string): Promise<string> {
  const room = roomOf(server, code);
  return inRoom(async () => {
    check(room.game.state.phase === 'planning', `${B_AC_2}: My plots is read in planning, not in ${room.game.state.phase}`);
    someOfMyPlotsAnalysed(room, seat);
    const planning = phone.locator('[data-phase=planning]');
    const tool = planning.getByTestId('tool-plots');
    await appears(tool, STEP_MS, `${B_AC_2}: planning offers the My plots tool`);
    await tool.click({ timeout: STEP_MS });
    const list = planning.getByTestId('my-plots');
    const view = room.viewFor(seat).game!;
    const first = view.tiles.find((t) => t.owner === seat)!;
    await appears(list.getByTestId(`plot-row-${first.x}-${first.y}`), STEP_MS, `${B_AC_2}: My plots lists plot ${plotName(first)}`);
    const seen = await listsEveryPlot(list, view, seat, 'My plots in planning');
    await planning.getByTestId('tool-look').click({ timeout: STEP_MS });
    return `planning lists ${seen.analysed + seen.not} plots (${seen.analysed} analysed, ${seen.gems} with a gem, ${seen.not} not)`;
  });
}

/**
 * B-AC-2 on the walking screen: a second room on the same server, one phone and an AI, taken through month 1 to its
 * development; there the Plots chip opens the list over the map and closes it, at the smoke's phone and the small one.
 * The room is disposed afterwards, so nothing of it runs on.
 */
async function thePlotsChipOnTheWalkingScreen({ phone, server }: Pick<GameStepContext, 'phone' | 'server'>): Promise<string> {
  const browser = phone.context().browser();
  check(browser, `${B_AC_2}: the smoke's browser`);
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  let code = '';
  try {
    await page.goto(new URL(phone.url()).origin);
    await page.getByPlaceholder('Heiko').fill('Lena');
    await page.getByRole('button', { name: 'Start a new game' }).click();
    await page.getByText("You're at the table").waitFor();
    code = (await page.getByTestId('room-code').textContent())?.trim() ?? '';
    await page.getByRole('button', { name: 'Add AI player' }).click();
    await page.locator('[data-testid=seats] li').nth(1).waitFor();
    await page.getByRole('button', { name: 'Start game' }).click();
    const started = Date.now();
    await readyThroughTheElection(page, TO_DEVELOPMENT_MS);
    await doneWithLand(page);
    const walking = page.locator('[data-phase=development] [data-testid=phone-game]');
    await appears(walking, Math.max(1, started + TO_DEVELOPMENT_MS - Date.now()), `${B_AC_2}: the second room reaches its walking screen`);
    const room = roomOf(server, code);
    const seat = room.game.state.players.find((p) => p.name === 'Lena')?.id;
    check(seat, `${B_AC_2}: Lena plays in the second room`);
    return await heldIn(server, code, async () => {
      someOfMyPlotsAnalysed(room, seat);
      const said: string[] = [];
      try {
        for (const size of FIT_SIZES) {
          await page.setViewportSize(size);
          const chip = walking.getByTestId('plots-chip');
          const panel = walking.getByTestId('plots-panel');
          await appears(chip, STEP_MS, `${B_AC_2}: at ${size.width}×${size.height} the walking screen offers the Plots chip`);
          await chip.click({ timeout: STEP_MS });
          await appears(panel, STEP_MS, `${B_AC_2}: at ${size.width}×${size.height} the Plots chip opens the list`);
          const seen = await listsEveryPlot(panel, room.viewFor(seat).game!, seat, `the walking screen's Plots list at ${size.width}×${size.height}`);
          await chip.click({ timeout: STEP_MS });
          await panel.waitFor({ state: 'detached', timeout: STEP_MS });
          said.push(`${size.width}×${size.height} ${seen.analysed + seen.not} plots`);
        }
      } finally {
        await page.setViewportSize(PHONE.viewport);
      }
      return `the walking screen's Plots chip lists them, and closes (${said.join(', ')})`;
    });
  } finally {
    await context.close();
    if (code) server.registry.get(code)?.dispose();
  }
}
