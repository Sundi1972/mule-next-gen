/** The development store's checks, run as development starts by smoke.ts (scaled clocks) and screens.ts (real time). */
import { boxOf, DEV_STEER, DEV_WALK, DEVELOPMENT, foodShare, HALL, isOpenFloor, mulePrice, placeAt, type HallPlace, hungerPace, monthNeeds, needsOf, sickPace, type GameState } from '@mule/engine';
import type { DevFrame } from '@mule/protocol';
import type { Browser, Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check, CLAIM_MS, claimAPlot, doneWithLand, PHONE, PHONE_SMALL, plotCentre, pressAct, steerTo, throughDoor, type SteerTarget } from './harness';

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const SERVICES = ['door-L', 'booth-works', 'booth-greenBelt', 'booth-corral', 'booth-pub', 'door-R'];
const FITS = ['alloy', 'electronics', 'medicine'];
/** Nine working farms give a crew of nine, so the seat needs 5 Food. */
const HUNGRY_FARMS = 9;
/** Heiko's laptop, and the small phone on its side the rest of smoke.ts runs at. */
const LAPTOP = { width: 1440, height: 900 };
/** Wall-clock seconds of development the store's walk-through needs; smoke's scaled clock gives a fed seat only 5. */
const STORE_WALK_SECONDS = 30;
/** B-AC-15's row 7 once her MULE is in and the clock runs. */
const INSTALLED = 'MULE installed. What next?';
/** A-1: row 7 instead while month 1's clock waits for another seat ("… waiting for X" or "… X +1"). */
const WAIT_TITLE = 'Your MULE is in · waiting for ';
/** How long the other seats may take to get their first MULEs in once hers is. */
const FIRST_MULES_MS = 15_000;

/** The pace line the start-of-turn card shows from its first frame. */
async function firstLabel(phone: Page, timeout: number): Promise<string> {
  const card = phone.getByTestId('fill-card');
  await card.waitFor({ timeout });
  return (await card.locator('[data-num]').textContent()) ?? '';
}

/**
 * Seats the human at 2 Food against a need of 5 for the next development, through the in-process
 * server, and sends every screen the view that makes. Call before development starts. A Medicine keeps
 * the air from making them sick as well.
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
  // The seed changed the state behind the game's back, and the room only broadcasts after an intent or a phase
  // change; its private broadcast() is the one way to show the seed in the phase it was made in (B-AC-14).
  const seeded = room as unknown as { broadcast(): void };
  check(typeof seeded.broadcast === 'function', 'the room still has broadcast() for test seeding');
  seeded.broadcast();
}

/** What the engine says of the seat this month: the Food it ate and needs, the share it went without, and its pace in %. */
function seatCondition(server: MuleServer, code: string, seat: string) {
  const state = gameOf(server, code).state;
  const p = state.players.find((q) => q.id === seat);
  check(p, `seat ${seat} in the game`);
  const need = needsOf(state, seat).food;
  return { ate: Math.min(p.stock.food, need), need, missing: 1 - foodShare(state, seat), sick: p.sick, pace: Math.round(hungerPace(state, seat) * sickPace(state, seat) * 100) };
}

/** The condition tag on the seat's colonist in the store, or null when it wears none. */
async function tagOn(phone: Page, seat: string): Promise<{ hunger: string | null; sick: string | null } | null> {
  const tag = phone.getByTestId(`visitor-${seat}`).getByTestId(`condition-${seat}`);
  if ((await tag.count()) === 0) return null;
  return { hunger: await tag.getAttribute('data-hunger'), sick: await tag.getAttribute('data-sick') };
}

/**
 * B-AC-9: a hungry player's start card says what she ate and, from its first frame, her pace at her hunger level;
 * her colonist wears the hunger tag at that level. Call as development starts after makeHungry.
 */
export async function hungryPlayerSeesHerPace(phone: Page, server: MuleServer, code: string, timeout = 3_000, seat = 's1'): Promise<void> {
  const label = await firstLabel(phone, timeout);
  const c = seatCondition(server, code, seat);
  const { hungryFrom, starvingFrom } = DEV_WALK.hungerLevels;
  check(c.missing >= hungryFrom && c.missing < starvingFrom && !c.sick, `B-AC-9: makeHungry leaves ${seat} hungry and well, missing ${c.missing} of its Food, sick ${c.sick}`);
  check(label === `Hungry: ${c.pace}% pace`, `B-AC-9: from its first frame the card states the hungry player's pace, "Hungry: ${c.pace}% pace", got "${label}"`);
  const text = (await phone.getByTestId('fill-card').innerText()).replace(/\s+/g, ' ');
  check(text.includes(`You eat ${c.ate} of the ${c.need} Food you need.`), `B-AC-9: the card says she ate ${c.ate} of the ${c.need} she needs, got "${text}"`);
  const tag = await tagOn(phone, seat);
  check(tag?.hunger === '2' && tag.sick === null, `B-AC-9: her colonist wears the hunger tag at level 2, hungry, got ${JSON.stringify(tag)}`);
}

/**
 * B-AC-9 (negative case): a fed player is told she ate the Food she needs, and neither her card nor her colonist
 * shows hunger; a sickness the seed rolled shows as the sick cross and its pace. The card never costs time: a tap on
 * the corral while it shows buys the MULE and ends the card. Call as development starts, with no MULE in tow.
 */
export async function fedPlayerSeesNoHunger(phone: Page, server: MuleServer, code: string, timeout = 3_000, seat = 's1'): Promise<void> {
  const label = await firstLabel(phone, timeout);
  const c = seatCondition(server, code, seat);
  check(c.missing === 0, `B-AC-9: ${seat} is fed this month, missing ${c.missing} of its Food`);
  const want = c.sick ? `Sick: ${c.pace}% pace` : 'Fed: full pace';
  check(label === want, `B-AC-9: from its first frame the card states a fed player's pace, "${want}", got "${label}"`);
  const text = (await phone.getByTestId('fill-card').innerText()).replace(/\s+/g, ' ');
  check(text.includes(`You eat the ${c.need} Food you need.`), `B-AC-9: a fed player is told she ate the ${c.need} Food she needs, got "${text}"`);
  const tag = await tagOn(phone, seat);
  check(c.sick ? tag?.hunger === '0' && tag.sick === 'true' : tag === null, `B-AC-9: a fed player's colonist wears ${c.sick ? 'only the sick cross' : 'no tag'}, got ${JSON.stringify(tag)}`);

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

type Game = { state: GameState; devEndsAt: number | null; ctx: { now(): number; changed(): void } };

/** The game behind a room on the in-process server: its state, the one development clock and the room's context. */
function gameOf(server: MuleServer, code: string): Game {
  const room = server.registry.get(code);
  check(room, `a room ${code} on the server`);
  const game = (room as unknown as { game: Game }).game;
  check(typeof game?.ctx?.now === 'function' && typeof game.ctx.changed === 'function' && (typeof game.devEndsAt === 'number' || game.devEndsAt === null), 'the room game still exposes ctx and devEndsAt');
  return game;
}

/**
 * Test fixture: gives development STORE_WALK_SECONDS of wall time from now, on the one clock every seat shares. Smoke
 * runs at phaseScale 0.1, so development lasts 5 s of wall time, too short to walk the whole store. Call once
 * development has started.
 */
function giveStoreTime(server: MuleServer, code: string, seat: string): void {
  const game = gameOf(server, code);
  check(game.state.phase === 'development', `the store walk-through for ${seat} starts in development, not ${game.state.phase}`);
  // Month 1's clock waits, full, until every first MULE is in: no time to give yet.
  if (game.devEndsAt === null) return;
  game.devEndsAt = game.ctx.now() + STORE_WALK_SECONDS * 1_000;
  // Send every phone the new clock now, rather than at the next AI tick.
  game.ctx.changed();
}

/** One read of what the hall shows, in one pass. */
type HallRead = {
  next: string[];
  taps: string[];
  locks: Record<string, string>;
  corralMules: { state: string | null; good: string | null; saddled: boolean }[];
  led: { good: string | null; saddled: boolean; slot: string | null }[];
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
  const mule = (svg) => ({ state: svg.getAttribute('data-mule-state'), good: svg.getAttribute('data-good'), saddled: !!svg.querySelector('[data-part=saddle]'), slot: svg.querySelector('[data-part=saddle]')?.getAttribute('data-slot') ?? null });
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

/** The seat's colour slot: the colour it chose in the lobby, the room seat's colour % 6, as derive.ts slotOf reads it. */
function seatSlot(server: MuleServer, code: string, seat: string): number {
  const seats = (gameOf(server, code) as unknown as { seats: { id: string; color: number }[] }).seats;
  const s = seats.find((q) => q.id === seat);
  check(s, `seat ${seat} in the game`);
  return s.color % 6;
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
async function hallGap(phone: Page): Promise<{ w: number; h: number; wide: string | null; nowFirst: boolean }> {
  return phone.evaluate(`(() => {
    const stage = document.querySelector('[data-testid=stage]');
    const hall = document.querySelector('[data-testid=store-hall]').getBoundingClientRect();
    const cs = getComputedStyle(stage);
    const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const guide = document.querySelector('[data-testid=guide]');
    const now = guide.querySelector('[data-testid=now]');
    return {
      w: Math.abs(w - hall.width),
      h: Math.abs(h - hall.height),
      wide: document.querySelector('[data-testid=game-shell]').getAttribute('data-wide'),
      // The rail's body, right after its header, opens with Now (shell-steps' probe).
      nowFirst: !!now && guide.querySelector('header')?.nextElementSibling?.firstElementChild === now,
    };
  })()`);
}

/**
 * B-AC-15 and B-AC-16 from an empty MULE to an installed one: the led MULE is empty and wears her seat's colour
 * (step 2); RULE-7 row 3 glows exactly the engine's largest raw shortfall; outfitted for Energy it is lit with
 * Energy, both doors glow (step 3); the hall fills the stage at 1440×900 and 844×390, and the rail opens with Now
 * (B-AC-12); walking out lands on the map with a plot of hers selected; installed, Now says what next (row 7).
 * Ends back in the store, at 844×390. Call right after buying the MULE.
 */
export async function theLedMuleLightsUp(phone: Page, server: MuleServer, code: string, seat = 's1'): Promise<string> {
  const empty = await hallWhen(phone, (r) => r.led[0]?.good === 'empty');
  check(empty.led.length === 1 && empty.led[0]!.good === 'empty', `B-AC-16: the MULE she leads is empty, got ${JSON.stringify(empty.led)}`);
  check(empty.led[0]!.saddled, 'B-AC-16: the MULE she leads wears a saddle cloth');
  const slot = String(seatSlot(server, code, seat));
  check(empty.led[0]!.slot === slot, `B-AC-16: the MULE she leads wears her seat's colour (slot ${slot}), got slot ${empty.led[0]!.slot}`);
  check(empty.nowStep === 'Step 2 of 3' && empty.nowTitle === 'Choose what your MULE makes', `B-AC-15: Now says step 2, choose what it makes, got ${empty.nowStep} "${empty.nowTitle}"`);
  check(empty.locks['booth-corral'] === 'one at a time', `B-AC-15: with a MULE in tow the corral says "one at a time", got "${empty.locks['booth-corral']}"`);
  // Row 3 glows the outfitter of the largest raw shortfall in the engine's monthNeeds; with none short, nothing.
  const short = largestRawShortfall(server, code, seat);
  const want = short === null ? [] : [`booth-${short}`];
  check(JSON.stringify(empty.next) === JSON.stringify(want), `B-AC-15: an empty MULE glows ${short === null ? 'nothing (no shortfall)' : `the ${short} outfitter (largest shortfall)`}, got [${empty.next.join(', ')}]`);
  // Both branches every run: with her Water emptied for a moment there is a shortfall, and its outfitter glows.
  const seeded = await withNoWater(server, code, seat, async (lack) => {
    const r = await hallWhen(phone, (h) => JSON.stringify(h.next) === JSON.stringify([`booth-${lack}`]));
    check(JSON.stringify(r.next) === JSON.stringify([`booth-${lack}`]), `B-AC-15: short of ${lack}, an empty MULE glows the ${lack} outfitter, got [${r.next.join(', ')}]`);
    check(r.nowTitle === 'Choose what your MULE makes', `B-AC-15: Now still says choose what it makes, got "${r.nowTitle}"`);
    return lack;
  });
  const back = await hallWhen(phone, (h) => JSON.stringify(h.next) === JSON.stringify(want));
  check(JSON.stringify(back.next) === JSON.stringify(want), `B-AC-15: with her Water back the glow returns to [${want.join(', ')}], got [${back.next.join(', ')}]`);

  await phone.locator('[data-shop=energy]:not([disabled])').click({ timeout: 2_000 });
  const lit = await hallWhen(phone, (r) => r.led[0]?.good === 'energy' && r.next.length === 2);
  check(lit.led[0]?.good === 'energy', `B-AC-16: outfitted, the MULE she leads is lit with Energy, got ${JSON.stringify(lit.led)}`);
  check(lit.led[0]!.saddled && lit.led[0]!.slot === slot, `B-AC-16: the outfitted MULE she leads keeps her saddle cloth (slot ${slot}), got ${lit.led[0]!.slot}`);
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
    check(gap.nowFirst, `B-AC-12: at ${name} the development rail opens with Now`);
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
  // Installed, Now moves on to row 7 in the same frame the MULE leaves her: never back to "Buy a MULE". A-1: while
  // month 1's clock still waits for another seat's first MULE, row 7 is the wait title instead.
  const titles = phone.evaluate(`new Promise((resolve) => {
    const seen = [];
    const read = () => document.querySelector('[data-testid=now-title]')?.textContent ?? '';
    const watch = new MutationObserver(() => {
      seen.push(read());
      if (seen.at(-1) === ${JSON.stringify(INSTALLED)} || seen.at(-1).startsWith(${JSON.stringify(WAIT_TITLE)})) { watch.disconnect(); resolve(seen); }
    });
    watch.observe(document.body, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { watch.disconnect(); resolve(seen); }, 3000);
  })`) as Promise<string[]>;
  await install.click({ timeout: 2_000 });
  let after = await titles;
  // The server's month-1 clock, read as giveStoreTime reads it: null in development while it waits for a first MULE.
  const waits = gameOf(server, code).devEndsAt === null;
  if (waits) check(after.at(-1)?.startsWith(WAIT_TITLE), `B-AC-15 (A-1): after installing while month 1's clock waits, Now says "${WAIT_TITLE}…", saw ${JSON.stringify(after)}`);
  // Row 7 once the clock runs: at once when she was the last seat in, else once the last first MULE is in. The steps
  // after this one need the clock running, as they had it before A-1.
  if (after.at(-1) !== INSTALLED) {
    await phone.getByTestId('now-title').filter({ hasText: INSTALLED }).waitFor({ timeout: waits ? FIRST_MULES_MS : 2_000 }).catch(() => undefined);
    after = [...after, (await phone.getByTestId('now-title').textContent()) ?? ''];
  }
  if (waits) check(gameOf(server, code).devEndsAt !== null, `A-1: month 1's clock did not start within ${FIRST_MULES_MS / 1_000} s of her MULE going in (devEndsAt still null)`);
  check(after.at(-1) === INSTALLED, `B-AC-15: once the clock runs Now says "${INSTALLED}", saw ${JSON.stringify(after)}`);
  // The clock runs now, started by the last first MULE, hers or another's; the earlier giveStoreTime gave nothing if it
  // still waited then. Giving it again only moves the end later (now + STORE_WALK_SECONDS), so give it either way.
  giveStoreTime(server, code, seat);
  check(!after.includes('Buy a MULE at the corral'), `B-AC-15: no frame shows "Buy a MULE" between the install and row 7, saw ${JSON.stringify(after)}`);
  await dev.getByRole('button', { name: 'Store', exact: true }).click({ timeout: 2_000 });
  await phone.getByTestId('store-hall').waitFor({ timeout: 2_000 });
  return `${sizes.join(', ')}; row 3 glowed ${short ?? 'nothing (no shortfall)'}, then ${seeded} when short`;
}

/**
 * Test fixture: empties the seat's Water while `fn` runs, so monthNeeds has a shortfall, then puts it back. Nothing
 * is produced or eaten during development, so the game goes on as if it never happened. `fn` gets the engine's
 * largest raw shortfall at that moment.
 */
async function withNoWater<T>(server: MuleServer, code: string, seat: string, fn: (lack: string) => Promise<T>): Promise<T> {
  const game = gameOf(server, code);
  const p = game.state.players.find((q) => q.id === seat);
  check(p, `seat ${seat} in the game`);
  const kept = p.stock.water;
  p.stock.water = 0;
  game.ctx.changed();
  try {
    const lack = largestRawShortfall(server, code, seat);
    check(lack !== null, 'with no Water the seat is short of something this month');
    return await fn(lack);
  } finally {
    p.stock.water = kept;
    game.ctx.changed();
  }
}

// --- Steered development (arcade spec C6, C11, C12): the phones, the laptop and the TV against a flag-on server ------

/** The server's floor, as #235 keeps it: each colonist where the last tick left it. */
type FloorColonist = { id: string; x: number; y: number; space: 'map' | 'hall' };
type SteeredGame = Game & {
  steering: { floor: { tick: number; colonists: FloorColonist[] } } | null;
  away: Set<string>;
  startClock(): void;
};

/** The steered game behind a room; fails unless the server steers its development. */
function steeredOf(server: MuleServer, code: string): SteeredGame {
  const game = gameOf(server, code) as SteeredGame;
  check(game.steering !== undefined && game.away instanceof Set && typeof game.startClock === 'function', 'the room game still exposes steering, away and startClock');
  return game;
}

/** Where the server has a seat's colonist now. */
function onFloor(server: MuleServer, code: string, seat: string): FloorColonist {
  const steering = steeredOf(server, code).steering;
  check(steering, `the server steers development for ${seat}`);
  const c = steering.floor.colonists.find((k) => k.id === seat);
  check(c, `seat ${seat} has a colonist on the floor`);
  return { id: c.id, x: c.x, y: c.y, space: c.space };
}

const where = (c: { x: number; y: number; space: string }) => `${c.space} ${c.x.toFixed(2)},${c.y.toFixed(2)}`;

/** One screen's socket as the e2e hears it: the frames that came, and the steers and presses that went. */
export interface Wire {
  frames: { at: number; frame: DevFrame }[];
  steers: { at: number; x: number; y: number; tick: number | undefined }[];
  acts: number[];
}

/** Listens on every socket the page opens from now on: call before its first goto. */
export function watchWire(page: Page): Wire {
  const wire: Wire = { frames: [], steers: [], acts: [] };
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string' || !f.payload.startsWith('{"t":"frame"')) return;
      wire.frames.push({ at: Date.now(), frame: (JSON.parse(f.payload) as { payload: DevFrame }).payload });
    });
    ws.on('framesent', (f) => {
      if (typeof f.payload !== 'string') return;
      const m = JSON.parse(f.payload) as { t: string; intent?: { type: string; x?: number; y?: number; tick?: number } };
      if (m.t !== 'intent' || !m.intent) return;
      if (m.intent.type === 'steer') wire.steers.push({ at: Date.now(), x: m.intent.x ?? NaN, y: m.intent.y ?? NaN, tick: m.intent.tick });
      if (m.intent.type === 'act') wire.acts.push(Date.now());
    });
  });
  return wire;
}

/** The most steers the page sent in any one second of `steers`. */
function busiestSecond(steers: Wire['steers']): number {
  return steers.reduce((most, s) => Math.max(most, steers.filter((q) => q.at >= s.at && q.at < s.at + 1_000).length), 0);
}

/** A table with steered development: people's phones (a computer seat is never waited for), and a TV or none. */
export interface ArcadeTable {
  server: MuleServer;
  code: string;
  /** Seat s1, the host. B-AC-3 turns it into a laptop. */
  heiko: Page;
  /** Seat s2. */
  mia: Page;
  /** Every phone by seat, s1 first: Heiko, Mia and any others. */
  phones: Page[];
  tv: Page | null;
  wires: { heiko: Wire; mia: Wire; tv: Wire | null; phones: Wire[] };
  /** Where the pages' errors go. */
  errors: string[];
}

/** Real ms a frame is due at the server's 20 Hz tick, at phaseScale 1. */
const TICK_MS = DEV_STEER.tickMs;
/** Development's start may wait for its event show (RULE-4) before the floor's first tick. */
const FLOOR_STARTS_MS = 15_000;

/**
 * People's phones join a game on a server that steers its development (the first hosts), a TV watches unless `tv` is
 * false, and each claims a plot and is done with land; returns once the floor ticks. `server` must be started with
 * devSteer and phaseScale 1, so frames come at the tick's own 20 Hz and a stride never overshoots a reach.
 */
export async function arcadeTable(
  browser: Browser,
  base: string,
  server: MuleServer,
  errors: string[],
  { names = ['Heiko', 'Mia'], tv: withTv = true }: { names?: string[]; tv?: boolean } = {},
): Promise<ArcadeTable> {
  check(names.length >= 2, 'arcade: at least two people, so a computer seat is never all there is');
  const open = async (name: string, options: Parameters<Browser['newContext']>[0]) => {
    const page = await (await browser.newContext(options)).newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    return { page, wire: watchWire(page) };
  };
  const host = await open(names[0]!, PHONE);
  await host.page.goto(base);
  await host.page.getByPlaceholder('Heiko').fill(names[0]!);
  await host.page.getByRole('button', { name: 'Start a new game' }).click();
  await host.page.getByText("You're at the table").waitFor();
  const code = (await host.page.getByTestId('room-code').textContent())?.trim() ?? '';
  const phones = [host];
  for (const name of names.slice(1)) {
    const p = await open(name, PHONE);
    await p.page.goto(`${base}/?room=${code}`);
    await p.page.getByPlaceholder('Heiko').fill(name);
    await p.page.getByRole('button', { name: `Join game ${code}` }).click();
    await p.page.getByText("You're at the table").waitFor();
    phones.push(p);
  }
  const tv = withTv ? await open('TV', { viewport: { width: 1920, height: 1080 } }) : null;
  await tv?.page.goto(`${base}/table?room=${code}`);
  await host.page.locator('[data-testid=seats] li').nth(names.length - 1).waitFor();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  const pages = phones.map((p) => p.page);
  for (const p of pages) await p.getByTestId('ready').click({ timeout: 10_000 });
  for (const p of pages) await claimAPlot(p, CLAIM_MS, 'arcade: each phone claims a plot in the month-1 land grant');
  // All at once: the grant ends when all are done, so one waiting on its own would wait out the light's whole pass.
  await Promise.all(pages.map((p) => doneWithLand(p)));
  const game = steeredOf(server, code);
  const end = Date.now() + FLOOR_STARTS_MS;
  while (!game.steering && Date.now() < end) await host.page.waitForTimeout(100);
  check(game.steering, `arcade: the server's floor ticks within ${FLOOR_STARTS_MS / 1_000} s of development (phase ${game.state.phase})`);
  for (const p of pages) await p.getByTestId('phone-game').waitFor({ timeout: 5_000 });
  return {
    server,
    code,
    heiko: pages[0]!,
    mia: pages[1]!,
    phones: pages,
    tv: tv?.page ?? null,
    wires: { heiko: phones[0]!.wire, mia: phones[1]!.wire, tv: tv?.wire ?? null, phones: phones.map((p) => p.wire) },
    errors,
  };
}

/** Kept a string: tsx would wrap named functions in a helper the page lacks. A colonist the TV draws, by seat. */
const TV_DRAWS = `(() => Object.fromEntries([...document.querySelectorAll('[data-testid^=colonist-]:not([data-testid^=colonist-name])')].map((e) => [e.getAttribute('data-testid').slice(9), { space: e.getAttribute('data-space'), x: Number(e.getAttribute('data-x')), y: Number(e.getAttribute('data-y')) }])))()`;

/**
 * Stops the page's animation frames, as a phone put in a pocket does, and tells the page it is hidden and has lost
 * focus. The loop's frames wait in a queue until resumeThePage plays them on.
 */
const BACKGROUND_THE_PAGE = `(() => {
  const w = window;
  if (!w.__loop) {
    w.__loop = { paused: false, queue: [], raf: w.requestAnimationFrame.bind(w) };
    w.requestAnimationFrame = (cb) => (w.__loop.paused ? (w.__loop.queue.push(cb), 0) : w.__loop.raf(cb));
  }
  w.__loop.paused = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  w.dispatchEvent(new Event('blur'));
  document.activeElement?.blur?.();
})()`;
const RESUME_THE_PAGE = `(() => {
  const w = window;
  delete document.visibilityState;
  delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
  w.__loop.paused = false;
  for (const cb of w.__loop.queue.splice(0)) w.__loop.raf(cb);
})()`;

/** Holds the keys for `ms`, then lets go of them. */
async function hold(page: Page, keys: string[], ms: number): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
}

/** A colonist that moved less than this between two reads stood still: the wire's 2 decimals, and some. */
const STILL = 0.02;
/** A held key for this long walks a colonist this far at the least, on the slowest land it can walk. */
const HOLD_MS = 1_000;
const MOVES_AT_LEAST = 0.2;
/** A stop reaches the server's floor within this: the gate's interval, a tick, and the network. */
const STOP_MS = 100 + 2 * TICK_MS + 100;

/**
 * Step 1, the pieces meet (PR-6): the phones show the arcade screen, not today's Develop; frames come at the tick's
 * 20 Hz; holding an arrow key walks the colonist on the server's floor, never more than steerMaxPerSecond steers a
 * second, and letting go stops it within STOP_MS, also when the page's frames stop at that moment (a phone pocketed);
 * the TV draws both colonists where the server has them, and no clock while month 1's waits.
 */
export async function thePiecesMeet(t: ArcadeTable): Promise<string> {
  const { mia, tv, server, code, wires } = t;
  check(tv, 'step 1: the table has a TV');
  for (const p of [t.heiko, mia]) {
    await p.getByTestId('phone-game').waitFor({ timeout: 5_000 });
    check((await p.getByTestId('joystick').count()) === 1 && (await p.getByTestId('action-button').count()) === 1, 'step 1: the phone shows the arcade stick and action button');
    check((await p.getByTestId('store-hall').count()) === 0 && (await p.getByTestId('fill-card').count()) === 0, "step 1: the phone shows the arcade screen, not today's Develop");
  }
  await tv.getByTestId('tv-game').waitFor({ timeout: 5_000 });

  const f0 = wires.mia.frames.length;
  const t0 = Date.now();
  await mia.waitForTimeout(1_000);
  const perSecond = ((wires.mia.frames.length - f0) * 1_000) / (Date.now() - t0);
  check(perSecond >= 17 && perSecond <= 23, `step 1: frames come at the tick's 20 Hz, got ${perSecond.toFixed(1)} a second`);
  const last = wires.mia.frames.at(-1)!.frame;
  check(last.colonists.some((c) => c.id === 's1') && last.colonists.some((c) => c.id === 's2'), `step 1: a frame carries both colonists, got ${last.colonists.map((c) => c.id).join(', ')}`);

  check(await mia.getByTestId('phone-game').evaluate((el) => el === document.activeElement), 'step 1: the arcade screen has the keys from its first frame');
  const before = onFloor(server, code, 's2');
  const s0 = wires.mia.steers.length;
  await mia.keyboard.down('ArrowRight');
  await mia.waitForTimeout(HOLD_MS);
  const held = onFloor(server, code, 's2');
  await mia.keyboard.up('ArrowRight');
  const released = Date.now();
  await mia.waitForTimeout(STOP_MS);
  const stopped = onFloor(server, code, 's2');
  await mia.waitForTimeout(500);
  const later = onFloor(server, code, 's2');
  check(held.space === before.space && held.x - before.x >= MOVES_AT_LEAST && Math.abs(held.y - before.y) < STILL, `step 1: holding → walks Mia's colonist right on the server, ${where(before)} → ${where(held)}`);
  check(Math.hypot(later.x - stopped.x, later.y - stopped.y) < STILL, `step 1: letting go stops it on the server within ${STOP_MS} ms, ${where(stopped)} then ${where(later)}`);
  const sent = wires.mia.steers.slice(s0);
  check(sent.length >= 2 && sent.at(-1)!.x === 0 && sent.at(-1)!.y === 0 && sent.at(-1)!.at >= released, `step 1: the release goes out as a steer of 0,0, got ${JSON.stringify(sent)}`);

  // Mashing the keys: never more than steerMaxPerSecond a second, and the last change, a release, still arrives.
  const m0 = wires.mia.steers.length;
  for (let i = 0; i < 30; i++) await hold(mia, [i % 2 ? 'ArrowUp' : 'ArrowDown'], 25);
  await hold(mia, ['ArrowLeft'], 15);
  await mia.waitForTimeout(STOP_MS);
  const mashed = onFloor(server, code, 's2');
  await mia.waitForTimeout(500);
  const mashedLater = onFloor(server, code, 's2');
  const mash = wires.mia.steers.slice(m0);
  const busiest = busiestSecond(mash);
  check(busiest <= DEV_STEER.steerMaxPerSecond, `step 1: mashed keys send at most ${DEV_STEER.steerMaxPerSecond} steers a second, got ${busiest}`);
  check(mash.at(-1)?.x === 0 && mash.at(-1)?.y === 0, `step 1: after mashing, the last steer is the release, got ${JSON.stringify(mash.at(-1))}`);
  check(Math.hypot(mashedLater.x - mashed.x, mashedLater.y - mashed.y) < STILL, `step 1: after mashing the colonist stops on the server, ${where(mashed)} then ${where(mashedLater)}`);

  // Pocketed mid-walk, just after a steer went: the page's frames stop while the gate still holds the release back,
  // and the stop must still reach the server.
  await mia.keyboard.down('ArrowLeft');
  await mia.waitForTimeout(30);
  await mia.evaluate(BACKGROUND_THE_PAGE);
  await mia.waitForTimeout(STOP_MS);
  const pocketed = onFloor(server, code, 's2');
  await mia.waitForTimeout(500);
  const pocketedLater = onFloor(server, code, 's2');
  await mia.evaluate(RESUME_THE_PAGE);
  await mia.keyboard.up('ArrowLeft');
  await mia.getByTestId('phone-game').focus();
  check(Math.hypot(pocketedLater.x - pocketed.x, pocketedLater.y - pocketed.y) < STILL, `step 1: a page put away mid-walk stops its colonist on the server within ${STOP_MS} ms, ${where(pocketed)} then ${where(pocketedLater)}`);

  // The TV draws both where the server has them, both standing, and no clock while month 1's waits.
  await tv.waitForTimeout(300);
  const drawn = (await tv.evaluate(TV_DRAWS)) as Record<string, { space: string; x: number; y: number }>;
  for (const seat of ['s1', 's2']) {
    const s = onFloor(server, code, seat);
    const d = drawn[seat];
    check(d && d.space === s.space && Math.abs(d.x - s.x) < STILL && Math.abs(d.y - s.y) < STILL, `step 1: the TV draws ${seat} where the server has it, ${where(s)}, got ${d ? where(d) : 'nothing'}`);
  }
  const game = steeredOf(server, code);
  if (game.devEndsAt === null) check((await tv.locator('header [role=timer]').count()) === 0, "step 1: while month 1's clock waits the TV's header shows no clock, as the flag-off TV");
  return `${perSecond.toFixed(1)} frames/s; held → ${where(before)} → ${where(held)}, stopped at ${where(stopped)}; mashing ${busiest} steers/s at most; the TV drew ${Object.entries(drawn).map(([k, d]) => `${k} ${where(d)}`).join(', ')}`;
}

/** Test fixture: puts a seat's colonist at `at` on the server's floor, as a teleport; the phone's copy snaps to it. */
function placeOnFloor(server: MuleServer, code: string, seat: string, at: { space: 'map' | 'hall'; x: number; y: number }): void {
  const steering = steeredOf(server, code).steering;
  check(steering, `the server steers development for ${seat}`);
  steering.floor = { ...steering.floor, colonists: steering.floor.colonists.map((c) => (c.id === seat ? { ...c, ...at, moving: false } : c)) };
}

/** Waits until the server has the seat's colonist where `ok` wants it; returns the last read. */
async function floorWhen(page: Page, server: MuleServer, code: string, seat: string, ok: (c: FloorColonist) => boolean, timeout = 2_000): Promise<FloorColonist> {
  const end = Date.now() + timeout;
  for (;;) {
    const c = onFloor(server, code, seat);
    if (ok(c) || Date.now() > end) return c;
    await page.waitForTimeout(TICK_MS);
  }
}

/** Records, on the window after the game's own handlers, every arrow and SPACE keydown and whether it was kept from the page. */
const RECORD_KEYS = `(() => {
  window.__keys = [];
  window.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key.startsWith('Arrow')) window.__keys.push({ key: e.key, kept: e.defaultPrevented }); });
})()`;
/** How far anything on the page has scrolled: the window, and the most any element has. */
const SCROLLED = `(() => ({ window: window.scrollY + window.scrollX, most: Math.max(0, ...[...document.querySelectorAll('*')].map((e) => e.scrollTop + e.scrollLeft)) }))()`;

const LAPTOP_MS = 800;

/**
 * B-AC-3: on a laptop, SPACE presses the action button (in at the store's door), the arrow keys walk the colonist and
 * a mouse held on a spot walks it there, each on the server's floor; no arrow or SPACE scrolls the page. Negative:
 * with the game unfocused the keys send nothing and the colonist stands. Ends back at 844×390, in the hall.
 */
export async function laptopKeysAndMouse(t: ArcadeTable): Promise<string> {
  const { heiko, server, code, wires } = t;
  const game = steeredOf(server, code) as SteeredGame & { viewFor(seat: string | null): { me?: { reach?: { verb: string; enabled: boolean } } } };
  await heiko.setViewportSize(LAPTOP);
  const laptop = heiko.getByTestId('laptop-game');
  await laptop.waitFor({ timeout: 2_000 });
  await heiko.waitForFunction(() => document.querySelector('[data-testid=laptop-game]') === document.activeElement, null, { timeout: 2_000 }).catch(() => undefined);
  check((await laptop.getAttribute('data-focused')) === 'true', 'B-AC-3: the laptop screen has the keys as it opens');
  await heiko.evaluate(RECORD_KEYS);

  // SPACE acts: beside the store's door the button says ENTER STORE, and a press takes the colonist into the hall.
  const start = onFloor(server, code, 's1');
  const reach = game.viewFor('s1').me?.reach;
  check(start.space === 'map' && reach?.verb === 'ENTER STORE' && reach.enabled, `B-AC-3: Heiko starts beside the store's door with ENTER STORE lit, got ${where(start)} "${reach?.verb}"`);
  const a0 = wires.heiko.acts.length;
  await heiko.keyboard.press(' ');
  const entered = await floorWhen(heiko, server, code, 's1', (c) => c.space === 'hall');
  check(wires.heiko.acts.length === a0 + 1, `B-AC-3: one SPACE sends one press, got ${wires.heiko.acts.length - a0}`);
  check(entered.space === 'hall', `B-AC-3: SPACE presses ENTER STORE and the server has Heiko in the hall, got ${where(entered)}`);
  await heiko.getByTestId('your-stage').and(heiko.locator('[data-space=hall]')).waitFor({ timeout: 2_000 });

  // The arrow keys walk.
  const k0 = onFloor(server, code, 's1');
  await hold(heiko, ['ArrowRight'], LAPTOP_MS);
  const k1 = await floorWhen(heiko, server, code, 's1', (c) => c.x - k0.x >= MOVES_AT_LEAST);
  check(k1.x - k0.x >= MOVES_AT_LEAST && Math.abs(k1.y - k0.y) < STILL, `B-AC-3: holding → walks Heiko right in the hall, ${where(k0)} → ${where(k1)}`);
  await hold(heiko, ['ArrowLeft'], LAPTOP_MS / 2);
  const k2 = await floorWhen(heiko, server, code, 's1', (c) => k1.x - c.x >= MOVES_AT_LEAST / 2);
  check(k1.x - k2.x >= MOVES_AT_LEAST / 2, `B-AC-3: holding ← walks Heiko back left, ${where(k1)} → ${where(k2)}`);

  // The mouse held on a spot of the walkway walks there.
  const walk = HALL.floor[0]!;
  const spot = { x: HALL.w * 0.75, y: (walk.y0 + walk.y1) / 2 };
  check(placeAt(spot) === null && isOpenFloor(spot), 'B-AC-3: the mouse spot is open walkway, no room to press');
  const box = await heiko.getByTestId('hall-stage').boundingBox();
  check(box, 'B-AC-3: the hall is on the laptop stage');
  const m0 = await floorWhen(heiko, server, code, 's1', () => false, 2 * TICK_MS);
  await heiko.mouse.move(box.x + (spot.x / HALL.w) * box.width, box.y + (spot.y / HALL.h) * box.height);
  await heiko.mouse.down();
  await heiko.waitForTimeout(LAPTOP_MS);
  const m1 = onFloor(server, code, 's1');
  await heiko.mouse.up();
  const gap = (c: FloorColonist) => Math.hypot(spot.x - c.x, spot.y - c.y);
  check(m1.space === 'hall' && gap(m0) - gap(m1) >= MOVES_AT_LEAST, `B-AC-3: the mouse held on ${spot.x.toFixed(1)},${spot.y.toFixed(1)} walks Heiko toward it, ${where(m0)} → ${where(m1)}`);
  await heiko.waitForTimeout(STOP_MS);
  const m2 = onFloor(server, code, 's1');
  await heiko.waitForTimeout(300);
  const m3 = onFloor(server, code, 's1');
  check(Math.hypot(m3.x - m2.x, m3.y - m2.y) < STILL, `B-AC-3: letting go of the mouse stops Heiko, ${where(m2)} then ${where(m3)}`);

  // Nothing scrolled, and every arrow and SPACE was kept from the page.
  const keys = (await heiko.evaluate('window.__keys')) as { key: string; kept: boolean }[];
  const scrolled = (await heiko.evaluate(SCROLLED)) as { window: number; most: number };
  check(keys.length >= 3 && keys.every((k) => k.kept), `B-AC-3: every arrow and SPACE is kept from the page, got ${JSON.stringify(keys)}`);
  check(scrolled.window === 0 && scrolled.most === 0, `B-AC-3: the page never scrolls, got ${JSON.stringify(scrolled)}`);

  // Negative: the game unfocused, the keys send nothing and the colonist stands.
  await laptop.evaluate((el) => el.blur());
  await heiko.getByTestId('focus-hint').waitFor({ timeout: 1_000 });
  const n0 = onFloor(server, code, 's1');
  const [s0, a1] = [wires.heiko.steers.length, wires.heiko.acts.length];
  await hold(heiko, ['ArrowLeft'], LAPTOP_MS / 2);
  await heiko.keyboard.press(' ');
  await heiko.waitForTimeout(STOP_MS);
  const n1 = onFloor(server, code, 's1');
  check(wires.heiko.steers.length === s0 && wires.heiko.acts.length === a1, `B-AC-3 (negative): unfocused, the keys send nothing, got ${wires.heiko.steers.length - s0} steers and ${wires.heiko.acts.length - a1} presses`);
  check(n1.space === n0.space && Math.hypot(n1.x - n0.x, n1.y - n0.y) < STILL, `B-AC-3 (negative): unfocused, Heiko stands, ${where(n0)} then ${where(n1)}`);

  await laptop.focus();
  await heiko.setViewportSize(PHONE.viewport);
  await heiko.getByTestId('phone-game').waitFor({ timeout: 2_000 });
  return `SPACE → ${where(entered)}; → ${where(k0)} → ${where(k1)}; mouse → ${where(m0)} → ${where(m1)}; ${keys.length} keys kept, scrolled 0`;
}

type Rect = { x: number; y: number; w: number; h: number };
/** One read of the phone's arcade screen for B-AC-4: its frame, what lies over the map, and what must stay in sight. */
type FitRead = {
  frame: Rect;
  space: string;
  page: { w: number; h: number; scrollW: number; scrollH: number };
  boxes: { id: string; r: Rect }[];
  controls: { id: string; r: Rect; faded: boolean; opacity: number }[];
  kept: { id: string; r: Rect }[];
  plots: { id: string; r: Rect }[];
  cell: number;
  map: Rect | null;
};

/** Kept a string, as READ_HALL. `seat` is the phone's own. */
const readFit = (seat: string) => `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const game = document.querySelector('[data-testid=phone-game]');
  const all = (sel) => [...game.querySelectorAll(sel)];
  const opacity = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const space = game.querySelector('[data-testid=your-stage]').getAttribute('data-space');
  const layer = game.querySelector('[data-testid=walkers-map]')?.parentElement ?? null;
  const map = layer ? box(layer) : null;
  const cols = 15, rows = 9;
  const cell = map ? map.w / Number(game.getAttribute('data-cols') ?? cols) : 0;
  const tile = (x, y) => ({ x: map.x + x * cell, y: map.y + y * cell, w: cell, h: cell });
  const kept = [];
  if (space === 'map') {
    const me = game.querySelector('[data-testid=colonist-${seat}] [role=img]');
    if (me) kept.push({ id: 'your colonist', r: box(me) });
    const [sx, sy] = game.getAttribute('data-store').split(',').map(Number);
    kept.push({ id: 'the store', r: tile(sx, sy) });
    for (const g of all('[data-testid=guide-map], [data-testid=guide-map-alt]')) kept.push({ id: 'target ' + g.getAttribute('data-what'), r: box(g) });
  } else {
    const me = game.querySelector('[data-testid=visitor-${seat}]');
    if (me) kept.push({ id: 'your colonist', r: box(me) });
    for (const g of all('[data-testid=hall-lit]')) kept.push({ id: 'target ' + g.getAttribute('data-room'), r: box(g) });
  }
  const plots = space === 'map' ? (game.getAttribute('data-my-plots') || '').split(' ').filter(Boolean).map((k) => { const [x, y] = k.split(',').map(Number); return { id: 'your plot ' + k, r: tile(x, y) }; }) : [];
  const controls = all('[data-overlay=stick], [data-overlay=button], [data-testid=plot-card]').map((el) => ({ id: el.getAttribute('data-overlay') ?? 'plot card', r: box(el), faded: el.hasAttribute('data-faded'), opacity: opacity(el) }));
  return {
    frame: box(game),
    space,
    page: { w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
    boxes: all('[data-overlay], [data-testid=plot-card], [data-testid=phone-stage], [data-testid=action-verb]').map((el) => ({ id: el.getAttribute('data-overlay') ?? el.getAttribute('data-testid'), r: box(el) })),
    controls, kept, plots, cell, map,
  };
})()`;

const area = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const inside = (r: Rect, f: Rect) => r.x >= f.x - 0.5 && r.y >= f.y - 0.5 && r.x + r.w <= f.x + f.w + 0.5 && r.y + r.h <= f.y + f.h + 0.5;
/** A control near-clear: the fade when you or the target come near (the scaffold's opacity-25). */
const FADED_MAX = 0.3;

/** B-AC-4's checks on one read; returns what it found. A faded control may lie over your colonist or the target. */
function checkFit(r: FitRead, tag: string): string {
  check(r.page.scrollW <= r.page.w && r.page.scrollH <= r.page.h, `B-AC-4 ${tag}: the page does not overflow, ${r.page.scrollW}×${r.page.scrollH} in ${r.page.w}×${r.page.h}`);
  for (const b of r.boxes) check(inside(b.r, r.frame), `B-AC-4 ${tag}: ${b.id} stays inside the screen, ${JSON.stringify(b.r)} in ${JSON.stringify(r.frame)}`);
  check(r.kept.some((k) => k.id === 'your colonist'), `B-AC-4 ${tag}: your colonist is on the screen`);
  for (const c of r.controls)
    for (const k of r.kept) {
      const covered = area(c.r, k.r);
      if (covered === 0) continue;
      check(c.id !== 'plot card' && c.faded && c.opacity <= FADED_MAX, `B-AC-4 ${tag}: the ${c.id} covers ${covered.toFixed(0)} px² of ${k.id} and is not faded clear (opacity ${c.opacity.toFixed(2)})`);
    }
  const over: string[] = [];
  for (const c of r.controls.filter((k) => k.id !== 'plot card'))
    for (const p of r.plots) {
      if (area(c.r, p.r) === 0) continue;
      check(c.opacity < 1, `B-AC-4 ${tag}: the ${c.id} lies over ${p.id} and is not translucent (opacity ${c.opacity.toFixed(2)})`);
      over.push(`${c.id} over ${p.id.slice(10)} at ${c.opacity.toFixed(2)}`);
    }
  return over.join(', ');
}

/** The tiles under a control's box on the map, by column and row. */
function tilesUnder(r: FitRead, c: Rect): { x: number; y: number }[] {
  check(r.map, 'B-AC-4: the map is on the stage');
  const m = r.map;
  const out: { x: number; y: number }[] = [];
  for (let x = Math.max(0, Math.floor((c.x - m.x) / r.cell)); x <= Math.min(14, Math.floor((c.x + c.w - m.x - 1) / r.cell)); x++)
    for (let y = Math.max(0, Math.floor((c.y - m.y) / r.cell)); y <= Math.min(8, Math.floor((c.y + c.h - m.y - 1) / r.cell)); y++) out.push({ x, y });
  return out;
}

/**
 * Test fixture: gives the seat the free plots under each control, so the controls lie over plots of its own, and sends
 * every screen the view that makes.
 */
function givePlotsUnder(server: MuleServer, code: string, seat: string, tiles: { x: number; y: number }[]): string[] {
  const game = gameOf(server, code);
  const given: string[] = [];
  for (const { x, y } of tiles) {
    const tile = game.state.tiles.find((k) => k.x === x && k.y === y);
    if (!tile || tile.terrain === 'store' || tile.owner !== null) continue;
    tile.owner = seat;
    given.push(`${x},${y}`);
  }
  game.ctx.changed();
  return given;
}

/**
 * B-AC-4 (AM-20): at 667×375 and 844×390, on the map and in the hall, nothing overflows the screen; the stick, the
 * button and the plot card cover 0 px² of your colonist, the store and the target; over your own plots the stick and
 * the button are translucent. Positive control: your colonist put under the stick, the overlap is measured and the
 * stick fades clear. Ends at 844×390 in the hall.
 */
export async function phoneFitsAndCoversNothing(t: ArcadeTable): Promise<string> {
  const { mia, server, code } = t;
  const seat = 's2';
  const out: string[] = [];
  const back = onFloor(server, code, seat);
  for (const [name, size, px] of [['844×390', PHONE.viewport, '844'], ['667×375', PHONE_SMALL.viewport, '667']] as const) {
    await mia.setViewportSize(size);
    await mia.locator(`[data-testid=phone-game][data-size="${px}"]`).waitFor({ timeout: 2_000 });
    placeOnFloor(server, code, seat, back);
    await mia.locator('[data-testid=your-stage][data-space=map]').waitFor({ timeout: 2_000 });
    const first = (await mia.evaluate(readFit(seat))) as FitRead;
    const under = first.controls.filter((c) => c.id !== 'plot card').flatMap((c) => tilesUnder(first, c.r));
    const given = givePlotsUnder(server, code, seat, under);
    await mia.waitForFunction((n) => (document.querySelector('[data-testid=phone-game]')?.getAttribute('data-my-plots') ?? '').split(' ').filter(Boolean).length >= n, given.length + 1, { timeout: 2_000 });
    await mia.waitForTimeout(300);
    const map = (await mia.evaluate(readFit(seat))) as FitRead;
    const over = checkFit(map, `${name} on the map`);
    check(map.plots.length > 1 && over !== '', `B-AC-4 ${name}: the fixture put plots of Mia's under the controls, got [${given.join(' ')}]`);

    // Positive control: her colonist under the stick, the overlap is there and the stick fades clear.
    const stick = map.controls.find((c) => c.id === 'stick')!;
    const at = { x: (stick.r.x + stick.r.w / 2 - map.map!.x) / map.cell, y: (stick.r.y + stick.r.h * 0.6 - map.map!.y) / map.cell };
    placeOnFloor(server, code, seat, { space: 'map', ...at });
    await mia.locator('[data-overlay=stick][data-faded]').waitFor({ timeout: 2_000 }).catch(() => undefined);
    await mia.waitForTimeout(300);
    const under1 = (await mia.evaluate(readFit(seat))) as FitRead;
    const s1 = under1.controls.find((c) => c.id === 'stick')!;
    const me1 = under1.kept.find((k) => k.id === 'your colonist')!;
    check(area(s1.r, me1.r) > 0, `B-AC-4 ${name} (control): Mia's colonist put at ${at.x.toFixed(2)},${at.y.toFixed(2)} lies under the stick`);
    check(s1.faded && s1.opacity <= FADED_MAX, `B-AC-4 ${name} (control): with Mia under it the stick fades clear, opacity ${s1.opacity.toFixed(2)}`);
    checkFit(under1, `${name} under the stick`);
    placeOnFloor(server, code, seat, back);

    // The hall.
    placeOnFloor(server, code, seat, { space: 'hall', ...HALL.spots.doorR });
    await mia.locator('[data-testid=your-stage][data-space=hall]').waitFor({ timeout: 2_000 });
    await mia.waitForTimeout(300);
    checkFit((await mia.evaluate(readFit(seat))) as FitRead, `${name} in the hall`);
    out.push(`${name}: ${over}; the stick faded to ${s1.opacity.toFixed(2)} over her`);
  }
  await mia.setViewportSize(PHONE.viewport);
  await mia.locator('[data-testid=phone-game][data-size="844"]').waitFor({ timeout: 2_000 });
  return out.join('; ');
}

/** Development's length for B-AC-8, in seconds: room to drop, come back and steer, then the clock runs out. */
const DROP_TURN_SECONDS = 12;
/** The turn ends on its clock to within this. */
const ON_THE_CLOCK_MS = 500;

/**
 * B-AC-8: Mia's phone drops mid-walk while Heiko stays: the server's frames have her colonist stand, the clock does not
 * move, she comes back and steers again, and the turn ends on the clock. Starts development's clock (month 1's waits),
 * DROP_TURN_SECONDS long; ends with development over.
 */
export async function aDroppedPhoneStops(t: ArcadeTable): Promise<string> {
  const { mia, server, code, wires } = t;
  const seat = 's2';
  const game = steeredOf(server, code);
  // Test fixture: month 1's clock starts now and is short, as the host's Start the clock starts it.
  const full = DEVELOPMENT.fullSeconds;
  DEVELOPMENT.fullSeconds = DROP_TURN_SECONDS;
  try {
    game.startClock();
  } finally {
    DEVELOPMENT.fullSeconds = full;
  }
  game.ctx.changed();
  const endsAt = game.devEndsAt;
  check(endsAt !== null, 'B-AC-8: the clock runs');
  check(onFloor(server, code, seat).space === 'hall', 'B-AC-8: Mia starts in the hall');

  await mia.getByTestId('phone-game').focus();
  const still = onFloor(server, code, seat);
  const w0 = wires.mia.steers.length;
  await mia.keyboard.down('ArrowLeft');
  const walking = await floorWhen(mia, server, code, seat, (c) => still.x - c.x >= MOVES_AT_LEAST);
  check(still.x - walking.x >= MOVES_AT_LEAST, `B-AC-8: Mia is walking when her phone drops, ${where(still)} → ${where(walking)}; sent ${JSON.stringify(wires.mia.steers.slice(w0))}`);
  // The phone drops mid-walk, its key still held: its page and socket are gone at once.
  const url = mia.url();
  const context = mia.context();
  await mia.close();
  const away = Date.now();
  const end = away + 5_000;
  while (!game.away.has(seat) && Date.now() < end) await t.heiko.waitForTimeout(TICK_MS);
  check(game.away.has(seat), 'B-AC-8: the server sees Mia drop within 5 s');
  const awaySeen = Date.now();
  await t.heiko.waitForTimeout(1_000);
  check(wires.tv && t.tv, 'B-AC-8: the table has a TV to hear the frames');
  const frames = wires.tv.frames.filter((f) => f.at > awaySeen + 2 * TICK_MS).map((f) => f.frame.colonists.find((c) => c.id === seat)!);
  check(frames.length >= 15, `B-AC-8: the TV keeps getting frames while Mia is away, got ${frames.length}`);
  const spots = new Set(frames.map((c) => `${c.space} ${c.x},${c.y}`));
  check(spots.size === 1, `B-AC-8: while away her colonist stands in the server's frames, got ${[...spots].join(' | ')}`);
  check(game.devEndsAt === endsAt, 'B-AC-8: the drop does not move the clock');

  // Back on the same phone: it opens the game again and takes its saved seat.
  const phone = await context.newPage();
  phone.on('pageerror', (e) => t.errors.push(`Mia (back): ${e.message}`));
  t.wires.mia = watchWire(phone);
  t.wires.phones[1] = t.wires.mia;
  t.mia = phone;
  t.phones[1] = phone;
  await phone.goto(url);
  const backBy = Date.now() + 10_000;
  while (game.away.has(seat) && Date.now() < backBy) await phone.waitForTimeout(TICK_MS);
  check(!game.away.has(seat), 'B-AC-8: Mia comes back within 10 s');
  await phone.getByTestId('phone-game').waitFor({ timeout: 5_000 });
  await phone.waitForFunction(() => document.querySelector('[data-testid=phone-game]') === document.activeElement, null, { timeout: 2_000 }).catch(() => undefined);
  const mia2 = phone;
  const r0 = onFloor(server, code, seat);
  const s0 = t.wires.mia.steers.length;
  // On along the walkway, away from the door she came in by.
  await hold(mia2, ['ArrowLeft'], HOLD_MS);
  const r1 = await floorWhen(mia2, server, code, seat, (c) => r0.x - c.x >= MOVES_AT_LEAST);
  check(t.wires.mia.steers.length > s0, 'B-AC-8: back, the phone sends steers again');
  check(r1.space === r0.space && r0.x - r1.x >= MOVES_AT_LEAST, `B-AC-8: back, Mia steers her colonist again, ${where(r0)} → ${where(r1)}`);
  check(game.devEndsAt === endsAt, 'B-AC-8: coming back does not move the clock');

  const over = Date.now() + DROP_TURN_SECONDS * 1_000 + 5_000;
  while (game.state.phase === 'development' && Date.now() < over) await mia2.waitForTimeout(TICK_MS);
  const endedAt = Date.now();
  check(game.state.phase !== 'development', 'B-AC-8: development ends');
  check(Math.abs(endedAt - endsAt) <= ON_THE_CLOCK_MS, `B-AC-8: the turn ends on the clock, ${endedAt - endsAt} ms from it`);
  return `walking at ${where(walking)}, stood in ${frames.length} frames while away; back ${where(r0)} → ${where(r1)}; ended ${endedAt - endsAt} ms from the clock`;
}

type Player = GameState['players'][number];

/**
 * Where to stand to be at a room: the middle of its box. Its HALL.spots point is on the walkway before it, where
 * placeAt finds no room and the button reaches nothing (a door's spot is inside its airlock, so a door's will do).
 */
function inRoom(place: HallPlace): SteerTarget {
  const b = boxOf(place);
  const at = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  check(placeAt(at) === place && isOpenFloor(at), `the middle of the ${place} is open floor in it`);
  return { space: 'hall', ...at };
}
/** The seat's player in the server's game. */
function playerOf(server: MuleServer, code: string, seat: string): Player {
  const p = gameOf(server, code).state.players.find((q) => q.id === seat);
  check(p, `seat ${seat} in the game`);
  return p;
}

/** The button as the phone shows it, and as the server's view words it. */
async function buttonSays(phone: Page, server: MuleServer, code: string, seat: string): Promise<{ phone: string; server: string; enabled: boolean; detail: string | null }> {
  const reach = (gameOf(server, code) as unknown as { viewFor(s: string): { me?: { reach?: { verb: string; detail: string | null; enabled: boolean } } } }).viewFor(seat).me?.reach;
  check(reach, `${seat}'s view carries its reach`);
  return { phone: ((await phone.getByTestId('action-verb').textContent()) ?? '').trim(), server: reach.verb, enabled: reach.enabled, detail: reach.detail };
}

/** Waits until the phone's button says `verb`, the server's view the same; fails with what each said. */
async function expectButton(phone: Page, server: MuleServer, code: string, seat: string, verb: string, tag: string): Promise<{ detail: string | null }> {
  const end = Date.now() + 2_000;
  let said = await buttonSays(phone, server, code, seat);
  while (!(said.phone === verb && said.server === verb && said.enabled) && Date.now() < end) {
    await phone.waitForTimeout(TICK_MS);
    said = await buttonSays(phone, server, code, seat);
  }
  check(said.phone === verb && said.server === verb && said.enabled, `${tag}: the button says "${verb}" before the press, got the phone "${said.phone}", the server "${said.server}" (${said.enabled ? 'lit' : 'dim'})`);
  return { detail: said.detail };
}

/** Waits until the server's player is as `ok` wants it after a press. */
async function playerWhen(page: Page, server: MuleServer, code: string, seat: string, ok: (p: Player) => boolean, timeout = 2_000): Promise<Player> {
  const end = Date.now() + timeout;
  while (!ok(playerOf(server, code, seat)) && Date.now() < end) await page.waitForTimeout(TICK_MS);
  return playerOf(server, code, seat);
}

/** What a press with nothing in reach must leave alone on the server: the seat's money, MULE, stock and plots. */
function seatSnapshot(server: MuleServer, code: string, seat: string): string {
  const { state } = gameOf(server, code);
  const p = playerOf(server, code, seat);
  return JSON.stringify({ money: p.money, mule: p.carriedMule, stock: p.stock, done: p.doneDeveloping, plots: state.tiles.filter((t) => t.owner === seat).map((t) => [t.x, t.y, t.outfit]) });
}

/**
 * B-AC-1: one phone sideways, no TV, only the stick (steerTo's held keys) and the button (pressAct): in through the
 * store's door, buy at the corral, outfit for Energy, out through a door with the MULE on its lead, install on her own
 * plot, back in and end at the pub, the button saying each step before it and the server's money and plot after each
 * press. Negative: a press with nothing in reach changes nothing on the server. Mia stays connected, so a turn is not
 * over when Heiko's is. Ends with Heiko at the pub.
 */
export async function theWholeErrandByStickAndButton(t: ArcadeTable): Promise<string> {
  const { heiko: phone, server, code } = t;
  check(t.tv === null, 'B-AC-1: no TV at this table');
  const seat = 's1';
  const steps: string[] = [];
  const money = () => playerOf(server, code, seat).money;

  // In through the door with the button.
  await expectButton(phone, server, code, seat, 'ENTER STORE', 'B-AC-1');
  await pressAct(phone);
  const inside = await floorWhen(phone, server, code, seat, (c) => c.space === 'hall');
  check(inside.space === 'hall', `B-AC-1: ENTER STORE takes Heiko into the hall, got ${where(inside)}`);
  steps.push('in');

  // Negative: on the open walkway the button is dim, and a press changes nothing.
  const walk = HALL.floor[0]!;
  const open = { space: 'hall' as const, x: HALL.w * 0.62, y: (walk.y0 + walk.y1) / 2 };
  check(placeAt(open) === null, 'B-AC-1: the negative press stands on open walkway');
  await steerTo(phone, server, code, seat, open);
  const dim = await buttonSays(phone, server, code, seat);
  check(!dim.enabled, `B-AC-1 (negative): on the walkway nothing is in reach, got "${dim.server}" lit`);
  const before = seatSnapshot(server, code, seat);
  const stood = onFloor(server, code, seat);
  const a0 = t.wires.heiko.acts.length;
  await pressAct(phone);
  await phone.waitForTimeout(STOP_MS);
  check(seatSnapshot(server, code, seat) === before, `B-AC-1 (negative): a press with nothing in reach changes nothing on the server, ${before} → ${seatSnapshot(server, code, seat)}`);
  const after = onFloor(server, code, seat);
  check(after.space === stood.space && Math.hypot(after.x - stood.x, after.y - stood.y) < STILL, `B-AC-1 (negative): and the colonist stands, ${where(stood)} → ${where(after)}`);
  steps.push(`dim "${dim.phone}" (${t.wires.heiko.acts.length - a0} press sent, nothing changed)`);

  // Buy at the corral.
  await steerTo(phone, server, code, seat, inRoom('corral'));
  await expectButton(phone, server, code, seat, 'BUY MULE', 'B-AC-1');
  const m0 = money();
  const price = mulePrice(gameOf(server, code).state);
  await pressAct(phone);
  const bought = await playerWhen(phone, server, code, seat, (p) => p.carriedMule === 'empty');
  check(bought.carriedMule === 'empty' && bought.money === m0 - price, `B-AC-1: BUY MULE leads an empty MULE and costs ${price}, money ${m0} → ${bought.money}, MULE ${bought.carriedMule}`);
  steps.push(`bought ${m0} → ${bought.money}`);

  // Outfit for Energy.
  await steerTo(phone, server, code, seat, inRoom('energy'));
  await expectButton(phone, server, code, seat, 'OUTFIT · ENERGY', 'B-AC-1');
  const m1 = money();
  await pressAct(phone);
  const outfitted = await playerWhen(phone, server, code, seat, (p) => p.carriedMule === 'energy');
  check(outfitted.carriedMule === 'energy' && outfitted.money < m1, `B-AC-1: OUTFIT · Energy outfits the MULE for money, ${m1} → ${outfitted.money}, MULE ${outfitted.carriedMule}`);
  steps.push(`outfitted ${m1} → ${outfitted.money}`);

  // Out through the door, the MULE on its lead.
  const plot = gameOf(server, code).state.tiles.find((k) => k.owner === seat && k.terrain !== 'lake');
  check(plot, 'B-AC-1: Heiko owns a plot on land to install on');
  const store = gameOf(server, code).state.tiles.find((k) => k.terrain === 'store')!;
  await throughDoor(phone, server, code, seat, plot.x < store.x ? 'doorL' : 'doorR');
  const out = onFloor(server, code, seat) as FloorColonist & { lead?: unknown };
  const lead = (steeredOf(server, code).steering!.floor.colonists.find((c) => c.id === seat) as unknown as { lead: { good: string | null } | null }).lead;
  check(out.space === 'map' && lead?.good === 'energy', `B-AC-1: out on the map with the Energy MULE on its lead, got ${where(out)}, lead ${JSON.stringify(lead)}`);
  steps.push(`out at ${where(out)}`);

  // Install on her own plot.
  await steerTo(phone, server, code, seat, plotCentre(plot.x, plot.y));
  await expectButton(phone, server, code, seat, 'INSTALL · ENERGY', 'B-AC-1');
  await pressAct(phone);
  const installed = await playerWhen(phone, server, code, seat, (p) => p.carriedMule === null);
  const tile = gameOf(server, code).state.tiles.find((k) => k.x === plot.x && k.y === plot.y)!;
  check(installed.carriedMule === null && tile.outfit === 'energy', `B-AC-1: INSTALL puts the Energy MULE on ${plot.x},${plot.y}, outfit ${tile.outfit}, MULE ${installed.carriedMule}`);
  steps.push(`installed on ${plot.x},${plot.y}`);

  // Back in and end at the pub.
  await throughDoor(phone, server, code, seat);
  await steerTo(phone, server, code, seat, inRoom('pub'));
  const { detail } = await expectButton(phone, server, code, seat, 'PUB · END TURN', 'B-AC-1');
  const m2 = money();
  await pressAct(phone);
  const done = await playerWhen(phone, server, code, seat, (p) => p.doneDeveloping);
  check(done.doneDeveloping && done.money > m2, `B-AC-1: the pub ends Heiko's turn and pays (${detail}), money ${m2} → ${done.money}`);
  check(gameOf(server, code).state.phase === 'development', "B-AC-1: Mia's turn goes on: development is not over");
  steps.push(`pub ${m2} → ${done.money}`);
  return steps.join('; ');
}

/** Each seat's colonist on the server's floor, by the ms it was read at. */
type FloorLog = { at: number; tick: number; colonists: Map<string, FloorColonist> }[];

/** Reads the server's floor every few ms while `during` runs: the floor changes once a tick. */
async function logFloor<T>(server: MuleServer, code: string, during: () => Promise<T>): Promise<{ log: FloorLog; result: T }> {
  const log: FloorLog = [];
  const read = () => {
    const f = steeredOf(server, code).steering?.floor;
    if (!f || log.at(-1)?.tick === f.tick) return;
    log.push({ at: Date.now(), tick: f.tick, colonists: new Map(f.colonists.map((c) => [c.id, { id: c.id, x: c.x, y: c.y, space: c.space }])) });
  };
  read();
  const timer = setInterval(read, 2);
  try {
    return { log, result: await during() };
  } finally {
    clearInterval(timer);
  }
}

/** Where the server had a seat at `at`, between the two ticks either side; null outside the log or across a door. */
function floorAt(log: FloorLog, seat: string, at: number): { x: number; y: number; space: string } | null {
  const i = log.findIndex((e) => e.at > at);
  if (i <= 0) return null;
  const [a, b] = [log[i - 1]!.colonists.get(seat), log[i]!.colonists.get(seat)];
  if (!a || !b || a.space !== b.space) return null;
  const k = (at - log[i - 1]!.at) / (log[i]!.at - log[i - 1]!.at);
  return { space: a.space, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** The farthest a seat's colonist went in one tick of the log: one frame's travel, on the land it walked. */
function tickTravel(log: FloorLog, seat: string): number {
  let most = 0;
  for (let i = 1; i < log.length; i++) {
    const [a, b] = [log[i - 1]!.colonists.get(seat), log[i]!.colonists.get(seat)];
    if (a && b && a.space === b.space) most = Math.max(most, Math.hypot(b.x - a.x, b.y - a.y) / (log[i]!.tick - log[i - 1]!.tick));
  }
  return most;
}
/** The wire's rounding to 2 decimals, on both axes. */
const WIRE_ROUNDING = 0.01;
const B_AC_2_MOVES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/**
 * B-AC-2: four seats and the TV; while all four walk, the TV draws each where the server has it, within one tick's
 * travel of the server's floor at the moment the TV drew it, RULE-10's interpolateMs behind (C12's own lag, not a
 * frame's). Negative: a seat that drops stands still on the TV.
 */
export async function theTvDrawsEveryoneLive(t: ArcadeTable): Promise<string> {
  const { tv, server, code, phones } = t;
  check(tv && phones.length === 4, 'B-AC-2: four phones and a TV');
  await tv.getByTestId('tv-game').waitFor({ timeout: 5_000 });
  const seats = phones.map((_, i) => `s${i + 1}`);
  const samples: { at: number; drawn: Record<string, { space: string; x: number; y: number }> }[] = [];
  const { log } = await logFloor(server, code, async () => {
    for (const [i, p] of phones.entries()) await p.keyboard.down(B_AC_2_MOVES[i]!);
    const end = Date.now() + 1_500;
    while (Date.now() < end) {
      const t0 = Date.now();
      const drawn = (await tv.evaluate(TV_DRAWS)) as Record<string, { space: string; x: number; y: number }>;
      samples.push({ at: (t0 + Date.now()) / 2, drawn });
      await tv.waitForTimeout(30);
    }
    for (const [i, p] of phones.entries()) await p.keyboard.up(B_AC_2_MOVES[i]!);
  });
  const moved = seats.filter((s) => {
    const [a, b] = [log[0]!.colonists.get(s)!, log.at(-1)!.colonists.get(s)!];
    return Math.hypot(b.x - a.x, b.y - a.y) >= MOVES_AT_LEAST;
  });
  check(moved.length >= 3, `B-AC-2: at least three of the four colonists walked on the server, got ${moved.join(', ')}`);
  let compared = 0;
  const worst: string[] = [];
  let worstNow = 0;
  for (const seat of moved) {
    const allowed = tickTravel(log, seat) + WIRE_ROUNDING;
    let most = 0;
    for (const s of samples) {
      const d = s.drawn[seat];
      const then = floorAt(log, seat, s.at - DEV_STEER.interpolateMs);
      const now = floorAt(log, seat, s.at);
      if (!d || !then || !now || then.space !== d.space) continue;
      compared++;
      most = Math.max(most, Math.hypot(d.x - then.x, d.y - then.y));
      worstNow = Math.max(worstNow, Math.hypot(d.x - now.x, d.y - now.y));
    }
    check(most <= allowed, `B-AC-2: the TV draws ${seat} within one tick's travel (${allowed.toFixed(3)} tiles) of where the server had it interpolateMs before, worst ${most.toFixed(3)}`);
    worst.push(`${seat} ${most.toFixed(3)}/${allowed.toFixed(3)}`);
  }
  check(compared >= samples.length * moved.length * 0.75, `B-AC-2: compared the TV with the server in most samples, ${compared} of ${samples.length * moved.length}`);

  // Negative: Kai drops; his colonist stands still on the TV.
  const game = steeredOf(server, code);
  const kai = phones[2]!;
  await kai.keyboard.down('ArrowDown');
  await kai.waitForTimeout(300);
  await kai.close();
  const end = Date.now() + 5_000;
  while (!game.away.has('s3') && Date.now() < end) await tv.waitForTimeout(TICK_MS);
  check(game.away.has('s3'), 'B-AC-2: the server sees Kai drop');
  await tv.waitForTimeout(DEV_STEER.interpolateMs + 3 * TICK_MS);
  const stills = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const d = ((await tv.evaluate(TV_DRAWS)) as Record<string, { space: string; x: number; y: number }>)['s3'];
    check(d, 'B-AC-2: the TV still draws Kai while he is away');
    stills.add(`${d.space} ${d.x.toFixed(3)},${d.y.toFixed(3)}`);
    await tv.waitForTimeout(100);
  }
  check(stills.size === 1, `B-AC-2 (negative): an away seat's colonist stands still on the TV, got ${[...stills].join(' | ')}`);
  return `${samples.length} TV reads, ${compared} compared; worst/allowed in tiles, interpolateMs behind: ${worst.join(', ')} (${worstNow.toFixed(3)} at most from the same moment); Kai away stood at ${[...stills][0]}`;
}
