/**
 * WS3: the land grant's compact footer on the phone (ws6-ux mock GrantFooter, PM ruling option 1). One phone and two
 * AIs, the clock held, read at PHONE_SMALL (667×375) and PHONE (844×390): the rail window the lit plot is read in is
 * at least RAIL_MIN_PX, measured with small-phone-audit's AUDIT_JS and the RAIL scope small-phone.ts reads it with.
 * Then the footer itself: CLAIM and Ready on one row, CLAIM the wider (3:2); "Waiting for" on one line; CLAIM claims
 * the lit plot and Ready sets Done with land on the server; "You're done with land" stands in Ready's box. A second
 * table, with three AIs, shows "+N" for the names that do not fit.
 * Local tier: `pnpm --filter @mule/web build`, then `pnpm --filter @mule/web exec tsx e2e/grant-footer.ts`.
 */
import type { Locator, Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, held, launch, PHONE, PHONE_SMALL, SHOWN_MS, startServer, TV } from './harness';
import { ELECTION_WAIT_MS, readyThroughTheElection } from './politics-steps';
import { AUDIT_JS, type AuditRead, type AuditScope } from './small-phone-audit';
import { doneThroughTheElection } from './table-steps';

const PHASE_SCALE = 0.1;
const PRESS_MS = 2_000;
const NAME = 'Heiko';
/** The promise: the rail window, where "Lit now" and its ground card are read, at both phone sizes. */
const RAIL_MIN_PX = 110;
/** The compact row's height (the mock's h-14). */
const ROW_PX = 56;
/** small-phone.ts's RAIL scope, the same read. */
const RAIL: AuditScope = { roots: ['[data-testid=guide] > header', '[data-testid=now]'], skip: ['[data-testid=table-chat]'] };
const SIZES = [PHONE_SMALL.viewport, PHONE.viewport] as const;

type Box = { x: number; y: number; width: number; height: number };
type Engine = {
  state: {
    width: number;
    players: { id: string; name: string; claimsThisGrant: number; doneWithLand: boolean }[];
    tiles: { x: number; y: number; owner: string | null }[];
  };
};

const started = Date.now();
const { server, base } = await startServer({ maxMonths: 1, phaseScale: PHASE_SCALE, seed: () => 1 });
const browser = await launch();
const errors: string[] = [];
const fails: string[] = [];
const expect = (ok: unknown, message: string) => {
  if (!ok) fails.push(message);
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
};
try {
  // Table 1: one phone, two AIs. The promise, the row, the one line, CLAIM and Ready on the server.
  {
    const { phone, code } = await toTheGrant(2);
    await held(server, code, async () => {
      const grant = phone.locator('[data-phase=landGrant]');
      const claim = grant.getByTestId('claim');
      const ready = grant.getByTestId('ready');
      for (const size of SIZES) {
        const at = `${size.width}×${size.height}`;
        const read = await readAt(phone, size);
        console.log(`  land grant: rail ${read.railWindow ?? '-'} px at ${at}`);
        expect((read.railWindow ?? 0) >= RAIL_MIN_PX, `at ${at} the land grant's rail window is ≥ ${RAIL_MIN_PX} px, got ${read.railWindow}`);
        const c = await box(claim);
        const r = await box(ready);
        expect(c && r && Math.abs(c.y - r.y) <= 1 && Math.abs(c.height - r.height) <= 1, `at ${at} CLAIM and Ready sit on one row, got ${fmt(c)} and ${fmt(r)}`);
        expect(c && Math.abs(c.height - ROW_PX) <= 1, `at ${at} the row is ${ROW_PX} px tall, got ${c?.height}`);
        const ratio = c && r ? c.width / r.width : 0;
        expect(c && r && c.x < r.x && Math.abs(ratio - 1.5) <= 0.05, `at ${at} CLAIM is left and wider, 3:2, got ${ratio.toFixed(2)}`);
        await oneLine(grant.getByTestId('waiting-for'), at);
      }
      await phone.setViewportSize(PHONE_SMALL.viewport);
      const waiting = grant.getByTestId('waiting-for');
      expect(/^Waiting for /.test((await waiting.getAttribute('aria-label')) ?? ''), `"Waiting for" names who is still choosing`);
      expect((await grant.getByTestId('waiting-more').count()) === 0, 'two waiting fit on the line: no "+N"');

      // CLAIM claims the lit plot, on the server.
      const me = seatOf(server, code, NAME);
      const lit = room(server, code).viewFor(me).game?.lit;
      check(lit, 'a plot is lit while the clock is held');
      await claim.click({ timeout: PRESS_MS });
      await until(() => engine(server, code).state.players.find((p) => p.id === me)?.claimsThisGrant === 1, 'the server counts the claim');
      const owner = engine(server, code).state.tiles.find((t) => t.x === lit.x && t.y === lit.y)?.owner;
      expect(owner === me, `CLAIM claimed the lit plot ${lit.x},${lit.y} on the server, owner ${owner}`);

      // Ready sets Done with land; "You're done with land" stands in Ready's box.
      const before = { ready: await box(ready), claim: await box(claim) };
      await ready.click({ timeout: PRESS_MS });
      await until(() => engine(server, code).state.players.find((p) => p.id === me)?.doneWithLand === true, 'the server sets doneWithLand');
      expect(true, 'Ready set Done with land on the server (doneWithLand)');
      const done = grant.getByTestId('you-are-ready');
      await done.waitFor({ timeout: SHOWN_MS });
      expect((await done.innerText()).includes("You're done with land"), `"You're done with land" shows, got "${await done.innerText()}"`);
      const after = { done: await box(done), claim: await box(claim) };
      expect(same(before.ready, after.done), `"You're done with land" sits in Ready's box: ${fmt(before.ready)} then ${fmt(after.done)}`);
      expect(same(before.claim, after.claim), `CLAIM does not move: ${fmt(before.claim)} then ${fmt(after.claim)}`);
      expect((await ready.count()) === 0, 'Ready is gone once done');
      for (const size of SIZES) {
        const read = await readAt(phone, size);
        console.log(`  land grant, done: rail ${read.railWindow ?? '-'} px at ${size.width}×${size.height}`);
      }
      await phone.setViewportSize(PHONE_SMALL.viewport);
    });
    await phone.context().close();
  }

  // Table 2: one phone, three AIs. Three waiting: two names fit, "+1".
  {
    const { phone, code } = await toTheGrant(3);
    await held(server, code, async () => {
      const grant = phone.locator('[data-phase=landGrant]');
      for (const size of SIZES) {
        const at = `${size.width}×${size.height}`;
        await readAt(phone, size);
        await oneLine(grant.getByTestId('waiting-for'), `${at}, three waiting`);
        const more = grant.getByTestId('waiting-more');
        expect((await more.count()) === 1 && (await more.innerText()).trim() === '+1', `at ${at} the third name waiting shows as "+1"`);
        expect((await grant.locator('[data-testid=waiting-for] [data-testid^=waiting-]:not([data-testid=waiting-more])').count()) === 2, `at ${at} two names show on the line`);
      }
    });
    await phone.context().close();
  }

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  check(fails.length === 0, `${fails.length} failed:\n${fails.join('\n')}`);
  console.log(`e2e grant footer: ok (${((Date.now() - started) / 1_000).toFixed(1)} s)`);
} catch (err) {
  console.error(`e2e grant footer: FAILED (${((Date.now() - started) / 1_000).toFixed(1)} s)`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

/** A new table with `ais` AI seats, through month 1's election, onto the land grant: the phone and its room. */
async function toTheGrant(ais: number): Promise<{ phone: Page; code: string }> {
  const phone = await (await browser.newContext(PHONE_SMALL)).newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(base);
  await phone.getByPlaceholder(NAME).fill(NAME);
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  const tv = await (await browser.newContext(TV)).newPage();
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();
  for (let i = 0; i < ais; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(ais).waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();
  await phone.locator('[data-phase=planning]').waitFor({ timeout: SHOWN_MS });
  const ctx = { phone, tv, check, server, code, held: <T>(step: () => Promise<T>) => held(server, code, step) };
  await doneThroughTheElection(ctx, PHASE_SCALE * ELECTION_WAIT_MS + 10_000);
  await readyThroughTheElection(phone, SHOWN_MS);
  await phone.locator('[data-phase=landGrant]').waitFor({ timeout: SHOWN_MS });
  return { phone, code };
}

/** small-phone.ts's read: the viewport, two frames for the container queries, then AUDIT_JS. */
async function readAt(phone: Page, size: { width: number; height: number }): Promise<AuditRead> {
  await phone.setViewportSize(size);
  await phone.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return (await phone.evaluate(`(${AUDIT_JS})(${JSON.stringify(RAIL)})`)) as AuditRead;
}

/** "Waiting for" on one line: every part of it on the same line box, no taller than one line. */
async function oneLine(line: Locator, at: string): Promise<void> {
  const read = await line.evaluate((el) => {
    const parts = [...el.children].map((c) => c.getBoundingClientRect());
    const b = el.getBoundingClientRect();
    return { height: b.height, tops: parts.map((p) => Math.round(p.top + p.height / 2)), text: (el as HTMLElement).innerText };
  });
  const spread = Math.max(...read.tops) - Math.min(...read.tops);
  expect(read.height <= 20 && spread <= 1, `at ${at} "Waiting for" is one line: ${read.height.toFixed(1)} px tall, centres within ${spread} px ("${read.text.replace(/\s+/g, ' ')}")`);
}

async function box(l: Locator): Promise<Box | null> {
  return (await l.count()) ? l.boundingBox() : null;
}

function same(a: Box | null, b: Box | null): boolean {
  return !!a && !!b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1;
}

function fmt(b: Box | null): string {
  return b ? `${b.width.toFixed(1)}×${b.height.toFixed(1)} at ${b.x.toFixed(1)},${b.y.toFixed(1)}` : 'absent';
}

function room(s: MuleServer, code: string) {
  const r = s.registry.get(code);
  check(r, `a room ${code} on the server`);
  return r;
}

function engine(s: MuleServer, code: string): Engine {
  return (room(s, code) as unknown as { game: Engine }).game;
}

function seatOf(s: MuleServer, code: string, name: string): string {
  const id = room(s, code).viewFor(null).seats.find((seat) => seat.name === name)?.id;
  check(id, `${name} has a seat`);
  return id;
}

/** Waits for a condition on the in-process server's state; fails with `message` after SHOWN_MS. */
async function until(ok: () => boolean, message: string): Promise<void> {
  const end = Date.now() + SHOWN_MS;
  while (!ok()) {
    check(Date.now() < end, message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
