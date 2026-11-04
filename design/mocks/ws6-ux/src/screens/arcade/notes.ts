import type { IntentNoteData } from '../../proposed/IntentNote';

/**
 * The changes, each with the goal it serves (Heiko's, via the PM) and why it changed. For A-1 to A-6 the "why" is the
 * same finding: today's tap-to-walk, and Heiko's verdict on it. A-7 is slice 2's, A-8 slice 3's, A-9 slice 4's, A-10 the landscape phone (Heiko, 29 Oct); A-11 to A-16 the addendum from the development audit (PM, 29 Oct).
 */

const VERDICT = 'Heiko’s playtest verdict on it: “this is not at all what i wanted… i can really walk my character… like in an arcade game”.';
const TODAY = 'Today a colonist walks by tapping a plot: grid steps, 0.4 s a tile (DEV_WALK), never steered.';

const n = (id: string, k: number, title: string, what: string, intent: string, why: string, extra: Partial<IntentNoteData> = {}): IntentNoteData => ({ id, n: k, title, what, serves: id === 'A3' ? 'G-2' : id === 'A7' || id === 'A8' || id === 'A9' ? 'G-3' : 'G-1', intent, why, ...extra });

export const ARCADE_NOTES: IntentNoteData[] = [
  n(
    'A1',
    1,
    'Steer yourself',
    'Your colonist goes where you push, live and continuously: arrow keys or the mouse (hold a spot) on a computer, a thumb joystick on a phone. Diagonals are allowed and no faster. Every colonist moves at the same time.',
    'You steer your own colonist; every colonist moves at the same time.',
    `${TODAY} ${VERDICT}`,
  ),
  n(
    'A2',
    2,
    'One button that says what it does',
    'One action button (SPACE on a computer). Its words always say what it will do right now: ENTER STORE, BUY MULE · 139 cr, OUTFIT · FOOD 25 cr, LEAVE, INSTALL · FOOD, PUB · END TURN. Dim when nothing is in reach, and then it says where to go. The thing it acts on glows; a click on it acts too. Never a menu.',
    'Arrow keys and space for clicking, alternative the mouse … The loop, with NO menus.',
    `${TODAY} Acting was a tap on a room or a plot, then a button in a rail. ${VERDICT}`,
  ),
  n(
    'A3',
    3,
    'Terrain you can feel',
    'Speed is tiles a second × the land underfoot × your condition pace. Mountains 40%, swamp 50%, river 60%, plains full; lakes and the map’s edge stop you, and the store is solid except its two doors. A chip under the clock names the land and its speed.',
    'Terrain slows you. Mountains and swamp are slower, plains normal … multiply in today’s hunger and sickness pace.',
    `${TODAY} Every tile cost the same, so the land had no say. ${VERDICT}`,
    { open: 'Mountains slower (as here) or impassable? Set Mountains to 0 in the tunables to try impassable.' },
  ),
  n(
    'A4',
    4,
    'The MULE on a lead',
    'The MULE you buy walks behind you on a lead, along the path you took, through the store door after you, and stays empty until you walk into an outfitter and press OUTFIT. It kneels into the plot when you INSTALL.',
    'Walk out of the store door with the MULE following on a lead.',
    `${TODAY} The MULE travelled with the colonist as a label, so leading it was not something you did. ${VERDICT}`,
    { open: 'Does the MULE slow you? Try “Leading a MULE” below 1 in the tunables.' },
  ),
  n(
    'A5',
    5,
    'The TV shows everyone live',
    'The TV draws the same world as every phone, at 60 steps a second: each colonist walking where its player steers, the bots by the same rules, and inside the store’s hall whoever is shopping.',
    'The TV shows every colonist walking live.',
    `${TODAY} The TV replayed each walk a plot at a time after the tap. ${VERDICT}`,
  ),
  n(
    'A6',
    6,
    'The tunables',
    'Every speed, price and pace is a number you can change while you play, with “reset to defaults”. The later slices’ events (wolves, the glint, the corral scramble) already have a home here, at 0, off.',
    'Every speed is a tunable in a panel Heiko can change while playing.',
    `${TODAY} A speed lived in config.ts and needed a rebuild to try. ${VERDICT}`,
    { differs: 'Slice 2 puts Heiko’s six answers from slice 1 first, as “Heiko’s questions”: each a switch or a number, with the question in plain words above it, so no answer needs a rebuild.' },
  ),
  n(
    'A7',
    7,
    'Wolves: run or fight',
    'On forest, hills or tundra a pack may come for you. The button says FIGHT or RUN: push the stick and you RUN (they chase; caught, you are bitten and slowed till the store or your own plot), or press the button and you FIGHT, about 10 s in place: step off the red ring when a wolf crouches, then STRIKE while it stands open. Win and you carry pelts the store buys; lose and your MULE bolts till you catch it (with no MULE, you are stunned). The TV shows every pack and every fight.',
    'Three arcade moments, 5–15 s each, tunables for every reward and cost: wolves (run or fight), the glint race, the corral scramble.',
    'Development had no moments of its own, only errands: store, corral, outfitter, plot, pub. Heiko wants the turn to have arcade moments in it.',
  ),
  n(
    'A8',
    8,
    'The glint race',
    'Now and then a Crystite sparkle lights one tile for about 8 s, on every phone and the TV at once, with a ring counting down. Your phone shows the whole map, so it is on it (the earlier portrait camera had a pointer at its edge: “GLINT · 5 tiles E · 6 s”); the TV says where and who won. The first colonist to set foot on it wins a small prize (1 Crystite, or credits); one step away the button reads GRAB THE GLINT. Bots race too, by a share, if it is near enough to care. Nobody in time: it fades.',
    'Three arcade moments, 5–15 s each, tunables for every reward and cost: wolves (run or fight), the glint race, the corral scramble.',
    'Development’s only shared moment was the clock: everyone ran their own errands against it, never against each other.',
  ),
  n(
    'A9',
    9,
    'The corral scramble',
    'When a sale leaves the corral with its last MULEs (2 by default), every screen calls it: “2 MULEs left! Race to the corral”. The TV lights the corral with its count and draws a line from everyone who still needs a MULE; each phone shows a banner over its whole map; inside, the corral pulses. Buying is the usual BUY MULE: first there, first served. Each sale is told (“Kai got one: 1 left”), the last as “Brix got the last one: the corral is empty”, then who has none this turn: nothing worse than that, and the pub pays for the time left. Bots who need one race too, if near enough to care.',
    'Three arcade moments, 5–15 s each, tunables for every reward and cost: wolves (run or fight), the glint race, the corral scramble.',
    'Today a sold-out corral is just a greyed counter: nobody sees the last MULEs going, so there is no race for them.',
  ),
  n(
    'A10',
    10,
    'The phone: landscape, the whole map, controls over it',
    'The phone is held sideways and shows the whole map, 43 px a plot, so the store and every one of your plots are always in view. The joystick (left thumb) and the button (right thumb) lie over the map’s bottom corners, translucent, the button’s words on a panel; neither ever covers the store or one of your plots, and each fades to near-clear while you are beside it. Your next step is ringed and named: STORE · CORRAL, then the outfitters inside, YOUR PLOT 4·1, then STORE · PUB. Inside the store the hall fills the screen the same way.',
    'You steer your own colonist, on your phone alone: no TV needed to find your plot.',
    'Heiko, playing the portrait follow camera: “if there is no tv i would have no clue where my tile is that i need to walk to.” Then: “so i guess we will need the card in full on the phone. phone is always landscape btw and the steering control should be laying over the card”.',
  ),  // The addendum (PM ruling 29 Oct): five of the development audit's approved changes (docs/research/2026-10-28-ws6-ux-audit.md
  // §6, the #audit-dev-* mocks), and Heiko's AM-2, drawn in the arcade's language. "Serves" is the audit's intent number.
  n(
    'A11',
    11,
    'Your plots, and what each suits, while you choose (V-2)',
    'In the store with a MULE to outfit, the side room lists your plots, what each suits and what stands on it (“Plains 4·1 · often good for Food and Energy”, “Tundra 3·4 · analysed: best for Water · Energy MULE”), and under each outfitter its chips name your plots that suit its good, dashed where a MULE already stands. Fitted, the ring takes you to the best of your free plots for that good, by its analysis, else its land’s odds, the nearer only on a tie: for Energy, Plains 4·1, though Lake 4·4 is nearer.',
    'Know which of my plots is best for which good.',
    'Audit V-2: nothing named your plots or what they suit while you chose, and the guide sent an Energy MULE to the nearest free plot, not the one that suits it (RULE-9 row 3a said “nearest”).',
    { serves: 'audit 4' },
  ),
  n(
    'A12',
    12,
    'Analyse before you install, in words (V-3)',
    'On your own plot with a fitted MULE the button says INSTALL; the line above it offers ANALYSE · 8 s, a second choice (A on a keyboard). The plot’s card, over the map on the half away from the plot, says what its land is often good for; analysed, it names every good in words and dots, what is best here, and flags a mismatch: “Your MULE makes Energy; this plot is best for Water”. On a plot of yours with nothing on it, ANALYSE is the button itself.',
    'Know which of my plots is best for which good · Check what’s underground, and what it costs in time.',
    'Audit V-3: the readout spoke in codes (H2O, NRG, ORE), and the audit put an Energy MULE where the plot reads Water 3 of 4, finding out only afterwards. A second line rather than a hold or the stick pushed down: a hold hides the choice and costs time on everyone’s clock, the stick already walks, and a line you can read says what it does, like the button.',
    { serves: 'audit 4 and 5' },
  ),
  n(
    'A13',
    13,
    'The filter says where Alloy comes from (V-5)',
    'On your plot with a MULE the line above the button reads FIT FILTER · needs 1 Alloy, dimmed, and the plot’s card says the rest: “Needs 1 Alloy: buy it at the auction, or make it with a factory MULE at the Works”.',
    'Fit a pollution filter.',
    'Audit V-5: “Fit a filter · 1 Alloy (have 0)” never said that Alloy is made by a factory MULE, or bought at the auction.',
    { serves: 'audit 6' },
  ),
  n(
    'A14',
    14,
    'Your pace, and why (V-6)',
    'Everyone’s clock stays one clock; your pace is your own line in the side room: “Your pace 47%: you ate 1 of the 3 Food you need”. A tap opens what to do about it: “Next month: buy 3 Food at the auction, or put a Food MULE on a plot”. On the small phone it is the status bar’s “Pace 47%” and opens the same way.',
    'See how much time I have left, and why I’m slow · Stop being hungry or sick.',
    'Audit V-6: “EVERYONE’S TIME · 47% PACE” read as if everyone were slow; the why was a hover a phone never shows, and nothing said how to eat next month.',
    { serves: 'audit 8 and 9' },
  ),
  n(
    'A15',
    15,
    'The button and the ring never send you where you can’t go (V-7)',
    'With 66 cr in the corral the button reads BUY MULE · costs 139 cr · you have 66, dimmed; the corral is not ringed. The ring goes to what you can do instead: the pub and the door out, and on the map your nearest plot nobody has analysed (ANALYSE · 4·1) beside the store’s pub; the banner box says why in words: “A MULE costs 139 cr; you have 66. Analyse a plot, or end at the pub for ≈109 cr.” (the pub pays less the longer you wait)',
    'Buy a MULE.',
    'Audit V-7: in month 2, with 66 cr, the guide still said to tap the glowing corral.',
    { serves: 'audit 1' },
  ),
  n(
    'A16',
    16,
    'Take a MULE off its plot and re-outfit it (AM-2)',
    'On your own plot with a MULE and none in tow, the button reads TAKE MULE · ENERGY: it follows on its lead, and the plot makes nothing meanwhile. The ring takes you to the store and its other outfitters (its own good’s dimmed: IT MAKES THIS); there RE-OUTFIT · FOOD · 25 cr (Water’s outfitter is closed in this mock); then the ring takes it to the best free plot for its new good, the one it came off if that is best.',
    'Change what a MULE makes, or move it to another plot.',
    'Heiko’s Q2 “yes” (AM-2, via the PM): the audit mock only drew “Or re-outfit it at the store” dashed, as a rule that did not exist; now it is RULE-3 rows 8a and 11a.',
    { serves: 'audit 10' },
  ),
  n(
    'A17',
    17,
    'Every outfit in the store, and the swap (AM-9)',
    'All six shopfronts are open, Water and Rare earth too; the works has three fitting bays, Alloy, Electronics and Medicine, each its own spot, so where you stand picks the good; and the Green belt. Leading a fitted MULE onto a plot of yours that has one, the button says SWAP · your Energy MULE runs away: the new one goes in and the old one runs off, nobody’s to catch. On your own plot the button’s order is ANALYSE (not yet analysed, a MULE on it or not), then FIT FILTER (Alloy held), then TAKE MULE; the next is the line above it.',
    'Choose what each MULE makes · Change what a MULE makes, or move it to another plot.',
    'AM-9 (WS1’s readings, ruled by WS6): today’s game sells every outfit and swaps a MULE in over another; slice 1 kept four outfitters open only as a simplification, and its dimmed “PLOT HAS A MULE” was not a ruling.',
    { serves: 'audit 2 and 10' },
  ),
];

export const NOTE = Object.fromEntries(ARCADE_NOTES.map((x) => [x.id, x])) as Record<'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'A12' | 'A13' | 'A14' | 'A15' | 'A16' | 'A17', IntentNoteData>;
