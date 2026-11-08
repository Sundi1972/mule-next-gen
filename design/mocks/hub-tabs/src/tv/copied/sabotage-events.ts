// Copied from design/mocks/politics-p2/src/show/events.ts on origin/ws8-politics-p2-mock at d6977e1a: the event's types only (the scenarios are WS8's; the TV's events come from the world).
import type { ShowEventView } from '@mule/ui';
export type Sabotage = { order: string; culprit: string | null; worked: boolean; guarded: boolean };
/** WS7's two keys, not yet in trunk's EventKey. */
export type SabotageKey = 'powerCut' | 'marketRumour';
export type SabotageEvent = Omit<ShowEventView, 'key'> & { key: SabotageKey; sabotage: Sabotage; good?: string; dir?: 'up' | 'down' };
