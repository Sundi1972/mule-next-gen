import { createContext, useContext, useState, type ReactNode } from 'react';
import { useClientState } from '../../net/react';
import { useSellForm } from '../Sell';

type Plot = { x: number; y: number };

/** What today's desks and tools share across the hub: the sell form, the drone's picks, the plot looked at, chat read. */
export interface Today {
  sell: ReturnType<typeof useSellForm>;
  /** Free plots picked for the geo drone, before it is sent. */
  picked: Plot[];
  setPicked(f: (p: Plot[]) => Plot[]): void;
  looked: Plot | null;
  setLooked(p: Plot | null): void;
  /** Chat messages seen at the Talk desk. */
  seenChat: number;
  setSeenChat(n: number): void;
}

const Ctx = createContext<Today | null>(null);

export function TodayState({ children }: { children: ReactNode }) {
  const { chat } = useClientState();
  const sell = useSellForm();
  const [picked, setPicked] = useState<Plot[]>([]);
  const [looked, setLooked] = useState<Plot | null>(null);
  const [seenChat, setSeenChat] = useState(chat.length);
  return <Ctx.Provider value={{ sell, picked, setPicked, looked, setLooked, seenChat, setSeenChat }}>{children}</Ctx.Provider>;
}

export function useToday(): Today {
  const t = useContext(Ctx);
  if (!t) throw new Error('Not inside planning');
  return t;
}
