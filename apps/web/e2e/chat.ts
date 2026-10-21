/**
 * B-AC-17 and B-AC-18: live table chat, in a game of its own with an AI seat, two phones (1440×900 and 844×390) and
 * the TV. The phones speak over their own sockets in the land grant, development and the auction; every line each
 * page received is read off its wire and must show in that page's ticker, and as a bubble at its speaker when RULE-9
 * gives it one. Run with `pnpm --filter @mule/web e2e`.
 */
import type { Page } from 'playwright';
import { check, launch, PHONE, startServer, TV } from './harness';

const LAPTOP = { width: 1440, height: 900 };
/** RULE-9, from the spec's words: the test's own reading of it, so the page is checked against the rule, not itself. */
const RULE = { minMs: 2_000, maxMs: 4_500, maxWaitMs: 4_000 };
/** "Within ~1 s" of its receipt, a line shows in the ticker; a bubble shows within this of its scheduled start. */
const SHOWS_WITHIN_MS = 1_000;
/** Render lag after a phase change, during which the last frame of the old phase may still be sampled. */
const PHASE_LAG_MS = 150;
/** A scheduled bubble shorter than this is not looked for: the sampler might fall between its frames. */
const SHORTEST_LOOKED_FOR_MS = 300;
/** Long enough for every bubble of a burst to have shown and gone. */
const BURST_SETTLES_MS = 7_000;
const BETWEEN_LINES_MS = 2_600;
const PHASE_TIMEOUT_MS = 90_000;

type Wire = { lines: { id: number; from: string; to?: string; text: string; at: number }[]; phases: { key: string; phase: string; at: number }[]; seatId: string | null };
type Rect = { l: number; t: number; r: number; b: number };
type Bubble = { seat: string; line: number; text: string; anchor: string | null; rect: Rect };
type Sample = { t: number; phase: string | null; ticker: { id: number; text: string }[]; tickerRect: Rect | null; bubbles: Bubble[]; speakers: string[]; speaking: string[]; bounds: Rect | null };

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
        ticker: [...document.querySelectorAll('[data-testid=chat-ticker] [data-testid^=chat-line-]')].map((li) => ({ id: Number(li.getAttribute('data-testid').slice(10)), text: li.textContent })),
        tickerRect: rect(document.querySelector('[data-testid=chat-ticker]')),
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
    }, 50);
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
  const wires = new Map<Page, Wire>([lena, kai, tv].map((p) => [p, listen(p)]));

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
  for (const p of [lena, kai]) await p.getByRole('button', { name: "I'm ready" }).click({ timeout: 5_000 });

  const kaiId = wires.get(kai)!.seatId!;
  const phase = (p: Page, name: string) => p.locator(`[data-phase=${name}]`).first().waitFor({ timeout: PHASE_TIMEOUT_MS });

  // The land grant: a line, a whisper from Lena to Kai, then two lines within a second.
  await Promise.all([phase(lena, 'landGrant'), phase(kai, 'landGrant'), phase(tv, 'landGrant')]);
  await say(lena, 'Anyone need Water? Cheap today.');
  await lena.waitForTimeout(BETWEEN_LINES_MS);
  await say(lena, 'Psst: vote with me on the land tax?', kaiId);
  await lena.waitForTimeout(BETWEEN_LINES_MS);
  await burst(lena, kai, 'grant');
  // Both claim, which ends the grant while the last bubble may still show.
  await Promise.all([claimOne(lena), claimOne(kai)]);

  // Development: two lines within a second, then a line said just before both go to the pub, so the phase change
  // ends its bubble.
  await Promise.all([phase(lena, 'development'), phase(kai, 'development'), phase(tv, 'development')]);
  await burst(lena, kai, 'dev');
  await say(kai, 'Off to the pub, see you at the auction.');
  await lena.getByTestId('chat-ticker').getByText('Off to the pub').waitFor({ timeout: SHOWS_WITHIN_MS }).catch(() => undefined);
  for (const p of [lena, kai]) await p.locator('[data-phase=development]').getByRole('button', { name: 'Go to the pub and end your turn' }).click({ timeout: 5_000 });

  // The auction: two lines within a second while the TV draws the walk.
  await Promise.all([phase(lena, 'auction'), phase(kai, 'auction')]);
  await tv.locator('[data-phase=auction] [data-testid=walk-board]').waitFor({ timeout: PHASE_TIMEOUT_MS });
  await burst(lena, kai, 'auction');

  const screens = [
    { who: 'lena', p: lena },
    { who: 'kai', p: kai },
    { who: 'tv', p: tv },
  ];
  const seen = await Promise.all(screens.map(async ({ who, p }) => ({ who, wire: wires.get(p)!, samples: (await p.evaluate('window.__chatSamples')) as Sample[] })));
  const report = seen.map(({ who, samples }) => `${who}: ${noOverlaps(who, samples)}`);
  seen.forEach(({ who, wire, samples }, i) => (report[i] += `; ${everyLineShows(who, wire, samples)}`));
  whispers(seen[0]!, seen[1]!, seen[2]!);
  for (const r of report) console.log(`chat ${r}`);
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
  return p;
}

/** What this page's socket received: every chat line and every change of phase, each with the time it arrived. */
function listen(p: Page): Wire {
  const wire: Wire = { lines: [], phases: [], seatId: null };
  p.on('websocket', (ws) =>
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const msg = JSON.parse(payload) as { t: string; message?: Wire['lines'][number]; seatId?: string | null; view?: { game?: { month: number; phase: string } | null } };
      const at = Date.now();
      if (msg.t === 'welcome') wire.seatId = msg.seatId ?? null;
      if (msg.t === 'chat' && msg.message) wire.lines.push({ ...msg.message, at });
      const game = msg.t === 'view' ? msg.view?.game : null;
      if (!game) return;
      const key = `${game.month}-${game.phase}`;
      if (wire.phases.at(-1)?.key !== key) wire.phases.push({ key, phase: game.phase, at });
    }),
  );
  return wire;
}

/** Sends a chat line from this phone over its own open socket, as the app's client does. */
async function say(p: Page, text: string, to?: string): Promise<void> {
  const cdp = await p.context().newCDPSession(p);
  try {
    const proto = await cdp.send('Runtime.evaluate', { expression: 'WebSocket.prototype' });
    const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId! });
    const sent = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId!,
      functionDeclaration: 'function (msg) { const open = this.filter((w) => w.readyState === 1); if (open.length === 1) open[0].send(msg); return open.length; }',
      arguments: [{ value: JSON.stringify({ t: 'chat', text, ...(to ? { to } : {}) }) }],
      returnByValue: true,
    });
    check(sent.result.value === 1, `the phone has one open socket to chat on, found ${sent.result.value}`);
  } finally {
    await cdp.detach();
  }
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
  const deadline = Date.now() + PHASE_TIMEOUT_MS;
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

const meets = (a: Rect, b: Rect) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const inside = (a: Rect, box: Rect) => a.l >= box.l - 0.5 && a.r <= box.r + 0.5 && a.t >= box.t - 0.5 && a.b <= box.b + 0.5;

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

/** RULE-9 over what this page received, in the spec's words: one bubble at a time, cut at the next, ended by a phase change. */
function schedule(wire: Wire): { id: number; from: number; to: number }[] {
  const out: { id: number; from: number; to: number }[] = [];
  let free = -Infinity;
  let phase: string | null = null;
  for (const line of wire.lines) {
    const key = phaseAt(wire, line.at);
    if (key !== phase) {
      phase = key;
      free = -Infinity;
    }
    const from = Math.max(line.at, free);
    if (from - line.at > RULE.maxWaitMs) continue;
    const prev = out.at(-1);
    if (prev && prev.to > from) prev.to = from;
    out.push({ id: line.id, from, to: from + RULE.maxMs });
    free = from + RULE.minMs;
  }
  for (const b of out) {
    const change = wire.phases.find((p) => p.at > b.from);
    if (change && change.at < b.to) b.to = change.at;
  }
  return out;
}

function phaseAt(wire: Wire, t: number): string {
  return wire.phases.filter((p) => p.at <= t).at(-1)?.key ?? '';
}

/**
 * B-AC-17: every line this page received shows in its ticker within ~1 s and in the same phase; each bubble RULE-9
 * schedules shows within ~1 s of its start at the speaker's anchor (the creature when the screen draws one, else the
 * seat row, which the TV has none of); no bubble shows a line from an earlier phase.
 */
function everyLineShows(who: string, wire: Wire, samples: Sample[]): string {
  const tv = who === 'tv';
  check(wire.lines.length >= 7, `B-AC-17: ${who} received the phones' lines, got ${wire.lines.length}`);
  const byPhase = new Map<string, number>();
  for (const line of wire.lines) {
    const phase = wire.phases.find((p) => p.key === phaseAt(wire, line.at))?.phase ?? '?';
    byPhase.set(phase, (byPhase.get(phase) ?? 0) + 1);
    const seen = samples.find((s) => s.t >= line.at && s.ticker.some((l) => l.id === line.id));
    check(seen && seen.t - line.at <= SHOWS_WITHIN_MS, `B-AC-17: on ${who} line ${line.id} ("${line.text}") shows in the ticker within ${SHOWS_WITHIN_MS} ms, ${seen ? `took ${seen.t - line.at} ms` : 'never'}`);
    check(seen.phase === phase, `B-AC-17: on ${who} line ${line.id} shows in the ticker in the phase it was said in, ${phase}, not ${seen.phase}`);
  }

  let bubbles = 0;
  for (const b of schedule(wire)) {
    if (b.to - b.from < SHORTEST_LOOKED_FOR_MS) continue;
    const line = wire.lines.find((l) => l.id === b.id)!;
    const during = samples.filter((s) => s.t >= b.from && s.t < Math.min(b.to, b.from + SHOWS_WITHIN_MS));
    const drawn = during.some((s) => s.speakers.includes(line.from));
    // The TV has no seat row: a speaker it doesn't draw has only the ticker there.
    if (tv && !drawn) continue;
    const shown = during.find((s) => s.bubbles.some((x) => x.line === b.id));
    check(shown, `B-AC-17: on ${who} line ${b.id} ("${line.text}") gets its bubble within ${SHOWS_WITHIN_MS} ms of ${new Date(b.from).toISOString()}`);
    const bubble = shown.bubbles.find((x) => x.line === b.id)!;
    check(bubble.seat === line.from, `B-AC-17: on ${who} line ${b.id}'s bubble is ${line.from}'s, got ${bubble.seat}`);
    const at = shown.speakers.includes(line.from) ? line.from : 'seat-row';
    check(bubble.anchor === at, `B-AC-17: on ${who} line ${b.id}'s bubble sits at ${at === 'seat-row' ? 'the seat row' : 'its speaker'}, got ${bubble.anchor}`);
    if (at === 'seat-row' && line.from !== wire.seatId) check(shown.speaking.includes(line.from), `B-AC-17: on ${who} the seat row lights ${line.from}'s seat while its bubble shows`);
    bubbles++;
  }
  check(bubbles >= 4, `B-AC-17: on ${who} bubbles showed in each phase, got ${bubbles}`);

  for (const s of samples)
    for (const x of s.bubbles) {
      const line = wire.lines.find((l) => l.id === x.line);
      check(line, `B-AC-17: on ${who} a bubble shows line ${x.line}, which this page never received`);
      check(phaseAt(wire, line.at) === phaseAt(wire, s.t - PHASE_LAG_MS), `B-AC-17: on ${who} after the phase changed, line ${x.line}'s bubble from the phase before still shows`);
    }
  return `${wire.lines.length} lines (${[...byPhase].map(([p, n]) => `${p} ${n}`).join(', ')}), ${bubbles} bubbles at their speakers`;
}

type Seen = { who: string; wire: Wire; samples: Sample[] };

/**
 * B-AC-17's negative and HC-2: a whisper shows on both its phones with its lock, in the ticker and its bubble, and the
 * TV never receives it and never shows it.
 */
function whispers(lena: Seen, kai: Seen, tv: Seen): void {
  const whisper = lena.wire.lines.find((l) => l.to);
  check(whisper, 'B-AC-17: Lena received her own whisper');
  check(kai.wire.lines.some((l) => l.id === whisper.id), 'B-AC-17: Kai received the whisper');
  for (const phone of [lena, kai]) {
    const line = phone.samples.flatMap((s) => s.ticker).find((l) => l.id === whisper.id);
    check(line?.text.includes('🔒'), `B-AC-17: on ${phone.who} the whisper shows in the ticker with its lock, got "${line?.text}"`);
    const bubble = phone.samples.flatMap((s) => s.bubbles).find((b) => b.line === whisper.id);
    check(bubble?.text.includes('🔒'), `B-AC-17: on ${phone.who} the whisper's bubble carries its lock, got "${bubble?.text}"`);
  }
  check(!tv.wire.lines.some((l) => l.id === whisper.id || l.text === whisper.text), 'B-AC-17: the TV never received the whisper');
  const shown = tv.samples.some((s) => s.ticker.some((l) => l.text.includes(whisper.text)) || s.bubbles.some((b) => b.text.includes(whisper.text)));
  check(!shown, 'B-AC-17: the TV never shows the whisper');
}
