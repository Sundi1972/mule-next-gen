#!/usr/bin/env node
/**
 * render-gate — compare a built screen against its approved mock, joined on data-testid.
 *
 *   node render-gate.mjs --snippet            # print the capture function; run it in both pages
 *   node render-gate.mjs mock.json built.json # diff two captures  (exit 1 = findings)
 *
 * Capture is a snippet because every environment drives a browser differently.
 * No pixel comparison: data, viewport and fonts differ, so it would never be green.
 * It does not judge behaviour; assert the few interactions that carry the design separately.
 */

const SNIPPET = `
// Run in BOTH pages; save each result as JSON. Join key is data-testid, which
// the mock and the build must both carry.
(() => {
  const fp = {};
  for (const el of document.querySelectorAll('[data-testid]')) {
    const cs = getComputedStyle(el);
    fp[el.getAttribute('data-testid')] = {
      // Containers' text repeats their children's; only leaves compare text.
      leaf: !el.querySelector('[data-testid]'),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      text: (el.innerText || '').trim().slice(0, 60),
      color: cs.color, background: cs.backgroundColor,
      fontWeight: cs.fontWeight, fontSize: cs.fontSize,
      padding: cs.padding, radius: cs.borderRadius,
      display: cs.display,
    };
  }
  return fp;
})()
`.trim();

if (process.argv.includes("--snippet")) {
  console.log(SNIPPET);
  process.exit(0);
}

const [mockPath, builtPath] = process.argv.slice(2);
if (!mockPath || !builtPath) {
  console.error("usage: render-gate.mjs <mock.json> <built.json>   |   --snippet");
  process.exit(64);
}

const { readFileSync } = await import("node:fs");
/** Tolerate wrappers some browser tools put around a returned value. */
const load = (p) => {
  let d = JSON.parse(readFileSync(p, "utf8"));
  for (const k of ["result", "value", "output", "data"]) {
    if (d && typeof d === "object" && d[k] && typeof d[k] === "object") d = d[k];
  }
  return d;
};

const mock = load(mockPath);
const built = load(builtPath);
const findings = [];

for (const [tid, m] of Object.entries(mock)) {
  const b = built[tid];
  if (!b) {
    findings.push({ kind: "MISSING", tid, detail: "in the approved mock, absent from the build" });
    continue;
  }
  for (const [field, mv] of Object.entries(m)) {
    if (field === "leaf") continue;
    if (field === "text" && !m.leaf) continue;   // containers echo their children
    if (mv !== b[field]) {
      findings.push({ kind: "DIFFERS", tid, detail: `${field}`, mock: mv, built: b[field] });
    }
  }
}
for (const tid of Object.keys(built)) {
  if (!(tid in mock)) {
    findings.push({ kind: "EXTRA", tid, detail: "in the build, not in the approved mock" });
  }
}

const clean = Object.keys(mock).filter((t) => !findings.some((f) => f.tid === t));
console.log(`render-gate · ${Object.keys(mock).length} elements joined on data-testid`);

if (!findings.length) {
  console.log("PASS — build matches the approved mock on every compared property.");
  process.exit(0);
}

console.log(`\n${findings.length} finding(s):\n`);
for (const f of findings) {
  console.log(`  [${f.kind}] ${f.tid} — ${f.detail}`);
  if (f.kind === "DIFFERS") {
    console.log(`      mock : ${JSON.stringify(f.mock)}`);
    console.log(`      built: ${JSON.stringify(f.built)}`);
  }
}
console.log(`\nclean: ${clean.length ? clean.join(", ") : "(none)"}`);
console.log(
  "\nEach finding is EITHER a bug in the build OR a change the mock needs.\n" +
  "The second is an upstream finding for whoever owns the mock — never something\n" +
  "to settle by quietly diverging.",
);
process.exit(1);
