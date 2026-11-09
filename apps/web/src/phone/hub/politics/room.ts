/**
 * The room this phone's ballots belong to. Seat ids restart at s1 in every room, so a pick or a "shown" noted in one
 * room must not carry to another's ballot at the same seat and month. Each ballot's memory registers what to forget
 * here; the election and the law ballot do, and neither imports the other.
 */
const forgets = new Set<() => boolean>();
let heldRoom: string | null = null;

/** Registers a forget for a room change: it clears one ballot's memory without notifying, and says whether it held any. */
export function onRoomChange(forget: () => boolean): void {
  forgets.add(forget);
}

/**
 * Notes the room whose ballot is drawn and forgets another room's memory; true if it did. Idempotent, and never
 * notifies: a render may call it, and the caller redraws from an effect when it says true.
 */
export function enterRoom(code: string): boolean {
  if (heldRoom === code) return false;
  heldRoom = code;
  let had = false;
  for (const forget of forgets) had = forget() || had;
  return had;
}
