import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SeatSpeciesProvider, setTheme } from '@mule/ui';
import { App } from './App';
import { SEAT_SPECIES } from './data';
import './index.css';

let saved: string | null = null;
try {
  saved = localStorage.getItem('mule-theme');
} catch {
  // Storage can be blocked; the prototype then starts in day mode.
}
setTheme(saved === 'dark' ? 'dark' : 'light');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SeatSpeciesProvider value={SEAT_SPECIES}>
      <App />
    </SeatSpeciesProvider>
  </StrictMode>,
);
