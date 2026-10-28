import type { IntentNoteData } from '../../proposed/IntentNote';

/**
 * The changes, each with the goal it serves (Heiko's, via the PM) and why it changed. For A-1 to A-6 the "why" is the
 * same finding: today's tap-to-walk, and Heiko's verdict on it. A-7 is slice 2's, A-8 slice 3's, A-9 slice 4's, A-10 the landscape phone (Heiko, 29 Oct).
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
    'When a sale leaves the corral with its last MULEs (2 by default), every screen calls it: “2 MULEs left! Race to the corral”. The TV lights the corral with its count and draws a line from everyone who still needs a MULE; each phone shows a banner over its whole map; inside, the corral pulses. Buying is the usual BUY MULE: first there, first served. Each sale is told (“Kai got one: 1 left”), then “The corral is empty” and who has none this turn: nothing worse than that, and the pub pays for the time left. Bots who need one race too, if near enough to care.',
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
  ),
];

export const NOTE = Object.fromEntries(ARCADE_NOTES.map((x) => [x.id, x])) as Record<'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10', IntentNoteData>;
