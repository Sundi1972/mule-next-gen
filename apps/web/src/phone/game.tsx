import type { MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { createContext, useContext, type ReactNode } from 'react';
import type { Slot } from '@mule/ui';

export interface PhoneGame {
  table: TableView<MuleView>;
  view: MuleView;
  me: MyView;
  /** This player's public row: name, money, plots. */
  self: PlayerView;
  slot: Slot;
}

const Ctx = createContext<PhoneGame | null>(null);

export function PhoneGameProvider({ value, children }: { value: PhoneGame; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The game as this phone sees it. Only used under a running game with a seat. */
export function usePhoneGame(): PhoneGame {
  const g = useContext(Ctx);
  if (!g) throw new Error('No phone game');
  return g;
}
