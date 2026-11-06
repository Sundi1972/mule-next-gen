import { describe, expect, it, vi } from 'vitest';
import { EVENT_ENTRY, eventScript, type MapTile, type ShowEventView, type ShowPlayer } from '../src/index';
import { eventYouSummary } from '../src/events/copy';
import { eventCast } from '../src/events/frame';

// A walkout that leaves 35%: the words must follow config, never restate 20% (PM ruling, WS6 OK on SOCIAL_EVENTS, 6 Nov).
vi.mock('@mule/engine', async (actual) => {
  const engine = await actual<typeof import('@mule/engine')>();
  const player = engine.SOCIAL_EVENTS.player;
  return { ...engine, SOCIAL_EVENTS: { ...engine.SOCIAL_EVENTS, player: { ...player, walkout: { ...player.walkout, output: 0.35 } } } };
});

const players: ShowPlayer[] = [{ id: 'brix', name: 'Brix', slot: 2 }];
const tiles: MapTile[] = [{ x: 2, y: 3, terrain: 'plains', owner: 2, good: 'food' }];
const WALKOUT: ShowEventView = {
  key: 'walkout',
  kind: 'colony',
  title: 'Walkout',
  line: 'Your plots of one good make 35% this month.',
  sign: 'bad',
  scope: 'personal',
  player: 'brix',
  origin: { x: 2, y: 3 },
  hits: [{ x: 2, y: 3, order: 0, delta: -3 }],
  phase: 'production',
  weight: 'spotlight',
  playMs: 3000,
};

describe('WALKOUT-SHARE: the walkout words its share from SOCIAL_EVENTS.player.walkout.output', () => {
  it('WALKOUT-SHARE-1: the struck player’s phone says what share their plots make', () => {
    const seg = eventScript({ events: [WALKOUT], introMs: 0 }, 0, 'solo').segments[0]!;
    const you = eventYouSummary(seg, 'brix', eventCast(tiles, players));
    expect(you?.detail).toBe('Your workers walked out: your plots of that good make 35% this month.');
  });

  it('WALKOUT-SHARE-2: the catalogue’s look gives the same share', () => {
    expect(EVENT_ENTRY.walkout.look).toBe('The player’s plots of one good are struck in turn, each down to 35%.');
  });
});
