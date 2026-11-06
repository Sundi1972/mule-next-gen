/**
 * Plot info as a step of the whole game: the geo drone's Scan, and the Drone report it puts in the phone's rail at once.
 * smoke.ts calls it in month 2's planning, with the hub open and nobody ready. It runs held, so planning can't end on
 * its clock mid-step; the phone's own scanning second is the page's clock, which a hold doesn't stop.
 */
import { DEVELOPMENT, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { bestOf, dotsOf, GOOD_NAME, type RawGood } from '@mule/ui';
import { errors as playwrightErrors, type Locator } from 'playwright';
import { fmt, mapTiles } from '../src/game/derive';
import { check, type GameStepContext } from './harness';
import { plotName, tapPlot, type Plot } from './special-steps';

/** The promise: the report shows within this long of the tap on Scan. */
const REPORT_MS = 2_000;
/** A screen's wait for what a tap shows at once. */
const STEP_MS = 2_000;
const RAW: RawGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

type Room = { game: { state: GameState; handle(seat: string, intent: unknown): void }; viewFor(seat: string | null): { game?: MuleView | null } };

const B_AC_1 = 'B-AC-1 (plot info): two free plots picked, Scan, the rail\'s Drone report shows both with each good\'s 0–3 dots and "best for", 60 cr gone, before Ready';

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
    check((await report.getByText('ONLY YOU').count()) === 1, `${B_AC_1}: the report is marked ONLY YOU`);

    // Each plot's row against the ground the server holds for it.
    for (const p of picks) {
      const dots = dotsOf(state.tiles[index(p)]!.ground);
      const row = report.getByTestId(`report-${p.x}-${p.y}`);
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      check(text.includes(`Plot ${plotName(p)}`), `${B_AC_1}: the row names plot ${plotName(p)}, got "${text}"`);
      const best = `best for ${GOOD_NAME[bestOf(dots)]}`;
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
    return `plots ${picks.map(plotName).join(', ')} reported in ${tookMs} ms, ${fee} cr gone; the TV and ${others.length} other seats hold no ground for them; a second Scan refused ("${refused}")`;
  });
  console.log(`✓ ${B_AC_1}: ${said}`);
  return said;
}
