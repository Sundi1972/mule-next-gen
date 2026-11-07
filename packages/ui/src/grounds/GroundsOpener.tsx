/**
 * The month-end grounds opener on the TV (spec C5, RULE-6): the colony full-screen at dusk with what is new this month,
 * between the month end's event show and the month-end screen. Grafted from the approved scaffolds,
 * design/mocks/colony-grounds/src/tvbeat/TvBeat.tsx (the canvas, header and caption) and src/look/Living.tsx (the lean-in).
 */
import { useEffect, useState, type ComponentType } from 'react';
import { useEventReducedMotion } from '../events/motion';
import type { ColonyGroundsProps, GroundsColony } from './ColonyGrounds';
import { leanAt, openerOf, type Opener } from './opener';
import { useGroundsChange, type GroundsChange, type MonthEndView } from './useGroundsChange';

/** The opener while it is on screen: RULE-6's length, RULE-5's changes, and whether its clock runs yet. */
export interface OpenerState extends Opener {
  changes: GroundsChange[];
  /** False while the month end's event show still covers the screen. */
  playing: boolean;
}

const CANVAS = { width: 1280, height: 720 };

/**
 * The opener for this screen's view, or null when none is up: any phase but the month end, politics off, a month end
 * the screen joined, or one whose opener has run its length. Its clock starts once `eventShowOn` goes false. It reads
 * no Ready and holds nothing: the phase moving on ends it. Call it where the TV stays mounted across phases.
 */
export function useGroundsOpener(view: MonthEndView & { politics: unknown }, eventShowOn: boolean): OpenerState | null {
  const changes = useGroundsChange(view);
  const reduced = useEventReducedMotion();
  const opener = changes && openerOf({ changed: changes.length > 0, reduced, politics: view.politics != null && view.colony != null });
  const playing = opener !== null && !eventShowOn;
  const [ended, setEnded] = useState<number | null>(null);
  const ms = opener?.ms;
  useEffect(() => {
    if (!playing || ms === undefined) return;
    const timer = setTimeout(() => setEnded(view.month), ms);
    return () => clearTimeout(timer);
  }, [playing, ms, view.month]);
  if (!opener || !changes || ended === view.month) return null;
  return { ...opener, changes, playing };
}

/** Seconds since `on` turned true, from the page's frames; 0 while off. */
function useSeconds(on: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!on) return;
    let frame = 0;
    let first: number | null = null;
    const tick = (now: number) => {
      first ??= now;
      setSeconds((now - first) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return on ? seconds : 0;
}

function said({ name, from, to }: GroundsChange): string {
  const the = `the ${name}`;
  if (to === 'standing') return from === 'closed' ? `${the} reopens` : from === 'damaged' ? `${the} is repaired` : `${the} stands`;
  if (to === 'building') return `work starts on ${the}`;
  if (to === 'commissioned') return `${the}'s site is staked out`;
  if (to === 'damaged') return `${the} is damaged`;
  return `${the} closes`;
}

function Caption({ changes }: { changes: GroundsChange[] }) {
  if (changes.length === 0) return <>Nothing new on the grounds this month.</>;
  const lines = changes.map(said);
  const listed = lines.length === 1 ? lines[0] : `${lines.slice(0, -1).join(', ')} and ${lines.at(-1)}`;
  return (
    <>
      <strong>New this month:</strong> {listed}.
    </>
  );
}

/**
 * The opener's canvas: the grounds filling the TV at dusk with no chips, the header and one caption line. The full
 * opener leans in on the places that changed and back out; the still holds the built area. `Scene` draws the grounds
 * with the app's art manifest.
 */
export function GroundsOpener({ opener, colony, month, Scene }: { opener: OpenerState; colony: GroundsColony; month: number; Scene: ComponentType<Omit<ColonyGroundsProps, 'manifest'>> }) {
  const leaning = opener.kind === 'full' ? opener.changes.filter((c) => c.place) : [];
  const lean = leanAt(useSeconds(opener.playing && leaning.length > 0));
  return (
    <div
      className="relative overflow-hidden bg-table text-ink"
      style={CANVAS}
      data-phase="upkeep"
      data-testid="tv-grounds-opener"
      data-opener={opener.kind}
      data-leaning={leaning.length > 0 ? leaning.map((c) => c.id).join(' ') : undefined}
    >
      {/* Nothing on this canvas scales: TV-FIT reads it at full size. */}
      <div className="absolute inset-0" data-fit="1">
        <Scene
          colony={colony}
          size="tv"
          light="dusk"
          chips={false}
          framing={{ aspect: CANVAS.width / CANVAS.height, leanOn: leaning.map((c) => c.place!), lean: leaning.length > 0 ? lean : 0 }}
          className="absolute inset-0 h-full w-full"
        />
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-baseline justify-between bg-gradient-to-b from-black/70 to-transparent px-10 pt-6 pb-12">
          <h1 className="font-display text-4xl font-bold">End of month {month}</h1>
          <span className="label-caps text-ink-2">The colony grounds</span>
        </header>
        <footer className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-10 pt-12 pb-6 text-xl">
          <p className="truncate" data-testid="opener-caption">
            <Caption changes={opener.changes} />
          </p>
        </footer>
      </div>
    </div>
  );
}
