# Spike S-2: steering feel over Wi-Fi (arcade walking)

2026-10-29, WS6. Spec `docs/specs/2026-10-29-arcade-walking.md` §7 S-2 (timebox ½ day; blocks C11's prediction).
Stop condition: Heiko or the PM plays it on a phone. **Met: Heiko played it.**

## Verdict

Heiko, in his own words: **"tested phone sterring ok. but too fast in store"**. After a store-speed slider was added
and its default set to 3 s from the door to the corral: **"3 is fine"** (via the PM).

- Steering with RULE-10's prediction passes as built (below), with `steer` stamped with the tick the phone applied
  it at, and the server applying each input at that tick. Spec AM-7 writes it into §3 and RULE-10.
- The store hall was too fast: `floorSeconds` (door to corral) was DEV_WALK's 1 s, so door to door took about 1.6 s.
  **Ruled: 3 s door to corral** (door to door about 4.9 s; leading a MULE, 0.9 of the speed). Spec RULE-7 and AM-7.

## What was built (a throwaway; torn down)

Scratch only (`scratchpad/s2-feel/`, never in the repo), on its own free ports on the LAN; never the :8787 rig. A
Node server stepped the arcade mock's own `step()` (`design/mocks/ws6-ux/src/screens/arcade/sim.ts`, from the
stable worktree at ceedd23f + the 3 s floor) every 50 ms (`DEV_STEER.tickMs`) with the mock's bots, and broadcast a
frame each tick (`{tick, at, colonists, reach, storeMules, ack}`). The phone sent `steer` (1/8 steps, on change,
≤ 10 a second) and `act`, each stamped with its tick; it predicted its own colonist with the same `step()`, ran ahead
of the server by half the round trip plus one tick, eased within `snapTiles` over `correctMs` and snapped beyond,
drew the others `interpolateMs` behind the newest frame, and showed "reconnecting" after 1000 ms with no frame.
Sliders: snapTiles, correctMs, interpolateMs, an injected one-way delay and jitter, and the store's speed (set on
the server and every phone at once, so both copies step the same rules). Wolves, the glint and the scramble were
off: they draw from the world's random numbers, which a phone's copy cannot share, so they would read as false
prediction errors; the phone predicts steering only and takes the moments from the server's frames.

## Measured (headless, 20 s of steering per run; the readout sampled every 250 ms)

| One-way delay | Jitter | RTT | Frames/s | Compared | Corrections | Snaps | Max error |
|---|---|---|---|---|---|---|---|
| 0 ms | 0 | 1 ms | 20.0 | 408 | 0 | 0 | 0.000 tiles |
| 50 ms | 0 | 101 ms | 20.0 | 403 | 0 | 0 | 0.000 |
| 150 ms | 0 | 304 ms | 20.1 | 407 | 0 | 0 | 0.000 |
| 150 ms | ≤ 50 ms | 365 ms | 20.1 | 401 | 0 | 0 | 0.000 |
| 0, inputs stamped 3 ticks late (positive control) | 0 | 1 ms | 20.0 | 403 | **183** | **2** | **0.305** |

Re-run after the store slider (3 s default): the same zeros, the control 183 corrections and 2 snaps; 0 console
errors over all runs. "Reconnecting" never showed; the server logged 0 inputs arriving after their tick.

**What the zeros depend on:** the sim is deterministic and every input landed on the tick it was stamped with, so
the phone's copy matched the server exactly even at 365 ms round trip with jitter. The cost moves to everyone else:
the others are drawn about the one-way delay plus 100 ms behind the server. On real Wi-Fi, corrections come from a
jitter spike larger than the phone's lead (an input arriving after its tick); RULE-10's snap and ease cover that.

## Values carried into the spec

`DEV_STEER.tickMs` 50 · `snapTiles` 0.25 · `correctMs` 150 · `interpolateMs` 100 · `staleMs` 1000 (unchanged from
RULE-10) · `floorSeconds` **3** (RULE-7, was DEV_WALK's 1). S-1 (the wire, WS3) still settles 20 Hz against 10 Hz.

## Teardown

Stopped by its PIDs (85358, 85365, 85371) and checked by cwd and listening ports: nothing left.
