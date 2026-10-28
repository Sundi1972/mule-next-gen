// Muting an AI's measurement: for each state on mute.html, in each phone frame (844 × 390, 667 × 375), every mute
// control's tap size (at least 32 × 32), that nothing leaves the frame or scrolls sideways, and that the whole load
// logs no console error. Headless; the page's dev server must already run.
//
//   node design/mocks/ws6-ux/src/screens/mute/measure.mjs [http://localhost:5316/mute.html] [--shots=<dir>] [--control]
//
// --control is the positive control: it shrinks The Baron's seat switch to 24 px, widens the seat row past the rail
// and logs one console error, and the run must come out red on all three. Exits 1 when a check fails.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5316/mute.html';
const shots = args.find((a) => a.startsWith('--shots='))?.slice(8);
const control = args.includes('--control');
const STATES = ['none', 'muting', 'muted', 'alt', 'unmute'];
const MIN = 32;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1400 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const rows = [];
for (const state of STATES) {
  await page.goto(`${url}#${state}`);
  await page.waitForSelector(`[data-state="${state}"] [data-testid="phone-frame"] [data-testid="seat-row"]`);
  if (control) {
    await page.addStyleTag({
      content: '[data-testid="mute-baron"]{min-width:0!important;min-height:0!important;width:24px!important;height:24px!important;overflow:hidden}[data-testid="seat-row"]{width:600px!important;flex:none!important}',
    });
    await page.evaluate(() => console.error('positive control: a planted console error'));
  }
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: `${shots}/mute-${state}${control ? '-control' : ''}.png`, fullPage: true });
  const frames = await page.$$eval(
    `[data-state="${state}"] [data-testid="phone-frame"]`,
    (els, MIN) =>
      els.map((f) => {
        const fr = f.getBoundingClientRect();
        const q = (id) => f.querySelector(`[data-testid="${id}"]`);
        const win = q('rail-window')?.getBoundingClientRect();
        const problems = [];
        // Every mute control drawn in this frame: the seats' switches, the channel's, Unmute and Undo.
        const controls = [...f.querySelectorAll('[data-testid^="mute-"],[data-testid^="unmute-"]')].filter((el) => el.tagName === 'BUTTON');
        const sizes = controls.map((el) => {
          const r = el.getBoundingClientRect();
          const id = el.dataset.testid;
          if (r.width < MIN - 0.01 || r.height < MIN - 0.01) problems.push(`${id} is ${r.width.toFixed(1)}×${r.height.toFixed(1)} < ${MIN}`);
          return `${id} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`;
        });
        if (!controls.some((el) => /^mute-(baron|kai)$/.test(el.dataset.testid))) problems.push('no seat switch drawn');
        // Nothing leaves the frame: the frame itself never scrolls, and every testid'd element outside the rail's
        // scrolling window sits inside it. Inside the window, things may scroll down (the window scrolls) but never sideways.
        if (f.scrollWidth > f.clientWidth + 1 || f.scrollHeight > f.clientHeight + 1) problems.push('the frame overflows');
        for (const el of f.querySelectorAll('[data-testid]')) {
          const id = el.dataset.testid;
          if (id === 'tap-hint' || id.startsWith('intent-marker')) continue; // review furniture
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const inWindow = el.closest('[data-testid="rail-window"]') && id !== 'rail-window';
          if (inWindow) {
            if (r.left < win.left - 0.5 || r.right > win.right + 0.5) problems.push(`${id} leaves the rail sideways`);
          } else if (r.left < fr.left - 0.5 || r.right > fr.right + 0.5 || r.top < fr.top - 0.5 || r.bottom > fr.bottom + 0.5) problems.push(`${id} leaves the frame`);
        }
        for (const id of ['guide', 'rail-header', 'table-chat', 'seat-row', 'rail-window', 'actions', 'chat-ticker', 'mute-confirm']) {
          const el = q(id);
          if (el && el.scrollWidth > el.clientWidth + 1) problems.push(`${id} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
        }
        // Whether the channel's switch shows without scrolling the rail: informative (the seat's switch is the one always in view).
        const talk = q('mute-baron-talk')?.getBoundingClientRect();
        const talkInView = talk && win ? talk.top >= win.top - 0.5 && talk.bottom <= win.bottom + 0.5 : false;
        const muted = [...f.querySelectorAll('[data-testid^="muted-"]')].map((el) => el.dataset.testid);
        return {
          phone: f.dataset.phone,
          rail: +(q('guide')?.getBoundingClientRect().width ?? 0).toFixed(1),
          window: +(win?.height ?? 0).toFixed(1),
          controls: sizes.join(', '),
          muted: muted.join(' ') || '-',
          talkInView,
          placeholder: !!q('whisper-placeholder'),
          offer: !!q('offer-baron'),
          ticker: [...(q('chat-ticker')?.querySelectorAll('li') ?? [])].map((li) => li.dataset.testid.replace('chat-line-', '#')).join(' ') || (q('mute-confirm') ? 'confirm' : '-'),
          problems,
        };
      }),
    MIN,
  );
  const tv = await page.$eval(`[data-state="${state}"] [data-testid="tv-ticker"]`, (t) => [...t.querySelectorAll('li')].map((li) => li.dataset.testid.replace('tv-line-', '#')).join(' '));
  for (const f of frames) {
    if (f.problems.length) failed = true;
    rows.push({ state, phone: f.phone, rail: f.rail, window: f.window, controls: f.controls, talkInView: f.talkInView, muted: f.muted, placeholder: f.placeholder, offer: f.offer, ticker: f.ticker, tv, result: f.problems.join('; ') || 'ok' });
  }
}
console.table(rows);
console.log(`console errors over the whole load: ${errors.length}`);
for (const e of errors) console.log('  ', e);
if (errors.length) failed = true;
await browser.close();
if (control) {
  // The control must be red on every planted fault, or the measurement has stopped measuring.
  const seen = { size: rows.some((r) => /mute-baron is .*< 32/.test(r.result)), overflow: rows.some((r) => /seat-row (leaves|scrolls)|leaves the frame|scrolls sideways/.test(r.result)), console: errors.length > 0 };
  console.log('positive control:', seen);
  const bit = Object.values(seen).every(Boolean);
  console.log(bit ? 'CONTROL BIT: red on all three, as expected' : 'CONTROL DID NOT BITE');
  process.exit(bit ? 1 : 2);
}
process.exit(failed ? 1 : 0);
