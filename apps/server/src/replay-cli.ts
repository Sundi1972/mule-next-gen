/**
 * `pnpm --filter @mule/server replay <file>`: replays a game record without calling Claude. Prints each seat's recorded
 * and replayed score, then "identical" (exit 0), where it diverged (exit 1), or why it can't be replayed (exit 2).
 */
import fs from 'node:fs';
import path from 'node:path';
import { API_KEY_ENV } from './brain/index.js';
import type { MuleRecord } from './record.js';
import { RecordMismatch, replay, ReplayDiverged } from './replay.js';

// The replay never builds a brain; without the key, nothing it runs could make a paid call either.
delete process.env[API_KEY_ENV];

async function main(arg: string | undefined): Promise<number> {
  if (!arg) {
    console.error('usage: pnpm --filter @mule/server replay <record.json>');
    return 2;
  }
  // pnpm runs the script in apps/server; a relative path means the caller's folder.
  const file = path.resolve(process.env.INIT_CWD ?? process.cwd(), arg);
  let record: MuleRecord;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8')) as MuleRecord;
  } catch (err) {
    console.error(`cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  try {
    const result = await replay(record);
    for (const s of result.scores) console.log(`${s.seat.padEnd(4)} recorded ${s.recorded ?? '-'}  replayed ${s.replayed ?? '-'}`);
    console.log(`state hash recorded ${result.stateHash.recorded ?? '-'}  replayed ${result.stateHash.replayed ?? '-'}`);
    console.log(result.identical ? 'identical' : 'differs');
    return result.identical ? 0 : 1;
  } catch (err) {
    if (err instanceof ReplayDiverged) {
      console.log(`diverged at step ${err.seq}: ${err.reason}`);
      return 1;
    }
    if (err instanceof RecordMismatch) {
      console.log(`mismatch: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

process.exitCode = await main(process.argv[2]);
