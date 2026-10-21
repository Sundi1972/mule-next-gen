/**
 * B-AC-12 (the shell's part, C15): every player screen is one frame, a stage and a guide rail, that switches on
 * its OWN width at WIDE_PX = 1100 (HC-8). Run by smoke.ts on whatever phone screen is showing; every game screen uses
 * PhoneShell, so the step holds even if the phase moves on under it.
 */
import { errors as playwrightErrors, type Page } from 'playwright';
import { check, PHONE } from './harness';

/** Heiko's laptop. */
export const LAPTOP = { width: 1440, height: 900 };
/** The rail from WIDE_PX up, as the scaffold draws it. */
const WIDE_RAIL_PX = 400;
/** How long the shell may take to settle after the window changes size: CSS at once, useWide after a ResizeObserver and a render. */
const SETTLE_MS = 3_000;

/** One pass over the screen showing: the frame's parts, measured together. */
type Frame = {
  phase: string | null;
  shell: number;
  stage: number;
  guide: number;
  wide: string | null;
  /** The first thing in the rail's scrolling body is `now`, when the screen gave one. */
  nowFirst: boolean | null;
};

/** The rail under WIDE_PX: `--rail` in index.css, clamp(232px, 31vw, 300px). */
const narrowRail = (vw: number) => Math.min(300, Math.max(232, 0.31 * vw));

/**
 * B-AC-12: the shell fills the stage and opens its rail with Now, at 1440×900 and 844×390.
 * Leaves the phone at its own size, 844×390, as the rest of smoke.ts expects. Returns what it measured, to log.
 */
export async function shellFillsTheStage(phone: Page, timeout = 5_000): Promise<string> {
  await phone.locator('[data-phase] [data-testid=game-shell]').waitFor({ timeout });
  let wide: Frame;
  try {
    await phone.setViewportSize(LAPTOP);
    wide = await settle(phone, (f) => Math.abs(f.guide - WIDE_RAIL_PX) < 1 && f.wide === 'true');
  } finally {
    await phone.setViewportSize(PHONE.viewport);
  }
  checkFrame(wide, LAPTOP.width, WIDE_RAIL_PX, 'true');
  const rail = narrowRail(PHONE.viewport.width);
  const narrow = await settle(phone, (f) => Math.abs(f.guide - rail) < 1 && f.wide === 'false');
  checkFrame(narrow, PHONE.viewport.width, rail, 'false');
  return [wide, narrow].map((f) => `${f.shell.toFixed(0)} px: stage ${f.stage.toFixed(1)} + rail ${f.guide.toFixed(1)} on ${f.phase}`).join(', ');
}

function checkFrame(f: Frame, vw: number, rail: number, wide: 'true' | 'false'): void {
  const at = `at ${vw} px wide, on ${f.phase}`;
  check(Math.abs(f.guide - rail) < 1, `B-AC-12: ${at} the guide rail is ${rail.toFixed(1)} px wide, got ${f.guide.toFixed(1)}`);
  check(Math.abs(f.stage + f.guide - f.shell) < 1, `B-AC-12: ${at} the stage takes the rest of the shell's ${f.shell.toFixed(1)} px, got stage ${f.stage.toFixed(1)} + rail ${f.guide.toFixed(1)}`);
  check(f.shell >= vw - 1, `B-AC-12: ${at} the shell fills the window's width, got ${f.shell.toFixed(1)}`);
  // HC-8: one switch. What sizes in code (useWide) flips exactly where the container query does.
  check(f.wide === wide, `B-AC-12 (HC-8): ${at} useWide reads ${wide}, as the container query does, got ${f.wide}`);
  check(f.nowFirst !== false, `B-AC-12: ${at} a screen that gives \`now\` opens its rail with it`);
}

/** Measures the frame until `done` holds or SETTLE_MS passes, then returns the last measurement either way. */
async function settle(phone: Page, done: (f: Frame) => boolean): Promise<Frame> {
  const deadline = Date.now() + SETTLE_MS;
  let last: Frame | null = null;
  for (;;) {
    try {
      last = await measure(phone);
    } catch (err) {
      // The phase changed under the read; measure the next screen.
      if (!(err instanceof playwrightErrors.TimeoutError)) throw err;
    }
    if ((last && done(last)) || Date.now() > deadline) break;
    await phone.waitForTimeout(50);
  }
  check(last, 'B-AC-12: a game screen with the shell to measure');
  return last;
}

/** Reads the parts in one pass, since a phase can end between two reads. Kept free of named functions: tsx would wrap them in a helper the page lacks. */
function measure(phone: Page): Promise<Frame> {
  return phone.locator('[data-phase]').evaluate(
    (screen) => {
      const shell = screen.querySelector('[data-testid=game-shell]');
      const stage = shell?.querySelector('[data-testid=stage]');
      const guide = shell?.querySelector('[data-testid=guide]');
      const now = guide?.querySelector('[data-testid=now]');
      return {
        phase: screen.getAttribute('data-phase'),
        shell: shell?.getBoundingClientRect().width ?? 0,
        stage: stage?.getBoundingClientRect().width ?? 0,
        guide: guide?.getBoundingClientRect().width ?? 0,
        wide: shell?.getAttribute('data-wide') ?? null,
        nowFirst: now ? now.parentElement?.firstElementChild === now : null,
      };
    },
    undefined,
    { timeout: 1_000 },
  );
}
