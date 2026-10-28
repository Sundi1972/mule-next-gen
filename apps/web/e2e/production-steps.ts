/**
 * The production show, checked in the browser on the TV and the phone against
 * the view each screen received. A recorder in each page samples the show every
 * frame, so the checks hold at any phase speed; smoke.ts and screens.ts run them.
 */
import { GOODS, type Good } from '@mule/engine';
import type { MuleView, ProductionView, ServerEnvelope, TableView } from '@mule/protocol';
import { SHOW } from '@mule/ui';
import type { Page } from 'playwright';
import { check } from './harness';

/** What one page's recorder saw of one plot. */
type PlotSeen = {
  /** Most unit bars before the event's badge appeared on it. */
  pre: number;
  /** Unit bars in every frame that showed the event's badge. */
  struck: number[];
  colours: string[];
  hits: string[];
  reasons: string[];
  mostReasons: number;
};
type Recording = {
  frames: number;
  plots: Record<string, PlotSeen>;
  layers: string[];
  slots: Record<string, Record<string, string>>;
  slotColours: Record<string, string>;
  strip: { first: Record<string, number>; last: Record<string, number> } | null;
};

/**
 * Samples the production show every animation frame while it is on screen, and
 * starts afresh for each production phase. Kept a string: tsx would wrap named
 * functions in a helper the page lacks.
 */
const RECORDER = `{
  let rec = null;
  const plotSeen = () => ({ pre: 0, struck: [], colours: [], hits: [], reasons: [], mostReasons: 0, struckOnce: false });
  const add = (list, v) => { if (!list.includes(v)) list.push(v); };
  const strip = () => {
    const cells = document.querySelectorAll('[data-phase=production] [data-testid=stock-strip] [data-good]');
    return cells.length ? Object.fromEntries([...cells].map((el) => [el.dataset.good, Number(el.textContent)])) : null;
  };
  const frame = () => {
    const map = document.querySelector('[data-phase=production] [data-testid=map-show]');
    if (!map) {
      rec = null;
      // A new month: what was recorded belongs to the last one, so nobody may read it as this one's.
      if (document.querySelector('[data-phase=planning]')) window.__show = null;
      requestAnimationFrame(frame);
      return;
    }
    if (!rec) { rec = { frames: 0, plots: {}, layers: [], slots: {}, slotColours: {}, strip: null }; window.__show = rec; }
    rec.frames++;
    for (const plot of map.querySelectorAll('[data-testid^=plot-]')) {
      const id = plot.dataset.testid.slice(5);
      const seen = (rec.plots[id] ??= plotSeen());
      const bars = [...plot.querySelectorAll('[data-bar=unit]')];
      const hit = plot.querySelector('[data-testid^=hit-]');
      const reasons = [...plot.querySelectorAll('[data-badge=reason]')];
      if (hit) { seen.struckOnce = true; seen.struck.push(bars.length); add(seen.hits, hit.textContent); }
      else if (!seen.struckOnce) seen.pre = Math.max(seen.pre, bars.length);
      if (bars[0]) add(seen.colours, getComputedStyle(bars[0]).backgroundColor);
      for (const r of reasons) add(seen.reasons, r.textContent);
      seen.mostReasons = Math.max(seen.mostReasons, reasons.length);
    }
    const layer = map.querySelector('[data-event]');
    if (layer) {
      add(rec.layers, 'event:' + layer.dataset.event);
      for (const el of layer.querySelectorAll('[data-testid]')) add(rec.layers, el.dataset.testid);
    }
    for (const slot of document.querySelectorAll('[data-phase=production] [data-testid^=slot-]')) {
      const id = slot.dataset.testid.slice(5);
      rec.slots[id] = Object.fromEntries([...slot.querySelectorAll('[data-good]')].map((el) => [el.dataset.good, el.textContent]));
      rec.slotColours[id] = getComputedStyle(slot).borderTopColor;
    }
    const now = strip();
    if (now) rec.strip = { first: rec.strip ? rec.strip.first : now, last: now };
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}`;

/** What the phone's "On to the auction" sends, as the client puts it on the wire. */
const READY = JSON.stringify({ t: 'intent', intent: { type: 'ready' } });
/** Only stops a hang; nothing is asserted about how long a wait takes. */
const HANG_MS = 15_000;

export type ShowWatch = {
  /** The view this page received during the latest production phase. */
  view: () => MuleView | null;
  /** What the page's recorder saw of the latest production show. */
  recording: () => Promise<Recording | null>;
  /** Every message this page has sent over its socket, parsed, oldest first. */
  sent: () => unknown[];
};

/** Watches a page's views and records its production shows. Attach before the page loads. */
export async function watchShow(page: Page): Promise<ShowWatch> {
  let latest: MuleView | null = null;
  const sent: unknown[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const msg = JSON.parse(payload) as ServerEnvelope<MuleView>;
      const game = msg.t === 'view' ? (msg.view as TableView<MuleView>).game : null;
      if (game?.phase === 'production' && game.production) latest = game;
    });
    ws.on('framesent', ({ payload }) => {
      if (typeof payload === 'string') sent.push(JSON.parse(payload));
    });
  });
  await page.addInitScript(RECORDER);
  return { view: () => latest, sent: () => sent, recording: () => page.evaluate(() => (window as unknown as { __show?: Recording }).__show ?? null) };
}

/** Each player's goods from the show: what each plot made, after the event. */
export function harvests(production: ProductionView): Record<string, Partial<Record<Good, number>>> {
  const out: Record<string, Partial<Record<Good, number>>> = {};
  for (const l of production.lines) {
    const n = after(production, l);
    const mine = (out[l.owner] ??= {});
    if (n > 0) mine[l.good] = (mine[l.good] ?? 0) + n;
  }
  return out;
}

const hitOn = (production: ProductionView, l: { x: number; y: number }) => production.events[0]?.hits.find((h) => h.x === l.x && h.y === l.y);
const after = (production: ProductionView, l: ProductionView['lines'][number]) => Math.max(0, l.made + (hitOn(production, l)?.delta ?? 0));
const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

/** The text of a reason badge, as the map draws it. */
function badgeText(part: ProductionView['lines'][number]['parts'][number]): string {
  return part.why === 'noWater' || part.why === 'noEnergy' ? '½' : signed(part.delta);
}

/**
 * Checks the show both screens just played, after the phase has moved on.
 * With `event`, the month must have had an event (B-AC-7 is then checked in full).
 */
export async function checkTheShow({ tv, phone, event = false }: { tv: ShowWatch; phone: ShowWatch; event?: boolean }): Promise<string> {
  const board = tv.view();
  const mine = phone.view();
  check(board?.production && mine?.production && mine.me, 'both screens received a production view');
  const seenTv = await tv.recording();
  const seenPhone = await phone.recording();
  check(seenTv && seenTv.frames > 0 && seenPhone && seenPhone.frames > 0, 'both screens drew the production show');
  const production = board.production;
  const lines = production.lines;
  const ev = production.events[0];
  check(!event || lines.length > 0, 'B-AC-6: somebody has a working plot in the event month');
  check(!event || ev, 'B-AC-7: the month fired an event');

  // B-AC-8 negative: the TV holds nobody's stock.
  check(board.me === null, 'B-AC-8: the TV view has no player in it');
  check(!/"(stock|before)":/.test(JSON.stringify(board)), 'B-AC-8: the TV view has no stock field');
  check(seenTv.strip === null, 'B-AC-8: the TV never showed a stock strip');

  // B-AC-6 on the TV: every working plot filled with one bar per unit, in its owner's colour, with its reasons.
  const plotIds = new Set(lines.map((l) => `${l.x}-${l.y}`));
  const stray = Object.keys(seenTv.plots).filter((id) => !plotIds.has(id));
  check(stray.length === 0, `B-AC-6: plots that make nothing were drawn with bars: ${stray.join(', ')}`);
  for (const l of lines) {
    const id = `${l.x}-${l.y}`;
    const seen = seenTv.plots[id];
    check(seen, `B-AC-6: the TV drew plot ${id}`);
    const hit = hitOn(production, l);
    const struck = hit !== undefined && hit.delta !== 0;
    // A plot the event reached before it filled shows its bars only after the event.
    if (!struck || seen.pre > 0) check(seen.pre === Math.min(l.made, 8), `B-AC-6: plot ${id} filled ${seen.pre} bars for ${l.made} units`);
    const colour = seenTv.slotColours[l.owner];
    // A plot that made nothing has no bars, so nothing to colour.
    const drawn = seen.pre > 0 || seen.struck.some((n) => n > 0);
    check((seen.colours.length > 0) === drawn && seen.colours.every((c) => c === colour), `B-AC-6: plot ${id} bars ${seen.colours.join()} are not ${l.owner}'s ${colour}`);
    check(seen.mostReasons <= 2, `B-AC-6: plot ${id} shows ${seen.mostReasons} reasons on the TV`);
    if (l.parts[0]) check(seen.reasons.includes(badgeText(l.parts[0])), `B-AC-6: plot ${id} never showed "${badgeText(l.parts[0])}", saw ${seen.reasons.join()}`);
    // B-AC-7: the event's badge is its delta, on the plots it hit and nowhere else, and the bars change by it.
    if (struck) {
      check(seen.hits.join() === signed(hit.delta), `B-AC-7: plot ${id} was badged "${seen.hits.join()}" for ${hit.delta}`);
      const want = Math.min(after(production, l), 8);
      check(seen.struck.length > 0 && seen.struck.every((n) => n === want), `B-AC-7: plot ${id} showed ${seen.struck.join()} bars after the hit, not ${want}`);
    } else check(seen.hits.length === 0, `B-AC-7: plot ${id} was not hit but was badged "${seen.hits.join()}"`);
  }
  if (ev) {
    check(seenTv.layers.includes(`event:${ev.kind}`), `B-AC-7: the TV played the ${ev.kind} layer, saw ${seenTv.layers.join()}`);
    const own: Partial<Record<string, string>> = { storm: 'storm-front', quake: 'quake-hit', comet: 'comet', blight: 'blight-', flood: 'flood-', fire: 'fire-' };
    const mark = own[ev.kind];
    if (mark) check(seenTv.layers.some((id) => id.startsWith(mark)), `B-AC-7: the ${ev.kind} layer drew ${mark}, saw ${seenTv.layers.join()}`);
  }

  // The phone: only its own plots, one badge each, the event's when it was hit.
  const me = mine.me;
  const myIds = new Set(lines.filter((l) => l.owner === me.id).map((l) => `${l.x}-${l.y}`));
  const others = Object.keys(seenPhone.plots).filter((id) => !myIds.has(id));
  check(others.length === 0, `B-AC-6: the phone drew others' plots: ${others.join(', ')}`);
  for (const id of myIds) {
    const seen = seenPhone.plots[id];
    check(seen && seen.mostReasons <= 1, `B-AC-6: the phone drew plot ${id} with at most one reason badge`);
  }

  // B-AC-8: every TV slot ends with "+n" per good its plots made, and the phone's strip counts up to its stock.
  const harvest = harvests(production);
  for (const p of board.players) {
    const want = Object.fromEntries(Object.entries(harvest[p.id] ?? {}).map(([g, n]) => [g, `+${n}`]));
    check(JSON.stringify(sorted(seenTv.slots[p.id] ?? {})) === JSON.stringify(sorted(want)), `B-AC-8: ${p.id}'s slot ended on ${JSON.stringify(seenTv.slots[p.id])}, want ${JSON.stringify(want)}`);
  }
  check(seenPhone.strip, 'B-AC-8: the phone showed its stock strip');
  for (const g of GOODS) {
    const made = harvest[me.id]?.[g] ?? 0;
    check(seenPhone.strip.last[g] === me.stock[g], `B-AC-8: the strip ended on ${seenPhone.strip.last[g]} ${g}, the phone holds ${me.stock[g]}`);
    const start = Math.max(0, me.stock[g] - made);
    check(seenPhone.strip.first[g] === start, `B-AC-8: the strip started ${g} at ${seenPhone.strip.first[g]}, not ${start}`);
  }
  return `${lines.length} working plots, ${ev ? `a ${ev.kind} event hitting ${ev.hits.length}` : 'no event'}, ${seenTv.frames} TV frames, ${me.id} harvested ${JSON.stringify(harvest[me.id] ?? {})}`;
}

/**
 * During a full-speed show: calls `midShow` once the event card is up, then,
 * once every plot's goods are home, presses the phone's "On to the auction"
 * and checks that the button is there, that the press sends the ready message
 * and that the game moves on to the auction (HC-6). Returns checkTheShow's
 * summary of what both screens drew.
 */
export async function pressOnward(phone: Page, watch: { tv: ShowWatch; phone: ShowWatch }, midShow: () => Promise<unknown>): Promise<string> {
  const shown = watch.phone.view();
  check(shown?.production && shown.phaseEndsAt, 'the phone received the production view');
  const { lengthMs, lines } = shown.production;
  const endsAt = shown.phaseEndsAt;
  // The server runs on this machine, so its clock is this one.
  const at = (s: number) => endsAt - lengthMs + (s / SHOW.end) * lengthMs;
  await phone.waitForTimeout(Math.max(0, at(SHOW.cardAt + 1) - Date.now()));
  await midShow();
  await phone.waitForTimeout(Math.max(0, at(SHOW.flyStart + lines.length * SHOW.flyStep + SHOW.flight + 0.3) - Date.now()));
  const onward = phone.locator('[data-phase=production]').getByRole('button', { name: 'On to the auction' });
  check(await onward.isEnabled(), 'HC-6: "On to the auction" is there while the phone shows production');
  const before = watch.phone.sent().length;
  await onward.click();
  // That it ends production early is proven by the server's T-AC-6, with a fake clock; here the page only has to send the message.
  const sentReady = () => watch.phone.sent().slice(before).some((m) => JSON.stringify(m) === READY);
  for (let i = 0; i < HANG_MS / 50 && !sentReady(); i++) await phone.waitForTimeout(50);
  check(sentReady(), 'HC-6: pressing "On to the auction" sends the ready message');
  await phone.locator('[data-phase=auction]').waitFor({ timeout: HANG_MS });
  return checkTheShow(watch);
}

function sorted(o: Record<string, string>): [string, string][] {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}
