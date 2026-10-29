import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMuleServer } from './server.js';

/** MULE_RECORD_DIR when set, otherwise apps/server/data/records. */
function defaultRecordDir(): string {
  const fromEnv = process.env.MULE_RECORD_DIR;
  if (fromEnv) return fromEnv;
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return path.join(serverRoot, 'data', 'records');
}

const port = Number(process.env.PORT ?? 8787);
const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const { server } = createMuleServer({ staticDir, recordDir: defaultRecordDir() });
server.listen(port, () => console.log(`M.U.L.E. Next Gen server on http://localhost:${port}`));
