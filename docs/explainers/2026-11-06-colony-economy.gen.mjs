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

// ---------- the shortage chain (Heiko, 6 Nov: "think this through completely") ----------
// The one tolerance curve, shared with the colonists' mood (WS7): nothing up to a tenth short, then steeper.
const TOL = 0.1, POW = 1.5;
const gTol = (s) => (s <= TOL ? 0 : ((s - TOL) / (1 - TOL)) ** POW);
const CREW_DROP = 0.5; // a crew with nothing works at half pace
const crewShare = (s) => 1 - CREW_DROP * gTol(s);

function chainDiagram() {
  const lane = (y, h, name) => `<rect x="8" y="${y}" width="664" height="${h}" rx="12" class="lane"/><text x="22" y="${y + 20}" class="lanet">${name}</text>`;
  const box = (x, y, w, h, t, sub = '', cls = 'node') => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" class="${cls}"/><text x="${x + w / 2}" y="${y + (sub ? h / 2 - 3 : h / 2 + 5)}" text-anchor="middle" class="nodet">${t}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 13}" text-anchor="middle" class="nodes">${sub}</text>` : ''}</g>`;
  const goods = (d) => `<path d="${d}" class="flowline" marker-end="url(#ah2)"/>`;
  const effect = (d, l, lx, ly, anchor = 'middle') => `<path d="${d}" class="effline" marker-end="url(#ah3)"/><text x="${lx}" y="${ly}" text-anchor="${anchor}" class="efflbl">${l}</text>`;
  return `<figure><svg viewBox="0 0 680 470" role="img" aria-labelledby="ch-t ch-d" class="chart"><title id="ch-t">What runs short, and what it does, at plot, player and colony level</title><desc id="ch-d">Goods flow down from plots to the player's stock, where the household and crews eat, and on to the store, where colonists eat. Shortages flow back up as effects: a hungry or thirsty crew works slower, a hungry player walks slower and falls sick more easily, a plot without Energy switches off, hungry colonists lose mood and leave, and a short store raises its price.</desc>
<defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker>
<marker id="ah3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="effhead"/></marker></defs>
${lane(8, 130, 'Plot')}${lane(150, 150, 'Player')}${lane(312, 150, 'Colony')}
${box(40, 50, 150, 54, 'Energy for the plot')}
${box(270, 50, 150, 54, 'The plot works', 'Food, Water, mines, works')}
${box(490, 50, 150, 54, 'Its crew', 'eats, drinks by plot type')}
${box(40, 196, 150, 54, 'The player', 'walks, may fall sick', 'node accent')}
${box(270, 196, 150, 54, 'Household', 'eats 2, drinks 1')}
${box(490, 196, 150, 54, "Player's stock")}
${box(40, 360, 150, 54, 'Price and mood', 'and how many stay', 'node accent')}
${box(270, 360, 150, 54, 'Colonists', 'eat from the store, free')}
${box(490, 360, 150, 54, "Store's shelf")}
${goods('M345,104 L345,140 L610,140 L610,194')}<text x="452" y="154" class="flowlbl">output</text>
${goods('M490,223 L422,223')}
${goods('M530,196 L530,106')}<text x="536" y="160" class="flowlbl">crews eat</text>
${goods('M565,250 L565,358')}<text x="572" y="306" class="flowlbl">sold to the store</text>
${goods('M490,387 L422,387')}
${effect('M190,77 L268,77', 'no Energy: off', 229, 122)}
${effect('M490,77 L422,77', 'hungry or thirsty: slower', 456, 122)}
${effect('M270,223 L192,223', 'hungry: slower, sick', 229, 272)}
${effect('M270,387 L192,387', 'short: mood, leave', 229, 434)}
${effect('M640,400 L656,400 L656,452 L115,452 L115,416', 'shelf against need: price', 400, 446)}
</svg><div class="legend"><span class="key"><i style="background:var(--ink2)"></i>Goods move</span><span class="key"><i style="background:var(--s2)"></i>A shortage acts (proposed and today)</span></div>
<figcaption>Read top to bottom for goods, and follow the orange arrows back for what a shortage does. The table below says which of these exist today and which are proposed.</figcaption></figure>`;
}

const MATRIX = [
  ['Food', ['Nothing', 'A crew that went hungry last month works slower: nothing under a tenth short, up to half pace with none'],
           ['Walks slower (60% of pace with no Food)', 'Same, and more likely to fall sick (decision)'],
           ['Colonists shrink 5% whenever short', 'Mood and population follow how short they went; the store price steps up']],
  ['Water', ['Only farms: half output if the owner is short', 'A thirsty crew works slower on every plot, on the same curve; a farm needs its own Water to irrigate'],
            ['Nothing', 'Nothing directly (the crews carry it)'],
            ['Colonists shrink 5% whenever short', 'As Food: the worse of Food and Water counts; the store price steps up']],
  ['Energy', ['Switched off, biggest user first; makes a fifth', 'Unchanged'],
             ['Nothing', 'Unchanged'],
             ['Demand only', 'Unchanged; the store price steps up']],
  ['Medicine, sickness', ['Nothing', 'Nothing'],
             ['Falls sick at random, likelier in dirty air; half pace until cured by Medicine', 'Same; hunger raises the odds (decision)'],
             ['Dirty air raises Medicine demand', 'See the colonists below']],
];
function matrixTable() {
  const cell = ([t, p]) => `<td><span class="today">Today:</span> ${t}<br><span class="prop">Proposed:</span> ${p}</td>`;
  return `<div class="scroll"><table class="matrix"><thead><tr><th>Short of</th><th>Plot</th><th>Player</th><th>Colony</th></tr></thead><tbody>
${MATRIX.map(([g, ...cells]) => `<tr><th>${g}</th>${cells.map(cell).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
}

function crewChart() {
  const W = 680, H = 280, L = 56, R = 120, T = 16, B = 44;
  const x = (s) => L + s * (W - L - R);
  const y = (v) => T + (1 - v) * (H - T - B);
  const xs = Array.from({ length: 21 }, (_, i) => i / 20);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cc-t" class="chart"><title id="cc-t">A plot's output against how short its crew went last month</title>`;
  s += `<rect x="${x(0)}" y="${T}" width="${x(TOL) - x(0)}" height="${H - T - B}" class="tol"/>`;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${v * 100}%</text>`;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += `<text x="${x(v)}" y="${H - B + 16}" text-anchor="middle" class="tick">${v * 100}%</text>`;
  const series = [
    ['Proposed, any plot', 'var(--s1)', xs.map((v) => crewShare(v))],
    ['Today, a farm short of Water', 'var(--s2)', xs.map((v) => (v > 0 ? 0.5 : 1))],
    ['Today, any other plot', 'var(--axis)', xs.map(() => 1)],
  ];
  series.forEach(([n, c, d], k) => {
    s += `<polyline points="${d.map((v, i) => `${x(xs[i])},${y(v) + k * 1.5}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    s += `<text x="${W - R + 6}" y="${y(d.at(-1)) + 4 + k * 12}" class="lbl">${n}</text>`;
  });
  s += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="axislabel">How much of its Food or Water the crew went without last month</text></svg>`;
  return `<figure>${s}<figcaption>The shaded strip is the tolerance: up to a tenth short costs nothing. Food and Water each count, so a crew short of both works slower on both counts. The curve is the colonists' curve, so one rule reads every shortage.</figcaption></figure>`;
}

// ---------- every good: where it comes from, where it goes (Heiko, 6 Nov: "an overview of ALL resources and products") ----------
const here = (f) => new URL(`./${f}`, import.meta.url);
const readIf = (f) => (existsSync(here(f)) ? readFileSync(here(f), 'utf8') : null);
const BAL = JSON.parse(readIf('2026-11-06-colony-economy.balance.json') ?? 'null');
const CREW = JSON.parse(readIf('2026-11-06-colony-economy.crew.json') ?? 'null');
const ws7Chain = readIf('shortage-chain-colony.fragment.html');
const HEALTH = JSON.parse(readIf('2026-11-06-colony-economy.health.json') ?? 'null');
const ws7Health = readIf('colony-health-colonists.fragment.html');
function ws7HealthParts() {
  if (!ws7Health) return { body: '<p class="pending">The colonists’ part is on its way.</p>', decisions: [] };
  const parts = ws7Health.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?section[^>]*>/g, '').replace(/<h2[^>]*>[\s\S]*?<\/h2>/g, '').split(/(?=<h3>)/);
  const keep = parts.filter((p) => p.startsWith('<h3>') && !/Decisions|^<h3>\d/.test(p.slice(0, p.indexOf('</h3>'))));
  return { body: keep.join(''), decisions: [...ws7Health.matchAll(/<div class="decision">[\s\S]*?<\/div>/g)].map((m) => m[0]) };
}
const tableOf = (t) => `<div class="scroll"><table><thead><tr>${t.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

function allGoodsFlow() {
  const C1 = 16, C2 = 262, C3 = 512, BW = 150, BH = 40;
  const raw = ['Food (farm)', 'Water (well)', 'Energy (plant)', 'Smithore (mine)', 'Crystite (mine)', 'Rare earth (mine)'];
  const mid = ['Alloy works', 'Electronics works', 'Medicine lab', 'The store builds MULEs'];
  const uses = ['Households and crews', 'Colonists', 'Every working plot', 'Outfitting a plot (MULE)', 'Colony buildings, filters', 'Sick players', 'The export ship'];
  const yR = (i) => 40 + i * 64, yM = (i) => 72 + i * 92, yU = (i) => 30 + i * 58;
  const box = (x, y, t, cls) => `<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="8" class="${cls}"/><text x="${x + BW / 2}" y="${y + BH / 2 + 4}" text-anchor="middle" class="nodet sm">${t}</text>`;
  const link = (x1, y1, x2, y2, cls = 'gl') => `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}" class="${cls}" marker-end="url(#ah4)"/>`;
  const R = (i) => [C1 + BW, yR(i) + BH / 2], M = (i) => [C2, yM(i) + BH / 2], Mo = (i) => [C2 + BW, yM(i) + BH / 2], U = (i) => [C3, yU(i) + BH / 2];
  const edges = [
    [R(0), U(0)], [R(0), U(1)], [R(0), M(2)],
    [R(1), U(0)], [R(1), U(1)], [R(1), M(2)],
    [R(2), U(2)], [R(2), M(0)], [R(2), M(1)], [R(2), M(2)],
    [R(3), M(0)], [R(3), M(3)], [R(3), U(6)],
    [R(4), U(6)], [R(4), U(4)],
    [R(5), M(1)], [R(5), U(6)],
    [Mo(0), U(4)], [Mo(0), U(6)], [Mo(1), U(4)], [Mo(1), U(6)], [Mo(2), U(5)], [Mo(2), U(6)], [Mo(3), U(3)],
  ];
  let s = `<svg viewBox="0 0 680 450" role="img" aria-labelledby="ag-t ag-d" class="chart"><title id="ag-t">Every good, from the ground to its uses</title><desc id="ag-d">Farms, wells and plants feed households, crews, colonists and every working plot. Smithore goes to Alloy works, to the store's MULE building and to the ship. Rare earth and Alloy make Electronics. Food, Water and Energy make Medicine. Alloy and Electronics go to colony buildings and the ship; Medicine cures sick players; Crystite goes to the ship and one colony building.</desc>
<defs><marker id="ah4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>
<text x="${C1 + BW / 2}" y="18" text-anchor="middle" class="axislabel">From the ground</text><text x="${C2 + BW / 2}" y="18" text-anchor="middle" class="axislabel">Made from other goods</text><text x="${C3 + BW / 2}" y="18" text-anchor="middle" class="axislabel">Used by</text>`;
  // Each line takes the colour of the good it carries: the six raw goods, then the three products and MULEs.
  const carries = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 3];
  s += edges.map(([[a, b], [c, d]], i) => link(a, b, c - 2, d, `gl g${carries[i]}`)).join('');
  s += link(C2 + BW / 2, yM(0) + BH, C2 + BW / 2, yM(1) - 2, 'gl strong');
  s += `<text x="${C2 + BW / 2 + 6}" y="${(yM(0) + BH + yM(1)) / 2 + 4}" class="flowlbl">Alloy</text>`;
  raw.forEach((t, i) => (s += box(C1, yR(i), t, 'node')));
  mid.forEach((t, i) => (s += box(C2, yM(i), t, 'node accent')));
  uses.forEach((t, i) => (s += box(C3, yU(i), t, 'node')));
  const keyC = [['Food', 'food'], ['Water', 'water'], ['Energy', 'energy'], ['Smithore', 'smithore'], ['Crystite', 'crystite'], ['Rare earth', 'rare']];
  const key = keyC.map(([n, c]) => `<span class="key"><i style="background:var(--c-${c})"></i>${n}</span>`).join('') + '<span class="key"><i style="background:var(--ink2)"></i>Alloy, Electronics, Medicine, MULEs (dashed)</span>';
  return `<figure>${s}</svg><div class="legend">${key}</div><figcaption>Recipes: an Alloy works turns 2 Smithore and 2 Energy into 2 Alloy; an Electronics works turns 1 Rare earth, 1 Alloy and 1 Energy into 1 Electronics; a Medicine lab turns 1 Food, 1 Water and 1 Energy into 2 Medicine; the store builds a MULE from 1 Smithore. Colony buildings take Alloy, Electronics and, for the observatory, Crystite.</figcaption></figure>`;
}

const MATRIX_ALL = [
  ['Energy', ['Switched off, biggest user first; makes a fifth', 'Unchanged'], ['Nothing', 'Unchanged'], ['A price only', 'A price only; steps up in a shortage']],
  ['Water', ['A farm makes half if its owner holds too little', 'A thirsty crew works slower on every plot; a farm’s own Water is its irrigation'], ['Nothing', 'Nothing'], ['Colonists shrink 5% whenever short', 'As Food; the store price steps up']],
  ['Food', ['Nothing', 'A crew that went hungry last month works slower (curve below)'], ['Walks slower, down to 60% with none', 'Same; hunger read from whether the household ate (decision)'], ['Colonists shrink 5% whenever short', 'Mood and population follow how short; the store price steps up']],
  ['Smithore', ['Nothing', 'Unchanged'], ['No MULE to buy, so a plot stays idle', 'Unchanged'], ['The corral sells out; MULEs 15% dearer next month', 'Unchanged; the store price steps up']],
  ['MULEs', ['A plot cannot be outfitted', 'Unchanged'], ['The store refuses the purchase', 'Unchanged'], ['Price rises while the corral sells out', 'Unchanged, capped like every price']],
  ['Crystite', ['Nothing', 'Unchanged'], ['Nothing', 'Unchanged'], ['The ship gets less; the observatory waits', 'Unchanged']],
  ['Rare earth', ['An Electronics works cannot run', 'Unchanged'], ['Nothing', 'Unchanged'], ['The ship gets less', 'Unchanged']],
  ['Alloy', ['An Electronics works cannot run', 'Unchanged'], ['No pollution filter', 'Unchanged'], ['Park, stadium, spaceport wait', 'Unchanged']],
  ['Electronics', ['Nothing', 'Unchanged'], ['Nothing', 'Unchanged'], ['Hospital, stadium, spaceport wait; no other building starts meanwhile', 'Unchanged']],
  ['Medicine', ['Nothing', 'Unchanged'], ['A sick player walks at half pace until cured', 'Same; hunger may raise the odds (decision)'], ['A price only', 'Hungry colonists need more; a shortfall counts half in their hardship (colonists’ decisions)']],
];
function matrixAll() {
  const cell = ([t, p]) => `<td><span class="today">Today:</span> ${t}<br><span class="prop">Proposed:</span> ${p}</td>`;
  return `<div class="scroll"><table class="matrix"><thead><tr><th>Short of</th><th>The plot</th><th>The player</th><th>The colony</th></tr></thead><tbody>
${MATRIX_ALL.map(([g, ...cells]) => `<tr><th>${g}</th>${cells.map(cell).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
}

function balanceSection() {
  if (!BAL) return '<p class="pending">The balance measurement is still running.</p>';
  const b = BAL;
  const ledger = `<div class="scroll"><table><thead><tr><th>Good</th><th>Made a month</th><th>Used by</th><th>Spoiled</th><th>To the ship</th><th>Made ÷ used</th></tr></thead><tbody>
${b.ledger.map(([g, made, by, sp, ship, r]) => `<tr><td>${g}</td><td>${made}</td><td>${by}</td><td>${sp || '—'}</td><td>${ship || '—'}</td><td>${r}</td></tr>`).join('\n')}
</tbody></table></div>`;
  return `<p>Per colony, a month, averaged over ten simulated games (four computer players):</p>
${ledger}
${bars('What a plot makes', [{ label: 'Farm, Food', today: b.farm.before, after: b.farm.actual }, { label: 'Well, Water', today: b.well.before, after: b.well.actual }], '', `Grey: what the ground gives an average worked plot. Blue: what it actually made. ${b.farm.energyOffShare}% of farm-months were switched off for want of Energy and ${b.farm.dryShare}% were cut to half as “dry”; in ${b.seat.noEnergyPlantShare}% of a player’s months they had no power plant at all.`).replace('Today</span>', 'What the ground gives</span>').replace('Proposed</span>', 'What it made</span>')}
<p><b>Your gut is right: use is low against what a plot can make</b>, but raising it now would starve the colony (see Crews below). One average farm, uncut, feeds the crews of ${b.feeds.farmBefore.crews} plots, or ${b.feeds.farmBefore.colonists} colonists; one well, ${b.feeds.wellBefore.crews} plots' crews. A player's own farms cover their Food from the first month (half of all players; one in ten never), Water from about month four (one in five never).</p>
<p><b>Yet the colony runs short, because of a chain, not of appetite.</b> Farms lose most of their Food to Energy and to the "dry" rule, which looks at a player's Water just after the month's eating and spoilage have emptied it. Smithore is the other break: building MULEs takes twice what the mines make, so the store's starting Smithore is gone by about month seven, the corral sells out in 43 months of 120, and plots stand idle. No Rare earth or Alloy was made in any game, so the factory chain and the colony buildings barely run. Most Medicine spoils on the shelf.</p>`;
}

function crewSection() {
  const sim = CREW
    ? `<div class="scroll"><table><thead><tr>${CREW.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${CREW.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>${CREW.note}</p>`
    : '<p class="pending">The crew simulation is still running.</p>';
  return `${crewChart()}${sim}`;
}

function ws7ChainParts() {
  if (!ws7Chain) return { body: '<p class="pending">The colonists’ part is on its way.</p>', decisions: [], findings: '' };
  const h3s = ws7Chain.split(/(?=<h3>)/);
  const head = h3s[0].replace(/<!--[\s\S]*?-->/g, '').replace(/<h2[^>]*>[\s\S]*?<\/h2>/g, '').replace(/<\/?section[^>]*>/g, '');
  // Only the chunks that open with a heading; the lead-in (comment, section, h2) has none and is `head`.
  const pick = (re) => h3s.filter((p) => p.startsWith('<h3>') && re.test(p.slice(0, p.indexOf('</h3>'))));
  const body = head + [...pick(/happens today/i), ...pick(/Measured/i)].join('');
  const blocks = [...ws7Chain.matchAll(/<div class="decision">[\s\S]*?<\/div>/g)].map((m) => m[0]);
  const findings = pick(/findings/i).join('');
  return { body, decisions: blocks, findings };
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
const ws7c = ws7ChainParts();
const ws7ChainDecisions = ws7c.decisions.filter((d) => !/crew/i.test(d.slice(0, d.indexOf('</h3>'))));
const chainDecisions = [
  `<div class="decision"><h3>Where does the supply work start?</h3>
<ul><li><b>With power.</b> Plants from the first month (the starting Energy, and the computer players' first plot), so that farms and wells run. <i>For:</i> the colony already has more farms than it needs if they are powered; power is what's missing. <i>Against:</i> none of our trial rules tested it yet; it is the supply pass's first job.</li>
<li><b>With more farms and wells.</b> <i>Against:</i> the colony already has 14 farms where 6 would do.</li></ul>
<p class="rec"><b>Recommended: power first.</b></p></div>`,
  `<div class="decision"><h3>How fast does Food spoil in a player's stock?</h3>
<ul><li><b>A quarter a month</b> (today: half). <i>For:</i> the best colony of every rule we tried: fewest hungry months for players and colonists, 80 colonists at the end instead of 72. <i>Against:</i> stockpiling Food gets easier.</li>
<li><b>Half, as today.</b> A player must grow twice what they eat to keep fed.</li></ul>
<p class="rec"><b>Recommended: a quarter.</b> (Measured with farms and wells switched off last, which on its own changed nothing.)</p></div>`,
  `<div class="decision"><h3>What does a hungry or thirsty crew do?</h3>
<ul><li><b>It works slower</b>, on the curve above: nothing under a tenth short, down to half pace with nothing. The farm's “dry” rule goes. <i>For:</i> the worse the shortage the bigger the cost, never all-or-nothing, and the player whose crew it is sees why. <i>Against:</i> a new rule to show on the month's report.</li>
<li><b>It makes its player's walkout likelier</b> (the colonists' team recommends this). <i>For:</i> the walkout already exists and players know it. <i>Against:</i> a walkout is a dice roll and all-or-nothing (the main good makes a fifth), so a slightly short crew and a starving one look the same until the dice fall.</li></ul>
<p class="rec"><b>Recommended: it works slower.</b> Walkouts stay with the colony's mood, so the same hunger never counts twice. Measured: the colony makes 14.8 Food a month instead of 10.2, and colonists go short of Food in 61 months instead of 74.</p></div>`,
  `<div class="decision"><h3>Should crews eat and drink more?</h3>
<ul><li><b>Not yet: keep the table, and raise it together with the power supply.</b> <i>For:</i> on today's power, doubling what crews use cut the colony's Food from 14.8 to 4.8 a month and left 64 colonists instead of 74. <i>Against:</i> your sense that use is low is right (an uncut farm feeds the crews of 19 plots), and it waits.</li>
<li><b>Double it now.</b> <i>Against:</i> measured above: the colony starves.</li></ul>
<p class="rec"><b>Recommended: not yet</b>; set it in the same pass as the power supply.</p></div>`,
  `<div class="decision"><h3>When power runs short, which plots switch off first?</h3>
<ul><li><b>As today:</b> the biggest user first, then the least valuable.</li><li><b>Farms and wells last.</b> <i>Against:</i> measured, it changed nothing: the power is short whichever plots wait.</li></ul>
<p class="rec"><b>Recommended: as today</b>; more power is the fix.</p></div>`,
  `<div class="decision"><h3>When is a player hungry?</h3>
<ul><li><b>When their household went short at the last month's end.</b> <i>For:</i> it says what happened. <i>Against:</i> a player who bought Food late in the month still walks fed.</li>
<li><b>As today: when they start development holding less Food than they eat.</b> <i>Against:</i> it reads the stock after half the Food has spoiled and before the month's market, so a player whose farms make twice their need still counts as hungry; 83 of every 100 player-months read hungry today.</li></ul>
<p class="rec"><b>Recommended: the household's last meal.</b></p></div>`,
  `<div class="decision"><h3>Does hunger make a player sick more easily?</h3>
<ul><li><b>Not yet.</b> The simulations never got the air dirty, so sickness is untested; decide it when it can be measured.</li><li><b>Yes</b>: hunger raises the existing sickness odds by up to half. <i>For:</i> one more link in the chain. <i>Against:</i> untested; it stacks on the slower walk.</li></ul>
<p class="rec"><b>Recommended: not yet.</b></p></div>`,
];
const ws7h = ws7HealthParts();
const healthDecisions = [
  `<div class="decision"><h3>Colony health: switch it on now, or with the Medicine supply?</h3>
<ul><li><b>With the Medicine supply</b>, once a simulation shows colonists short of Medicine in fewer than 40 months of 120 (today 110). <i>For:</i> the rules only make sense when Medicine can be had. <li><b>Now.</b> <i>Against:</i> measured: most months at the ceiling, Food down by a third, 55 colonists left of 100.</li></ul>
<p class="rec"><b>Recommended: with the Medicine supply</b>, like the hunger rules (decision 1).</p></div>`,
  `<div class="decision"><h3>How strongly does colony sickness reach players?</h3>
<ul><li><b>An addition</b>: up to 10 points more chance at the worst. <i>For:</i> stays under a third even in dirty air.</li><li><b>A multiple</b> (×1 to ×4). <i>Against:</i> players sick in 387 of 480 months in dirty air.</li></ul>
<p class="rec"><b>Recommended: an addition.</b></p></div>`,
  `<div class="decision"><h3>Sick crews</h3>
<ul><li><b>From a fifth of the colony sick</b>, and the computer players learn that one Medicine cures their crews. <i>For:</i> sickness reaches production without the loop measured below a fifth. <li><b>From a tenth</b>, as measured. <i>Against:</i> sick crews cut Food, hungry colonists fall sick: a loop. <li><b>No sick crews.</b> <i>Against:</i> Medicine matters less to players.</li></ul>
<p class="rec"><b>Recommended: from a fifth</b>.</p></div>`,
  `<div class="decision"><h3>Colony health in the score?</h3>
<ul><li><b>No separate term</b>: health already reaches the score through the mood and the number of colonists.</li><li><b>A small term.</b> <i>Against:</i> counts the same thing twice.</li></ul>
<p class="rec"><b>Recommended: no separate term.</b></p></div>`,
  `<div class="decision"><h3>Does the Electronics demand reach its inputs?</h3>
<ul><li><b>Yes</b>: the colonists' Electronics want also counts as demand for Rare earth and Alloy, so their prices rise too and mines and smelters pay. <i>For:</i> the signal reaches the start of the chain. <li><b>No</b>, as measured. <i>Against:</i> the 880 price changed nothing.</li></ul>
<p class="rec"><b>Recommended: yes.</b> The ceiling stays only as a safety rail, as you ruled.</p></div>`,
].map((d) => d.replace(/ <li>/g, '</li><li>'));
const decisions = [
  ws7Decisions[d6],
  ...chainDecisions,

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
  ...ws7ChainDecisions,
  ...ws7Decisions.filter((_, i) => i !== d6),
  ...healthDecisions,
  ...ws7h.decisions,
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
  --s1:#1f5fa8; --s2:#b5651d; --s3:#2f7d4f; --c-food:#2f7d4f; --c-water:#1f5fa8; --c-energy:#c08a12; --c-smithore:#6b4fa0; --c-crystite:#a3471f; --c-rare:#3c8a95; --bandA:rgba(29,34,51,0.05); --bandB:rgba(29,34,51,0); --tol:rgba(31,95,168,0.08); --rec:var(--accent); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark;
  --ink:#e4e7f0; --ink-soft:#a3a9bb; --paper:#141722; --panel:#1c2030; --line:#2f3448; --accent:#e8a35c; --accent-soft:#3a2b1d;
  --muted:#8d93a6; --grid:#2a2f42; --axis:#4a5068; --ring:rgba(228,231,240,0.14); --s1:#8ab8f0; --s2:#e8a35c; --s3:#7fd3a0; --c-food:#7fd3a0; --c-water:#8ab8f0; --c-energy:#f0c85c; --c-smithore:#c2a8ef; --c-crystite:#f0a07c; --c-rare:#7fd0da;
  --bandA:rgba(228,231,240,0.06); --tol:rgba(138,184,240,0.12); } }
:root[data-theme="dark"] { color-scheme: dark;
  --ink:#e4e7f0; --ink-soft:#a3a9bb; --paper:#141722; --panel:#1c2030; --line:#2f3448; --accent:#e8a35c; --accent-soft:#3a2b1d;
  --muted:#8d93a6; --grid:#2a2f42; --axis:#4a5068; --ring:rgba(228,231,240,0.14); --s1:#8ab8f0; --s2:#e8a35c; --s3:#7fd3a0; --c-food:#7fd3a0; --c-water:#8ab8f0; --c-energy:#f0c85c; --c-smithore:#c2a8ef; --c-crystite:#f0a07c; --c-rare:#7fd0da;
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
.bandname { fill: var(--muted); font-size: 11px; }
.lane { fill: var(--bandA); stroke: var(--line); } .lanet { fill: var(--ink2); font-size: 12px; font-weight: 600; }
.effline { fill: none; stroke: var(--s2); stroke-width: 1.8; stroke-dasharray: 5 4; } .effhead { fill: var(--s2); } .efflbl { fill: var(--s2); font-size: 11px; }
.gl { fill: none; stroke: var(--ink2); stroke-opacity: 0.7; stroke-width: 1.4; } .gl.strong { stroke-opacity: 0.9; stroke-width: 2; }
.g0 { stroke: var(--c-food); } .g1 { stroke: var(--c-water); } .g2 { stroke: var(--c-energy); } .g3 { stroke: var(--c-smithore); }
.g4 { stroke: var(--c-crystite); } .g5 { stroke: var(--c-rare); } .g6, .g7, .g8 { stroke: var(--ink2); stroke-dasharray: 4 3; }
.nodet.sm { font-size: 12px; }
.matrix tbody th { white-space: nowrap; } .today { color: var(--ink2); font-weight: 600; } .prop { color: var(--s1); font-weight: 600; } .barv { fill: #fff; font-size: 12px; font-weight: 600; } .bandA { fill: var(--bandA); } .bandB { fill: var(--bandB); } .tol { fill: var(--tol); }
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

<div class="decision"><h3>First: the colony is short of power, and that empties its farms</h3>
<p>Two teams measured today's colony over ten simulated games and found the same thing. It has enough farms and wells; it is short of <b>Energy</b>. There are no power plants until about month four, the colony is 40% short of Energy over a game, and 7 to 11 plots stand switched off every month from then on. When the power runs out, wells are switched off before farms, so the Water goes next, and then the farms, short of both, make about a quarter of what they could: a median farm makes 1 Food a month where it could make 4. By month twelve the colony has 14 farms where 6 would feed everyone if they were powered and watered.</p>
<p>On top of that, Food loses half its weight every month in a player's stock, and a player counts as hungry when they hold too little <i>after</i> that loss, so most "hungry" months are spoilage, not starvation. And colonists still pay wages today: late in a game they go short beside a store holding Food they can't afford.</p>
<p>So every rule below reads a real shortage more honestly than today, and on today's power supply each of them makes the colony look worse, not better. That is why the first decision asks to bring the hardship rules in together with more supply, tuned in one pass, starting with power.</p></div>

<h2>How it fits together</h2>
${flow()}

<h2>What each kind of plot uses</h2>
<p>A player's household eats 2 Food and drinks 1 Water a month, as today. On top of that, every plot they work uses this much a month. The quarters add up across a player's plots and are rounded up once.</p>
<div class="scroll"><table><thead><tr><th>The plot</th><th>Food</th><th>Water</th><th>Energy</th><th>Why</th></tr></thead><tbody>
${USE.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>
<p>Three estates, today's needs → the proposal's (Food / Water a month): three farms and a well, 3 / 2 → 3 / 3; two Smithore mines, a Crystite mine and a power plant, 3 / 2 → 4 / 3; two works and two Smithore mines, 4 / 2 → 4 / 3, and their Energy 7 → 10. Crews still eat from their own player's stock, never from the store: feeding the crew or selling the Food stays the player's choice.</p>

<h2>Every good, from the ground to its uses</h2>
${allGoodsFlow()}

<h2>What a shortage does, at the plot, the player and the colony</h2>
${chainDiagram()}
${matrixAll()}

<h2>Does the colony use too little?</h2>
${balanceSection()}

<h2>Crews that go short</h2>
<p>Today a crew only eats; nothing happens to it if its player leaves it short. The proposal gives each player's crews last month's meal as their state: crews eat at the month's end, after the household, from their own player's stock, and next month every plot of that player works at the share below. A power plant keeps running, as today. The farm's “dry” rule goes: the farm's own Water in the table is its irrigation, and a thirsty crew works slower on every plot instead of only farms halving.</p>
<p>Why last month's meal: a plot works before the month's market, so a crew can only be fed from what its player kept back, and today's rule, which looks at the stock just after the month's eating and spoilage, finds nearly everyone short.</p>
${crewSection()}

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

<h2>The colony level: what a shortage does to the colonists</h2>
${ws7c.body}
<p><b>Two notes on the numbers.</b> Medicine's store price today climbs without limit (15,584 in one game); the proposed store prices cap every good at twelve times normal (1,440 for Medicine), and their steps stop at four times (480). And the air stayed clean in all ten simulated games, so nothing here has tested pollution or sickness yet.</p>

<h2>How colonists feel when they go short</h2>
${ws7Mood}
<h3>Three months, worked through</h3>
${ws7Example}
<h3>How often each mood shows up</h3>
${moodBars()}
${ws7Measure}

<h2>Addendum: colony health</h2>
<p>You asked for colonists who need Medicine, fall sick without it, pass sickness on to each other and to players and crews, a colony health gauge, and Electronics that make colonists happier but are never required. The colonists' side comes first; then what it asks of the store, the players and the crews; then what ten simulated games say.</p>
${ws7h.body}
<h3>What it asks of the store, the players and the crews</h3>
<ul>
<li><b>Medicine.</b> Colonists take their Medicine from the store at the month's end, free, after Food and Water: one a month for every 50 colonists, half as much again in dirty air, and up to 40% more while many are sick. It counts in what the colony needs, so a Medicine shortage raises its price through the same steps as Food.</li>
<li><b>Players.</b> A player's chance of falling sick rises with the colony's sick share. Recommended as an addition (up to 10 points more at the worst), not a multiple: as a multiple, dirty air made players sick in 387 of 480 months.</li>
<li><b>Crews.</b> Once a tenth of the colonists are sick, the same share of each player's crews is sick, and their plots make up to half as much on top of the hunger curve. One Medicine in the player's stock cures that player's crews for the month.</li>
<li><b>The gauge.</b> Colony health shows beside the colony's mood as the share of colonists who are well. It is a new piece of screen, so its look needs a mock before it is built.</li>
<li><b>Electronics.</b> Colonists want one a month for every 50 of them; when they get it the mood's aim rises, and when they don't, nothing is lost. It counts in what the colony needs, so its price climbs to four times normal (880) while nobody makes it. The ceiling stays at twelve times (2,640) as a safety rail only. At 880 the store pays 792 for a unit whose inputs (Rare earth, Alloy, Energy) cost about 175 at normal prices, or about 700 even if all three are short: a works pays well.</li>
</ul>
<h3>Ten simulated games</h3>
${HEALTH ? tableOf(HEALTH) : '<p class="pending">Running.</p>'}
<p><b>What it says.</b> The rules cannot run away: with Medicine supplied in full the sick share never reaches the ceiling and every bad spell clears within two to seven months. But today's colony cannot supply Medicine: colonists got about 0.4 of the 2.1 they needed each month, so the sick share sat at its ceiling in most months, sick crews cut Food from 13.2 to 7.9 a month, and 55 colonists were left instead of 72. <b>Medicine supply has to come first.</b></p>
<p><b>Did the high Electronics price make anyone build Electronics?</b> Two computer players put up an Electronics works as the price rose, but neither became a working chain: in all ten games nobody mined Rare earth or made Alloy, so the works ran for one month in total. The computer players only build a works when they already hold its inputs, and nothing asks for Rare earth or Alloy except a works that already stands. So the price at the end of the chain cannot pull the chain on its own; the inputs need the same signal (decision below). That is also a finding for the computer players' team.</p>

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
