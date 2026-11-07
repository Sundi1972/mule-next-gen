import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

export default defineConfig({
  // sourceStamp must run before React's JSX transform; without both plugins nothing is selectable.
  plugins: [sourceStamp(), react(), selectSink(), tailwindcss()],
  // WS8's port (program.yaml); run with --strictPort so a clash fails instead of moving.
  server: { port: 5318 },
});
