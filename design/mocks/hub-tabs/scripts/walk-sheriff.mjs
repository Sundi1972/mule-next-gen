// The Sheriff month (?path=sheriff), played with real taps on each beat's phone, as each seat it concerns. Not part of
// the mock itself.   node scripts/walk-sheriff.mjs <base-url> [left|bottom]
import { chromium } from 'playwright';
const base = process.argv[2];
const tabs = process.argv[3] ?? 'left';
const b = await chromium.launch();
const out = [];
let bad = 0;
async function beat(id, as, fn) {
  const p = await b.newPage({ viewport: { width: 1700, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/?path=sheriff&beat=${id}&as=${as}&tabs=${tabs}`, { waitUntil: 'networkidle' });
  const phone = p.getByTestId('phone-frame');
  const see = (tid) => phone.getByTestId(tid).first().waitFor({ state: 'visible', timeout: 3000 });
  const tap = (tid) => phone.getByTestId(tid).first().click();
  /** The phone's text under a test id must hold every one of `words`. */
  /** The TV pane must show `line` (the server's public news line). */
  const tvSays = async (line) => {
    await p.getByTestId('tv-pane').getByText(line, { exact: false }).first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => { throw new Error(`the TV does not show “${line}”`); });
  };
  const says = async (tid, ...words) => {
    await see(tid);
    const t = await phone.getByTestId(tid).first().innerText();
    for (const w of words) if (!t.includes(w)) throw new Error(`${tid} says “${t.replace(/\s+/g, ' ').slice(0, 120)}”, not “${w}”`);
  };
  try {
    await fn({ p, phone, see, tap, says, tvSays });
    if (errs.length) throw new Error(`page errors: ${errs.join(' | ')}`);
    out.push(`ok   ${id} as ${as}`);
  } catch (e) {
    bad++;
    out.push(`FAIL ${id} as ${as}: ${e.message.split('\n')[0]}`);
  }
  await p.close();
}
const ORDER = 'sab-5lexp';
const DARK = 'sab-7lexp';

// 1 · Kai guards Brix's Food plot from the case file, on Overview's map, and comes back.
await beat('s1-guard', 'kai', async ({ see, tap, says, phone }) => {
  await see('sheriff-desk-b');
  await says('guard-count', '0');
  await tap('guard-open-map');
  await see('guard-map');
  await phone.getByTestId('map-plot-9-2').first().click();
  await see('map-flag-guard-9-2');
  await tap('guard-back');
  await see('sheriff-desk-b');
  await says('guard-count', '1');
});
await beat('s1-guarded', 'kai', async ({ see }) => { await see('guard-bar'); await see('map-flag-guard-9-2'); });
// Lena orders the cut from the plot card, sees its terms, withdraws, orders again.
await beat('s1-look', 'lena', async ({ see, tap, says }) => {
  await see('look-plot');
  await tap('sabotage-door');
  await says('order-effect', 'Brix', 'food plot makes nothing');
  await see('order-cost');
  await see('order-success');
  await see('order-detect');
  await tap('order-confirm');
  await says('order-pending', 'The crew cuts the power');
  await tap('order-withdraw');
  // Withdrawn, the order's terms are open again to order once more.
  await see('order-confirm');
});
await beat('s1-look', 'brix', async ({ see, phone }) => {
  await see('look-plot');
  if (await phone.getByTestId('sabotage-door').count()) throw new Error('Brix is offered sabotage on his own plot');
});
await beat('s1-ordered', 'lena', async ({ says }) => { await says('order-pending', 'The crew cuts the power'); });

// 2 · Production: caught at the guarded plot; each phone its own line.
await beat('s2-caught', 'lena', async ({ says }) => { await says(`production-public-${ORDER}`, 'Caught at a guarded plot'); await says(`production-mine-${ORDER}`, 'Caught by a guard at Brix’s plot', 'reputation', 'the Sheriff can fine you'); });
await beat('s2-caught', 'brix', async ({ says }) => { await says(`production-mine-${ORDER}`, 'A guard caught Lena at your Food plot. The power stayed on.'); });
await beat('s2-caught', 'kai', async ({ says }) => { await says(`production-mine-${ORDER}`, 'Your guard caught Lena at Brix’s plot. Fine Lena in planning.'); });
await beat('s2-month-end', 'lena', async ({ says }) => { await says('phone-sabotage', 'Lena was caught by a guard at Brix’s plot', 'Sabotage crew'); });
await beat('s2-month-end', 'brix', async ({ says, phone }) => {
  await says('phone-sabotage', 'Lena was caught by a guard');
  if (await phone.getByTestId(`phone-sabotage-crew-${ORDER}`).count()) throw new Error('Brix sees Lena’s crew');
});

// 3 · Kai fines Lena; Lena's orders say so; half goes to Brix at the month end.
await beat('s3-case', 'kai', async ({ see, tap, says, tvSays }) => {
  await says(`step-chip-${ORDER}`, 'Fine Lena');
  await tap(`b-case-row-${ORDER}`);
  await see(`fine-${ORDER}`);
  await tap(`fine-up-${ORDER}`);
  await says(`fine-value-${ORDER}`, '150');
  await tap(`fine-confirm-${ORDER}`);
  await says(`fined-${ORDER}`, 'Lena');
  await says(`step-chip-${ORDER}`, 'Fined');
  // The fine intent writes the server's public line, the news's first: the TV's one place for it (PM, 8 Nov).
  await tvSays('Lena was fined 150 for sabotage; half to Brix');
});
// Holder-only (PM RULED for the RC): only Kai's phone has a Sheriff sub-tab on this path.
for (const as of ['lena', 'brix']) {
  await beat('s3-case', as, async ({ see, tap, phone }) => {
    await tap('tab-politics');
    await see('sub-laws');
    if (await phone.getByTestId('sub-sheriff').count()) throw new Error(`${as} has a Sheriff sub-tab`);
  });
}
await beat('s3-fined', 'lena', async ({ says, tvSays }) => { await says(`my-order-known-${ORDER}`, 'Everyone knows', 'Fined 150'); await tvSays('Lena was fined 150 for sabotage; half to Brix'); });
await beat('s3-month-end', 'brix', async ({ says }) => { await says('phone-sabotage', 'Lena was fined 150 for sabotage; half to Brix'); await says(`phone-sabotage-restitution-${ORDER}`, '+75 cr'); await says('fund-line-restitution', 'To victims', '75'); await says('fund-line-fine', 'Fines', '150'); });
await beat('s3-month-end', 'lena', async ({ says }) => { await says(`phone-sabotage-fine-${ORDER}`, '150 cr'); });

// 4 · Unguarded, it works; Kai investigates.
await beat('s4-dark', 'brix', async ({ see, says }) => { await see('map-plot-9-2'); await says(`production-public-${DARK}`, 'Someone cut the power'); await says(`production-mine-${DARK}`, 'Your Food plot went dark'); });
await beat('s4-dark', 'lena', async ({ says }) => { await says(`production-mine-${DARK}`, 'Nobody saw'); });
// The production show has no news column; next planning, the unseen cut is the TV's news line.
await beat('s4-investigate', 'kai', async ({ tap, says, tvSays }) => {
  await tvSays('Sabotage: someone cut the power to Brix’s Food plot');
  await tap(`b-case-row-${DARK}`);
  await tap(`investigate-${DARK}`);
  await says(`investigate-result-${DARK}`, 'Lena');
  await says('sheriff-left', 'One investigation a month: used');
});
await beat('s4-solved', 'kai', async ({ tvSays }) => { await tvSays('Solved by the Sheriff: it was Lena'); });
await beat('s4-cold', 'kai', async ({ says, phone, tvSays }) => {
  await tvSays('The trail went cold');
  await says('sheriff-left', 'One investigation a month: used');
  if (await phone.getByTestId(`step-chip-${DARK}`).count()) throw new Error('the cold case wears a chip');
});

console.log(out.join('\n'));
console.log(`\n${out.length - bad} of ${out.length} Sheriff beats pass (tabs=${tabs})`);
await b.close();
process.exit(bad ? 1 : 0);
