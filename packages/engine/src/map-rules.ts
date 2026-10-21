import type { RawGood, Terrain, Tile } from './types.js';

export interface MapReport {
  violations: { rule: string; detail: string }[];
  metrics: {
    perPlayer: Record<RawGood, number>;
    shares: Record<Terrain, number>;
    biggestRegion: number;
    bends: number;
    seamShare: number;
    peaks: Record<'crystite' | 'rareEarth', number>;
    worstReach: Record<'food' | 'water' | 'energy' | 'smithore', number>;
    scarce: RawGood | null;
    specials: number;
  };
}

export function checkMap(map: { width: number; height: number; tiles: Tile[] }, players: number): MapReport {
  throw new Error('NotImplemented: checkMap');
}
