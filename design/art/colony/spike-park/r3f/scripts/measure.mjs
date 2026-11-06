// FPS and renderer numbers: node scripts/measure.mjs [baseUrl] > shots/measure.json
// Two browsers: vsync-capped (what a viewer sees, max 60) and uncapped (GPU headroom on this machine).
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const PW = '/Users/heiko/Projects/mule-next-gen/.claude/worktrees/ws10-visual/node_modules/.pnpm/playwright@1.56.1/node_modules/playwright'
const { chromium } = require(PW)

const base = process.argv[2] ?? 'http://127.0.0.1:8820/'
// SCENE=colony: the 3×3 grounds; only the FPS table, not the per-effect sweep.
const SCENE = process.env.SCENE === 'colony' ? 'scene=colony&' : ''
// GL=swiftshader: software GL as a stand-in for a weak GPU; slow, but per-effect pixel costs show up.
const SOFT = process.env.GL === 'swiftshader'
const GPU = SOFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const UNCAP = ['--disable-gpu-vsync', '--disable-frame-rate-limit']

const VIEWS = {
  tv: { width: 1920, height: 1080, dpr: 1 },
  phone: { width: 390, height: 844, dpr: 3 },
}

async function run(browser, view, q, throttle = 1, seconds = 5) {
  const v = VIEWS[view]
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const t0 = Date.now()
  await page.goto(`${base}?shot=1&${SCENE}${q}`)
  await page.waitForFunction(() => (window.__perf?.frames ?? 0) > 20, null, { timeout: 180000 })
  const loadWall = Date.now() - t0
  await page.waitForTimeout(1000) // let shaders and the AO accumulation settle
  const fps = await page.evaluate(
    (s) =>
      new Promise((res) => {
        const times = []
        const start = performance.now()
        const tick = (t) => {
          times.push(t)
          if (t - start < s * 1000) requestAnimationFrame(tick)
          else {
            const d = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b)
            res({
              fps: +(((times.length - 1) * 1000) / (times.at(-1) - times[0])).toFixed(1),
              p95ms: +d[Math.floor(d.length * 0.95)].toFixed(1),
            })
          }
        }
        requestAnimationFrame(tick)
      }),
    seconds,
  )
  const perf = await page.evaluate(() => window.__perf)
  await ctx.close()
  return { view, q, throttle, ...fps, calls: perf.calls, triangles: perf.triangles, modelTris: perf.modelTris, pixelRatio: perf.pixelRatio, firstFrameMs: Math.round(perf.firstFrameMs), loadWallMs: loadWall, model: perf.model, gl: perf.glRenderer, errors }
}

const out = { runs: [] }
const log = (r) => {
  out.runs.push(r)
  console.error(JSON.stringify(r))
}

// The asked-for table: dusk (the heavier mood: lamp lights + strong bloom), DPR as the viewport gives it.
for (const [label, args] of SOFT ? [] : [['capped', GPU], ['uncapped', [...GPU, ...UNCAP]]]) {
  const b = await chromium.launch({ args })
  for (const view of ['tv', 'phone'])
    for (const throttle of [1, 4]) log({ mode: label, ...(await run(b, view, 'mood=dusk&dpr=3', throttle)) })
  await b.close()
}

// Per-effect cost: uncapped, phone viewport, one effect off at a time.
if (!SCENE) {
  const b = await chromium.launch({ args: [...GPU, ...UNCAP] })
  const variants = SOFT
    ? ['', 'ssao=0', 'shadows=0', 'bloom=0', 'post=0', 'dpr=2', 'dpr=2&shadowMap=1024&ssao=0', 'dpr=1.5&shadowMap=1024&ssao=0']
    : ['', 'ssao=0', 'shadows=0', 'bloom=0', 'smaa=0', 'lampLights=0', 'post=0', 'post=0&shadows=0', 'merge=0', 'dpr=2', 'dpr=1.5&shadowMap=1024', 'dpr=2&shadowMap=1024&ssao=0']
  for (const q of variants)
    log({ mode: SOFT ? 'soft' : 'effect', ...(await run(b, 'phone', `mood=dusk&${q.includes('dpr=') ? '' : 'dpr=3&'}${q}`, 1, 4)) })
  await b.close()
}
console.log(JSON.stringify(out, null, 1))
