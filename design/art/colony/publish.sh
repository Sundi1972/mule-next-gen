#!/usr/bin/env bash
# Builds the colony's pictures and ships them to the web app (spec C1 and §3; ART-DIRECTION §10).
#   render   design/art/colony/out/<kind>/<stage>-<light>.png       Blender Cycles, 1600 x 1600 (gitignored)
#   ship     apps/web/public/art/colony/<kind>/<stage>-<light>@{800,400}.webp and manifest.json
# Usage: design/art/colony/publish.sh [--no-render] [kind ...]   (kinds default to all; env SAMPLES=256, BLENDER, KINDS)
# A kind with its own FRAME (2 x 2 places, the Spaceport's rocket) gets pictures.<kind>.frame in the manifest; its
# WebP keep the shared scale, so "@800" is 1600 wide for a 3200 frame.
# The manifest always covers every kind in KINDS and fails if any picture it names is missing,
# so a broken render cannot ship a manifest that points at nothing.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
SAMPLES="${SAMPLES:-256}"
KINDS="${KINDS:-hall park hospital}"  # PR-1's kinds; observatory, stadium, spaceport join with their stages (PR-3)
# SRC: which renders to ship (relative to this folder); PUB: where (relative to the repo root).
#   kit-free, shipped:  publish.sh                                   (SRC=out, PUB=apps/web/public/art/colony)
#   kit preview, local: SRC=out/kit PUB=design/art/colony/out/kit-pub publish.sh --no-render
#   kit, shipped:       SRC=out/kit publish.sh   ONLY after the PM relays Heiko's licence answer (spec AM-5)
SRC="${SRC:-out}"
PUB="${PUB:-apps/web/public/art/colony}"
case "$SRC" in /*) OUT="$SRC" ;; *) OUT="$HERE/$SRC" ;; esac
case "$PUB" in /*) ;; *) PUB="$REPO/$PUB" ;; esac
RENDER_OUT="$HERE/out"  # kind scripts write here, or to out/kit when KITS_DIR is set

render=1
if [ "${1:-}" = "--no-render" ]; then render=0; shift; fi
todo="${*:-$KINDS}"
command -v cwebp >/dev/null || { echo "publish.sh: cwebp not found (brew install webp)" >&2; exit 1; }

if [ "$render" = 1 ]; then
  for k in $todo; do
    mkdir -p "$RENDER_OUT"
    "$BLENDER" -b --python-exit-code 1 -P "$HERE/$k.py" -- "$RENDER_OUT" "$SAMPLES" > "$RENDER_OUT/$k.log" 2>&1 \
      || { echo "publish.sh: $k failed, see $RENDER_OUT/$k.log" >&2; exit 1; }
    grep '^COLONY' "$RENDER_OUT/$k.log"
  done
fi

echo "publish.sh: $OUT -> $PUB"
python3 -I - "$HERE" "$OUT" "$PUB" $KINDS <<'PY'
import ast, json, os, shutil, subprocess, sys

here, out, pub, kinds = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
SIZES = [800, 400]
LIGHTS = ["day", "dusk", "glow"]


def literal(kind, name, default=None):
    """A literal (STAGES, FRAME) from the kind script, read without running Blender."""
    tree = ast.parse(open(os.path.join(here, f"{kind}.py")).read())
    for n in tree.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", None) == name:
            return ast.literal_eval(n.value)
    if default is None:
        raise SystemExit(f"publish: {kind}.py has no {name}")
    return default


def stages(kind):
    return literal(kind, "STAGES")


def frame_of(kind):
    """A kind's own frame (a 2 x 2 kind, a tall rocket) or None for the shared 1600 x 1600 one."""
    f = literal(kind, "FRAME", {})
    if not f:
        return None
    return {"width": f["width"], "height": f["height"], "place": 1293, "centre": f["centre"], "places": f.get("places", 1)}


pictures, missing, total = {}, [], 0
for kind in kinds:
    pictures[kind] = {}
    if frame_of(kind):  # the same scale as every picture; only its size and anchor differ
        pictures[kind]["frame"] = frame_of(kind)
    for stage in stages(kind):
        entry = {}
        for light in LIGHTS:
            if light == "glow" and stage == "closed":  # dark is the point: RULE-2 gives closed no glow
                entry[light] = None
                continue
            png = os.path.join(out, kind, f"{stage}-{light}.png")
            if not os.path.exists(png):
                missing.append(png)
            entry[light] = f"{kind}/{stage}-{light}@{SIZES[0]}.webp"
        pictures[kind][stage] = entry
if missing:
    sys.exit("publish: missing renders:\n  " + "\n  ".join(missing))

for kind in kinds:
    shutil.rmtree(os.path.join(pub, kind), ignore_errors=True)
    os.makedirs(os.path.join(pub, kind))
    scale = (frame_of(kind) or {"width": 1600})["width"] / 1600  # @800 is half scale: 1600 wide for a 3200 frame
    for stage, entry in pictures[kind].items():
        if stage == "frame":
            continue
        for light, rel in entry.items():
            if rel is None:
                continue
            png = os.path.join(out, kind, f"{stage}-{light}.png")
            for w in SIZES:
                dst = os.path.join(pub, kind, f"{stage}-{light}@{w}.webp")
                subprocess.run(["cwebp", "-quiet", "-q", "82", "-alpha_q", "90", "-m", "6", "-resize", str(round(w * scale)), "0", png, "-o", dst], check=True)
                total += os.path.getsize(dst)

manifest = {
    "frame": {"width": 1600, "height": 1600, "place": 1293, "centre": [800, 1000]},
    "pictures": pictures,
    "sizes": SIZES,
}
with open(os.path.join(pub, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
n = sum(1 for k in pictures.values() for s, e in k.items() if s != "frame" for v in e.values() if v)
print(f"publish: {n} pictures x {len(SIZES)} sizes = {n * len(SIZES)} WebP, {total / 1e6:.2f} MB, manifest at {pub}/manifest.json")
PY
