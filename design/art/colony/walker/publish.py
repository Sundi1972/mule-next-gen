"""Publish the colonists' sheets (tint.py's PNGs) as WebP at the manifest's sizes, and write the manifest's `walker` entry.

Run: python3 -I publish.py <tint out dir> <walk.py json (cell, px_per_m, frames, headings, seconds)> <public art dir>
  -> <art>/walker/<suit>-<trim>-<light>@{800,400}.webp, <art>/walker/outline@{800,400}.webp, manifest.json["walker"]
A sheet is published at the same ratio as the buildings: @800 is half the full-resolution render (spec §3)."""
import json
import os
import re
import subprocess
import sys

SRC, META, ART = sys.argv[1], sys.argv[2], sys.argv[3]
meta = json.load(open(META))
path = os.path.join(ART, "manifest.json")
manifest = json.load(open(path))
sizes = manifest["sizes"]
cell = meta["cell"]
full_width = cell["width"] * meta["frames"]
os.makedirs(os.path.join(ART, "walker"), exist_ok=True)


def publish(png, name):
    for w in sizes:
        dst = os.path.join(ART, "walker", f"{name}@{w}.webp")
        width = round(full_width * w / 1600)
        subprocess.run(["cwebp", "-quiet", "-q", "82", "-alpha_q", "90", "-m", "6", "-resize", str(width), "0", os.path.join(SRC, png), "-o", dst], check=True)
    return f"walker/{name}@{max(sizes)}.webp"


sheets = {}
for png in sorted(os.listdir(SRC)):
    m = re.fullmatch(r"(p\d)-(\w+)-(day|dusk)\.png", png)
    if m:
        sheets.setdefault(f"{m[1]}-{m[2]}", {})[m[3]] = publish(png, png[:-4])
assert sheets and all(set(v) == {"day", "dusk"} for v in sheets.values()), "a variant is missing a light"
manifest["walker"] = {
    "cell": {"width": cell["width"], "height": cell["height"], "feet": cell["centre"]},
    "px_per_m": round(meta["px_per_m"], 3),
    "frames": meta["frames"],
    "seconds": round(meta["seconds"], 3),
    "headings": meta["headings"],
    "sheets": sheets,
    "outline": publish("outline.png", "outline"),
}
text = json.dumps(manifest, indent=2)
text = re.sub(r"\[\s+([-\d.,\s]+?)\s+\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", text)
text = re.sub(r'\[\s+("[^"\]]*"(?:,\s+"[^"\]]*")*)\s+\]', lambda m: "[" + re.sub(r",\s+", ", ", m.group(1)) + "]", text)
with open(path, "w") as f:
    f.write(text + "\n")
total = sum(os.path.getsize(os.path.join(ART, "walker", f)) for f in os.listdir(os.path.join(ART, "walker")))
print(f"walker: {len(sheets)} variants x 2 lights + outline, {len(sizes)} sizes, {total / 1e3:.0f} KB")
