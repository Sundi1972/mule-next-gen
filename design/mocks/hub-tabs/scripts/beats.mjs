// Every beat's query string, read from src/steps.ts (ids only). node scripts/beats.mjs [suffix]
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/steps.ts', import.meta.url), 'utf8');
console.log([...src.matchAll(/\{ id: '(\d-[^']+)', step:/g)].map((m) => `?beat=${m[1]}${process.argv[2] ?? ''}`).join('\n'));
