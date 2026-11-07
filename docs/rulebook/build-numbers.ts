// Builds numbers.html, the rulebook's "Every number" page, from packages/engine/src/config.ts.
// Values come from the real config objects; the notes come from config.ts's own comments (read with the
// TypeScript compiler API), falling back to the doc comment on the setting's declared type.
// Run from the repo root:
//   pnpm --filter @mule/engine exec tsx ../../docs/rulebook/build-numbers.ts && node docs/rulebook/build-index.mjs
// Deterministic: the same config.ts always gives the same page. No dependencies beyond the engine's own.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as TS from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const engineDir = join(repo, 'packages', 'engine');
const configPath = join(engineDir, 'src', 'config.ts');
const outPath = join(here, 'numbers.html');
// The repo root has no dependencies of its own: load the engine's TypeScript.
const ts: typeof TS = createRequire(join(engineDir, 'package.json'))('typescript');

/** Most characters of text a section may hold: build-index.mjs indexes only the first 4,000 of each heading's text. */
const SECTION_BUDGET = 3_900;
/** A nested object of a block with more rows than this gets its own <h3> and table. */
const PROMOTE_ROWS = 6;

type Note =
  | { kind: 'own'; text: string }
  | { kind: 'named'; path: string }
  | { kind: 'parent'; path: string }
  | { kind: 'near'; path: string }
  | { kind: 'none' };

interface Item {
  key: string;
  path: string;
  value: unknown;
  init: TS.Expression | undefined;
  own: string;
  /** The note came from the declared type's doc comment, not from a comment beside this setting. */
  typed: boolean;
  leaf: boolean;
  children: Item[];
  note: Note;
}

interface Section {
  level: 2 | 3;
  id: string;
  title: string;
  lede: string;
  rows: string[];
}

// ---------- text helpers ----------

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Escaped note text; `code` spans in the comment become <code>. */
const noteHtml = (s: string): string => escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');

const code = (path: string): string => `<code>${escapeHtml(path)}</code>`;

const kebab = (path: string): string =>
  path
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[._]+/g, '-')
    .toLowerCase();

/** The same text measure build-index.mjs uses. */
const decode = (s: string): string =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const textLength = (html: string): number => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().length;

// ---------- reading config.ts ----------

function loadSource(): { checker: TS.TypeChecker; sf: TS.SourceFile } {
  const host: TS.ParseConfigFileHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
  const parsed = ts.getParsedCommandLineOfConfigFile(join(engineDir, 'tsconfig.json'), {}, host);
  if (!parsed) throw new Error('cannot read packages/engine/tsconfig.json');
  const program = ts.createProgram([configPath], { ...parsed.options, noEmit: true });
  const sf = program.getSourceFile(configPath);
  if (!sf) throw new Error('cannot parse ' + configPath);
  return { checker: program.getTypeChecker(), sf };
}

function cleanComment(raw: string): string {
  if (raw.startsWith('//')) return raw.slice(2).trim();
  return raw
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The comment written directly above a node: its last block comment, or its last run of // lines. */
function leadingComment(sf: TS.SourceFile, node: TS.Node): string {
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  if (!ranges.length) return '';
  let i = ranges.length - 1;
  const last = ranges[i]!;
  if (last.kind === ts.SyntaxKind.MultiLineCommentTrivia) return cleanComment(text.slice(last.pos, last.end));
  const run = [last];
  const line = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line;
  while (i > 0 && ranges[i - 1]!.kind === ts.SyntaxKind.SingleLineCommentTrivia && line(ranges[i - 1]!.pos) + 1 === line(run[0]!.pos)) {
    run.unshift(ranges[--i]!);
  }
  return run.map((r) => cleanComment(text.slice(r.pos, r.end))).join(' ');
}

function unwrap(e: TS.Expression | undefined): TS.Expression | undefined {
  while (e && (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) || ts.isTypeAssertionExpression(e) || ts.isNonNullExpression(e))) {
    e = e.expression;
  }
  return e;
}

function propName(p: TS.ObjectLiteralElementLike): string | undefined {
  if (!p.name) return undefined;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) return p.name.text;
  return undefined;
}

/** The doc comment on the declared type's property, e.g. GoodConfig.spoilage for GOOD_CONFIG.food.spoilage. */
function typeDoc(checker: TS.TypeChecker, prop: TS.PropertyAssignment, name: string): string {
  const type = checker.getContextualType(prop.parent);
  if (!type) return '';
  const sym = checker.getPropertyOfType(checker.getNonNullableType(type), name);
  if (!sym || sym.declarations?.includes(prop)) return '';
  return ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, ' ').trim();
}

const isPrimitive = (v: unknown): boolean => v === null || (typeof v !== 'object' && typeof v !== 'function');
const isLeafValue = (v: unknown): boolean =>
  isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)) || (!Array.isArray(v) && Object.keys(v as object).length === 0);

function buildItem(checker: TS.TypeChecker, sf: TS.SourceFile, key: string, path: string, value: unknown, init: TS.Expression | undefined, own: string, typed = false): Item {
  const item: Item = { key, path, value, init, own, typed, leaf: isLeafValue(value), children: [], note: { kind: 'none' } };
  if (item.leaf) return item;
  const lit = unwrap(init);
  if (Array.isArray(value)) {
    const elements = lit && ts.isArrayLiteralExpression(lit) ? lit.elements : undefined;
    value.forEach((v, i) => {
      const el = elements?.[i];
      item.children.push(buildItem(checker, sf, String(i), `${path}[${i}]`, v, el, el ? leadingComment(sf, el) : ''));
    });
    return item;
  }
  const props = new Map<string, TS.ObjectLiteralElementLike>();
  if (lit && ts.isObjectLiteralExpression(lit)) for (const p of lit.properties) { const n = propName(p); if (n !== undefined) props.set(n, p); }
  for (const k of Object.keys(value as object)) {
    const p = props.get(k);
    const text = p ? leadingComment(sf, p) : '';
    const doc = !text && p && ts.isPropertyAssignment(p) ? typeDoc(checker, p, k) : '';
    const childInit = p && ts.isPropertyAssignment(p) ? p.initializer : undefined;
    item.children.push(buildItem(checker, sf, k, `${path}.${k}`, (value as Record<string, unknown>)[k], childInit, text || doc, !text && !!doc));
  }
  return item;
}

const mentions = (text: string, key: string): boolean =>
  !/^\d+$/.test(key) && new RegExp(`(^|[^A-Za-z0-9_])${key.replace(/[$]/g, '\\$')}([^A-Za-z0-9_]|$)`).test(text);

/**
 * Gives every item without a note of its own a pointer to the nearest note that may explain it. config.ts often writes
 * one comment over a run of settings, so in order: an earlier sibling's comment that names the setting, the nearest
 * nested object's note, the nearest earlier sibling's comment, then the block's own note.
 */
function resolveNotes(siblings: Item[], ancestors: Item[]): void {
  siblings.forEach((item, i) => {
    if (item.own) item.note = { kind: 'own', text: item.own };
    else {
      const near = siblings.slice(0, i).reverse().find((s) => s.own && !s.typed);
      const nested = ancestors.slice(1).reverse().find((a) => a.own);
      const block = ancestors[0]?.own ? ancestors[0] : undefined;
      if (near && mentions(near.own, item.key)) item.note = { kind: 'named', path: near.path };
      else if (nested) item.note = { kind: 'parent', path: nested.path };
      else if (near) item.note = { kind: 'near', path: near.path };
      else if (block) item.note = { kind: 'parent', path: block.path };
    }
    resolveNotes(item.children, [...ancestors, item]);
  });
}

// ---------- rendering ----------

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const s = String(n);
  if (s.includes('e') || (s.split('.')[1] ?? '').length > 6) return '≈ ' + n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function formatPrimitive(v: unknown, quote: boolean): string {
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return quote ? JSON.stringify(v) : v;
  return String(v);
}

function isLiteral(e: TS.Expression | undefined): boolean {
  e = unwrap(e);
  if (!e) return true;
  if (ts.isNumericLiteral(e) || ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return true;
  if (ts.isArrayLiteralExpression(e)) return e.elements.every((x) => isLiteral(x));
  if (ts.isObjectLiteralExpression(e)) return true;
  return false;
}

function valueText(item: Item): string {
  const v = item.value;
  let shown: string;
  if (Array.isArray(v)) shown = '[' + v.map((x) => formatPrimitive(x, true)).join(', ') + ']';
  else if (v !== null && typeof v === 'object') shown = '{}';
  else shown = formatPrimitive(v, true);
  const lit = unwrap(item.init);
  if (!isLiteral(item.init) && lit) {
    const expr = lit.getText().replace(/\s+/g, ' ');
    return shown.startsWith('≈') ? `${expr} ${shown}` : `${expr} = ${shown}`;
  }
  return shown;
}

function noteCell(note: Note): string {
  switch (note.kind) {
    case 'own': return noteHtml(note.text);
    case 'named': return `Explained in the note on ${code(note.path)}.`;
    case 'parent': return `See the note on ${code(note.path)}.`;
    case 'near': return `No note of its own; the note on ${code(note.path)}, just before it in the file, may cover it.`;
    case 'none': return 'No note in the settings file.';
  }
}

const row = (path: string, value: string, note: string): string =>
  `<tr><td>${code(path)}</td><td class="n">${value}</td><td>${note}</td></tr>`;

/** Group rows (unique by path), where a section prefers to split. */
const groupRows = new Set<string>();

/** Rows for an item: a group row when a nested object has a note of its own, then a row per leaf. */
function rowsOf(item: Item, out: string[]): number {
  if (item.leaf) { out.push(row(item.path, escapeHtml(valueText(item)), noteCell(item.note))); return 1; }
  if (item.own) { const r = row(item.path, '', noteHtml(item.own)); groupRows.add(r); out.push(r); }
  return item.children.reduce((n, c) => n + rowsOf(c, out), 0);
}

const countRows = (item: Item): number => (item.leaf ? 1 : (item.own ? 1 : 0) + item.children.reduce((n, c) => n + countRows(c), 0));

const TABLE_HEAD = '<div class="table-wrap"><table>\n<thead><tr><th>Setting</th><th class="n">Value</th><th>What it does</th></tr></thead>\n<tbody>';
const TABLE_FOOT = '</tbody>\n</table></div>';
const PILL = ' <span class="pill built">In the game</span>';

/**
 * Splits a section so each heading's text fits the search index; the extra parts get "continued" headings. A split
 * falls before the part's last group row where there is one, so a group's rows stay together.
 */
function renderSection(s: Section, ids: Set<string>): string {
  const parts: string[][] = [[]];
  const len = (r: string) => textLength(r) + 1;
  let used = textLength(s.lede) + textLength(TABLE_HEAD);
  for (const r of s.rows) {
    const current = parts[parts.length - 1]!;
    if (used + len(r) > SECTION_BUDGET && current.length) {
      let at = current.length;
      for (let j = current.length - 1; j > 0; j--) if (groupRows.has(current[j]!)) { at = j; break; }
      const moved = current.splice(at);
      parts.push(moved);
      used = textLength(TABLE_HEAD) + moved.reduce((n, m) => n + len(m), 0);
    }
    parts[parts.length - 1]!.push(r);
    used += len(r);
  }
  return parts
    .map((rows, i) => {
      const id = i === 0 ? s.id : `${s.id}-part-${i + 1}`;
      if (ids.has(id)) throw new Error('duplicate id ' + id);
      ids.add(id);
      const level = i === 0 ? s.level : 3;
      const title = i === 0 ? s.title : `${s.title}, continued`;
      const head = `<h${level} id="${id}">${title}${level === 2 ? PILL : ''}</h${level}>`;
      const lede = i === 0 && s.lede ? '\n' + s.lede : '';
      return `${head}${lede}\n${TABLE_HEAD}\n${rows.join('\n')}\n${TABLE_FOOT}`;
    })
    .join('\n\n');
}

async function main(): Promise<void> {
  const source = readFileSync(configPath, 'utf8');
  const config = (await import(pathToFileURL(configPath).href)) as Record<string, unknown>;
  const { checker, sf } = loadSource();

  const blocks: Item[] = [];
  const skipped: string[] = [];
  const unexported: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
    const exported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const own = leadingComment(sf, st);
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name)) continue;
      const name = d.name.text;
      if (!exported) { unexported.push(name); continue; }
      const value = config[name];
      if (typeof value !== 'number' && (value === null || typeof value !== 'object')) { skipped.push(`${name} (${typeof value})`); continue; }
      blocks.push(buildItem(checker, sf, name, name, value, d.initializer, own));
    }
  }
  // Exports are siblings too: GROWN_MIN has no note of its own, and GROWN_BASE's names it.
  resolveNotes(blocks, []);

  const ids = new Set<string>();
  const sections: string[] = [];
  let settings = 0;
  for (const b of blocks) {
    const lede = b.own ? `<p>${noteHtml(b.own)}</p>` : '';
    const title = code(b.path);
    if (b.leaf) {
      settings += 1;
      const note = b.own ? 'See the note above.' : noteCell(b.note);
      sections.push(renderSection({ level: 2, id: kebab(b.path), title, lede, rows: [row(b.path, escapeHtml(valueText(b)), note)] }, ids));
      continue;
    }
    const main: string[] = [];
    const promoted: Section[] = [];
    for (const c of b.children) {
      if (!c.leaf && countRows(c) > PROMOTE_ROWS) {
        const rows: string[] = [];
        settings += c.children.reduce((n, g) => n + rowsOf(g, rows), 0);
        promoted.push({ level: 3, id: kebab(c.path), title: code(c.path), lede: c.own ? `<p>${noteHtml(c.own)}</p>` : '', rows });
      } else settings += rowsOf(c, main);
    }
    const parts: string[] = [];
    if (main.length) parts.push(renderSection({ level: 2, id: kebab(b.path), title, lede, rows: main }, ids));
    else {
      const id = kebab(b.path);
      if (ids.has(id)) throw new Error('duplicate id ' + id);
      ids.add(id);
      parts.push(`<h2 id="${id}">${title}${PILL}</h2>${lede ? '\n' + lede : ''}`);
    }
    for (const p of promoted) parts.push(renderSection(p, ids));
    sections.push(parts.join('\n\n'));
  }

  const fingerprint = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const missing = unexported.length
    ? `<div class="box next"><h4>Not on this page</h4><p>${unexported.map(code).join(', ')} ${unexported.length === 1 ? 'is' : 'are'} kept inside <code>config.ts</code> without being exported, so this page cannot read ${unexported.length === 1 ? 'it' : 'them'}.</p></div>\n`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Every number · M.U.L.E. Rulebook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="rulebook.css">
</head>
<body>
<div class="rb-shell">
<aside class="rb-rail"></aside>
<main class="rb-main">
<article>
<h1>Every number</h1>
<p class="rb-lede">Every balancing value in the game, as the game's settings file holds it today: ${settings} settings in ${blocks.length} groups, each with what it does.</p>
<p>This page is generated from the game's settings file, <code>packages/engine/src/config.ts</code>, on trunk. Each group below is one block of that file, named the way the code names it; the setting is its full path, and the note is the comment written beside it in the file. A setting without a note of its own points to the nearest note that explains it. The rules these numbers drive are explained in <a href="index.html">the other chapters</a>.</p>
<p>Do not edit this page by hand. To regenerate it after <code>config.ts</code> changes, run from the repo root:</p>
<p><code>pnpm --filter @mule/engine exec tsx ../../docs/rulebook/build-numbers.ts</code> then <code>node docs/rulebook/build-index.mjs</code></p>
${missing}<p class="code-ref">Built from <code>config.ts</code> with fingerprint <code>${fingerprint}</code> (the first 12 characters of its SHA-256).</p>

${sections.join('\n\n')}

<p class="code-ref">In the code: <code>packages/engine/src/config.ts</code> · this page's builder: <code>docs/rulebook/build-numbers.ts</code></p>
<p class="owner">Kept current by: generated from config.ts; whoever changes a number reruns the builder in the same PR.</p>
</article>
</main>
</div>
<script src="search-index.js"></script>
<script src="rulebook.js"></script>
</body>
</html>
`;
  writeFileSync(outPath, html);
  console.log(`numbers.html: ${settings} settings in ${blocks.length} blocks, ${ids.size} section ids`);
  if (skipped.length) console.warn('skipped exports that are not a number, object or array:', skipped.join(', '));
  if (unexported.length) console.warn('not exported, so not on the page:', unexported.join(', '));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
