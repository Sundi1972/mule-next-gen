import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionPage } from './MotionPage';
import './motion.css';
// The browser half of the review loop, as the workspace's own entry has it: without it nothing is selectable.
import '../../../review-loop/select-client';

/** Characters in motion: its own entry page (motion.html), beside the workspace's index.html. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionPage />
  </StrictMode>,
);
