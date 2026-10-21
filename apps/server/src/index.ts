import { fileURLToPath } from 'node:url';
import { createMuleServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const { server } = createMuleServer({ staticDir });
server.listen(port, () => console.log(`M.U.L.E. Next Gen server on http://localhost:${port}`));
