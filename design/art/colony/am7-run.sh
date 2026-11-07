#!/usr/bin/env bash
# AM-7 full run: every flush building layer and both grounds plates, in the order the stills need them.
#   1. the month-12 fixture (design/mocks/colony-grounds/src/tvbeat/TvBeat.tsx, stages by packages/ui pictureStage):
#      hall standing, Park standing, Hospital standing, Observatory site (commissioned), Stadium standing (2 x 2),
#      Spaceport build2 (building, 1 of 3 months left; 2 x 2)
#   2. plate3 and plate5
#   3. every remaining kind x RULE-1 stage
# Each in day, dusk and glow (closed has no glow). Everything lands in <out>/flush/kit, which is publish.sh's SRC.
# Run: KITS_DIR=... nohup design/art/colony/am7-run.sh [out=out/am7] [samples=128] > <out>/am7-run.log 2>&1 &
# KIND_LIGHTS=dusk,glow re-renders the buildings' dusk and glow only (the plates still take all three); the progress
# line then counts that many pictures. COLONY_DENOISE_GPU=1 is set: the CPU denoiser hung under load (7 Nov).
# The log gets one progress line per picture: "<HH:MMZ> [n/total] COLONY render <kind>/<stage>-<light> <s>s".
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
OUT="${1:-out/am7}"
SAMPLES="${2:-128}"
BLENDER="${BLENDER:-blender}"
: "${KITS_DIR:?set KITS_DIR to the kit folder}"
export KITS_DIR
mkdir -p "$OUT/flush/kit"
FULL="$OUT/am7-blender.log"  # Blender's own output, for when a job fails
KIND_LIGHTS="${KIND_LIGHTS:-day,dusk,glow}"
export COLONY_DENOISE_GPU="${COLONY_DENOISE_GPU:-1}"
# 28 building stages (5 of them closed, which have no glow) and 2 plates x 3 lights
nl=$(echo "$KIND_LIGHTS" | tr ',' '\n' | grep -c .)
case "$KIND_LIGHTS" in *glow*) TOTAL=$(( 28 * nl - 5 + 6 )) ;; *) TOTAL=$(( 28 * nl + 6 )) ;; esac
n=0

job() {  # job <label> <command...>: run one Blender call, one log line per picture it writes
  local label="$1"
  shift
  echo "$(date -u +%H:%MZ) start $label"
  "$@" 2>&1 | tee -a "$FULL" | while IFS= read -r line; do
    case "$line" in
      "COLONY render "*) echo "$(date -u +%H:%MZ) [$(( $(cat "$OUT/.count" 2>/dev/null || echo 0) + 1 ))/$TOTAL] $line"
                         echo $(( $(cat "$OUT/.count" 2>/dev/null || echo 0) + 1 )) > "$OUT/.count" ;;
      *Traceback*|*Error:*) echo "$(date -u +%H:%MZ) ERROR in $label: $line" ;;
    esac
  done
  local rc=${PIPESTATUS[0]}
  [ "$rc" = 0 ] || echo "$(date -u +%H:%MZ) FAILED $label (exit $rc), see $FULL"
}

kind() {  # kind <kind> <stage,...>
  job "$1 $2" env COLONY_FLUSH=1 "$BLENDER" -b --python-exit-code 1 -P "$1.py" -- "$OUT" "$SAMPLES" "$2" "$KIND_LIGHTS" 100
}

plate() {  # plate <extent>
  job "plate$1" "$BLENDER" -b --python-exit-code 1 -P plate.py -- "$OUT/flush/kit" "$SAMPLES" day,dusk,glow 100 "$1"
}

echo 0 > "$OUT/.count"
echo "$(date -u +%H:%MZ) AM-7 full run: $TOTAL pictures at $SAMPLES spp into $OUT/flush/kit"
# 1. the month-12 fixture
kind hall standing
kind park standing
kind hospital standing
kind observatory site
kind stadium standing
kind spaceport build2
echo "$(date -u +%H:%MZ) MILESTONE month-12 fixture done"
# 2. the plates, the TV's 5 x 5 first
plate 5
plate 3
echo "$(date -u +%H:%MZ) MILESTONE plates done"
# 3. the rest
kind park site,build1,closed,damaged
kind hospital site,build1,closed,damaged
kind observatory build1,standing,closed,damaged
kind stadium site,build1,build2,closed,damaged
kind spaceport site,build1,standing,closed,damaged
echo "$(date -u +%H:%MZ) DONE $(cat "$OUT/.count")/$TOTAL pictures"
