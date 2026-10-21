/** The development store's checks, run by screens.ts at real speed, where the start-of-turn card is long enough to see. */
import { DEVELOPMENT } from '@mule/engine';
import type { Page } from 'playwright';
import { check } from './harness';

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];
const SERVICES = ['door-L', 'booth-works', 'booth-greenBelt', 'booth-corral', 'booth-pub', 'door-R'];
const FITS = ['alloy', 'electronics', 'medicine'];

/** B-AC-9 (negative case): a fed player's bar is full and holo-coloured. Call as development starts. */
export async function fedPlayerFillsAFullHoloBar(phone: Page): Promise<void> {
  const card = phone.getByTestId('fill-card');
  await card.waitFor({ timeout: 3_000 });
  const said = await card.innerText();
  check(/You eat \d+ Food and fill up your time bar/.test(said) && !/you need/.test(said), `B-AC-9: a fed player is told they ate and fill up, got "${said}"`);
  // The card fills for about 2 s and then goes, so read it every frame.
  const full = await phone
    .waitForFunction(
      (seconds) => {
        const label = document.querySelector('[data-testid=fill-card] [data-num]');
        // The label sits right under the bar's track.
        const bar = label?.previousElementSibling?.firstElementChild;
        if (!label || !bar || label.textContent !== `${seconds} s: full time`) return null;
        const track = bar.parentElement!.getBoundingClientRect().width;
        return { share: bar.getBoundingClientRect().width / track, bar: getComputedStyle(bar).backgroundColor, label: getComputedStyle(label).color };
      },
      DEVELOPMENT.fullSeconds,
      { polling: 'raf', timeout: 4_000 },
    )
    .then((h) => h.jsonValue());
  check(full && full.share > 0.99, `B-AC-9: a fed player's bar fills the track, got ${full?.share}`);
  check(full.bar === full.label, `B-AC-9: a fed player's bar is holo-coloured like its label, bar ${full.bar}, label ${full.label}`);
  await card.waitFor({ state: 'detached', timeout: 3_000 });
}

/** B-AC-10: the store is one hall, two rows, and the outfitters stay shut with no MULE in tow. Call before buying. */
export async function storeIsOneHallWithTwoRows(phone: Page): Promise<void> {
  const hall = phone.getByTestId('store-hall');
  await hall.waitFor({ timeout: 3_000 });
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
