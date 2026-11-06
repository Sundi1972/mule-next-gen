import type { Slot, Species } from '@mule/ui';

/** What plays a seat: a person's phone, the server's own computer player, or a Claude chat. */
export type SeatKind = 'phone' | 'builtin' | 'claude';

/** A Claude seat before the game: no chat yet, or a chat has called with the code. */
export type LobbyLink = 'waiting' | 'connected';

/** A Claude seat in play. Offline plays its built-in plan and never holds the table up. */
export type PlayLink = 'thinking' | 'ready' | 'offline';

export interface MockSeat {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  kind: SeatKind;
}

export const ROOM = 'KRTX';
/** A seat code (spec §3): 4 unambiguous letters, a dash, 2 digits. */
export const JOIN_CODE = 'K7QM-42';
/** Each computer seat's own code, made when the host picks Claude for it. */
export const JOIN_CODES: Record<string, string> = { juno: JOIN_CODE, brix: 'TW8R-07' };
export const HANDOFF_CODE = 'H3VN-58';
/** What Copy invite puts on the clipboard (spec §3): one message the host sends to whoever's Claude should play. */
export const inviteText = (code: string) => `Play MULE seat ${code}. Keep calling wait_for_my_turn with the code and answer every decision with submit_plan until the game is over. Don't stop to ask me.`;
/** The handed-over seat's code lives 10 minutes. */
export const HANDOFF_SECONDS = 600;

/*
 * In a .ts file because the mock's source stamp, which runs on .tsx only, reads a `<word` in a string as a JSX tag.
 */
export const CODE_PLACEHOLDER = '<join code>';
export const SETUP_DECISION = `The setup page (/claude-code) is three numbered steps: the setup line once, /mcp__mule__play ${CODE_PLACEHOLDER}, leave it running (or headless). If the laptop sleeps: paste the same code again.`;

export const setupLine = () => `claude mcp add --transport http mule ${window.location.origin}/mcp`;
export const playLine = (code: string) => `/mcp__mule__play ${code}`;
export const headlessLine = (code: string) => `claude -p "/mcp__mule__play ${code}"`;

export const ME = 'lena';
export const HOST = 'lena';

export const SEATS: MockSeat[] = [
  { id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', kind: 'phone' },
  { id: 'kai', name: 'Kai', slot: 1, species: 'mollox', kind: 'phone' },
  { id: 'juno', name: 'Juno', slot: 2, species: 'gearling', kind: 'claude' },
  { id: 'brix', name: 'Brix', slot: 3, species: 'bramblet', kind: 'builtin' },
];
