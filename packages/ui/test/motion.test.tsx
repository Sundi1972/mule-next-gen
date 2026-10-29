import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Creature, Mule, replays, SPECIES } from '../src/index';

const CYAN = '#38e1ff';

/** theme.css without its comments, for the rules a node runner cannot apply (it has no CSS engine). */
const THEME = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first block whose prelude matches, up to its matching brace. */
function block(css: string, prelude: RegExp): string {
  const m = prelude.exec(css);
  expect(m, `a block matching ${prelude}`).not.toBeNull();
  let depth = 0;
  const open = css.indexOf('{', m!.index);
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${prelude}`);
}

/** The declarations of the rule whose selector is exactly this, in the given CSS. */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block(css, new RegExp(`(^|[}\\s])${esc}\\s*\\{`));
}

describe('Creature in motion (variant A, bob and waddle)', () => {
  it.each(SPECIES)('M-4: %s with no motion props is the bare drawing, as every caller gets it today', (species) => {
    const html = renderToStaticMarkup(<Creature species={species} color={CYAN} size={40} className="block" />);
    expect(html).toMatch(/^<svg viewBox="0 0 32 32" width="40" height="40" class="block" aria-hidden="true"/);
    expect(html).not.toContain('<span');
    expect(html).not.toMatch(/class="cm/);
  });

  it('M-5: walking left, the creature sits in the motion wrappers with its stride and the flip, its drawing unchanged', () => {
    const bare = renderToStaticMarkup(<Creature species="mollox" color={CYAN} size={40} className="block" />);
    const html = renderToStaticMarkup(<Creature species="mollox" color={CYAN} size={40} motion="walk" facing="left" cycle={0.6} />);
    const root = html.match(/^<span[^>]*>/)?.[0] ?? '';
    expect(root).toMatch(/class="cm[ "]/);
    expect(root).toContain('data-motion="walk"');
    expect(root).toContain('data-facing="left"');
    expect(root).toContain('--cycle:0.600s');
    expect(root).toContain('width:40px');
    // Outside in: facing > glance > lean > hit > (strike) hit > body > sway > the drawing.
    const order = ['cm-face', 'cm-glance', 'cm-lean', 'cm-hit', 'cm-body', 'cm-sway'].map((c) => html.indexOf(`class="${c}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.slice(order.at(-1)!)).toContain(bare);
    // The rules that play it (a node runner has no CSS engine: asserted on theme.css, played in the bench).
    expect(rule(THEME, ".cm[data-facing='left'] .cm-face")).toMatch(/transform:\s*scaleX\(-1\)/);
    expect(rule(THEME, ".cm[data-motion='walk'] .cm-body")).toMatch(/animation:\s*cm-hop calc\(var\(--cycle\) \/ 2\)/);
    expect(rule(THEME, ".cm[data-motion='walk'] .cm-sway")).toMatch(/animation:\s*cm-sway var\(--cycle\)/);
  });

  it('M-5: facing alone stands the creature in the wrappers, idle, breathing on the default stride', () => {
    const html = renderToStaticMarkup(<Creature species="zipwing" color={CYAN} facing="left" />);
    expect(html).toMatch(/^<span[^>]*data-motion="idle"[^>]*data-facing="left"/);
    expect(html).toContain('--cycle:2.600s');
    expect(rule(THEME, ".cm[data-motion='idle'] .cm-body")).toMatch(/animation:\s*cm-breathe var\(--cycle\)/);
  });

  it.each([
    // props → the root's facing and stride: each missing or unusable prop falls back, so no loop freezes.
    ['walking alone faces right on the full-speed stride', { motion: 'walk' }, 'right', '0.500s'],
    ['a fight with no cycle jabs on the fallback lunge', { motion: 'fight' }, 'right', '1.600s'],
    ['a stride that is not a number falls back to the default', { motion: 'walk', cycle: Number.NaN }, 'right', '0.500s'],
    ['a zero stride falls back to the default', { motion: 'walk', cycle: 0 }, 'right', '0.500s'],
    ['a negative stride falls back to the default', { motion: 'run', facing: 'left', cycle: -1 }, 'left', '0.500s'],
  ] as const)('M-5: %s', (_, props, facing, cycle) => {
    const root = renderToStaticMarkup(<Creature species="gearling" color={CYAN} {...props} />).match(/^<span[^>]*>/)?.[0] ?? '';
    expect(root).toContain(`data-facing="${facing}"`);
    expect(root).toContain(`--cycle:${cycle}`);
  });

  it.each([
    // seen (the count at the last render), count now, reduced motion → plays the bite's flinch or the own strike
    ['on mount: the count is the one already seen', 2, 2, false, false],
    ['a new bite', 2, 3, false, true],
    ['a new bite under reduced motion', 2, 3, true, false],
    ['the counter going down (a new round) is not a bite', 3, 0, false, false],
  ] as const)('M-5: the one-shots: %s', (_, seen, count, reduced, plays) => {
    expect(replays(seen, count, reduced)).toBe(plays);
  });

  it('M-6: under reduced motion no cycle loops, the lean pose holds, and facing still flips', () => {
    const reduced = block(THEME, /@media \(prefers-reduced-motion: reduce\)\s*\{(?=[^{}]*\.cm\b)/);
    expect(rule(reduced, '.cm')).toMatch(/--rm:\s*1/);
    expect(rule(reduced, '.cm *')).toMatch(/animation:\s*none !important/);
    expect(rule(reduced, '.cm *')).toMatch(/transition:\s*none !important/);
    // The lean is a static transform scaled by --rm, outside any animation, so it is the reduced pose.
    expect(rule(THEME, '.cm-lean')).toMatch(/var\(--rm\)/);
    // The flip is a static transform too, outside the media query: the reduced creature still turns.
    expect(reduced).not.toContain('cm-face');
  });
});

describe('the MULE in motion', () => {
  it('M-7: a walking MULE given the colonist’s stride steps and bobs on it; without one, on its own 0.5 s', () => {
    const inStep = renderToStaticMarkup(<Mule state="walk" owner={1} cycle={0.8} />);
    const steps = inStep.match(/<g class="animate-\[mule-step[^"]*"[^>]*>/g) ?? [];
    expect(steps).toHaveLength(4);
    for (const g of steps) expect(g).toContain('animation-duration:0.8s');
    expect(inStep.match(/<g class="animate-\[mule-bob[^"]*"[^>]*>/)?.[0]).toContain('animation-duration:0.8s');
    const own = renderToStaticMarkup(<Mule state="walk" owner={1} />);
    expect(own).not.toContain('animation-duration');
    expect(own).toContain('animate-[mule-step_0.5s');
    // Only a walk takes the stride, and only a usable one.
    expect(renderToStaticMarkup(<Mule state="idle" owner={1} cycle={0.8} />)).not.toContain('animation-duration');
    expect(renderToStaticMarkup(<Mule state="walk" owner={1} cycle={Number.NaN} />)).not.toContain('animation-duration');
    expect(renderToStaticMarkup(<Mule state="walk" owner={1} cycle={0} />)).not.toContain('animation-duration');
  });

  it('M-8: an idle MULE breathes in held steps, so it relayouts on a step, not on every frame', () => {
    const idle = renderToStaticMarkup(<Mule state="idle" owner={1} />);
    const breathe = idle.match(/class="(animate-\[mule-breathe[^"]*)"/)?.[1] ?? '';
    expect(breathe).toMatch(/_step-end_/);
    // The held steps sample the old ease: many stops, each held, between rest and the full breath.
    const stops = block(THEME, /@keyframes mule-breathe\s*\{/).match(/[\d.]+%/g) ?? [];
    expect(stops.length).toBeGreaterThanOrEqual(8);
  });
});
