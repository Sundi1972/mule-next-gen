import type { IntentNoteData } from '../../proposed/IntentNote';

const CLAIM_INTENT = "Claim the plot I want while it's lit";
const WHY_20 =
  'On every phone the rail window, the strip that shows the lit plot, was 20 px: the shell header takes 162 to 174 px and the footer stacked CLAIM (96 px), “I’m ready” (56 px) and WaitingFor (up to 44 px, wrapping) under it, so the plot you were about to claim could not be read.';

/** The land grant's compact footer (PM ruling, option 1, on Heiko's placement), one card per change. */
export const GRANT_NOTES = {
  G1: {
    id: 'G1',
    n: 1,
    title: 'CLAIM and Ready side by side',
    what: 'One 56 px row: CLAIM on the left, 3/5 of the row; “I’m ready” on the right as the narrower outline button. Once pressed, “You’re done with land” stands in Ready’s place, in the same box, so nothing moves.',
    serves: '1',
    intent: CLAIM_INTENT,
    why: `${WHY_20} Stacked, the two buttons cost 160 px of the rail's height; side by side they cost 56.`,
  },
  G2: {
    id: 'G2',
    n: 2,
    title: 'CLAIM stays the big one',
    what: 'CLAIM keeps its glow, its “N OF 2 CLAIMS LEFT” line and its “Done” at none left; it goes from 96 px to 56 px tall and stays more than half the rail wide (119 of 232 px on a 667 phone, 137 of 262 on an 844), well above a thumb’s 44 px.',
    serves: '1',
    intent: CLAIM_INTENT,
    why: 'Plots light one by one, so CLAIM is timed: it must stay the easiest thing on the screen to slam. 96 px tall was more than a thumb needs and was paid for with the lit plot itself.',
    open: 'the brief says “N OF 3”, but the engine’s config gives 2 claims a grant (GAME.claimsPerGrant), so this line says what the product would today. Is 3 a planned change to config.ts?',
  },
  G3: {
    id: 'G3',
    n: 3,
    title: 'Waiting for, on one line',
    what: 'Who is still choosing, each with their creature, on one line that never wraps: shorter names first and whole, the last one truncating (“The Good Neigh…”), any more as “+N”. With nobody left to wait for, the line is not drawn.',
    serves: '1',
    intent: CLAIM_INTENT,
    why: `${WHY_20} WaitingFor wraps to two lines on a 232 px rail as soon as an AI with a long name is still choosing.`,
  },
  G4: {
    id: 'G4',
    n: 4,
    title: 'The lit plot has room again',
    what: 'The rail window, with “Lit now”, the terrain and its ground card, grows from 20 px to 122 px at 667 × 375 and 117 px at 844 × 390 (measured with two chat lines in the ticker; 142 and 137 once nobody else is choosing), without touching the shell header or the table chat.',
    serves: '1',
    intent: CLAIM_INTENT,
    why: 'Deciding to claim is reading this strip: terrain, special field, what the drone found underground. At 20 px it showed half a line.',
    elsewhere: 'from 1100 px (the laptop) the footer stays as it is today: the rail there is 900 px tall.',
  },
} satisfies Record<string, IntentNoteData>;
