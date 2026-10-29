/**
 * E-11 (C66): the Governor's desk fits beside the table chat on a phone (hub-steps.ts, governorDeskFits). One game per
 * size, on a server of its own: Lena and Ossa with two AI seats, so the header reads 2 / 4 READY and the footer waits
 * for both. The month's election is set aside and Lena seated as Governor on a promise of up to 4% with the tax at
 * 5%, as a term's first planning opens; Ossa says two lines, so the ticker holds two. The game clock is held
 * throughout, so nothing scheduled moves the phase on.
 * Run with `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/governor-desk.ts`; MULE_E2E_SIZE=667 runs one size.
 */
import type { GameState, TaxPromise } from '@mule/engine';
import type { Browser, Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, held, launch, PHONE, startServer } from './harness';
import { GOV_SIZES, governorDeskFits } from './hub-steps';

/** Lena's promise: up to 4%, under the month's 5%, so the desk opens on "breaks it" and − brings it within. */
const PROMISE: TaxPromise = { kind: 'cap', percent: 4 };
const TAX = 0.05;
const LINES = ['Anyone selling Smithore this month?', 'Lena, keep that tax low!'];

type Table = { lena: Page; ossa: Page; code: string };

/** A table of two phones and two AI seats, in month 1's planning. */
async function seat(browser: Browser, base: string, errors: string[]): Promise<Table> {
  const open = async (name: string) => {
    const page = await (await browser.newContext(PHONE)).newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`);
    });
    return page;
  };
  const lena = await open('Lena');
  await lena.goto(base);
  await lena.getByPlaceholder('Heiko').fill('Lena');
  await lena.getByRole('button', { name: 'Start a new game' }).click();
  await lena.getByText("You're at the table").waitFor();
  const code = (await lena.getByTestId('room-code').textContent())?.trim() ?? '';
  const ossa = await open('Ossa');
  await ossa.goto(`${base}/?room=${code}`);
  await ossa.getByPlaceholder('Heiko').fill('Ossa');
  await ossa.getByRole('button', { name: `Join game ${code}` }).click();
  await ossa.getByText("You're at the table").waitFor();
  for (const n of [2, 3]) {
    await lena.getByRole('button', { name: 'Add AI player' }).click();
    await lena.locator('[data-testid=seats] li').nth(n).waitFor();
  }
  await lena.getByRole('button', { name: 'Start game' }).click();
  await Promise.all([lena, ossa].map((p) => p.locator('[data-phase=planning]').waitFor({ timeout: 5_000 })));
  return { lena, ossa, code };
}

/** Test fixture: the election set aside, Lena seated as Governor on PROMISE at TAX, told to every screen. */
function seatGovernor(server: MuleServer, code: string, lena: string): void {
  const room = server.registry.get(code) as unknown as { game: { state: GameState }; broadcast(): void };
  const { state } = room.game;
  const p = state.politics;
  check(p && state.phase === 'planning', `the room plays politics and is in planning, got ${state.phase}`);
  p.election = null;
  p.candidates = { governor: [], sheriff: [] };
  p.promises = {};
  p.governor = lena;
  p.governorRun = { id: lena, terms: 1 };
  p.terms = { ...p.terms, [lena]: 1 };
  p.termStart = state.month;
  p.promise = PROMISE;
  state.treasury.salesTax = TAX;
  p.taxAtStart = TAX;
  p.promiseFrom = Math.round(TAX * 100);
  room.broadcast();
}

const started = Date.now();
const browser = await launch();
const errors: string[] = [];
const servers: MuleServer[] = [];
try {
  for (const size of GOV_SIZES.filter((s) => !process.env.MULE_E2E_SIZE || String(s.width) === process.env.MULE_E2E_SIZE)) {
    const { server, base } = await startServer({ maxMonths: 2 });
    servers.push(server);
    const t = await seat(browser, base, errors);
    const room = server.registry.get(t.code);
    check(room, `a room ${t.code} on the server`);
    const idOf = (name: string) => {
      const id = room.viewFor(null).seats.find((s) => s.name === name)?.id;
      check(id, `${name} has a seat`);
      return id;
    };
    const [lenaId, ossaId] = [idOf('Lena'), idOf('Ossa')];
    await held(server, t.code, async () => {
      seatGovernor(server, t.code, lenaId);
      const guide = t.lena.locator('[data-phase=planning] [data-testid=guide]');
      await guide.getByTestId('desk-governor').waitFor({ timeout: 3_000 });
      await guide.getByTestId('ready-count').filter({ hasText: '2 / 4 READY' }).waitFor({ timeout: 3_000 });
      const chat = room as unknown as { chat: (from: string, text: string) => void };
      for (const line of LINES) chat.chat(ossaId, line);
      await guide.getByTestId('chat-ticker').getByText(LINES[1]!).waitFor({ timeout: 3_000 });
      console.log(`✓ E-11: ${await governorDeskFits(t.lena, size)}`);
    });
    await t.lena.context().close();
    await t.ossa.context().close();
  }
  check(errors.length === 0, `no page or console errors: ${errors.join('; ')}`);
  console.log(`e2e governor desk: ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e governor desk: FAILED');
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  for (const s of servers) await s.close();
}
process.exit(0);
