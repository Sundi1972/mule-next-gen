// Every state's query string, read from src/scenarios.ts (ids only). node scripts/states.mjs [suffix]
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/scenarios.ts', import.meta.url), 'utf8');
const out = [];
for (const block of src.split(/\n  \{\n    id: '/).slice(1)) {
  const screen = block.slice(0, block.indexOf("'"));
  for (const m of block.matchAll(/\{ id: '([^']+)', label:/g)) out.push(`?screen=${screen}&state=${m[1]}${process.argv[2] ?? ''}`);
}
console.log(out.join('\n'));
