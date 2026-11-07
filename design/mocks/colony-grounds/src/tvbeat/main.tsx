import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TvBeat } from './TvBeat';
import '../mock.css';
import '../../review-loop/select-client';

createRoot(document.getElementById('root')!).render(<StrictMode><TvBeat /></StrictMode>);
