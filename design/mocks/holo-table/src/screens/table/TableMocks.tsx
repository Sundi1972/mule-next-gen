import type { ComponentType, ReactNode } from 'react';
import { ThemeToggle } from '../../App';
import { PhoneGameOver, TvGameOver } from './GameOver';
import { LobbyV1, LobbyV2 } from './Lobby';
import { PhoneDevelopZoom, PhoneGrantZoom } from './MapZoom';

/**
 * WS4 · the kitchen-table screens: species pick, map zoom and the end of the game.
 * Phones here are held sideways (844×390), as in the real app. The older phone
 * mocks in this prototype are upright; they predate the landscape ruling.
 */

interface Mock {
  id: string;
  label: string;
  kind: 'phone' | 'tv';
  Screen: ComponentType;
}

interface Group {
  id: string;
  title: string;
  question: string;
  mocks: Mock[];
}

const GROUPS: Group[] = [
  {
    id: 'lobby',
    title: 'Species pick in the lobby',
    question: 'Which variant: V1 (pick always on screen) or V2 (tap your seat to pick)?',
    mocks: [
      { id: 'lobby-v1', label: 'V1 · seat default (Zipwing)', kind: 'phone', Screen: () => <LobbyV1 state="default" /> },
      { id: 'lobby-v1-picked', label: 'V1 · picked Mollox', kind: 'phone', Screen: () => <LobbyV1 state="picked" /> },
      { id: 'lobby-v1-twin', label: 'V1 · same species as Mia', kind: 'phone', Screen: () => <LobbyV1 state="duplicate" /> },
      { id: 'lobby-v2', label: 'V2 · closed: the lobby as today', kind: 'phone', Screen: () => <LobbyV2 open={false} /> },
      { id: 'lobby-v2-open', label: 'V2 · open: your seat tapped', kind: 'phone', Screen: () => <LobbyV2 open /> },
    ],
  },
  {
    id: 'zoom',
    title: 'Map zoom on the phone',
    question: 'Is the zoomed view right, and is the corner button in the right place?',
    mocks: [
      { id: 'zoom-develop', label: 'Development · whole colony', kind: 'phone', Screen: () => <PhoneDevelopZoom zoomed={false} /> },
      { id: 'zoom-develop-in', label: 'Development · zoomed to your land', kind: 'phone', Screen: () => <PhoneDevelopZoom zoomed /> },
      { id: 'zoom-grant-in', label: 'Land grant · zoomed, cursor sweeping', kind: 'phone', Screen: () => <PhoneGrantZoom zoomed /> },
      { id: 'zoom-none', label: 'No land yet · no button, double-tap does nothing', kind: 'phone', Screen: () => <PhoneDevelopZoom zoomed={false} noPlots /> },
    ],
  },
  {
    id: 'end',
    title: 'Game over',
    question: 'Does the breakdown explain the score, and does the verdict read clearly?',
    mocks: [
      { id: 'end-lost', label: 'Phone · you came second, colony passed', kind: 'phone', Screen: () => <PhoneGameOver won={false} collapse={false} /> },
      { id: 'end-won', label: 'Phone · you won, colony passed', kind: 'phone', Screen: () => <PhoneGameOver won collapse={false} /> },
      { id: 'end-collapse', label: 'Phone · colony failed, scores cut by a fifth', kind: 'phone', Screen: () => <PhoneGameOver won={false} collapse /> },
      { id: 'end-tv', label: 'Big screen · colony passed', kind: 'tv', Screen: () => <TvGameOver collapse={false} /> },
      { id: 'end-tv-collapse', label: 'Big screen · colony failed', kind: 'tv', Screen: () => <TvGameOver collapse /> },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.mocks);

const DECISIONS = [
  'Phones are drawn sideways at 844×390, the smallest landscape phone we support, with the real app\'s side rail.',
  'You pick your species in the lobby; until you do, you play your seat\'s species. You can change until the host starts.',
  'Two players may share a species; colour tells them apart, so the pick says so instead of blocking it.',
  'A single tap on the map only selects a plot. A double-tap or the corner button zooms; neither moves anyone.',
  'Zoom fits your own plots plus one plot around them. With no plots yet there is nothing to zoom to.',
  'At the end your phone breaks your score into money, goods, land and MULEs, and shows any Collapse cut as its own line.',
  'The big screen shows totals only: goods are private, so the breakdown stays on each phone.',
];

/** A phone held sideways. On a real phone the screen fills the display instead. */
function LandFrame({ children }: { children: ReactNode }) {
  return <div className="h-[390px] w-[844px] shrink-0 overflow-hidden rounded-[32px] border-[6px] border-raised bg-table shadow-[0_30px_80px_rgb(0_0_0/0.6)] [--rail:262px]">{children}</div>;
}

function TvFrame({ children }: { children: ReactNode }) {
  return (
    <div className="aspect-video w-full max-w-[844px] overflow-hidden rounded-panel border border-holo-line bg-table">
      <div className="h-[720px] w-[1280px] origin-top-left scale-[0.6594]">{children}</div>
    </div>
  );
}

function Nav({ mock }: { mock: Mock }) {
  const i = ALL.indexOf(mock);
  const prev = ALL[i - 1];
  const next = ALL[i + 1];
  return (
    <nav aria-label="Prototype" className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-holo-faint bg-void px-3 font-mono text-xs text-ink-3">
      {prev ? <a href={`#table-${prev.id}`} className="hover:text-holo">‹ {prev.label}</a> : <span />}
      <span className="flex items-center gap-3">
        <a href="#table" className="whitespace-nowrap hover:text-holo">All WS4 screens</a>
        <ThemeToggle />
      </span>
      {next ? <a href={`#table-${next.id}`} className="text-right hover:text-holo">{next.label} ›</a> : <span />}
    </nav>
  );
}

/** One screen alone. A phone held sideways fills it; a laptop shows the frame. */
function Single({ mock }: { mock: Mock }) {
  const onPhone = typeof window !== 'undefined' && window.innerHeight < 500;
  if (mock.kind === 'tv') {
    return (
      <div className="flex h-dvh flex-col bg-void">
        <Nav mock={mock} />
        <div className="min-h-0 flex-1">
          <mock.Screen />
        </div>
      </div>
    );
  }
  if (onPhone) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="min-h-0 flex-1">
          <mock.Screen />
        </div>
        <Nav mock={mock} />
      </div>
    );
  }
  return (
    <div className="holo-grid flex min-h-screen flex-col items-center justify-center gap-4 bg-table p-6">
      <div className="w-[844px] overflow-hidden rounded-control border border-holo-faint">
        <Nav mock={mock} />
      </div>
      <LandFrame>
        <mock.Screen />
      </LandFrame>
    </div>
  );
}

function Index() {
  return (
    <div className="holo-grid min-h-screen bg-table text-ink">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-10 px-4 py-8 sm:px-10">
        <header className="flex flex-col gap-3">
          <span className="label-caps text-holo!">Prototype · made-up data · WS4 Table</span>
          <h1 className="font-display text-4xl font-semibold">Species, map zoom and the end of the game</h1>
          <p className="max-w-3xl text-lg text-ink-2">
            Every screen below is live: tap the creatures, double-tap the maps, press the zoom button. Open any screen on your phone held sideways and it
            fills the display. <a href="#all" className="text-holo underline">The rest of the prototype</a> is the earlier upright design.
          </p>
          <ul className="flex max-w-4xl flex-col gap-1 text-ink-2" data-testid="decisions">
            {DECISIONS.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="text-holo">·</span>
                {d}
              </li>
            ))}
          </ul>
        </header>
        {GROUPS.map((g) => (
          <section key={g.id} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl font-semibold">{g.title}</h2>
              <p className="text-warn">{g.question}</p>
            </div>
            <div className="flex flex-wrap items-start gap-8">
              {g.mocks.map((m) => (
                <figure key={m.id} className="flex min-w-0 max-w-full flex-col gap-2">
                  <figcaption className="flex items-baseline justify-between gap-4 font-mono text-sm">
                    <span>{m.label}</span>
                    <a className="shrink-0 text-holo hover:text-holo-strong" href={`#table-${m.id}`}>
                      Open alone
                    </a>
                  </figcaption>
                  {/* On a narrow screen the frame scrolls inside its own box; the page never scrolls sideways. */}
                  <div className="max-w-full overflow-x-auto">
                    {m.kind === 'tv' ? (
                      <TvFrame>
                        <m.Screen />
                      </TvFrame>
                    ) : (
                      <LandFrame>
                        <m.Screen />
                      </LandFrame>
                    )}
                  </div>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function TableMocks({ id }: { id: string | undefined }) {
  const mock = ALL.find((m) => m.id === id);
  return mock ? <Single mock={mock} /> : <Index />;
}
