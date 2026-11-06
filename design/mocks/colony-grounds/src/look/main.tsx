import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Look } from './Look';
import '../mock.css';
import '../../review-loop/select-client';

createRoot(document.getElementById('root')!).render(<StrictMode><Look /></StrictMode>);
