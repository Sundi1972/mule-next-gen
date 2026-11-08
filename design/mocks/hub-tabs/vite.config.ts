import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

/**
 * MOCK PLUMBING, not a design. The real desks and tools (apps/web/src/phone/hub/*) ask `useHub()` from the real
 * Hub.tsx for the open desk and tool. This mock re-hosts them in tabs, so for every importer INSIDE apps/web/src that
 * module resolves to the mock's src/proposed/Hub.tsx, whose useHub() answers the same HubNav from the tabbed hub
 * (and falls back to the real one inside today's hub, which the index draws for comparison). The mock's own files
 * still import the real Hub.tsx: `Hub` for today's frame. The build has no such swap: it edits Hub.tsx itself.
 */
function swapHub(): Plugin {
  const proposed = fileURLToPath(new URL("./src/proposed/Hub.tsx", import.meta.url));
  return {
    name: "mock-swap-hub",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !/\/Hub(\.tsx)?$/.test(source)) return null;
      if (!importer.includes("/apps/web/src/")) return null;
      const real = await this.resolve(source, importer, { ...options, skipSelf: true });
      return real && real.id.endsWith("/apps/web/src/phone/hub/Hub.tsx") ? proposed : null;
    },
  };
}

export default defineConfig({
  // sourceStamp must run before React's JSX transform; without both plugins nothing is selectable.
  plugins: [swapHub(), sourceStamp(), react(), selectSink(), tailwindcss()],
  // The app's own public folder, so WS10's colony art (/art/colony/manifest.json and its plates) loads as in the game.
  publicDir: "../../../apps/web/public",
});
