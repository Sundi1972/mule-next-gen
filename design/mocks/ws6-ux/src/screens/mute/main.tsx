import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutePage } from './MutePage';
import './mute.css';
// The browser half of the review loop, as the workspace's own entry has it: without it nothing is selectable.
import '../../../review-loop/select-client';

/** Muting an AI's own entry page (mute.html), beside the workspace's index.html, so App.tsx stays untouched. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MutePage />
  </StrictMode>,
);
