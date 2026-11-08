/*
 * TV-FIT on planning proper at a table of people (PM ruling 8 Nov): every steady planning state, at every table size, is
 * drawn at TV_SCALE_FLOOR or more. Every other six-seat check is one person and five computer seats, whose rows fold into
 * one; here every seat is a person, nobody's row folds, and the box of who the table waits for lists them all. Local
 * only, as the other TV-FIT runs (lean CI).
 *
 * For each table: the people join, vote through month 1's election to planning's desks, and the TV is read with
 * everyone still planning, then with a chat line on its ticker, then with the host ready (and "can continue without
 * them"), then with all but one ready.
 */
import type { DealCard, GameState } from '@mule/engine';
import type { Browser, Page } from 'playwright';
import { check, held, launch, PHONE, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, PRESS_MS, voteThroughTheElection } from './politics-steps';
import { fitSettled, theTableHasSaid, TV_SCALE_FLOOR } from './tv-fit-steps';

const SCALE = 0.25;
/** Sixteen letters, the lobby's most, so a name wraps where a real long name would. */
const NAMES = ['Annabelle Morgan', 'Maximilian Stone', 'Christopher Vale', 'Josephine Avery', 'Bartholomew Finn', 'Evangeline Rose'];
/** The tables read: every size from two people to six, or MULE_E2E_TABLES's ("4,6"). */
const TABLES = (process.env.MULE_E2E_TABLES ?? '2,3,4,5,6').split(',').map(Number);

async function aTableOf(browser: Browser, base: string, seats: number): Promise<{ code: string; phones: Page[]; tv: Page }> {
  const host = await (await browser.newContext(PHONE)).newPage();
  await host.goto(base);
  await host.getByPlaceholder('Heiko').fill(NAMES[0]!);
  await host.getByRole('button', { name: 'Start a new game' }).click();
  await host.getByText("You're at the table").waitFor();
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  const phones = [host];
  for (const name of NAMES.slice(1, seats)) {
    const phone = await (await browser.newContext(PHONE)).newPage();
    await phone.goto(`${base}/?room=${code}`);
    await phone.getByPlaceholder('Heiko').fill(name);
    await phone.getByRole('button', { name: `Join game ${code}` }).click();
    await phone.getByText("You're at the table").waitFor();
    phones.push(phone);
  }
  const tv = await (await browser.newContext(TV)).newPage();
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();
  await host.getByRole('button', { name: 'Start game' }).click();
  await Promise.all(phones.map((p) => voteThroughTheElection(p, ELECTION_WAIT_MS + 30_000)));
  await tv.locator('[data-phase=planning]').getByTestId('tv-ready-list').waitFor({ timeout: PRESS_MS });
  return { code, phones, tv };
}

const ready = (phone: Page) => phone.locator('[data-phase=planning] [data-testid=ready]:not([disabled])').click({ timeout: PRESS_MS });

/** What one planning state measured: the scale its body is drawn at, the height it has, and what is tallest in it. */
interface Read {
  table: number;
  state: string;
  scale: number;
  room: number;
  tallest: string;
}

/** The TV's planning screen as `state`, once its fit has settled. */
async function planningReads(tv: Page, table: number, state: string): Promise<Read> {
  await tv.locator('[data-phase=planning]').getByTestId('tv-ready-list').waitFor({ timeout: PRESS_MS });
  await fitSettled(tv, `${table}-seat planning, ${state}`);
  const fit = await tv.evaluate(() => {
    const box = [...document.querySelectorAll('[data-phase=planning] [data-fit]')].find((b) => b.checkVisibility())!;
    // The side column, part by part, at full size: what planning's body is made of beside the map.
    const side = document.querySelector('[data-phase=planning] [data-testid=tv-ready-list]')!.parentElement!;
    const parts = [...side.children].map((e) => `${e.getAttribute('data-testid') ?? e.firstElementChild?.getAttribute('data-testid') ?? e.tagName.toLowerCase()} ${(e as HTMLElement).offsetHeight}`);
    return { scale: Number(box.getAttribute('data-fit')), room: box.clientHeight, tallest: `side ${side.scrollHeight}: ${parts.join(', ')}` };
  });
  return { table, state, ...fit };
}

/**
 * SB-5a: stages a pact broken this month between the table's first two people, reads planning with its banner over the
 * map, then takes the card back. The banner must lie inside the map box (over its top, inset by the overlay's padding).
 */
async function aBreakMoment(server: Parameters<typeof held>[0], code: string, tv: Page, table: number): Promise<Read> {
  type Room = { game: { state: GameState }; broadcast(): void };
  const room = server.registry.get(code) as unknown as Room | undefined;
  check(room?.game.state.politics, `the ${table}-seat game has politics on, for its deal cards`);
  const state = room.game.state;
  const [from, to] = state.players.map((p) => p.id);
  const card: DealCard = { id: 'deal-e2e-moment', from: from!, to: to!, terms: { kind: 'pact' }, offered: state.month, until: state.month + 2, status: 'broken', brokenBy: to!, settled: state.month };
  await held(server, code, async () => {
    state.politics!.deals.push(card);
    room.broadcast();
  });
  try {
    const banner = tv.locator('[data-phase=planning] [data-testid=tv-map-box] [data-testid=tv-moment] [data-testid=tv-break-banner]');
    await banner.waitFor({ timeout: PRESS_MS });
    const [b, m] = await Promise.all([banner.boundingBox(), tv.locator('[data-phase=planning] [data-testid=tv-map-box]').boundingBox()]);
    check(b && m && b.y >= m.y - 1 && b.y + b.height <= m.y + m.height + 1, `TV-FIT (${table} people): the break banner overlays the map box, got the banner at y ${b?.y}–${b ? b.y + b.height : '?'} and the box at ${m?.y}–${m ? m.y + m.height : '?'}`);
    return await planningReads(tv, table, 'a break moment over the map');
  } finally {
    await held(server, code, async () => {
      state.politics!.deals.splice(state.politics!.deals.indexOf(card), 1);
      room.broadcast();
    });
  }
}

async function main(): Promise<void> {
  const { server, base } = await startServer({ phaseScale: SCALE });
  const browser = await launch().catch(async (err: unknown) => {
    await server.close();
    throw err;
  });
  try {
    const reads: Read[] = [];
    for (const seats of TABLES) {
      const { code, phones, tv } = await aTableOf(browser, base, seats);
      const people = await tv.locator('[data-phase=planning] [data-testid^=tv-ready-s]').count();
      check(people === seats, `the ${seats}-seat TV's ready list has a row for each person, got ${people}`);
      const at = (state: string) => planningReads(tv, seats, state).then((r) => reads.push(r));
      await at('everyone planning');
      await theTableHasSaid(tv, server, code);
      await at('with a chat line');
      // SB-5a: a card broken now is a moment over the map, out of flow; the body keeps the scale it had a moment before.
      const steady = reads.at(-1)!;
      const moment = await aBreakMoment(server, code, tv, seats);
      check(Math.abs(moment.scale - steady.scale) < 0.001, `TV-FIT (${seats} people): a break moment changes no scale, ${steady.scale.toFixed(3)} before, ${moment.scale.toFixed(3)} with its banner over the map`);
      reads.push(moment);
      // The host ready: the table may go on without the others, and the TV must say so.
      await ready(phones[0]!);
      // Up to three seats in the waiting box, from four on the host's row (PM ruling 8 Nov).
      const goesOn = seats <= 3 ? tv.getByText('the host, can continue without them', { exact: false }) : tv.getByTestId('tv-state-s1').filter({ hasText: 'READY · CAN CONTINUE' });
      await goesOn.waitFor({ timeout: PRESS_MS });
      // The host's whole name still shows beside the row's longer word.
      const host = await tv.getByTestId('tv-ready-s1').getByTestId('tv-ready-name').evaluate((el) => ({ shown: el.clientWidth, needs: el.scrollWidth }));
      check(host.needs <= host.shown + 1, `TV-FIT (${seats} people): the ready host's name shows whole, got ${host.shown} of ${host.needs} px`);
      await at('the host ready');
      for (const phone of phones.slice(1, -1)) await ready(phone);
      // Read once the TV has every press: a click returns before the server has it.
      await tv.getByTestId('ready-count').filter({ hasText: `${seats - 1} / ${seats} READY` }).first().waitFor({ timeout: PRESS_MS });
      await at('all but one ready');
      console.log(`  ${seats} people: ${reads.filter((r) => r.table === seats).map((r) => `${r.state} ${r.scale.toFixed(3)} (${r.room} px; ${r.tallest})`).join('; ')}`);
      await tv.context().close();
      for (const phone of phones) await phone.context().close();
    }
    // Every table and state is read before any fails, so one run says the whole of it.
    const under = reads.filter((r) => r.scale < TV_SCALE_FLOOR);
    check(under.length === 0, `TV-FIT: planning proper is drawn under the floor ${TV_SCALE_FLOOR} (PM ruling 8 Nov) in ${under.length} of ${reads.length} states: ${under.map((r) => `${r.table} people ${r.state} at ${r.scale.toFixed(3)} (${r.room} px; tallest at full size ${r.tallest})`).join('; ')}`);
    console.log(`✓ TV-FIT floor ${TV_SCALE_FLOOR}, planning proper at a table of people: every state of ${reads.length} holds`);
    console.log('e2e tv planning fit: ok');
  } catch (err) {
    console.error('e2e tv planning fit: FAILED');
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
