/**
 * B-AC-12 (the shell's part, C15): every player screen is one frame, a stage and a guide rail, that switches on
 * its OWN width at WIDE_PX = 1100 (HC-8). Run by smoke.ts on whatever phone screen is showing; every game screen
 * uses PhoneShell, so the step holds if the phase moves on under it.
 */
import { errors as playwrightErrors, type Page } from 'playwright';
import { check, PHONE, PHONE_SMALL } from './harness';

/** Heiko's laptop. */
export const LAPTOP = { width: 1440, height: 900 };
/** The rail from WIDE_PX up, as the scaffold draws it. */
const WIDE_RAIL_PX = 400;
/** The switch: the shell's own width, in px. */
const WIDE_PX = 1100;
/** A notched phone on its side: the notch's inset on one side, the home bar's at the bottom. */
const NOTCH = { top: 0, left: 47, bottom: 21, right: 47 };

/** One read of the screen showing, in one pass, since a phase can end between two reads. */
type Frame = {
  phase: string;
  /** The shell's container: the width its switch reads. */
  box: number;
  shell: number;
  /** Shell padding: the safe-area insets. */
  pad: number;
  stage: number;
  guide: number;
  guideLeft: number;
  wide: string | null;
  /** The emote layer's right edge, when an emote shows. */
  emotesRight: number | null;
  /** Whether `now` is the rail body's first child; null when the screen gives no `now`. */
  nowFirst: boolean | null;
};

/** What the page saw of the shell before each paint: at each mount and at each resize of its container. */
type Painted = { at: 'mount' | 'resize'; box: number; guide: number; wide: string | null };

/** The rail under WIDE_PX: `--rail` in index.css, clamp(232px, 31vw, 300px) of the window's width. */
const narrowRail = (vw: number) => Math.min(300, Math.max(232, 0.31 * vw));

/**
 * In the page: records each game shell as it mounts, and, through a ResizeObserver made after the shell's own,
 * every resize of its container, so what is recorded is what the next paint shows. Kept a string: tsx would wrap
 * named functions in a helper the page lacks.
 */
const RECORD_PAINTS = `{
  if (!window.__shellPaints) {
    window.__shellPaints = [];
    const read = (shell, at) => ({
      at,
      box: shell.parentElement.getBoundingClientRect().width,
      guide: shell.querySelector('[data-testid=guide]')?.getBoundingClientRect().width ?? 0,
      wide: shell.getAttribute('data-wide'),
    });
    const watch = (shell, at) => {
      window.__shellPaints.push(read(shell, at));
      new ResizeObserver(() => {
        if (shell.isConnected) window.__shellPaints.push(read(shell, 'resize'));
      }).observe(shell.parentElement);
    };
    document.querySelectorAll('[data-testid=game-shell]').forEach((s) => watch(s, 'mount'));
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        const shells = n.matches('[data-testid=game-shell]') ? [n] : [...n.querySelectorAll('[data-testid=game-shell]')];
        shells.forEach((s) => watch(s, 'mount'));
      }
    }).observe(document, { subtree: true, childList: true });
  }
}`;

/**
 * B-AC-12: the shell fills the stage at 1440×900, 844×390 and 667×375, switching on its own width at exactly 1100 px, with
 * useWide equal to the container query in every painted frame and the emotes clear of the rail at every size.
 * Reloads the phone once, at 1440×900, so a shell mounts wide, and does that last: a reload by the only human ends the
 * phase, and the steps after this one wait on the phases that follow. Leaves the phone at 844×390 with no notch, as
 * the rest of smoke.ts expects. Returns what it measured, to log.
 */
export async function shellFillsTheStage(phone: Page, timeout = 5_000): Promise<string> {
  const log: string[] = [];
  /** What the page painted, kept on the test's side, since the reload starts a fresh record. */
  const paints: Painted[] = [];
  await phone.addInitScript(RECORD_PAINTS);
  await phone.evaluate(RECORD_PAINTS);
  await phone.locator('[data-phase] [data-testid=game-shell]').waitFor({ timeout });

  try {
    // The window turns into a laptop's: the first painted frame after it is wide.
    await phone.setViewportSize(LAPTOP);
    const wide = await read(phone);
    checkFrame(wide, `a ${LAPTOP.width} px window`, LAPTOP.width, WIDE_RAIL_PX, 'true');
    log.push(`${LAPTOP.width}: stage ${wide.stage.toFixed(1)} + rail ${wide.guide.toFixed(1)}`);

    // I-4: the emotes float left of the 400 px rail.
    await emote(phone);
    log.push(`emotes ${await emotesClear(phone, LAPTOP.width)}`);

    // I-3: the switch reads the shell's own width, not the window's, at exactly WIDE_PX.
    for (const box of [WIDE_PX - 1, WIDE_PX]) {
      const f = await read(phone, box);
      const isWide = box >= WIDE_PX;
      checkFrame(f, `a ${box} px shell in a ${LAPTOP.width} px window`, box, isWide ? WIDE_RAIL_PX : narrowRail(LAPTOP.width), isWide ? 'true' : 'false');
      log.push(`shell ${box}: rail ${f.guide.toFixed(1)} wide=${f.wide}`);
    }
    await read(phone, null);
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }

  // The phone's own size: today's layout.
  const vw = PHONE.viewport.width;
  const narrow = await read(phone);
  checkFrame(narrow, `a ${vw} px window`, vw, narrowRail(vw), 'false');
  await noPageScroll(phone, PHONE.viewport);
  log.push(`${vw}: stage ${narrow.stage.toFixed(1)} + rail ${narrow.guide.toFixed(1)}`);
  await emote(phone);
  log.push(`emotes ${await emotesClear(phone, vw)}`);

  // The small phone: the rail at its floor, the stage the rest, the emotes clear of the rail, nothing past the window.
  const sw = PHONE_SMALL.viewport.width;
  try {
    await phone.setViewportSize(PHONE_SMALL.viewport);
    const small = await read(phone);
    checkFrame(small, `a ${sw} px window`, sw, narrowRail(sw), 'false');
    await noPageScroll(phone, PHONE_SMALL.viewport);
    log.push(`${sw}: stage ${small.stage.toFixed(1)} + rail ${small.guide.toFixed(1)}`);
    await emote(phone);
    log.push(`emotes ${await emotesClear(phone, sw)}`);
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }

  // A notch on the right: the rail and the emotes move in by the inset together.
  const cdp = await phone.context().newCDPSession(phone);
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: NOTCH });
    const notched = await read(phone);
    check(Math.abs(notched.pad - NOTCH.left - NOTCH.right) < 1, `B-AC-12: the notch's insets pad the shell, got ${notched.pad} px`);
    log.push(`emotes ${await emotesClear(phone, vw, `${vw}+notch ${NOTCH.right}`)}`);
  } finally {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0 } });
    await cdp.detach();
  }

  // I-1: a shell that mounts on a laptop is wide from its first frame.
  try {
    await phone.setViewportSize(LAPTOP);
    paints.push(...((await phone.evaluate('window.__shellPaints')) as Painted[]));
    await phone.reload();
    await phone.locator('[data-phase] [data-testid=game-shell]').waitFor({ timeout });
    const mounted = await read(phone);
    checkFrame(mounted, `a ${LAPTOP.width} px window, after a reload`, LAPTOP.width, WIDE_RAIL_PX, 'true');
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }
  await read(phone);

  // I-1: every frame the page painted agrees with the switch, at each mount and each resize.
  paints.push(...((await phone.evaluate('window.__shellPaints')) as Painted[]));
  for (const p of paints) {
    const shouldBe = p.box >= WIDE_PX ? 'true' : 'false';
    check(p.wide === shouldBe, `B-AC-12 (I-1): at a ${p.at}, before the next paint, a ${p.box.toFixed(1)} px shell had useWide ${p.wide}, but the container query says ${shouldBe}`);
    check(Math.abs(p.guide - WIDE_RAIL_PX) < 1 === (shouldBe === 'true'), `B-AC-12 (I-1): at a ${p.at}, before the next paint, a ${p.box.toFixed(1)} px shell had a ${p.guide.toFixed(1)} px rail`);
  }
  const wideMounts = paints.filter((p) => p.at === 'mount' && p.box >= WIDE_PX).length;
  const resizes = paints.filter((p) => p.at === 'resize').length;
  check(wideMounts >= 1, `B-AC-12 (I-1): a shell mounted at ${LAPTOP.width} px was recorded, got ${wideMounts}`);
  // At least the seven size changes (to 1440, 1099, 1100, back to 1440, to 844, to 667, back to 844); each observer's
  // first read and the move to 1440 before the reload come on top. The frames themselves are checked one by one above.
  check(resizes >= 7, `B-AC-12 (I-1): every resize of the shell was recorded before paint, got ${resizes}`);
  log.push(`painted frames checked ${paints.length} (${wideMounts} wide mounts, ${resizes} resizes)`);

  // `now`: no screen gives one yet, so this logs that rather than pass on nothing; the render test proves its place.
  if (narrow.nowFirst !== null) check(narrow.nowFirst, 'B-AC-12: a screen that gives `now` opens its rail body with it');
  log.push(narrow.nowFirst === null ? 'now: none given yet' : 'now: first in the rail');
  return log.join(', ');
}

/**
 * The phone sends an emote over its own connection, the message its emote buttons send; every screen shows it for a
 * few seconds. Only planning has the buttons and the step spans phases, so the page's open socket is found through the
 * DevTools protocol. The server sees the phone's own seat, so this holds under the rule that a seat-only message must
 * come from the connection holding the seat.
 */
async function emote(phone: Page): Promise<void> {
  await send(phone, { t: 'emote', emote: 'Ha!' });
}

/** Sends `msg` over the page's one open socket, as the app's client would; found through the DevTools protocol. */
async function send(phone: Page, msg: object): Promise<void> {
  const cdp = await phone.context().newCDPSession(phone);
  try {
    const proto = await cdp.send('Runtime.evaluate', { expression: 'WebSocket.prototype' });
    const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId! });
    const sent = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId!,
      functionDeclaration: 'function (msg) { const open = this.filter((w) => w.readyState === 1); if (open.length === 1) open[0].send(msg); return open.length; }',
      arguments: [{ value: JSON.stringify(msg) }],
      returnByValue: true,
    });
    check(sent.result.value === 1, `the phone has one open socket to send on, found ${sent.result.value}`);
  } finally {
    await cdp.detach();
  }
}

/** I-4: the emote layer's right edge sits left of the rail's left edge. Returns the gap, to log. */
async function emotesClear(phone: Page, vw: number, label = String(vw)): Promise<string> {
  await phone.getByTestId('emotes').waitFor({ timeout: 2_000 });
  const f = await read(phone);
  check(f.emotesRight !== null, `B-AC-12 (I-4): at ${label} the emote shows on the ${f.phase} screen`);
  const gap = f.guideLeft - f.emotesRight;
  check(gap > 0, `B-AC-12 (I-4): at ${label} the emotes end ${gap.toFixed(1)} px left of the rail (inside it when negative)`);
  return `${label}: right edge ${f.emotesRight.toFixed(1)}, rail left ${f.guideLeft.toFixed(1)}, gap ${gap.toFixed(1)} px`;
}

/** The page never scrolls, either way: the shell fits the window whatever the rail holds. */
async function noPageScroll(phone: Page, size: { width: number; height: number }): Promise<void> {
  const scroll = await phone.evaluate(() => ({ x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight }));
  check(scroll.x <= size.width && scroll.y <= size.height, `B-AC-12: at ${size.width}×${size.height} the page does not scroll, got ${scroll.x}×${scroll.y}`);
}

function checkFrame(f: Frame, at: string, box: number, rail: number, wide: 'true' | 'false'): void {
  const on = `with ${at}, on ${f.phase}`;
  check(Math.abs(f.box - box) < 1, `B-AC-12: ${on} the shell's container is ${box} px, got ${f.box.toFixed(1)}`);
  check(Math.abs(f.guide - rail) < 1, `B-AC-12: ${on} the guide rail is ${rail.toFixed(1)} px wide, got ${f.guide.toFixed(1)}`);
  check(Math.abs(f.stage + f.guide + f.pad - f.shell) < 1, `B-AC-12: ${on} the stage takes the rest of the shell's ${f.shell.toFixed(1)} px, got stage ${f.stage.toFixed(1)} + rail ${f.guide.toFixed(1)}`);
  // HC-8, I-1: what sizes in code (useWide) reads what the container query does, in the first painted frame.
  check(f.wide === wide, `B-AC-12 (I-1): ${on} useWide reads ${wide}, as the container query does, in the first frame painted, got ${f.wide}`);
}

/**
 * The first frame painted after a change: waits two animation frames, so one paint has happened, then reads.
 * `box` sets the inline width of the screen holding the shell first (null clears it). Rereads once if the phase
 * changed under it, on the screen that replaced it.
 */
async function read(phone: Page, box?: number | null): Promise<Frame> {
  for (let attempt = 0; ; attempt++) {
    const f = await phone.locator('[data-phase]').evaluate(
      async (screen, width) => {
        if (width !== undefined) (screen as HTMLElement).style.width = width === null ? '' : `${width}px`;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const shell = screen.querySelector('[data-testid=game-shell]');
        if (!screen.isConnected || !shell?.parentElement) return null;
        const stage = shell.querySelector('[data-testid=stage]');
        const guide = shell.querySelector('[data-testid=guide]');
        const body = guide?.querySelector('header')?.nextElementSibling;
        const now = guide?.querySelector('[data-testid=now]');
        const cs = getComputedStyle(shell);
        return {
          phase: screen.getAttribute('data-phase') ?? '',
          box: shell.parentElement.getBoundingClientRect().width,
          shell: shell.getBoundingClientRect().width,
          pad: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
          stage: stage?.getBoundingClientRect().width ?? 0,
          guide: guide?.getBoundingClientRect().width ?? 0,
          guideLeft: guide?.getBoundingClientRect().left ?? 0,
          wide: shell.getAttribute('data-wide'),
          // Anywhere on the page: wherever it is drawn, it must clear the rail.
          emotesRight: document.querySelector('[data-testid=emotes]')?.getBoundingClientRect().right ?? null,
          nowFirst: now ? body?.firstElementChild === now : null,
        };
      },
      box,
      { timeout: 2_000 },
    ).catch((err: unknown) => {
      // A phase change can replace the screen mid-read and leave the read waiting: read the screen that replaced it.
      if (err instanceof playwrightErrors.TimeoutError) return null;
      throw err;
    });
    if (f) return f;
    check(attempt < 2, 'B-AC-12: a game screen with the shell to measure');
  }
}

/** C20 on a phone: the two phone sizes the rail is measured at. */
const RAIL_SIZES = [PHONE.viewport, PHONE_SMALL.viewport] as const;
/** The tap floor a seat in the seat row keeps (spec B's M1 puts the mute on it). */
const SEAT_MIN_PX = 32;
/** Two lines said at the table, when the screen's ticker has fewer: the phone's ticker at its full two. */
const RAIL_TALK = ['Anyone need Water? Cheap today.', 'Smithore is going to spike, I hear.'];

/** One read of the phone's rail at one size, in one pass. */
type RailRead = {
  keyBottom: number;
  ref: 'footer top' | 'rail bottom';
  refY: number;
  scrolled: number;
  ticker: number;
  seatRow: 'header' | 'under' | null;
  seatAfterKey: boolean;
  seats: { w: number; h: number }[];
};

/** Reads the phone's rail after a paint, scrolled to its top. A string: tsx would wrap named functions in a helper the page lacks. */
const READ_RAIL = (key: string) => `(async () => {
  const g = document.querySelector('[data-phase] [data-testid=guide]');
  const body = g?.querySelector('header + div');
  const el = g?.querySelector('[data-testid=${JSON.stringify(key).slice(1, -1)}]');
  if (!g || !body || !el) return null;
  const scrolled = body.scrollTop;
  body.scrollTop = 0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const footer = g.querySelector('[data-testid=actions]');
  const row = g.querySelector('[data-testid=seat-row]');
  // A key drawn with display: contents (the month end's Worth total) has no box of its own: its content's is read.
  const range = document.createRange();
  range.selectNodeContents(el);
  const box = getComputedStyle(el).display === 'contents' ? range.getBoundingClientRect() : el.getBoundingClientRect();
  return {
    keyBottom: box.bottom,
    ref: footer ? 'footer top' : 'rail bottom',
    refY: footer ? footer.getBoundingClientRect().top : body.getBoundingClientRect().bottom,
    scrolled,
    ticker: [...g.querySelectorAll('[data-testid=chat-ticker] li')].filter((li) => li.getBoundingClientRect().height > 0).length,
    seatRow: !row ? null : row.closest('header') ? 'header' : body.contains(row) ? 'under' : null,
    seatAfterKey: !!row && !!(el.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) && !el.contains(row),
    seats: [...(row?.querySelectorAll('[data-testid^=seat-]') ?? [])].map((s) => ({ w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height })),
  };
})()`;

/**
 * C20's rule on a phone (Heiko's "(c) chat at the bottom", WS6's mock 529bc7f8 ?ticker=under): below 1100 px the table
 * chat follows the rail's own content, in the same scroll, so the screen's key element shows above the footer. At
 * 844×390 and 667×375 (or `sizes`), with the seat row and a two-line ticker present: `key`, the screen's key element in
 * the rail, ends at least `clear[width]` px (default 0) above the footer's top, or the rail's bottom on a screen with no
 * footer, with the rail scrolled to its top; the seat row is in the rail's body under that content, not its header; and
 * each seat is at least SEAT_MIN_PX tall. When the ticker holds fewer than two lines the page says RAIL_TALK first,
 * over its own socket. Leaves the viewport as it found it. Returns the numbers, to log.
 */
export async function railFits(
  page: Page,
  { key, clear = {}, sizes = RAIL_SIZES }: { key: string; clear?: Partial<Record<number, number>>; sizes?: readonly { width: number; height: number }[] },
  timeout = 3_000,
): Promise<string> {
  const was = page.viewportSize();
  const guide = page.locator('[data-phase] [data-testid=guide]');
  await guide.getByTestId(key).first().waitFor({ timeout });
  const lines = () => guide.locator('[data-testid=chat-ticker] li').count();
  if ((await lines()) < 2) for (const text of RAIL_TALK) await send(page, { t: 'chat', text });
  // Waited for, not asserted here: each size's read checks the ticker by name.
  await page.waitForFunction(() => document.querySelectorAll('[data-phase] [data-testid=guide] [data-testid=chat-ticker] li').length >= 2, null, { timeout }).catch(() => undefined);
  const seen: string[] = [];
  try {
    for (const size of sizes) {
      const at = `${size.width}×${size.height}`;
      await page.setViewportSize(size);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const r = (await page.evaluate(READ_RAIL(key))) as RailRead | null;
      check(r, `C20 at ${at}: the phone's rail holds ${key}`);
      const clears = r.refY - r.keyBottom;
      const floor = clear[size.width] ?? 0;
      const seats = r.seats.map((s) => `${s.w.toFixed(1)}×${s.h.toFixed(1)}`).join(' ');
      seen.push(`${at}: ${key} ${r.keyBottom.toFixed(1)} vs ${r.ref} ${r.refY.toFixed(1)}, ${clears >= 0 ? '+' : '−'}${Math.abs(clears).toFixed(1)}; ticker ${r.ticker}; seat row ${r.seatRow}; seats ${seats}`);
      check(r.ticker === 2, `C20 at ${at}: the ticker shows its two lines, got ${r.ticker}`);
      check(clears >= floor - 0.01, `C20 at ${at}: ${key} ends at least ${floor} px above the ${r.ref}, got ${key} at ${r.keyBottom.toFixed(1)} against ${r.refY.toFixed(1)} (${clears.toFixed(1)} px)`);
      check(r.seatRow === 'under' && r.seatAfterKey, `C20 at ${at}: the seat row is in the rail's body under ${key}, got ${r.seatRow}${r.seatAfterKey ? '' : ', not after it'}`);
      check(r.seats.length > 0 && r.seats.every((s) => s.h >= SEAT_MIN_PX - 0.01), `C20 at ${at}: each seat in the seat row is at least ${SEAT_MIN_PX} px tall, got ${seats}`);
    }
  } finally {
    if (was) await page.setViewportSize(was);
  }
  return seen.join(' | ');
}
