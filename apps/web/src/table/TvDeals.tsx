import type { DealCard } from '@mule/engine';
import type { MuleView } from '@mule/protocol';

export const brokenIn = (_view: Pick<MuleView, 'politics'>, _month: number): DealCard[] => {
  throw new Error('NotImplemented: brokenIn');
};

export function TvDeals(_props: { game: MuleView }): null {
  throw new Error('NotImplemented: TvDeals');
}
