import type { Slot, Species } from '@mule/ui';

/** What plays a seat: a person's phone, the server's own computer player, or a Claude Code session. */
export type SeatKind = 'phone' | 'builtin' | 'claude';

/** A Claude Code seat before the game: no session yet, or a session has joined with the code. */
export type LobbyLink = 'waiting' | 'connected';

/**
 * A Claude Code seat in play. Waiting (its chat never connected) and offline both play its built-in plan and never hold the
 * table up.
 */
export type PlayLink = 'thinking' | 'ready' | 'offline' | 'waiting';

export interface MockSeat {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  kind: SeatKind;
}

export const ROOM = 'KRTX';
export const JOIN_CODE = 'MULE-7Q4K-M2XD-9PRC';
/** Each computer seat's own code, made when the host picks Claude Code for it. */
export const JOIN_CODES: Record<string, string> = { juno: JOIN_CODE, brix: 'MULE-2WBR-5J8N-TC6Y' };
export const HANDOFF_CODE = 'MULE-H3VN-8TQA-K5WE';
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
