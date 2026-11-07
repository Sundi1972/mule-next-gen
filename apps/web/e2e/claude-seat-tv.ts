/**
 * TV-FIT with Claude seats (C6), at 1920×1080 and six seats, the fullest table. B-AC-19 at six seats with five Claude
 * seats in each status; and the first good's side pick with Claude seats waited for (RULE-6): each waited seat's name
 * and countdown show whole in the picked list and the waiting box, nothing runs past the foot, and the scale holds.
 * Run with `pnpm --filter @mule/web exec tsx e2e/claude-seat-tv.ts` after `vite build`.
 */
import type { MuleView } from '@mule/protocol';
import type { Page } from 'playwright';
import { check, held, launch, PHONE, startServer, TV } from './harness';
import { sixSeatsOnTheTv } from './hub-steps';
import { fitSettled, nothingPastTheFoot, shownWhole, theTvScaleHolds } from './tv-fit-steps';

/** Kept a string: the side column's fit scale, and where its picked list and waiting box sit, for the log. */
const SIDE = String.raw`(() => {
  const box = (id) => { const el = document.querySelector('[data-testid=' + id + ']'); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
  return { fits: [...document.querySelectorAll('[data-phase] [data-fit]')].map((b) => b.getAttribute('data-fit')), picked: box('tv-picked'), waiting: box('tv-waiting') };
})()`;

const ALL = ['thinking', 'offline', 'waiting', 'connected', 'ready'] as const;
/** MULE_E2E_CLAUDE_STATUSES, comma-separated, narrows the planning runs (each is a game of its own). */
const STATUSES = ALL.filter((s) => (process.env.MULE_E2E_CLAUDE_STATUSES ?? ALL.join(',')).split(',').includes(s));
/** How long the side pick waits for each waited seat, as the TV first reads it. */
const WAIT_MS = 32_000;

const started = Date.now();
/** As shell.ts runs B-AC-19 at six seats. */
const { server, base } = await startServer({ maxMonths: 1 });
/** A quick month with no election, for reaching the side pick. */
const quick = await startServer({ politics: false, phaseScale: 0.05, seed: () => 7 });
const browser = await launch();
const errors: string[] = [];
const reds: string[] = [];
try {
  for (const claude of STATUSES) {
    try {
      console.log(`✓ B-AC-19 (C6): ${await sixSeatsOnTheTv({ browser, base, server, claude })}`);
    } catch (err) {
      reds.push(`five Claude seats ${claude}: ${(err as Error).message}`);
    }
  }
  try {
    console.log(`✓ RULE-6 (TV-FIT): ${await sidePickWithClaudeWaited()}`);
  } catch (err) {
    reds.push(`side pick: ${(err as Error).message}`);
  }
  check(reds.length === 0, `TV-FIT with Claude seats:\n  ${reds.join('\n  ')}`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e claude-seat-tv: ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e claude-seat-tv: FAILED');
  throw err;
} finally {
  await browser.close();
  await server.close();
  await quick.server.close();
}
process.exit(0);

/**
 * Six seats, the five AIs Claude's, at the first good's side pick; Mia has not picked and two Claude seats, the longest
 * names, are waited for with WAIT_MS left. Read while the room is held, so the screen stands still.
 */
async function sidePickWithClaudeWaited(timeout = 5_000): Promise<string> {
  const phone = await (await browser.newContext(PHONE)).newPage();
  const tv = await (await browser.newContext(TV)).newPage();
  for (const [who, page] of [['phone', phone], ['tv', tv]] as const) page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  try {
    await phone.goto(quick.base);
    await phone.getByPlaceholder('Heiko').fill('Mia');
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor({ timeout });
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    for (let i = 1; i <= 5; i++) {
      await phone.getByRole('button', { name: 'Add AI player' }).click();
      await phone.locator('[data-testid=seats] li').nth(i).waitFor({ timeout });
    }
    const room = quick.server.registry.get(code)!;
    const seats = room.viewFor(null).seats;
    for (const s of seats.filter((s) => s.isAi)) {
      await phone.getByTestId(`seat-${s.id}-open`).click({ timeout });
      await phone.getByTestId('sheet-kind-claude').click({ timeout });
      await phone.getByTestId('sheet-setup-code-text').waitFor({ timeout });
      await phone.getByTestId('sheet-done').click({ timeout });
    }
    await phone.getByRole('button', { name: 'Start game' }).click();
    await tv.goto(`${quick.base}/table?room=${code}`);

    const game = (room as unknown as { game: { viewFor(seat: string | null): MuleView; handle(seat: string, intent: object): void } }).game;
    const mia = seats.find((s) => !s.isAi)!.id;
    // Mia is done with each phase as it comes, so the month runs on to the auction; there her Ready would be her pick.
    for (const deadline = Date.now() + 180_000; game.viewFor(null).auction?.stage !== 'status'; ) {
      check(Date.now() < deadline, `the first good's side pick comes up within 180 s, got ${game.viewFor(null).phase}`);
      if (game.viewFor(null).phase !== 'auction')
        try {
          game.handle(mia, { type: 'ready' });
        } catch {
          // Refused where Ready means nothing yet; the phase's clock moves it on.
        }
      await phone.waitForTimeout(200);
    }
    const waited = [...seats.filter((s) => s.isAi)].sort((a, b) => b.name.length - a.name.length).slice(0, 2);
    return await held(quick.server, code, async () => {
      const until = Date.now() + WAIT_MS;
      const viewFor = game.viewFor.bind(game);
      game.viewFor = (seat) => {
        const view = viewFor(seat);
        return view.auction ? { ...view, auction: { ...view.auction, waitingForClaude: waited.map((s) => ({ seatId: s.id, until })) } } : view;
      };
      Object.assign(game, { claudeStatus: () => 'thinking' });
      room.broadcast();
      const box = tv.getByTestId('tv-waiting');
      for (const s of waited) await box.getByTestId(`waiting-${s.id}`).waitFor({ timeout });
      return measure(tv, waited);
    });
  } finally {
    await phone.context().close();
    await tv.context().close();
  }
}

/** The side pick's TV with `waited` listed: each name and countdown whole, the screen within its foot, the scale held. */
async function measure(tv: Page, waited: { id: string; name: string }[]): Promise<string> {
  const screen = 'six-seat side pick with Claude seats waited for';
  await fitSettled(tv, screen);
  console.log(`  the side pick's TV: ${JSON.stringify(await tv.evaluate(SIDE))}`);
  await shownWhole(tv, screen, ['[data-testid=tv-waiting]', ...waited.flatMap((s) => [`[data-testid=tv-picked-${s.id}]`, `[data-testid=waiting-${s.id}]`])]);
  const widths: string[] = [];
  for (const s of waited) {
    for (const [where, sel] of [
      ['picked list', `[data-testid=tv-picked-${s.id}] [data-testid=tv-picked-name]`],
      ['waiting box', `[data-testid=waiting-${s.id}] [data-testid=waiting-name]`],
    ] as const) {
      const name = await tv.locator(sel).evaluate((el) => ({ shown: el.clientWidth, needs: el.scrollWidth })).catch(() => null);
      check(name && name.shown > 0 && name.needs <= name.shown + 1, `TV-FIT: in the ${where} ${s.name}'s name shows whole, got ${name ? `${name.shown} of ${name.needs} px` : 'no name'}`);
      widths.push(`${s.name} ${name.shown} px in the ${where}`);
    }
    const word = (await tv.getByTestId(`tv-picked-${s.id}`).innerText()).replace(/\s+/g, ' ');
    check(/CLAUDE · THINKING · 0:3\d/.test(word), `${s.name}'s row in the picked list counts down, got "${word}"`);
  }
  const foot = await nothingPastTheFoot(tv, screen);
  const scale = await theTvScaleHolds(tv, screen);
  return `${widths.join(', ')}; the screen ends at y ${foot.toFixed(0)}, drawn at scale ${scale}`;
}
