import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

/**
 * One of two additions to the precedent's config (ws8-colony's, otherwise copied exactly): the app's hub/ready.ts is
 * served from src/borrowed/ready.ts, a COPY with the council's two SEAM lines, so the real Hub behaves as C40 needs.
 */
function readySeam(): Plugin {
  const real = resolve(__dirname, "../../../apps/web/src/phone/hub/ready");
  const copy = resolve(__dirname, "src/borrowed/ready.ts");
  return {
    name: "ready-seam",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      return resolve(dirname(importer), source).replace(/\.ts$/, "") === real ? copy : null;
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
  plugins: [readySeam(), sourceStamp(), unstampFragments(), react(), selectSink(), tailwindcss()],
  // Serves files from apps/web/src too: the mock composes the app's own game-over and colony components.
  server: { fs: { allow: ["../../.."] } },
});
