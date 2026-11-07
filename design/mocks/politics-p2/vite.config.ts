import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { selectSink, sourceStamp } from "./review-loop/vite-plugins";

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
  plugins: [sourceStamp(), unstampFragments(), react(), selectSink(), tailwindcss()],
  // Serves files from apps/web/src and packages/ui/src too: the mock composes the app's own hub, map and event show.
  server: { fs: { allow: ["../../.."] } },
});
