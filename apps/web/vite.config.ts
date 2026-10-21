import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** The game server, which `pnpm --filter @mule/server dev` starts on port 8787. */
const GAME_SERVER = process.env.MULE_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/rooms': GAME_SERVER,
      '/ws': { target: GAME_SERVER.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
