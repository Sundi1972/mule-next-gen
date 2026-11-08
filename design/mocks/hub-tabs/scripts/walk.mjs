// The main journeys, clicked through at 667×375 (Playwright's clicks are real input). Not part of the mock itself.
//   node scripts/walk.mjs <base-url>
import { chromium } from 'playwright';
const base = process.argv[2];
const b = await chromium.launch();
const steps = [];
async function walk(q, size, fn) {
  const p = await b.newPage({ viewport: size });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/${q}`, { waitUntil: 'networkidle' });
  try { await fn(p); steps.push(`ok   ${q}`); } catch (e) { steps.push(`FAIL ${q}: ${e.message.split('\n')[0]}`); }
  if (errs.length) steps.push(`  pageerrors: ${errs.join(' | ')}`);
  await p.close();
}
const V = { width: 667, height: 375 };
const see = (p, id) => p.getByTestId(id).first().waitFor({ state: 'visible', timeout: 3000 });
await walk('?screen=shell&state=a&solo=1', V, async (p) => {
  // Two offers wait: the agenda's door opens Talk on My cards.
  await p.getByTestId('agenda-deals').click(); await see(p, 'talk-stage'); await see(p, 'my-cards');
  await p.getByTestId('tab-politics').click(); await see(p, 'politics-council');
  await p.getByTestId('sub-budget').click(); await see(p, 'council-budget');
  await p.getByTestId('tab-colony').click(); await see(p, 'colony-standings');
  await p.getByTestId('colony-standing-brix-deal').click(); await see(p, 'composer-a');
  await p.getByTestId('composer-a-close').click();
  await p.getByTestId('help-open').click(); await see(p, 'help-sheet'); await p.keyboard.press('Escape');
  if (await p.getByTestId('help-sheet').count()) throw new Error('help sheet did not close');
  await p.getByTestId('tab-overview').click(); await p.getByTestId('tool-list').click(); await see(p, 'list-asset');
});
await walk('?screen=handoff&state=sheriff&solo=1', V, async (p) => {
  await p.getByTestId('guard-open-map').click(); await see(p, 'guard-bar');
  await p.getByTestId('guard-back').click(); await see(p, 'sheriff-desk-b');
});
await walk('?screen=badges&state=ballot&solo=1', V, async (p) => {
  await see(p, 'politics-badge'); await p.getByTestId('now-go').click(); await see(p, 'ballot-card');
});
await walk('?screen=politics&state=call&solo=1', V, async (p) => {
  await p.getByTestId('overrule-call-button').click(); await see(p, 'overrule-called-mine'); await see(p, 'overrule-call-line');
});
await walk('?screen=talk&state=incoming-ai&solo=1', V, async (p) => {
  await see(p, 'incoming-sheet'); const t = await p.getByTestId('incoming-sheet').innerText(); if (!/OSSA · AI/i.test(t)) throw new Error('no AI mark: ' + t.slice(0, 80));
});
await b.close();
console.log(steps.join('\n'));
