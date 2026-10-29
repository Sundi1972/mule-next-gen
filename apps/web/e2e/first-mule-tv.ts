/**
 * A-1, the TV at a full table: six seats (Heiko and five AIs) in month 1's development while the clock waits for
 * Heiko's first MULE, which never comes. The "First MULEs in" list runs to three rows; measures it, the store box and
 * the map against the TV's frame, and fails if either is cut.
 * Local: `pnpm --filter @mule/web build`, then `pnpm --filter @mule/web exec tsx e2e/first-mule-tv.ts`.
 */
import { check, doneWithLand, launch, PHONE, startServer, TV } from './harness';

const PRESS_MS = 3_000;

const { server, base } = await startServer({ maxMonths: 1, phaseScale: 0.1, politics: false, seed: () => 1 });
const browser = await launch();
try {
  const phone = await (await browser.newContext(PHONE)).newPage();
  await phone.goto(base);
  await phone.getByPlaceholder('Heiko').fill('Heiko');
  await phone.getByRole('button', { name: 'Start a new game' }).click();
  await phone.getByText("You're at the table").waitFor();
  const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
  const tv = await (await browser.newContext(TV)).newPage();
  await tv.goto(`${base}/table?room=${code}`);
  for (let n = 1; n <= 5; n++) {
    await phone.getByRole('button', { name: 'Add AI player' }).click({ timeout: PRESS_MS });
    await phone.locator('[data-testid=seats] li').nth(n).waitFor({ timeout: PRESS_MS });
  }
  await phone.getByRole('button', { name: 'Start game' }).click();
  // Test fixture: Heiko owns a plot from the start, so the clock waits for his first MULE, which never comes.
  const state = (server.registry.get(code) as unknown as { game: { state: { tiles: { terrain: string; owner: string | null }[] } } }).game.state;
  state.tiles.find((t) => t.terrain !== 'store' && t.owner === null)!.owner = 's1';
  await phone.getByTestId('ready').click({ timeout: PRESS_MS * 3 });
  await doneWithLand(phone);
  await tv.getByTestId('tv-first-mules').waitFor({ timeout: 60_000 });
  // Let the AIs get their first MULEs in, so the list shows both states.
  await tv.getByTestId('tv-first-mules').getByText('✓ in').first().waitFor({ timeout: 30_000 });

  // Raw rects from the page (no helper functions inside evaluate: tsx would name them), worked out here.
  const raw = await tv.evaluate(() => {
    const label = [...document.querySelectorAll('span')].find((s) => s.textContent === 'In the store now');
    const pick = [
      document.querySelector('[data-phase=development]'),
      document.querySelector('[data-testid=tv-first-mules]'),
      label?.nextElementSibling ?? null,
      document.querySelector('[data-phase=development] [data-testid=store-hall]'),
      document.querySelector('[data-phase=development] [data-testid=holo-map]'),
    ];
    return {
      rects: pick.map((e) => (e ? { top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom, width: e.getBoundingClientRect().width } : null)),
      seats: document.querySelectorAll('[data-testid=tv-first-mules] li').length,
    };
  });
  const [frame, list, storeBoxR, storeR, mapR] = [0, 1, 2, 3, 4].map((k) => raw.rects[k] ?? null);
  check(frame, 'the TV draws development');
  const scale = frame.width / 1280;
  // In the 1280×720 canvas's own pixels, from its top.
  const y = (v: number) => Math.round((v - frame.top) / scale);
  const span = (r: (typeof raw.rects)[number] | undefined) => (r ? { top: y(r.top), bottom: y(r.bottom), height: Math.round((r.bottom - r.top) / scale) } : null);
  const m = { scale: Math.round(scale * 1000) / 1000, seats: raw.seats, list: span(list), storeBox: span(storeBoxR), storeHall: span(storeR), map: span(mapR), frameBottom: y(frame.bottom) };
  await tv.screenshot({ path: `${process.env.MULE_SHOTS ?? '.'}/tv-6seats.png` });
  console.log(`TV, six seats, the clock waiting: ${JSON.stringify(m)}`);
  check(m.seats === 6, `A-1: the list has six seats, got ${m.seats}`);
  // The store box is drawn 240 px tall (TableApp's h-[240px]); the hall inside it is the store.
  check(m.storeBox && m.storeHall && m.storeBox.height >= 239.5 && m.storeHall.height >= 239.5 && m.storeBox.bottom <= m.frameBottom, `A-1: the store is whole, 240 px, inside the frame: ${JSON.stringify(m)}`);
  check(m.map && m.map.bottom <= m.frameBottom, `A-1: the map is whole inside the frame: ${JSON.stringify(m)}`);
  console.log('e2e first MULE, TV at six seats: ok');
} finally {
  await browser.close();
  await server.close();
}
