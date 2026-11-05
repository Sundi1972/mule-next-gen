/**
 * A pass-through. The precedent's vite.config.ts (ws8-desks, copied exactly) serves the app's phone/hub/ready.ts from
 * this file; this mock needs no seam there, so it re-exports the real module. The `.js` suffix keeps the seam from
 * redirecting this import back to itself; Vite and tsc both resolve it to ready.ts.
 */
export * from '../../../../../apps/web/src/phone/hub/ready.js';
