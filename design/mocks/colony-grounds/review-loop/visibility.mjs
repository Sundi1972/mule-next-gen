#!/usr/bin/env node
/**
 * visibility — can every place a building takes be seen in the one fixed view?
 *
 *   node review-loop/visibility.mjs [--out <file.json>]     (from design/mocks/colony-grounds)
 *
 * Nobody picks a place (RULE-32b: the Governor commissions, the building takes the first free block nearest the hall),
 * so the question is whether a place, once taken, shows: its site's footprint and its chip. For every commission order
 * of the five kinds (5! = 120, deduped to the layouts they make), every building standing at its top stage (the
 * tallest pictures), it draws the real game view (tv-beat.html?view=phone, ColonyGrounds as the phone desk mounts it,
 * and ?view=opener, the TV) and measures, per place:
 *   - covered: the share of the place's footprint hidden by the pictures drawn in front of it (their real alpha);
 *   - chips: the share of a chip overlapped by another chip (chips draw over every picture, so only chips hide chips);
 *   - size: the footprint's visible area and the chip's size in CSS px at 390 and 353 wide (phone, hub tab), 1280 (TV).
 * Starts this mock's vite on a free port, killed by PID when done.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const MOCK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = resolve(argOut > 0 ? process.argv[argOut + 1] : join(MOCK, 'review-loop/shots/visibility.json'));
const SIZE = 5;
const HALL = 2;
// packages/engine/src/config.ts::PRESTIGE footprints and names
const KINDS = [
  { id: 'park', name: 'Park', w: 1, h: 1, buildMonths: 1 },
  { id: 'hospital', name: 'Hospital', w: 1, h: 1, buildMonths: 2 },
  { id: 'observatory', name: 'Observatory', w: 1, h: 1, buildMonths: 2 },
  { id: 'stadium', name: 'Stadium', w: 2, h: 2, buildMonths: 3 },
  { id: 'spaceport', name: 'Spaceport', w: 2, h: 2, buildMonths: 3 },
];

/** packages/engine/src/colony.ts::blocksInOrder, ported (not exported there): RULE-32b's order. */
function blocksInOrder(w, h) {
  const cells = (b) => {
    const out = [];
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) out.push([b.x + dx, b.y + dy]);
    return out;
  };
  const ring = ([x, y]) => Math.max(Math.abs(x - HALL), Math.abs(y - HALL));
  const blocks = [];
  for (let y = 0; y + h <= SIZE; y++)
    for (let x = 0; x + w <= SIZE; x++) {
      const place = { x, y, w, h };
      const rings = cells(place).map(ring);
      if (rings.includes(0)) continue;
      const turn = Math.atan2(x + w / 2 - (HALL + 0.5), -(y + h / 2 - (HALL + 0.5)));
      blocks.push({ place, cells: cells(place), far: Math.max(...rings), near: Math.min(...rings), turn: turn < 0 ? turn + 2 * Math.PI : turn });
    }
  blocks.sort((a, b) => a.far - b.far || a.near - b.near || a.turn - b.turn || a.place.y - b.place.y || a.place.x - b.place.x);
  return blocks;
}

function permutations(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Every distinct layout the commission orders make. */
function layouts() {
  const seen = new Map();
  for (const order of permutations(KINDS)) {
    const taken = new Set([`${HALL},${HALL}`]);
    const projects = order.map((k) => {
      const b = blocksInOrder(k.w, k.h).find((bl) => bl.cells.every(([x, y]) => !taken.has(`${x},${y}`)));
      b.cells.forEach(([x, y]) => taken.add(`${x},${y}`));
      return { id: k.id, name: k.name, stage: 'standing', monthsLeft: null, buildMonths: k.buildMonths, place: b.place };
    });
    const key = projects.map((p) => `${p.id}@${p.place.x},${p.place.y}`).sort().join(' ');
    if (!seen.has(key)) seen.set(key, { key, order: order.map((k) => k.id), projects });
  }
  return [...seen.values()];
}

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.unref();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function startVite() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(MOCK, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: MOCK, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (const deadline = Date.now() + 30_000; ; ) {
    try {
      if ((await fetch(`${base}/tv-beat.html`)).ok) return { child, base };
    } catch {}
    if (Date.now() > deadline || child.exitCode !== null) throw new Error('vite did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** In the page: per project, the footprint share covered by the pictures drawn after its own, and chip overlaps. */
function measure(projects) {
  const svg = document.querySelector('svg[viewBox]');
  const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const S = 3;
  const imgs = [...svg.querySelectorAll('image')].filter((el) => el.getAttribute('data-testid') !== 'plate' && !(el.getAttribute('data-testid') || '').startsWith('glow'));
  const load = (el) =>
    new Promise((ok) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => ok(null);
      im.src = el.getAttribute('href');
    });
  return Promise.all(imgs.map(load)).then((loaded) => {
    const iso = (c, r) => [(c - r) * 60, (c + r) * 30];
    const out = [];
    projects.forEach((p, i) => {
      const own = imgs.findIndex((el) => el.getAttribute('data-testid') === `picture-${i + 1}`);
      const c = p.place.x - 2 + (p.place.w - 1) / 2, r = p.place.y - 2 + (p.place.h - 1) / 2, h = p.place.w / 2;
      const poly = [iso(c - h, r - h), iso(c + h, r - h), iso(c + h, r + h), iso(c - h, r + h)];
      const mask = new OffscreenCanvas(Math.ceil(vw * S), Math.ceil(vh * S)), front = new OffscreenCanvas(mask.width, mask.height);
      const m = mask.getContext('2d'), f = front.getContext('2d');
      m.beginPath();
      poly.forEach(([x, y], k) => (k ? m.lineTo : m.moveTo).call(m, (x - vx) * S, (y - vy) * S));
      m.closePath();
      m.fill();
      imgs.forEach((el, k) => {
        if (k <= own || !loaded[k]) return;
        const g = (a) => Number(el.getAttribute(a));
        f.drawImage(loaded[k], (g('x') - vx) * S, (g('y') - vy) * S, g('width') * S, g('height') * S);
      });
      const ma = m.getImageData(0, 0, mask.width, mask.height).data, fa = f.getImageData(0, 0, mask.width, mask.height).data;
      let area = 0, hidden = 0;
      for (let q = 3; q < ma.length; q += 4) {
        if (ma[q] < 128) continue;
        area++;
        if (fa[q] > 128) hidden++;
      }
      const chip = svg.querySelector(`[data-testid="callout-${i + 1}"]`);
      const box = (el) => ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a)));
      let chipOverlap = 0;
      if (chip) {
        const [ax, ay, aw, ah] = box(chip);
        svg.querySelectorAll('[data-testid^="callout-"]').forEach((o) => {
          if (o === chip) return;
          const [bx, by, bw, bh] = box(o);
          const ix = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx)), iy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
          chipOverlap = Math.max(chipOverlap, (ix * iy) / (aw * ah));
        });
      }
      out.push({ id: p.id, place: p.place, covered: area ? hidden / area : 0, footprintVb2: area / (S * S), visibleVb2: (area - hidden) / (S * S), chipOverlap, chipVb: chip ? box(chip).slice(2) : null });
    });
    return { viewBox: [vx, vy, vw, vh], client: [svg.clientWidth, svg.clientHeight], places: out };
  });
}

const { child, base } = await startVite();
const browser = await chromium.launch();
const results = [];
try {
  const all = layouts();
  console.log(`${all.length} distinct layouts from 120 commission orders`);
  for (const L of all) {
    const row = { key: L.key, order: L.order, views: {} };
    for (const [name, url, vp] of [
      ['phone390', `view=phone&light=day&width=390`, { width: 390, height: 844 }],
      ['tab353', `view=phone&light=day&width=353`, { width: 353, height: 844 }],
      ['tv1280', `view=opener&light=dusk`, { width: 1280, height: 720 }],
    ]) {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`${base}/tv-beat.html?${url}&colony=${encodeURIComponent(JSON.stringify(L.projects))}`);
      await page.waitForFunction(() => document.querySelectorAll('svg image[data-testid^="picture-"]').length >= 6, null, { timeout: 15_000 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(measure, L.projects);
      const scale = m.client[0] / m.viewBox[2];
      m.places.forEach((p) => {
        p.visiblePx2 = Math.round(p.visibleVb2 * scale * scale);
        p.chipPx = p.chipVb && p.chipVb.map((v) => Math.round(v * scale));
      });
      row.views[name] = m;
      await page.close();
    }
    results.push(row);
    const worst = row.views.phone390.places.reduce((a, b) => (b.covered > a.covered ? b : a));
    console.log(`${L.order.join('>')}: worst ${worst.id}@${worst.place.x},${worst.place.y} covered ${(worst.covered * 100).toFixed(0)}%`);
  }
} finally {
  await browser.close();
  child.kill('SIGTERM');
}
writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`visibility: ${results.length} layouts → ${OUT}`);
