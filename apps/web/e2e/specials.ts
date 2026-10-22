/**
 * B-AC-9 (MG-2): given a special field on the map, when a player looks at the phone or the TV, the approved glyph
 * (the badge, variant A) shows on that plot; a plain plot shows none. On the phone, tapping a special plot selects
 * it and its plot card says what it does, first under the plot's name; when the land grant lights it, so does the
 * lit card. The badge never takes a plot's taps: a tap on the part that hangs over a neighbour selects the neighbour.
 * Run with `pnpm --filter @mule/web e2e`; another map with `MULE_E2E_SEED=<seed>`.
 */
import { createGame, type GameState, type Tile } from '@mule/engine';
import type { Locator, Page } from 'playwright';
import { GRANT_TICK_MS } from '../../server/src/mule-game.js';
import { check, launch, PHONE, startServer, TV } from './harness';

/** Seed 93 with two seats: a 13×7 map with ruins on the top row (7,0), a crystal cavern inside (10,3) and an oasis on the bottom edge (9,6). */
const DEFAULT_SEED = 93;
const SEATS = 2;
const SEED = seedFrom(process.env.MULE_E2E_SEED);
const SHOWN_MS = 5_000;
/** The light sweeps row by row; a plot on row r is lit within about r + 1 rows of ticks, plus the AI's claims skipped. */
const litWithin = (t: Tile, width: number) => (t.y + 1) * width * GRANT_TICK_MS + 3_000;

// The map the server will deal, read from the engine with the same seed and seat count.
const dealt = createGame({ seed: SEED, players: Array.from({ length: SEATS }, (_, i) => ({ id: `s${i + 1}`, name: `P${i + 1}`, isAi: i > 0 })) });
const specials = dealt.tiles.filter((t): t is Tile & { special: NonNullable<Tile['special']> } => !!t.special);
check(specials.length > 0, `seed ${SEED}: the map has special fields`);
const plain = dealt.tiles.find((t) => !t.special && t.terrain !== 'store' && !specials.some((s) => Math.abs(s.x - t.x) <= 1 && Math.abs(s.y - t.y) <= 1));
check(plain, `seed ${SEED}: the map has a plain plot away from every special field`);
/** A special plot off the right and bottom edges, so its badge hangs over the plot diagonally below-right. */
const inner = specials.find((t) => t.x < dealt.width - 1 && t.y < dealt.height - 1);
check(inner, `seed ${SEED}: a special field off the map's right and bottom edges`);
/** The special the land grant lights first: the light sweeps row by row. */
const firstLit = [...specials].sort((a, b) => a.y * dealt.width + a.x - (b.y * dealt.width + b.x))[0]!;

const { server, base } = await startServer({ seed: () => SEED });
const browser = await launch();
const errors: string[] = [];
try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  check(/^[A-Z]{4}$/.test(code), `room code, got "${code}"`);

  const tv = await (await browser.newContext(TV)).newPage();
  tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
  await tv.goto(`${base}/table?room=${code}`);
  await tv.getByTestId('room-code').waitFor();

  for (let i = 1; i < SEATS; i++) await phone.getByRole('button', { name: 'Add AI player' }).click();
  await phone.locator('[data-testid=seats] li').nth(SEATS - 1).waitFor();
  await phone.getByRole('button', { name: 'Start game' }).click();

  // The server dealt the map the test read.
  const state = (server.registry.get(code) as unknown as { game: { state: GameState } } | undefined)?.game.state;
  check(state, `a game in room ${code}`);
  check(JSON.stringify(state.tiles.map((t) => t.special ?? null)) === JSON.stringify(dealt.tiles.map((t) => t.special ?? null)), `seed ${SEED}: the server dealt the map the test read`);

  // Planning: the TV's colony map and the phone's hub map (its Look tool).
  const tvMap = tv.locator('[data-phase=planning]');
  await tvMap.waitFor({ timeout: SHOWN_MS });
  const planning = phone.locator('[data-phase=planning]');
  await planning.waitFor({ timeout: SHOWN_MS });
  const hubMap = planning.getByTestId('hub-map');
  await checkGlyphs(tvMap, 'TV, planning');
  await checkGlyphs(hubMap, 'phone, planning');

  // Tap the special plot: it selects, and the plot card says what it is first under its name.
  const look = planning.getByTestId('look-plot');
  await tapPlot(phone, hubMap, inner);
  await look.filter({ hasText: `Plot ${plotName(inner)}` }).waitFor({ timeout: SHOWN_MS });
  await checkSpecialLine(look, inner.special.kind, `B-AC-9: the Look card of ${plotName(inner)}`);

  // A tap on the badge's corner, where it hangs over the neighbour below-right, selects the neighbour.
  const badge = await glyph(hubMap, inner).boundingBox({ timeout: SHOWN_MS });
  check(badge, `B-AC-9: the badge on ${plotName(inner)} has a box`);
  await phone.touchscreen.tap(badge.x + badge.width - 1.5, badge.y + badge.height - 1.5);
  const neighbour = { x: inner.x + 1, y: inner.y + 1 };
  const shown = await look
    .filter({ hasText: `Plot ${plotName(neighbour)}` })
    .waitFor({ timeout: 2_000 })
    .then(() => true, () => false);
  check(shown, `B-AC-9: a tap on the badge's hanging corner selects the neighbour ${plotName(neighbour)}, the card shows "${await look.textContent()}"`);

  // Negative: a plain plot's card has no special line, only its terrain hint.
  await tapPlot(phone, hubMap, plain);
  await look.filter({ hasText: `Plot ${plotName(plain)}` }).waitFor({ timeout: SHOWN_MS });
  check((await look.getByTestId('special-line').count()) === 0, `B-AC-9 (negative): the plain plot ${plotName(plain)} has no special line`);
  check((await look.getByTestId('terrain-hint').count()) === 1, `B-AC-9: the plain plot ${plotName(plain)} shows its terrain hint`);

  // Land grant: when the light reaches the special plot, the lit card says what it is, and both maps still draw it.
  await planning.getByRole('button', { name: "I'm ready" }).click();
  const grant = phone.locator('[data-phase=landGrant]');
  await grant.waitFor({ timeout: SHOWN_MS });
  const lit = grant.getByTestId('lit').filter({ hasText: plotName(firstLit) });
  await lit.waitFor({ timeout: litWithin(firstLit, dealt.width) });
  await checkSpecialLine(lit, firstLit.special.kind, `B-AC-9: the lit card of ${plotName(firstLit)}`);
  await checkGlyphs(grant, 'phone, land grant');
  await checkGlyphs(tv.locator('[data-phase=landGrant]'), 'TV, land grant');

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e specials: ok (seed ${SEED}, ${specials.map((t) => `${t.special.kind} ${plotName(t)}`).join(', ')})`);
} catch (err) {
  console.error(`e2e specials: FAILED (seed ${SEED})`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

type Plot = { x: number; y: number };

function plotName(p: Plot): string {
  return `${p.x + 1}·${p.y + 1}`;
}

function glyph(map: Locator, p: Plot): Locator {
  return map.locator(`[data-testid="special-glyph-${p.x}-${p.y}"]`);
}

/** B-AC-9: every special plot carries its glyph with its kind; nothing else on the map does. */
async function checkGlyphs(map: Locator, where: string): Promise<void> {
  for (const t of specials) {
    const g = glyph(map, t);
    const seen = await g.waitFor({ state: 'visible', timeout: SHOWN_MS }).then(() => true, () => false);
    check(seen, `B-AC-9 (${where}): the ${t.special.kind} on ${plotName(t)} shows its glyph`);
    check((await g.getAttribute('data-kind')) === t.special.kind, `B-AC-9 (${where}): the glyph on ${plotName(t)} says ${t.special.kind}, got ${await g.getAttribute('data-kind')}`);
  }
  check((await glyph(map, plain!).count()) === 0, `B-AC-9 (${where}, negative): the plain plot ${plotName(plain!)} shows no glyph`);
  const all = await map.locator('[data-testid^="special-glyph-"]').count();
  check(all === specials.length, `B-AC-9 (${where}, negative): ${specials.length} glyphs for ${specials.length} special fields, got ${all}`);
}

/** The card's special line, with its kind, comes first under the plot's name: before the terrain hint or the ground card. */
async function checkSpecialLine(card: Locator, kind: string, what: string): Promise<void> {
  const line = card.getByTestId('special-line');
  const seen = await line.waitFor({ timeout: SHOWN_MS }).then(() => true, () => false);
  check(seen, `${what} shows the special line`);
  check((await line.getAttribute('data-kind')) === kind, `${what}: the special line says ${kind}, got ${await line.getAttribute('data-kind')}`);
  const before = await card.evaluate((el) => {
    const l = el.querySelector('[data-testid=special-line]');
    const next = el.querySelector('[data-testid=terrain-hint], [data-testid=ground]');
    return !!l && !!next && !!(l.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check(before, `${what}: the special line comes before the terrain hint or the ground card`);
}

/** Taps the middle of a plot on the map. */
async function tapPlot(page: Page, map: Locator, p: Plot): Promise<void> {
  const box = await map.locator('[aria-label]:not([role=img])').nth(p.y * dealt.width + p.x).boundingBox({ timeout: SHOWN_MS });
  check(box, `plot ${plotName(p)} is on screen`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

function seedFrom(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SEED;
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(Number.isSafeInteger(n) && n >= 0)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
