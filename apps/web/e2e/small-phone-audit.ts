/**
 * The in-page half of B-AC-11's box-by-box read: what a screen's WS4 parts break at the current viewport.
 * Kept a string: tsx's keepNames wraps any named function inside with `__name`, which the page lacks.
 */

export type AuditScope = {
  /** Where to look: every match is read, with all it holds. */
  roots: string[];
  /** Left out, with all they hold: other lanes' parts inside a WS4 surface. */
  skip: string[];
  /** Controls whose taps are not counted, as `selector`s; see the step that passes them for why. */
  tapsNotCounted?: string[];
};

export type AuditRead = {
  /** One line per broken box: what it is, how it breaks, its numbers. */
  fails: string[];
  /** The height of the rail's scrolling window, in css px, or null without a rail. */
  railWindow: number | null;
  /** The name in the rail header: its text, and whether it shows whole. */
  name: { text: string; whole: boolean } | null;
};

export const MIN_TAP = 32;
export const MIN_TEXT = 10;

/** Runs in the page with one AuditScope; returns an AuditRead. */
export const AUDIT_JS = String.raw`(scope) => {
  const MIN_TAP = ${MIN_TAP};
  const MIN_TEXT = ${MIN_TEXT};
  const roots = scope.roots.flatMap((s) => [...document.querySelectorAll(s)]);
  const skipped = (el) => scope.skip.some((s) => el.closest(s));
  const inScope = (el) => roots.some((r) => r.contains(el)) && !skipped(el);
  const r1 = (n) => Math.round(n * 10) / 10;
  const short = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const id = (el) => {
    const own = el.getAttribute('data-testid');
    if (own) return own;
    const anc = el.parentElement && el.parentElement.closest('[data-testid]');
    const label = el.getAttribute('aria-label') || short(el.textContent);
    return (anc ? anc.getAttribute('data-testid') + ' ' : '') + el.tagName.toLowerCase() + (label ? ' "' + label + '"' : '');
  };
  const shown = (el) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const srOnly = (el) => !!el.closest('.sr-only');
  const all = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]).filter((el, i, a) => a.indexOf(el) === i && inScope(el) && !srOnly(el) && shown(el));
  const fails = [];

  const INTERACTIVE = 'button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=radio],[role=tab],[role=checkbox],[role=switch],[role=slider],[tabindex]:not([tabindex="-1"])';
  const notCounted = scope.tapsNotCounted || [];
  for (const el of all) {
    if (!el.matches(INTERACTIVE) || el.ownerSVGElement) continue;
    const outer = el.parentElement && el.parentElement.closest(INTERACTIVE);
    if (outer && inScope(outer)) continue;
    if (notCounted.some((s) => el.matches(s))) continue;
    const b = el.getBoundingClientRect();
    if (b.width < MIN_TAP - 0.01 || b.height < MIN_TAP - 0.01) fails.push(id(el) + ': tap ' + r1(b.width) + '×' + r1(b.height) + ' px');
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
      if (!notCounted.some((s) => el.matches(s))) fails.push(id(el) + ': content cut, ' + el.scrollWidth + '×' + el.scrollHeight + ' in ' + el.clientWidth + '×' + el.clientHeight);
    }
  }

  for (const el of all) {
    if (el.ownerSVGElement) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) fails.push(id(el) + ': truncated "' + short(el.textContent) + '", ' + el.scrollWidth + ' in ' + el.clientWidth + ' px');
    else {
      const hx = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const hy = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (hx && el.scrollWidth > el.clientWidth + 1) fails.push(id(el) + ': clipped across, ' + el.scrollWidth + ' in ' + el.clientWidth + ' px');
      if (hy && el.scrollHeight > el.clientHeight + 1) fails.push(id(el) + ': clipped down, ' + el.scrollHeight + ' in ' + el.clientHeight + ' px');
    }
  }

  const seen = new Set();
  for (const root of roots) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const p = n.parentElement;
      // Text is what has a letter or a digit; a lone ▴ or ✕ is a mark.
      if (!p || seen.has(n) || !/[\p{L}\p{N}]/u.test(n.textContent) || !inScope(p) || srOnly(p)) continue;
      seen.add(n);
      const svg = p.closest('svg');
      if (svg ? !shown(svg) : !shown(p)) continue;
      let scale = 1;
      if (svg) {
        const m = p.getScreenCTM && p.getScreenCTM();
        if (m) scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      } else {
        for (let a = p; a; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.transform && acs.transform !== 'none') {
            const m = new DOMMatrix(acs.transform);
            scale *= Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
          }
          if (acs.scale && acs.scale !== 'none') scale *= parseFloat(acs.scale);
        }
      }
      const px = Math.round(parseFloat(getComputedStyle(p).fontSize) * scale * 100) / 100;
      if (px < MIN_TEXT) fails.push(id(p) + ': text ' + px + ' px "' + short(n.textContent) + '"');
      if (svg) continue;
      // A word broken over two lines: the same word's boxes stand on different lines. A hyphen is a break of its own.
      for (const m of n.textContent.matchAll(/[^\s\-‐–—]{2,}/g)) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const tops = [];
        for (const rc of range.getClientRects()) if (rc.width > 0.5 && !tops.some((t) => Math.abs(t - rc.top) < rc.height * 0.6)) tops.push(rc.top);
        if (tops.length > 1) fails.push(id(p) + ': "' + m[0] + '" wraps mid-word');
      }
    }
  }

  const vw = window.innerWidth, vh = window.innerHeight;
  for (const el of all) {
    const b = el.getBoundingClientRect();
    if (b.left >= -1 && b.top >= -1 && b.right <= vw + 1 && b.bottom <= vh + 1) continue;
    let clipper = null;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { clipper = a; break; }
    }
    if (clipper && clipper !== document.documentElement && clipper !== document.body) continue;
    fails.push(id(el) + ': off screen, ' + r1(b.left) + ',' + r1(b.top) + ' to ' + r1(b.right) + ',' + r1(b.bottom) + ' in ' + vw + '×' + vh);
  }

  const guide = document.querySelector('[data-testid=guide]');
  const body = guide && guide.querySelector(':scope > .overflow-y-auto');
  const nameEl = guide && guide.querySelector('[data-testid=self-name]');
  return {
    fails,
    railWindow: body ? r1(body.getBoundingClientRect().height) : null,
    name: nameEl ? { text: nameEl.textContent, whole: nameEl.scrollWidth <= nameEl.clientWidth } : null,
  };
}`;
