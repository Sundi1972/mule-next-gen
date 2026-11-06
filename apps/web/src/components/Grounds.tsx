/** The colony grounds as the screens mount them, with the art manifest fetched once for the whole app. */
import { type ColonyGroundsProps, type GroundsManifest } from '@mule/ui';

export function loadGroundsManifest(): Promise<GroundsManifest | null> {
  throw new Error('NotImplemented: load-grounds-manifest');
}

export function Grounds(_props: Omit<ColonyGroundsProps, 'manifest'>): never {
  throw new Error('NotImplemented: grounds');
}
