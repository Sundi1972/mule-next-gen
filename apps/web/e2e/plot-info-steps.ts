/**
 * Plot info as a step of the whole game: the geo drone's Scan and its Drone report in the rail (B-AC-1), every plot you
 * own listed with its dots, in planning's My plots and on the walking screen's Plots chip (B-AC-2), and the card Analyse
 * opens on the walking screen (B-AC-3). smoke.ts calls it once, in month 2's planning, with the hub open and nobody
 * ready; the walking screen is read in a second room of the same server, taken to its first development with a second
 * phone and a TV. The planning parts run held; Analyse needs the room's tick, so it runs unheld.
 */
import { DEVELOPMENT, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { bestOf, dotsOf, gemsIn, GOOD_NAME, type RawGood } from '@mule/ui';
import { errors as playwrightErrors, type Locator, type Page } from 'playwright';
import { fmt, mapTiles } from '../src/game/derive';
import { check, doneWithLand, held as heldIn, PHONE, PHONE_SMALL, TV, type GameStepContext } from './harness';
import { readyThroughTheElection } from './politics-steps';
import { LAPTOP } from './shell-steps';
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
const B_AC_2 = 'B-AC-2 (plot info): My plots in planning and the Plots chip on the walking screen (phone and laptop) list every owned plot once, analysed ones with 0–3 dots and the gem, others "Not analysed …"';
const B_AC_3 = 'B-AC-3 (plot info): analysing a free plot holding Crystite shows the card with its dots and "best for … · Crystite n" within 1 s of the assay\'s end';
/** How long the second room has to get through month 1's election, planning and land grant to its development. */
const TO_DEVELOPMENT_MS = 90_000;
/** The promise: the Analyse card shows within this long of the assay's end. */
const CARD_MS = 1_000;
/** How often the step reads the server's assay while it waits for one. */
const ASSAY_POLL_MS = 5;
/** How early the card may show against the server's assay end: the phone's estimate of the server clock, not a rule. */
const CLOCK_SLACK_MS = 300;
/**
 * The second room's development clock, set when its walking screen shows: at the smoke's phaseScale a turn lasts 6 s,
 * too short for the steps to read it while it runs.
 */
const SECOND_ROOM_TURN_MS = 60_000;

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
    // Now open, as a player who read it leaves it: the rail then holds more above the report than its box can show, so
    // the report fits only by keeping itself in view (a strike alert above does the same). A Governor's strike card is
    // drawn whole, with no fold, and is taller still.
    const folded = planning.getByTestId('now');
    if (!(await planning.getByTestId('now-fold').count()) && (await folded.count())) await folded.click({ timeout: STEP_MS });
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
  const planned = await myPlotsInPlanning({ phone, server, code, held }, seat);
  const second = await theSecondRoomsDevelopment({ phone, server });
  const listed = `${planned}; ${second.walking}`;
  console.log(`✓ ${B_AC_2}: ${listed}`);
  return `${said}; ${listed}; ${second.analysed}`;
}

/** The room behind `code` on the in-process server, as these steps reach into it. */
function roomOf(server: GameStepContext['server'], code: string): Room {
  const room = server.registry.get(code) as unknown as Room | undefined;
  check(room, `a room ${code} on the server`);
  return room;
}

/**
 * B-AC-2's Given, seeded on the server as makeHungry seeds hunger: `seat` owns at least two plots, one of them holding
 * Crystite or Rare earth (a free one is given when none of its own does), every plot of its but one is analysed, and
 * another seat owns a plot. Sends every screen the view that makes.
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
  // One plot left unanalysed whatever the seat already owns, then at least two plots in all.
  const unanalysed = (t: Plot) => !hasGem(t) && !me.analysed.includes(index(t));
  for (const t of free.filter(unanalysed)) {
    if (owned().some(unanalysed) && owned().length >= 2) break;
    give(t);
  }
  // Another seat owns a plot, so "never lists another player's plot" is read against one.
  const other = state.players.find((p) => p.id !== seat);
  check(other, `${B_AC_2}: another seat in the game`);
  if (!state.tiles.some((t) => t.owner !== null && t.owner !== seat)) {
    const theirs = free.find((t) => state.tiles[index(t)]!.owner === null);
    check(theirs, `${B_AC_2}: a free plot to give ${other.name}`);
    Object.assign(state.tiles[index(theirs)]!, { owner: other.id, outfit: null });
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
  const theirs = view.tiles.filter((t) => t.owner !== null && t.owner !== seat);
  check(theirs.length > 0, `${B_AC_2} (negative): ${where} is read with another seat owning a plot`);
  for (const t of theirs) {
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

/** The room's game as these steps reach into it: the steered floor and the development clock. */
type SteeredGame = Room['game'] & {
  steering: { floor: { colonists: { id: string; x: number; y: number; space: 'map' | 'hall' }[] } } | null;
  devEndsAt: number | null;
};

/** The server's assay end for `seat`, epoch ms, once its colonist is assaying; null until then. */
function assayEndOf(room: Room, seat: string): number | null {
  return room.viewFor(seat).game?.players.find((p) => p.id === seat)?.colonist?.assayUntil ?? null;
}

/**
 * B-AC-3, front to back, unheld (the press and the assay run on the room's tick): Crystite is seeded under a free plot
 * nobody has analysed, Lena's colonist is put on it, and her phone presses ANALYSE. Her phone shows the card within
 * CARD_MS of the assay's end; the server's views for the TV and the other seats hold no ground for it, and the TV and
 * Kai's phone show no card.
 */
async function analyseSaysWhatItFound(room: Room, screens: { lena: Page; kai: Page; tv: Page }, seat: string): Promise<string> {
  const state = room.game.state;
  const game = room.game as SteeredGame;
  const index = (t: Plot) => t.y * state.width + t.x;
  const view = room.viewFor(seat).game;
  check(view, `${B_AC_3}: a view for ${seat}`);
  // A free plot no seat has analysed, not a lake (Analyse reaches those from the shore), whose best good beats Crystite 1.
  const plot = mapTiles(view).find((t) => {
    if (t.owner !== null || t.object || t.terrain === 'store' || t.terrain === 'lake' || state.players.some((p) => p.analysed.includes(index(t)))) return false;
    const dots = dotsOf({ ...state.tiles[index(t)]!.ground, crystite: 1 });
    return bestOf(dots) !== 'crystite';
  });
  check(plot, `${B_AC_3}: a free plot nobody has analysed`);
  const tile = state.tiles[index(plot)]!;
  tile.ground = { ...tile.ground, crystite: 1 };
  const dots = dotsOf(tile.ground);
  const best = GOOD_NAME[bestOf(dots)];

  const steering = game.steering;
  check(steering, `${B_AC_3}: the second room steers its development`);
  steering.floor = { ...steering.floor, colonists: steering.floor.colonists.map((c) => (c.id === seat ? { ...c, space: 'map', x: plot.x + 0.5, y: plot.y + 0.5, moving: false } : c)) };
  const walking = screens.lena.locator('[data-phase=development] [data-testid=phone-game]');
  await appears(walking.getByTestId('action-verb').filter({ hasText: 'ANALYSE' }), STEP_MS, `${B_AC_3}: on plot ${plotName(plot)} Lena's button offers ANALYSE`);
  // Watched from the server's side from before the press: at the smoke's phaseScale an assay lasts under a second, and a
  // poll through the browser can come back after it is over.
  const me = state.players.find((p) => p.id === seat)!;
  const seen: { assayEnd: number | null; analysed: boolean } = { assayEnd: null, analysed: false };
  const watch = setInterval(() => {
    seen.analysed ||= me.analysed.includes(index(plot));
    seen.assayEnd ??= assayEndOf(room, seat);
  }, ASSAY_POLL_MS);
  const pressed = Date.now();
  try {
    await walking.getByTestId('action-button').click({ timeout: STEP_MS });
    while (seen.assayEnd === null && Date.now() < pressed + STEP_MS) await new Promise((r) => setTimeout(r, ASSAY_POLL_MS));
  } finally {
    clearInterval(watch);
  }
  check(seen.analysed, `${B_AC_3}: the press analysed plot ${plotName(plot)} on the server`);
  const assayEnd = seen.assayEnd;
  check(assayEnd !== null, `${B_AC_3}: the server had Lena assaying plot ${plotName(plot)} within ${STEP_MS} ms of the press`);
  const card = walking.getByTestId('analyse-card');
  await appears(card, Math.max(1, assayEnd + CARD_MS - Date.now()), `${B_AC_3}: the card shows within ${CARD_MS} ms of the assay's end`);
  const shownAt = Date.now();
  check(shownAt - assayEnd <= CARD_MS, `${B_AC_3}: the card shows within ${CARD_MS} ms of the assay's end, took ${shownAt - assayEnd} ms`);
  check(shownAt - assayEnd >= -CLOCK_SLACK_MS, `${B_AC_3}: the card opens once the assay is done, not ${assayEnd - shownAt} ms before it`);

  const text = (await card.innerText()).replace(/\s+/g, ' ');
  check(text.includes(`${plotName(plot)} · `) && text.includes('analysed'), `${B_AC_3}: the card names plot ${plotName(plot)} as analysed, got "${text}"`);
  const line = `best for ${best} · Crystite ${dots.crystite}`;
  check(text.includes(line), `${B_AC_3}: the card says "${line}", got "${text}"`);
  for (const g of RAW) {
    const shown = await card.getByTestId(`dots-${g}`).getAttribute('data-n', { timeout: STEP_MS });
    check(shown === String(dots[g]), `${B_AC_3}: the card shows ${g} as ${dots[g]} of 3, got ${shown}`);
  }
  check((await card.getByText('Only you').count()) === 1, `${B_AC_3}: the card is marked Only you`);
  // TODO(PR-3a): B-AC-3's map gem. Once WS4's gem is in HoloMap, assert here that Lena's map draws the Crystite gem on
  // `plot`, and below, in the negative, that neither the TV's map nor Kai's draws one.

  // Negative (HC-1): only Lena's view holds the plot's ground; the TV and Kai's phone show no card and no dots for it.
  check(room.viewFor(seat).game?.tiles[index(plot)]?.ground, `${B_AC_3}: the server's view for Lena holds plot ${plotName(plot)}'s ground`);
  check(room.viewFor(null).game?.tiles[index(plot)]?.ground === undefined, `${B_AC_3} (negative): the TV's view holds no ground for plot ${plotName(plot)}`);
  for (const o of state.players.filter((p) => p.id !== seat)) {
    check(room.viewFor(o.id).game?.tiles[index(plot)]?.ground === undefined, `${B_AC_3} (negative): ${o.name}'s view holds no ground for plot ${plotName(plot)}`);
  }
  for (const [who, page] of [['the TV', screens.tv] as const, ["Kai's phone", screens.kai] as const]) {
    const shown = page.locator('[data-phase=development]');
    await appears(shown.getByTestId(`map-plot-${plot.x}-${plot.y}`).first(), STEP_MS, `${B_AC_3} (negative): ${who} draws plot ${plotName(plot)}`);
    check((await page.getByTestId('analyse-card').count()) === 0, `${B_AC_3} (negative): ${who} shows no Analyse card`);
    const label = (await shown.getByTestId(`map-plot-${plot.x}-${plot.y}`).first().getAttribute('aria-label')) ?? '';
    check(!label.includes('of 3'), `${B_AC_3} (negative): ${who}'s map gives plot ${plotName(plot)} no dots, labelled "${label}"`);
  }
  return `plot ${plotName(plot)} (${line}) analysed; the card showed ${shownAt - assayEnd} ms after the assay's end; the TV and the other seats' views hold no ground for it, and the TV and Kai's phone show no card`;
}

/** The development clock's seconds left as `walking` shows them. */
async function clockSeconds(walking: Locator): Promise<number> {
  const label = (await walking.getByTestId('shared-clock').getByRole('timer').getAttribute('aria-label', { timeout: STEP_MS })) ?? '';
  const s = /^(\d+) seconds left/.exec(label);
  check(s, `the clock says its seconds left, got "${label}"`);
  return Number(s[1]);
}

/** How long the laptop's list stays open while the step watches the clock run under it. */
const CLOCK_WATCH_MS = 1_500;

/**
 * B-AC-2's walking half on the laptop, unheld so the game runs: the Plots chip in the laptop's status opens the list,
 * the clock keeps running under it, and the chip closes it. The page is left at the phone's size.
 */
async function thePlotsChipOnTheLaptop(page: Page, room: Room, seat: string): Promise<string> {
  try {
    await page.setViewportSize(LAPTOP);
    const walking = page.locator('[data-phase=development] [data-testid=laptop-game]');
    const where = `the laptop's Plots list at ${LAPTOP.width}×${LAPTOP.height}`;
    const chip = walking.getByTestId('plots-chip');
    const panel = walking.getByTestId('plots-panel');
    await appears(chip, STEP_MS, `${B_AC_2}: at ${LAPTOP.width}×${LAPTOP.height} the laptop's walking screen offers the Plots chip`);
    await chip.click({ timeout: STEP_MS });
    await appears(panel, STEP_MS, `${B_AC_2}: the laptop's Plots chip opens the list`);
    const before = await clockSeconds(walking);
    const seen = await listsEveryPlot(panel, room.viewFor(seat).game!, seat, where);
    await page.waitForTimeout(CLOCK_WATCH_MS);
    check(await panel.isVisible(), `${B_AC_2}: ${where} stays open while the clock runs`);
    const after = await clockSeconds(walking);
    check(after < before, `${B_AC_2}: with ${where} open the clock runs, ${before} s then ${after} s`);
    await chip.click({ timeout: STEP_MS });
    await panel.waitFor({ state: 'detached', timeout: STEP_MS });
    return `the laptop's Plots chip lists ${seen.analysed + seen.not} plots while the clock runs (${before} s → ${after} s), and closes`;
  } finally {
    await page.setViewportSize(PHONE.viewport);
  }
}

/**
 * A second room on the same server, Lena's phone, Kai's phone, an AI and a TV, taken through month 1 to its
 * development: there Analyse opens its card (B-AC-3), and the Plots chip opens the list over the map and closes it, at
 * the smoke's phone and the small one, then on the laptop (B-AC-2). A page error on any of its screens fails the step.
 * The room is disposed afterwards, so nothing of it runs on.
 */
async function theSecondRoomsDevelopment({ phone, server }: Pick<GameStepContext, 'phone' | 'server'>): Promise<{ analysed: string; walking: string }> {
  const browser = phone.context().browser();
  check(browser, `${B_AC_2}: the smoke's browser`);
  const origin = new URL(phone.url()).origin;
  const contexts = await Promise.all([browser.newContext(PHONE), browser.newContext(PHONE), browser.newContext(TV)]);
  const [page, kai, tv] = (await Promise.all(contexts.map((c) => c.newPage()))) as [Page, Page, Page];
  const errors: string[] = [];
  for (const [who, p] of [['Lena', page], ['Kai', kai], ['the TV', tv]] as const) p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  let code = '';
  try {
    await page.goto(origin);
    await page.getByPlaceholder('Heiko').fill('Lena');
    await page.getByRole('button', { name: 'Start a new game' }).click();
    await page.getByText("You're at the table").waitFor();
    code = (await page.getByTestId('room-code').textContent())?.trim() ?? '';
    await tv.goto(`${origin}/table?room=${code}`);
    await kai.goto(`${origin}/?room=${code}`);
    await kai.getByPlaceholder('Heiko').fill('Kai');
    await kai.getByRole('button', { name: `Join game ${code}` }).click();
    await kai.getByText("You're at the table").waitFor();
    await page.getByRole('button', { name: 'Add AI player' }).click();
    await page.locator('[data-testid=seats] li').nth(2).waitFor();
    await page.getByRole('button', { name: 'Start game' }).click();
    const started = Date.now();
    await Promise.all([page, kai].map((p) => readyThroughTheElection(p, TO_DEVELOPMENT_MS)));
    await Promise.all([page, kai].map((p) => doneWithLand(p)));
    const walking = page.locator('[data-phase=development] [data-testid=phone-game]');
    await appears(walking, Math.max(1, started + TO_DEVELOPMENT_MS - Date.now()), `${B_AC_2}: the second room reaches its walking screen`);
    const room = roomOf(server, code);
    const game = room.game as SteeredGame;
    game.devEndsAt = Date.now() + SECOND_ROOM_TURN_MS;
    room.broadcast();
    const seat = room.game.state.players.find((p) => p.name === 'Lena')?.id;
    check(seat, `${B_AC_2}: Lena plays in the second room`);
    const analysed = await analyseSaysWhatItFound(room, { lena: page, kai, tv }, seat);
    console.log(`✓ ${B_AC_3}: ${analysed}`);
    const listed = await heldIn(server, code, async () => {
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
    const laptop = await thePlotsChipOnTheLaptop(page, room, seat);
    check(errors.length === 0, `${B_AC_2}: no page errors in the second room: ${errors.join('; ')}`);
    return { analysed, walking: `${listed}; ${laptop}` };
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    if (code) server.registry.get(code)?.dispose();
  }
}
