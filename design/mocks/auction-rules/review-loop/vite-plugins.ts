/**
 * The review loop's two Vite plugins. Dev server only (`apply: "serve"`).
 *
 *   plugins: [sourceStamp(), react(), selectSink()]
 *
 * The reviewer clicks an element; the session reads current-selection.json and gets
 * its `file:line`.
 */
import { writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

/**
 * Stamp `data-source="<relpath>:<line>"` onto every JSX opening tag under `roots`
 * (all of /src/, so factored-out components stay selectable). Must run before React.
 *
 * Line-based, not an AST pass: a non-tag `<` the lookbehind misses will be stamped.
 * If that happens, replace this with a Babel plugin over JSXOpeningElement rather
 * than adding regex.
 *
 * The stamp reaches the DOM only through elements that pass unknown props on. A
 * component that destructures only its own props swallows it, and its instances
 * resolve to the nearest stamped ancestor; wrap it if it must be selectable.
 */
export function sourceStamp(roots: string[] = ["/src/"], exclude: string[] = ["/review-loop/"]): Plugin {
  return {
    name: "source-stamp",
    enforce: "pre",
    apply: "serve",
    transform(code, id) {
      if (id.includes("node_modules")) return null;
      if (exclude.some((x) => id.includes(x))) return null;
      if (!roots.some((r) => id.includes(r)) || !/\.[jt]sx$/.test(id)) return null;
      const rel = relative(process.cwd(), id.split("?")[0]);
      const out = code.split("\n").map((line, i) => {
        if (line.includes("data-source")) return line;
        return line.replace(
          // A generic's `<` follows an identifier (`useState<Filter>`); a JSX tag's never does.
          /(?<![A-Za-z0-9_$])<([a-zA-Z][a-zA-Z0-9.]*)(?=[\s/>])/g,
          (_m, tag) => `<${tag} data-source="${rel}:${i + 1}"`,
        );
      });
      return { code: out.join("\n"), map: null };
    },
  };
}

/**
 * Serve POST/DELETE /__select and POST /__note. current-selection.json holds only
 * the current selection (overwritten, so "this" has one answer); notes append to
 * review-notes.jsonl.
 */
export function selectSink(outDir = process.cwd()): Plugin {
  return {
    name: "select-sink",
    apply: "serve",
    // Unwatched, or each selection write full-reloads the page and wipes the selection.
    // Keep the files in the root: the session reads them there.
    config() {
      return {
        server: {
          watch: {
            ignored: ["**/current-selection.json", "**/review-notes.jsonl"],
          },
        },
      };
    },
    configureServer(server) {
      const read = (req: any) =>
        new Promise<string>((res) => {
          let b = "";
          req.on("data", (c: any) => (b += c));
          req.on("end", () => res(b));
        });

      server.middlewares.use("/__select", async (req, res) => {
        // DELETE = the reviewer stopped pointing; a stale file would answer "this" wrongly.
        if (req.method === "DELETE") {
          rmSync(join(outDir, "current-selection.json"), { force: true });
          res.statusCode = 204; return res.end();
        }
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        writeFileSync(join(outDir, "current-selection.json"), await read(req));
        res.statusCode = 204; res.end();
      });

      server.middlewares.use("/__note", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        const body = await read(req);
        writeFileSync(join(outDir, "review-notes.jsonl"), body.trim() + "\n", { flag: "a" });
        res.statusCode = 204; res.end();
      });
    },
  };
}
