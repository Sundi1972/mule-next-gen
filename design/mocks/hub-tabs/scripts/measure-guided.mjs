// The guided page at its default table (the fixture's four seats, no params but the beat): the TV's fit per beat, read
// from the real TvFit's data-fit inside the half-size frame, and whether the page fits a 1440 × 900 window.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173';
const W = Number(process.argv[3] ?? 1440), H = Number(process.argv[4] ?? 900);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto(url);
await p.waitForSelector('[data-testid="tv-frame"]');
const ids = await p.$$eval('[data-testid^="beat-"]', (els) => [...new Set(els.map((e) => e.getAttribute("data-testid").slice(5)))].filter((id) => /^\d-/.test(id)));
let low = 0, over = 0;
for (const id of ids) {
  await p.goto(`${url}/?beat=${id}`);
  await p.waitForSelector('[data-testid="tv-frame"] [data-fit]');
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => ({
    fit: [...document.querySelectorAll('[data-testid="tv-frame"] [data-fit]')].map((e) => Number(e.getAttribute('data-fit'))),
    sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
  }));
  const f = Math.min(...r.fit);
  if (f < 0.7) low++;
  if (r.sw > W || r.sh > H) over++;
  console.log(`${id.padEnd(14)} fit ${f.toFixed(3)}  page ${r.sw}×${r.sh}${r.sw > W || r.sh > H ? '  OVER' : ''}`);
}
console.log(`${ids.length} beats at ${W}×${H}: ${low} under the 0.7 floor, ${over} past the window`);
await b.close();
process.exit(low ? 1 : 0);
