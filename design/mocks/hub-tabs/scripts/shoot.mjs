// Loads pages of the mock, reports page errors, and screenshots them. Not part of the mock itself.
//   node scripts/shoot.mjs <base-url> <out-dir> <query>... ; a query may end in @WxH to set the viewport (solo pages).
import { chromium } from 'playwright';
const [base, out, ...queries] = process.argv.slice(2);
const browser = await chromium.launch();
let failed = 0;
for (const q of queries) {
  const [query, size] = q.split('@');
  const [w, h] = size ? size.split('x').map(Number) : [1500, 1000];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The review loop's sourceStamp puts data-source on a keyed <Fragment>, which React warns about: tooling, not the page.
  let stampWarnings = 0;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().includes('supplied to `React.Fragment`') && m.text().includes('data-source')) return void stampWarnings++;
    errors.push(`console: ${m.text().split('\n')[0]}`);
  });
  await page.goto(`${base}/${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const name = (query.replace(/[?&=]/g, '_') || 'index') + (size ? `-${size}` : '');
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !size });
  console.log(`${errors.length ? 'ERR' : 'ok '} ${query}${size ? ` @${size}` : ''}${stampWarnings ? ` (${stampWarnings} sourceStamp Fragment warnings)` : ''}${errors.length ? `\n   ${errors.join('\n   ')}` : ''}`);
  if (errors.length) failed++;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
