import type { ChatMessage, MuleView, PlayerView, TileView } from '@mule/protocol';
import { ME, TILES, VIEW } from '../../fixture';

/**
 * Muting an AI, in planning, month 5, as Heiko's phone sees it. Fixture data only. The workspace's fixture table,
 * renamed as the land grant mock renamed it (Lena's seat is Heiko's), so the map, its owners and the slots stay the
 * ones every other mock draws: Ossa's seat is the AI "The Baron", Kai's stays the AI Kai, Brix is the other human.
 * Heiko is the host (it only matters to the alternative, where the host's mute reaches the TV).
 */

const RENAME: Record<string, string> = { lena: 'heiko', ossa: 'baron', brix: 'brix', kai: 'kai' };
const NAME: Record<string, string> = { heiko: 'Heiko', baron: 'The Baron', brix: 'Brix', kai: 'Kai' };

export const ME_ID = 'heiko';
export const HOST_ID = 'heiko';

const tiles: TileView[] = TILES.map((t) => ({ ...t, owner: t.owner ? (RENAME[t.owner] ?? t.owner) : null }));
const players: PlayerView[] = VIEW.players.map((p) => {
  const id = RENAME[p.id]!;
  // Planning: the two AIs are done (their play goes on, muted or not), the two humans still plan.
  return { ...p, id, name: NAME[id]!, ready: p.isAi };
});

export const MUTE_VIEW: MuleView = { ...VIEW, phase: 'planning', phaseEndsAt: null, tiles, players, me: { ...ME, id: ME_ID } };

/** The planning clock: a static mock, so a fixed number of seconds. */
export const SECONDS = 48;

/**
 * The table's talk, oldest first. The phone keeps the last 2 lines it may show, the TV the last 3 public ones.
 * The Baron's two lines are what a mute hides on Heiko's phone: one whisper (to Heiko only, never on the TV) and one
 * unprompted public line. Kai's line is an AI's too, and stays: only The Baron is muted.
 */
export const LINES: ChatMessage[] = [
  { id: 1, from: 'heiko', text: 'Good luck, everyone', at: 0 },
  { id: 2, from: 'brix', text: 'Anyone want the swamp?', at: 1 },
  { id: 3, from: 'kai', text: 'Smithore is going to spike. Just saying.', at: 2 },
  { id: 4, from: 'baron', text: 'My Smithore, my prices. Bid high, friends.', at: 3 },
  { id: 5, from: 'baron', to: 'heiko', text: "Kai is leading. Let's not hurt each other?", at: 4 },
];

/**
 * The Baron's card offer to Heiko: WS7's deal card (the approved shape in PlanningHub.tsx's Talk desk), a pact, since
 * spec B's offers are "pact and vote offers" and nothing of value changes hands in a deal (WS7 HC-3, decided 21 Oct).
 */
export const OFFER = {
  id: 'baron',
  from: 'baron',
  title: 'Non-aggression pact · 3 months',
  terms: 'Neither of you may sabotage the other until month 8.',
  extra: '+ Vote together on the land tax',
};

/** One state of the page: who Heiko has muted, what the mock shows of the tap, and what the TV does with a host's mute. */
export interface MuteState {
  id: string;
  title: string;
  muted: string[];
  /** The one tap, drawn on the control, and its confirmation in place. */
  tap?: { id: string; muted: boolean };
  /** The alternative: the host muted it, and the TV hides its public lines too. */
  tvHides?: boolean;
  /** Lines said while it was muted: an unmute never replays them. */
  missed?: number[];
}

export const MUTE_STATES: MuteState[] = [
  { id: 'none', title: 'Nobody muted', muted: [] },
  { id: 'muting', title: 'Heiko mutes The Baron', muted: ['baron'], tap: { id: 'baron', muted: true } },
  { id: 'muted', title: 'The Baron muted: phone and TV', muted: ['baron'] },
  { id: 'alt', title: 'Alternative, for Heiko: the TV hides it too', muted: ['baron'], tvHides: true },
  { id: 'unmute', title: 'Unmute', muted: [], tap: { id: 'baron', muted: false }, missed: [4, 5] },
];
