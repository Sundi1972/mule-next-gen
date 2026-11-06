import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HandoffCode } from '../src/phone/HandoffCode';

/** The design system's colour tokens: every `--color-<name>` in @mule/ui's theme.css. */
const TOKENS = new Set([...readFileSync(new URL('../../../packages/ui/src/theme.css', import.meta.url), 'utf8').matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
/** Tailwind's own colours, which need no token. */
const BUILT_IN = new Set(['white', 'black', 'transparent', 'current']);

/** Each background colour a piece of markup asks for, by name (`bg-raised/85` and `md:bg-raised` both give "raised"). */
function backgrounds(html: string): string[] {
  const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/));
  return classes.map((c) => c.split(':').pop()!.match(/^bg-([a-z][a-z0-9-]*?)(?:\/\d+)?!?$/)?.[1]).filter((n): n is string => !!n);
}

describe('HANDOFF-QR (WS4): the move-to-phone code box is drawn in the design system’s colours', () => {
  it('while the code is on its way, the box behind "Making a code…" has a background the theme defines', () => {
    const html = renderToStaticMarkup(createElement(HandoffCode, { url: 'https://mule.test/h/ABC', state: 'waiting', onRenew: () => {} }));
    expect(html).toContain('Making a code');
    const named = backgrounds(html);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !TOKENS.has(n) && !BUILT_IN.has(n))).toEqual([]);
  });

  it('when the code has expired, the cover over the greyed code has a background the theme defines', () => {
    const html = renderToStaticMarkup(createElement(HandoffCode, { url: 'https://mule.test/h/ABC', state: 'expired', onRenew: () => {} }));
    expect(html).toContain('This code has expired.');
    expect(backgrounds(html).filter((n) => !TOKENS.has(n) && !BUILT_IN.has(n))).toEqual([]);
  });
});
