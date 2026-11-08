// Every beat's query string, read from src/steps.ts and src/sheriff-path.ts (ids only). node scripts/beats.mjs [suffix]
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const planning = [...read('steps.ts').matchAll(/\{ id: '(\d-[^']+)', step:/g)].map((m) => `?beat=${m[1]}`);
const sheriff = [...read('sheriff-path.ts').matchAll(/id: '(s\d-[^']+)', step:/g)].map((m) => `?path=sheriff&beat=${m[1]}`);
console.log([...planning, ...sheriff].map((q) => `${q}${process.argv[2] ?? ''}`).join('\n'));
