/**
 * theWalkSideFitsAtItsWorst (PM ruling 7 Nov): at 1920×1080 and six seats, the goods auction's walk with the most running
 * deals and held sellers six seats can have. TV-FIT's floor holds: the body, the side column inside it, at
 * TV_SCALE_FLOOR or more; every running deal has its row (standing ruling: every running deal stays in sight, the older
 * ones one row each); nothing runs past the foot; the held card's words show whole. A real six-seat game is played to a
 * real walk, the room is held so the walk's clock stands still, and the TV's view is swapped for the staged one.
 *
 * Why staged: the side column fits its own height, so its scale depends on the game's state (a run measured the walk
 * at 0.687 on seed 1352431318 and 0.849 on another); a whole-game run grades the worst case only by luck.
 *
 * The worst case, from the engine:
 * - a player is in at most one deal: stepBoard (packages/engine/src/walk.ts:255-289) pairs the best seller with one
 *   buyer, and marks both busy so no house takes them;
 * - one pair of players trades at a time (walk.ts:258-265), the store sells to one player at a time (walk.ts:276-281),
 *   and of the houses that buy (the ship and the store, auction.ts:103-106) only the one that pays most has a deal: a
 *   seller at or under both prices sells to the higher (walk.ts:283-289), so every seller at a line goes to the same one;
 * - the store sells nothing once sold out (storeSellLine, packages/engine/src/auction.ts:45-48): no store deal then;
 * - a held seller (RULE-4, walk.ts:156-163) rests above the line, so trades with nobody.
 * So the walk runs at most three deals (a pair, the store selling, one house buying), two when the store is sold out,
 * and the players in deals plus the held sellers are at most six. MIXES are the candidates; the reachable ones are
 * asserted, the ones past the engine only measured, for the headroom.
 *
 * A local fit check, kept out of CI (lean CI). Run with
 * `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/auction-tv-fit.ts`.
 */
import type { Good } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import type { Page } from 'playwright';
import { check, held, launch, PHONE, startServer, TV } from './harness';
import { fitSettled, nothingPastTheFoot, shownWhole, theTableHasSaid, theTvScaleHolds, TV_SCALE_FLOOR } from './tv-fit-steps';

type Auction = NonNullable<MuleView['auction']>;
type Walker = Auction['walkers'][number];
type Deal = Auction['deals'][number];
/** A running deal: two players, the store selling to a player, or a house buying from one. */
type DealKind = 'pair' | 'pair2' | 'storeSells' | 'shipBuys' | 'storeBuys';

interface Mix {
  name: string;
  /** Within the engine's limits (see the header): asserted. Past them: measured only. */
  reachable: boolean;
  soldOut: boolean;
  ship: boolean;
  deals: DealKind[];
  held: number;
}

const MIXES: Mix[] = [
  { name: 'sold out, the ship buying: a pair and the ship, 3 held', reachable: true, soldOut: true, ship: true, deals: ['pair', 'shipBuys'], held: 3 },
  { name: 'in stock, the ship buying: a pair, the store selling and the ship, 2 held', reachable: true, soldOut: false, ship: true, deals: ['pair', 'storeSells', 'shipBuys'], held: 2 },
  { name: 'in stock, no ship: a pair, the store selling and the store buying, 2 held', reachable: true, soldOut: false, ship: false, deals: ['pair', 'storeSells', 'storeBuys'], held: 2 },
  { name: 'sold out, no ship: a pair and the store buying, 3 held', reachable: true, soldOut: true, ship: false, deals: ['pair', 'storeBuys'], held: 3 },
  // The estimate the ruling started from was four deals beside two held cards, sold out with the ship buying: seven
  // players, as a pair is two. The nearest six seats can draw, each past the engine: two houses buying at once, a store
  // deal while sold out, two pairs at once.
  { name: 'PAST THE ENGINE: sold out, the ship buying: a pair, the ship and the store buying, 2 held', reachable: false, soldOut: true, ship: true, deals: ['pair', 'shipBuys', 'storeBuys'], held: 2 },
  { name: 'PAST THE ENGINE: sold out, the ship buying: 4 deals, 1 held', reachable: false, soldOut: true, ship: true, deals: ['pair', 'storeSells', 'shipBuys', 'storeBuys'], held: 1 },
  { name: 'PAST THE ENGINE: sold out, the ship buying: 2 pairs, the ship and the store buying, 0 held', reachable: false, soldOut: true, ship: true, deals: ['pair', 'pair2', 'shipBuys', 'storeBuys'], held: 0 },
];

/** The longest good name (packages/ui GOOD_NAME): the held card, the ship line and the good's tag say it. */
const GOOD: Good = 'electronics';
/** A typed name is at most 16 characters (ROOM_LIMITS.nameChars); the AI seats' longest is 18 (AI_NAMES). */
const HUMAN = 'Wilhelmina Moore';
/** Three-digit prices and two-digit counts: the longest words a deal row, the readout and the boxes say. */
const PRICE = { storeBuys: 104, ship: 126, pair: 119, bid: 131, storeSells: 142, held: 158, idle: 92 };
const UNITS = { deal: 12, held: 14, seller: 9 };

/**
 * Kept a string, as tv-fit-steps' readers: the side column's fit box, its room, and each part's height at full size (the
 * inner box read at the column's own width, then put back), for the log and for a red's numbers.
 */
const SIDE_PARTS = String.raw`(() => {
  const stage = document.querySelector('[data-testid=tv-stage]');
  const box = stage && stage.closest('[data-fit]');
  if (!box) return null;
  const inner = box.firstElementChild;
  const saved = [inner.style.width, inner.style.height];
  inner.style.width = '100%';
  inner.style.height = 'auto';
  const parts = [...inner.children].filter((c) => c.offsetHeight > 0).map((c) => {
    const id = c.getAttribute('data-testid') || (c.querySelector('[data-testid=tv-stage]') ? 'good-box' : c.querySelector('[data-testid=tv-deal]') ? 'deals' : c.tagName.toLowerCase());
    return id + ' ' + c.offsetHeight;
  });
  const natural = inner.offsetHeight;
  // The largest scale whose content fits at its own width, read every 0.005: what the fit could reach, for the log.
  let best = 0;
  for (let s = 1; s >= 0.5 && best === 0; s -= 0.005) {
    inner.style.width = 100 / s + '%';
    if (s * inner.offsetHeight <= box.clientHeight + 0.5) best = s;
  }
  [inner.style.width, inner.style.height] = saved;
  return { scale: Number(box.getAttribute('data-fit')), room: box.clientHeight, natural, best: best.toFixed(3), parts };
})()`;

const started = Date.now();
const { server, base } = await startServer({ politics: false, phaseScale: 0.05, seed: () => 7 });
const browser = await launch();
const errors: string[] = [];
const reds: string[] = [];
try {
  console.log(`✓ theWalkSideFitsAtItsWorst: ${await theWalkSideFitsAtItsWorst()}`);
  check(reds.length === 0, `TV-FIT at the six-seat walk:\n  ${reds.join('\n  ')}`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e auction-tv-fit: ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e auction-tv-fit: FAILED');
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

/** Six seats played to a real walk, then each mix staged on the TV while the room is held. */
async function theWalkSideFitsAtItsWorst(timeout = 5_000): Promise<string> {
  const phone = await (await browser.newContext(PHONE)).newPage();
  const tv = await (await browser.newContext(TV)).newPage();
  for (const [who, page] of [['phone', phone], ['tv', tv]] as const) page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  try {
    await phone.goto(base);
    await phone.getByPlaceholder('Heiko').fill(HUMAN);
    await phone.getByRole('button', { name: 'Start a new game' }).click();
    await phone.getByText("You're at the table").waitFor({ timeout });
    const code = (await phone.getByTestId('room-code').textContent())?.trim() ?? '';
    for (let i = 1; i <= 5; i++) {
      await phone.getByRole('button', { name: 'Add AI player' }).click();
      await phone.locator('[data-testid=seats] li').nth(i).waitFor({ timeout });
    }
    await phone.getByRole('button', { name: 'Start game' }).click();
    await tv.goto(`${base}/table?room=${code}`);

    const room = server.registry.get(code)!;
    const seats = room.viewFor(null).seats;
    check(seats.length === 6, `six seats at the table, got ${seats.length}`);
    const game = (room as unknown as { game: { state: { phase: string; auction?: { stage: string } | null }; viewFor(seat: string | null): MuleView; handle(seat: string, intent: object): void } }).game;
    const me = seats.find((s) => !s.isAi)!.id;
    // The human is done with each phase and stage as it comes, so the month runs on to a good's walk. Read on the server
    // every few ms: at this phase scale a walk is short.
    let lastReady = 0;
    for (const deadline = Date.now() + 240_000; !(game.state.phase === 'auction' && game.state.auction?.stage === 'walk'); ) {
      check(Date.now() < deadline, `a good's walk comes up within 240 s, got ${game.state.phase} ${game.state.auction?.stage ?? ''}`);
      if (Date.now() - lastReady > 200) {
        lastReady = Date.now();
        try {
          game.handle(me, { type: 'ready' });
        } catch {
          // Refused where Ready means nothing yet; the phase's clock moves it on.
        }
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    // Held in the same turn the walk was seen: no tick runs until the step returns, so the walk stands still.
    return await held(server, code, async () => {
      await tv.locator('[data-testid=tv-walk]').waitFor({ timeout });
      // A table talks: a chat line on the walk takes its height from the body, so the side is read under it.
      await theTableHasSaid(tv, server, code);
      const viewFor = game.viewFor.bind(game);
      const players = viewFor(null).players;
      // Longest first: the held card, then the pair (the readout names the lowest ask and the highest bid), then the rest.
      const byLength = [...players].sort((x, y) => y.name.length - x.name.length);
      const results: string[] = [];
      try {
        for (const mix of MIXES) {
          // A blank walk first, so the mix's deals and held sellers are new to the TV and come in the staged order.
          game.viewFor = (seat) => blank(viewFor(seat));
          room.broadcast();
          await tv.locator('[data-testid=tv-deal]').first().waitFor({ state: 'detached', timeout });
          await tv.getByTestId('tv-held').waitFor({ state: 'detached', timeout });
          const staged = stage(mix, byLength.map((p) => p.id));
          game.viewFor = (seat) => ({ ...blank(viewFor(seat)), auction: { ...blank(viewFor(seat)).auction!, ...staged } });
          room.broadcast();
          await tv.locator('[data-testid=tv-deal]').nth(staged.deals.length - 1).waitFor({ timeout });
          try {
            results.push(await measure(tv, mix, staged, players));
          } catch (err) {
            if (mix.reachable) reds.push(`${mix.name}: ${(err as Error).message}`);
            else results.push(`${mix.name}: ${(err as Error).message}`);
          }
        }
      } finally {
        game.viewFor = viewFor;
        room.broadcast();
      }
      check(game.state.phase === 'auction' && game.state.auction?.stage === 'walk', `the walk stood still while the TV was read, got ${game.state.phase} ${game.state.auction?.stage}`);
      return `\n  ${results.join('\n  ')}`;
    });
  } finally {
    await phone.context().close();
    await tv.context().close();
  }
}

/** The real walk with nothing running and nobody held, on the staged good. */
function blank(view: MuleView): MuleView {
  const a = view.auction!;
  return { ...view, auction: { ...a, good: GOOD, stage: 'walk', deals: [], walkers: a.walkers.map((w) => ({ ...w, held: undefined, side: w.side === 'seller' ? 'buyer' : w.side })) } };
}

/** The mix as the view's auction fields: who trades with whom, who is held, the store and the ship. */
function stage(mix: Mix, ids: string[]): Pick<Auction, 'deals' | 'walkers' | 'storeForSale' | 'storeSells' | 'storeSellsBid' | 'storeBuys' | 'shipPays' | 'slowed' | 'zones' | 'lo' | 'hi'> {
  const free = [...ids];
  const take = () => free.shift()!;
  const walkers = new Map<string, Walker>();
  const walker = (id: string, side: Walker['side'], price: number, extra: Partial<Walker> = {}) =>
    walkers.set(id, { id, side, price, at: price, dir: 0, done: false, units: side === 'seller' ? UNITS.seller : 0, line: null, ...extra });
  // The newest held seller has the card: the longest name, so its words are the likeliest cut.
  const heldIds = mix.held > 0 ? [take()] : [];
  const deals: Deal[] = [];
  for (const kind of mix.deals) {
    if (kind === 'pair' || kind === 'pair2') {
      const [seller, buyer] = [take(), take()];
      walker(seller, 'seller', PRICE.pair);
      walker(buyer, 'buyer', PRICE.bid);
      deals.push({ buyer, seller, price: PRICE.pair, units: UNITS.deal });
    } else if (kind === 'storeSells') {
      const buyer = take();
      walker(buyer, 'buyer', PRICE.storeSells, { line: 'store' });
      deals.push({ buyer, seller: 'store', price: PRICE.storeSells, units: UNITS.deal });
    } else {
      const house = kind === 'shipBuys' ? 'ship' : 'store';
      const price = kind === 'shipBuys' ? PRICE.ship : PRICE.storeBuys;
      const seller = take();
      walker(seller, 'seller', price, { line: house });
      deals.push({ buyer: house, seller, price, units: UNITS.deal });
    }
  }
  for (let i = 1; i < mix.held && free.length > 0; i++) heldIds.push(take());
  check(heldIds.length === mix.held, `${mix.name}: six seats hold ${mix.held} sellers beside ${mix.deals.length} deals`);
  for (const id of heldIds) walker(id, 'seller', PRICE.held, { held: true, units: UNITS.held });
  for (const id of free) walker(id, 'buyer', PRICE.idle);
  return {
    deals,
    // In seat order, as the server sends them; the held card goes to the first held seller.
    walkers: [...heldIds, ...ids.filter((id) => !heldIds.includes(id))].map((id) => walkers.get(id)!),
    storeForSale: mix.soldOut ? 0 : 3,
    // Sold out: the highest bid on the store's old line, the longest the sold-out box says.
    storeSells: mix.soldOut ? PRICE.storeSells + 1 : PRICE.storeSells,
    storeSellsBid: mix.soldOut ? true : undefined,
    storeBuys: PRICE.storeBuys,
    shipPays: mix.ship ? PRICE.ship : null,
    slowed: true,
    // The board drawn around the staged prices.
    zones: { buyersTop: PRICE.storeBuys, sellersBottom: PRICE.storeSells, lo: PRICE.idle - 10, hi: PRICE.held + 10 },
    lo: PRICE.idle - 10,
    hi: PRICE.held + 10,
  };
}

/** The staged mix on the TV: the floor, every deal's row, nothing past the foot, the held card whole. */
async function measure(tv: Page, mix: Mix, staged: ReturnType<typeof stage>, players: MuleView['players']): Promise<string> {
  const screen = `six-seat walk, ${mix.name}`;
  await fitSettled(tv, screen);
  const side = (await tv.evaluate(SIDE_PARTS)) as { scale: number; room: number; natural: number; best: string; parts: string[] } | null;
  check(side, `${screen}: the side column sits in a fit box`);
  const rows = await tv.locator('[data-testid=tv-deal]').count();
  const fits = await tv.evaluate(() => [...document.querySelectorAll('[data-phase] [data-fit]')].map((b) => b.getAttribute('data-fit')).join(' × '));
  const log = `${mix.name}: fit ${fits} (the side could fit at ${side.best}), the side ${side.natural} px at full size in ${side.room} px (${side.parts.join(', ')})`;
  console.log(`  ${log}`);
  check(rows === staged.deals.length, `TV-FIT: every running deal has its row, ${staged.deals.length} staged, ${rows} shown`);
  const name = (id: string) => (id === 'store' ? 'the store' : id === 'ship' ? 'the ship' : players.find((p) => p.id === id)!.name);
  const terms = await tv.locator('[data-testid=tv-deal] [data-testid=tv-deal-terms]').allInnerTexts();
  for (const d of staged.deals) check(terms.some((t) => t.includes(`${d.units} units @ ${d.price}`)), `TV-FIT: ${name(d.seller)} → ${name(d.buyer)} shows its units and price, got ${JSON.stringify(terms)}`);
  await shownWhole(tv, screen, ['[data-testid=tv-deal]', '[data-testid=tv-room-line]', ...(mix.soldOut ? ['[data-testid=tv-sold-out]'] : []), ...(mix.ship ? ['[data-testid=tv-ship]'] : [])]);
  if (mix.held > 0) {
    const card = staged.walkers.find((w) => w.held)!;
    await shownWhole(tv, screen, [`[data-testid=tv-held-${card.id}]`, `[data-testid=tv-held-${card.id}] [data-testid=held-words]`, ...(mix.held > 1 ? ['[data-testid=tv-held-others]'] : [])]);
    const words = await tv.locator(`[data-testid=tv-held-${card.id}] [data-testid=held-words]`).evaluate((e) => ({ text: (e as HTMLElement).innerText, cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 }));
    check(words.text === `${name(card.id)} keeps ${UNITS.held} Electronics` && !words.cut, `TV-FIT: the held card says "${name(card.id)} keeps ${UNITS.held} Electronics" uncut, got "${words.text}"${words.cut ? ' cut' : ''}`);
  }
  const foot = await nothingPastTheFoot(tv, screen);
  const scale = await theTvScaleHolds(tv, screen);
  return `${mix.reachable ? '' : '(measured only) '}${log}; drawn at ${scale} (floor ${TV_SCALE_FLOOR}), the foot at y ${foot.toFixed(0)}`;
}
