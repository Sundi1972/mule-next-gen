import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ClientState, TableClient } from './client';

const ClientContext = createContext<TableClient | null>(null);

export function ClientProvider({ client, children }: { client: TableClient; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): TableClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('No TableClient');
  return client;
}

export function useClientState(): ClientState {
  const client = useClient();
  return useSyncExternalStore(client.subscribe, client.getState);
}

/** The server's time, refreshed every `ms`, so timers on every screen count down together. */
export function useServerNow(ms = 250): number {
  const client = useClient();
  const [now, setNow] = useState(() => client.serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(client.serverNow()), ms);
    return () => clearInterval(id);
  }, [client, ms]);
  return now;
}
