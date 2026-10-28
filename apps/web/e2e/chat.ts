/**
 * B-AC-17 and B-AC-18: live table chat, in a game of its own with an AI seat, two phones (1440×900 and 844×390) and
 * the TV. The phones speak over their own sockets in the land grant, development and the auction; every line each
 * page received is read off its wire and must show in that page's ticker, and as a bubble at its speaker when RULE-9
 * gives it one. Run with `pnpm --filter @mule/web e2e`. With E2E_AI_LINES=1 every page must also receive an AI seat's
 * line in the land grant, development and the auction (for a branch whose AI players talk).
 */
import { LOTS, WALK } from '@mule/engine';
import type { Page } from 'playwright';
import { PHASE_MS } from '../../server/src/mule-game.js';
import { check, launch, PHONE, startServer, TV } from './harness';

const LAPTOP = { width: 1440, height: 900 };
const AI_LINES = process.env.E2E_AI_LINES === '1';
/** Wall-clock bounds assert only off CI (Heiko, 2026-10-28): a shared CI runner's timing says nothing about the product. */
const STRICT_TIMING = !process.env.CI || process.env.E2E_STRICT_TIMING === '1';
const timed = { checked: 0, wouldFail: 0 };
/** The phases B-AC-17 names: each page must hear a line in each, and each phone show a bubble in each. */
const NAMED_PHASES = ['landGrant', 'development', 'auction'] as const;
/** RULE-9, from the spec's words: the test's own reading of it, so the page is checked against the rule, not itself. */
const RULE = { minMs: 2_000, maxMs: 4_500, maxWaitMs: 4_000 };
/**
 * "Within ~1 s": a line shows in the ticker, and a bubble at its scheduled start, within this of the later of that
 * moment and the page first showing the line's phase (a phase's screen can take over a second to mount).
 */
const SHOWS_WITHIN_MS = 1_000;
/** A bubble's end, as a page's timer sees it: its clock and its frames run a little behind the wire's. */
const END_LAG_MS = 150;
/** The latest a line's ~1 s may start counting: a phase's screen can stall a page about 1.2 s as it mounts. */
const PHASE_SHOWN_CAP_MS = 1_500;
/** How often the page samples itself; a gap of over twice this is the sampler stalling, not the page showing. */
const SAMPLE_EVERY_MS = 50;
/** A scheduled bubble shorter than this is not looked for: the sampler might fall between its frames. */
const SHORTEST_LOOKED_FOR_MS = 300;
/** Long enough for every bubble of a burst to have shown and gone. */
const BURST_SETTLES_MS = 7_000;
const BETWEEN_LINES_MS = 2_600;
/**
 * A pause before the phones speak in a new phase: its screen can stall a page ~1.2 s as it mounts, and lines said
 * inside that stall would push the phase's first lines (an AI's opener) out of the 2-line ticker before it paints.
 */
const PHASE_SETTLES_MS = 1_500;
/** A wait of this long, plus room for the browser and the network. */
const within = (ms: number) => ms + 5_000;
/** The land auction, when the colony lists lots: each lot's intro, walk with its late resets, and result. */
const LAND_AUCTION_MS = LOTS.maxLotsPerMonth * (LOTS.introMs + LOTS.walkMs + LOTS.lateCapMs + LOTS.resultMs);
/** How long each phase this test waits for can take to come, from the server's phase lengths. */
const REACH = {
  planning: within(0),
  landGrant: within(PHASE_MS.planning),
  development: within(PHASE_MS.landGrant + LAND_AUCTION_MS),
  auction: within(PHASE_MS.development + PHASE_MS.production),
  walk: within(WALK.statusMs),
};

type Said = { id: number; from: string; to?: string; text: string };
/** What one page's socket received, in frame order, each with the time it arrived. */
type Frame = { kind: 'line'; line: Said; at: number } | { kind: 'phase'; key: string; phase: string; at: number };
type Raw = { frames: Frame[]; seatId: string | null; ai: Set<string> };
/** A line, in the phase of the last view its page received before it: the order, not the clock, decides. */
type Line = Said & { at: number; phase: number };
type Phase = { key: string; name: string; at: number };
type Wire = { lines: Line[]; phases: Phase[]; seatId: string | null; ai: Set<string> };
type Rect = { l: number; t: number; r: number; b: number };
type Bubble = { seat: string; line: number; text: string; anchor: string | null; rect: Rect };
type Sample = {
  t: number;
  phase: string | null;
  ticker: { id: number; text: string; rect: Rect; visible: boolean }[];
  tickerRect: Rect | null;
  viewport: { w: number; h: number };
  bubbles: Bubble[];
  speakers: string[];
  speaking: string[];
  bounds: Rect | null;
};

/**
 * In the page: every 50 ms, what the chat shows: the ticker's lines, each bubble with its line, anchor and rect, which
 * seats the screen draws as speakers, and the frame bubbles must stay inside (the phone's stage, the TV's screen).
 * Kept a string: tsx would wrap named functions in a helper the page lacks.
 */
const SAMPLE = `{
  if (!window.__chatSamples) {
    window.__chatSamples = [];
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    setInterval(() => {
      const bounds = document.querySelector('[data-testid=stage]') ?? document.querySelector('[data-phase]');
      window.__chatSamples.push({
        t: Date.now(),
        phase: document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? null,
        ticker: [...document.querySelectorAll('[data-testid=chat-ticker] [data-testid^=chat-line-]')].map((li) => ({
          id: Number(li.getAttribute('data-testid').slice(10)),
          text: li.textContent,
          rect: rect(li),
          visible: li.checkVisibility ? li.checkVisibility({ visibilityProperty: true }) : true,
        })),
        tickerRect: rect(document.querySelector('[data-testid=chat-ticker]')),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        bubbles: [...document.querySelectorAll('[data-testid^=chat-bubble-]')].map((b) => ({
          seat: b.getAttribute('data-testid').slice(12),
          line: Number(b.getAttribute('data-line')),
          text: b.textContent,
          anchor: b.closest('[data-speaker]')?.getAttribute('data-speaker') ?? (b.closest('[data-testid=table-chat]') ? 'seat-row' : null),
          rect: rect(b),
        })),
        speakers: [...document.querySelectorAll('[data-speaker]')].map((s) => s.getAttribute('data-speaker')),
        speaking: [...document.querySelectorAll('[data-testid=seat-row] [data-speaking]')].map((s) => s.getAttribute('data-testid').slice(5)),
        bounds: rect(bounds),
      });
    }, ${SAMPLE_EVERY_MS});
  }
}`;

/**
 * In the page, test-only: keeps a handle on every WebSocket the app opens, so a phone can speak over its own socket
 * exactly as the app's client does. Kept a string, as SAMPLE is.
 */
const KEEP_SOCKETS = `{
  if (!window.__sockets) {
    window.__sockets = [];
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.__sockets.push(this);
      }
    };
  }
}`;

const started = Date.now();
const { server, base } = await startServer({ maxMonths: 1 });
const browser = await launch();
const errors: string[] = [];
try {
  const lena = await page('lena', { ...PHONE, viewport: LAPTOP });
  const kai = await page('kai', PHONE);
  const tv = await page('tv', TV);
  const wires = new Map<Page, Raw>([lena, kai, tv].map((p) => [p, listen(p)]));

  await lena.goto(base);
  await lena.getByPlaceholder('Heiko').fill('Lena');
  await lena.getByRole('button', { name: 'Start a new game' }).click();
  await lena.getByText("You're at the table").waitFor();
  const code = (await lena.getByTestId('room-code').textContent())?.trim() ?? '';
  await tv.goto(`${base}/table?room=${code}`);
  await kai.goto(`${base}/?room=${code}`);
  await kai.getByPlaceholder('Heiko').fill('Kai');
  await kai.getByRole('button', { name: `Join game ${code}` }).click();
  await kai.getByText("You're at the table").waitFor();
  await lena.getByRole('button', { name: 'Add AI player' }).click();
  await lena.locator('[data-testid=seats] li').nth(2).waitFor();
  await lena.getByRole('button', { name: 'Start game' }).click();

  const kaiId = wires.get(kai)!.seatId!;
  const phase = (p: Page, name: keyof typeof REACH) => p.locator(`[data-phase=${name}]`).first().waitFor({ timeout: REACH[name] });

  // Planning: Lena is ready first; then Kai says a line and presses Ready at once, so the phase ends under its bubble.
  await Promise.all([phase(lena, 'planning'), phase(kai, 'planning'), phase(tv, 'planning')]);
  await lena.getByRole('button', { name: "I'm ready" }).click({ timeout: 5_000 });
  await say(kai, 'Ready when you are.');
  await kai.getByRole('button', { name: "I'm ready" }).click({ timeout: 5_000 });

  // The land grant: a line, a whisper from Lena to Kai, then two lines within a second.
  await Promise.all([phase(lena, 'landGrant'), phase(kai, 'landGrant'), phase(tv, 'landGrant')]);
  await lena.waitForTimeout(PHASE_SETTLES_MS);
  await say(lena, 'Anyone need Water? Cheap today.');
  await lena.waitForTimeout(BETWEEN_LINES_MS);
  await say(lena, 'Psst: vote with me on the land tax?', kaiId);
  await lena.waitForTimeout(BETWEEN_LINES_MS);
  await burst(lena, kai, 'grant');
  // Both claim, which ends the grant while the last bubble may still show.
  await Promise.all([claimOne(lena), claimOne(kai)]);

  // Development: two lines within a second.
  await Promise.all([phase(lena, 'development'), phase(kai, 'development'), phase(tv, 'development')]);
  await lena.waitForTimeout(PHASE_SETTLES_MS);
  await burst(lena, kai, 'dev');
  for (const p of [lena, kai]) await p.locator('[data-phase=development]').getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: 5_000 });

  // The auction: two lines within a second while the TV draws the walk.
  await Promise.all([phase(lena, 'auction'), phase(kai, 'auction')]);
  await tv.locator('[data-phase=auction] [data-testid=walk-board]').waitFor({ timeout: REACH.walk });
  await lena.waitForTimeout(PHASE_SETTLES_MS);
  await burst(lena, kai, 'auction');

  const screens = [
    { who: 'lena', p: lena },
    { who: 'kai', p: kai },
    { who: 'tv', p: tv },
  ];
  const seen = await Promise.all(screens.map(async ({ who, p }) => ({ who, wire: inOrder(wires.get(p)!), samples: (await p.evaluate('window.__chatSamples')) as Sample[] })));
  console.log(`chat: timing bounds ${STRICT_TIMING ? 'assert' : 'are logged, not asserted (CI)'}`);
  console.log(`chat: E2E_AI_LINES is ${AI_LINES ? 'on: every page must hear an AI seat in the land grant, development and the auction' : 'off: AI lines, if any, are checked like any other line'}`);
  const report = seen.map(({ who, samples }) => `${who}: ${noOverlaps(who, samples)}; ${largestStall(samples)}`);
  seen.forEach(({ who, wire, samples }, i) => (report[i] += `; ${everyLineShows(who, wire, samples)}`));
  sameLinesEverywhere(seen[0]!, seen[1]!, seen[2]!);
  whispers(seen[0]!, seen[1]!, seen[2]!);
  if (AI_LINES) for (const { who, wire } of seen) report.push(`${who}: ${aiLinesInEveryPhase(who, wire)}`);
  for (const r of report) console.log(`chat ${r}`);
  if (!STRICT_TIMING) console.log(`timing (logged, CI): ${timed.checked} checks, ${timed.wouldFail} would fail`);
  check(errors.length === 0, `no page errors: ${errors.join('; ')}`);
  console.log(`e2e chat: ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
} catch (err) {
  console.error('e2e chat: FAILED');
  if (errors.length > 0) console.error(`page errors: ${errors.join('; ')}`);
  throw err;
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);

async function page(who: string, options: Parameters<typeof browser.newContext>[0]): Promise<Page> {
  const p = await (await browser.newContext(options)).newPage();
  p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  await p.addInitScript(SAMPLE);
  await p.addInitScript(KEEP_SOCKETS);
  return p;
}

/** What this page's socket received, in one stream: every chat line and every view, in the order they came. */
function listen(p: Page): Raw {
  const raw: Raw = { frames: [], seatId: null, ai: new Set() };
  p.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const msg = JSON.parse(payload) as {
        t: string;
        message?: Said;
        seatId?: string | null;
        view?: { game?: { month: number; phase: string; players: { id: string; isAi: boolean }[] } | null };
      };
      const at = Date.now();
      if (msg.t === 'welcome') raw.seatId = msg.seatId ?? null;
      if (msg.t === 'chat' && msg.message) raw.frames.push({ kind: 'line', line: msg.message, at });
      const game = msg.t === 'view' ? msg.view?.game : null;
      if (!game) return;
      for (const pl of game.players) if (pl.isAi) raw.ai.add(pl.id);
      raw.frames.push({ kind: 'phase', key: `${game.month}-${game.phase}`, phase: game.phase, at });
    }),
  );
  return raw;
}

/** Each line in the phase of the last view before it in the stream; the phases where they changed. */
function inOrder(raw: Raw): Wire {
  const wire: Wire = { lines: [], phases: [], seatId: raw.seatId, ai: raw.ai };
  for (const f of raw.frames) {
    if (f.kind === 'line') wire.lines.push({ ...f.line, at: f.at, phase: wire.phases.length - 1 });
    else if (wire.phases.at(-1)?.key !== f.key) wire.phases.push({ key: f.key, name: f.phase, at: f.at });
  }
  return wire;
}

/** Sends a chat line from this phone over its own open socket (kept by KEEP_SOCKETS), as the app's client does. */
async function say(p: Page, text: string, to?: string): Promise<void> {
  const msg = JSON.stringify({ t: 'chat', text, ...(to ? { to } : {}) });
  const open = await p.evaluate(`(() => {
    const open = window.__sockets.filter((w) => w.readyState === 1);
    if (open.length === 1) open[0].send(${JSON.stringify(msg)});
    return open.length;
  })()`);
  check(open === 1, `the phone has one open socket to chat on, found ${open}`);
}

/** Two lines within a second, one from each phone, then time for both bubbles to show and go. */
async function burst(a: Page, b: Page, tag: string): Promise<void> {
  await say(a, `Smithore is going to spike (${tag}).`);
  await a.waitForTimeout(400);
  await say(b, `Nice plot, Lena! (${tag})`);
  await a.waitForTimeout(BURST_SETTLES_MS);
}

/** Claims the next free plot that lights up. */
async function claimOne(p: Page): Promise<void> {
  const grant = p.locator('[data-phase=landGrant]');
  const claim = grant.getByRole('button', { name: /CLAIM/ });
  const deadline = Date.now() + within(PHASE_MS.landGrant);
  while ((await grant.count()) > 0 && Date.now() < deadline) {
    try {
      await claim.click({ timeout: 1_000 });
      await p.waitForTimeout(300);
    } catch {
      // The light moved on, or the grant ended under the press.
    }
    if ((await grant.getByText(/^0 OF \d CLAIMS? LEFT$/).count()) > 0) return;
  }
}

/** A check that compares a measured duration with a bound: asserted with STRICT_TIMING, else logged with its verdict. */
function timing(ok: boolean, message: string): void {
  timed.checked++;
  if (STRICT_TIMING) return check(ok, message);
  if (ok) return;
  timed.wouldFail++;
  console.log(`timing (logged, CI): ${message}, would fail`);
}

function meets(a: Rect, b: Rect): boolean {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
}

function inside(a: Rect, box: Rect): boolean {
  return a.l >= box.l - 0.5 && a.r <= box.r + 0.5 && a.t >= box.t - 0.5 && a.b <= box.b + 0.5;
}

/** B-AC-18: in every sample, no two bubbles meet, no bubble meets the ticker, and each bubble stays inside its frame. */
function noOverlaps(who: string, samples: Sample[]): string {
  let withBubble = 0;
  for (const s of samples) {
    if (s.bubbles.length === 0) continue;
    withBubble++;
    for (const [i, a] of s.bubbles.entries()) {
      for (const b of s.bubbles.slice(i + 1)) check(!meets(a.rect, b.rect), `B-AC-18: on ${who} (${s.phase}) the bubbles of lines ${a.line} and ${b.line} overlap`);
      check(!s.tickerRect || !meets(a.rect, s.tickerRect), `B-AC-18: on ${who} (${s.phase}) the bubble of line ${a.line} covers the ticker`);
      check(s.bounds && inside(a.rect, s.bounds), `B-AC-18: on ${who} (${s.phase}) the bubble of line ${a.line} crosses its frame's edge: ${JSON.stringify(a.rect)} in ${JSON.stringify(s.bounds)}`);
    }
  }
  check(withBubble >= 20, `B-AC-18: on ${who} bubbles were sampled through their lifetime, got ${withBubble} samples with one`);
  return `${withBubble} samples with a bubble, none overlapping`;
}

/**
 * RULE-9 over what this page received, in the spec's words: one bubble at a time, cut at the next; a phase change
 * ends the bubble and drops the queue. `endsPhase` marks a bubble that its phase's end cut short.
 */
function schedule(wire: Wire): { id: number; from: number; to: number; endsPhase: boolean }[] {
  const out: { id: number; from: number; to: number; endsPhase: boolean }[] = [];
  let free = -Infinity;
  let phase = -2;
  for (const line of wire.lines) {
    if (line.phase !== phase) {
      phase = line.phase;
      free = -Infinity;
    }
    const end = wire.phases[line.phase + 1]?.at ?? Infinity;
    const from = Math.max(line.at, free);
    if (from - line.at > RULE.maxWaitMs || from >= end) continue;
    const prev = out.at(-1);
    if (prev && prev.to > from) prev.to = from;
    const to = Math.min(from + RULE.maxMs, end);
    out.push({ id: line.id, from, to, endsPhase: to === end });
    free = from + RULE.minMs;
  }
  return out;
}

/** The first sample at or after `t` in which the page shows this phase, if it showed it at all after `t`. */
function firstIn(samples: Sample[], phase: string, t: number): Sample | undefined {
  return samples.find((s) => s.t >= t && s.phase === phase);
}

/**
 * By when something due at `t` in this phase must show (spec AM-11): SHOWS_WITHIN_MS after the page first shows the
 * phase, counted from no later than PHASE_SHOWN_CAP_MS after `t`. When the page never shows that phase again, the
 * first frame it paints after `t` must.
 */
function deadline(samples: Sample[], phase: string, t: number): number {
  const shown = firstIn(samples, phase, t);
  if (shown) return Math.min(Math.max(t, shown.t), t + PHASE_SHOWN_CAP_MS) + SHOWS_WITHIN_MS;
  return samples.find((s) => s.t >= t)?.t ?? t + SHOWS_WITHIN_MS;
}

/**
 * B-AC-17: every line this page received shows in its ticker within ~1 s and in the same phase; each bubble RULE-9
 * schedules shows within ~1 s of its start at the speaker's anchor (the creature when the screen draws one, else the
 * seat row, which the TV has none of); no bubble shows a line from an earlier phase.
 */
function everyLineShows(who: string, wire: Wire, samples: Sample[]): string {
  const tv = who === 'tv';
  const name = (line: Line) => wire.phases[line.phase]?.name ?? '?';
  const byPhase = new Map<string, number>();
  for (const line of wire.lines) byPhase.set(name(line), (byPhase.get(name(line)) ?? 0) + 1);
  for (const phase of NAMED_PHASES) check((byPhase.get(phase) ?? 0) > 0, `B-AC-17: ${who} received at least one line in ${phase}, by frame order; got ${JSON.stringify(Object.fromEntries(byPhase))}`);
  for (const line of wire.lines) {
    const phase = name(line);
    const seen = samples.find((s) => s.t >= line.at && s.ticker.some((l) => l.id === line.id));
    check(seen, `B-AC-17: on ${who} line ${line.id} ("${line.text}") shows in the ticker`);
    const due = deadline(samples, phase, line.at);
    timing(seen.t <= due, `B-AC-17: on ${who} line ${line.id} shown in the ticker +${seen.t - line.at} ms (deadline +${due - line.at} ms)`);
    const entry = seen.ticker.find((l) => l.id === line.id)!;
    const box = seen.tickerRect;
    check(box && box.r > box.l && box.b > box.t && inside(box, { l: 0, t: 0, r: seen.viewport.w, b: seen.viewport.h }), `B-AC-17: on ${who} the ticker that shows line ${line.id} has a size and lies inside the viewport, got ${JSON.stringify(box)} in ${seen.viewport.w}×${seen.viewport.h}`);
    check(entry.rect.r > entry.rect.l && entry.rect.b > entry.rect.t && entry.visible, `B-AC-17: on ${who} line ${line.id}'s ticker entry is drawn and visible, got ${JSON.stringify(entry.rect)} visible=${entry.visible}`);
    // Its phase may end before the page paints it again; then it shows in the next.
    if (firstIn(samples, phase, line.at)) timing(seen.phase === phase, `B-AC-17: on ${who} line ${line.id} first shown in the ticker in ${seen.phase}, said in ${phase}`);
  }

  const anchors = { creature: 0, seatRow: 0 };
  const bubblesIn = new Map<string, number>();
  const due = schedule(wire);
  check(due.some((b) => b.endsPhase), `B-AC-17: on ${who} a phase change came while a bubble was due, so its end with the phase is tested`);
  for (const b of due) {
    if (b.to - b.from < SHORTEST_LOOKED_FOR_MS) continue;
    const line = wire.lines.find((l) => l.id === b.id)!;
    const drawn = samples.some((s) => s.t >= b.from && s.t < b.to && s.speakers.includes(line.from));
    // The TV has no seat row: a speaker it doesn't draw has only the ticker there.
    if (tv && !drawn) continue;
    const shown = samples.find((s) => s.t >= b.from && s.bubbles.some((x) => x.line === b.id));
    const due = Math.min(b.to, deadline(samples, name(line), b.from));
    timing(!!shown && shown.t <= due, `B-AC-17: on ${who} line ${b.id}'s bubble shown ${shown ? `+${shown.t - b.from} ms` : 'never'} after its start (deadline +${due - b.from} ms)`);
    // Whether a bubble is due at all follows RULE-9's clock; when the page gave it none, the per-phase count below decides.
    if (!shown) continue;
    const bubble = shown.bubbles.find((x) => x.line === b.id)!;
    check(bubble.seat === line.from, `B-AC-17: on ${who} line ${b.id}'s bubble is ${line.from}'s, got ${bubble.seat}`);
    const at = shown.speakers.includes(line.from) ? line.from : 'seat-row';
    check(bubble.anchor === at, `B-AC-17: on ${who} line ${b.id}'s bubble sits at ${at === 'seat-row' ? 'the seat row' : 'its speaker'}, got ${bubble.anchor}`);
    if (at === 'seat-row' && line.from !== wire.seatId) check(shown.speaking.includes(line.from), `B-AC-17: on ${who} the seat row lights ${line.from}'s seat while its bubble shows`);
    anchors[at === 'seat-row' ? 'seatRow' : 'creature']++;
    bubblesIn.set(name(line), (bubblesIn.get(name(line)) ?? 0) + 1);
    // It ends on time, or with its phase. A sample right after the sampler itself stalled may still show it.
    if (!b.endsPhase) {
      const late = samples.find((s, i) => {
        if (s.t <= b.to + END_LAG_MS || !s.bubbles.some((x) => x.line === b.id)) return false;
        const gap = i > 0 ? s.t - samples[i - 1]!.t : 0;
        if (gap <= 2 * SAMPLE_EVERY_MS || samples[i - 1]!.t > b.to + END_LAG_MS) return true;
        console.log(`chat ${who}: line ${b.id}'s bubble seen ${s.t - b.to} ms after its end, after the sampler stalled ${gap} ms`);
        return false;
      });
      timing(!late, `B-AC-17: on ${who} line ${b.id}'s bubble ${late ? `still shown +${late.t - b.to} ms` : 'gone'} after its end (allowance +${END_LAG_MS} ms)`);
    }
  }
  const bubbles = anchors.creature + anchors.seatRow;
  // The TV draws only some speakers, so it shows only their bubbles; each phone shows every speaker's.
  if (!tv)
    for (const phase of NAMED_PHASES)
      check((bubblesIn.get(phase) ?? 0) > 0, `B-AC-17: on ${who} at least one line's bubble showed at its speaker in ${phase}; got ${JSON.stringify(Object.fromEntries(bubblesIn))}`);

  for (const s of samples)
    for (const x of s.bubbles) {
      const line = wire.lines.find((l) => l.id === x.line);
      check(line, `B-AC-17: on ${who} a bubble shows line ${x.line}, which this page never received`);
      check(s.phase === name(line), `B-AC-17: on ${who} after the phase changed, line ${x.line}'s bubble from ${name(line)} still shows in ${s.phase}`);
    }
  return `${wire.lines.length} lines (${[...byPhase].map(([p, n]) => `${p} ${n}`).join(', ')}), ${bubbles} bubbles at their speakers (${anchors.creature} at a creature, ${anchors.seatRow} at the seat row)`;
}

type Seen = { who: string; wire: Wire; samples: Sample[] };

/** The longest the page went without a sample (a phase's screen mounting, as a rule), and in which phase it ended. */
function largestStall(samples: Sample[]): string {
  let gap = 0;
  let at: Sample | undefined;
  for (let i = 1; i < samples.length; i++) {
    const g = samples[i]!.t - samples[i - 1]!.t;
    if (g > gap) [gap, at] = [g, samples[i]];
  }
  return `largest stall ${gap} ms (into ${at?.phase ?? '?'})`;
}

/** B-AC-17: every screen at the table hears the same public lines; a whisper reaches its two phones and never the TV. */
function sameLinesEverywhere(lena: Seen, kai: Seen, tv: Seen): void {
  const ids = (s: Seen) => s.wire.lines.filter((l) => !l.to).map((l) => l.id).sort((a, b) => a - b).join(',');
  check(ids(lena) === ids(kai) && ids(kai) === ids(tv), `B-AC-17: Lena, Kai and the TV received the same public lines, got lena [${ids(lena)}], kai [${ids(kai)}], tv [${ids(tv)}]`);
  const whisper = lena.wire.lines.find((l) => l.to);
  check(whisper && kai.wire.lines.some((l) => l.id === whisper.id) && !tv.wire.lines.some((l) => l.id === whisper.id), `B-AC-17: the whisper's id is on both phones and never on the TV`);
}

/** With E2E_AI_LINES=1: the page heard an AI seat in each named phase, by frame order (each line's ticker is checked above). */
function aiLinesInEveryPhase(who: string, wire: Wire): string {
  const by = new Map<string, number>();
  for (const l of wire.lines) if (wire.ai.has(l.from)) by.set(wire.phases[l.phase]?.name ?? '?', (by.get(wire.phases[l.phase]?.name ?? '?') ?? 0) + 1);
  for (const phase of NAMED_PHASES) check((by.get(phase) ?? 0) > 0, `B-AC-17 (E2E_AI_LINES): ${who} received no AI seat's line in ${phase}, by frame order; got ${JSON.stringify(Object.fromEntries(by))}`);
  return `AI lines ${[...by].map(([p, n]) => `${p} ${n}`).join(', ')}`;
}

/**
 * B-AC-17's negative and HC-2: a whisper shows on both its phones with its lock, in the ticker and its bubble, and the
 * TV never receives it and never shows it.
 */
function whispers(lena: Seen, kai: Seen, tv: Seen): void {
  const whisper = lena.wire.lines.find((l) => l.to);
  check(whisper, 'B-AC-17: Lena received her own whisper');
  check(kai.wire.lines.some((l) => l.id === whisper.id), 'B-AC-17: Kai received the whisper');
  for (const [phone, label] of [
    [lena, '🔒 TO KAI'],
    [kai, '🔒 TO YOU'],
  ] as const) {
    const line = phone.samples.flatMap((s) => s.ticker).find((l) => l.id === whisper.id);
    check(line?.text.includes('🔒'), `B-AC-17: on ${phone.who} the whisper shows in the ticker with its lock, got "${line?.text}"`);
    const bubble = phone.samples.flatMap((s) => s.bubbles).find((b) => b.line === whisper.id);
    check(bubble?.text.startsWith(label), `B-AC-17: on ${phone.who} the whisper's bubble reads "${label}", got "${bubble?.text}"`);
  }
  check(!tv.wire.lines.some((l) => l.id === whisper.id || l.text === whisper.text), 'B-AC-17: the TV never received the whisper');
  const shown = tv.samples.some((s) => s.ticker.some((l) => l.text.includes(whisper.text)) || s.bubbles.some((b) => b.text.includes(whisper.text)));
  check(!shown, 'B-AC-17: the TV never shows the whisper');
}
