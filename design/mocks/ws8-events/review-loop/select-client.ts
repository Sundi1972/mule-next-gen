/**
 * The review loop, browser side. Import once from the mock's entry file.
 *
 *   plain click            use the prototype
 *   Alt + click            select (the prototype does not act)
 *   Alt + click again      one level in, wrapping at the leaf
 *   Alt + Shift + click    add to the selection
 *   S                      toggle select-mode: plain click selects
 *   N                      leave a note on the current selection
 *   Esc                    clear the selection (leaving select-mode also clears)
 *
 * Alt because Shift extends text selection, Cmd opens links in a new tab, and
 * Ctrl-click is a right-click on macOS. Every handler ignores untrusted events, so
 * automation cannot change the reviewer's selection, mode or notes.
 */
type Entry = {
  level: number; source: string; tag: string; className: string | null;
  nth: number; ofSameSource: number; text: string;
};

let leaf: Element | null = null;
let depth = 0;
let current: Entry[] = [];

const readout = document.createElement("div");
readout.id = "mock-select-readout";
readout.style.cssText =
  "position:fixed;top:10px;right:10px;z-index:2147483647;background:#1b2331;" +
  "border:1px solid #2a3547;border-radius:8px;padding:8px 10px;color:#e6e8eb;" +
  "font:12px ui-monospace,SFMono-Regular,Menlo,monospace;max-width:320px;" +
  "pointer-events:none;line-height:1.45";
addEventListener("DOMContentLoaded", () => document.body.appendChild(readout));

/** Ancestors OUTERMOST-first, dropping wrappers that cover most of the
 *  viewport — otherwise click 1 selects "the whole page", which is useless. */
function chainOf(el: Element): { entry: Entry; el: Element }[] {
  const up: Element[] = [];
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) up.push(n);
  const page = innerWidth * innerHeight;
  return up
    .reverse()
    .filter((e) => e.getAttribute("data-source"))
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return (r.width * r.height) / page < 0.7;
    })
    .map((e, i) => {
      const source = e.getAttribute("data-source")!;
      const peers = [...document.querySelectorAll(`[data-source="${source}"]`)];
      return {
        el: e,
        entry: {
          level: i, source,
          tag: e.tagName.toLowerCase(),
          // Not `.className`: on SVG elements it is an SVGAnimatedString, not a string.
          className: e.getAttribute("class") || null,
          // Several JSX elements can share one source line; nth tells them apart.
          nth: peers.indexOf(e) + 1,
          ofSameSource: peers.length,
          text: ((e as HTMLElement).innerText || "").trim().slice(0, 40),
        },
      };
    });
}

function render(chain: { entry: Entry; el: Element }[], d: number) {
  document.querySelectorAll("[data-mock-hl]").forEach((n) => {
    n.removeAttribute("data-mock-hl");
    (n as HTMLElement).style.outline = "";
  });
  const pick = chain[d];
  if (!pick) return;
  const el = pick.el as HTMLElement;
  el.setAttribute("data-mock-hl", "1");
  el.style.outline = "2px solid #4f8cff";
  el.style.outlineOffset = "-2px";
  const { tag, className, source } = pick.entry;
  const name = tag + (className ? "." + String(className).split(/\s+/)[0] : "");
  readout.innerHTML =
    `<b>${name}</b><br><span style="color:#9db8e8">${source}</span><br>` +
    `<span style="color:#7a8594">level ${d + 1} of ${chain.length} — Alt-click again to go deeper · N to note</span>` +
    modeLine();
}

/** Drop the selection on screen and on disk; a stale file would answer "this" wrongly. */
function clearSelection() {
  document.querySelectorAll("[data-mock-hl]").forEach((n) => {
    n.removeAttribute("data-mock-hl");
    (n as HTMLElement).style.outline = "";
  });
  leaf = null; depth = 0; current = [];
  readout.innerHTML = modeLine().replace(/^<br>/, "");
  fetch("/__select", { method: "DELETE" }).catch(() => {});
}

// Always shown: in an unlabelled select-mode a click on a button looks broken.
function modeLine() {
  return selectMode
    ? `<br><span style="color:#ffd479">SELECT MODE — plain click selects · S to exit</span>`
    : `<br><span style="color:#7a8594">Alt-click to select · S for select-mode</span>`;
}

function renderMode() {
  if (!readout.innerHTML) { readout.innerHTML = modeLine().replace(/^<br>/, ""); return; }
  readout.innerHTML = readout.innerHTML.replace(
    /<br><span style="color:(#ffd479|#7a8594)">(SELECT MODE|Alt-click to select)[^<]*<\/span>$/,
    modeLine(),
  );
}

let selectMode = false;

addEventListener("keydown", (e) => {
  if (!e.isTrusted) return;
  if (e.key.toLowerCase() !== "s") return;
  const t = (e.target as HTMLElement)?.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
  selectMode = !selectMode;
  // Leaving select-mode means "done pointing", so the selection goes too.
  if (!selectMode) clearSelection(); else renderMode();
});

// Without Esc, an Alt-click selection could only be replaced, never dismissed.
addEventListener("keydown", (e) => {
  if (!e.isTrusted || e.key !== "Escape" || !current.length) return;
  clearSelection();
});

addEventListener("click", (e) => {
  // A scripted click would overwrite the reviewer's selection.
  if (!e.isTrusted) return;

  // Mac reviewers reach for Cmd first; say so instead of silently acting as a plain click.
  if (e.metaKey && !e.altKey && !selectMode) {
    const near = (e.target as HTMLElement).closest?.("[data-source]");
    if (near) {
      readout.innerHTML =
        `<span style="color:#ffd479">that was ⌘ — hold ⌥ (Option) to select</span>` +
        `<br><span style="color:#7a8594">⌥ is immediately left of ⌘ · or press S for select-mode</span>`;
    }
    return;
  }

  if (!e.altKey && !selectMode) return;

  const hit = (e.target as HTMLElement).closest("[data-source]");
  if (!hit) return;

  // stopPropagation keeps React from acting; preventDefault keeps the browser from following links.
  e.stopPropagation();
  e.preventDefault();

  if (hit !== leaf) { leaf = hit; depth = 0; } else { depth += 1; }
  const chain = chainOf(hit);
  if (!chain.length) return;
  if (depth >= chain.length) depth = 0;
  render(chain, depth);
  const selected = chain[depth].entry;
  // Shift adds (Alt+Shift, or Shift in select-mode); otherwise replace.
  current = e.shiftKey ? [...current, selected] : [selected];
  fetch("/__select", {
    method: "POST",
    body: JSON.stringify({
      screen: location.pathname,
      selectedLevel: depth,
      selected,
      alsoSelected: current.slice(0, -1),
      chain: chain.map((c) => c.entry),
    }),
  });
  // Capture phase: runs before React's root listener, so stopPropagation can stop it.
}, { capture: true });

addEventListener("keydown", (e) => {
  if (!e.isTrusted) return;
  if (e.key.toLowerCase() !== "n" || !current.length) return;
  const target = (e.target as HTMLElement)?.tagName;
  if (target === "INPUT" || target === "TEXTAREA") return;
  const note = prompt(`Note on ${current[0].tag} (${current[0].source}):`);
  if (!note) return;
  fetch("/__note", {
    method: "POST",
    body: JSON.stringify({ at: new Date().toISOString(), note, on: current }),
  });
});
