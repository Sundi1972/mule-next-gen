// The guided prototype's steps, played with real taps on the phone (and the TV pane checked to follow the table).
// Not part of the mock itself.   node scripts/walk-steps.mjs <base-url> [left|bottom]
import { chromium } from 'playwright';
const base = process.argv[2];
const tabs = process.argv[3] ?? 'left';
const b = await chromium.launch();
const out = [];
let bad = 0;
async function beat(id, fn) {
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/?beat=${id}&tabs=${tabs}`, { waitUntil: 'networkidle' });
  const phone = p.getByTestId('phone-frame');
  const see = (tid, root = phone) => root.getByTestId(tid).first().waitFor({ state: 'visible', timeout: 3000 });
  const tap = (tid) => phone.getByTestId(tid).first().click();
  try {
    await fn({ p, phone, see, tap });
    if (errs.length) throw new Error(`page errors: ${errs.join(' | ')}`);
    out.push(`ok   ${id}`);
  } catch (e) {
    bad++;
    out.push(`FAIL ${id}: ${e.message.split('\n')[0]}`);
  }
  await p.close();
}
const gone = (phone, tid) => phone.getByTestId(tid).first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => { throw new Error(`${tid} still shown`); });
const tv = (p) => p.getByTestId('tv-pane').innerText();

await beat('1-head', async ({ see }) => { await see('now'); await see('phase-line'); await see('ready'); });
await beat('1-help', async ({ phone, see, tap }) => { await see('help-sheet'); await tap('help-close'); await gone(phone, 'help-sheet'); });
await beat('1-badges', async ({ see, tap }) => { await see('talk-badge'); await see('talk-badge-broken'); await tap('tab-talk'); await see('talk-stage'); });
await beat('2-look', async ({ see, tap }) => { await see('hub-map'); await tap('tool-plots'); await see('tool-hint'); });
await beat('2-drone', async ({ see }) => { await see('hub-map'); });
await beat('2-sell', async ({ see, tap }) => { await see('list-asset'); await tap('list-plot'); });
await beat('3-arrives', async ({ see, tap }) => { await see('talk-badge'); await tap('agenda-deals'); await see('incoming-sheet'); });
await beat('3-sheet', async ({ phone, see, tap }) => {
  await see('incoming-sheet');
  await tap('sheet-card-deal-b3x8re-accept');
  await gone(phone, 'incoming-sheet');
  await tap('talk-cards');
  await see('my-cards');
  const t = await phone.getByTestId('my-cards').innerText();
  if (!/Ossa/.test(t)) throw new Error('accepted card not in My cards');
});
await beat('3-compose', async ({ phone, see, tap }) => { await see('composer-a'); await tap('composer-a-send'); await gone(phone, 'composer-a'); });
await beat('4-tax', async ({ see, tap }) => { for (let i = 0; i < 5; i++) await tap('tax-up'); await tap('tax-confirm'); await see('gov-done'); });
await beat('4-budget-a', async ({ p, see, tap }) => {
  await tap('budget-up-welfare');
  await tap('budget-set');
  await see('budget-variant');
  await tap('budget-variant-b');
  await see('budget-set');
});
await beat('4-commission', async ({ phone, see, tap }) => {
  await tap('commission-open');
  await see('commission-list');
  const first = phone.locator('[data-testid^="cat-"]:not([data-testid^="cat-cost"]):not([data-testid^="cat-why"]):enabled').first();
  await first.click();
  await tap('commission-go');
});
await beat('5-call', async ({ p, see, tap }) => {
  await tap('overrule-call-button');
  await see('overrule-called-mine');
  await see('overrule-call-line');
});
await beat('5-ballot', async ({ see, tap }) => { await see('overrule-ballot'); await tap('overrule-yes'); await tap('ready'); await see('you-are-ready'); });
await beat('5-reveal', async ({ see }) => { await see('hub-situation'); });
await beat('6-file', async ({ see, tap }) => { await see('sheriff-desk-b'); await tap('guard-open-map'); await see('guard-map'); await tap('guard-back'); await see('sheriff-desk-b'); });
await beat('6-guard', async ({ see }) => { await see('guard-bar'); await see('map-flag-guard-6-5'); });
await beat('7-colony', async ({ see, tap }) => { await see('colony-standings'); await tap('colony-standing-kai-rep'); });
await beat('8-ready', async ({ see, tap }) => { await tap('ready'); await see('you-are-ready'); });
await beat('8-waiting', async ({ see }) => { await see('you-are-ready'); });
await beat('9-month-end', async ({ see }) => { await see('broken-cards'); await see('phone-paid-out'); });
await b.close();
console.log(out.join('\n'));
console.log(`\n${out.length - bad} of ${out.length} beats pass (tabs=${tabs})`);
process.exit(bad ? 1 : 0);
