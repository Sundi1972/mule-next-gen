import type { ReactNode } from 'react';
import { ThemeToggle } from '../../../../../../apps/web/src/components/ThemeToggle';
import { LaptopFrame } from '../../harness';
import { IntentNotes, IntentNotesProvider } from '../../proposed/IntentNote';
import { LaptopArcade } from './Laptop';
import { ArcadeProvider } from './loop';
import { ARCADE_NOTES } from './notes';
import { PhoneArcade, PortraitFrame } from './Phone';
import { ScaledFrame, TvArcade, TvKeys } from './Tv';
import { TunablesPanel } from './Tunables';

/**
 * Arcade development, slices 1 to 3, for Heiko to play: hash routes in App.tsx under "For approval" (#arcade-contents and #arcade-*). The
 * bare entry is the contents; every page links back to it.
 */

/** The contents page's route: every arcade page links back to it. */
export const ARCADE_CONTENTS = 'arcade-contents';

export const ARCADE_ROUTES: { id: string; title: string; shows: string; controls: string }[] = [
  {
    id: 'arcade',
    title: 'The table: your phone and the TV, one sim',
    shows: 'Your phone (upright, variant A) beside the TV, both drawn from the same world: steer on the phone and watch the TV follow. Tunables and notes below.',
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
    title: 'Phone, variant A: the camera follows you',
    shows: 'The phone alone, at full size. The map is zoomed to 5 plots across (about 5 × 6 show), centred on you; inside the store, the whole hall.',
    controls: 'Drag the joystick (left thumb), press the button (right thumb); arrow keys and SPACE work too.',
  },
  {
    id: 'arcade-phone-whole',
    title: 'Phone, variant B: the whole map, always',
    shows: 'The same phone, but the stage always shows the whole colony, small, with your colonist ringed.',
    controls: 'As variant A.',
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
    id: 'arcade-tv',
    title: 'The TV alone (1280 × 720)',
    shows: 'The big screen at its design size: every colonist walking live, named, the hall beside it, each one’s pace. Lena is on autopilot here.',
    controls: 'Watch; or untick “Lena on autopilot”, click the TV and steer her with the arrow keys and SPACE.',
  },
];

const DECISIONS = [
  'You steer your colonist live: continuous movement in tiles a second, diagonals normalised, every colonist at once. No grid steps, no tap-to-walk.',
  'One action button, never a menu: its words say what it does right now (ENTER STORE, BUY MULE · 139 cr, OUTFIT · FOOD 25 cr, LEAVE, INSTALL · FOOD, PUB · END TURN), dim with where to go when nothing is in reach.',
  'Speed = map speed × the land underfoot × the engine’s condition pace (hunger linear in the Food held × sickness × the Zipwing’s perk). Mountains and swamp slow; lakes and the edge stop you; the store is solid but for its two doors.',
  'The MULE follows you on a lead, along your path and through the door after you.',
  'The phone shows where you are: the map, or the hall once you walk in through a door. The TV shows both, everyone at once.',
  'Bots are simple: store → corral → their outfitter → their own plot → install → pub, by the same rules.',
  'Slice 2, wolves: on forest, hills or tundra a pack may come (a seeded event on the world). The button says FIGHT or RUN; run and they chase (caught: bitten and slowed till the store or your plot); fight for about 10 s with the same two controls (win pelts the store buys; lose and your MULE bolts till you catch it).',
  'Slice 3, the glint race: now and then a Crystite sparkle lights a tile for about 8 s on every screen; the first colonist there wins (1 Crystite by default, or credits). Off your phone’s camera a pointer at the edge says where; the TV says who won. Bots race by a share, if it is near enough.',
  'Heiko’s six answers from slice 1 are switches, first in the tunables as “Heiko’s questions”: none needs a rebuild.',
  'Slice 4 (the corral scramble) plugs in the same way: its numbers already sit in the tunables at 0.',
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
    intro="Eight changes from today’s tap-to-walk development, numbered on the screens (⑦ is slice 2’s wolves, ⑧ slice 3’s glint). Hover a note to light its number."
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
      <h1 className="mt-2 font-display text-3xl font-semibold">Arcade development · slices 1 to 3</h1>
      <p className="mt-1 max-w-4xl text-ink-2">
        Steer your colonist yourself, live, everyone at once: walk to the store and in through its door, buy a MULE at the corral, walk into an outfitter to fit it, lead it out to one of your plots and install it, then end your turn in the pub. Play it; that play is the gate.
      </p>
      <h2 className="label-caps mt-6">Key decisions</h2>
      <ul className="mt-2 flex max-w-4xl list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h2 className="label-caps mt-6">The phone’s view of the world: two variants to play side by side</h2>
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

/** The table view: the phone and the TV side by side, driven by one sim. */
function Table() {
  return (
    <Page title="The table: your phone and the TV" intro="One sim drives both frames: steer on the phone (or with the arrow keys once you click it) and the TV follows. The bots walk the same loop by the same rules.">
      <div className="flex flex-wrap items-start gap-6">
        <PortraitFrame>
          <PhoneArcade variant="follow" />
        </PortraitFrame>
        <ScaledFrame width={1280} height={720} scale={0.75} testid="tv-frame">
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
      <div className="flex flex-wrap items-start gap-6">
        <PortraitFrame>
          <PhoneArcade variant="follow" />
        </PortraitFrame>
        <ScaledFrame width={1280} height={720} scale={0.75} testid="tv-frame">
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
      intro="In about 2 s a Crystite glint lights 5 tiles east of Lena, off her phone’s camera: the pointer at the edge says where. Ossa is as far on its other side. Walk onto it first; one step away the button reads GRAB THE GLINT. “Play again” races again; “Call a glint now” lights another anywhere."
    >
      <div className="flex flex-wrap items-start gap-6">
        <PortraitFrame>
          <PhoneArcade variant="follow" />
        </PortraitFrame>
        <ScaledFrame width={1280} height={720} scale={0.75} testid="tv-frame">
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

function PhoneRoute({ variant }: { variant: 'follow' | 'whole' }) {
  const other = variant === 'follow' ? 'arcade-phone-whole' : 'arcade-phone';
  return (
    <Page
      title={variant === 'follow' ? 'Phone, variant A: the camera follows you' : 'Phone, variant B: the whole map, always'}
      intro={
        <>
          {variant === 'follow' ? 'Five plots across (about 5 × 6), centred on you, so the land and your MULE read at a thumb’s size.' : 'The whole colony at once, small, your colonist ringed: you always see the store and your plots.'}{' '}
          <a href={`#${other}`} className="text-holo underline" data-testid="other-variant">
            Play the other variant →
          </a>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-6">
        <PortraitFrame>
          <PhoneArcade variant={variant} />
        </PortraitFrame>
        <TunablesPanel className="w-full max-w-[26rem]" />
        <Notes className="w-full max-w-[26rem]" />
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
    route === 'arcade' ? <Table /> : route === 'arcade-computer' ? <Computer /> : route === 'arcade-phone' ? <PhoneRoute variant="follow" /> : route === 'arcade-phone-whole' ? <PhoneRoute variant="whole" /> : route === 'arcade-tv' ? <TvRoute /> : route === 'arcade-wolves' ? <Wolves /> : route === 'arcade-glint' ? <GlintRace /> : <Contents />;
  const isGame = ARCADE_ROUTES.some((r) => r.id === route);
  return (
    <IntentNotesProvider>
      {isGame ? (
        // A fresh sim per route: the key restarts it when the hash changes.
        <ArcadeProvider key={route} autopilot={route === 'arcade-tv'} scenario={route === 'arcade-wolves' ? 'wolves' : route === 'arcade-glint' ? 'glint' : 'table'}>
          {body}
        </ArcadeProvider>
      ) : (
        body
      )}
    </IntentNotesProvider>
  );
}
