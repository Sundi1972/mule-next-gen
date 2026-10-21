/** A seat this phone holds: enough to take it back after a reload or a dropped connection. */
export interface SavedSeat {
  code: string;
  token: string;
  name: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'mule-seat';

/** Storage can be blocked or full; then the phone simply can't rejoin by itself. */
export function loadSeat(store: KeyValueStore | null): SavedSeat | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedSeat>;
    return typeof v.code === 'string' && typeof v.token === 'string' ? { code: v.code, token: v.token, name: typeof v.name === 'string' ? v.name : '' } : null;
  } catch {
    return null;
  }
}

export function saveSeat(store: KeyValueStore | null, seat: SavedSeat): void {
  try {
    store?.setItem(KEY, JSON.stringify(seat));
  } catch {
    // Not remembered; the player rejoins by hand.
  }
}

export function clearSeat(store: KeyValueStore | null): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The browser's localStorage, or null where it is blocked. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
