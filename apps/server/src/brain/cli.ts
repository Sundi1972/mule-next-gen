/** What the paid brain commands share: their flags, the day's ledger and its claim, the report helpers and the script runner. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DecisionKind } from '@mule/ai';

/** Seams for tests: where the ledger goes, the clock and where lines go. Defaults are the real ones. */
export interface MainDeps {
  dataDir?: string;
  out?: (line: string) => void;
  now?: () => Date;
}

/** apps/server/data: where each command's day ledger goes. */
export const DATA_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data');

/** The seams with their real defaults filled in. */
export function resolveDeps(deps: MainDeps): Required<MainDeps> {
  return {
    dataDir: deps.dataDir ?? DATA_DIR,
    out: deps.out ?? ((line: string) => console.log(line)),
    now: deps.now ?? (() => new Date()),
  };
}

export type StopReason = 'done' | 'cap' | 'auth';

/** The decision kinds, in the order reports list them. */
export const KINDS: readonly DecisionKind[] = ['land', 'develop', 'trade'];

/** Printed last when a run stopped on a 401 or 403. */
export const AUTH_STOPPED = 'Stopped: the API refused the credentials (401/403). Nothing more was called.';

/** The UTC day of a date, YYYY-MM-DD. */
export const day = (d: Date): string => d.toISOString().slice(0, 10);

/** The command's ledger for the day of `now`, e.g. data/trial-2026-10-22.jsonl. */
export const dayLedgerPath = (dir: string, command: string, now: Date): string => path.join(dir, `${command}-${day(now)}.jsonl`);

/** The refusal to print when today's ledger already exists, or null when the day's run is still free. */
export function alreadyRanToday(file: string, command: string): string | null {
  return fs.existsSync(file) ? `${file} exists: ${command} already ran today, and each run needs its own clearance; nothing called.` : null;
}

/** Nearest-rank quantile of a non-empty ascending list. */
export const nearest = <T>(sorted: readonly T[], q: number): T => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;

const NUMBER = /^\d+(\.\d+)?$/;

/**
 * The numeric flags given, by name, or null for anything else: an unknown, repeated or `--name=value` flag, a missing
 * or non-numeric value, a stray word.
 */
export function numberFlags(argv: readonly string[], names: readonly string[]): Map<string, number> | null {
  // pnpm hands its `--` separator through to the script.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const given = new Map<string, number>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    const value = args[i + 1];
    if (!names.includes(name) || given.has(name) || value === undefined || !NUMBER.test(value)) return null;
    given.set(name, Number(value));
  }
  return given;
}

/** Rows as columns two spaces apart; the last column is not padded. */
export function table(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]!))).join('  '));
}

/** Creates the day's ledger file, or throws EEXIST: the day's clearance is used once, by the run that claims it. */
export function claimLedger(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.closeSync(fs.openSync(file, 'wx'));
}

/** Whether `moduleUrl` is the script Node was started with; never throws, so importing a command is always safe. */
function isMainModule(moduleUrl: string): boolean {
  const invokedAs = process.argv[1];
  if (invokedAs === undefined) return false;
  try {
    // realpath: Node resolves the main module through links.
    return moduleUrl === pathToFileURL(fs.realpathSync(invokedAs)).href;
  } catch {
    return false;
  }
}

/** Runs a command's main with the process's arguments and exits with its code, when its module is the script started. */
export function runAsScript(
  moduleUrl: string,
  name: string,
  main: (argv: readonly string[], env: Readonly<Record<string, string | undefined>>) => Promise<number>,
): void {
  if (!isMainModule(moduleUrl)) return;
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    () => {
      console.error(`${name} failed before finishing.`);
      process.exit(1);
    },
  );
}
