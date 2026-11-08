// The map's drawn size in today's hub, shell A and shell B, each phone alone at its own viewport, and a horizontal-
// overflow check. Not part of the mock itself.   node scripts/measure.mjs <base-url>
import { chromium } from 'playwright';
const base = process.argv[2];
const PHONES = [[667, 375], [844, 390]];
const SHELLS = ['today', 'a', 'b'];
const browser = await chromium.launch();
const rows = [];
for (const [w, h] of PHONES) {
  for (const shell of SHELLS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${base}/?screen=shell&state=${shell}&solo=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="hub-map"] [style*="width"]')?.getBoundingClientRect();
      const doc = document.documentElement;
      const wide = [...document.querySelectorAll('[data-testid="stage"], [data-testid="guide"]')].map((el) => ({ id: el.getAttribute('data-testid'), over: el.scrollWidth - el.clientWidth }));
      const hOf = (id) => Math.round(document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().height ?? 0);
      return { w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0), docOver: doc.scrollWidth - doc.clientWidth, wide, card: hOf('roadmap'), needs: hOf('needs-strip'), agenda: hOf('agenda'), tools: hOf('map-tools'), railHead: hOf('rail-head') };
    });
    rows.push({ phone: `${w}×${h}`, shell, ...m });
    await page.close();
  }
}
await browser.close();
for (const r of rows) console.log(`${r.phone}  ${r.shell.padEnd(5)}  map ${r.w} × ${r.h}  area ${r.w * r.h}  card ${r.card} needs ${r.needs} agenda ${r.agenda} tools ${r.tools} railHead ${r.railHead}  overflow doc ${r.docOver} ${r.wide.map((x) => `${x.id} ${x.over}`).join(' ')}`);
console.log(JSON.stringify(rows));
