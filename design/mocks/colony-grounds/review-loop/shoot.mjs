#!/usr/bin/env node
/**
 * shoot — the colony grounds' review shots, against look.html's colony render.
 *
 *   node review-loop/shoot.mjs [--out <dir>]     (from design/mocks/colony-grounds; default out: review-loop/shots/)
 *
 * Starts this mock's vite on a free port (killed by PID when done) and serves whatever is in apps/web/public/art/colony
 * (public/art is a symlink to it). Takes:
 *   - the TV opener (tv-beat.html?view=opener, the real GroundsOpener in the TV's Scaled canvas) at 1280×720 and
 *     1920×1080, day and dusk;
 *   - the phone (?view=phone, ColonyGrounds size="phone", 390 px wide) at 390×844, day and dusk;
 *   - a side-by-side of each with look.html's colony-day/dusk.webp at the same output height, ours on the left.
 * Logs:
 *   - B-AC-5: the bytes loaded under /art/colony/ by the phone view, day and dusk, for the heaviest colony (?worst=1: every
 *     building standing, the most colonists), from a cold cache (each must be ≤ 1 MB; exit 1 if over);
 *   - the Stadium's drawn width in the 1280 opener shots against look.html's scale (≈ 17.5 px/m; target ≥ 0.9×).
 * Writes summary.json beside the shots. Exit 1 if a page errored or a shot could not be taken; the two numbers are
 * reported, not failed.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const MOCK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = resolve(argOut > 0 ? process.argv[argOut + 1] : join(MOCK, 'review-loop/shots'));
const LOOK = join(MOCK, 'public/look');

/** look.html's whole-colony render at 1280 wide (packages/ui/test/grounds-framing.test.tsx's LOOK_PX_PER_M). */
const LOOK_PX_PER_M = 17.5;
/** Scene units: a place is W wide on screen, 12 m a side (packages/ui/src/grounds/projection.ts, walks.ts METRE). */
const W = 120;
const METRE = W / 12;
/** The month-12 fixture's Stadium (src/tvbeat/TvBeat.tsx): place 3, the block at (3,2), 2 × 2. */
const STADIUM = { n: 3, x: 3, y: 2, w: 2, h: 2 };
const PHONE_BUDGET = 1_000_000;
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';

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

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function startVite() {
  const port = await freePort();
  const bin = join(MOCK, 'node_modules/vite/bin/vite.js');
  // node directly, not the .bin shim, so the PID we hold is vite's own.
  const child = spawn(process.execPath, [bin, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: MOCK, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite exited ${child.exitCode}:\n${log}`);
    try {
      if ((await fetch(`${base}/tv-beat.html`)).ok) break;
    } catch {}
    if (Date.now() > deadline) {
      child.kill('SIGTERM');
      throw new Error(`vite did not answer on ${port}:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`vite pid ${child.pid} on ${base}`);
  return { child, base };
}

async function stopVite(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))]);
  if (alive(child.pid)) {
    child.kill('SIGKILL');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2_000))]);
  }
  console.log(`vite pid ${child.pid} ${alive(child.pid) ? 'STILL RUNNING' : 'stopped'}`);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!existsSync(PREINSTALLED_CHROMIUM)) throw err;
    return chromium.launch({ executablePath: PREINSTALLED_CHROMIUM });
  }
}

/** Waits until the grounds have their manifest and every picture they draw has decoded; returns what is drawn. */
async function settle(page) {
  await page.getByTestId('colony-grounds').waitFor();
  // The hall resolves to a picture once the manifest is in (T-AC-2); before that every place is its SVG shape.
  await page.locator('[data-testid=picture-hall]').waitFor({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  // The review loop's selection readout is the mock's, not the game's.
  await page.addStyleTag({ content: '#mock-select-readout { display: none !important; }' });
  return page.evaluate(async () => {
    await document.fonts.ready;
    const svg = document.querySelector('[data-testid=colony-grounds]');
    const images = [...svg.querySelectorAll('image')];
    const decoded = await Promise.all(
      images.map(async (el) => {
        const href = el.getAttribute('href');
        const img = new Image();
        img.src = href;
        try {
          await img.decode();
          return null;
        } catch {
          return href;
        }
      }),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ids = (sel) => [...svg.querySelectorAll(sel)].map((e) => e.getAttribute('data-testid'));
    return {
      plate: svg.querySelector('[data-testid=plate]')?.getAttribute('href') ?? null,
      glowPlate: svg.querySelector('[data-testid=glow-plate]')?.getAttribute('href') ?? null,
      paving: !!svg.querySelector('[data-testid=paving]'),
      pictures: ids('[data-testid^=picture-]'),
      shapes: ids('[data-testid^=shape-]'),
      failed: decoded.filter(Boolean),
      viewBox: svg.getAttribute('viewBox'),
    };
  });
}

/** The Stadium in the shot: its 2 × 2 footprint's width on screen and px/m, and its picture's opaque width. */
async function measureStadium(page) {
  return page.evaluate(
    async ({ s, W, METRE }) => {
      const svg = document.querySelector('[data-testid=colony-grounds]');
      const ctm = svg.getScreenCTM();
      const iso = (c, r) => [((c - r) * W) / 2, ((c + r) * W) / 4];
      const [c0, r0, c1, r1] = [s.x - 2.5, s.y - 2.5, s.x + s.w - 2.5, s.y + s.h - 2.5];
      const toScreen = ([x, y]) => new DOMPoint(x, y).matrixTransform(ctm);
      const left = toScreen(iso(c0, r1)).x;
      const right = toScreen(iso(c1, r0)).x;
      const footprintPx = right - left;
      const metres = ((s.w + s.h) / 2) * (W / METRE);
      const out = { footprintPx, metres, pxPerMetre: footprintPx / metres, picture: null, opaquePx: null };
      const el = svg.querySelector(`[data-testid=picture-${s.n}]`);
      if (!el) return out;
      out.picture = el.getAttribute('href');
      const img = new Image();
      img.src = out.picture;
      await img.decode();
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = [img.naturalWidth, img.naturalHeight];
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
      let [min, max] = [Infinity, -Infinity];
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (data[(y * canvas.width + x) * 4 + 3] >= 128) {
            if (x < min) min = x;
            if (x > max) max = x;
          }
      const rect = el.getBoundingClientRect();
      if (max >= min) out.opaquePx = ((max - min + 1) / canvas.width) * rect.width;
      return out;
    },
    { s: STADIUM, W, METRE },
  );
}

/** Ours and look.html's colony render side by side at our shot's height, ours on the left. */
async function sideBySide(browser, ours, light, height, file) {
  const page = await browser.newPage();
  try {
    const look = `data:image/webp;base64,${readFileSync(join(LOOK, `colony-${light}.webp`)).toString('base64')}`;
    const mine = `data:image/png;base64,${readFileSync(ours).toString('base64')}`;
    await page.setContent(
      `<body style="margin:0;background:#000;display:flex;gap:8px;align-items:flex-start;width:max-content">` +
        `<img id="ours" src="${mine}" style="height:${height}px;display:block"><img id="look" src="${look}" style="height:${height}px;display:block"></body>`,
    );
    const dims = await page.evaluate(async () => {
      const imgs = [...document.images];
      await Promise.all(imgs.map((i) => i.decode()));
      return imgs.map((i) => ({ natural: [i.naturalWidth, i.naturalHeight], drawn: [i.getBoundingClientRect().width, i.getBoundingClientRect().height] }));
    });
    const width = Math.ceil(dims.reduce((s, d) => s + d.drawn[0], 0) + 8);
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: file });
    return dims;
  } finally {
    await page.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let vite;
  let browser;
  const errors = [];
  const summary = { at: new Date().toISOString(), manifestPlate: null, shots: [], sideBySides: [], phone: {}, stadium: {} };
  try {
    vite = await startVite();
    browser = await launch();
    const manifest = await (await fetch(`${vite.base}/art/colony/manifest.json`)).json();
    summary.manifestPlate = manifest.plate ? Object.keys(manifest.plate) : null;
    console.log(`manifest: sizes ${manifest.sizes.join('/')}, plate ${summary.manifestPlate ? summary.manifestPlate.join('+') : 'none'}`);

    const plan = [
      ...['day', 'dusk'].flatMap((light) => [
        { name: `opener-1280-${light}`, view: 'opener', light, viewport: { width: 1280, height: 720 } },
        { name: `opener-1920-${light}`, view: 'opener', light, viewport: { width: 1920, height: 1080 } },
        { name: `phone-390-${light}`, view: 'phone', light, viewport: { width: 390, height: 844 } },
        { name: `phone-worst-${light}`, view: 'phone', light, viewport: { width: 390, height: 844 }, query: '&worst=1' },
      ]),
    ];

    for (const shot of plan) {
      const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${shot.name}: ${e.message}`));
      const art = [];
      page.on('response', async (r) => {
        if (!new URL(r.url()).pathname.startsWith('/art/colony/')) return;
        const body = await r.body().catch(() => Buffer.alloc(0));
        art.push({ path: new URL(r.url()).pathname, status: r.status(), bytes: body.length });
      });
      try {
        await page.goto(`${vite.base}/tv-beat.html?view=${shot.view}&light=${shot.light}${shot.query ?? ''}`);
        const drawn = await settle(page);
        const file = join(OUT, `${shot.name}.png`);
        if (shot.view === 'phone') await page.getByTestId('phone-desk').screenshot({ path: file });
        else await page.screenshot({ path: file });
        // The phone's card is shorter than the phone: the side-by-side matches the card's height.
        const height = shot.view === 'phone' ? Math.round((await page.getByTestId('phone-desk').boundingBox()).height) : shot.viewport.height;
        const record = { ...shot, file, height, ...drawn };
        summary.shots.push(record);
        console.log(`shot ${file}  plate ${drawn.plate ?? 'none'}${drawn.glowPlate ? ' + glow' : ''}, ${drawn.pictures.length} pictures, shapes [${drawn.shapes.join(' ')}]${drawn.failed.length ? `, FAILED ${drawn.failed.join(' ')}` : ''}`);
        if (drawn.failed.length) errors.push(`${shot.name}: pictures that did not decode: ${drawn.failed.join(', ')}`);

        if (shot.name.startsWith('opener-1280')) {
          const m = await measureStadium(page);
          const ratio = m.pxPerMetre / LOOK_PX_PER_M;
          summary.stadium[shot.light] = { ...m, lookPxPerMetre: LOOK_PX_PER_M, lookFootprintPx: m.metres * LOOK_PX_PER_M, ratio };
          console.log(
            `Stadium (${shot.light}, 1280): footprint ${m.footprintPx.toFixed(1)} px over ${m.metres} m = ${m.pxPerMetre.toFixed(2)} px/m; look.html ${LOOK_PX_PER_M} px/m (${(m.metres * LOOK_PX_PER_M).toFixed(0)} px) → ${ratio.toFixed(3)}× ${ratio >= 0.9 ? '≥' : '<'} 0.9×` +
              (m.opaquePx ? `; its picture's opaque width ${m.opaquePx.toFixed(1)} px (${m.picture})` : '; no picture (SVG shape)'),
          );
        }

        if (shot.name.startsWith('phone-worst-')) {
          await page.waitForLoadState('networkidle');
          const total = art.reduce((s, a) => s + a.bytes, 0);
          const webp = art.filter((a) => a.path.endsWith('.webp')).reduce((s, a) => s + a.bytes, 0);
          summary.phone[shot.light] = { total, webp, files: art.length, budget: PHONE_BUDGET, ok: total <= PHONE_BUDGET, art };
          if (total > PHONE_BUDGET) errors.push(`B-AC-5: the phone loads ${total} bytes at ${shot.light}, over ${PHONE_BUDGET}`);
          console.log(`B-AC-5 phone ${shot.light}, heaviest colony: ${total} bytes under /art/colony/ (${webp} WebP in ${art.filter((a) => a.path.endsWith('.webp')).length} files + manifest), budget ${PHONE_BUDGET} → ${total <= PHONE_BUDGET ? 'ok' : 'OVER'}`);
          for (const a of art) console.log(`    ${a.status} ${String(a.bytes).padStart(8)}  ${a.path}`);
        }
      } finally {
        await context.close();
      }
    }

    for (const shot of summary.shots) {
      const file = join(OUT, `sbs-${shot.name}.png`);
      const dims = await sideBySide(browser, shot.file, shot.light, shot.height, file);
      summary.sideBySides.push({ file, ours: dims[0], look: dims[1] });
      console.log(`side-by-side ${file}  (look colony-${shot.light}.webp ${dims[1].natural.join('×')} drawn at ${dims[1].drawn.map(Math.round).join('×')})`);
    }
  } finally {
    await browser?.close();
    await stopVite(vite?.child);
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  }
  if (errors.length) {
    console.error(`shoot: FAILED\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`shoot: ok → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
