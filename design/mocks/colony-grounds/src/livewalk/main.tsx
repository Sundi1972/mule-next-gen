import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveWalk } from './LiveWalk';
import '../mock.css';
import './livewalk.css';

createRoot(document.getElementById('root')!).render(<StrictMode><LiveWalk /></StrictMode>);
