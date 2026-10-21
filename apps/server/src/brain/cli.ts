/** What the paid brain commands share: their flags, the day's ledger claim, the report table and the script runner. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Seams for tests: where the ledger goes, the clock and where lines go. Defaults are the real ones. */
export interface MainDeps {
  dataDir?: string;
  out?: (line: string) => void;
  now?: () => Date;
}

export type StopReason = 'done' | 'cap' | 'auth';

/** apps/server/data: where each command's day ledger goes. */
export const DATA_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data');

/** The UTC day of a date, YYYY-MM-DD. */
export const day = (d: Date): string => d.toISOString().slice(0, 10);

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
