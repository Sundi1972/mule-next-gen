import { useState, type ReactNode } from 'react';
import { ThemeToggle } from '../../../../../../apps/web/src/components/ThemeToggle';
import { LaptopFrame } from '../../harness';
import { IntentNotes, IntentNotesProvider } from '../../proposed/IntentNote';
import { LaptopArcade } from './Laptop';
import { ArcadeProvider, type Scenario } from './loop';
import { ARCADE_NOTES } from './notes';
import { PhoneFrame } from '../../harness';
import { PhoneArcade, PhoneLandscape, PortraitFrame, SmallPhoneFrame } from './Phone';
import type { PhoneSize } from './layout';
import { ScaledFrame, TvArcade, TvKeys } from './Tv';
import { TunablesPanel } from './Tunables';

/**
 * Arcade development, slices 1 to 4, for Heiko to play: hash routes in App.tsx under "For approval" (#arcade-contents and #arcade-*). The
 * bare entry is the contents; every page links back to it.
 */

/** The contents page's route: every arcade page links back to it. */
export const ARCADE_CONTENTS = 'arcade-contents';

export const ARCADE_ROUTES: { id: string; title: string; shows: string; controls: string }[] = [
  {
    id: 'arcade',
    title: 'The table: your phone and the TV, one sim',
    shows: 'Your phone (sideways, the whole map) beside the TV, both drawn from the same world: steer on the phone and watch the TV follow. Tunables and notes below.',
    controls: 'Drag the joystick or use the arrow keys; the button or SPACE acts.',
  },
  {
    id: 'arcade-computer',
    title: 'The computer (1440 × 900)',
    shows: 'Development on a laptop: where you are fills the stage (the map, or the store’s hall), the action button in the rail. Tunables beside it.',
    controls: 'Arrow keys walk, SPACE acts; or hold the mouse on a spot to walk there and click the glowing thing to act.',
  },
  {
    id: 'arcade-phone',
    title: 'The phone alone: landscape, the whole map, controls over it',
    shows: 'The phone by itself, held sideways (844 × 390, or the small phone’s 667 × 375 with the switch above it), with no TV: the whole map fills the screen, your next step ringed and named, the joystick and the button lying over the map’s bottom corners. Inside the store, the whole hall.',
    controls: 'Drag the joystick (left thumb), press the button (right thumb); arrow keys and SPACE work too.',
  },
  {
    id: 'arcade-phone-portrait',
    title: 'Earlier: portrait follow camera',
    shows: 'Kept for comparison only: the upright phone whose camera followed you at 5 plots across. Heiko: “if there is no tv i would have no clue where my tile is”.',
    controls: 'As the landscape phone.',
  },
  {
    id: 'arcade-wolves',
    title: 'Wolves: meet them in seconds',
    shows: 'Slice 2. Your phone and the TV, with Lena on forest and a pack due in about 2 s. Run, or fight: dodge the red ring, strike when a wolf stands open. Play again to meet them again.',
    controls: 'RUN: push the stick (or an arrow key). FIGHT: the button (or SPACE); in the fight, the stick dodges and the button strikes.',
  },
  {
    id: 'arcade-glint',
    title: 'The glint race: first there wins',
    shows: 'Slice 3. Your phone and the TV. In about 2 s a Crystite glint lights 5 tiles east of Lena, with Ossa as far on its other side. Get there first. Play again to race again.',
    controls: 'Walk with the stick or the arrow keys; one step away the button (or SPACE) reads GRAB THE GLINT and grabs it.',
  },
  {
    id: 'arcade-scramble',
    title: 'The corral scramble: the last MULEs',
    shows: 'Slice 4. Your phone and the TV. Three MULEs in the corral for four colonists: the first sale starts the race for the last two. Lena starts about as far from the store as the nearest bot.',
    controls: 'Walk to the store and into the corral with the stick or the arrow keys; the button (or SPACE) reads BUY MULE there.',
  },
  {
    id: 'arcade-plots',
    title: 'Addendum · your plots while you choose (V-2)',
    shows: 'In the store with an empty MULE in front of the outfitters: the side room lists your plots and what each suits; under each outfitter, your plots that suit its good. Outfit it, and the ring takes it to the best free plot for that good: for Energy, Plains 4·1, though Lake 4·4 is nearer.',
    controls: 'Walk into an outfitter and press the button; then follow the ring.',
  },
  {
    id: 'arcade-analyse',
    title: 'Addendum · analyse before you install (V-3)',
    shows: 'On Plains 4·1 with an Energy MULE, not yet analysed. The button says INSTALL; the line above it, ANALYSE · 8 s. Analyse, and the card names every good: best for Water, and your MULE makes Energy.',
    controls: 'The line above the button (or A) analyses; the button (or SPACE) installs.',
  },
  {
    id: 'arcade-reoutfit',
    title: 'Addendum · take a MULE off, re-outfit it (AM-2) · the filter (V-5)',
    shows: 'On Tundra 3·4, where your Energy MULE stands though the plot is best for Water. The button: TAKE MULE; the line above it: FIT FILTER, dimmed, and the card says where its Alloy comes from. Take it, re-outfit it for Food at the store, and the ring takes it to the best free plot for Food.',
    controls: 'The button (or SPACE) takes the MULE; walk it to the store; the button re-outfits it at another outfitter.',
  },
  {
    id: 'arcade-pace',
    title: 'Addendum · your pace, and why (V-6)',
    shows: 'Lena ate 1 of the 3 Food she needs: the side room says “Your pace 47%: you ate 1 of the 3 Food you need”; a tap on it says what to do next month.',
    controls: 'Tap (or click) your pace line; walk as usual.',
  },
  {
    id: 'arcade-broke',
    title: 'Addendum · never sent where you cannot go (V-7)',
    shows: 'In the corral with 66 cr: BUY MULE · costs 139 cr · you have 66, dimmed. The ring goes to the pub and the door out; outside, to a plot you can analyse. The banner box says why.',
    controls: 'Walk out and analyse a plot, or end at the pub.',
  },
  {
    id: 'arcade-tv',
    title: 'The TV alone (1280 × 720)',
    shows: 'The big screen at its design size: every colonist walking live, named, the hall beside it, each one’s pace. Lena is on autopilot here.',
    controls: 'Watch; or untick “Lena on autopilot”, click the TV and steer her with the arrow keys and SPACE.',
  },
];

const ADDENDUM_ROUTES = ['arcade-plots', 'arcade-analyse', 'arcade-reoutfit', 'arcade-pace', 'arcade-broke'];

/** The addendum: five of the development audit's approved changes, and Heiko's AM-2, in the arcade's language. */
const ADDENDUM = [
  { id: 'V-2', route: 'arcade-plots', line: 'your plots, and what each suits, while you choose an outfit; the ring takes the MULE to the best free plot for its good.' },
  { id: 'V-3', route: 'arcade-analyse', line: 'on your plot with a MULE: INSTALL, or ANALYSE · 8 s on the line above the button; the card names every good, what is best here, and a mismatch.' },
  { id: 'V-5', route: 'arcade-reoutfit', line: 'FIT FILTER, dimmed, says where its Alloy comes from (on the re-outfit route, the same plot).' },
  { id: 'V-6', route: 'arcade-pace', line: 'your pace, and why, in the side room; a tap says what to do next month.' },
  { id: 'V-7', route: 'arcade-broke', line: 'with 66 cr the corral is not ringed; the ring and the banner box say what you can do instead.' },
  { id: 'AM-2', route: 'arcade-reoutfit', line: 'TAKE MULE off your plot, RE-OUTFIT it at another outfitter, and the ring brings it to the best free plot.' },
  { id: 'AM-9', route: 'arcade-plots', line: 'every outfit opens in the hall (six shopfronts, the works’ three bays, the Green belt); leading a MULE onto your plot that has one: SWAP, the old one runs away; on your plot ANALYSE, then FIT FILTER, then TAKE MULE.' },
];

/** The four slices, one line each. */
const SLICES = [
  { title: 'Steering, the store and terrain', route: 'arcade', line: 'you steer your colonist live, store → corral → outfitter → your plot → install → pub, with no menus; the land, hunger and sickness set your speed.' },
  { title: 'Wolves', route: 'arcade-wolves', line: 'on forest, hills or tundra a pack may come: run (they chase; caught, you are slowed) or fight (dodge, strike; win pelts, or lose your MULE till you catch it).' },
  { title: 'The glint race', route: 'arcade-glint', line: 'a Crystite sparkle lights a tile for about 8 s on every screen; the first colonist there wins it.' },
  { title: 'The corral scramble', route: 'arcade-scramble', line: 'when the corral is down to its last MULEs, everyone who still needs one races for them; first there, first served.' },
];

const DECISIONS = [
  'You steer your colonist live: continuous movement in tiles a second, diagonals normalised, every colonist at once. No grid steps, no tap-to-walk.',
  'One action button, never a menu: its words say what it does right now (ENTER STORE, BUY MULE · 139 cr, OUTFIT · FOOD 25 cr, LEAVE, INSTALL · FOOD, PUB · END TURN), dim with where to go when nothing is in reach.',
  'Speed = map speed × the land underfoot × the engine’s condition pace (hunger linear in the Food held × sickness × the Zipwing’s perk). Mountains and swamp slow; lakes and the edge stop you; the store is solid but for its two doors.',
  'The MULE follows you on a lead, along your path and through the door after you.',
  'The phone is held sideways and shows the whole map (or the whole hall once you walk in through a door), the joystick and the button lying over it; your next step is ringed, so the phone alone shows where to go. The TV shows both, everyone at once.',
  'Bots are simple: store → corral → their outfitter → their own plot → install → pub, by the same rules.',
  'Slice 2, wolves: on forest, hills or tundra a pack may come (a seeded event on the world). The button says FIGHT or RUN; run and they chase (caught: bitten and slowed till the store or your plot); fight for about 10 s with the same two controls (win pelts the store buys; lose and your MULE bolts till you catch it).',
  'Slice 3, the glint race: now and then a Crystite sparkle lights a tile for about 8 s on every screen; the first colonist there wins (1 Crystite by default, or credits). Every phone shows it on its map; the TV says who won. Bots race by a share, if it is near enough.',
  'Heiko’s six answers from slice 1 are switches, first in the tunables as “Heiko’s questions”: none needs a rebuild.',
  'Slice 4, the corral scramble: when a sale leaves the corral with its last MULEs (2), every screen calls “2 MULEs left! Race to the corral”. Buying is the usual BUY MULE; each sale is told, then who is left without one this turn (nothing worse: the pub pays for the time left).',
];

function Page({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-full bg-table p-4 text-ink sm:p-8">
      <span className="flex items-center gap-4 font-mono text-xs">
        <a href={`#${ARCADE_CONTENTS}`} className="text-holo underline" data-testid="back">
          ← arcade contents
        </a>
        <a href="/" className="text-ink-3 underline" data-testid="back-index">
          all mocks
        </a>
        <ThemeToggle className="ml-auto" />
      </span>
      <h1 className="mb-2 mt-2 font-display text-2xl font-semibold">{title}</h1>
      {intro && <p className="mb-4 max-w-4xl text-sm text-ink-2">{intro}</p>}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

const Notes = ({ className }: { className?: string }) => (
  <IntentNotes
    title="What changed and why"
    intro="Seventeen changes from today’s tap-to-walk development, numbered on the screens (⑦ slice 2’s wolves, ⑧ slice 3’s glint, ⑨ slice 4’s scramble, ⑩ the landscape phone, ⑪ to ⑯ the addendum from the development audit, ⑰ every outfit and the swap). Hover a note to light its number."
    notes={ARCADE_NOTES}
    {...(className ? { className } : {})}
  />
);

function Contents() {
  return (
    <div className="min-h-full bg-table p-4 text-ink sm:p-8" data-testid="arcade-contents">
      <span className="flex items-center gap-4 font-mono text-xs">
        <a href="/" className="text-ink-3 underline">
          all mocks
        </a>
        <ThemeToggle className="ml-auto" />
      </span>
      <h1 className="mt-2 font-display text-3xl font-semibold">Arcade development · slices 1 to 4</h1>
      <p className="mt-1 max-w-4xl text-ink-2">
        Steer your colonist yourself, live, everyone at once: walk to the store and in through its door, buy a MULE at the corral, walk into an outfitter to fit it, lead it out to one of your plots and install it, then end your turn in the pub. Play it; that play is the gate.
      </p>
      <h2 className="label-caps mt-6">The four slices</h2>
      <ol className="mt-2 flex max-w-4xl list-decimal flex-col gap-1 pl-5 text-sm text-ink-2" data-testid="slices">
        {SLICES.map((sl) => (
          <li key={sl.title}>
            <a href={`#${sl.route}`} className="font-semibold text-holo underline">
              {sl.title}
            </a>
            : {sl.line}
          </li>
        ))}
      </ol>
      <h2 className="label-caps mt-6">Addendum · from the development audit (PM ruling, 29 Oct)</h2>
      <ul className="mt-2 flex max-w-4xl flex-col gap-1 text-sm text-ink-2" data-testid="addendum">
        {ADDENDUM.map((a) => (
          <li key={a.id}>
            <a href={`#${a.route}`} className="font-semibold text-holo underline">
              {a.id} · #{a.route}
            </a>
            : {a.line}
          </li>
        ))}
        <li>Every phone route also plays at the small phone’s 667 × 375: the switch above the phone.</li>
      </ul>
      <h2 className="label-caps mt-6">Key decisions</h2>
      <ul className="mt-2 flex max-w-4xl list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h2 className="label-caps mt-6">The phone: landscape, the whole map (Heiko, 29 Oct), and the earlier portrait camera</h2>
      <div className="mt-2 grid max-w-4xl gap-4 sm:grid-cols-2" data-testid="variants">
        {ARCADE_ROUTES.filter((r) => r.id.startsWith('arcade-phone')).map((r) => (
          <a key={r.id} href={`#${r.id}`} className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-4 hover:border-holo" data-testid={`variant-${r.id}`}>
            <span className="font-display text-lg font-semibold">{r.title}</span>
            <span className="text-sm text-ink-2">{r.shows}</span>
          </a>
        ))}
      </div>
      <h2 className="label-caps mt-6">Every route</h2>
      <ul className="mt-2 flex max-w-4xl flex-col gap-2">
        {ARCADE_ROUTES.map((r) => (
          <li key={r.id} className="flex flex-col gap-0.5 rounded-control border border-holo-faint p-3">
            <a href={`#${r.id}`} className="font-display font-semibold text-holo underline" data-testid={`route-${r.id}`}>
              #{r.id} · {r.title}
            </a>
            <span className="text-sm text-ink-2">{r.shows}</span>
            <span className="text-sm">
              <span className="label-caps mr-2">Controls</span>
              {r.controls}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The phone's size, 844 × 390 or the small phone's 667 × 375: a switch on the page, and ?phone=667 in the URL. */
function initialSize(): PhoneSize {
  return new URLSearchParams(location.search).get('phone') === '667' ? 667 : 844;
}

function ThePhone() {
  const [size, setSize] = useState<PhoneSize>(initialSize);
  const pick = (s: PhoneSize) => {
    setSize(s);
    const u = new URL(location.href);
    if (s === 667) u.searchParams.set('phone', '667');
    else u.searchParams.delete('phone');
    history.replaceState(null, '', u);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 font-mono text-xs" role="radiogroup" aria-label="Phone size" data-testid="phone-size">
        {([844, 667] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => pick(s)} className={size === s ? 'rounded-chip bg-holo px-2 py-0.5 text-on-holo' : 'rounded-chip border border-holo-line px-2 py-0.5 text-ink-2'} data-testid={`phone-size-${s}`}>
            {s === 844 ? '844 × 390' : '667 × 375 (small phone)'}
          </button>
        ))}
      </span>
      {size === 844 ? (
        <PhoneFrame>
          <PhoneLandscape size={844} />
        </PhoneFrame>
      ) : (
        <SmallPhoneFrame>
          <PhoneLandscape size={667} />
        </SmallPhoneFrame>
      )}
    </div>
  );
}

/** The TV beside the sideways phone: 512 × 288, so both fit a 1440 px laptop window side by side. */
const TV_BESIDE = 0.4;

/** The table view: the phone and the TV side by side, driven by one sim. */
function Table() {
  return (
    <Page title="The table: your phone and the TV" intro="One sim drives both frames: steer on the phone (or with the arrow keys once you click it) and the TV follows. The bots walk the same loop by the same rules.">
      <div className="flex flex-wrap items-start gap-4">
        <ThePhone />
        <ScaledFrame width={1280} height={720} scale={TV_BESIDE} testid="tv-frame">
          <TvArcade />
        </ScaledFrame>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <TunablesPanel />
        <Notes />
      </div>
    </Page>
  );
}

/** Slice 2 in seconds: the table view, Lena on forest, a pack due in about 2 s. */
function Wolves() {
  return (
    <Page
      title="Wolves: run or fight"
      intro="Lena starts on forest and a pack comes in about 2 s. Push the stick (or an arrow key) to RUN; press the button (or SPACE) to FIGHT. In the fight, step off the red ring when a wolf crouches, then STRIKE while it stands open. “Play again” meets them again; “Call the wolves now” calls another pack wherever she is."
    >
      <div className="flex flex-wrap items-start gap-4">
        <ThePhone />
        <ScaledFrame width={1280} height={720} scale={TV_BESIDE} testid="tv-frame">
          <TvArcade />
        </ScaledFrame>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <TunablesPanel />
        <Notes />
      </div>
    </Page>
  );
}

/** Slice 3 in seconds: the table view, a glint lit in about 2 s, Lena and Ossa as far from it on either side. */
function GlintRace() {
  return (
    <Page
      title="The glint race"
      intro="In about 2 s a Crystite glint lights 5 tiles east of Lena, on her phone’s map. Ossa is as far on its other side. Walk onto it first; one step away the button reads GRAB THE GLINT. “Play again” races again; “Call a glint now” lights another anywhere."
    >
      <div className="flex flex-wrap items-start gap-4">
        <ThePhone />
        <ScaledFrame width={1280} height={720} scale={TV_BESIDE} testid="tv-frame">
          <TvArcade />
        </ScaledFrame>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <TunablesPanel />
        <Notes />
      </div>
    </Page>
  );
}

/** Slice 4 in seconds: three MULEs for four colonists, so the first sale starts the race for the last two. */
function ScrambleRace() {
  return (
    <Page
      title="The corral scramble"
      intro="Three MULEs in the corral and four colonists who need one: the first sale starts the race for the last two. Walk to the store and into the corral; BUY MULE is the button there. The store is ringed on your phone’s map. “Play again” races again; “Start a scramble now” starts one whenever the corral has MULEs."
    >
      <div className="flex flex-wrap items-start gap-4">
        <ThePhone />
        <ScaledFrame width={1280} height={720} scale={TV_BESIDE} testid="tv-frame">
          <TvArcade />
        </ScaledFrame>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <TunablesPanel />
        <Notes />
      </div>
    </Page>
  );
}

/** The phone by itself, as Heiko judges it: no TV beside it. */
function PhoneRoute() {
  return (
    <Page
      title="The phone alone: landscape, the whole map"
      intro={
        <>
          Held sideways, as a phone always is (Heiko). The whole map, your next step ringed and named, the stick and the button over the map’s bottom corners: find your plot with nothing but the phone.{' '}
          <a href="#arcade-phone-portrait" className="text-holo underline" data-testid="other-variant">
            Earlier: the portrait follow camera →
          </a>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-6">
        <ThePhone />
        <TunablesPanel className="w-full max-w-[26rem]" />
      </div>
      <Notes className="max-w-5xl" />
    </Page>
  );
}

/** Kept for comparison only: the upright phone with the follow camera (variant A before A-10). */
function PortraitRoute() {
  return (
    <Page
      title="Earlier: portrait follow camera"
      intro={
        <>
          Kept only to compare: the phone upright, the camera following you at five plots across. Heiko, after playing it: “if there is no tv i would have no clue where my tile is that i need to walk to.”{' '}
          <a href="#arcade-phone" className="text-holo underline" data-testid="other-variant">
            The landscape phone →
          </a>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-6">
        <PortraitFrame>
          <PhoneArcade variant="follow" />
        </PortraitFrame>
        <TunablesPanel className="w-full max-w-[26rem]" />
      </div>
    </Page>
  );
}

/** The addendum's pages: the phone beside the TV, at the moment each change is about. */
const ADDENDUM_INTRO: Record<string, string> = {
  'arcade-plots': 'Lena is in the store with an empty MULE, in front of the outfitters. The side room lists her plots and what each suits; under each outfitter, chips name her plots that suit its good (dashed: a MULE stands there). Outfit for Energy and walk out: the ring goes to Plains 4·1, the best of her free plots for Energy, not Lake 4·4, the nearest.',
  'arcade-analyse': 'Lena stands on Plains 4·1 with an Energy MULE. The button says INSTALL · ENERGY; the line above it says ANALYSE · 8 s (or press A). Analyse: the clock runs while she stands; then the card names every good, says the plot is best for Water, and that her MULE makes Energy.',
  'arcade-reoutfit': 'Lena stands on Tundra 3·4: her Energy MULE is on it, though the plot reads best for Water. The button says TAKE MULE · ENERGY; the line above it, FIT FILTER · needs 1 Alloy, dimmed, and the card says where Alloy comes from. Take the MULE, lead it to the store: the ring lights the other outfitters (Energy’s dimmed); RE-OUTFIT · FOOD (Water’s outfitter is closed in this mock); then the ring takes it to the best free plot for Food.',
  'arcade-pace': 'Lena ate 1 of the 3 Food she needs, so she walks at 47%. The side room says so in words; tap the line for what to do next month. Everyone’s clock is still one clock.',
  'arcade-broke': 'Lena is in the corral with 66 cr. The button says what a MULE costs and what she has, dimmed; the corral is not ringed. The ring goes to the pub and the door out; outside, to a plot she can analyse; the banner box says why.',
};

function AddendumRoute({ route }: { route: string }) {
  const title = ARCADE_ROUTES.find((r) => r.id === route)!.title;
  return (
    <Page title={title} intro={ADDENDUM_INTRO[route]}>
      <div className="flex flex-wrap items-start gap-4">
        <ThePhone />
        <ScaledFrame width={1280} height={720} scale={TV_BESIDE} testid="tv-frame">
          <TvArcade />
        </ScaledFrame>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <TunablesPanel />
        <Notes />
      </div>
    </Page>
  );
}

function Computer() {
  return (
    <Page title="The computer (1440 × 900)" intro="Arrow keys walk (two at once for a diagonal), SPACE acts. Or the mouse: hold a spot to walk there, click the glowing thing to act. ⌥-click still selects for review.">
      <div className="flex flex-wrap items-start gap-6">
        <LaptopFrame scale={0.75}>
          <LaptopArcade />
        </LaptopFrame>
        <TunablesPanel className="w-full max-w-[24rem]" />
      </div>
      <Notes className="max-w-5xl" />
    </Page>
  );
}

function TvRoute() {
  return (
    <Page title="The TV alone (1280 × 720)" intro="Every colonist walking live. Lena is on autopilot; untick it, click the TV and steer her with the arrow keys and SPACE.">
      <TvKeys>
        <ScaledFrame width={1280} height={720} scale={1} testid="tv-frame">
          <TvArcade />
        </ScaledFrame>
      </TvKeys>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <TunablesPanel autopilot />
        <Notes />
      </div>
    </Page>
  );
}

export function ArcadePage({ route }: { route: string }) {
  const body =
    route === 'arcade' ? <Table /> : route === 'arcade-computer' ? <Computer /> : route === 'arcade-phone' ? <PhoneRoute /> : route === 'arcade-phone-portrait' ? <PortraitRoute /> : route === 'arcade-tv' ? <TvRoute /> : route === 'arcade-wolves' ? <Wolves /> : route === 'arcade-glint' ? <GlintRace /> : route === 'arcade-scramble' ? <ScrambleRace /> : ADDENDUM_ROUTES.includes(route) ? <AddendumRoute route={route} /> : <Contents />;
  const isGame = ARCADE_ROUTES.some((r) => r.id === route);
  return (
    <IntentNotesProvider>
      {isGame ? (
        // A fresh sim per route: the key restarts it when the hash changes.
        <ArcadeProvider key={route} autopilot={route === 'arcade-tv'} scenario={route === 'arcade-wolves' ? 'wolves' : route === 'arcade-glint' ? 'glint' : route === 'arcade-scramble' ? 'scramble' : ADDENDUM_ROUTES.includes(route) ? (route.replace('arcade-', '') as Scenario) : 'table'}>
          {body}
        </ArcadeProvider>
      ) : (
        body
      )}
    </IntentNotesProvider>
  );
}
