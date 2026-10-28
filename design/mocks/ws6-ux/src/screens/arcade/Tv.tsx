import { cx, PaceList, SharedClock, type PaceRow } from '@mule/ui';
import type { ReactNode } from 'react';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { Board } from '../../harness';
import { IntentMarker } from '../../proposed/IntentNote';
import { ARCADE_VIEW } from './fixture';
import { useGameKeys, useTunables, useWorld } from './loop';
import { NOTE } from './notes';
import { conditionOf, HallStage, MapStage, ruleOf, secondsLeft } from './views';
import { plotLabel } from './glint';
import type { Colonist, World } from './sim';

/** A frame at a design size, scaled to fit the page; pointer maths reads the drawn box, so a scaled frame still plays. */
export function ScaledFrame({ width, height, scale, testid, children }: { width: number; height: number; scale: number; testid: string; children: ReactNode }) {
  return (
    <div className="max-w-full shrink-0 overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line shadow-map" style={{ width: width * scale, height: height * scale }} data-testid={testid}>
        <div className="origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const doing = (c: Colonist, w: World) => (w.glint?.racers.includes(c.id) && !c.encounter && !c.done ? 'GLINT' : c.encounter ? (c.encounter.kind === 'fight' ? 'FIGHT' : c.encounter.kind === 'chase' ? 'RUN' : 'WOLVES') : c.done ? 'PUB' : c.space === 'hall' ? (c.mule ? 'OUTFIT' : 'STORE') : c.mule?.good ? '→ PLOT' : c.installs > 0 ? '→ PUB' : '→ STORE');

/**
 * The big screen (1280 × 720): the whole colony with every colonist walking live, named; the store's hall beside it
 * with whoever is shopping; everyone's clock; and each colonist's pace and what they are doing.
 */
export function TvArcade() {
  const world = useWorld();
  const tun = useTunables();
  const rows: PaceRow[] = world.colonists.map((c) => ({ id: c.id, name: c.name, slot: c.slot, condition: conditionOf(c, tun), note: doing(c, world), done: c.done }));
  return (
    <Board view={ARCADE_VIEW}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-6 text-ink" data-testid="tv-game">
        <TvHeader game={{ ...ARCADE_VIEW, phase: 'development' }} title="Development" seconds={Math.ceil(secondsLeft(world, tun))} />
        <SharedClock seconds={secondsLeft(world, tun)} total={tun.devSeconds} size="tv" />
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="relative shrink-0 self-start" data-testid="tv-map">
            <MapStage width={740} density="tv" names testid="tv-map-stage" />
            <IntentMarker note={NOTE.A5} at="tl" />
            <TvBeats />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="label-caps text-base!">In the store now</span>
            <HallStage width={424} density="tv" store="phone" names testid="tv-hall-stage" />
            <PaceList rows={rows} rule={ruleOf(tun)} columns={1} />
          </div>
        </div>
      </div>
    </Board>
  );
}

/** The TV alone as a keyboard: steering Lena from it turns her autopilot off. */
export function TvKeys({ children }: { children: ReactNode }) {
  const keys = useGameKeys();
  return (
    <div ref={keys.ref} tabIndex={0} onPointerDown={keys.focus} className="relative w-fit max-w-full outline-none" data-testid="tv-keys" data-focused={keys.focused}>
      {children}
      {!keys.focused && (
        <span className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-panel/90 px-3 py-1 text-sm text-ink-2 shadow-chip" data-testid="focus-hint">
          Click the TV to steer Lena (turns her autopilot off)
        </span>
      )}
    </div>
  );
}

/** How long a beat stays on the TV after it happened. */
const BEAT_MS = 3000;

/**
 * The TV's beats along the map's foot, clear of the callouts at the colonists: one line per colonist meeting wolves
 * right now ("Wolves! Lena — run or fight?", the fight's score), then for a few seconds how it ended. Everyone at the
 * table sees every pack and every fight.
 */
function TvBeats() {
  const world = useWorld();
  const tun = useTunables();
  const live = world.colonists.filter((c) => c.encounter);
  const recent = world.beats.filter((b) => world.t - b.t < BEAT_MS && !live.some((c) => c.id === b.id) && !b.text.startsWith('Wolves!') && !b.text.startsWith('A Crystite glint'));
  const g = world.glint;
  const lines = [
    ...(g ? [{ key: 'glint', text: `A Crystite glint at ${plotLabel(g)}! First there wins · ${Math.ceil(Math.max(0, g.until - world.t) / 1000)} s`, tone: 'glint' }] : []),
    ...live.map((c) => {
      const e = c.encounter!;
      const text =
        e.kind === 'choose'
          ? `Wolves! ${c.name} — run or fight?`
          : e.kind === 'chase'
            ? `${c.name} runs from the wolves!`
            : `${c.name} fights the wolves · ${e.strikes}/${tun.wolves.strikesToWin} strikes · ${e.bites}/${tun.wolves.bitesToLose} bites`;
      return { key: `live-${c.id}`, text, tone: e.kind === 'fight' ? 'warn' : 'alert' };
    }),
    ...recent.slice(-2).map((b) => ({ key: `${b.id}-${b.t}`, text: b.text, tone: b.tone })),
  ];
  if (lines.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-1.5" data-testid="tv-beats">
      {lines.map((l) => (
        <span
          key={l.key}
          className={cx(
            'rounded-panel border-2 bg-panel/95 px-4 py-1.5 font-display text-xl font-bold shadow-glow',
            l.tone === 'alert' ? 'border-alert text-alert' : l.tone === 'ok' ? 'border-ok text-ok' : l.tone === 'glint' ? 'border-g-crystite text-ink' : 'border-warn text-warn',
          )}
          data-testid="tv-beat"
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
