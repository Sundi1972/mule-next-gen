import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

export default defineConfig({
  // sourceStamp must run before React's JSX transform; without both plugins nothing is selectable.
  plugins: [sourceStamp(), react(), selectSink(), tailwindcss()],
  // The pages of their own build too, so the stable copy (vite preview) serves them as the dev server does.
  build: { rollupOptions: { input: { index: "index.html", grant: "grant.html", mute: "mute.html" } } },
});
