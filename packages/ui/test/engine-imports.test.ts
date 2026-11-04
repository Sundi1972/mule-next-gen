import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * AM-17: the design system takes data from the engine, never rules. @mule/ui may read the engine's config blocks, the
 * hall plan and its types; a rule function (stepFloor, reachOf, anything from game.ts) would put game logic in the
 * drawing, where the server and the sim no longer see it. Every name src/** imports from @mule/engine, value or type,
 * must be on this list, and every entry must be in use. A new name is a ruling for WS6, not a line to add here quietly.
 */
const ALLOWED = new Set([
  // Data: the hall plan the store draws, and the config blocks its walk reads.
  'HALL',
  'DEV_STEER',
  'WOLVES',
  // Types: exactly those Store.tsx draws the plan with.
  'HallPlace',
  'HallRect',
]);

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ENGINE = '@mule/engine';
const MESSAGE =
  'The design system takes data from the engine, never rules (spec AM-17): config blocks, the hall plan and types only, ' +
  'never a rule function such as stepFloor or reachOf, nor anything from game.ts. Draw from the data, or ask WS6 to rule on a new name.';

/** One name imported from the engine, and where. `*` is the engine whole or past its front door, `default` a default import. */
interface Use {
  file: string;
  name: string;
}

/** The engine package on disk: a relative path that lands in it reaches past the front door as surely as a deep one. */
const ENGINE_DIR = resolve(SRC, '../../engine');

/** How a module specifier in `file` reaches the engine: by its front door, past it, or not at all. */
function reachOfSpecifier(spec: string, file: string): 'front' | 'deep' | 'none' {
  if (spec === ENGINE) return 'front';
  if (spec.startsWith(`${ENGINE}/`)) return 'deep';
  if (!spec.startsWith('.')) return 'none';
  const rel = relative(ENGINE_DIR, resolve(dirname(file), spec));
  return rel.startsWith('..') || isAbsolute(rel) ? 'none' : 'deep';
}

/** The names an import or export clause takes from the front door: `default`, `*` for a namespace, or each name. */
function clauseNames(node: ts.ImportDeclaration | ts.ExportDeclaration): string[] {
  if (ts.isExportDeclaration(node)) {
    const clause = node.exportClause;
    if (!clause || ts.isNamespaceExport(clause)) return ['*'];
    return clause.elements.map((e) => (e.propertyName ?? e.name).text);
  }
  const clause = node.importClause;
  if (!clause) return [];
  const names = clause.name ? ['default'] : [];
  const bound = clause.namedBindings;
  if (bound && ts.isNamespaceImport(bound)) names.push('*');
  if (bound && ts.isNamedImports(bound)) names.push(...bound.elements.map((e) => (e.propertyName ?? e.name).text));
  return names;
}

/**
 * The names a source imports or re-exports from the engine, read by TypeScript's own parser, so comments, line breaks
 * and quote styles cannot hide one. Past the front door (a deep package path, a relative path into the engine, an
 * `import x = require()` or a dynamic import) counts as `*`.
 */
function engineNames(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const reach = reachOfSpecifier(node.moduleSpecifier.text, file);
      if (reach === 'front') names.push(...clauseNames(node));
      if (reach === 'deep') names.push('*');
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteralLike(node.moduleReference.expression)) {
      if (reachOfSpecifier(node.moduleReference.expression.text, file) !== 'none') names.push('*');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg) && reachOfSpecifier(arg.text, file) !== 'none') names.push('*');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** The verdict: one line for each use outside the allow-list. */
function verdict(uses: readonly Use[], allowed: ReadonlySet<string>): string[] {
  return uses.filter((u) => !allowed.has(u.name)).map((u) => `src/${u.file} imports ${u.name === '*' ? 'the engine whole or by a deep path' : u.name === 'default' ? 'a default export' : u.name}`);
}

/** Allow-list entries nothing imports: a stale entry would let a later import through unruled. */
function unused(uses: readonly Use[], allowed: ReadonlySet<string>): string[] {
  return [...allowed].filter((name) => !uses.some((u) => u.name === name));
}

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join(dir, f));
}

/** A ui source the samples pretend to be, for resolving relative paths. */
const SAMPLE = join(SRC, 'components', 'Sample.tsx');

describe('AM-17: @mule/ui takes data from the engine, never rules', () => {
  it.each([
    ['named imports, value and type, renamed', `import { HALL, type HallPlace, DEV_STEER as STEER } from '@mule/engine';`, ['HALL', 'HallPlace', 'DEV_STEER']],
    ['a type-only import', `import type { HallRect } from "@mule/engine";`, ['HallRect']],
    ['a multi-line import', `import {\n  reachOf,\n  stepFloor,\n} from '@mule/engine';`, ['reachOf', 'stepFloor']],
    ['a multi-line import with an apostrophe in a comment', `import {\n  // the hall's plan\n  HALL,\n  reachOf,\n} from '@mule/engine';`, ['HALL', 'reachOf']],
    ['a namespace import', `import * as engine from '@mule/engine';`, ['*']],
    ['a default import', `import engine from '@mule/engine';`, ['default']],
    ['a re-export', `export { WOLVES } from '@mule/engine';`, ['WOLVES']],
    ['a re-export of everything', `export * from '@mule/engine';`, ['*']],
    ['a deep package path', `import { buyMule } from '@mule/engine/src/game';`, ['*']],
    ['a relative path into the engine', `import { reachOf } from '../../../engine/src/floor/reach';`, ['*']],
    ['a dynamic import', `const later = import('@mule/engine');`, ['*']],
    ['a dynamic import by a template literal', 'const later = import(`@mule/engine`);', ['*']],
    ['an import from elsewhere', `import { cx } from './tokens';\nimport { reach } from '../../../ai/src/reach';`, []],
  ] as const)('the reader finds %s', (_, source, names) => {
    expect(engineNames(source, SAMPLE)).toEqual(names);
  });

  it('the verdict flags rules, the engine whole and a default; it passes the plan and its types', () => {
    const uses: Use[] = ['reachOf', 'stepFloor', '*', 'default', 'HALL', 'HallRect'].map((name) => ({ file: 'components/Sample.tsx', name }));
    expect(verdict(uses, ALLOWED)).toEqual([
      'src/components/Sample.tsx imports reachOf',
      'src/components/Sample.tsx imports stepFloor',
      'src/components/Sample.tsx imports the engine whole or by a deep path',
      'src/components/Sample.tsx imports a default export',
    ]);
    expect(unused([{ file: 'components/Sample.tsx', name: 'HALL' }], new Set(['HALL', 'DEV_WALK']))).toEqual(['DEV_WALK']);
  });

  it('every name src/** imports from @mule/engine is data on the allow-list, and every entry is in use', () => {
    const files = sources(SRC);
    expect(files.length, 'the ui sources were found').toBeGreaterThan(10);
    const uses: Use[] = files.flatMap((file) => engineNames(readFileSync(file, 'utf8'), file).map((name) => ({ file: relative(SRC, file), name })));
    // The store draws the plan: a reader that missed .tsx, or every import, would find nothing to judge.
    expect(uses, 'Store.tsx imports HALL').toContainEqual({ file: join('components', 'Store.tsx'), name: 'HALL' });
    expect(verdict(uses, ALLOWED), MESSAGE).toEqual([]);
    expect(unused(uses, ALLOWED), 'allow-list entries nothing in src/** imports: drop them').toEqual([]);
  });
});
