// The Overview height check (PM, 8 Nov): Overview's map box (MapFit's) on Lena's phone for every needs state (one-, two-
// and three-digit figures, met and short, a busy and a quiet table), each phone alone at its own viewport, both tab
// positions. Prints the map, the "This month" rows and lines and the Short row's title; exits 1 if the map moves within a
// phone and tab position.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173';
const ids = ['met-1', 'met-2', 'met-3', 'short-1', 'short-2', 'short-3'].flatMap((n) => ['busy', 'quiet', 'bare', 'crowded'].map((t) => `${t}-${n}`));
const b = await chromium.launch();
let moved = 0;
for (const [w, h] of [[667, 375], [844, 390]]) {
  for (const tabs of ['left', 'bottom']) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const seen = new Map();
    for (const id of ids) {
      await p.goto(`${url}/?screen=needs&state=${id}&tabs=${tabs}&solo=1`);
      await p.waitForSelector('[data-testid="hub-map"] [style*="width"]');
      await p.waitForTimeout(120);
      const r = await p.evaluate(() => {
        const box = document.querySelector('[data-testid="hub-map"] [style*="width"]').getBoundingClientRect();
        const agenda = document.querySelector('[data-testid="agenda"]');
        const rows = [...document.querySelectorAll('[data-testid^="agenda-"]')].filter((e) => /^agenda-[a-z]+$/.test(e.getAttribute('data-testid')) && !['agenda-box', 'agenda-empty', 'agenda-more', 'agenda-back'].includes(e.getAttribute('data-testid')));
        const more = document.querySelector('[data-testid="agenda-more"]')?.textContent ?? '';
        const lines = new Set(rows.map((e) => Math.round(e.getBoundingClientRect().top))).size;
        const needs = document.querySelector('[data-testid="agenda-needs"]');
        const title = needs?.querySelector('.truncate');
        return {
          map: `${Math.round(box.width)} × ${Math.round(box.height)}`, rows: rows.length, lines, more, agenda: Math.round(agenda?.getBoundingClientRect().height ?? 0),
          short: title ? `${title.textContent}${title.scrollWidth > title.clientWidth ? ' (truncated)' : ''}` : '-',
          over: document.documentElement.scrollWidth - innerWidth,
        };
      });
      seen.set(r.map, (seen.get(r.map) ?? 0) + 1);
      console.log(`${w} ${tabs.padEnd(6)} ${id.padEnd(13)} map ${r.map}  agenda ${String(r.agenda).padStart(3)} px, ${r.rows} rows on ${r.lines} lines${r.more ? ` + “${r.more}”` : ''}  ${r.short}${r.over > 0 ? `  OVERFLOW ${r.over}` : ''}`);
    }
    const one = seen.size === 1;
    if (!one) moved++;
    console.log(`${w} ${tabs}: ${one ? 'the map holds at ' + [...seen.keys()][0] : 'THE MAP MOVES: ' + [...seen].map(([m, n]) => `${m} ×${n}`).join(', ')}\n`);
    await p.close();
  }
}
// The crowded table pages: "+2 more" names what waits behind it, turns to the Short row, and "Back" returns; the map holds.
const p = await b.newPage({ viewport: { width: 667, height: 375 } });
await p.goto(`${url}/?screen=needs&state=crowded-short-1&tabs=left&solo=1`);
const mapOf = () => p.evaluate(() => { const r = document.querySelector('[data-testid="hub-map"] [style*="width"]').getBoundingClientRect(); return `${Math.round(r.width)} × ${Math.round(r.height)}`; });
const before = await mapOf();
const titles = await p.getByTestId('agenda-more-titles').textContent();
await p.getByTestId('agenda-more').click();
await p.getByTestId('agenda-needs').waitFor();
const turned = await mapOf();
await p.getByTestId('agenda-back').click();
await p.getByTestId('agenda-deals').waitFor();
const paging = titles.includes('Short 1 Energy') && before === turned;
console.log(`${paging ? 'ok  ' : 'FAIL'} paging: “+2 more” names “${titles}”; page 2 shows the Short row; Back returns; map ${before} → ${turned}`);
await b.close();
process.exit(moved || !paging ? 1 : 0);
