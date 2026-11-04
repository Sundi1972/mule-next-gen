import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const AI_SRC = 'packages/ai/src';
const PLAYBOOK = `${AI_SRC}/playbook`;
/** Reached through any chain of imports, these break INV-2: the model's path, the call-counted brain, the apps. */
const FORBIDDEN = [`${AI_SRC}/llm/`, `${AI_SRC}/brain.ts`, 'apps/'];
const FORBIDDEN_PACKAGES = ['@mule/server', '@mule/web'];
/** Clock reads and unseeded draws, as `object.member` calls, and `new Date`. */
const IMPURE_CALLS = new Set(['Math.random', 'Date.now', 'performance.now']);

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
}

/** Every module specifier a file names: imports, re-exports, dynamic import() and require(). */
function specifiers(source: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) out.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** A specifier as a repo path: a relative one resolved from `from` (`.js` names its `.ts`), `@mule/ai` its index. */
function resolve(from: string, spec: string): string | null {
  if (spec === '@mule/ai') return `${AI_SRC}/index.ts`;
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec)).replace(/\.js$/, '');
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(join(ROOT, candidate))) return candidate;
  return `${base}.ts`;
}

/** Each forbidden module the playbook files reach, with the chain of imports that reaches it, and each impure call. */
function faults(files: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!existsSync(join(ROOT, file))) return;
    for (const spec of specifiers(parse(file))) {
      const target = resolve(file, spec);
      const path = [...chain, spec].join(' → ');
      if (FORBIDDEN_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`)) || spec.includes('apps/')) out.push(`${path}: imports an app`);
      else if (target && FORBIDDEN.some((f) => target.startsWith(f) || target === f)) out.push(`${path}: reaches ${relative(AI_SRC, target)}`);
      else if (target) walk(target, [...chain, spec]);
    }
  };
  for (const file of files) {
    walk(file, [relative(AI_SRC, file)]);
    const source = parse(file);
    const visit = (node: ts.Node): void => {
      const line = () => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && IMPURE_CALLS.has(`${node.expression.text}.${node.name.text}`)) {
        out.push(`${relative(AI_SRC, file)}:${line()}: ${node.expression.text}.${node.name.text}`);
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') out.push(`${relative(AI_SRC, file)}:${line()}: new Date`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

describe('the playbook module is pure', () => {
  it('INV-2: playbook/** imports nothing from llm/, brain.ts or apps/, and calls no Math.random or Date.now', () => {
    const files = sources(PLAYBOOK);
    // A walk that found nothing would pass anything.
    expect(files.length).toBeGreaterThan(0);
    expect(faults(files), 'the playbook reads the game and its own seed only (spec INV-2)').toEqual([]);
  });
});
