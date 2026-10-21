import { useEffect, useId, useState } from 'react';
import { RAW_GOODS, type RawGood } from '@mule/engine';
import { GOOD_NAME, setTheme, useTheme } from '@mule/ui';
import { AggregatePanel } from './AggregatePanel';
import { PAGE_SIZE, type GroundView, type Players } from './gallery';
import { MapCard } from './MapCard';
import { RulesPanel } from './RulesPanel';
import { Choice } from './ui';

interface View {
  players: Players;
  /** First seed on the page. */
  seed: number;
  ground: GroundView;
}

const SIZES: Players[] = [2, 4, 6];
const GROUND_OPTIONS: { value: GroundView; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'all', label: 'All goods' },
  ...RAW_GOODS.map((g) => ({ value: g, label: GOOD_NAME[g] })),
];

/** The view lives in the hash (`#players=4&seed=13&ground=all`), so a link opens the same page. */
function readView(): View {
  const q = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const players = Number(q.get('players'));
  const seed = Number(q.get('seed'));
  const ground = q.get('ground');
  return {
    players: SIZES.includes(players as Players) ? (players as Players) : 4,
    seed: Number.isInteger(seed) && seed >= 1 ? seed : 1,
    ground: ground === 'all' || RAW_GOODS.includes(ground as RawGood) ? (ground as GroundView) : 'off',
  };
}

function writeView(v: View) {
  window.location.hash = `players=${v.players}&seed=${v.seed}&ground=${v.ground}`;
}

function useView(): [View, (change: Partial<View>) => void] {
  const [view, setView] = useState(readView);
  useEffect(() => {
    const on = () => setView(readView());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [view, (change) => writeView({ ...view, ...change })];
}

export function App() {
  const [view, change] = useView();
  const seeds = Array.from({ length: PAGE_SIZE }, (_, i) => view.seed + i);
  return (
    <div className="min-h-screen bg-table text-ink">
      <header className="sticky top-0 z-10 border-b border-holo-line bg-panel/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="mr-auto">
            <h1 className="font-display text-xl font-bold">Map gallery</h1>
            <p className="text-xs text-ink-2">Today's maps against the new ones, each with the map checker's verdict: the same check CI runs.</p>
          </div>
          <Choice label="Players" value={view.players} options={SIZES.map((p) => ({ value: p, label: `${p} players` }))} onChange={(players) => change({ players })} />
          <SeedPager seed={view.seed} onSeed={(seed) => change({ seed })} />
          <ThemeToggle />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-2">Hidden ground</span>
          <Choice label="Hidden ground" value={view.ground} options={GROUND_OPTIONS} onChange={(ground) => change({ ground })} />
          <span className="text-xs text-ink-3">{groundNote(view.ground)}</span>
        </div>
      </header>

      <main className="space-y-6 px-6 py-6">
        <RulesPanel players={view.players} />
        <AggregatePanel players={view.players} />
        <div className="grid gap-6 min-[1900px]:grid-cols-2">
          {seeds.map((s) => (
            <MapCard key={`${view.players}-${s}`} seed={s} players={view.players} ground={view.ground} />
          ))}
        </div>
        <div className="flex justify-center pb-6">
          <SeedPager seed={view.seed} onSeed={(seed) => change({ seed })} />
        </div>
      </main>
    </div>
  );
}

function groundNote(ground: GroundView): string {
  if (ground === 'off') return 'Terrain only, as players see the map.';
  if (ground === 'all') return 'Each plot shows its best good plot glyph; pick one good to see all of its good plots.';
  if (ground === 'crystite' || ground === 'rareEarth') return 'Every plot rated 1 or more, so the rings show; good from 3.';
  return `Every good ${GOOD_NAME[ground]} plot, with its rating.`;
}

function SeedPager({ seed, onSeed }: { seed: number; onSeed(seed: number): void }) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const last = seed + PAGE_SIZE - 1;
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        disabled={seed === 1}
        onClick={() => onSeed(Math.max(1, seed - PAGE_SIZE))}
        className="rounded-control border border-holo-line px-2.5 py-1 hover:border-holo disabled:opacity-40"
      >
        ← Previous
      </button>
      <span className="min-w-[110px] text-center font-mono">
        Seeds {seed}–{last}
      </span>
      <button type="button" onClick={() => onSeed(seed + PAGE_SIZE)} className="rounded-control border border-holo-line px-2.5 py-1 hover:border-holo">
        Next →
      </button>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(draft);
          if (Number.isInteger(n) && n >= 1) onSeed(n);
          setDraft('');
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Go to seed
        </label>
        <input
          id={inputId}
          inputMode="numeric"
          placeholder="Seed"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-20 rounded-control border border-holo-line bg-raised px-2 py-1 font-mono"
        />
        <button type="submit" className="rounded-control border border-holo-line px-2.5 py-1 hover:border-holo">
          Go
        </button>
      </form>
    </div>
  );
}

/** Switches between day and night. The choice is remembered on this device. */
function ThemeToggle() {
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
          // Not remembered; the gallery still switches.
        }
      }}
      className="rounded-control border border-holo-line px-2.5 py-1 text-sm hover:border-holo"
    >
      {theme === 'light' ? 'Night' : 'Day'}
    </button>
  );
}
