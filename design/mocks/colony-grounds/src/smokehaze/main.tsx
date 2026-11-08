import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SmokeHaze } from './SmokeHaze';
import '../mock.css';
import './smokehaze.css';
import '../../review-loop/select-client';

createRoot(document.getElementById('root')!).render(<StrictMode><SmokeHaze /></StrictMode>);
