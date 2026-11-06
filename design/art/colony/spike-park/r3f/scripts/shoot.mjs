// Screenshots: node scripts/shoot.mjs [baseUrl] [outDir] [extraQuery]
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const PW = '/Users/heiko/Projects/mule-next-gen/.claude/worktrees/ws10-visual/node_modules/.pnpm/playwright@1.56.1/node_modules/playwright'
const { chromium } = require(PW)

const base = process.argv[2] ?? 'http://127.0.0.1:8820/'
const out = process.argv[3] ?? new URL('../shots/', import.meta.url).pathname
const extra = process.argv[4] ?? ''
export const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']

const browser = await chromium.launch({ args: GPU_ARGS })
async function shot(name, w, h, dpr, q) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()))
  await page.goto(`${base}?shot=1&${q}&${extra}`)
  await page.waitForFunction(() => (window.__perf?.frames ?? 0) > 30, null, { timeout: 120000 })
  await page.waitForTimeout(500)
  const perf = await page.evaluate(() => window.__perf)
  await page.screenshot({ path: `${out}/${name}.png`, omitBackground: true })
  console.log(name, JSON.stringify(perf))
  await page.close()
}
await shot('park_day', 1600, 1200, 1, 'mood=day')
await shot('park_dusk', 1600, 1200, 1, 'mood=dusk')
await shot('park_phone_dusk', 390, 844, 3, 'mood=dusk&frame=18')
await browser.close()
