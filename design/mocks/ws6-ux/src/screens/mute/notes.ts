import type { IntentNoteData } from '../../proposed/IntentNote';

const INTENT = 'Stop an AI’s chatter on my phone without changing the game';

/** Muting an AI (spec B, HC-B2), one card per change. */
export const MUTE_NOTES = {
  M1: {
    id: 'M1',
    n: 1,
    title: 'One tap on the AI’s seat',
    what: 'In the rail’s seat row an AI’s whole seat (its creature, its name and a small talk mark on the creature) is one switch: tap it and that AI is muted on your phone; tap again to unmute. At least 32 × 32 px, in every phase, because the seat row is in every phase’s rail. A human’s seat is not a switch.',
    serves: '1',
    intent: INTENT,
    why: 'The seat row is the only part of the screen every phase draws, and it is already where an AI’s lines pop, so the switch sits on the thing that talks. A separate 32 px chip per AI would not fit five seats on the 232 px rail of a 667 phone; long-press is invisible and slow. The talk mark tells you the seat does something; the tap is undone by the Undo beside its answer, or by tapping again.',
  },
  M2: {
    id: 'M2',
    n: 2,
    title: 'The same switch in its Talk channel',
    what: 'In planning, the AI’s whisper channel on the hub’s Talk desk carries a “Mute” chip at its head, beside “WHISPER · ONLY YOU AND …”. It is the same switch as the seat, not a second setting.',
    serves: '1',
    intent: INTENT,
    why: 'The channel is where you read an AI’s whispers and its card offers, so it is where you decide they are too many. One state behind both controls, so they can never disagree.',
  },
  M3: {
    id: 'M3',
    n: 3,
    title: 'Muted shows wherever it would talk',
    what: 'A slashed talk mark, in the warn colour, on its seat, on its channel pill and, in its channel, one quiet line where its whispers would be: “The Baron is muted · its moves and bids still show · Unmute”. Its seat, its creature and its play are never hidden.',
    serves: '1',
    intent: INTENT,
    why: 'A mute you cannot see is a mute you forget: you would think the AI went quiet. The line says what you are missing (talk) and what you are not (the game), so muting never looks like the AI left.',
  },
  M4: {
    id: 'M4',
    n: 4,
    title: 'Its words leave this phone, its play stays',
    what: 'Muted, the AI’s whispers and public lines are gone from this phone’s ticker and its bubbles, and it sends you no more whispers or card offers. Who is ready, its plots on the map, its bids are unchanged. Unmuted, only what it says next shows: nothing said meanwhile is replayed.',
    serves: '1',
    intent: INTENT,
    why: 'HC-B2: a muted AI sends that player no whispers and no card offers, and its public lines are hidden on that player’s phone; HC-B3: talk never drives an AI action, so a mute cannot change its play. Replaying the missed lines on unmute would flood the two-line ticker with old talk.',
  },
  M5: {
    id: 'M5',
    n: 5,
    title: 'The TV stays the table’s',
    what: 'Default: muting is per phone. The TV keeps every public line, the muted AI’s included, even when the host muted it; other phones are untouched. The alternative (state 4) hides the AI’s public lines on the TV too, when the host mutes it, and marks its seat there.',
    serves: '1',
    intent: INTENT,
    why: 'The TV belongs to the whole table: one player’s mute should not silence an AI for everyone else watching it. The host is a player like the others here; giving the host’s phone power over the shared screen is a separate decision.',
    open: 'When the host mutes an AI, do its public lines also vanish from the TV? Default drawn: no. State 4 draws yes.',
  },
  M6: {
    id: 'M6',
    n: 6,
    title: 'Its card offers stop',
    what: 'A muted AI sends you no new card offers. One already on your phone stays until Ready, so muting never declines a card for you. The card is WS7’s deal card, as the planning mock draws it (a pact, “Accept / No”).',
    serves: '1',
    intent: INTENT,
    why: 'Hiding an open offer would let it expire unanswered, which is a move in the game made by the mute. Spec B has AIs propose WS7’s cards (pacts and vote deals); nothing of value changes hands in a deal (WS7 HC-3), so the card is a pact, not “2 Food for 40 cr”.',
    open: 'Shape to confirm with WS2’s spec B: no AI offer card exists in apps/web or on any ws2 branch yet. And: should an open offer stay when you mute (drawn) or go?',
  },
} satisfies Record<string, IntentNoteData>;
