"""Publish the inner-crossing lamp (lamp.py's PNGs) as WebP at the manifest's sizes, and write the manifest's `lamp` entry.

Run: python3 -I lamp_publish.py <lamp.py out dir>/lamp <public art dir>
  -> <art>/lamp/<day|dusk|glow>@{800,400}.webp, manifest.json["lamp"]
Published at the buildings' ratio: @800 is half the full-resolution render (spec §3)."""
import json
import os
import re
import subprocess
import sys

SRC, ART = sys.argv[1], sys.argv[2]
meta = json.load(open(os.path.join(SRC, "lamp.json")))
path = os.path.join(ART, "manifest.json")
manifest = json.load(open(path))
sizes = manifest["sizes"]
cell = meta["cell"]
os.makedirs(os.path.join(ART, "lamp"), exist_ok=True)


def publish(light):
    for w in sizes:
        dst = os.path.join(ART, "lamp", f"{light}@{w}.webp")
        subprocess.run(["cwebp", "-quiet", "-q", "82", "-alpha_q", "90", "-m", "6", "-resize", str(round(cell["width"] * w / 1600)), "0", os.path.join(SRC, f"{light}.png"), "-o", dst], check=True)
    return f"lamp/{light}@{max(sizes)}.webp"


manifest["lamp"] = {
    "cell": {"width": cell["width"], "height": cell["height"], "feet": cell["centre"]},
    "px_per_m": round(meta["px_per_m"], 3),
    **{light: publish(light) for light in ("day", "dusk", "glow")},
}
text = json.dumps(manifest, indent=2)
text = re.sub(r"\[\s+([-\d.,\s]+?)\s+\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", text)
text = re.sub(r'\[\s+("[^"\]]*"(?:,\s+"[^"\]]*")*)\s+\]', lambda m: "[" + re.sub(r",\s+", ", ", m.group(1)) + "]", text)
with open(path, "w") as f:
    f.write(text + "\n")
total = sum(os.path.getsize(os.path.join(ART, "lamp", f)) for f in os.listdir(os.path.join(ART, "lamp")))
print(f"lamp: 3 lights x {len(sizes)} sizes, {total / 1e3:.1f} KB")
