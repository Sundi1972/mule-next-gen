import { Panel, SharedClock, YourPace } from '@mule/ui';
import { ThemeToggle } from '../../../../../../apps/web/src/components/ThemeToggle';
import { IntentMarker } from '../../proposed/IntentNote';
import { MONTH } from './fixture';
import { useGameKeys, useTunables, useWorld } from './loop';
import { NOTE } from './notes';
import { ActionButton, conditionOf, GroundChip, LeadChip, meOf, Money, OverCard, ruleOf, secondsLeft, YourStage } from './views';

/** The stage at the laptop's size: the map at 15:9, or the hall at 4:3 inside the same box. */
const STAGE = { w: 1100, h: 660 };

const KEYS: [string, string][] = [
  ['← ↑ → ↓', 'walk (two at once: diagonally)'],
  ['SPACE', 'the action button'],
  ['Mouse', 'hold a spot to walk to it; click the glowing thing to act'],
];

/**
 * Development on a laptop (1440 × 900): where you are fills the stage, the map or the store's hall, and the rail
 * holds the one action button, your pace, the land underfoot and your MULE. Arrow keys, SPACE, or the mouse.
 */
export function LaptopArcade() {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const keys = useGameKeys();
  return (
    <div ref={keys.ref} tabIndex={0} onPointerDown={keys.focus} className="flex h-[900px] w-[1440px] flex-col gap-4 bg-table px-8 py-6 text-ink outline-none" data-testid="laptop-game" data-focused={keys.focused}>
      <header className="flex items-center gap-6">
        <div className="flex shrink-0 flex-col">
          <span className="label-caps">Month {MONTH}</span>
          <h1 className="font-display text-3xl font-semibold leading-none">Development</h1>
        </div>
        <div className="min-w-0 flex-1">
          <SharedClock seconds={secondsLeft(world, tun)} total={tun.devSeconds} />
        </div>
        <Money className="text-2xl" />
        <ThemeToggle />
      </header>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="relative shrink-0">
          <YourStage width={STAGE.w} height={STAGE.h} density="wide" />
          <IntentMarker note={NOTE.A1} at="tl" />
          {!keys.focused && (
            <span className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-panel/90 px-3 py-1 text-sm text-ink-2 shadow-chip" data-testid="focus-hint">
              Click the game to steer
            </span>
          )}
          <OverCard className="inset-x-auto left-1/2 w-[420px] -translate-x-1/2" />
        </div>
        <aside className="flex min-w-0 flex-1 flex-col gap-4" data-testid="laptop-rail">
          <span className="relative">
            <ActionButton hint="SPACE" />
            <IntentMarker note={NOTE.A2} at="tr" />
          </span>
          <YourPace condition={conditionOf(me, tun)} rule={ruleOf(tun)} food={{ ate: tun.seats[me.id]!.food, need: tun.seats[me.id]!.need }} />
          <span className="relative flex flex-col items-start gap-2">
            <GroundChip />
            <IntentMarker note={NOTE.A3} at="tr" />
          </span>
          <span className="relative flex flex-col items-start">
            <LeadChip />
            <IntentMarker note={NOTE.A4} at="tr" />
          </span>
          <Panel title="Controls" className="mt-auto">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm" data-testid="controls-legend">
              {KEYS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono font-bold text-holo">{k}</dt>
                  <dd className="text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
