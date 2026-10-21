/**
 * The production show, checked in the browser on the TV and the phone against
 * the view each screen received from the server. screens.ts runs it in its
 * full-speed month; `watchViews` must be attached before the page connects.
 */
import { GOODS, type Good } from '@mule/engine';
import type { MuleView, ProductionView, ServerEnvelope, TableView } from '@mule/protocol';
import type { Page } from 'playwright';
import { check } from './harness';

/** The latest game view a page received over its socket. */
export function watchViews(page: Page): () => MuleView | null {
  let latest: MuleView | null = null;
  page.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const msg = JSON.parse(payload) as ServerEnvelope<MuleView>;
      if (msg.t === 'view') latest = (msg.view as TableView<MuleView>).game ?? null;
    }),
  );
  return () => latest;
}

export type ShowContext = {
  phone: Page;
  tv: Page;
  phoneView: () => MuleView | null;
  tvView: () => MuleView | null;
  /** Saves a screenshot of the page under this name. */
  shot: (page: Page, name: string) => Promise<void>;
};

/** Each player's goods from the show: what each plot made, after the event. */
function harvests(production: ProductionView): Record<string, Partial<Record<Good, number>>> {
  const hits = new Map(production.events[0]?.hits.map((h) => [`${h.x},${h.y}`, h.delta]));
  const out: Record<string, Partial<Record<Good, number>>> = {};
  for (const l of production.lines) {
    const n = Math.max(0, l.made + (hits.get(`${l.x},${l.y}`) ?? 0));
    const mine = (out[l.owner] ??= {});
    if (n > 0) mine[l.good] = (mine[l.good] ?? 0) + n;
  }
  return out;
}

/** The phone's stock strip, good by good, as it reads now. */
async function strip(phone: Page): Promise<Record<string, number>> {
  const cells = await phone.locator('[data-phase=production] [data-testid=stock-strip] [data-good]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-good') ?? '', el.textContent ?? '']));
  return Object.fromEntries(cells.map(([g, n]) => [g, Number(n)]));
}

export async function checkTheShow({ phone, tv, phoneView, tvView, shot }: ShowContext): Promise<void> {
  await tv.locator('[data-phase=production] [data-testid=map-show]').waitFor({ timeout: 5_000 });
  await phone.locator('[data-phase=production] [data-testid=map-show]').waitFor({ timeout: 5_000 });
  const board = tvView();
  const mine = phoneView();
  check(board?.phase === 'production' && board.production, 'the TV received a production view');
  check(mine?.me && mine.production, "the phone received its own view of production");
  const production = board.production;
  const lines = production.lines;
  check(lines.length > 0, 'B-AC-6: somebody has a working plot this month');

  // B-AC-8 negative: the TV view holds nobody's stock.
  check(board.me === null, 'B-AC-8: the TV view has no player in it');
  check(!/"(stock|before)"/.test(JSON.stringify(board)), 'B-AC-8: the TV view has no stock field');
  check((await tv.getByTestId('stock-strip').count()) === 0, 'B-AC-8: the TV shows no stock strip');

  // B-AC-6: every working plot fills with one bar per unit, in its owner's colour, with its first reason badged.
  const filled = await tv.waitForFunction(
    (want) => {
      const out: string[] = [];
      for (const l of want) {
        const plot = document.querySelector(`[data-phase=production] [data-testid=plot-${l.x}-${l.y}]`);
        const slot = document.querySelector(`[data-phase=production] [data-testid=slot-${l.owner}]`);
        if (!plot || !slot) return null;
        const bars = [...plot.querySelectorAll<HTMLElement>('[data-bar=unit]')];
        if (bars.length !== Math.min(l.made, 8)) return null;
        const colour = getComputedStyle(slot).borderTopColor;
        if (bars.some((b) => getComputedStyle(b).backgroundColor !== colour)) out.push(`plot ${l.x},${l.y} is not in ${l.owner}'s colour ${colour}`);
        if (l.badge && !(plot.textContent ?? '').includes(l.badge)) out.push(`plot ${l.x},${l.y} has no "${l.badge}" badge: "${plot.textContent}"`);
      }
      return out;
    },
    lines.map((l) => ({ x: l.x, y: l.y, owner: l.owner, made: l.made, badge: badgeText(l.parts[0]) })),
    { timeout: 9_000, polling: 100 },
  );
  const wrong = (await filled.jsonValue()) as string[];
  check(wrong.length === 0, `B-AC-6: ${wrong.join('; ')}`);
  const outfitted = new Set(lines.map((l) => `${l.x},${l.y}`));
  const idle = board.tiles.filter((t) => !outfitted.has(`${t.x},${t.y}`));
  const barred = await tv.evaluate((ids) => ids.filter((id) => document.querySelector(`[data-testid=${id}] [data-bar]`)), idle.map((t) => `plot-${t.x}-${t.y}`));
  check(barred.length === 0, `B-AC-6: plots that make nothing have bars: ${barred.join(', ')}`);
  console.log(`production show: ${lines.length} working plots filled; ${idle.filter((t) => t.owner).length} owned plots without an outfit stayed empty`);

  const me = mine.me;
  const harvest = harvests(mine.production);
  const myLines = mine.production.lines.filter((l) => l.owner === me.id);
  const before = await strip(phone);
  await shot(phone, 'phone-land-5-production-show');
  await shot(tv, 'tv-5-production-show');

  // B-AC-7, when this month has an event: its hits are badged by their delta, and nothing else is.
  const ev = production.events[0];
  if (ev) {
    for (const h of ev.hits.filter((x) => x.delta !== 0)) {
      const badge = tv.getByTestId(`hit-${h.x}-${h.y}`);
      await badge.waitFor({ timeout: 9_000 });
      const text = (await badge.textContent()) ?? '';
      check(text === (h.delta > 0 ? `+${h.delta}` : `−${-h.delta}`), `B-AC-7: hit ${h.x},${h.y} reads "${text}" for ${h.delta}`);
    }
    const hit = new Set(ev.hits.map((h) => `${h.x},${h.y}`));
    const missed = lines.filter((l) => !hit.has(`${l.x},${l.y}`)).map((l) => `hit-${l.x}-${l.y}`);
    const stray = await tv.evaluate((ids) => ids.filter((id) => document.querySelector(`[data-testid=${id}]`)), missed);
    check(stray.length === 0, `B-AC-7: plots it missed are badged: ${stray.join(', ')}`);
    console.log(`production show: the ${ev.kind} event badged ${ev.hits.length} plots`);
  }

  // B-AC-8: the goods fly home; each TV slot shows "+n" per good it made, and the phone's strip counts up.
  const want = Object.fromEntries(board.players.map((p) => [p.id, harvest[p.id] ?? {}]));
  const landed = await tv.waitForFunction(
    (wanted) => {
      for (const [id, goods] of Object.entries(wanted)) {
        const slot = document.querySelector(`[data-phase=production] [data-testid=slot-${id}]`);
        if (!slot) return null;
        const shown = [...slot.querySelectorAll<HTMLElement>('[data-good]')].map((el) => `${el.dataset.good} ${el.textContent}`).sort();
        const expected = Object.entries(goods).map(([g, n]) => `${g} +${n}`).sort();
        if (shown.join() !== expected.join()) return null;
      }
      return true;
    },
    want,
    { timeout: 14_000, polling: 100 },
  );
  check(await landed.jsonValue(), 'B-AC-8: every TV slot shows what its plots made');
  let after = await strip(phone);
  for (let tries = 0; tries < 30 && GOODS.some((g) => after[g] !== me.stock[g]); tries++) {
    await phone.waitForTimeout(100);
    after = await strip(phone);
  }
  for (const g of GOODS) {
    const made = harvest[me.id]?.[g] ?? 0;
    check(after[g] === me.stock[g], `B-AC-8: the strip ends on the phone's ${g} stock ${me.stock[g]}, reads ${after[g]}`);
    if (made > 0) check(before[g] === me.stock[g] - made, `B-AC-8: the strip counts ${g} up from ${me.stock[g] - made}, it read ${before[g]} before landing`);
  }
  console.log(`production show: ${me.id} harvested ${JSON.stringify(harvest[me.id] ?? {})} from ${myLines.length} plots; the TV slots and the phone strip agree`);
}

/** The text of a plot's first reason badge, as the map draws it. */
function badgeText(part: ProductionView['lines'][number]['parts'][number] | undefined): string | null {
  if (!part) return null;
  if (part.why === 'noWater' || part.why === 'noEnergy') return '½';
  return part.delta > 0 ? `+${part.delta}` : `−${-part.delta}`;
}
