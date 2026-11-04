/**
 * B-AC-9 (MG-2) as a step of the whole game: given a special field on the map, when a player looks at the phone or the
 * TV, the approved glyph (the badge, variant A) shows on that plot; a plain plot shows none. On the phone, tapping a
 * special plot shows its special line, and a tap on the part of the badge that hangs over a neighbour selects the
 * neighbour. smoke.ts calls it once at the start of month 1's planning, where both screens show the map.
 * It runs held, so planning can't end on its clock mid-step; still quick, since an end that comes due meanwhile runs at
 * release, before smoke's Ready. Under a hold the header's timer reads 0, so the step reads no timer.
 * The helpers below are specials.ts's too (local only), which also checks the badge in later phases and its geometry.
 */
import type { GameState, Tile } from '@mule/engine';
import { SPECIAL_BADGE } from '@mule/ui';
import type { Locator, Page } from 'playwright';
import { check, type GameStepContext } from './harness';

/** A screen's longest wait for what it should already show. Short: a planning end that comes due while held runs at release, before smoke's Ready. */
const STEP_MS = 2_000;

export type Density = keyof typeof SPECIAL_BADGE;
export type Plot = { x: number; y: number };
export type Special = Tile & { special: NonNullable<Tile['special']> };

/** The map's special plots, a plain plot away from all of them, and a special whose badge hangs over a plot a tap can select. */
export interface SpecialsOnMap {
  specials: Special[];
  plain: Tile;
  /** A special off the right and bottom edges whose plot diagonally below-right is land, so a tap there selects it. */
  inner: Special | undefined;
}

/** Reads what B-AC-9 checks from a map: the server's game state, or the engine's createGame with the same seed. */
export function specialsOn(map: Pick<GameState, 'tiles' | 'width' | 'height'>, what: string): SpecialsOnMap {
  const specials = map.tiles.filter((t): t is Special => !!t.special);
  check(specials.length > 0, `${what}: the map has special fields`);
  const plain = map.tiles.find((t) => !t.special && t.terrain !== 'store' && !specials.some((s) => Math.abs(s.x - t.x) <= 1 && Math.abs(s.y - t.y) <= 1));
  check(plain, `${what}: the map has a plain plot away from every special field`);
  const inner = specials.find((t) => t.x < map.width - 1 && t.y < map.height - 1 && map.tiles[(t.y + 1) * map.width + t.x + 1]!.terrain !== 'store');
  return { specials, plain, inner };
}

/**
 * B-AC-9 in month 1's planning: the badges on the TV's map and the phone's hub map, the Look card's special line, and
 * a tap on a badge's overhang selecting the neighbour. Reads the map the server dealt, so it holds for any seed.
 */
export async function specialFieldsShowTheirGlyphs({ phone, tv, server, code, held }: GameStepContext): Promise<void> {
  const started = Date.now();
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const state = (room as unknown as { game: { state: GameState } }).game.state;
  // Presses no Ready inside: a hold doesn't hold a message, and the last Ready ends planning.
  const said = await held(async () => {
    check(state.phase === 'planning', `B-AC-9: the special-fields step runs in planning, not in ${state.phase}`);
    const { specials, plain, inner } = specialsOn(state, `room ${code}`);

    const planning = phone.locator('[data-phase=planning]');
    const hubMap = planning.getByTestId('hub-map');
    await checkGlyphs(tv.locator('[data-phase=planning]'), 'TV, planning', 'tv', specials, plain, STEP_MS);
    await checkGlyphs(hubMap, 'phone, planning', 'phone', specials, plain, STEP_MS);

    // Tap a special plot: the Look card says what it is, first under its name.
    const tapped = inner ?? specials[0]!;
    const look = planning.getByTestId('look-plot');
    await tapPlot(phone, hubMap, tapped, state.width, STEP_MS);
    await look.filter({ hasText: `Plot ${plotName(tapped)}` }).waitFor({ timeout: STEP_MS });
    await checkSpecialLine(look, tapped.special.kind, `B-AC-9: the Look card of ${plotName(tapped)}`, STEP_MS);
    if (inner) await tapOnTheOverhang(phone, hubMap, look, inner, STEP_MS);
    // Leave the hub as smoke found it, for its Ready.
    await look.getByRole('button', { name: 'CLOSE' }).click({ timeout: STEP_MS });
    await look.waitFor({ state: 'detached', timeout: STEP_MS });

    const overhang = inner ? `overhang of ${plotName(inner)} selects ${plotName({ x: inner.x + 1, y: inner.y + 1 })}` : 'no special with a land plot below-right, overhang not tapped';
    return `${specials.map((t) => `${t.special.kind} ${plotName(t)}`).join(', ')} on TV and phone; ${overhang}`;
  });
  console.log(`special fields: ${said}; held ${Date.now() - started} ms`);
}

export function plotName(p: Plot): string {
  return `${p.x + 1}·${p.y + 1}`;
}

export function glyph(map: Locator, p: Plot): Locator {
  return map.locator(`[data-testid="special-glyph-${p.x}-${p.y}"]`);
}

/**
 * B-AC-9: every special plot carries its glyph with its kind, and inside it a visible badge of its density's size
 * (scaled with the map, as the TV's stage is); nothing else on the map does, the plain plot included. One read of the
 * whole map once its first glyph shows.
 */
export async function checkGlyphs(map: Locator, where: string, density: Density, specials: Special[], plain: Plot, timeout: number): Promise<void> {
  const first = specials[0]!;
  const seen = await glyph(map, first).waitFor({ state: 'visible', timeout }).then(() => true, () => false);
  check(seen, `B-AC-9 (${where}): the ${first.special.kind} on ${plotName(first)} shows its glyph`);
  // Kept free of named functions: tsx's keepNames wraps them with `__name`, which the page lacks.
  const drawn = await map.evaluate((el) =>
    [...el.querySelectorAll('[data-testid^="special-glyph-"]')].map((g) => {
      const b = g.firstElementChild as HTMLElement | null;
      const root = g.closest('.shadow-map') as HTMLElement | null;
      const r = b?.getBoundingClientRect();
      return {
        id: g.getAttribute('data-testid') ?? '',
        kind: g.getAttribute('data-kind'),
        badge:
          b && root && r
            ? { w: b.offsetWidth, h: b.offsetHeight, rw: r.width, rh: r.height, scale: root.getBoundingClientRect().width / root.offsetWidth, visible: b.checkVisibility({ opacityProperty: true, visibilityProperty: true }), hexagon: !!b.querySelector('svg path') }
            : null,
      };
    }),
  );
  const box = SPECIAL_BADGE[density].box;
  for (const t of specials) {
    const g = drawn.find((d) => d.id === `special-glyph-${t.x}-${t.y}`);
    check(g, `B-AC-9 (${where}): the ${t.special.kind} on ${plotName(t)} shows its glyph`);
    check(g.kind === t.special.kind, `B-AC-9 (${where}): the glyph on ${plotName(t)} says ${t.special.kind}, got ${g.kind}`);
    const badge = g.badge;
    check(badge, `B-AC-9 (${where}): the glyph on ${plotName(t)} holds a badge`);
    check(badge.visible && badge.hexagon, `B-AC-9 (${where}): the badge on ${plotName(t)} is visible and drawn`);
    const want = box * badge.scale;
    check(
      badge.w === box && badge.h === box && Math.abs(badge.rw - want) < 0.5 && Math.abs(badge.rh - want) < 0.5,
      `B-AC-9 (${where}): the badge on ${plotName(t)} is ${box} px (${want.toFixed(1)} on screen), got ${badge.w}×${badge.h} (${badge.rw.toFixed(1)}×${badge.rh.toFixed(1)})`,
    );
  }
  check(!drawn.some((d) => d.id === `special-glyph-${plain.x}-${plain.y}`), `B-AC-9 (${where}, negative): the plain plot ${plotName(plain)} shows no glyph`);
  check(drawn.length === specials.length, `B-AC-9 (${where}, negative): ${specials.length} glyphs for ${specials.length} special fields, got ${drawn.length}`);
}

/** The card's special line, with its kind, comes first under the plot's name: before the terrain hint or the ground card. */
export async function checkSpecialLine(card: Locator, kind: string, what: string, timeout: number): Promise<void> {
  const line = card.getByTestId('special-line');
  const seen = await line.waitFor({ timeout }).then(() => true, () => false);
  check(seen, `${what} shows the special line`);
  const shown = await card.evaluate((el) => {
    const l = el.querySelector('[data-testid=special-line]');
    const next = el.querySelector('[data-testid=terrain-hint], [data-testid=ground]');
    return { kind: l?.getAttribute('data-kind') ?? null, first: !!l && !!next && !!(l.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  check(shown.kind === kind, `${what}: the special line says ${kind}, got ${shown.kind}`);
  check(shown.first, `${what}: the special line comes before the terrain hint or the ground card`);
}

/**
 * The badge never takes a plot's taps: a tap on its corner, where it hangs over the plot diagonally below-right, selects
 * that neighbour. The glyph spans its plot, as in the mock; the badge is its child, hung over the plot's lower-right corner.
 */
export async function tapOnTheOverhang(phone: Page, map: Locator, look: Locator, inner: Special, timeout: number): Promise<void> {
  const badge = await glyph(map, inner).locator(':scope > span').boundingBox({ timeout });
  check(badge, `B-AC-9: the badge on ${plotName(inner)} has a box`);
  await phone.touchscreen.tap(badge.x + badge.width - 1.5, badge.y + badge.height - 1.5);
  const neighbour = { x: inner.x + 1, y: inner.y + 1 };
  const shown = await look
    .filter({ hasText: `Plot ${plotName(neighbour)}` })
    .waitFor({ timeout })
    .then(() => true, () => false);
  check(shown, `B-AC-9: a tap on the badge's hanging corner selects the neighbour ${plotName(neighbour)}, the card shows "${(await look.count()) > 0 ? await look.textContent() : 'nothing: the tap went to the special plot and closed it'}"`);
}

/** Taps the middle of a plot on the map. Player marks are labelled images inside the plots, so they don't count as plots. */
export async function tapPlot(page: Page, map: Locator, p: Plot, width: number, timeout: number): Promise<void> {
  const box = await map.locator('[aria-label]:not([role=img])').nth(p.y * width + p.x).boundingBox({ timeout });
  check(box, `plot ${plotName(p)} is on screen`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
