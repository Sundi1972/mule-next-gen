#!/bin/sh
# Copies the spike's pictures into the colony-grounds mock as WebP (alpha kept), full size and the TV place size.
set -e
cd "$(dirname "$0")"
OUT=../../../mocks/colony-grounds/public/look
mkdir -p "$OUT"
pub() { # <src.png> <name>
  cwebp -quiet -q 86 -alpha_q 90 "$1" -o "$OUT/$2.webp"
  cwebp -quiet -q 86 -alpha_q 90 -resize 800 600 "$1" -o "$OUT/$2-800.webp"
}
pub procedural/park_day.png a-day
pub procedural/park_dusk.png a-dusk
pub r3f/shots/park_day.png b-day
pub r3f/shots/park_dusk.png b-dusk
pub out/park_day.png c-day
pub out/park_dusk.png c-dusk

# The whole colony (1920×1080, published as is) and the Hospital's stages, once rendered.
for v in day dusk; do [ -f out/colony_$v.png ] && cwebp -quiet -q 86 -alpha_q 90 out/colony_$v.png -o "$OUT/colony-$v.webp"; done
[ -f out/hospital_stages.png ] && cwebp -quiet -q 86 -alpha_q 90 out/hospital_stages.png -o "$OUT/hospital-stages.webp"
ls -la "$OUT" | grep -E "colony|hospital" || true
