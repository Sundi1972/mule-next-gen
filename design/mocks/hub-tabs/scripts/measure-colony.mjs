// The Colony tab with WS10's grounds leading it, each phone alone at its own viewport, both tab positions: the picture's
// box, which plate drew (or the SVG shapes if the manifest failed), the light, and that nothing runs past the stage's width.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173';
const q = process.argv[3] ?? '?screen=tabs&state=colony';
const b = await chromium.launch();
let bad = 0;
for (const [w, h] of [[667, 375], [844, 390]]) {
  for (const tabs of ['left', 'bottom']) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${url}/${q}&tabs=${tabs}&solo=1`);
    await p.waitForSelector('[data-testid="colony-picture"] [data-testid="colony-grounds"]');
    await p.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('[data-testid="colony-picture"] image')];
      return imgs.length > 0;
    }, null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.top) }; };
      const pic = document.querySelector('[data-testid="colony-picture"]');
      const svg = pic.querySelector('[data-testid="colony-grounds"]');
      const tab = document.querySelector('[data-testid="colony-tab"]');
      const plate = svg.querySelector('[data-testid="plate"]');
      const imgs = [...svg.querySelectorAll('image')].map((i) => i.getAttribute('href'));
      const hidden = [...document.querySelectorAll('[data-testid="colony-columns"] [data-testid="colony-grounds"]')].filter((e) => e.getBoundingClientRect().height > 0).length;
      const stand = document.querySelector('[data-testid="colony-standings"]');
      return {
        tab: box(tab), pic: box(pic), svg: box(svg), extent: svg.getAttribute('data-extent'),
        plate: plate?.getAttribute('href') ?? null, pictures: imgs.length, loaded: [...svg.querySelectorAll('image')].length,
        standingsTop: Math.round(stand.getBoundingClientRect().top - tab.getBoundingClientRect().top),
        tabScroll: tab.scrollHeight, tabOverX: tab.scrollWidth - tab.clientWidth, docOverX: document.documentElement.scrollWidth - innerWidth, secondGrounds: hidden,
      };
    });
    const ok = r.plate && r.tabOverX <= 0 && r.docOverX <= 0 && r.secondGrounds === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${w}×${h} ${tabs.padEnd(6)} tab ${r.tab.w}×${r.tab.h} (scrolls to ${r.tabScroll})  picture ${r.svg.w}×${r.svg.h}  standings at +${r.standingsTop}  plate ${r.plate}  images ${r.pictures}  overX ${r.tabOverX}/${r.docOverX}  2nd grounds ${r.secondGrounds}`);
    await p.close();
  }
}
await b.close();
process.exit(bad ? 1 : 0);
