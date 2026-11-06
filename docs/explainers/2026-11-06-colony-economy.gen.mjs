// Generates docs/explainers/2026-11-06-colony-economy.html: the colony economy explainer Heiko approves from.
// Run: node docs/explainers/2026-11-06-colony-economy.gen.mjs <out.html> <ws7-colonists.html> [pricing-sim.json]
// WS5 writes the use table, the demand and the store's prices; WS7's colonist sections are read from its own page
// (docs/explainers/colony-needs-colonists.html on ws7-colony-needs) so its part has one source. Every price on the
// page is computed here from the store-pricing rework's rules, so page and spec agree.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [OUT, WS7, SIM] = process.argv.slice(2);
if (!OUT || !WS7) throw new Error('usage: gen.mjs <out.html> <ws7-colonists.html> [pricing-sim.json]');

// ---------- the store's pricing rules (spec: "Rework, 6 Nov") ----------
const N = 30; // Food's normal price
const BANDS = [
  { key: 'normal', name: 'Normal', from: 2, to: 4.2, mult: 1, under: 0.15, over: 0.15 },
  { key: 'tight', name: 'Tight', from: 1, to: 2, mult: 1.25, under: 0.15, over: 0.2 },
  { key: 'short', name: 'Shortage', from: 0.5, to: 1, mult: 2, under: 0.1, over: 0.25 },
  { key: 'severe', name: 'Severe shortage', from: 0, to: 0.5, mult: 4, under: 0.1, over: 0.25 },
];
const lines = (mid, b) => {
  const buy = Math.max(1, Math.floor(mid * (1 - b.under) + 1e-9));
  return { mid, buy, sell: Math.max(buy + 1, Math.ceil(mid * (1 + b.over) - 1e-9)) };
};
const bandAt = (m) => BANDS.find((b) => m >= b.from) ?? BANDS[3];
const priced = BANDS.map((b) => ({ ...b, ...lines(Math.round(N * b.mult), b) }));
const fallA = [120]; while (fallA.at(-1) > N) fallA.push(Math.max(N, Math.round(fallA.at(-1) * 0.75)));
// Half the gap a month, settling at normal once the gap is under 2 credits (the chart shows six months).
const fallB = [120]; while (fallB.length < 7 && fallB.at(-1) > N) { const gap = (fallB.at(-1) - N) / 2; fallB.push(gap < 2 ? N : Math.round(N + gap)); }
const fallC = [120, N];

// ---------- measured: the 10 seed-1 games (colony-needs spec, WS5's measurement table) ----------
const DEMAND = { // store demand a month, politics on, 12-month mean
  today: { Food: 18.1, Water: 12.8, Energy: 17.4 },
  after: { Food: 19.3, Water: 16.6, Energy: 18.6 },
};
const sim = SIM && existsSync(SIM) ? JSON.parse(readFileSync(SIM, 'utf8')) : null;

// ---------- the use table ----------
const USE = [
  ['Farm (Food)', '¼', '½', '1', 'a farm drinks: irrigation'],
  ['Well (Water)', '¼', '—', '1', 'its crew drinks at the well'],
  ['Energy plant', '¼', '½', '1, from its own output', 'cooling water'],
  ['Smithore mine', '½', '¼', '2', 'miners eat twice a farmhand’s Food'],
  ['Crystite mine', '¾', '½', '2', 'deep, hot shafts: the hungriest crew'],
  ['Rare-earth mine', '½', '¼', '2', 'as Smithore'],
  ['Alloy works', '½', '½', 'its recipe + 1', 'quench water and a furnace'],
  ['Electronics works', '½', '¼', 'its recipe + 2', 'clean rooms burn the most'],
  ['Medicine lab', '½', '½', 'its recipe + 1', ''],
  ['Green belt', '—', '½', '—', 'a park is watered'],
];

// ---------- WS7's sections, read from its page ----------
const ws7 = readFileSync(WS7, 'utf8');
const main = ws7.slice(ws7.indexOf('<main>') + 6, ws7.indexOf('</main>'));
const sections = Object.fromEntries(
  main.split(/(?=<h2>)/).filter((s) => s.startsWith('<h2>')).map((s) => [s.slice(4, s.indexOf('</h2>')), s.slice(s.indexOf('</h2>') + 5)]),
);
const need = (title) => {
  const key = Object.keys(sections).find((k) => k.startsWith(title));
  if (!key) throw new Error(`WS7's page has no section "${title}…"; found: ${Object.keys(sections).join(' | ')}`);
  return sections[key];
};
const ws7See = need("What you'll see");
const ws7Mood = need('How the shortfall');
const ws7Example = need('Worked example');
const ws7Measure = need('How often');
// WS7's measurement rows: rule, Restless %, Unhappy %, Unrest %, games ending in Unrest, colonists at the end.
const moodRows = [...ws7Measure.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1].replace(/<[^>]*>/g, '').trim()))
  .filter((c) => c.length >= 6 && /%/.test(c[1]));
const pickMood = (re) => moodRows.find((c) => re.test(c[0]));
const moodCompare = [['Today', pickMood(/^Today$/)], ['First numbers', pickMood(/first/i)], ['Softer numbers (recommended)', pickMood(/numbers above|softer/i)]];
if (moodCompare.some(([, r]) => !r)) throw new Error(`WS7's measurement table changed: rows ${moodRows.map((c) => c[0]).join(' | ')}`);
const ws7Decisions = [...need('Decisions').matchAll(/<div class="decision">[\s\S]*?<\/div>/g)].map((m) => m[0]);

// ---------- charts ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function priceChart() {
  const W = 680, H = 320, L = 56, R = 16, T = 20, B = 44;
  const xMax = 4, yMax = 170;
  const x = (m) => L + (m / xMax) * (W - L - R);
  const y = (p) => T + (1 - p / yMax) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="pc-t pc-d" class="chart"><title id="pc-t">The store's Food price against months of cover</title><desc id="pc-d">While the colony eats more Food than it makes: severe below half a month of cover (store sells at 150), shortage to one month (75), tight to two months (46), normal from two months (35).</desc>`;
  BANDS.forEach((b, i) => {
    s += `<rect x="${x(b.from)}" y="${T}" width="${x(Math.min(b.to, xMax)) - x(b.from)}" height="${H - T - B}" class="${i % 2 ? 'bandA' : 'bandB'}"/>`;
    s += `<text x="${(x(b.from) + x(Math.min(b.to, xMax))) / 2}" y="${H - B - 6}" text-anchor="middle" class="bandname">${b.name}</text>`;
  });
  for (const p of [0, 40, 80, 120, 160]) s += `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end" class="tick">${p}</text>`;
  const asc = [...priced].sort((a, b) => a.from - b.from);
  for (const m of [0, 0.5, 1, 2, 3, 4]) s += `<text x="${x(m)}" y="${H - B + 16}" text-anchor="middle" class="tick">${m}</text>`;
  s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="axis"/>`;
  const series = [['sell', 'var(--s2)', 'Store sells at'], ['mid', 'var(--ink2)', 'Store price'], ['buy', 'var(--s1)', 'Store buys at']];
  for (const [k, color] of series) {
    let d = '';
    for (const b of asc) d += `${d ? 'L' : 'M'}${x(b.from)},${y(b[k])} L${x(Math.min(b.to, xMax))},${y(b[k])} `;
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${k === 'mid' ? 1.5 : 2.5}" ${k === 'mid' ? 'stroke-dasharray="4 4"' : ''}/>`;
  }
  for (const b of priced) {
    const cx = (x(b.from) + x(Math.min(b.to, xMax))) / 2;
    s += `<text x="${cx}" y="${y(b.sell) - 6}" text-anchor="middle" class="lbl">${b.sell}</text><text x="${cx}" y="${y(b.buy) + 15}" text-anchor="middle" class="lbl">${b.buy}</text>`;
  }
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="axislabel">Months of Food the colony holds, at what it eats in a month</text>`;
  s += `<text x="14" y="${(T + H - B) / 2}" transform="rotate(-90 14 ${(T + H - B) / 2})" text-anchor="middle" class="axislabel">Credits per unit</text></svg>`;
  const legend = series.map(([, c, n]) => `<span class="key"><i style="background:${c}"></i>${n}</span>`).join('');
  return `<figure>${s}<div class="legend">${legend}</div><figcaption>While the colony eats more Food than its farms make. When the farms keep up, the price stays normal whatever the shelf holds.</figcaption></figure>`;
}

function fallChart() {
  const W = 680, H = 260, L = 56, R = 16, T = 16, B = 40, months = 6, yMax = 130;
  const x = (i) => L + (i / months) * (W - L - R);
  const y = (p) => T + (1 - p / yMax) * (H - T - B);
  const runs = [['A', 'A quarter a month (recommended)', 'var(--s1)', fallA], ['B', 'Half the gap a month', 'var(--s3)', fallB], ['C', 'Straight back', 'var(--s2)', fallC]];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="fc-t" class="chart"><title id="fc-t">Food's store price after a severe shortage ends, three ways of falling back</title>`;
  for (const p of [0, 30, 60, 90, 120]) s += `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end" class="tick">${p}</text>`;
  for (let i = 0; i <= months; i++) s += `<text x="${x(i)}" y="${H - B + 16}" text-anchor="middle" class="tick">${i === 0 ? 'crisis' : `+${i}`}</text>`;
  for (const [, , c, data] of runs) {
    const pts = [...data, ...Array(months + 1 - data.length).fill(N)].slice(0, months + 1);
    s += `<polyline points="${pts.map((p, i) => `${x(i)},${y(p)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    pts.forEach((p, i) => (s += `<circle cx="${x(i)}" cy="${y(p)}" r="3" fill="${c}"><title>${i === 0 ? 'the crisis month' : `${i} month${i > 1 ? 's' : ''} after`}: ${p}</title></circle>`));
  }
  s += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle" class="axislabel">Months after the colony holds enough Food again</text></svg>`;
  const legend = runs.map(([, n, c]) => `<span class="key"><i style="background:${c}"></i>${n}</span>`).join('');
  return `<figure>${s}<div class="legend">${legend}</div><figcaption>The store price (before its spread). A quarter a month: ${fallA.join(' → ')}.</figcaption></figure>`;
}

function bars(title, groups, unit, note) {
  // groups: [{ label, today, after }]
  const W = 680, rowH = 46, L = 120, R = 70, T = 8;
  const H = T + groups.length * rowH + 8;
  const max = Math.max(...groups.flatMap((g) => [g.today, g.after])) || 1;
  const x = (v) => L + (v / max) * (W - L - R);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" class="chart">`;
  groups.forEach((g, i) => {
    const y0 = T + i * rowH;
    s += `<text x="${L - 10}" y="${y0 + 22}" text-anchor="end" class="lbl">${esc(g.label)}</text>`;
    s += `<rect x="${L}" y="${y0 + 4}" width="${Math.max(1, x(g.today) - L)}" height="16" rx="3" fill="var(--axis)"/><text x="${x(g.today) + 6}" y="${y0 + 17}" class="tick">${g.today}${unit}</text>`;
    s += `<rect x="${L}" y="${y0 + 22}" width="${Math.max(1, x(g.after) - L)}" height="16" rx="3" fill="var(--s1)"/><text x="${x(g.after) + 6}" y="${y0 + 35}" class="tick">${g.after}${unit}</text>`;
  });
  s += '</svg>';
  return `<figure>${s}<div class="legend"><span class="key"><i style="background:var(--axis)"></i>Today</span><span class="key"><i style="background:var(--s1)"></i>Proposed</span></div><figcaption>${note}</figcaption></figure>`;
}

function moodBars() {
  const W = 680, rowH = 54, L = 210, R = 70, T = 8;
  const cols = [['Restless', 'var(--s3)'], ['Unhappy', 'var(--s2)'], ['Unrest', 'var(--open, #a3471f)']];
  const H = T + moodCompare.length * rowH;
  const x = (v) => L + (v / 100) * (W - L - R);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of month ends in each mood, three rules side by side" class="chart">`;
  moodCompare.forEach(([name, r], i) => {
    const y0 = T + i * rowH;
    let at = 0;
    s += `<text x="${L - 10}" y="${y0 + 20}" text-anchor="end" class="lbl">${esc(name)}</text><text x="${L - 10}" y="${y0 + 36}" text-anchor="end" class="tick">${esc(r[5])} colonists at the end</text>`;
    cols.forEach(([, c], k) => {
      const v = parseFloat(r[k + 1]);
      if (v > 0) s += `<rect x="${x(at)}" y="${y0 + 6}" width="${x(at + v) - x(at)}" height="26" fill="${c}"><title>${cols[k][0]}: ${v}%</title></rect>${v >= 8 ? `<text x="${(x(at) + x(at + v)) / 2}" y="${y0 + 24}" text-anchor="middle" class="barv">${v}%</text>` : ''}`;
      at += v;
    });
  });
  s += '</svg>';
  const legend = cols.map(([n, c]) => `<span class="key"><i style="background:${c}"></i>${n}</span>`).join('');
  return `<figure>${s}<div class="legend">${legend}</div><figcaption>Share of the 120 month ends (ten simulated games, politics on) in each mood, and how many colonists are left of the 100 at the start.</figcaption></figure>`;
}

function flow() {
  const box = (x, y, w, h, t, sub = '', cls = 'node') => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="${cls}"/><text x="${x + w / 2}" y="${y + (sub ? h / 2 - 2 : h / 2 + 5)}" text-anchor="middle" class="nodet">${t}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 15}" text-anchor="middle" class="nodes">${sub}</text>` : ''}</g>`;
  const arrow = (d, label = '', lx = 0, ly = 0) => `<path d="${d}" class="flowline" marker-end="url(#ah)"/>${label ? `<text x="${lx}" y="${ly}" text-anchor="middle" class="flowlbl">${label}</text>` : ''}`;
  return `<figure><svg viewBox="0 0 680 330" role="img" aria-labelledby="fl-t fl-d" class="chart"><title id="fl-t">How the colony's economy fits together</title><desc id="fl-d">Plots produce. Players' households and crews eat from players' own stock; colonists eat from the store first. The store compares what it holds with what everyone needs, which sets its price, and the colonists' shortfall sets their mood.</desc>
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>
${box(20, 20, 170, 60, 'Plots produce', 'farms, wells, mines, works')}
${box(255, 20, 170, 60, "Players' stock", 'what each player holds')}
${box(490, 20, 170, 60, 'Households and crews', 'eat by plot type')}
${box(255, 150, 170, 60, "The store's shelf", 'bought from players')}
${box(490, 150, 170, 60, 'Colonists', 'eat from the store, free')}
${box(20, 150, 170, 60, 'What everyone needs', 'players + crews + colonists', 'node accent')}
${box(20, 255, 170, 56, 'Store price', 'normal · tight · short · severe', 'node accent')}
${box(490, 255, 170, 56, "Colonists' mood", 'by how short they went', 'node accent')}
${arrow('M190,50 L253,50', 'output', 222, 42)}
${arrow('M425,50 L488,50', 'eat first', 457, 42)}
${arrow('M340,80 L340,148', 'sell / buy', 380, 118)}
${arrow('M425,180 L488,180', 'need', 457, 172)}
${arrow('M253,180 L192,180', 'holds', 222, 172)}
${arrow('M105,210 L105,253', 'months of cover', 160, 236)}
${arrow('M575,210 L575,253', 'shortfall', 610, 236)}
${arrow('M190,283 L255,283 L340,283 L340,212', 'sets the lines', 300, 276)}
</svg><figcaption>Read left to right: what the plots make is eaten first by the players' own people, the store holds the rest, colonists eat from the store, and the gap between what the colony holds and what it needs sets the store's price.</figcaption></figure>`;
}

// ---------- the page ----------
const bandRows = [
  ['Normal', 'The colony holds 30 (just over two months), or its farms make more than it eats', 30, priced[0]],
  ['Tight', 'Holds 20 (about a month and a half), farms make 10 of the 14 it eats', 38, priced[1]],
  ['Shortage', 'Holds 10 (under a month), farms make 8', 60, priced[2]],
  ['Severe shortage', 'Holds 4, or the colonists went short of Food last month', 120, priced[3]],
];
const simBlock = sim
  ? `<p>Ten simulated games, four computer players, twelve months each, today's rules against the whole proposal (the use table, the colonists' full need, colonists eating free, and the new store prices).</p>
${sim.charts.map((c) => `<h3>${esc(c.title)}</h3>\n${bars(c.title, c.groups, c.unit, c.note)}`).join('\n')}
<p>${sim.note}</p>`
  : '<p class="pending">The store-price simulation is still running; this section fills in when it is done.</p>';

const d6 = ws7Decisions.findIndex((d) => /supply/i.test(d.slice(0, d.indexOf('</h3>'))));
if (d6 < 0) throw new Error("WS7's supply decision is missing");
const decisions = [
  ws7Decisions[d6],
  `<div class="decision"><h3>How hungry are crews?</h3>
<ul><li><b>The table above.</b> Each kind of plot has its own needs; Water demand rises by about a third; Food stays at today's rate. <i>For:</i> no new hunger on a colony that is already short. <i>Against:</i> crews are a steady, not a steep, Food demand.</li>
<li><b>Hungrier crews</b> (mines and works eat three quarters of a Food each, Crystite miners a whole one). <i>For:</i> crews are clearly the colony's main demand. <i>Against:</i> without more Food supply it deepens a shortage that already shows in nine months of ten.</li></ul>
<p class="rec"><b>Recommended: the table above</b>, and revisit it with the Food supply numbers.</p></div>`,
  `<div class="decision"><h3>What counts as the colony's stock?</h3>
<ul><li><b>The store's shelf plus what players hold.</b> <i>For:</i> it is the overall supply you described; a colony whose players hold Food is not short. <i>Against:</i> a player hoarding Food keeps the price normal while others go short.</li>
<li><b>The store's shelf only.</b> <i>For:</i> exactly what the store can see. <i>Against:</i> the store usually holds less than a month while players hold the rest, so prices would sit in the shortage bands most months.</li></ul>
<p class="rec"><b>Recommended: shelf plus players.</b> We simulated both: counting only the shelf was worse on every count, including the colonists' Food.</p></div>`,
  `<div class="decision"><h3>Steps or a smooth curve?</h3>
<ul><li><b>Four steps</b> (the chart above). <i>For:</i> easy to say at the table: "Food is short". <i>Against:</i> the price jumps at a step's edge (38 to 60).</li>
<li><b>A smooth curve</b> through the same points. <i>For:</i> no jumps. <i>Against:</i> no name for the state the colony is in.</li>
<li><b>A rise each month while it lasts</b> (+15%, +40%, +80% a month by band). <i>For:</i> a long shortage keeps climbing. <i>Against:</i> the price depends on history, is hard to predict, and overshoots when supply returns.</li></ul>
<p class="rec"><b>Recommended: four steps.</b></p></div>`,
  `<div class="decision"><h3>How fast does the price come down?</h3>
<ul><li><b>A quarter a month</b> (120 to 30 in five months). <i>For:</i> a crisis is felt for a while, then forgotten. <i>Against:</i> Food stays dear a few months after the farms recover.</li>
<li><b>Half the gap a month</b> (about four months).</li><li><b>Straight back to normal.</b> <i>For:</i> simplest. <i>Against:</i> no memory of the crisis; the price snaps.</li></ul>
<p class="rec"><b>Recommended: a quarter a month.</b> The chart above shows all three.</p></div>`,
  `<div class="decision"><h3>Can a glut push the price below normal?</h3>
<ul><li><b>Never</b>: normal is the lowest price, as you put it; a full store simply stops buying. <i>For:</i> your rule as written; one rule fewer. <i>Against:</i> players who over-produce feel it only when the store stops buying, not in its price. This drops yesterday's "glut step" (after the store stopped buying, its next buying price was lower).</li>
<li><b>A surplus step at 80% of normal</b> when the colony holds three months or more. <i>For:</i> a gentle signal to stop over-producing. <i>Against:</i> a second rule beside your five.</li></ul>
<p class="rec"><b>Recommended: never below normal.</b></p></div>`,
  `<div class="decision"><h3>How hard does a high trade between players pull the store's price?</h3>
<ul><li><b>Halfway</b> to what players paid (a shortage price of 60 after a trade at 95 becomes 78).</li><li><b>All the way</b> (the store sells at what players paid). <i>Against:</i> one desperate buyer sets the whole colony's price.</li><li><b>A quarter of the way.</b> <i>Against:</i> barely noticed.</li></ul>
<p class="rec"><b>Recommended: halfway.</b> If the store had sold out while they traded, it opens next month selling at what they paid, as agreed yesterday.</p></div>`,
  ...ws7Decisions.filter((_, i) => i !== d6),
].map((d, i) => d.replace(/<h3>(?:\d+\s*·\s*)?/, `<h3>${i + 1} · `));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Colony economy</title>
<style>
:root { color-scheme: light;
  --ink:#1d2233; --ink-soft:#545b70; --paper:#f5f6f9; --panel:#ffffff; --line:#d9dce5; --accent:#b5651d; --accent-soft:#f6e7d6;
  --font-display:"Chakra Petch","Trebuchet MS",sans-serif; --font-body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
  --bg:var(--paper); --surface:var(--panel); --ink2:var(--ink-soft); --muted:#7a8094; --grid:#e3e5ec; --axis:#b9bdcb; --ring:rgba(29,34,51,0.12);
  --s1:#1f5fa8; --s2:#b5651d; --s3:#2f7d4f; --bandA:rgba(29,34,51,0.05); --bandB:rgba(29,34,51,0); --tol:rgba(31,95,168,0.08); --rec:var(--accent); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark;
  --ink:#e4e7f0; --ink-soft:#a3a9bb; --paper:#141722; --panel:#1c2030; --line:#2f3448; --accent:#e8a35c; --accent-soft:#3a2b1d;
  --muted:#8d93a6; --grid:#2a2f42; --axis:#4a5068; --ring:rgba(228,231,240,0.14); --s1:#8ab8f0; --s2:#e8a35c; --s3:#7fd3a0;
  --bandA:rgba(228,231,240,0.06); --tol:rgba(138,184,240,0.12); } }
:root[data-theme="dark"] { color-scheme: dark;
  --ink:#e4e7f0; --ink-soft:#a3a9bb; --paper:#141722; --panel:#1c2030; --line:#2f3448; --accent:#e8a35c; --accent-soft:#3a2b1d;
  --muted:#8d93a6; --grid:#2a2f42; --axis:#4a5068; --ring:rgba(228,231,240,0.14); --s1:#8ab8f0; --s2:#e8a35c; --s3:#7fd3a0;
  --bandA:rgba(228,231,240,0.06); --tol:rgba(138,184,240,0.12); }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.6 var(--font-body); }
main { max-width: 780px; margin: 0 auto; padding: 24px 16px 72px; }
h1, h2, h3 { font-family: var(--font-display); line-height: 1.25; }
h1 { font-size: 30px; margin: 8px 0 4px; } h2 { font-size: 22px; margin: 44px 0 8px; padding-top: 12px; border-top: 1px solid var(--line); } h3 { font-size: 17px; margin: 24px 0 6px; }
.sub { color: var(--ink-soft); margin-top: 0; }
.lead { background: var(--accent-soft); border-radius: 12px; padding: 4px 18px; }
figure { margin: 16px 0; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
figcaption { color: var(--ink-soft); font-size: 14px; margin-top: 6px; }
.chart { width: 100%; height: auto; display: block; }
.grid { stroke: var(--grid); stroke-width: 1; } .axis { stroke: var(--axis); stroke-width: 1; }
.tick { fill: var(--muted); font-size: 11px; } .axislabel { fill: var(--ink2); font-size: 12px; } .lbl { fill: var(--ink); font-size: 12px; }
.bandname { fill: var(--muted); font-size: 11px; } .barv { fill: #fff; font-size: 12px; font-weight: 600; } .bandA { fill: var(--bandA); } .bandB { fill: var(--bandB); } .tol { fill: var(--tol); }
.hit { fill: transparent; } .hit:hover { fill: var(--ring); }
.node { fill: var(--panel); stroke: var(--axis); stroke-width: 1.5; } .node.accent { fill: var(--accent-soft); stroke: var(--accent); }
.nodet { fill: var(--ink); font-size: 14px; font-weight: 600; } .nodes { fill: var(--ink2); font-size: 11px; }
.flowline { fill: none; stroke: var(--ink2); stroke-width: 1.5; } .arrowhead { fill: var(--ink2); } .flowlbl { fill: var(--muted); font-size: 11px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--ink-soft); margin-top: 6px; }
.key i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
details { margin-top: 8px; font-size: 14px; } summary { cursor: pointer; color: var(--ink-soft); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 8px 0; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; } th { color: var(--ink-soft); font-weight: 600; }
.decision { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 4px 16px 12px; margin: 16px 0; }
.rec { border-left: 3px solid var(--rec); padding-left: 10px; }
.pending { color: var(--ink-soft); font-style: italic; }
</style>
</head>
<body>
<main>
<p class="sub">Colony economy · a proposal for you to approve · nothing is built yet</p>
<h1>How the colony eats, and what the store charges</h1>
<p>Four parts that work as one: what each kind of plot uses, what the whole colony needs, how the store prices a good from that, and how colonists feel when they go short. ${decisions.length} decisions for you are at the end, each with a recommendation.</p>

<h2>What you'll see at the table</h2>
<div class="lead">
<ul>
<li><b>Every kind of plot has its own appetite.</b> Miners eat more, farms and power plants drink, works burn extra Energy. A player with a big estate buys more Water than before; Food stays at about today's amount.</li>
<li><b>The store knows what the whole colony needs</b>: players, their crews and the colonists. While the colony holds enough, it sells at the normal price (Food 30) and never below.</li>
<li><b>When the colony eats more than it makes</b> and holds under two months of a good, the store's price steps up: a little when it's tight, sharply in a shortage, very sharply in a severe one. In a shortage the store also pays much more when you sell it Food.</li>
<li><b>If players pay each other far more than the store asked</b>, the store's price jumps towards that.</li>
<li><b>Once the colony holds enough again</b>, the price comes down a quarter each month.</li>
<li>The phone's market strip, the auction and the TV all show the same store price.</li>
</ul>
${ws7See}
</div>

<div class="decision"><h3>First: the colony is underfed today</h3>
<p>In ten simulated games of today's colony, the store runs out of Food for players in about nine months of ten, and colonists go short of Food or Water in 91 of 120 months. Every rule below reads that shortage more honestly than today, so on today's supply each of them makes the colony look worse, not better. That is why the first decision asks to bring the hardship rules in together with more supply, tuned in one pass.</p></div>

<h2>How it fits together</h2>
${flow()}

<h2>What each kind of plot uses</h2>
<p>A player's household eats 2 Food and drinks 1 Water a month, as today. On top of that, every plot they work uses this much a month. The quarters add up across a player's plots and are rounded up once.</p>
<div class="scroll"><table><thead><tr><th>The plot</th><th>Food</th><th>Water</th><th>Energy</th><th>Why</th></tr></thead><tbody>
${USE.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>
<p>Three estates, today's needs → the proposal's (Food / Water a month): three farms and a well, 3 / 2 → 3 / 3; two Smithore mines, a Crystite mine and a power plant, 3 / 2 → 4 / 3; two works and two Smithore mines, 4 / 2 → 4 / 3, and their Energy 7 → 10. Crews still eat from their own player's stock, never from the store: feeding the crew or selling the Food stays the player's choice.</p>

<h2>What the whole colony needs</h2>
<p>The store adds up what every player's household and crews need, the Energy their plots burn, and what the colonists need, all of it, at any price, because colonists no longer pay. Measured over ten simulated games:</p>
${bars('Store demand a month', [
    { label: 'Food', today: DEMAND.today.Food, after: DEMAND.after.Food },
    { label: 'Water', today: DEMAND.today.Water, after: DEMAND.after.Water },
    { label: 'Energy', today: DEMAND.today.Energy, after: DEMAND.after.Energy },
  ], '', 'Units a month the store counts as demand, mean over twelve months of ten games. Water rises most, to about 20 by the end of a game, as farms and plants spread.')}
<p><b>Worth knowing:</b> the colony is short of Food today, before any change. In the same games the store runs out of Food for players in about nine months of ten, and players start most months with less Food than they eat. Neither the use table nor the new prices cause that, and neither fixes it: it is how much Food the colony grows, which is a separate decision on supply.</p>

<h2>How the store sets its price</h2>
<p>Once a month, for each good, the store compares what the colony holds with what it needs in a month: its <b>months of cover</b>. It also checks whether the colony makes as much as it eats. If it does, or if the colony holds two months or more, the price is normal. Otherwise the price steps up by how little is left.</p>
${priceChart()}
<h3>A Food month in each step</h3>
<p>Four players and 100 colonists need about 14 Food a month. Normal Food price 30.</p>
<div class="scroll"><table><thead><tr><th>Step</th><th>The colony</th><th>Store price</th><th>Store buys at</th><th>Store sells at</th></tr></thead><tbody>
${bandRows.map(([n, c, , b]) => `<tr><td>${n}</td><td>${c}</td><td>${b.mid}</td><td>${b.buy}</td><td>${b.sell}</td></tr>`).join('\n')}
<tr><td>Shortage, after a high trade</td><td>Holds 10, and last month two players traded Food at 95</td><td>78</td><td>70</td><td>98</td></tr>
</tbody></table></div>
<p>The store's own margin widens as goods run short (15% either side when normal, up to 10% under and 25% over in a shortage), but both its prices move up together, so selling Food to the store pays well exactly when the colony needs it. No price ever goes above twelve times normal.</p>
<h3>Coming back down</h3>
${fallChart()}

<h2>How colonists feel when they go short</h2>
${ws7Mood}
<h3>Three months, worked through</h3>
${ws7Example}
<h3>How often each mood shows up</h3>
${moodBars()}
${ws7Measure}

<h2>Before and after: ten simulated games</h2>
${simBlock}

<h2>Decisions for you</h2>
${decisions.join('\n')}
</main>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`wrote ${OUT}: ${decisions.length} decisions, ${(html.length / 1024).toFixed(0)} KB`);
