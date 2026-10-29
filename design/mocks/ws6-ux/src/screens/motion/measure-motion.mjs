// The phone cost of characters in motion, measured, not claimed. Headless Chromium at 844 × 390 with the CPU throttled
// ×4 (CDP Emulation.setCPUThrottlingRate), on motion.html's bench (#bench: six colonists and six MULEs on the map, the
// positions stepped at 20 Hz). For each variant (A, B) and scene (all walking, all idle, walking under reduced motion,
// walking without the MULEs), over a measuring window:
//
//   fps            requestAnimationFrame callbacks per second, and the worst gap between two of them
//   busy           main-thread busy share: Performance.getMetrics TaskDuration delta / wall time
//   layouts/s      LayoutCount delta / s;  styles/s: RecalcStyleCount delta / s
//   paints/s       Paint trace events per second (devtools.timeline), from a separate traced window so tracing's own
//                  cost stays out of the numbers above; and which elements those paints were for (nearest data-testid)
//   errors         console errors and page errors over the whole run of the scene, load included
//
// Usage (the mock's dev server must already run; run from the workspace so `playwright` resolves):
//
//   node src/screens/motion/measure-motion.mjs [http://localhost:5316/motion.html] [--seconds=6] [--json=<file>] [--control]
//
// --control is the positive control: it adds two deliberately bad scenes to the run, each planted on the clean
// "A · colonists walking, no MULEs" scene: (1) a per-frame JavaScript animation that writes every walker's `top` and
// burns 6 ms a frame, and (2) a CSS animation of `top` (a layout property) on every walker. Each must come out flagged
// LAYOUT where its base is not, with a higher busy share; when either does not, the script exits 1, because then the
// checks are not checking anything.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5316/motion.html';
const seconds = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 6);
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
const control = args.includes('--control');
const TRACE_SECONDS = 3;
const WARMUP_MS = 1500;
const THROTTLE = 4;

/** The checks: what a phone can't afford. */
const LIMITS = { fps: 50, worstMs: 50, busy: 0.5, layoutsPerSecond: 30 };

const SCENES = [
  { id: 'A-walk', hash: '#bench.a', label: 'A · 6 colonists + 6 MULEs walking' },
  { id: 'A-idle', hash: '#bench.a.idle', label: 'A · all idle' },
  { id: 'A-reduced', hash: '#bench.a', reduced: true, label: 'A · walking, reduced motion' },
  { id: 'A-nomule', hash: '#bench.a.nomule', label: 'A · 6 colonists walking, no MULEs' },
  { id: 'B-walk', hash: '#bench.b', label: 'B · 6 colonists + 6 MULEs walking' },
  { id: 'B-idle', hash: '#bench.b.idle', label: 'B · all idle' },
  { id: 'B-reduced', hash: '#bench.b', reduced: true, label: 'B · walking, reduced motion' },
  { id: 'B-nomule', hash: '#bench.b.nomule', label: 'B · 6 colonists walking, no MULEs' },
];
if (control) {
  SCENES.push(
    { id: 'CTL-js', hash: '#bench.a.nomule', inject: 'js', control: true, base: 'A-nomule', label: 'CONTROL · A no MULEs + per-frame JS on `top`' },
    { id: 'CTL-top', hash: '#bench.a.nomule', inject: 'top', control: true, base: 'A-nomule', label: 'CONTROL · A no MULEs + CSS `top` animation' },
  );
}

/** The bad patterns the controls plant, after the page is up. */
const INJECT = {
  js: () => {
    const walkers = [...document.querySelectorAll('[data-testid^="colonist-"] > div')];
    walkers.forEach((w) => (w.style.position = 'relative'));
    const tick = (t) => {
      const end = performance.now() + 6;
      while (performance.now() < end) {} // a deliberately expensive frame
      walkers.forEach((w, i) => (w.style.top = `${Math.sin(t / 120 + i) * 4}px`));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  top: () => {
    const s = document.createElement('style');
    s.textContent = '@keyframes ctl-top{from{top:0}to{top:6px}} [data-testid^="colonist-"]>div{position:relative;animation:ctl-top .25s ease-in-out infinite alternate}';
    document.head.appendChild(s);
  },
};

const browser = await chromium.launch();
const rows = [];
for (const scene of SCENES) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: scene.reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await cdp.send('Performance.enable');
  await page.goto(`${url}${scene.hash}`);
  await page.waitForSelector('[data-testid="bench"] [data-testid^="colonist-"]');
  if (scene.inject) await page.evaluate(INJECT[scene.inject]);
  await page.waitForTimeout(WARMUP_MS);

  // Window 1: frames and main-thread metrics, untraced.
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => {
    window.__frames = [];
    const loop = (t) => {
      window.__frames.push(t);
      window.__raf = requestAnimationFrame(loop);
    };
    window.__raf = requestAnimationFrame(loop);
  });
  const m0 = await metric();
  const w0 = Date.now();
  await page.waitForTimeout(seconds * 1000);
  const m1 = await metric();
  const wall = (Date.now() - w0) / 1000;
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__frames;
  });
  let worst = 0;
  for (let i = 1; i < frames.length; i++) worst = Math.max(worst, frames[i] - frames[i - 1]);
  const span = (frames.at(-1) - frames[0]) / 1000;
  const fps = (frames.length - 1) / span;
  const busy = (m1.TaskDuration - m0.TaskDuration) / wall;
  const layouts = (m1.LayoutCount - m0.LayoutCount) / wall;
  const styles = (m1.RecalcStyleCount - m0.RecalcStyleCount) / wall;

  // Window 2: a trace, for the paints and what they were for.
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  await page.waitForTimeout(TRACE_SECONDS * 1000);
  const trace = JSON.parse((await browser.stopTracing()).toString('utf8'));
  const events = trace.traceEvents ?? trace;
  const paints = events.filter((e) => e.name === 'Paint' && e.ph !== 'E');
  const byNode = new Map();
  for (const p of paints) {
    const id = p.args?.data?.nodeId;
    byNode.set(id, (byNode.get(id) ?? 0) + 1);
  }
  await cdp.send('DOM.getDocument', { depth: 0 });
  const painted = [];
  for (const [id, n] of [...byNode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    let what = `node ${id}`;
    if (id) {
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: id });
        const { result } = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          returnByValue: true,
          functionDeclaration: `function () {
            const e = this.nodeType === 1 ? this : this.parentElement;
            if (!e) return '#document';
            const t = e.closest('[data-testid]');
            const cls = String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '').split(' ')[0];
            return (t ? t.dataset.testid : '(no testid)') + ' > ' + e.tagName.toLowerCase() + (cls ? '.' + cls : '');
          }`,
        });
        what = result.value;
      } catch {
        what = `node ${id} (gone)`;
      }
    }
    painted.push({ what, perSecond: +(n / TRACE_SECONDS).toFixed(1) });
  }
  const paintsPerSecond = paints.length / TRACE_SECONDS;
  await page.waitForTimeout(200);

  const flags = [];
  if (fps < LIMITS.fps || worst > LIMITS.worstMs) flags.push('JANK');
  if (busy > LIMITS.busy) flags.push('BUSY');
  if (layouts > LIMITS.layoutsPerSecond) flags.push('LAYOUT');
  if (paintsPerSecond > fps * 0.5) flags.push('REPAINT');
  if (errors.length) flags.push('ERRORS');
  rows.push({ ...scene, fps: +fps.toFixed(1), worstMs: +worst.toFixed(1), busy: +(busy * 100).toFixed(1), layoutsPerSecond: +layouts.toFixed(1), stylesPerSecond: +styles.toFixed(1), paintsPerSecond: +paintsPerSecond.toFixed(1), errors: errors.length, errorText: errors.slice(0, 3), painted, flags, frames: frames.length });
  await context.close();
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`\nmotion.html bench · 844 × 390 · CPU ×${THROTTLE} · ${seconds} s measured (+${TRACE_SECONDS} s traced) per scene · headless Chromium\n`);
console.log(pad('scene', 52) + lpad('fps', 6) + lpad('worst ms', 10) + lpad('busy %', 8) + lpad('layouts/s', 11) + lpad('styles/s', 10) + lpad('paints/s', 10) + lpad('errors', 8) + '  flags');
for (const r of rows) console.log(pad(r.label, 52) + lpad(r.fps, 6) + lpad(r.worstMs, 10) + lpad(r.busy, 8) + lpad(r.layoutsPerSecond, 11) + lpad(r.stylesPerSecond, 10) + lpad(r.paintsPerSecond, 10) + lpad(r.errors, 8) + '  ' + (r.flags.join(' ') || 'ok'));
console.log('\nwhat repainted (top paint targets per scene, paints/s):');
for (const r of rows) console.log(`  ${r.id}: ${r.painted.map((p) => `${p.what} ${p.perSecond}`).join(' | ') || 'nothing'}`);
for (const r of rows.filter((x) => x.errors)) console.log(`  errors in ${r.id}: ${r.errorText.join(' / ')}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));

if (control) {
  const missed = rows.filter((r) => {
    if (!r.control) return false;
    const base = rows.find((b) => b.id === r.base);
    return !(base && r.flags.includes('LAYOUT') && !base.flags.includes('LAYOUT') && r.busy > base.busy);
  });
  for (const r of rows.filter((x) => x.control)) {
    const b = rows.find((x) => x.id === r.base);
    console.log(`  ${r.id} vs ${r.base}: layouts/s ${b.layoutsPerSecond} → ${r.layoutsPerSecond}, busy ${b.busy}% → ${r.busy}%, paints/s ${b.paintsPerSecond} → ${r.paintsPerSecond}, flags [${b.flags.join(' ') || 'ok'}] → [${r.flags.join(' ')}]`);
  }
  if (missed.length) {
    console.error(`\nPOSITIVE CONTROL FAILED: not flagged against its base: ${missed.map((r) => r.id).join(', ')}`);
    process.exit(1);
  }
  console.log('\npositive control: both planted scenes flagged LAYOUT where their clean base is not, and busier.');
}
