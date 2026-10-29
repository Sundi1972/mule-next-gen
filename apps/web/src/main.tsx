import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionBar, Toasts } from './components/Toasts';
import { initTheme } from './components/ThemeToggle';
import { socketUrl, TableClient, type SocketLike } from './net/client';
import { ClientProvider } from './net/react';
import { browserStore } from './net/seat';
import { PhoneApp } from './phone/PhoneApp';
import { TableApp } from './table/TableApp';
import './index.css';

initTheme();

const client = new TableClient({
  url: socketUrl(window.location),
  // The browser's WebSocket has the shape the client needs; its handlers just take a narrower event type.
  socket: (url) => new WebSocket(url) as unknown as SocketLike,
  storage: browserStore(),
});

const params = new URLSearchParams(window.location.search);
const room = (params.get('room') ?? '').trim().toUpperCase();
const isTable = window.location.pathname.replace(/\/+$/, '') === '/table';
// A handoff code works once: off the address bar before anything renders, so it is never bookmarked, shared or reloaded.
const handoff = params.get('handoff') ?? '';
if (params.has('handoff')) {
  params.delete('handoff');
  const search = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
}
if (handoff && room && !isTable) client.join(room, '', handoff);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientProvider client={client}>
      {isTable ? <TableApp room={room} /> : <PhoneApp room={room} moving={Boolean(handoff && room)} />}
      <Toasts />
      <ConnectionBar />
    </ClientProvider>
  </StrictMode>,
);
