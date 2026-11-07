// The land grant footer's measurement: for each state on grant.html, in each phone frame (844 × 390, 667 × 375), the
// rail window's height, CLAIM's size, that nothing leaves the frame and that "Waiting for" is one line; and that the
// whole load logs no console error. Headless; the page's dev server must already run.
//
//   node design/mocks/ws6-ux/src/screens/grant/measure.mjs [http://localhost:5316/grant.html] [--only=today]
//
// Run from design/mocks/ws6-ux (or anywhere its node_modules resolve playwright). Exits 1 when a check fails.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5316/grant.html';
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const STATES = ['today', 'compact', 'compact-ready', 'compact-done', 'compact-alone'].filter((s) => !only || s === only);
const TARGET = 115; // "about 120": the ruling's target, with 5 px of tolerance

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1400 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const rows = [];
for (const state of STATES) {
  await page.goto(`${url}#${state}`);
  await page.waitForSelector(`[data-state="${state}"] [data-testid="phone-frame"] [data-testid="rail-window"]`);
  await page.waitForTimeout(300);
  const frames = await page.$$eval(`[data-state="${state}"] [data-testid="phone-frame"]`, (els) =>
    els.map((f) => {
      const box = (el) => (el ? el.getBoundingClientRect() : null);
      const q = (id) => f.querySelector(`[data-testid="${id}"]`);
      const fr = box(f);
      const win = box(q('rail-window'));
      const claim = box(q('claim'));
      const header = box(q('rail-header'));
      const actions = box(q('actions'));
      const guide = box(q('guide'));
      const wait = q('waiting-for');
      // Everything inside the frame that matters, and whether any of it pokes out of the frame or the rail.
      const out = [];
      for (const id of ['claim', 'ready', 'you-are-ready', 'waiting-for', 'actions', 'rail-header', 'rail-window', 'guide']) {
        const r = box(q(id));
        if (!r) continue;
        if (r.left < fr.left - 0.5 || r.right > fr.right + 0.5 || r.top < fr.top - 0.5 || r.bottom > fr.bottom + 0.5) out.push(`${id} leaves the frame`);
        if (guide && id !== 'guide' && (r.left < guide.left - 0.5 || r.right > guide.right + 0.5)) out.push(`${id} leaves the rail`);
      }
      // A label that does not fit its own box: text spilling out of CLAIM, Ready or "You're done with land".
      for (const id of ['claim', 'ready', 'you-are-ready']) {
        const el = q(id);
        if (el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) out.push(`${id}'s text overflows its box`);
      }
      const act = q('actions');
      if (act && act.scrollWidth > act.clientWidth + 1) out.push('the footer scrolls sideways');
      // One line: the text's line boxes all share one top, and its height is one line's.
      // One line: its height over its own line height (today's WaitingFor wraps: 44 px of 20 px lines is 2).
      const lines = wait ? Math.round(wait.getBoundingClientRect().height / parseFloat(getComputedStyle(wait).lineHeight)) : 0;
      // A truncated name: the line holds it whole only when nothing is cut.
      const cut = wait ? [...wait.querySelectorAll('.truncate')].filter((n) => n.scrollWidth > n.clientWidth + 0.5).map((n) => n.textContent) : [];
      return {
        phone: f.dataset.phone,
        frame: `${Math.round(fr.width)}×${Math.round(fr.height)}`,
        rail: +(guide?.width ?? 0).toFixed(1),
        header: +(header?.height ?? 0).toFixed(1),
        window: +(win?.height ?? 0).toFixed(1),
        footer: +(actions?.height ?? 0).toFixed(1),
        claim: claim ? `${claim.width.toFixed(1)}×${claim.height.toFixed(1)}` : '-',
        claimW: claim?.width ?? 0,
        claimH: claim?.height ?? 0,
        waitingLines: wait ? lines : 0,
        waitingH: wait ? +wait.getBoundingClientRect().height.toFixed(1) : 0,
        cut,
        waitingText: wait ? wait.getAttribute('aria-label') ?? wait.textContent : '',
        out,
      };
    }),
  );
  for (const f of frames) {
    const problems = [...f.out];
    if (f.window < TARGET) problems.push(`window ${f.window} < ${TARGET}`);
    if (f.claimH < 56) problems.push(`CLAIM ${f.claimH} px tall < 56`);
    if (f.claimW < f.rail / 2) problems.push(`CLAIM ${f.claimW.toFixed(1)} px wide < half the rail (${(f.rail / 2).toFixed(1)})`);
    if (f.waitingLines > 1) problems.push(`Waiting for on ${f.waitingLines} lines`);
    // Today is the positive control, checked by the same rules on every run: it must come out red, at about 20 px.
    // If it ever reads green, the measurement has stopped measuring.
    const verdict = state === 'today' ? (f.window <= 25 && problems.length > 0 ? 'red, as expected (control): ' : 'CONTROL DID NOT BITE: ') : '';
    if (state === 'today' ? verdict.startsWith('CONTROL') : problems.length > 0) failed = true;
    rows.push({ state, phone: f.phone, rail: f.rail, header: f.header, window: f.window, footer: f.footer, claim: f.claim, waiting: f.waitingLines ? `${f.waitingLines} line, ${f.waitingH} px${f.cut.length ? `, cut: ${f.cut.join(', ')}` : ''}` : 'none', result: verdict + (problems.join('; ') || 'ok') });
  }
}
console.table(rows);
console.log(`console errors over the whole load: ${errors.length}`);
for (const e of errors) console.log('  ', e);
if (errors.length) failed = true;
await browser.close();
process.exit(failed ? 1 : 0);
