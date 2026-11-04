import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

export default defineConfig({
  // sourceStamp must run before React's JSX transform; without both plugins nothing is selectable.
  plugins: [sourceStamp(), react(), selectSink(), tailwindcss()],
  // Serves files from apps/web/src too: the mock composes the app's own game-over and colony components.
  server: { fs: { allow: ["../../.."] } },
});
