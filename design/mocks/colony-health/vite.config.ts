import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

/**
 * The one addition to the precedent's config (ws8-monthly-score's, otherwise copied): the real phone `Results`
 * (apps/web/src/phone/Results.tsx) imports `ColonyPanel` from ../components/MonthEnd. For that one importer only, the
 * import resolves to src/borrowed/month-end.ts, which re-exports the real MonthEnd module with this mock's ColonyPanel
 * (the COPY with the Health block) in its place. So the phone pages mount the real Results, shell and footer unchanged,
 * and only the panel is the mock's. Every other importer of MonthEnd (Colony.tsx, TableApp.tsx) gets the real one.
 */
function colonyPanelSeam(): Plugin {
  const real = resolve(__dirname, "../../../apps/web/src/components/MonthEnd");
  const results = resolve(__dirname, "../../../apps/web/src/phone/Results.tsx");
  const copy = resolve(__dirname, "src/borrowed/month-end.ts");
  return {
    name: "colony-panel-seam",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      if (importer.split("?")[0] !== results) return null;
      return resolve(dirname(importer), source).replace(/\.tsx?$/, "") === real ? copy : null;
    },
  };
}

/** sourceStamp stamps a named <Fragment> too, which React warns about; a Fragment takes no props, so unstamp it. */
function unstampFragments(): Plugin {
  return {
    name: "unstamp-fragments",
    enforce: "pre",
    apply: "serve",
    transform(code, id) {
      if (!/\.[jt]sx$/.test(id.split("?")[0]) || !code.includes("<Fragment data-source")) return null;
      return { code: code.replace(/<Fragment data-source="[^"]*"/g, "<Fragment"), map: null };
    },
  };
}

export default defineConfig({
  // sourceStamp must run before React's JSX transform; without both plugins nothing is selectable.
  plugins: [colonyPanelSeam(), sourceStamp(), unstampFragments(), react(), selectSink(), tailwindcss()],
  // Serves files from apps/web/src too: the mock composes the app's own month-end and header components.
  server: { fs: { allow: ["../../.."] } },
});
