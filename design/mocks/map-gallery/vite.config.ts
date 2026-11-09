import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `base: './'` keeps the build working from any folder, so it can be published as a static page.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
