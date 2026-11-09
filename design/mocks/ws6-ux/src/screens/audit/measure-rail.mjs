// The rail round, measured (WS6, 2026-10-29). Headless; the mocks' dev server must already run.
//
//   node design/mocks/ws6-ux/src/screens/audit/measure-rail.mjs [http://localhost:5316/] [--part=a|b] [--shots=<dir>] [--plant]
//
// Part A, at 844 × 390 and 667 × 375 (?phone=667):
// - every league table (the month end's stage, the TV, game over's final standings in the rail) and the goods
//   auction's status table fit their panel: nothing in the panel ends right of it, and the table is no wider than the
//   panel's content box. Reports "table <w> in <panel>".
// - no player-visible placeholder: no "comes with G-5", no "G-5", no "In and out by source", no g5-* slot, in any frame.
// - the colony panel shows at most 2 hungry lines, then one "+N more went hungry" line (#monthend-hungry4 has 4).
// Part B, for each route the rail rule touches, with the seat row and 2 chat lines present (≥ 4.2 s in), under both
// switch positions (?ticker=today, ?ticker=one, ?ticker=under, the proposal): the key element's bottom against the footer's top (or, with no footer,
// the rail's own bottom). "+n" clears it by n px; "−n" means n px of it are under the footer (the rail must scroll).
// Everywhere: no console error over ≥ 3 s per load. Exits 1 when a gate fails.
// The gate in part B is the proposal's ("under"): every key element clears. Today and "one" are reported, not gated.
// --plant (the positive control): injects a wide table and a 300 px gap at the top of the rail; every gate must fail.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? 'http://localhost:5316/').replace(/\/?$/, '/');
const shots = args.find((a) => a.startsWith('--shots='))?.slice(8);
const part = args.find((a) => a.startsWith('--part='))?.slice(7);
const plant = args.includes('--plant');
const LOAD_MS = 4200; // ≥ 3 s, and the ticker holds 2 lines (lines at 0, 3.0 and 3.8 s)
const SIZES = [
  { phone: '844', q: [] },
  { phone: '667', q: ['phone=667'] },
];
const PLANT_CSS = `
  [data-testid="league-table"], [data-testid="status-table"] { table-layout: auto !important; min-width: 720px !important; }
  [data-testid="guide"] > div.overflow-y-auto > :first-child { margin-top: 300px !important; }
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 2600 } });
let errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const rows = [];
const report = (row, ok) => {
  if (!ok) failed = true;
  rows.push({ ...row, gate: ok ? 'pass' : 'FAIL' });
};

async function load(q, hash) {
  errors = [];
  const qs = q.length ? `?${q.join('&')}` : '';
  // A fresh document each time: a hash-only change would keep the last load's injected CSS and state.
  await page.goto('about:blank');
  await page.goto(`${base}${qs}#${hash}`);
  await page.waitForSelector('[data-testid="phone-frame"], [data-testid="tv-frame"]');
  if (plant) await page.addStyleTag({ content: PLANT_CSS });
  await page.waitForTimeout(LOAD_MS);
}

// --- Part A ------------------------------------------------------------------------------------------------------

const MONTHEND = ['monthend', 'monthend-phone-only', 'monthend-collapse', 'monthend-hungry', 'monthend-hungry4', 'monthend-gameover'];

/** Each table against its panel, in each frame: widths in the table's own (unscaled) px. */
const tableFit = (tableSel, panelOf) =>
  page.$$eval(
    '[data-testid="phone-frame"], [data-testid="tv-frame"], [data-testid="laptop-frame"]',
    (frames, { tableSel, panelOf }) =>
      frames.flatMap((f, i) =>
        [...f.querySelectorAll(`[data-testid="${tableSel}"]`)].map((t) => {
          const panel = panelOf === 'parent' ? t.parentElement : t.closest(`[data-testid="${panelOf}"]`);
          const k = t.getBoundingClientRect().width / t.offsetWidth || 1;
          const cs = getComputedStyle(panel);
          const content = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const right = panel.getBoundingClientRect().right;
          let over = 0;
          for (const el of panel.querySelectorAll('*')) {
            if (el.dataset.testid?.startsWith('intent-marker') || el.closest('[data-testid^="intent-marker"]')) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            over = Math.max(over, (r.right - right) / k);
          }
          return { frame: `${f.dataset.testid}#${i}`, table: Math.round(t.offsetWidth), panel: Math.round(content), over: +over.toFixed(1), scrolls: f.querySelector('div') && f.scrollWidth > f.clientWidth + 1 };
        }),
      ),
    { tableSel, panelOf },
  );

const placeholders = () =>
  page.$$eval('[data-testid="phone-frame"], [data-testid="tv-frame"], [data-testid="laptop-frame"]', (frames) => {
    const found = [];
    for (const f of frames) {
      const text = f.innerText;
      for (const re of [/comes with G-5/i, /\bG-5\b/, /In and out by source/i]) if (re.test(text)) found.push(`${f.dataset.testid}: ${re.source}`);
      for (const el of f.querySelectorAll('[data-testid^="g5-"]')) found.push(`${f.dataset.testid}: ${el.dataset.testid}`);
    }
    return found;
  });

const hunger = () =>
  page.$$eval('[data-testid="colony-panel"]', (panels) =>
    panels.map((p) => ({
      lines: p.querySelectorAll('[data-testid^="hungry-"]:not([data-testid="hungry-more"]):not([data-testid^="hungry-name-"]):not([data-testid^="hungry-ate-"])').length,
      more: p.querySelector('[data-testid="hungry-more"]')?.textContent.trim() ?? null,
    })),
  );

if (!part || part === 'a') {
  for (const { phone, q } of SIZES) {
    for (const hash of MONTHEND) {
      await load(q, hash);
      for (const t of await tableFit('league-table', 'league')) {
        const ok = t.over <= 0.5 && t.table <= t.panel + 0.5;
        report({ part: 'A1 league', route: hash, phone, frame: t.frame, result: `table ${t.table} in ${t.panel}, ${t.over > 0.5 ? `${t.over} px out` : 'inside'}` }, ok);
      }
      // Report only (the gate is horizontal): does every league row show, or does the colony panel cover the last?
      const cut = await page.$$eval('[data-testid="league"]', (ls) =>
        ls.map((l) => {
          const rows = [...l.querySelectorAll('tbody tr')];
          const bottom = l.getBoundingClientRect().bottom;
          const hidden = rows.filter((r) => r.getBoundingClientRect().bottom > bottom + 0.5).length;
          return hidden ? `${hidden} of ${rows.length} rows cut` : `${rows.length} rows show`;
        }),
      );
      rows.push({ part: 'A1 rows (report)', route: hash, phone, result: cut.join(' | ') });
      const ph = await placeholders();
      report({ part: 'A1 placeholders', route: hash, phone, result: ph.length ? ph.join('; ') : 'none' }, ph.length === 0);
      const h = await hunger();
      const want4 = hash === 'monthend-hungry4';
      const hOk = h.every((x) => x.lines <= 2) && (!want4 || (h.length > 0 && h.every((x) => x.more === '+2 more went hungry')));
      if (h.length) report({ part: 'A1 hunger', route: hash, phone, result: h.map((x) => `${x.lines} lines${x.more ? ` + "${x.more}"` : ''}`).join(' | ') }, hOk);
      report({ part: 'console', route: hash, phone, result: errors.length ? `${errors.length}: ${errors[0]}` : '0 errors' }, errors.length === 0);
      if (shots && !plant) {
        await page.locator('[data-testid="phone-frame"]').last().screenshot({ path: `${shots}/a-${hash}-${phone}.png` });
        if (phone === '844' && (await page.locator('[data-testid="tv-frame"]').count())) await page.locator('[data-testid="tv-frame"]').first().screenshot({ path: `${shots}/a-${hash}-tv.png` });
      }
    }
    await load(q, 'audit-auction-status');
    for (const t of await tableFit('status-table', 'parent')) {
      const ok = t.over <= 0.5 && t.table <= t.panel + 0.5;
      report({ part: 'A2 status', route: 'audit-auction-status', phone, frame: t.frame, result: `table ${t.table} in ${t.panel}, ${t.over > 0.5 ? `${t.over} px out` : 'inside'}` }, ok);
    }
    report({ part: 'console', route: 'audit-auction-status', phone, result: errors.length ? `${errors.length}: ${errors[0]}` : '0 errors' }, errors.length === 0);
    if (shots && !plant) await page.locator('[data-testid="phone-frame"]').first().screenshot({ path: `${shots}/a-audit-auction-status-${phone}.png` });
  }
}

// --- Part B ------------------------------------------------------------------------------------------------------

/** The rail's key element on each screen the chat squeezes; each phone frame of the route that has it is measured. */
const B_ROUTES = [
  { hash: 'audit-election-governor', key: 'governor-verdict', what: 'the Governor desk’s verdict' },
  { hash: 'audit-auction-walk', key: 'hint', what: 'the walking hint' },
  { hash: 'rail-production', key: 'rail-earlier', what: 'the earlier event’s line' },
  { hash: 'monthend', key: 'worth-total', what: 'the Worth total' },
  { hash: 'monthend-phone-only', key: 'worth-total', what: 'the Worth total' },
  { hash: 'monthend-collapse', key: 'worth-total', what: 'the Worth total' },
  { hash: 'monthend-gameover', key: 'scores', what: 'the final standings' },
];

const railFit = (key) =>
  page.$$eval(
    '[data-testid="phone-frame"]',
    (frames, key) =>
      frames
        .map((f, i) => {
          const el = f.querySelector(`[data-testid="${key}"]`);
          if (!el) return null;
          const footer = f.querySelector('[data-testid="actions"]');
          const scroller = el.closest('.overflow-y-auto');
          const top = f.getBoundingClientRect().top;
          const ref = footer ? footer.getBoundingClientRect().top : scroller.getBoundingClientRect().bottom;
          const r = el.getBoundingClientRect();
          const ticker = f.querySelector('[data-testid="chat-ticker"]');
          const seats = f.querySelector('[data-testid="seat-row"]')?.getBoundingClientRect();
          const seatsShow = seats ? +Math.max(0, Math.min(seats.height, ref - seats.top)).toFixed(1) : 0;
          const shown = ticker ? [...ticker.querySelectorAll('li')].filter((li) => li.getBoundingClientRect().height > 0).length : 0;
          const screen = f.querySelector('[data-testid^="phone-"]:not([data-testid="phone-frame"]), [data-testid="pick-bar"], [data-testid="board-wrap"], [data-testid="phone-card"], [data-testid="gov-tax"]')?.dataset.testid;
          return {
            frame: i,
            screen,
            ref: footer ? 'footer top' : 'rail bottom',
            refY: +(ref - top).toFixed(1),
            bottom: +(r.bottom - top).toFixed(1),
            height: +r.height.toFixed(1),
            clears: +(ref - r.bottom).toFixed(1),
            visible: +Math.max(0, Math.min(r.height, ref - r.top)).toFixed(1),
            seatRow: !!f.querySelector('[data-testid="seat-row"]'),
            seatsShow,
            seatsH: seats ? +seats.height.toFixed(1) : 0,
            ticker: shown,
            scrolled: scroller?.scrollTop ?? 0,
          };
        })
        .filter(Boolean),
    key,
  );

if (!part || part === 'b') {
  for (const { phone, q } of SIZES) {
    for (const r of B_ROUTES) {
      for (const rule of ['today', 'one', 'under']) {
        await load([...q, `ticker=${rule}`], r.hash);
        const fits = await railFit(r.key);
        if (!fits.length) report({ part: 'B', route: r.hash, phone, rule, result: `no ${r.key}` }, false);
        for (const f of fits) {
          // The gate is the proposal's: under it, every key element clears. Today and the one-line ticker are reported.
          const ok = rule !== 'under' || f.clears >= -0.5;
          const sign = f.clears >= 0 ? `+${f.clears}` : `−${-f.clears}`;
          const problems = [];
          if (!f.seatRow) problems.push('no seat row');
          if (f.ticker < 1) problems.push('no chat line');
          report(
            {
              part: 'B',
              route: r.hash,
              phone,
              rule,
              frame: `${f.frame} ${f.screen}`,
              key: `${r.key} (${r.what})`,
              result: `bottom ${f.bottom} vs ${f.ref} ${f.refY}: ${sign} · ${f.visible} of ${f.height} px show · ticker ${f.ticker} line${f.ticker === 1 ? '' : 's'} · seat row ${f.seatsShow} of ${f.seatsH} px in view${problems.length ? ` · ${problems.join(', ')}` : ''}`,
            },
            ok && problems.length === 0,
          );
          if (shots && !plant && f.frame === fits[0].frame) await page.locator('[data-testid="phone-frame"]').nth(f.frame).screenshot({ path: `${shots}/b-${r.hash}-${phone}-${rule}.png` });
        }
        report({ part: 'console', route: r.hash, phone, rule, result: errors.length ? `${errors.length}: ${errors[0]}` : '0 errors' }, errors.length === 0);
      }
    }
  }
}

for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
process.exit(failed ? 1 : 0);
