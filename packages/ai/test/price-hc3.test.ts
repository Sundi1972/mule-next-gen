import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SPREAD_HOME = new Set(['packages/engine/src/economy.ts', 'packages/engine/src/config.ts']);

/** Every .ts/.tsx file under each `<group>/*\/src`, as a path from the repo root. */
function sources(group: string): string[] {
  return readdirSync(join(ROOT, group), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const src = join(ROOT, group, d.name, 'src');
      try {
        return readdirSync(src, { recursive: true, encoding: 'utf8' }).map((f) => join(src, f));
      } catch {
        return [];
      }
    })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => relative(ROOT, f));
}

/** `file:line` for each line naming one of `names` as a whole identifier (a destructured or bracketed read counts too), or matching `pattern`. */
function hits(files: readonly string[], names: readonly string[], pattern = new RegExp(`\\b(${names.join('|')})\\b`)): string[] {
  return files.flatMap((file) =>
    readFileSync(join(ROOT, file), 'utf8')
      .split('\n')
      .flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}`] : [])),
  );
}

describe('price HC-3: no copy of the store spread outside economy.ts', () => {
  const files = [...sources('packages'), ...sources('apps')];

  it("price HC-3: the bands' spreads are read only where the engine prices the store", () => {
    expect(files, 'the engine and the AI sources were found').toEqual(expect.arrayContaining([...SPREAD_HOME, 'packages/ai/src/strategist.ts']));
    const copies = hits(files.filter((f) => !SPREAD_HOME.has(f)), ['bandSpread']);
    expect(copies, 'price the store through economy.ts (storeQuotes, storeSellAt, storeBuyAt), never the spread itself').toEqual([]);
  });

  it("price HC-3: the AI never reaches past storeQuotes to the engine's numeric core or its rounding", () => {
    const ai = files.filter((f) => f.startsWith('packages/ai/src/'));
    expect(hits(ai, ['storeLines', 'storeSellPrice']), 'the AI reads storeQuotes or the forecast helpers, never storeLines or storeSellPrice').toEqual([]);
  });

  it("price HC-3: the AI re-derives no band's margin and reads no colonists' wage (needs C2): storeBuyAt carries the margin", () => {
    const ai = files.filter((f) => f.startsWith('packages/ai/src/'));
    expect(hits(ai, ['colonistBudget', 'colonistAffordable']), 'colonists have no wages since needs C2: nothing in the AI prices by one').toEqual([]);
    // A margin typed out as a literal: 1 - 0.15, 1+.25. Read from config, it is bandSpread, which the scan above catches.
    expect(hits(ai, [], /\b1 ?[-+] ?0?\.\d/), "a spread's margin is read through storeBuyAt and storeSellAt").toEqual([]);
  });
});
