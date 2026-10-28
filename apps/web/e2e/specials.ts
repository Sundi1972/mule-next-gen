/**
 * LOCAL ONLY (lean CI tier 3, 2026-10-28): CI checks B-AC-9 as a step of the whole game, special-steps.ts in smoke.ts.
 * This script plays its own game to check what the step doesn't: the badge never over the owner's mark of the plot it
 * hangs into (W-I1, the geometry), a plain plot's card, and the special line in the drone's rail, the land grant's lit
 * card and Develop's plot card.
 * Run it after a build: `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/specials.ts`; another
 * map with `MULE_E2E_SEED=<seed>`.
 *
 * B-AC-9 (MG-2): given a special field on the map, when a player looks at the phone or the TV, the approved glyph
 * (the badge, variant A) shows on that plot; a plain plot shows none. On the phone, tapping a special plot selects
 * it and its plot card says what it does, first under the plot's name; when the land grant lights it, so does the
 * lit card; so do the geo drone's rail and Develop's plot card. The badge never takes a plot's taps: a tap on the part
 * that hangs over a neighbour selects the neighbour. Each badge is drawn at its density's size, and never over the
 * owner's mark of the plot it hangs into.
 */
import { createGame, POLITICS, type GameState, type Tile } from '@mule/engine';
import type { Locator, Page } from 'playwright';
import { GRANT_TICK_MS, PHASE_MS } from '../../server/src/mule-game.js';
import { check, claimAPlot, launch, PHONE, startServer, TV } from './harness';
import { readyThroughTheElection } from './politics-steps';
import { checkGlyphs as checkGlyphsOf, checkSpecialLine as checkSpecialLineOf, plotName, specialsOn, tapOnTheOverhang, tapPlot as tapPlotOf, type Density } from './special-steps';

/** Seed 93 with two seats: a 13×7 map with ruins on the top row (7,0), a crystal cavern inside (10,3) and an oasis on the bottom edge (9,6). */
const DEFAULT_SEED = 93;
const SEATS = 2;
const SEED = seedFrom(process.env.MULE_E2E_SEED);
const SHOWN_MS = 5_000;
/** How long the phone has to find Ready and press its way out of planning, which has no clock and waits for it. */
const READY_MS = 10_000;
/** The land grant, a land auction if the colony lists plots, and the walk out to development. */
const REACH_DEVELOPMENT_MS = 120_000;
/** The light sweeps row by row; a plot on row r is lit within about r + 1 rows of ticks, plus the AI's claims skipped. */
const litWithin = (t: Tile, width: number) => (t.y + 1) * width * GRANT_TICK_MS + 3_000;

// The map the server will deal, read from the engine with the same seed and seat count.
const dealt = createGame({ seed: SEED, players: Array.from({ length: SEATS }, (_, i) => ({ id: `s${i + 1}`, name: `P${i + 1}`, isAi: i > 0 })) });
const { specials, plain, inner } = specialsOn(dealt, `seed ${SEED}`);
// The inner special sits off the right and bottom edges, so its badge hangs over the plot diagonally below-right.
check(inner, `seed ${SEED}: a special field off the map's right and bottom edges, with land below-right`);
/** The plot the inner badge hangs into; the test gives it to the phone's player, so its owner's mark sits under the overhang. */
const diagonal = { x: inner.x + 1, y: inner.y + 1 };
/** A free special for the drone and Develop to look at; not the one whose diagonal the phone's player is given. */
const looked = specials.find((t) => t !== inner) ?? inner;
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
  await checkGlyphs(tvMap, 'TV, planning', 'tv');
  await checkGlyphs(hubMap, 'phone, planning', 'phone');

  // The phone's player owns the plot the inner badge hangs into (seeded, as store-steps seeds hunger): its mark stays on top.
  Object.assign(state.tiles[diagonal.y * dealt.width + diagonal.x]!, { owner: 's1' });
  const room = server.registry.get(code) as unknown as { broadcast(): void };
  room.broadcast();
  const marks = [await checkMarkOnTop(hubMap, 'phone, planning', true), await checkMarkOnTop(tvMap, 'TV, planning', false)];

  // Tap the special plot: it selects, and the plot card says what it is first under its name.
  const look = planning.getByTestId('look-plot');
  await tapPlot(phone, hubMap, inner);
  await look.filter({ hasText: `Plot ${plotName(inner)}` }).waitFor({ timeout: SHOWN_MS });
  await checkSpecialLine(look, inner.special.kind, `B-AC-9: the Look card of ${plotName(inner)}`);

  // A tap on the badge's corner, where it hangs over the neighbour below-right, selects the neighbour.
  await tapOnTheOverhang(phone, hubMap, look, inner, 2_000);

  // Negative: a plain plot's card has no special line, only its terrain hint.
  await tapPlot(phone, hubMap, plain);
  await look.filter({ hasText: `Plot ${plotName(plain)}` }).waitFor({ timeout: SHOWN_MS });
  check((await look.getByTestId('special-line').count()) === 0, `B-AC-9 (negative): the plain plot ${plotName(plain)} has no special line`);
  check((await look.getByTestId('terrain-hint').count()) === 1, `B-AC-9: the plain plot ${plotName(plain)} shows its terrain hint`);

  // The geo drone: a picked special plot's rail says what it is.
  await planning.getByTestId('tool-drone').click({ timeout: SHOWN_MS });
  await tapPlot(phone, hubMap, looked);
  const drone = planning.getByTestId('drone');
  await drone.filter({ hasText: `Plot ${plotName(looked)}` }).waitFor({ timeout: SHOWN_MS });
  await checkSpecialLine(drone, looked.special.kind, `B-AC-9: the drone rail of ${plotName(looked)}`);

  // Land grant: when the light reaches the special plot, the lit card says what it is, and both maps still draw it.
  // Through month 1's election first when the table plays politics; with politics off this is one press.
  await readyThroughTheElection(phone, POLITICS.nominateMs + POLITICS.ballotMs + POLITICS.revealMs + READY_MS + SHOWN_MS);
  const grant = phone.locator('[data-phase=landGrant]');
  await grant.waitFor({ timeout: SHOWN_MS });
  const lit = grant.getByTestId('lit').filter({ hasText: plotName(firstLit) });
  await lit.waitFor({ timeout: litWithin(firstLit, dealt.width) });
  await checkSpecialLine(lit, firstLit.special.kind, `B-AC-9: the lit card of ${plotName(firstLit)}`);
  await checkGlyphs(grant, 'phone, land grant', 'phone');
  await checkGlyphs(tv.locator('[data-phase=landGrant]'), 'TV, land grant', 'tv');

  // Development: the plot card of a tapped special plot says what it is.
  await claimAPlot(phone, PHASE_MS.landGrant + 3_000, 'the phone claims a plot, so the land grant can end');
  const dev = phone.locator('[data-phase=development]');
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: REACH_DEVELOPMENT_MS });
  const devMap = dev.getByTestId('dev-map');
  await checkGlyphs(devMap, 'phone, development', 'phone');
  await tapPlot(phone, devMap, looked);
  await dev.getByTestId('plot-title').filter({ hasText: plotName(looked) }).waitFor({ timeout: SHOWN_MS });
  await checkSpecialLine(dev.getByTestId('plot-title').locator('xpath=ancestor::section[1]'), looked.special.kind, `B-AC-9: Develop's plot card of ${plotName(looked)}`);

  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e specials: ok (seed ${SEED}, ${specials.map((t) => `${t.special.kind} ${plotName(t)}`).join(', ')}; ${marks.join('; ')})`);
} catch (err) {
  console.error(`e2e specials: FAILED (seed ${SEED})`);
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

/** specials.ts's waits: it plays its own game, so it can give each screen longer than smoke's step does. */
function checkGlyphs(map: Locator, where: string, density: Density): Promise<void> {
  return checkGlyphsOf(map, where, density, specials, plain, SHOWN_MS);
}

function checkSpecialLine(card: Locator, kind: string, what: string): Promise<void> {
  return checkSpecialLineOf(card, kind, what, SHOWN_MS);
}

function tapPlot(page: Page, map: Locator, p: { x: number; y: number }): Promise<void> {
  return tapPlotOf(page, map, p, dealt.width, SHOWN_MS);
}

/**
 * The owner's mark of the plot diagonally below-right of the inner special paints above the badge hung into it: a hit
 * test, with the badge made hittable for that one probe, at the middle of where their boxes meet. On the phone the
 * boxes meet (the badge hangs 3.75 px, the mark starts 3 px in); `mustMeet` makes the check fail if they don't.
 */
async function checkMarkOnTop(map: Locator, where: string, mustMeet: boolean): Promise<string> {
  const mark = map.locator('[role=img][data-slot]').filter({ visible: true });
  await mark.first().waitFor({ timeout: SHOWN_MS });
  const r = await map.evaluate(
    (el, { sx, sy, dx, dy, width }) => {
      const g = el.querySelector(`[data-testid="special-glyph-${sx}-${sy}"]`);
      const badge = g?.firstElementChild;
      const cell = g?.parentElement?.parentElement?.children[dy * width + dx];
      const m = cell?.querySelector('[role=img][data-slot]');
      if (!badge || !m) return null;
      const b = badge.getBoundingClientRect();
      const k = m.getBoundingClientRect();
      const x0 = Math.max(b.left, k.left);
      const x1 = Math.min(b.right, k.right);
      const y0 = Math.max(b.top, k.top);
      const y1 = Math.min(b.bottom, k.bottom);
      const boxes = { badge: [b.left, b.top, b.width, b.height], mark: [k.left, k.top, k.width, k.height], meet: [x1 - x0, y1 - y0] };
      if (x0 >= x1 || y0 >= y1) return { ...boxes, top: 'apart' };
      const probe = document.createElement('style');
      probe.textContent = '[data-testid^="special-glyph-"], [data-testid^="special-glyph-"] * { pointer-events: auto !important; }';
      document.head.append(probe);
      const hits = document.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
      probe.remove();
      const first = hits.find((h) => m.contains(h) || badge.contains(h));
      return { ...boxes, top: first && m.contains(first) ? 'mark' : first ? 'badge' : 'neither' };
    },
    { sx: inner!.x, sy: inner!.y, dx: diagonal.x, dy: diagonal.y, width: dealt.width },
  );
  check(r, `W-I1 (${where}): the special at ${plotName(inner!)} has a badge and ${plotName(diagonal)} an owner's mark`);
  const nums = `badge ${r.badge.map((n) => n.toFixed(2)).join(',')} mark ${r.mark.map((n) => n.toFixed(2)).join(',')} meet ${r.meet.map((n) => n.toFixed(2)).join('×')}`;
  check(r.top !== 'badge' && r.top !== 'neither', `W-I1 (${where}): the owner's mark on ${plotName(diagonal)} paints above the badge hung into it, got ${r.top} on top (${nums})`);
  check(!mustMeet || r.top === 'mark', `W-I1 (${where}): the badge and the mark meet, so the probe tests something (${nums})`);
  return `${where}: ${r.top} (${nums})`;
}

function seedFrom(value: string | undefined): number {
  if (value === undefined) return DEFAULT_SEED;
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(Number.isSafeInteger(n) && n >= 0)) throw new Error(`bad MULE_E2E_SEED "${value}"`);
  return n;
}
