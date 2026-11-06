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
ls -la "$OUT"
