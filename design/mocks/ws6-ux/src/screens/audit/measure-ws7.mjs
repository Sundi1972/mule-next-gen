// WS7's rulings in the hub mocks, measured: the Governor's desk with the rail's chat seat row present, the hub's
// offices line, the Now card folding in an ordinary month, and the TV's Governor promise line. Headless; the mocks'
// dev server must already run.
//
//   node design/mocks/ws6-ux/src/screens/audit/measure-ws7.mjs [http://localhost:5316/] [--shots=<dir>] [--only=desk]
//
// For each phone size (844 × 390, and 667 × 375 by ?phone=667) it checks, in the first phone frame of each route:
// - desk: on #audit-election-governor, with the seat row present, the Now card folded and the desk tabs drawn, the
//   bottoms of governor-tax-row and governor-verdict are above the footer's top (the rail does not scroll to show
//   them), in the three states the desk goes through (as it opens at 5%, after −, after Set). Reports "above" or
//   "under" with the numbers.
// - hub: #audit-hub and #audit-hub-election: the offices line's words, the Now card folded, one tap opens it and one
//   folds it, with the seat row present.
// - tv: #plan-wait (kept), #plan-wait-broken (broken), #plan-wait-no-governor (no line).
// Everywhere: nothing leaves the frame, every button in the changed parts is at least 32 × 32, and no console error
// over a load of at least 3 s. Exits 1 when a check fails.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? 'http://localhost:5316/').replace(/\/?$/, '/');
const shots = args.find((a) => a.startsWith('--shots='))?.slice(8);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const MIN = 32;
const LOAD_MS = 4200; // ≥ 3 s, and long enough for the chat ticker to hold its two lines (lines at 0 s and 3 s)
const SIZES = [
  { phone: '844', q: '' },
  { phone: '667', q: '?phone=667' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 2400 } });
let errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const rows = [];
const fail = (row) => {
  if (row.result !== 'ok' && row.result !== 'above') failed = true;
  rows.push(row);
};

async function load(q, hash) {
  errors = [];
  await page.goto(`${base}${q}#${hash}`);
  await page.waitForSelector('[data-testid="phone-frame"], [data-testid="tv-frame"]');
  await page.waitForTimeout(LOAD_MS);
}

/** Frame-wide checks: overflow and tap sizes of the buttons in `scope` (a selector inside the first phone frame). */
const frameChecks = (scopes) =>
  page.$eval(
    '[data-testid="phone-frame"]',
    (f, { scopes, MIN }) => {
      const fr = f.getBoundingClientRect();
      const problems = [];
      if (f.scrollWidth > f.clientWidth + 1 || f.scrollHeight > f.clientHeight + 1) problems.push('the frame overflows');
      const scroller = f.querySelector('[data-testid="guide"] > div.overflow-y-auto');
      for (const el of f.querySelectorAll('[data-testid]')) {
        const id = el.dataset.testid;
        if (id.startsWith('chat-bubble')) continue; // a bubble opens over the stage, left of the guide, by design
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const inRail = scroller && scroller.contains(el) && el !== scroller;
        // Inside a row that scrolls sideways by design (the hub's agenda), the row clips it: judge it by the row.
        let clip = el.parentElement;
        while (clip && clip !== f && !/(auto|scroll)/.test(getComputedStyle(clip).overflowX)) clip = clip.parentElement;
        if (clip && clip !== f && clip !== scroller && !inRail) {
          const c = clip.getBoundingClientRect();
          if (c.left < fr.left - 0.5 || c.right > fr.right + 0.5) problems.push(`${clip.dataset.testid ?? 'a scrolling row'} leaves the frame`);
          continue;
        }
        if (inRail) {
          const w = scroller.getBoundingClientRect();
          if (r.left < w.left - 0.5 || r.right > w.right + 0.5) problems.push(`${id} leaves the rail sideways`);
        } else if (r.left < fr.left - 0.5 || r.right > fr.right + 0.5 || r.top < fr.top - 0.5 || r.bottom > fr.bottom + 0.5) problems.push(`${id} leaves the frame`);
      }
      if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) problems.push('the rail scrolls sideways');
      const taps = [];
      for (const sel of scopes)
        for (const b of f.querySelectorAll(`${sel} button, button${sel}`)) {
          const r = b.getBoundingClientRect();
          if (r.width === 0) continue;
          const id = b.dataset.testid ?? b.getAttribute('aria-label') ?? b.textContent.trim().slice(0, 12);
          taps.push(`${id} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
          if (r.width < MIN - 0.01 || r.height < MIN - 0.01) problems.push(`${id} is ${r.width.toFixed(1)}×${r.height.toFixed(1)} < ${MIN}`);
        }
      return { problems, taps: taps.join(', ') };
    },
    { scopes, MIN },
  );

/** The desk's fit: where the tax row and the verdict end against the footer's top. */
const deskFit = () =>
  page.$eval('[data-testid="phone-frame"]', (f) => {
    const q = (sel) => f.querySelector(sel);
    const r = (el) => el?.getBoundingClientRect();
    const footer = r(q('[data-testid="actions"]'));
    const row = r(q('[data-testid="governor-tax-row"]'));
    const verdictEl = q('[data-testid="governor-verdict"]') ?? q('[data-verdict]');
    const verdict = r(verdictEl);
    const scroller = q('[data-testid="guide"] > div.overflow-y-auto');
    const missing = [];
    if (!q('[data-testid="seat-row"]')) missing.push('no seat row');
    if (!q('[data-testid="desks"]')) missing.push('no desk tabs');
    const now = q('[data-testid="now"]');
    if (!now || now.tagName !== 'BUTTON') missing.push('the Now card is not folded');
    if (!row) missing.push('no governor-tax-row');
    if (!verdict) missing.push('no governor-verdict');
    const promise = r(q('[data-testid="gov-promise"]'));
    return {
      footerTop: footer ? +(footer.top - f.getBoundingClientRect().top).toFixed(1) : null,
      rowBottom: row ? +(row.bottom - f.getBoundingClientRect().top).toFixed(1) : null,
      verdictBottom: verdict ? +(verdict.bottom - f.getBoundingClientRect().top).toFixed(1) : null,
      verdict: verdictEl?.textContent.trim() ?? '-',
      promiseAboveRow: promise && row ? promise.bottom <= row.top + 0.5 : false,
      railScrollTop: scroller?.scrollTop ?? 0,
      seatRow: !!q('[data-testid="seat-row"]'),
      ticker: q('[data-testid="chat-ticker"]')?.querySelectorAll('li').length ?? 0,
      missing,
    };
  });

for (const { phone, q } of SIZES) {
  // --- 1 · the Governor's desk -----------------------------------------------------------------------------------
  if (!only || only === 'desk') {
    await load(q, 'audit-election-governor');
    const steps = [
      { state: 'opens at 5%', act: null },
      { state: 'after −, 4%', act: '[data-testid="tax-down"]' },
      { state: 'after Set 4%', act: '[data-testid="tax-confirm"]' },
    ];
    for (const s of steps) {
      // A DOM click, so the page never scrolls the rail to reach the button: what is measured is what shows untouched.
      if (s.act) await page.$eval(`[data-testid="phone-frame"] ${s.act}`, (el) => el.click());
      await page.waitForTimeout(150);
      const fit = await deskFit();
      const checks = await frameChecks(['[data-testid="gov-tax"]', '[data-testid="desks"]', '[data-testid="now"]']);
      const under = [];
      if (fit.rowBottom === null || fit.rowBottom > fit.footerTop + 0.5) under.push('tax row');
      if (fit.verdictBottom === null || fit.verdictBottom > fit.footerTop + 0.5) under.push('verdict');
      const problems = [...fit.missing, ...checks.problems];
      if (!fit.promiseAboveRow) problems.push('the promise is not above the tax row (E-7)');
      if (fit.railScrollTop > 0) problems.push('the rail had to scroll');
      const where = under.length ? `under: ${under.join(' and ')}` : 'above';
      if (shots && !s.act) await page.locator('[data-testid="phone-frame"]').first().screenshot({ path: `${shots}/desk-${phone}.png` });
      if (shots && s.state.startsWith('after Set')) await page.locator('[data-testid="phone-frame"]').first().screenshot({ path: `${shots}/desk-${phone}-set.png` });
      fail({
        route: 'audit-election-governor',
        phone,
        state: s.state,
        footerTop: fit.footerTop,
        rowBottom: fit.rowBottom,
        verdictBottom: fit.verdictBottom,
        verdict: fit.verdict,
        seatRow: fit.seatRow,
        ticker: fit.ticker,
        taps: checks.taps,
        result: under.length || problems.length ? [where, ...problems].join('; ') : 'above',
      });
      if (under.length) failed = true;
    }
    fail({ route: 'audit-election-governor', phone, state: 'console', result: errors.length ? `${errors.length} console errors: ${errors[0]}` : 'ok' });
  }

  // --- 2 and 3 · the hub's offices line, the Now card folding --------------------------------------------------------
  if (!only || only === 'hub') {
    for (const [hash, want] of [
      ['audit-hub', 'Governor: Ossa, until month 6 · promised up to 4% · tax 4%, kept · Next election: month 7'],
      ['audit-hub-election', 'Governor: Ossa · Election: this month'],
    ]) {
      await load(q, hash);
      // The words a player reads: the review's numbered markers are not part of the line.
      const words = (el) => {
        const c = el.cloneNode(true);
        for (const m of c.querySelectorAll('[data-testid^="intent-marker"]')) m.remove();
        return c.textContent.replace(/\s+/g, ' ').trim();
      };
      const got = await page.$eval('[data-testid="phone-frame"] [data-testid="roadmap-offices"]', (el, w) => new Function(`return (${w})`)()(el), words.toString());
      const ids = await page.$eval('[data-testid="phone-frame"]', (f) => ['office-governor', 'next-election', 'land-baron', 'run-for-office'].filter((id) => f.querySelector(`[data-testid="roadmap-offices"] [data-testid="${id}"]`)));
      const problems = [];
      if (got !== want) problems.push(`offices line reads "${got}"`);
      if (!ids.includes('office-governor') || !ids.includes('next-election')) problems.push(`testids: ${ids.join(' ')}`);
      if (/Land Baron|Run for office/.test(got)) problems.push('Land Baron or Run for office in the line');
      // H-7: folded as the month opens, one tap opens it, one folds it; the desk tabs stay above the footer folded.
      const fold = await page.$eval('[data-testid="phone-frame"]', (f) => {
        const now = f.querySelector('[data-testid="now"]');
        const desks = f.querySelector('[data-testid="desks"]')?.getBoundingClientRect();
        const footer = f.querySelector('[data-testid="actions"]')?.getBoundingClientRect();
        return { folded: now?.tagName === 'BUTTON', desksAbove: !!desks && !!footer && desks.bottom <= footer.top + 0.5, desksBottom: desks && +(desks.bottom - f.getBoundingClientRect().top).toFixed(1), footerTop: footer && +(footer.top - f.getBoundingClientRect().top).toFixed(1), seatRow: !!f.querySelector('[data-testid="seat-row"]') };
      });
      if (!fold.folded) problems.push('Now not folded as the month opens');
      if (!fold.seatRow) problems.push('no seat row');
      if (!fold.desksAbove) problems.push(`desk tabs under the footer (${fold.desksBottom} > ${fold.footerTop})`);
      const checks = await frameChecks(['[data-testid="roadmap"]', '[data-testid="now"]', '[data-testid="desks"]']);
      problems.push(...checks.problems);
      if (shots) await page.locator('[data-testid="phone-frame"]').first().screenshot({ path: `${shots}/${hash}-${phone}.png` });
      await page.$eval('[data-testid="phone-frame"] button[data-testid="now"]', (el) => el.click());
      await page.waitForTimeout(150);
      const opened = await page.$eval('[data-testid="phone-frame"]', (f) => !!f.querySelector('[data-testid="now-fold"]') && f.querySelector('[data-testid="now"]')?.tagName === 'SECTION');
      const tapOpen = await frameChecks(['[data-testid="now-fold"]']);
      if (!opened) problems.push('one tap did not reopen the Now card');
      problems.push(...tapOpen.problems);
      if (shots) await page.locator('[data-testid="phone-frame"]').first().screenshot({ path: `${shots}/${hash}-${phone}-now-open.png` });
      await page.$eval('[data-testid="phone-frame"] [data-testid="now-fold"]', (el) => el.click());
      await page.waitForTimeout(150);
      const refolded = await page.$eval('[data-testid="phone-frame"]', (f) => f.querySelector('[data-testid="now"]')?.tagName === 'BUTTON');
      if (!refolded) problems.push('the fold button did not fold it');
      if (errors.length) problems.push(`${errors.length} console errors: ${errors[0]}`);
      fail({ route: hash, phone, state: `desks ${fold.desksBottom} / footer ${fold.footerTop}`, verdict: got, taps: `${checks.taps}, ${tapOpen.taps}`, result: problems.join('; ') || 'ok' });
    }
  }
}

// --- 4 · the TV's Governor promise -------------------------------------------------------------------------------------
if (!only || only === 'tv') {
  for (const [hash, want, tone] of [
    ['plan-wait', 'Governor Ossa · promised up to 4% · tax 4%, kept', 'ok'],
    ['plan-wait-broken', 'Governor Ossa · promised up to 4% · tax 6%, promise broken', 'alert'],
    ['plan-wait-no-governor', null, null],
  ]) {
    await load('', hash);
    const tv = await page.$eval('[data-testid="tv-frame"]', (f) => {
      const el = f.querySelector('[data-testid="tv-governor-promise"]');
      // The TV's own 1280 × 720 screen (scaled into the frame): nothing in it leaves it, and it never scrolls.
      const screen = f.querySelector('[data-testid="tv-planning"]');
      const fr = screen.getBoundingClientRect();
      const grows = screen.scrollHeight > screen.clientHeight + 1 || screen.scrollWidth > screen.clientWidth + 1;
      const status = el?.querySelector('[data-testid="tv-promise-status"]');
      const leaves = [...screen.querySelectorAll('[data-testid]')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.left < fr.left - 0.5 || r.right > fr.right + 0.5 || r.top < fr.top - 0.5 || r.bottom > fr.bottom + 0.5);
      }).map((e) => e.dataset.testid);
      const c = el?.cloneNode(true);
      for (const m of c?.querySelectorAll('[data-testid^="intent-marker"]') ?? []) m.remove();
      if (grows) leaves.push('the TV screen overflows');
      return { text: c ? c.textContent.replace(/\s+/g, ' ').trim() : null, cls: status?.className ?? '', leaves };
    });
    const problems = [];
    if (tv.text !== want) problems.push(`line reads "${tv.text}"`);
    if (tone && !tv.cls.includes(`text-${tone}`)) problems.push(`status not text-${tone}: ${tv.cls}`);
    if (tv.leaves.length) problems.push(`leaves the TV: ${tv.leaves.join(' ')}`);
    if (errors.length) problems.push(`${errors.length} console errors: ${errors[0]}`);
    if (shots) await page.locator('[data-testid="tv-frame"]').first().screenshot({ path: `${shots}/${hash}-tv.png` });
    fail({ route: hash, phone: 'tv', verdict: tv.text ?? '(none)', result: problems.join('; ') || 'ok' });
  }
}

for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
process.exit(failed ? 1 : 0);
