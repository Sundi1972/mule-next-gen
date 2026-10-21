import { StoreInterior as UiStoreInterior, type Good, type Shop as UiShop, type Slot } from '@mule/ui';
import { FACTORIES } from './factory';

export { FoodTime } from '@mule/ui';

/** The prototype's store has no green belt. */
export type Shop = Exclude<UiShop, 'greenBelt'>;

export const OUTFITS: { good: Good; cost: number }[] = [
  { good: 'food', cost: 25 },
  { good: 'water', cost: 25 },
  { good: 'energy', cost: 50 },
  { good: 'smithore', cost: 75 },
  { good: 'crystite', cost: 100 },
  { good: 'rareEarth', cost: 100 },
];

/** The prototype's made-up prices for every outfit and factory fit. */
const PRICES = Object.fromEntries([...OUTFITS, ...FACTORIES].map((o) => [o.good, o.cost])) as Partial<Record<UiShop, number>>;

/** The design system's store, with the prototype's prices. */
export function StoreInterior(props: { mules: number; mulePrice: number; pubPayout: number; visitors?: Partial<Record<Shop, Slot[]>>; open?: Shop[]; onShop?(shop: Shop): void; tv?: boolean }) {
  const { onShop, ...rest } = props;
  return <UiStoreInterior {...rest} prices={PRICES} {...(onShop ? { onShop: (s: UiShop) => s !== 'greenBelt' && onShop(s) } : {})} />;
}
