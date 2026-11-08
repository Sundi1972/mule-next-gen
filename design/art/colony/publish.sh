#!/usr/bin/env bash
# Builds the colony's pictures and ships them to the web app (spec C1 and §3; ART-DIRECTION §10).
#   render   design/art/colony/out/<kind>/<stage>-<light>.png       Blender Cycles, 1600 x 1600 (gitignored)
#   ship     apps/web/public/art/colony/<kind>/<stage>-<light>@{800,400}.webp and manifest.json
# Usage: design/art/colony/publish.sh [--no-render] [kind ...]   (without --no-render it RE-RENDERS every kind first)
#   local AM-7 preview: SRC=<out dir> PUB=design/art/colony/out/am7-pub KINDS="hall park hospital observatory stadium spaceport" publish.sh --no-render   (kinds default to all; env SAMPLES=256, BLENDER, KINDS)
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
SIZES = [int(s) for s in os.environ.get("SIZES", "800 400").split()]  # @w: a 1 x 1 picture w px wide, the scale for all
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


def png_width(path):
    with open(path, "rb") as f:
        return int.from_bytes(f.read(24)[16:20], "big")


def frame_of(kind):
    """The frame the renders were taken in: out/<kind>/frame.json (frame.run writes it; a flush layer is wider),
    else the kind's FRAME, else None for the shared 1600 x 1600 one."""
    side = os.path.join(out, kind, "frame.json")
    f = json.load(open(side)) if os.path.exists(side) else literal(kind, "FRAME", {})
    if f and (f["width"], f["height"], list(f["centre"])) == (1600, 1600, [800, 1000]):
        f = {}
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
        if os.environ.get("PARTIAL") == "1" and any(m.startswith(os.path.join(out, kind, f"{stage}-")) for m in missing):
            continue  # PARTIAL=1: a stage with a missing render is left out (the page draws its shape), never half-listed
        pictures[kind][stage] = entry
if missing and os.environ.get("PARTIAL") != "1":
    sys.exit("publish: missing renders:\n  " + "\n  ".join(missing))
if missing:
    print("publish: PARTIAL, stages left out for missing renders:\n  " + "\n  ".join(missing))

for kind in kinds:
    shutil.rmtree(os.path.join(pub, kind), ignore_errors=True)
    os.makedirs(os.path.join(pub, kind))
    for stage, entry in pictures[kind].items():
        if stage == "frame":
            continue
        for light, rel in entry.items():
            if rel is None:
                continue
            png = os.path.join(out, kind, f"{stage}-{light}.png")
            for w in SIZES:  # @w is w/1600 of full scale, whatever the frame: a 3200 frame's @800 is 1600 wide
                dst = os.path.join(pub, kind, f"{stage}-{light}@{w}.webp")
                subprocess.run(["cwebp", "-quiet", "-q", "82", "-alpha_q", "90", "-m", "6", "-resize", str(round(png_width(png) * w / 1600)), "0", png, "-o", dst], check=True)
                total += os.path.getsize(dst)

plates = {}
# the grounds plates (plate.py): plate<n>-<light>.png and plate<n>.json in SRC, every extent found (3, 5) unless
# PLATES names them. Shipped as plate/<n>-<light>@<w>.webp; @800 is half the plate's full-res frame, as for pictures
want = os.environ.get("PLATES", "").split() or [n for n in ("3", "5") if os.path.exists(os.path.join(out, f"plate{n}.json"))]
if want:
    shutil.rmtree(os.path.join(pub, "plate"), ignore_errors=True)
    os.makedirs(os.path.join(pub, "plate"))
for n in want:
    meta = json.load(open(os.path.join(out, f"plate{n}.json")))
    entry = {}
    for light in LIGHTS:
        png = os.path.join(out, f"plate{n}-{light}.png")
        if not os.path.exists(png):
            sys.exit(f"publish: missing plate render {png}")
        for w in SIZES:
            dst = os.path.join(pub, "plate", f"{n}-{light}@{w}.webp")
            q = os.environ.get("PLATE_Q_SMALL", "82") if w == SIZES[-1] else "82"  # the phone's plate tier may go lower (B-AC-5: <= 1 MB)
            subprocess.run(["cwebp", "-quiet", "-q", q, "-m", "6", "-resize", str(round(png_width(png) * w / 1600)), "0", png, "-o", dst], check=True)
            total += os.path.getsize(dst)
        entry[light] = f"plate/{n}-{light}@{SIZES[0]}.webp"
    fr = meta["frame"]
    entry["frame"] = {"width": fr["width"], "height": fr["height"], "hall": [round(v) for v in meta["hall"]]}
    plates[n] = entry

manifest = {
    "frame": {"width": 1600, "height": 1600, "place": 1293, "centre": [800, 1000]},
    "pictures": pictures,
    "sizes": SIZES,
}
if plates:
    manifest["plate"] = plates
with open(os.path.join(pub, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
n = sum(1 for k in pictures.values() for s, e in k.items() if s != "frame" for v in e.values() if v)
print(f"publish: {n} pictures + {3 * len(plates)} plate pictures x {len(SIZES)} sizes = {(n + 3 * len(plates)) * len(SIZES)} WebP, {total / 1e6:.2f} MB, manifest at {pub}/manifest.json")
PY

# each picture's silhouette, for the live layer's occlusion (spec C4, T-AC-13)
python3 -I "$HERE/skyline.py" "$PUB"
