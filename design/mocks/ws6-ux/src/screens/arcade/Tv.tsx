import { PaceList, SharedClock, type PaceRow } from '@mule/ui';
import type { ReactNode } from 'react';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { Board } from '../../harness';
import { IntentMarker } from '../../proposed/IntentNote';
import { ARCADE_VIEW } from './fixture';
import { useGameKeys, useTunables, useWorld } from './loop';
import { NOTE } from './notes';
import { conditionOf, HallStage, MapStage, ruleOf, secondsLeft } from './views';
import type { Colonist } from './sim';

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

const doing = (c: Colonist) => (c.done ? 'PUB' : c.space === 'hall' ? (c.mule ? 'OUTFIT' : 'STORE') : c.mule?.good ? '→ PLOT' : c.installs > 0 ? '→ PUB' : '→ STORE');

/**
 * The big screen (1280 × 720): the whole colony with every colonist walking live, named; the store's hall beside it
 * with whoever is shopping; everyone's clock; and each colonist's pace and what they are doing.
 */
export function TvArcade() {
  const world = useWorld();
  const tun = useTunables();
  const rows: PaceRow[] = world.colonists.map((c) => ({ id: c.id, name: c.name, slot: c.slot, condition: conditionOf(c, tun), note: doing(c), done: c.done }));
  return (
    <Board view={ARCADE_VIEW}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-6 text-ink" data-testid="tv-game">
        <TvHeader game={{ ...ARCADE_VIEW, phase: 'development' }} title="Development" seconds={Math.ceil(secondsLeft(world, tun))} />
        <SharedClock seconds={secondsLeft(world, tun)} total={tun.devSeconds} size="tv" />
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="relative shrink-0 self-start" data-testid="tv-map">
            <MapStage width={740} density="tv" names testid="tv-map-stage" />
            <IntentMarker note={NOTE.A5} at="tl" />
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
