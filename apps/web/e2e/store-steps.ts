/** The development store's checks, run as development starts by smoke.ts (scaled clocks) and screens.ts (real time). */
import { DEVELOPMENT, monthNeeds, type GameState } from '@mule/engine';
import type { Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, PHONE } from './harness';

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const SERVICES = ['door-L', 'booth-works', 'booth-greenBelt', 'booth-corral', 'booth-pub', 'door-R'];
const FITS = ['alloy', 'electronics', 'medicine'];
/** Nine working farms give a crew of nine, so the seat needs 5 Food. */
const HUNGRY_FARMS = 9;
/** Heiko's laptop, and the small phone on its side the rest of smoke.ts runs at. */
const LAPTOP = { width: 1440, height: 900 };
/** Wall-clock seconds of development the store's walk-through needs; smoke's scaled clock gives a fed seat only 5. */
const STORE_WALK_SECONDS = 30;

type CardShown = { text: string; label: string; barWidth: number; bar: string; token: string };

/** What the start-of-turn card shows, once its bar has its target width; `tone` names the colour token it should wear. */
async function cardShown(phone: Page, tone: 'holo' | 'warn'): Promise<CardShown> {
  const handle = await phone.waitForFunction(
    (token) => {
      const card = document.querySelector<HTMLElement>('[data-testid=fill-card]');
      const label = card?.querySelector('[data-num]');
      // The label sits right under the bar's track.
      const bar = label?.previousElementSibling?.firstElementChild as HTMLElement | null | undefined;
      const barWidth = parseFloat(bar?.style.width ?? '');
      if (!card || !label || !bar || !(barWidth > 0)) return null;
      const probe = document.createElement('span');
      probe.style.color = `var(--color-${token})`;
      document.body.append(probe);
      const tokenColour = getComputedStyle(probe).color;
      probe.remove();
      return { text: card.innerText, label: label.textContent ?? '', barWidth, bar: getComputedStyle(bar).backgroundColor, token: tokenColour };
    },
    tone,
    { timeout: 2_000 },
  );
  return (await handle.jsonValue()) as CardShown;
}

/** The label the card shows from its first frame, before the bar has filled. */
async function firstLabel(phone: Page, timeout: number): Promise<string> {
  const card = phone.getByTestId('fill-card');
  await card.waitFor({ timeout });
  return (await card.locator('[data-num]').textContent()) ?? '';
}

/**
 * Seats the human at 2 Food against a need of 5 for the next development, through the in-process
 * server. Call before development starts. A Medicine keeps the air from making them sick as well.
 */
export function makeHungry(server: MuleServer, code: string, seat = 's1'): void {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const state = (room as unknown as { game: { state: GameState } }).game.state;
  check(['planning', 'landGrant', 'landAuction'].includes(state.phase), `the seat is made hungry before development starts, not in ${state.phase}`);
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  for (const t of free.slice(0, HUNGRY_FARMS)) Object.assign(t, { owner: seat, outfit: 'food' });
  const p = state.players.find((q) => q.id === seat);
  check(p, `seat ${seat} in the game`);
  p.stock.food = 2;
  p.stock.medicine = Math.max(1, p.stock.medicine);
}

/** B-AC-9: a hungry player sees 2 of 5 Food and an orange bar at her devSeconds. Call as development starts after makeHungry. */
export async function hungryPlayerSeesAShortOrangeBar(phone: Page, timeout = 3_000): Promise<void> {
  const label = await firstLabel(phone, timeout);
  check(label === '29 s of 50: short of Food, so less time', `B-AC-9: from its first frame the card states the hungry player's 29 s, got "${label}"`);
  const shown = await cardShown(phone, 'warn');
  check(shown.text.includes('You eat 2 Food of the 5 you need and fill up your time bar.'), `B-AC-9: the card says she ate 2 of the 5 she needs, got "${shown.text}"`);
  check(Math.abs(shown.barWidth - (29 / DEVELOPMENT.fullSeconds) * 100) < 0.5, `B-AC-9: the bar fills to 29 s of 50, got ${shown.barWidth}%`);
  check(shown.bar === shown.token, `B-AC-9: a hungry player's bar is the warn colour, bar ${shown.bar}, warn ${shown.token}`);
}

/**
 * B-AC-9 (negative case): a fed player's bar is full and holo-coloured, and the card never costs time:
 * a tap on the corral while it shows buys the MULE and ends the card. Call as development starts, with no MULE in tow.
 */
export async function fedPlayerFillsAFullHoloBar(phone: Page, timeout = 3_000): Promise<void> {
  const label = await firstLabel(phone, timeout);
  check(label === `${DEVELOPMENT.fullSeconds} s: full time`, `B-AC-9: from its first frame the card states a fed player's full ${DEVELOPMENT.fullSeconds} s, got "${label}"`);
  const shown = await cardShown(phone, 'holo');
  check(/You eat \d+ Food and fill up your time bar/.test(shown.text) && !/you need/.test(shown.text), `B-AC-9: a fed player is told they ate and fill up, got "${shown.text}"`);
  check(Math.abs(shown.barWidth - 100) < 0.5, `B-AC-9: a fed player's bar fills the track, got ${shown.barWidth}%`);
  check(shown.bar === shown.token, `B-AC-9: a fed player's bar is the holo colour, bar ${shown.bar}, holo ${shown.token}`);

  // A raw pointer tap at the corral's centre; the page notes whether the card was up when it landed.
  const corral = await phone.locator('[data-shop=corral]').boundingBox();
  check(corral, 'B-AC-9: the corral is on the floor under the card');
  await phone.evaluate(() =>
    window.addEventListener(
      'pointerdown',
      (e) => {
        const shop = (e.target as Element).closest('[data-shop]')?.getAttribute('data-shop') ?? null;
        document.body.dataset.tapWhileCard = `${!!document.querySelector('[data-testid=fill-card]')} ${shop}`;
      },
      { capture: true, once: true },
    ),
  );
  await phone.mouse.click(corral.x + corral.width / 2, corral.y + corral.height / 2);
  const tap = await phone.evaluate(() => document.body.dataset.tapWhileCard);
  check(tap === 'true corral', `B-AC-9: the tap reached the corral while the card was up, got "${tap}"`);
  const bought = await phone
    .getByTestId('mule')
    .filter({ hasText: 'Empty MULE in tow' })
    .waitFor({ timeout: 2_000 })
    .then(() => true, () => false);
  check(bought, 'B-AC-9: a tap on the corral while the card shows buys the MULE');
  check((await phone.getByTestId('fill-card').count()) === 0, 'B-AC-9: a tap on a room ends the card');
}

/** B-AC-10: the store is one hall, two rows, and the outfitters stay shut with no MULE in tow. Call as development starts. */
export async function storeIsOneHallWithTwoRows(phone: Page, timeout = 3_000): Promise<void> {
  // Checked while the start-of-turn card is up: the rooms work from the first frame.
  await phone.getByTestId('fill-card').waitFor({ timeout });
  const hall = phone.getByTestId('store-hall');
  const ids = (row: string) => hall.getByTestId(row).evaluate((el) => [...el.children].map((c) => c.getAttribute('data-testid')).filter(Boolean));
  const top = await ids('row-outfitters');
  check(JSON.stringify(top) === JSON.stringify(OUTFITTERS.map((g) => `booth-${g}`)), `B-AC-10: the top row is the six outfitters, crops first, got ${top.join(', ')}`);
  const bottom = await ids('row-services');
  check(JSON.stringify(bottom) === JSON.stringify(SERVICES), `B-AC-10: the bottom row is the works, green belt, corral and pub between two doors, got ${bottom.join(', ')}`);
  const [topBox, bottomBox] = [await hall.getByTestId('row-outfitters').boundingBox(), await hall.getByTestId('row-services').boundingBox()];
  check(topBox && bottomBox && topBox.y + topBox.height <= bottomBox.y, 'B-AC-10: the outfitters stand above the services');
  for (const fit of FITS) check((await hall.getByTestId('booth-works').getByTestId(`fit-${fit}`).count()) === 1, `B-AC-10: the works carries the ${fit} fit`);

  const corral = hall.getByTestId('booth-corral');
  check((await phone.locator('[data-shop=corral]').getAttribute('data-testid')) === 'booth-corral', 'B-AC-10: [data-shop=corral] is the corral booth');
  const left = Number((await corral.innerText()).match(/(\d+) left/)?.[1]);
  check(left > 0, `B-AC-10: the corral counts the MULEs it has left, got "${await corral.innerText()}"`);
  check(await corral.isEnabled(), 'B-AC-10: a corral with MULEs left can be used');
  check(!(await corral.innerText()).includes('SOLD OUT'), 'B-AC-10: a corral with MULEs left is not sold out');

  for (const g of OUTFITTERS) check(await hall.getByTestId(`booth-${g}`).isDisabled(), `B-AC-10: the ${g} outfitter is disabled with no MULE in tow`);
  for (const fit of FITS) check(await hall.getByTestId(`fit-${fit}`).isDisabled(), `B-AC-10: the ${fit} fit is disabled with no MULE in tow`);
}

/** B-AC-10: the outfitters open once she leads an empty MULE. Call right after buying one. */
export async function outfittersOpenWithAnEmptyMule(phone: Page): Promise<void> {
  const hall = phone.getByTestId('store-hall');
  await phone.locator('[data-shop=food]:not([disabled])').waitFor({ timeout: 3_000 });
  for (const g of OUTFITTERS) check(await hall.getByTestId(`booth-${g}`).isEnabled(), `B-AC-10: the ${g} outfitter opens once she leads an empty MULE`);
  for (const fit of FITS) check(await hall.getByTestId(`fit-${fit}`).isEnabled(), `B-AC-10: the ${fit} fit opens once she leads an empty MULE`);
}

/** The game behind a room on the in-process server: its state and the development clocks. */
function gameOf(server: MuleServer, code: string): { state: GameState; devEndsAt: Map<string, number> } {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  return (room as unknown as { game: { state: GameState; devEndsAt: Map<string, number> } }).game;
}

/**
 * Test fixture: gives the seat STORE_WALK_SECONDS of wall time from now. Smoke runs at phaseScale 0.1, so a fed
 * seat's development lasts 5 s of wall time, too short to walk the whole store. Call once development has started.
 */
function giveStoreTime(server: MuleServer, code: string, seat: string): void {
  const game = gameOf(server, code);
  check(game.state.phase === 'development', `the store walk-through starts in development, not ${game.state.phase}`);
  game.devEndsAt.set(seat, Date.now() + STORE_WALK_SECONDS * 1_000);
}

/** One read of what the hall shows, in one pass. */
type HallRead = {
  next: string[];
  taps: string[];
  locks: Record<string, string>;
  corralMules: { state: string | null; good: string | null; saddled: boolean }[];
  led: { good: string | null; saddled: boolean }[];
  nowTitle: string;
  nowStep: string | null;
};

/** Kept a string: tsx would wrap named functions in a helper the page lacks. */
const READ_HALL = `(() => {
  const hall = document.querySelector('[data-testid=store-hall]');
  if (!hall) return null;
  const id = (el) => el.getAttribute('data-testid');
  const locks = {};
  for (const el of hall.querySelectorAll('[data-lock]')) locks[id(el.closest('[data-testid]'))] = el.textContent;
  const mule = (svg) => ({ state: svg.getAttribute('data-mule-state'), good: svg.getAttribute('data-good'), saddled: !!svg.querySelector('[data-part=saddle]') });
  return {
    next: [...hall.querySelectorAll('[data-next]')].map(id),
    taps: [...hall.querySelectorAll('[data-testid=tap-here]')].map((t) => id(t.parentElement)),
    locks,
    corralMules: [...hall.querySelectorAll('[data-testid=booth-corral] svg[data-mule-state]')].map(mule),
    led: [...hall.querySelectorAll('[data-testid^=visitor-] svg[data-mule-state]')].map(mule),
    nowTitle: document.querySelector('[data-testid=now-title]')?.textContent ?? '',
    nowStep: document.querySelector('[data-testid=now-steps]')?.getAttribute('aria-label') ?? null,
  };
})()`;

async function readHall(phone: Page): Promise<HallRead> {
  const read = (await phone.evaluate(READ_HALL)) as HallRead | null;
  check(read, 'the store hall is on the stage');
  return read;
}

/** Waits until the hall shows what `ok` wants, then returns that read; on time out, the last read. */
async function hallWhen(phone: Page, ok: (r: HallRead) => boolean, timeout = 3_000): Promise<HallRead> {
  const end = Date.now() + timeout;
  for (;;) {
    const r = await readHall(phone);
    if (ok(r) || Date.now() > end) return r;
    await phone.waitForTimeout(50);
  }
}

/**
 * B-AC-15 and B-AC-16 with no MULE in tow: the corral glows and says TAP, every outfitter, the works and the green belt
 * say "needs a MULE", Now is step 1 of 3, and the corral is a pen of MULE characters with no saddle cloth. Read in
 * one pass while the start-of-turn card is still up, so smoke's next step can tap through it. Gives the seat the
 * time the rest of the walk-through needs.
 */
export async function theCorralGlowsWithNoMule(phone: Page, server: MuleServer, code: string, seat = 's1'): Promise<void> {
  giveStoreTime(server, code, seat);
  const r = await readHall(phone);
  check(JSON.stringify(r.next) === '["booth-corral"]', `B-AC-15: with no MULE only the corral carries data-next, got ${r.next.join(', ')}`);
  check(JSON.stringify(r.taps) === '["booth-corral"]', `B-AC-15: the corral says TAP, got ${r.taps.join(', ')}`);
  for (const room of [...OUTFITTERS.map((g) => `booth-${g}`), 'booth-works', 'booth-greenBelt'])
    check(r.locks[room] === 'needs a MULE', `B-AC-15: with no MULE ${room} says "needs a MULE", got "${r.locks[room]}"`);
  check(r.nowStep === 'Step 1 of 3', `B-AC-15: Now says step 1 of 3, got ${r.nowStep} ("${r.nowTitle}")`);
  check(r.corralMules.length > 0, 'B-AC-16: the corral shows MULE characters');
  check(r.corralMules.every((m) => m.good === 'empty' && m.state === 'idle'), `B-AC-16: the corral's MULEs stand idle and empty, got ${JSON.stringify(r.corralMules)}`);
  check(r.corralMules.every((m) => !m.saddled), 'B-AC-16 (negative): a store MULE has no saddle cloth');
  check(r.led.length === 0, `B-AC-16: with no MULE in tow your colonist leads none, got ${r.led.length}`);
}

/** The engine's raw good with the largest shortfall for the seat this month, or null with none short (RULE-7 row 3). */
function largestRawShortfall(server: MuleServer, code: string, seat: string): string | null {
  const { state } = gameOf(server, code);
  const need = monthNeeds(state, seat);
  const have = state.players.find((p) => p.id === seat)!.stock;
  let best: string | null = null;
  let most = 0;
  for (const g of OUTFITTERS) {
    const short = need[g as keyof typeof need] - have[g as keyof typeof have];
    if (short > most) [best, most] = [g, short];
  }
  return best;
}

/** How far the hall is from filling the stage's content box, in px, at the current viewport. */
async function hallGap(phone: Page): Promise<{ w: number; h: number; wide: string | null }> {
  return phone.evaluate(`(() => {
    const stage = document.querySelector('[data-testid=stage]');
    const hall = document.querySelector('[data-testid=store-hall]').getBoundingClientRect();
    const cs = getComputedStyle(stage);
    const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return { w: Math.abs(w - hall.width), h: Math.abs(h - hall.height), wide: document.querySelector('[data-testid=game-shell]').getAttribute('data-wide') };
  })()`);
}

/**
 * B-AC-15 and B-AC-16 from an empty MULE to an outfitted one: the led MULE is empty (step 2), RULE-7 row 3 glows
 * at most the engine's largest raw shortfall; outfitted for Energy it is lit with Energy and saddled, both doors
 * glow (step 3); the hall fills the stage at 1440×900 and 844×390; walking out lands on the map with a plot of
 * yours selected. Ends back in the store, at 844×390. Call right after buying the MULE.
 */
export async function theLedMuleLightsUp(phone: Page, server: MuleServer, code: string, seat = 's1'): Promise<string> {
  const empty = await hallWhen(phone, (r) => r.led[0]?.good === 'empty');
  check(empty.led.length === 1 && empty.led[0]!.good === 'empty', `B-AC-16: the MULE she leads is empty, got ${JSON.stringify(empty.led)}`);
  check(empty.led[0]!.saddled, 'B-AC-16: the MULE she leads wears her colour');
  check(empty.nowStep === 'Step 2 of 3' && empty.nowTitle === 'Choose what your MULE makes', `B-AC-15: Now says step 2, choose what it makes, got ${empty.nowStep} "${empty.nowTitle}"`);
  check(empty.locks['booth-corral'] === 'one at a time', `B-AC-15: with a MULE in tow the corral says "one at a time", got "${empty.locks['booth-corral']}"`);
  // Row 3 names the largest raw shortfall in monthNeeds, once the view carries it (PR-9); before that, nothing.
  const short = largestRawShortfall(server, code, seat);
  const glow = empty.next;
  check(glow.length === 0 || (short !== null && JSON.stringify(glow) === JSON.stringify([`booth-${short}`])), `B-AC-15: an empty MULE glows nothing or the ${short ?? 'no'} outfitter (largest shortfall), got ${glow.join(', ')}`);

  await phone.locator('[data-shop=energy]:not([disabled])').click({ timeout: 2_000 });
  const lit = await hallWhen(phone, (r) => r.led[0]?.good === 'energy' && r.next.length === 2);
  check(lit.led[0]?.good === 'energy', `B-AC-16: outfitted, the MULE she leads is lit with Energy, got ${JSON.stringify(lit.led)}`);
  check(lit.led[0]!.saddled, 'B-AC-16: the outfitted MULE she leads keeps her saddle cloth');
  check(JSON.stringify(lit.next) === '["door-L","door-R"]', `B-AC-15: with an Energy MULE in the store both doors carry data-next, got ${lit.next.join(', ')}`);
  check(lit.nowStep === 'Step 3 of 3' && lit.nowTitle === 'Walk out and install it', `B-AC-15: Now says step 3, walk out, got ${lit.nowStep} "${lit.nowTitle}"`);
  check(lit.corralMules.every((m) => !m.saddled), 'B-AC-16 (negative): the corral MULEs stay unsaddled');

  // In the store the hall fills the stage at both sizes.
  const sizes: string[] = [];
  for (const [name, size, wide] of [['1440×900', LAPTOP, 'true'], ['844×390', PHONE.viewport, 'false']] as const) {
    await phone.setViewportSize(size);
    await phone.waitForFunction((w) => document.querySelector('[data-testid=game-shell]')?.getAttribute('data-wide') === w, wide, { timeout: 2_000 });
    const gap = await hallGap(phone);
    check(gap.w <= 1 && gap.h <= 1, `B-AC-15: at ${name} the hall fills the stage, off by ${gap.w} × ${gap.h} px`);
    sizes.push(`${name} ±${Math.max(gap.w, gap.h).toFixed(1)} px`);
  }

  // Walking out lands on the map with a plot of hers selected and ready to install on.
  const dev = phone.locator('[data-phase=development]');
  await dev.getByRole('button', { name: 'Walk out to the map' }).click({ timeout: 2_000 });
  await dev.getByText('YOURS', { exact: true }).waitFor({ timeout: 2_000 });
  const install = dev.getByRole('button', { name: /^(Install here|Replace MULE)$/ });
  check(await install.isEnabled(), 'B-AC-15: walked out with an Energy MULE, a plot of hers is selected to install on');
  const title = (await phone.getByTestId('now-title').textContent()) ?? '';
  check(title === 'Install your Energy MULE here', `B-AC-15: on her selected plot Now says install it here, got "${title}"`);
  await dev.getByRole('button', { name: 'Store', exact: true }).click({ timeout: 2_000 });
  await phone.getByTestId('store-hall').waitFor({ timeout: 2_000 });
  return sizes.join(', ');
}
