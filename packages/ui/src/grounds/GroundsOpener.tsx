/** The month-end grounds opener on the TV (spec C5, RULE-6). */
import type { ComponentType } from 'react';
import type { ColonyGroundsProps, GroundsColony } from './ColonyGrounds';
import type { Opener } from './opener';
import type { GroundsChange } from './useGroundsChange';

export interface OpenerState extends Opener {
  changes: GroundsChange[];
  playing: boolean;
}

export function GroundsOpener(_props: { opener: OpenerState; colony: GroundsColony; month: number; Scene: ComponentType<Omit<ColonyGroundsProps, 'manifest'>> }): never {
  throw new Error('NotImplemented: GroundsOpener');
}
