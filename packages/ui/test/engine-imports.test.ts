import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * AM-17: the design system takes data from the engine, never rules. @mule/ui may read the engine's config blocks, the
 * hall plan and its types; a rule function (stepFloor, reachOf, anything from game.ts) would put game logic in the
 * drawing, where the server and the sim no longer see it. Every name src/** imports from @mule/engine, value or type,
 * must be on this list. A new name is a ruling for WS6, not a line to add here quietly.
 */
const ALLOWED = new Set([
  // Data: the hall plan the store draws, and the config blocks its walk and condition read.
  'HALL',
  'DEV_STEER',
  'WOLVES',
  'DEV_WALK',
  // Types: exactly those Store.tsx draws the plan with.
  'HallPlace',
  'HallRect',
]);

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ENGINE = '@mule/engine';

/** One name imported from the engine, and where. `*` is a namespace or a dynamic import, `default` a default one. */
interface Use {
  file: string;
  name: string;
}

/**
 * The names a source imports or re-exports from the engine. A clause holds no quote or semicolon, so the match never
 * runs back over an earlier import. A deep path into the engine counts as `*`: it reaches past the package's front door.
 */
function engineNames(source: string): string[] {
  const names: string[] = [];
  const statement = /\b(?:import|export)\s+(?:type\s+)?([^;'"]*?)\s*from\s*['"](@mule\/engine(?:\/[^'"]*)?)['"]/g;
  for (const [, clause, spec] of source.matchAll(statement)) {
    if (spec !== ENGINE || clause!.includes('*')) {
      names.push('*');
      continue;
    }
    const brace = clause!.indexOf('{');
    const head = (brace < 0 ? clause! : clause!.slice(0, brace)).replace(/,\s*$/, '').trim();
    if (head) names.push('default');
    if (brace >= 0) {
      const inner = clause!.slice(brace + 1, clause!.lastIndexOf('}'));
      for (const part of inner.split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
        if (name) names.push(name);
      }
    }
  }
  for (const _ of source.matchAll(/\bimport\(\s*['"]@mule\/engine(?:\/[^'"]*)?['"]\s*\)/g)) names.push('*');
  return names;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join(dir, f));
}

describe('AM-17: @mule/ui takes data from the engine, never rules', () => {
  it('the reader finds every form of engine import', () => {
    const sample = [
      `import { HALL, type HallPlace, DEV_STEER as STEER } from '@mule/engine';`,
      `import type { HallRect } from "@mule/engine";`,
      `import {\n  reachOf,\n  stepFloor,\n} from '@mule/engine';`,
      `import * as engine from '@mule/engine';`,
      `export { WOLVES } from '@mule/engine';`,
      `import { buyMule } from '@mule/engine/src/game';`,
      `const later = import('@mule/engine');`,
      `import { cx } from './tokens';`,
    ].join('\n');
    expect(engineNames(sample)).toEqual(['HALL', 'HallPlace', 'DEV_STEER', 'HallRect', 'reachOf', 'stepFloor', '*', 'WOLVES', '*', '*']);
  });

  it('every name src/** imports from @mule/engine is data on the allow-list', () => {
    const files = sources(SRC);
    expect(files.length, 'the ui sources were found').toBeGreaterThan(10);
    const uses: Use[] = files.flatMap((file) => engineNames(readFileSync(file, 'utf8')).map((name) => ({ file: relative(SRC, file), name })));
    const outside = uses.filter((u) => !ALLOWED.has(u.name)).map((u) => `src/${u.file} imports ${u.name === '*' ? 'the engine whole or by a deep path' : u.name}`);
    expect(
      outside,
      'The design system takes data from the engine, never rules (spec AM-17): config blocks, the hall plan and types only, ' +
        'never a rule function such as stepFloor or reachOf, nor anything from game.ts. Draw from the data, or ask WS6 to rule on a new name.',
    ).toEqual([]);
  });
});
