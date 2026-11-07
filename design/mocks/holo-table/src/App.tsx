import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { setTheme, useTheme } from '@mule/ui';
import { PhoneAuction } from './screens/phone/PhoneAuction';
import { PhoneDevelop } from './screens/phone/PhoneDevelop';
import { PhoneLandGrant } from './screens/phone/PhoneLandGrant';
import { PhoneLobby } from './screens/phone/PhoneLobby';
import { PhonePlanning } from './screens/phone/PhonePlanning';
import { PhoneResults } from './screens/phone/PhoneResults';
import { MapLab } from './screens/MapLab';
import { System } from './screens/System';
import { TableMocks } from './screens/table/TableMocks';
import { TvAuction } from './screens/tv/TvAuction';
import { TvDevelop } from './screens/tv/TvDevelop';
import { TvEvent } from './screens/tv/TvEvent';
import { TvLandGrant } from './screens/tv/TvLandGrant';
import { TvLobby } from './screens/tv/TvLobby';
import { TvPlanning } from './screens/tv/TvPlanning';

export interface Step {
  id: string;
  title: string;
  note: string;
  Phone: ComponentType;
  Tv: ComponentType;
}

/** One month at the table, phase by phase. Each step pairs a phone screen with the big screen at that moment. */
export const STEPS: Step[] = [
  { id: 'lobby', title: 'Join', note: 'The TV shows a QR code. Phones scan it and become controllers.', Phone: PhoneLobby, Tv: TvLobby },
  { id: 'planning', title: 'Planning', note: 'Everyone plans at once: deals, whispers, secret orders.', Phone: PhonePlanning, Tv: TvPlanning },
  { id: 'land', title: 'Land grant', note: 'One cursor sweeps the TV. Slam CLAIM on your phone.', Phone: PhoneLandGrant, Tv: TvLandGrant },
  { id: 'develop', title: 'Development', note: 'All avatars on the map at once. Your phone shows your land.', Phone: PhoneDevelop, Tv: TvDevelop },
  { id: 'auction', title: 'Goods auction', note: 'The classic auction on the TV. Your phone is the slider.', Phone: PhoneAuction, Tv: TvAuction },
  { id: 'results', title: 'Results and events', note: 'Reveals happen on the TV. Your own numbers stay on your phone.', Phone: PhoneResults, Tv: TvEvent },
];

/** Routes are plain hash tokens (`#phone-develop`, `#tv-auction`, `#system`) so a link can open one screen directly. */
const readHash = () => window.location.hash.replace(/^#\/?/, '').replace('/', '-');

function useHash(): string {
  const [hash, setHash] = useState(readHash);
  useEffect(() => {
    const on = () => setHash(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function go(path: string) {
  window.location.hash = path;
}

export function App() {
  const hash = useHash();
  const [kind, id] = hash.split(/-(.*)/);
  const step = STEPS.find((s) => s.id === id);
  if (kind === 'phone' && step) return <PhoneOnly step={step} />;
  if (kind === 'tv' && step) return <TvOnly step={step} />;
  if (kind === 'system') return <System />;
  if (kind === 'map') return <MapLab />;
  if (kind === 'table') return <TableMocks id={id} />;
  return <Overview />;
}

/** A 1280×720 design, scaled to fit its box. */
function Scaled({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / width, el.clientHeight / height));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <div className="absolute left-1/2 top-1/2 origin-center" style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-[844px] w-[390px] shrink-0 overflow-hidden rounded-[44px] border-[6px] border-raised bg-table shadow-[0_30px_80px_rgb(0_0_0/0.6)]">
      {children}
    </div>
  );
}

function Overview() {
  return (
    <div className="holo-grid min-h-screen bg-table">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-10 px-4 py-10 sm:px-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="label-caps text-holo!">Prototype · made-up data</span>
            <h1 className="font-display text-4xl font-semibold sm:text-5xl">M.U.L.E. Next Gen: one month at the table</h1>
            <p className="max-w-3xl text-lg text-ink-2">
              Each row is one phase. On the left, what you hold in your hand. On the right, what the big screen shows everyone. Open a phone
              screen on your actual phone and the big screen on a laptop to feel both.
            </p>
          </div>
          <span className="flex gap-3">
            <a href="#table" className="inline-flex h-11 items-center rounded-control border border-holo-line bg-holo-soft px-4 font-display font-semibold hover:border-holo">
              Table screens (sideways)
            </a>
            <a href="#system" className="inline-flex h-11 items-center rounded-control border border-holo-line bg-holo-soft px-4 font-display font-semibold hover:border-holo">
              Design system
            </a>
          </span>
        </header>
        {STEPS.map((s, i) => (
          <section key={s.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-sm text-holo">0{i + 1}</span>
              <h2 className="font-display text-2xl font-semibold">{s.title}</h2>
              <span className="text-ink-2">{s.note}</span>
              <span className="ml-auto flex gap-3 font-mono text-sm">
                <a className="text-holo hover:text-holo-strong" href={`#phone-${s.id}`}>Open phone</a>
                <a className="text-holo hover:text-holo-strong" href={`#tv-${s.id}`}>Open big screen</a>
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-8">
              <PhoneFrame>
                <s.Phone />
              </PhoneFrame>
              <div className="aspect-video min-w-0 flex-[1_1_640px] overflow-hidden rounded-panel border border-holo-line bg-table">
                <Scaled width={1280} height={720}>
                  <s.Tv />
                </Scaled>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Switches between day and night. The choice is remembered on this device. */
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        try {
          localStorage.setItem('mule-theme', next);
        } catch {
          // Not remembered; fine for a prototype.
        }
      }}
      className="rounded-chip border border-holo-line px-2 py-0.5 hover:border-holo hover:text-holo"
    >
      {theme === 'light' ? 'Night' : 'Day'}
    </button>
  );
}

function StepNav({ step, kind }: { step: Step; kind: 'phone' | 'tv' }) {
  const i = STEPS.indexOf(step);
  const prev = STEPS[i - 1];
  const next = STEPS[i + 1];
  return (
    <nav aria-label="Prototype" className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-holo-faint bg-void px-3 font-mono text-xs text-ink-3">
      {prev ? <a href={`#${kind}-${prev.id}`} className="truncate hover:text-holo" title={prev.title}>‹ {kind === 'phone' ? 'Back' : prev.title}</a> : <span />}
      <span className="flex items-center gap-3">
        <a href="#all" className="whitespace-nowrap hover:text-holo">All screens</a>
        <ThemeToggle />
      </span>
      {next ? <a href={`#${kind}-${next.id}`} className="truncate hover:text-holo" title={next.title}>{kind === 'phone' ? 'Next' : next.title} ›</a> : <span />}
    </nav>
  );
}

/** On a real phone the screen fills the display; on a desktop it sits in a phone frame. */
function PhoneOnly({ step }: { step: Step }) {
  const wide = typeof window !== 'undefined' && window.innerWidth > 600;
  const screen = (
    <div className="flex h-full flex-col">
      <StepNav step={step} kind="phone" />
      <div className="min-h-0 flex-1">
        <step.Phone />
      </div>
    </div>
  );
  return wide ? (
    <div className="holo-grid flex min-h-screen items-center justify-center bg-table p-6">
      <PhoneFrame>{screen}</PhoneFrame>
    </div>
  ) : (
    <div className="h-dvh">{screen}</div>
  );
}

function TvOnly({ step }: { step: Step }) {
  return (
    <div className="flex h-dvh flex-col bg-void">
      <StepNav step={step} kind="tv" />
      <div className="min-h-0 flex-1">
        <Scaled width={1280} height={720}>
          <step.Tv />
        </Scaled>
      </div>
    </div>
  );
}
