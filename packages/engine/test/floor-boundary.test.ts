import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FLOOR = 'packages/engine/src/floor';
/** What the floor must never import, by package name or by path from the repo's root. */
const OFF_LIMITS = ['apps', 'packages/ai', 'packages/protocol', '@mule/ai', '@mule/server', '@mule/web', '@mule/protocol'];
/** The product code a floor could be written from, outside floor/ itself. design/'s mocks are not product code. */
const SCANNED = ['packages', 'apps'];
const TEST_DIRS = new Set(['test', 'tests', 'e2e', '__tests__']);
const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/;
/** The types whose fields only floor/ writes: the floor, its colonists, and the lead and encounter a colonist holds. */
const FLOOR_TYPES = ['DevFloor', 'FloorColonist', 'FloorEncounter', 'FloorLead'];
/** A name that says it holds a floor or a colonist: `floor`, `nextFloor`, `colonists`, `myColonist`. */
const FLOOR_NAME = /(floor|colonists?)$/i;
/** Calls that hand back one of a collection's own elements. */
const PICKERS = new Set(['find', 'findLast', 'at', 'get']);
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const FIELD_WRITERS = new Set(['Object.assign', 'Object.defineProperty', 'Object.defineProperties', 'Reflect.set', 'Reflect.defineProperty', 'Reflect.deleteProperty']);
/** Which parameter of an array method's callback is the element. */
const ELEMENT_PARAM = new Map([
  ...['forEach', 'map', 'flatMap', 'filter', 'find', 'findLast', 'findIndex', 'some', 'every'].map((m) => [m, 0] as const),
  ['reduce', 1],
  ['reduceRight', 1],
]);

const PLANTED = `${FLOOR}/planted.ts`;
const FORBIDDEN_IMPORTS = [
  "import { playTurn } from '@mule/ai';",
  "import type { ClientMessage } from '@mule/protocol';",
  "export { MuleGame } from '@mule/server/src/mule-game.js';",
  "import '../../../../apps/web/src/main.js';",
  "const ai = await import('../../../ai/src/index.js');",
  "type View = import('@mule/web').View;",
  "import wire = require('../../../protocol/src/index.js');",
];
const ALLOWED_IMPORTS = ["import { DEV_STEER } from '../config.js';", "import type { GameState } from '../types.js';", "import { x } from '@mule/ai-kit';"];

/** One snippet per form of write the guard claims to see. */
const CAUGHT = [
  'floor.colonists = [];',
  'room.floor.tick += 1;',
  'next.colonists[i]!.x = 3;',
  'floor.colonists[0] = me;',
  'colonist.pelts++;',
  'delete colonist.encounter;',
  "colonist.lead!.good ??= 'food';",
  '[floor.tick] = [9];',
  'function hurt(c: FloorColonist) { Object.assign(c, { bitten: true }); }',
  'const f = latest() as DevFloor; f.tick = 0;',
  'for (const c of floor.colonists) c.y = 0;',
  'floor.colonists.forEach((c) => { c.moving = false; });',
  "ctx.floor.colonists.find((c) => c.id === me)!.space = 'hall';",
  'class Room { private live: DevFloor | null = null; reset() { this.live!.tick = 0; } }',
  '(floor.colonists as FloorColonist[]).push(me);',
  "import type { FloorColonist as Walker } from '@mule/engine'; const w: Walker = make(); w.facing = 'left';",
];
/** Near misses: reads, copies, and other things' fields. */
const CLEAN = [
  'const me = { ...colonist, x: 2 }; me.x = 3;',
  'const p = { x: 0, y: 0 }; p.x = colonist.x;',
  'colonist.walk = null;',
  'const n = floor.colonists.length; total += n;',
  'hallMarks.floor = mark();',
  'floor.colonists.map((c) => c.id).sort();',
  'function f(c: FloorColonist) { return c.x; } function g(c: Point) { c.x = 1; }',
];

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const parse = (file: string, text = read(file)) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/** Every TypeScript file under dir, repo-relative, leaving out dependencies, dot-folders and whatever `skip` names. */
function walk(dir: string, skip: (name: string, path: string) => boolean = () => false): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`;
    if (e.name === 'node_modules' || e.name.startsWith('.') || skip(e.name, path)) return [];
    if (e.isDirectory()) return walk(path, skip);
    return /\.[cm]?tsx?$/.test(e.name) ? [path] : [];
  });
}

/** Every module a source names: imports and re-exports, type-only too, `import()`, `require()` and `import('…')` types. */
function specifiers(source: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    let spec: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) spec = node.moduleSpecifier;
    else if (ts.isExternalModuleReference(node)) spec = node.expression;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) spec = node.argument.literal;
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      spec = node.arguments[0];
    }
    if (spec && ts.isStringLiteralLike(spec)) out.push(spec.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Whether a specifier, as written in `file`, lands in an app, the AI or the protocol. */
function offLimits(file: string, spec: string): boolean {
  const target = spec.startsWith('.') ? posix.join(posix.dirname(file), spec) : spec.startsWith('/') ? posix.relative(ROOT, spec) : spec;
  return OFF_LIMITS.some((p) => target === p || target.startsWith(`${p}/`));
}

const isAssignment = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
  node.operatorToken.kind <= ts.SyntaxKind.LastAssignment;

/**
 * Every write to a floor field in one source, as `file:line code`. Lexical: one file's syntax, no types, no imports
 * followed.
 *
 * Catches assignment of every kind (compound, logical, destructuring), `++`, `--` and `delete` on a floor field;
 * Object.assign, Object.defineProperty and Reflect.set on a floor value; push, splice, sort and the other in-place
 * changes on one. A floor value is one named as a floor (FLOOR_NAME), typed as one (`c: FloorColonist`, `as DevFloor`,
 * a member declared DevFloor, an import renamed), reached from one (`floor.colonists[i]`, `colonist.lead`,
 * `.find(…)!`), or bound from one in the same function (`const c = …`, `for (const c of …)`, a callback's element).
 *
 * Misses a floor under a name that says nothing whose type is inferred, `any` or a local alias
 * (`const f = latest(); f.tick = 1`), and one handed to a function in another file that writes it: only the
 * compiler sees those, and only for fields marked readonly. Errs the other way on a value that is not a floor but is
 * named like one and has a floor's field (`colonists.push`, `myColonist.x =`): rename it.
 */
function floorWrites(file: string, text: string, fields: ReadonlySet<string>): string[] {
  const source = parse(file, text);
  const typeNames = [...FLOOR_TYPES];
  for (const s of source.statements) {
    const named = ts.isImportDeclaration(s) ? s.importClause?.namedBindings : undefined;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) if (el.propertyName && FLOOR_TYPES.includes(el.propertyName.text)) typeNames.push(el.name.text);
    }
  }
  const floorType = new RegExp(`\\b(${typeNames.join('|')})\\b`);
  const typedFloor = (type: ts.TypeNode | undefined) => type !== undefined && floorType.test(type.getText(source));

  const bound = new Map<ts.Node, Set<string>>();
  const members = new Set<string>();
  const scopeOf = (n: ts.Node) => ts.findAncestor(n.parent, (a) => ts.isFunctionLike(a) || ts.isSourceFile(a));
  const bind = (name: ts.BindingName, scope: ts.Node | undefined): void => {
    if (!scope) return;
    if (ts.isIdentifier(name)) bound.set(scope, (bound.get(scope) ?? new Set<string>()).add(name.text));
    else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bind(el.name, scope);
  };
  const isBound = (id: ts.Identifier) => {
    for (let s = scopeOf(id); s; s = scopeOf(s)) if (bound.get(s)?.has(id.text)) return true;
    return false;
  };

  const floorish = (e: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) return floorish(e.expression);
    if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) return typedFloor(e.type) || floorish(e.expression);
    if (ts.isIdentifier(e)) return FLOOR_NAME.test(e.text) || isBound(e);
    if (ts.isPropertyAccessExpression(e)) {
      const name = e.name.text;
      return FLOOR_NAME.test(name) || members.has(name) || (fields.has(name) && floorish(e.expression));
    }
    if (ts.isElementAccessExpression(e)) return floorish(e.expression);
    if (!ts.isCallExpression(e)) return false;
    // buildFloor(…) and stepFloor(…) hand back a floor; `.find(…)` on one hands back a colonist.
    if (ts.isIdentifier(e.expression)) return FLOOR_NAME.test(e.expression.text);
    return ts.isPropertyAccessExpression(e.expression) && PICKERS.has(e.expression.name.text) && floorish(e.expression.expression);
  };

  const learn = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && (typedFloor(node.type) || (node.initializer && floorish(node.initializer)))) {
      bind(node.name, scopeOf(node));
    }
    const field = ts.isPropertyDeclaration(node) || ts.isParameterPropertyDeclaration(node, node.parent);
    const floorField = field && (typedFloor(node.type) || (node.initializer !== undefined && floorish(node.initializer)));
    if ((floorField || (ts.isPropertySignature(node) && typedFloor(node.type))) && (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))) {
      members.add(node.name.text);
    }
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer) && floorish(node.expression)) {
      for (const d of node.initializer.declarations) bind(d.name, scopeOf(d));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && floorish(node.right)) {
      bind(node.left, scopeOf(node));
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && floorish(node.expression.expression)) {
      const at = ELEMENT_PARAM.get(node.expression.name.text);
      const fn = node.arguments[0];
      const param = at !== undefined && fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ? fn.parameters[at] : undefined;
      if (param) bind(param.name, param.parent);
    }
    ts.forEachChild(node, learn);
  };
  // A binding can rest on one learned later in the file, so learn until nothing new turns up.
  const known = () => members.size + [...bound.values()].reduce((n, names) => n + names.size, 0);
  let before: number;
  do {
    before = known();
    learn(source);
  } while (known() > before);

  const writesField = (t: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(t) || ts.isNonNullExpression(t)) return writesField(t.expression);
    if (ts.isPropertyAccessExpression(t)) return fields.has(t.name.text) && floorish(t.expression);
    return ts.isElementAccessExpression(t) && floorish(t.expression);
  };
  /** The places an assignment's left side writes: itself, or each one a destructuring pattern names. */
  const targets = (left: ts.Expression): ts.Expression[] => {
    if (ts.isArrayLiteralExpression(left)) return left.elements.flatMap((e) => targets(ts.isSpreadElement(e) ? e.expression : e));
    if (ts.isObjectLiteralExpression(left)) {
      return left.properties.flatMap((p) => (ts.isPropertyAssignment(p) ? targets(p.initializer) : ts.isSpreadAssignment(p) ? targets(p.expression) : []));
    }
    if (ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.EqualsToken) return targets(left.left);
    return [left];
  };
  const callWrites = (call: ts.CallExpression): boolean => {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return false;
    const target = call.arguments[0];
    if (FIELD_WRITERS.has(callee.getText(source))) return target !== undefined && floorish(target);
    return MUTATORS.has(callee.name.text) && floorish(callee.expression);
  };

  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    const steps =
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
      writesField(node.operand);
    const writes =
      (isAssignment(node) && targets(node.left).some(writesField)) ||
      steps ||
      (ts.isDeleteExpression(node) && writesField(node.expression)) ||
      (ts.isCallExpression(node) && callWrites(node));
    if (writes) out.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${node.getText(source).split('\n')[0]}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

describe("the dev floor's package boundary", () => {
  it('INV-floor-boundary: no file under floor/ imports from apps/, the AI or the protocol', () => {
    const imports = walk(FLOOR).flatMap((file) => specifiers(parse(file)).map((spec) => ({ file, spec })));
    // A scan that read no imports would pass anything.
    expect(imports.length).toBeGreaterThan(5);
    const crossing = imports.filter((i) => offLimits(i.file, i.spec)).map((i) => `${i.file} imports ${i.spec}`);
    expect(crossing, 'the floor imports only the engine').toEqual([]);

    const planted = (line: string) => specifiers(parse(PLANTED, line)).filter((spec) => offLimits(PLANTED, spec));
    expect(FORBIDDEN_IMPORTS.filter((line) => planted(line).length === 0), 'imports the guard cannot see').toEqual([]);
    expect(ALLOWED_IMPORTS.flatMap(planted)).toEqual([]);
  });

  it('INV-floor-boundary: nothing outside floor/ assigns a DevFloor or FloorColonist field', () => {
    const declared = walk(FLOOR).flatMap((f) => parse(f).statements.filter(ts.isInterfaceDeclaration).filter((d) => FLOOR_TYPES.includes(d.name.text)));
    expect(declared.map((d) => d.name.text).sort()).toEqual(FLOOR_TYPES);
    const fields = new Set(declared.flatMap((d) => d.members.flatMap((m) => (m.name && ts.isIdentifier(m.name) ? [m.name.text] : []))));

    const files = SCANNED.flatMap((dir) => walk(dir, (name, path) => path === FLOOR || TEST_DIRS.has(name) || TEST_FILE.test(name)));
    // A walk that missed a root would pass anything written there.
    for (const dir of SCANNED) expect(files.some((f) => f.startsWith(`${dir}/`)), dir).toBe(true);
    expect(files.length).toBeGreaterThan(150);
    const writes = files.flatMap((f) => floorWrites(f, read(f), fields));
    expect(writes, 'only floor/ writes the floor: step it with stepFloor').toEqual([]);

    expect(CAUGHT.filter((code) => floorWrites(PLANTED, code, fields).length === 0), 'writes the guard cannot see').toEqual([]);
    expect(CLEAN.flatMap((code) => floorWrites(PLANTED, code, fields)), 'flagged, but not floor writes').toEqual([]);
  });
});
