// Every state's query string, read from src/scenarios.ts (ids only). node scripts/states.mjs [suffix]
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/scenarios.ts', import.meta.url), 'utf8');
const out = [];
for (const block of src.split(/\n  \{\n    id: '/).slice(1)) {
  const screen = block.slice(0, block.indexOf("'"));
  for (const m of block.matchAll(/\{ id: '([^']+)', label:/g)) out.push(`?screen=${screen}&state=${m[1]}${process.argv[2] ?? ''}`);
  // The Overview height check's states are generated: NEEDS_TABLES × NEEDS_FIGURES.
  if (screen === 'needs') {
    const tables = [...src.slice(src.indexOf('const NEEDS_TABLES')).split('} satisfies')[0].matchAll(/^  ([a-z]+): \{/gm)].map((m) => m[1]);
    const figures = [...src.slice(src.indexOf('const NEEDS_FIGURES')).split('];')[0].matchAll(/\['([a-z]+-\d)', '/g)].map((m) => m[1]);
    for (const t of tables) for (const f of figures) out.push(`?screen=needs&state=${t}-${f}${process.argv[2] ?? ''}`);
  }
}
console.log(out.join('\n'));
