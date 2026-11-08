// The mock's page gates: every state (and the index), alone at 667×375 and 844×390. For each: page errors (and console
// errors other than the review loop's known sourceStamp-on-Fragment warning), and horizontal overflow of the document,
// the stage and the rail. Exits 1 on any. Not part of the mock itself.   node scripts/gates.mjs <base-url>
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const base = process.argv[2];
const list = (script) => execFileSync('node', [new URL(script, import.meta.url).pathname], { encoding: 'utf8' }).trim().split('\n');
// Every state, alone, in both tab positions; and every beat of the prototype (a desktop page).
const states = list('./states.mjs').flatMap((q) => [q, `${q}&tabs=bottom`]);
const beats = list('./beats.mjs');
const browser = await chromium.launch();
// A state's page is a wide page of boxed phones: give it a desktop window.
const sizeFor = (q, w, h) => (q.includes('solo=1') ? { width: w, height: h } : { width: 1500, height: 1000 });
let bad = 0;
let pages = 0;
for (const [w, h] of [[667, 375], [844, 390]]) {
  // The index and every state's page (the boxed phones) once; every state alone at both sizes.
  for (const q of [...(w === 667 ? ['', '?notes=1', ...states, ...beats, ...beats.map((b) => `${b}&tabs=bottom&w=844`)] : []), ...states.map((s) => `${s}&solo=1`)]) {
    const page = await browser.newPage({ viewport: sizeFor(q, w, h) });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (m.text().includes('supplied to `React.Fragment`') && m.text().includes('data-source')) return;
      errors.push(`console: ${m.text().split('\n')[0]}`);
    });
    await page.goto(`${base}/${q}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => {
      const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const parts = [...document.querySelectorAll('[data-testid="stage"], [data-testid="guide"], [data-testid="stage-body"], [data-testid="rail-body"]')].map((el) => el.scrollWidth - el.clientWidth);
      return Math.max(doc, ...parts, 0);
    });
    pages++;
    const solo = q.includes('solo=1');
    const fail = errors.length > 0 || (solo && over > 0);
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${q.includes('solo=1') ? `${w}×${h}` : 'page   '} ${q || '(index)'}  overflow ${over}px  errors ${errors.length}${errors.length ? `\n     ${errors.join('\n     ')}` : ''}`);
    await page.close();
  }
}
await browser.close();
console.log(`\n${pages} pages, ${bad} failing`);
process.exit(bad ? 1 : 0);
