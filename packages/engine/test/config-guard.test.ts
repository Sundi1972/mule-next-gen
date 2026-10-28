import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
/** Where balance numbers must not hide: everything here but config.ts. */
const SCANNED = ['packages/engine/src', 'packages/ai/src'];
/**
 * Files still being cleaned: their literals are listed but don't fail. A lane takes its file off once the file is
 * clean, and a clean file left here fails, so the list only shrinks.
 */
const PENDING = new Set<string>([
  // WS1: cleaned once #109 has merged, which rewrites most of them.
  'packages/ai/src/hands/auction.ts',
  'packages/ai/src/outlook.ts',
  'packages/ai/src/play.ts',
  'packages/ai/src/seat.ts',
  'packages/ai/src/sim.ts',
  'packages/ai/src/strategist.ts',
  'packages/ai/src/utility.ts',
  'packages/ai/src/value.ts',
  'packages/engine/src/economy.ts',
  'packages/engine/src/events.ts',
  'packages/engine/src/observe.ts',
  'packages/engine/src/production.ts',
  // WS7.
  'packages/ai/src/hands/vote.ts',
  'packages/engine/src/politics.ts',
]);
/** A literal that is not balance says why, on its line or the line above. */
const MARKER = /\/\/ literal-ok: (.{10,})/;
/** Numbers that are arithmetic, not balance. */
const EXEMPT = new Set(['0', '1', '-1']);

interface Finding {
  file: string;
  line: number;
  value: string;
}

/** Every numeric literal in a source that is not exempt, not a type or an index, and not marked. */
function findings(file: string, text: string): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines = text.split('\n');
  const marked = (line: number) => MARKER.test(lines[line - 1] ?? '') || MARKER.test(lines[line - 2] ?? '');
  const out: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node)) {
      const parent = node.parent;
      const negative = ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.MinusToken;
      const value = negative ? `-${node.text}` : node.text;
      const typed = ts.isLiteralTypeNode(parent) || (negative && ts.isLiteralTypeNode(parent.parent));
      const index = ts.isElementAccessExpression(parent) && parent.argumentExpression === node;
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (!EXEMPT.has(value) && !typed && !index && !marked(line)) out.push({ file, line, value });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') && e.name !== 'config.ts' ? [join(dir, e.name)] : [],
  );
}

describe('configurable balance', () => {
  it('INV-1: no file outside PENDING has an unmarked numeric literal', () => {
    const files = SCANNED.flatMap(sources);
    // A walk that found nothing would pass anything.
    expect(files.length).toBeGreaterThan(40);
    const all = files.flatMap((f) => findings(f, readFileSync(join(ROOT, f), 'utf8')));
    const failing = all.filter((f) => !PENDING.has(f.file)).map((f) => `${f.file}:${f.line} ${f.value}`);
    expect(failing, 'move the number into config.ts, or mark it `// literal-ok: <why it is not balance>`').toEqual([]);
    const stale = [...PENDING].filter((p) => !all.some((f) => f.file === p));
    expect(stale, 'clean now: take it off PENDING').toEqual([]);
  });

  it('INV-1: the guard sees a planted literal, and its marker clears it', () => {
    const planted = 'export const tax = (x: number) => x * 0.15;\n';
    expect(findings('planted.ts', planted)).toEqual([{ file: 'planted.ts', line: 1, value: '0.15' }]);
    expect(findings('planted.ts', `// literal-ok: a planted number, for the guard's own test\n${planted}`)).toEqual([]);
    // A marker without a reason is not a marker.
    expect(findings('planted.ts', `${planted.trimEnd()} // literal-ok: x\n`)).toHaveLength(1);
    // Exempt: 0, 1 and -1, a type, an index.
    expect(findings('planted.ts', 'type Two = 2;\nconst a = [5][0]!;\nconst b = xs[3];\nconst c = -1 + 0 * 1;\n')).toEqual([
      { file: 'planted.ts', line: 2, value: '5' },
    ]);
  });
});
