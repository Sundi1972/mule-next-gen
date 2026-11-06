import type { Light, PlaceState } from './pick';

export interface GlowInput {
  light: Light;
  stage: PlaceState['stage'];
  wealth: number;
}

export interface WalkersInput {
  happiness: number;
  standing: number;
  strike: boolean;
}

export function glowOpacity(_input: GlowInput): number {
  throw new Error('NotImplemented: glow-opacity');
}

export function walkersOut(_input: WalkersInput): number {
  throw new Error('NotImplemented: walkers-out');
}
