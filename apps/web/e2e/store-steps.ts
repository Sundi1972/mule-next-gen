/** The development store's checks, run as development starts by smoke.ts (scaled clocks) and screens.ts (real time). */
import { DEVELOPMENT, type GameState } from '@mule/engine';
import type { Page } from 'playwright';
import type { MuleServer } from '../../server/src/server.js';
import { check } from './harness';

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const SERVICES = ['door-L', 'booth-works', 'booth-greenBelt', 'booth-corral', 'booth-pub', 'door-R'];
const FITS = ['alloy', 'electronics', 'medicine'];
/** Nine working farms give a crew of nine, so the seat needs 5 Food. */
const HUNGRY_FARMS = 9;

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
