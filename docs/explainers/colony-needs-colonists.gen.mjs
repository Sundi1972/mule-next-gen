// Generates docs/explainers/colony-needs-colonists.html: WS7's part of the colony-needs explainer.
// Run: node docs/explainers/colony-needs-colonists.gen.mjs docs/explainers/colony-needs-colonists.html [measurement-fragment.html]
// Every number on the page is computed here from the spec's rules (RULE-2..5), so page and spec agree.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = process.argv[2];
const MEASURE = process.argv[3]; // optional HTML fragment with the measurement table
const P = { tol: 0.1, pow: 1.5, shock: 15, perH: 12, keep: 0.5, cap: 3, shrink: 0.1, fed: 1.04, maxStep: 5, base: 60 };
const g = (s) => (s <= P.tol ? 0 : ((s - P.tol) / (1 - P.tol)) ** P.pow);
const step = (h, t) => Math.max(0, Math.min(100, Math.round(h + Math.max(-P.maxStep, Math.min(P.maxStep, t - h)))));
const band = (h) => (h >= 80 ? 'Thriving' : h >= 60 ? 'Content' : h >= 40 ? 'Restless' : h >= 20 ? 'Unhappy' : 'Unrest');
const mig = { Thriving: 0.02, Content: 0, Restless: -0.01, Unhappy: -0.03, Unrest: -0.05 };

/** Recommended: one month from (mood, memory) with shortfall s. */
function monthA(m, H, s) {
  const G = g(s);
  const b = band(m);
  H = Math.min(P.cap, P.keep * H + G);
  m = step(m, P.base - P.perH * H);
  m = Math.max(0, m - Math.round(P.shock * G));
  const rate = (s <= P.tol ? P.fed : 1 - P.shrink * s) + mig[b];
  return { m, H, rate };
}
const monthB = (m, s) => step(m, P.base - 40 * g(s));
const monthToday = (m, s) => step(m, P.base - (s > 0 ? 8 : 0));

// Chart 1 data: one month from 60, no memory.
const xs = Array.from({ length: 21 }, (_, i) => i * 5);
const c1 = {
  A: xs.map((x) => monthA(60, 0, x / 100).m - 60),
  B: xs.map((x) => monthB(60, x / 100) - 60),
  T: xs.map((x) => monthToday(60, x / 100) - 60),
};

// Chart 2 data: mood over 8 months.
const runA = (shorts) => { let m = 60, H = 0; const out = [60]; for (const s of shorts) { ({ m, H } = monthA(m, H, s)); out.push(m); } return out; };
const runT = (shorts) => { let m = 60; const out = [60]; for (const s of shorts) { m = monthToday(m, s); out.push(m); } return out; };
const ex = [0.05, 0.5, 0, 0, 0, 0, 0, 0];
const c2 = [
  { key: 'ex', short: 'Example', name: 'Your example, recommended rule', color: 'var(--s1)', dash: '', data: runA(ex) },
  { key: 'half', short: 'Half rations', name: 'Half rations every month', color: 'var(--s2)', dash: '', data: runA(Array(8).fill(0.5)) },
  { key: 'none', short: 'No Food', name: 'No Food at all every month', color: 'var(--s3)', dash: '', data: runA(Array(8).fill(1)) },
  { key: 'today', short: 'Example, today', name: 'Your example, today’s rule', color: 'var(--muted)', dash: '6 4', data: runT(ex) },
];

// Worked example rows.
const rows = [];
{
  let m = 60, H = 0, c = 400, mt = 60, ct = 400;
  const food = [19, 10, 20];
  for (let i = 0; i < 3; i++) {
    const s = (20 - food[i]) / 20;
    const before = m;
    const r = monthA(m, H, s);
    const target = P.base - P.perH * r.H;
    const stepped = step(before, target);
    const shock = Math.round(P.shock * g(s));
    m = r.m; H = r.H; c = Math.round(c * r.rate);
    mt = monthToday(mt, s); ct = Math.round(ct * (s > 0 ? 0.95 : 1.04));
    rows.push({ month: i + 1, food: food[i], s, H, target, stepped, shock, m, band: band(m), c, rate: r.rate, mt, ct, bandT: band(mt) });
  }
}

// ---- SVG helpers ----
const W = 680, H = 300, L = 96, R = 150, T = 16, B = 40;
const pw = W - L - R, ph = H - T - B;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function chart1() {
  const x = (v) => L + (v / 100) * pw;
  const y = (v) => T + ((0 - v) / 20) * ph; // 0 at top, -20 at bottom
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="c1t c1d" class="chart">`;
  s += `<title id="c1t">Mood change in one month, by how much Food was missing</title><desc id="c1d">Recommended rule: no change up to 10% short, then a growing drop to 20 points at 100% short. Thin rule: stops at 5 points from 40% short. Today: 5 points for any shortfall.</desc>`;
  for (let v = 0; v >= -20; v -= 5) s += `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${v === 0 ? '0' : '−' + -v}</text>`;
  for (let v = 0; v <= 100; v += 20) s += `<text x="${x(v)}" y="${T + ph + 18}" class="tick" text-anchor="middle">${v}%</text>`;
  s += `<line x1="${L}" x2="${L + pw}" y1="${y(0)}" y2="${y(0)}" class="axis"/>`;
  s += `<rect x="${x(0)}" y="${T}" width="${x(10) - x(0)}" height="${ph}" class="tol"/><text x="${x(5)}" y="${T + ph - 6}" class="tick" text-anchor="middle">shrugged off</text>`;
  s += `<text x="${L + pw / 2}" y="${H - 4}" class="axislabel" text-anchor="middle">Share of the colonists’ Food missing that month</text>`;
  s += `<text x="12" y="${T + ph / 2}" class="axislabel" text-anchor="middle" transform="rotate(-90 12 ${T + ph / 2})">Mood points</text>`;
  const series = [
    { k: 'T', name: 'Today', color: 'var(--muted)', dash: '6 4' },
    { k: 'B', name: 'Thin option', color: 'var(--s2)', dash: '' },
    { k: 'A', name: 'Recommended', color: 'var(--s1)', dash: '' },
  ];
  for (const ser of series) {
    const d = c1[ser.k];
    // Today is a step: 0 at exactly 0%, −5 from the first unit missing.
    const pts = ser.k === 'T' ? [[0, 0], [0.5, -5], ...xs.slice(1).map((v, i) => [v, d[i + 1]])] : xs.map((v, i) => [v, d[i]]);
    s += `<polyline fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round" ${ser.dash ? `stroke-dasharray="${ser.dash}"` : ''} points="${pts.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' ')}"/>`;
    for (let i = 0; i < xs.length; i++) s += `<circle cx="${x(xs[i])}" cy="${y(d[i])}" r="7" class="hit"><title>${ser.name}: ${xs[i]}% short → ${d[i] === 0 ? 'no change' : '−' + -d[i] + ' mood'}</title></circle>`;
    const last = d[d.length - 1];
    const ly = { A: y(last), B: y(last) - 6, T: y(last) + 12 }[ser.k];
    s += `<text x="${x(100) + 8}" y="${ly + 4}" class="lbl">${ser.name} ${last === 0 ? '0' : '−' + -last}</text>`;
  }
  return s + '</svg>';
}

function chart2() {
  const x = (v) => L + (v / 8) * pw;
  const y = (v) => T + ((100 - v) / 100) * ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="c2t c2d" class="chart">`;
  s += `<title id="c2t">The colony's mood over eight months under three kinds of hardship</title><desc id="c2d">Starting Content at 60. Your example recovers to Content by month 5. Half rations every month settle at 49, Restless. No Food at all reaches Unrest in month 3 and 0 in month 5.</desc>`;
  const bands = [['Thriving', 80, 100], ['Content', 60, 80], ['Restless', 40, 60], ['Unhappy', 20, 40], ['Unrest', 0, 20]];
  bands.forEach(([n, lo, hi], i) => {
    s += `<rect x="${L}" y="${y(hi)}" width="${pw}" height="${y(lo) - y(hi)}" class="${i % 2 ? 'bandB' : 'bandA'}"/><text x="${L - 34}" y="${(y(hi) + y(lo)) / 2 + 4}" class="bandname" text-anchor="end">${n}</text>`;
  });
  for (let v = 0; v <= 100; v += 20) s += `<text x="${L - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`;
  for (let v = 0; v <= 8; v++) s += `<text x="${x(v)}" y="${T + ph + 18}" class="tick" text-anchor="middle">${v === 0 ? 'start' : v}</text>`;
  s += `<line x1="${L}" x2="${L + pw}" y1="${y(0)}" y2="${y(0)}" class="axis"/>`;
  s += `<text x="${L + pw / 2}" y="${H - 4}" class="axislabel" text-anchor="middle">Month</text>`;
  const offs = { ex: 0, half: 0, none: 0, today: 0 };
  for (const ser of c2) {
    s += `<polyline fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round" ${ser.dash ? `stroke-dasharray="${ser.dash}"` : ''} points="${ser.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
    ser.data.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="7" class="hit"><title>${esc(ser.name)}, ${i === 0 ? 'start' : 'month ' + i}: ${v} (${band(v)})</title></circle>`; });
  }
  // Direct labels at the right edge, nudged apart.
  const ends = c2.map((ser) => ({ ser, v: ser.data[8] }));
  const placed = [];
  for (const e of ends.sort((a, b) => b.v - a.v)) {
    let yy = y(e.v) + 4;
    while (placed.some((p) => Math.abs(p - yy) < 13)) yy += 13;
    placed.push(yy);
    s += `<text x="${x(8) + 8}" y="${yy}" class="lbl">${esc(e.ser.short)} ${e.v}</text>`;
  }
  return s + '</svg>';
}

const pct = (v) => `${Math.round(v * 100)}%`;
const mood = (v) => (v === 0 ? 'no change' : `−${-v}`);
const table1 = `<table><thead><tr><th>Food missing</th><th>Recommended</th><th>Thin option</th><th>Today</th></tr></thead><tbody>${xs.filter((v) => v % 10 === 0).map((v) => { const i = xs.indexOf(v); return `<tr><td>${v}%</td><td>${mood(c1.A[i])}</td><td>${mood(c1.B[i])}</td><td>${mood(c1.T[i])}</td></tr>`; }).join('')}</tbody></table>`;
const table2 = `<table><thead><tr><th>Month</th>${c2.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: 9 }, (_, i) => `<tr><td>${i === 0 ? 'start' : i}</td>${c2.map((c) => `<td>${c.data[i]} ${band(c.data[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const worked = `<table><thead><tr><th>Month</th><th>Food given</th><th>What happens to the mood</th><th>Mood</th><th>Colonists</th><th>Today: mood, colonists</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.month}</td><td>${r.food} of 20</td><td>${r.s <= P.tol ? (r.H > 0 ? `fed; the memory of hunger still holds it ${(P.base - r.target).toFixed(1)} under 60, so it climbs only ${r.stepped - (r.month === 1 ? 60 : rows[r.month - 2].m)}` : 'inside the tolerance: nothing') : `drifts ${r.stepped - (r.month === 1 ? 60 : rows[r.month - 2].m)}, then the hunger lands at once: −${r.shock}`}</td><td><b>${r.m}</b> ${r.band}</td><td>${r.c} (${r.rate >= 1 ? '+' : '−'}${Math.round(Math.abs(r.rate - 1) * 100)}%)</td><td>${r.mt} ${r.bandT}, ${r.ct}</td></tr>`).join('')}</tbody></table>`;

const measure = MEASURE && existsSync(MEASURE) ? readFileSync(MEASURE, 'utf8') : '<p class="pending">The measurement on ten simulated games is still running; it fills in here.</p>';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Colonists' hardship</title>
<style>
:root { color-scheme: light; --bg:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --ring:rgba(11,11,11,0.10);
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --bandA:rgba(11,11,11,0.035); --bandB:rgba(11,11,11,0); --tol:rgba(42,120,214,0.08); --rec:#2a78d6; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg:#0d0d0d; --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,0.10);
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --bandA:rgba(255,255,255,0.045); --tol:rgba(57,135,229,0.12); --rec:#3987e5; } }
:root[data-theme="dark"] { color-scheme: dark; --bg:#0d0d0d; --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,0.10);
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --bandA:rgba(255,255,255,0.045); --tol:rgba(57,135,229,0.12); --rec:#3987e5; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; line-height: 1.2; margin: 8px 0 4px; } h2 { font-size: 21px; margin: 40px 0 8px; } h3 { font-size: 17px; margin: 24px 0 6px; }
p, li { color: var(--ink); } .sub { color: var(--ink2); margin-top: 0; }
figure { margin: 16px 0; background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 12px; }
figcaption { color: var(--ink2); font-size: 14px; margin-top: 6px; }
.chart { width: 100%; height: auto; display: block; }
.grid { stroke: var(--grid); stroke-width: 1; } .axis { stroke: var(--axis); stroke-width: 1; }
.tick { fill: var(--muted); font-size: 11px; } .axislabel { fill: var(--ink2); font-size: 12px; } .lbl { fill: var(--ink); font-size: 12px; }
.bandname { fill: var(--muted); font-size: 11px; } .bandA { fill: var(--bandA); } .bandB { fill: var(--bandB); } .tol { fill: var(--tol); }
.hit { fill: transparent; } .hit:hover { fill: var(--ring); }
details { margin-top: 8px; font-size: 14px; } summary { cursor: pointer; color: var(--ink2); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 8px 0; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--grid); vertical-align: top; } th { color: var(--ink2); font-weight: 600; }
.decision { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 4px 16px 12px; margin: 16px 0; }
.rec { border-left: 3px solid var(--rec); padding-left: 10px; }
.pending { color: var(--ink2); font-style: italic; }
</style>
</head>
<body>
<main>
<p class="sub">Colony needs · the colonists · draft for Heiko · written by WS7</p>
<h1>Colonists' hardship</h1>
<p class="sub">How hungry colonists get, how it shows on their mood, and how the colony's size follows. Nothing here is built yet; every number is a starting value to be tuned.</p>

<h2>What you'll see at the table</h2>
<ul>
<li><b>Colonists never pay.</b> They take their Food and Water from the store's shelf, free. The store already keeps a month of their need back from the players, so they come first. The month-end line says how much they got: "The store fed the colony's 400 colonists 19 of 20 Food and all their Water." A dear Food price never starves them while the shelf has Food.</li>
<li><b>A small miss is shrugged off.</b> Missing 1 Food of 20 changes nothing: the mood holds and the colony still grows. Today that same miss costs 5 mood points and 5% of the colonists.</li>
<li><b>A big miss bites at once, and harder the bigger it is.</b> Half rations: the mood drops 8 that month, from Content 60 to Restless 52, and the colony shrinks 5%. No Food at all: the mood drops 20 in one month and the colony shrinks 10%. Today every miss costs the same 5 points and 5%, whether one unit was missing or all of them.</li>
<li><b>The colony remembers.</b> After a hungry month, feeding them again lifts the mood, but slowly: for a few months it aims a little lower than before. Hunger month after month piles up. Half rations every month settle the mood around 49, Restless; no Food at all takes it into Unrest in three months.</li>
<li><b>Hard times make trouble likelier.</b> While the memory of hunger lasts, riots, strikes and emigration waves come up more often, up to two and a half times their usual odds.</li>
<li><b>The colony's size follows the shortfall.</b> Fed, or missing up to a tenth, it grows 4% a month. Short of more than that, it shrinks by a tenth of the share missing: 2% at a fifth short, 10% with nothing to eat. The mood adds a little on top: a thriving colony draws settlers, an unhappy one loses them.</li>
</ul>

<h2>How the shortfall turns into mood</h2>
<p>Three things decide it, each a number that can be tuned:</p>
<ol>
<li><b>A tolerance.</b> Missing up to a tenth of what they need costs nothing.</li>
<li><b>A curve.</b> Past the tolerance the cost grows faster than the shortfall: a little short is a nudge, very short is a blow. The worse of Food and Water counts, because a colony with all its Water and no Food is starving.</li>
<li><b>A memory.</b> Each hungry month adds to a memory of hardship; each fed month halves it. The memory keeps the mood aiming lower and makes unrest likelier. The same shortfall month after month settles the memory at twice that month's share of hardship.</li>
</ol>
<p>The mood still drifts at most 5 points a month toward where it is heading, as today. That keeps tax, air and prestige changes gentle. A hungry month's own blow lands at once, outside that limit, the way an event's does; otherwise any shortfall from 40% up would look the same.</p>

<figure>
${chart1()}
<figcaption>One hungry month, starting Content at 60. The shaded strip is the tolerance. Hover a point for its value.</figcaption>
<details><summary>The numbers as a table</summary><div class="scroll">${table1}</div></details>
</figure>

<figure>
${chart2()}
<figcaption>Hardship over time, starting Content at 60, nothing else moving the mood. "Your example" is the three months below, then fed.</figcaption>
<details><summary>The numbers as a table</summary><div class="scroll">${table2}</div></details>
</figure>

<h2>Worked example: three months</h2>
<p>A colony of 400 needs 20 Food and 20 Water a month. Water is fed throughout. The mood starts at 60, Content, with no memory of hunger.</p>
<div class="scroll">${worked}</div>
<ul>
<li><b>Month 1, 19 of 20.</b> A 5% miss is inside the tolerance. Nothing happens, and the colony grows. Today it would cost 5 mood points and 5% of the colonists.</li>
<li><b>Month 2, 10 of 20.</b> Half rations. The mood drifts down 4 and the hunger lands at once for 4 more: 52, Restless. The colony shrinks 5%, and riots and strikes become 15% likelier.</li>
<li><b>Month 3, fed.</b> The mood climbs, but the memory still holds it under 60: 57, still Restless. The colony grows 3% (4% less 1% for being Restless). Fed again, it reaches 59 in month 4 and 60, Content, in month 5.</li>
</ul>

<h2>How often each mood shows up: ten simulated games</h2>
${measure}

<h2>Decisions for you</h2>

<div class="decision">
<h3>1 · Do colonists eat free in every game, or only with politics on?</h3>
<p>Colonists eat in every game; the mood exists only when politics is on. When we built the colony we promised a game with politics off plays exactly as before.</p>
<ul>
<li><b>Every game.</b> One way of feeding colonists everywhere: no wages, no price cap, and the colony grows or shrinks by its shortfall in every game. The mood, its memory and the unrest odds stay politics-only. <i>For:</i> one rule to learn and test; the computer players reason about one kind of demand. <i>Against:</i> games with politics off change too (their colony's size and the store's prices), so the "exactly as before" promise is narrowed to "no mood, prestige or social events".</li>
<li><b>Politics on only.</b> <i>For:</i> politics-off games stay exactly as they are. <i>Against:</i> two ways of feeding colonists in one game engine and in the computer players' reasoning; a player who switches modes meets different hunger rules.</li>
</ul>
<p class="rec"><b>Recommended: every game.</b> You asked for colonists with no economy; keeping wages alive in one mode keeps the thing you asked to remove.</p>
</div>

<div class="decision">
<h3>2 · How should the mood react to a shortfall?</h3>
<ul>
<li><b>Curve, memory and an immediate blow</b> (the rule above). <i>For:</i> a bigger shortfall hurts more in the same month, and a long one keeps hurting; the charts above are this rule. <i>Against:</i> the most numbers to tune (seven).</li>
<li><b>Curve only, inside the 5-point monthly limit.</b> <i>For:</i> simplest, half the work. <i>Against:</i> every shortfall from 40% up costs the same 5 points a month (the orange line), so it brings back today's flat cliff, only at 40% instead of 1 unit.</li>
<li><b>Lift the 5-point limit.</b> <i>For:</i> the curve shows in full at once. <i>Against:</i> the limit also governs tax, air and prestige, so a tax change would jolt the mood too.</li>
</ul>
<p class="rec"><b>Recommended: curve, memory and an immediate blow.</b> It is the only one where "the worse the crisis, the more unhappy they get" shows in a single month.</p>
</div>

<div class="decision">
<h3>3 · Keep the 5-point monthly limit on the mood?</h3>
<ul>
<li><b>Keep it for the slow drift; let hunger land outside it.</b> <i>For:</i> tax, air and prestige stay gentle and readable; hunger can still hit hard. <i>Against:</i> two ways the mood moves, which the month-end line has to explain.</li>
<li><b>Drop it.</b> <i>For:</i> one way the mood moves. <i>Against:</i> every input swings at once; a 1% tax change could move the mood by several points in a month.</li>
</ul>
<p class="rec"><b>Recommended: keep it for the drift.</b> Events already land outside it, so hunger joins a pattern players have already seen.</p>
</div>

<div class="decision">
<h3>4 · The starting numbers</h3>
<p>Tolerance: a tenth. The curve's bend: 1.5. The blow: 15 points at no Food. The memory: 12 points lower aim per unit, halved each fed month, capped at 3. Unrest odds: up by half per unit of memory. The colony shrinks by a tenth of the share missing.</p>
<ul>
<li><b>Take them as starting values</b>, to be tuned with the rest of the colony's numbers at the end. <i>For:</i> builds can go ahead now. <i>Against:</i> early playtests feel these values.</li>
<li><b>Gentler or harsher now.</b> <i>For:</i> you set the feel directly; the first chart shows what each shortfall costs. <i>Against:</i> tuning before the simulation has measured the whole package.</li>
</ul>
<p class="rec"><b>Recommended: take them as starting values.</b></p>
</div>

<div class="decision">
<h3>5 · The store loses the colonists' payments</h3>
<p>Colonists paid the store for their Food and Water; now they don't. You ruled in October that the store's money is unlimited and never shown, so the store's buying is not affected.</p>
<ul>
<li><b>Nothing replaces the payments.</b> <i>For:</i> it is what "no economy" means; nothing the players see changes. <i>Against:</i> none at the table; the store's hidden running total just stops receiving them.</li>
<li><b>An off-world grant pays the store for what the colonists take.</b> <i>For:</i> keeps the store's books as they were. <i>Against:</i> money that nobody sees, for no effect.</li>
</ul>
<p class="rec"><b>Recommended: nothing replaces them.</b></p>
</div>
</main>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log('wrote', OUT, html.length, 'bytes');
console.log('worked', JSON.stringify(rows.map((r) => [r.m, r.c, r.mt, r.ct])));
console.log('c2', c2.map((c) => c.key + ':' + c.data.join(',')).join(' | '));
