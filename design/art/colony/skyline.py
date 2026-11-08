"""Each picture's silhouette, for the live layer to know which colonists a building hides (spec C4, T-AC-13).

For every kind and stage in the manifest, the day picture's opaque pixels (alpha >= 0.95, so a cast shadow on the
catcher never counts) are read column by column, in columns COLUMN px wide at the full-resolution frame: the
topmost and the bottommost opaque row, as fractions of the picture's height (an empty column has top 1, bottom 0).
They are written into the manifest as pictures.<kind>.<stage>.skyline = {"column": COLUMN, "top": [...], "bottom": [...]}.
The day and dusk pictures share their geometry, so one silhouette serves both.
Run: python3 -I skyline.py <public art dir, holding manifest.json>   (needs dwebp; publish.sh runs it last)"""
import json
import os
import re
import subprocess
import sys
import tempfile

ART = sys.argv[1]
COLUMN = 40  # full-resolution frame px: about 0.37 m at the shared scale
OPAQUE = 242


def pam(path):
    """A decoded WebP as (width, height, depth, bytes), via dwebp's PAM output."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "p.pam")
        subprocess.run(["dwebp", "-quiet", "-pam", path, "-o", out], check=True)
        data = open(out, "rb").read()
    head, _, body = data.partition(b"ENDHDR\n")
    fields = dict(line.split(b" ", 1) for line in head.split(b"\n")[1:] if b" " in line)
    return int(fields[b"WIDTH"]), int(fields[b"HEIGHT"]), int(fields[b"DEPTH"]), body


def skyline(path, frame_width):
    w, h, depth, px = pam(path)
    assert depth == 4, f"{path}: no alpha"
    step = COLUMN * w / frame_width  # this file's px per column
    n = -(-frame_width // COLUMN)
    top, bottom = [1.0] * n, [0.0] * n
    solid = px[3::4].translate(bytes(int(v >= OPAQUE) for v in range(256)))  # 1 where opaque, row by row
    edges = [round(k * step) for k in range(n)] + [w]
    for y in range(h):
        row = solid[y * w : (y + 1) * w]
        for k in range(n):
            if 1 in row[edges[k] : edges[k + 1]]:
                top[k] = min(top[k], y / h)
                bottom[k] = max(bottom[k], (y + 1) / h)
    return {"column": COLUMN, "top": [round(v, 3) for v in top], "bottom": [round(v, 3) for v in bottom]}


path = os.path.join(ART, "manifest.json")
manifest = json.load(open(path))
n = 0
for kind, pictures in manifest["pictures"].items():
    frame = pictures.get("frame", manifest["frame"])
    for stage, entry in pictures.items():
        if stage == "frame":
            continue
        entry["skyline"] = skyline(os.path.join(ART, entry["day"]), frame["width"])
        n += 1
text = json.dumps(manifest, indent=2)
# one line per list of numbers, so a silhouette is two lines of the manifest rather than a hundred
text = re.sub(r"\[\s+([-\d.,\s]+?)\s+\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", text)
with open(path, "w") as f:
    f.write(text + "\n")
print(f"skyline: {n} silhouettes written to {path}")
