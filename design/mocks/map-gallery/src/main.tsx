import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setTheme } from '@mule/ui';
import { App } from './App';
import './index.css';

let saved: string | null = null;
try {
  saved = localStorage.getItem('mule-theme');
} catch {
  // Storage can be blocked; the gallery then starts in day mode.
}
setTheme(saved === 'dark' ? 'dark' : 'light');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
