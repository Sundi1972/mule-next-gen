import { GAME } from '@mule/engine';
import type { ChatMessage, MuleView, PlayerView, TileView } from '@mule/protocol';
import { ME, TILES, VIEW } from '../../fixture';

/**
 * The land grant in month 5, as Heiko's phone sees it. Fixture data only. The four players are the workspace's
 * fixture table renamed (Lena's seat is Heiko's, Ossa's Lena's, Kai's the AI "The Good Neighbour"), so the map,
 * its owners and the slots stay the ones every other mock draws.
 *
 * Claims: GAME.claimsPerGrant from the engine's config, as the product's footer reads it. The brief said
 * "N OF 3"; config.ts says 2 (packages/engine/src/config.ts, on ws6-ux and on feat/strategist alike), so the mock
 * says what the product would: "1 OF 2 CLAIMS LEFT" mid-grant. The line is as wide either way.
 */

const RENAME: Record<string, string> = { lena: 'heiko', ossa: 'lena', brix: 'brix', kai: 'neighbour' };
const NAME: Record<string, string> = { heiko: 'Heiko', lena: 'Lena', brix: 'Brix', neighbour: 'The Good Neighbour' };

/** The plot lit now: Plains 4·1, free, and Heiko had his drone over it, so he sees its ground. */
export const LIT = { x: 3, y: 0 };

const LIT_GROUND = { food: 3, water: 2, energy: 2, smithore: 1, crystite: 0, rareEarth: 0 } as NonNullable<TileView['ground']>;

const tiles: TileView[] = TILES.map((t) => ({
  ...t,
  owner: t.owner ? (RENAME[t.owner] ?? t.owner) : null,
  ...(t.x === LIT.x && t.y === LIT.y ? { owner: null, outfit: null, ground: LIT_GROUND } : {}),
}));

const basePlayers: PlayerView[] = VIEW.players.map((p) => {
  const id = RENAME[p.id]!;
  return { ...p, id, name: NAME[id]!, ready: false };
});

/** One grant state: how many claims Heiko has left, whether he pressed Ready, and who else is done. */
export interface GrantState {
  id: string;
  title: string;
  /** Today's footer, drawn as the product has it, for comparison. */
  today?: boolean;
  claimsLeft: number;
  /** Heiko pressed "I'm ready" (Done with land). With no claims left the server counts him done anyway. */
  ready: boolean;
  /** The other seats already done with land. */
  othersDone: string[];
}

const left = (n: number) => Math.max(0, GAME.claimsPerGrant - n);

export const GRANT_STATES: GrantState[] = [
  { id: 'today', title: 'Today: the footer as it is', today: true, claimsLeft: left(1), ready: false, othersDone: ['lena'] },
  { id: 'compact', title: 'Compact: claims left, not ready, waiting for 2', claimsLeft: left(1), ready: false, othersDone: ['lena'] },
  { id: 'compact-ready', title: 'Compact: ready, still waiting for 2', claimsLeft: left(1), ready: true, othersDone: ['lena'] },
  { id: 'compact-done', title: 'Compact: 0 claims left, waiting for 1', claimsLeft: 0, ready: true, othersDone: ['lena', 'brix'] },
  { id: 'compact-alone', title: 'Compact: everyone else done', claimsLeft: left(1), ready: false, othersDone: ['lena', 'brix', 'neighbour'] },
];

/** The view for one state: the grant's phase, the lit plot, the ready flags as the server derives them. */
export function grantView(s: GrantState): MuleView {
  const players = basePlayers.map((p) => ({
    ...p,
    // In the land grant a seat is ready once it used its claims or pressed Done with land (apps/server/src/mule-game.ts).
    ready: p.id === 'heiko' ? s.ready || s.claimsLeft === 0 : s.othersDone.includes(p.id),
  }));
  return {
    ...VIEW,
    phase: 'landGrant',
    phaseEndsAt: null,
    lit: LIT,
    tiles,
    players,
    me: { ...ME, id: 'heiko', claimsLeft: s.claimsLeft },
  };
}

/**
 * The table chat, already there when the screen shows (history: in the ticker, no bubble). Two lines, because the
 * phone's ticker keeps two and a grant with any talk fills it: that is the 162 to 174 px header the brief measured
 * (with one line the header is 18.5 px shorter, 143.5 and 155.5), so the window is measured at its worst.
 */
export const CHAT: ChatMessage[] = [
  { id: 1, from: 'brix', text: 'Anyone want the swamp?', at: 0 },
  { id: 2, from: 'lena', text: 'The plains up top are mine, hands off', at: 0 },
];

/** The grant's clock: a static mock, so a fixed number of seconds. */
export const SECONDS = 14;
