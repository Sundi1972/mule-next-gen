import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GrantPage } from './GrantPage';
import './grant.css';
// The browser half of the review loop, as the workspace's own entry has it: without it nothing is selectable.
import '../../../review-loop/select-client';

/** The land grant's own entry page (grant.html), beside the workspace's index.html, so App.tsx stays untouched. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GrantPage />
  </StrictMode>,
);
