import { SharedClock, YourPace } from '@mule/ui';
import type { ReactNode } from 'react';
import { IntentMarker } from '../../proposed/IntentNote';
import { MONTH } from './fixture';
import { useGameKeys, useTunables, useWorld } from './loop';
import { NOTE } from './notes';
import { ActionButton, conditionOf, GroundChip, Joystick, LeadChip, meOf, Money, OverCard, ruleOf, secondsLeft, YourStage } from './views';

/** The portrait phone: 390 × 844, the size the e2e harness holds a phone upright at. */
export function PortraitFrame({ children }: { children: ReactNode }) {
  return (
    // A narrow window scrolls the frame, never the page.
    <div className="max-w-full shrink-0 overflow-x-auto">
      <div className="h-[844px] w-[390px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
        {children}
      </div>
    </div>
  );
}

/** The stage's box: the frame's width less its padding, and the height the controls leave. */
const STAGE = { w: 366, h: 440 };

/**
 * Your phone, upright: the clock and how you walk on top, the stage in the middle, the thumb controls at the bottom
 * (the joystick under the left thumb, the one action button under the right). Variant A's camera follows you at five
 * plots across; variant B always shows the whole colony, small, with your colonist ringed.
 */
export function PhoneArcade({ variant }: { variant: 'follow' | 'whole' }) {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const keys = useGameKeys();
  const condition = conditionOf(me, tun);
  const need = tun.seats[me.id]!.need;
  return (
    <div
      ref={keys.ref}
      tabIndex={0}
      onPointerDown={keys.focus}
      className="relative flex h-full flex-col gap-2 bg-table p-3 text-ink outline-none"
      data-testid="phone-game"
      data-variant={variant}
      data-focused={keys.focused}
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="label-caps">Month {MONTH} · Development</span>
        <Money className="text-lg" />
      </header>
      <SharedClock seconds={secondsLeft(world, tun)} total={tun.devSeconds} />
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative min-w-0">
          <GroundChip />
          <IntentMarker note={NOTE.A3} at="tr" />
        </span>
        <span className="relative min-w-0">
          <LeadChip />
          <IntentMarker note={NOTE.A4} at="tr" />
        </span>
      </div>
      <YourPace condition={condition} rule={ruleOf(tun)} food={{ ate: tun.seats[me.id]!.food, need }} />
      <div className="relative">
        <YourStage width={STAGE.w} height={STAGE.h} {...(variant === 'follow' ? { across: 5 } : {})} density="phone" ringed={variant === 'whole'} />
        {!keys.focused && (
          <span className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-panel/90 px-2 py-0.5 text-xs text-ink-2 shadow-chip" data-testid="focus-hint">
            Click the game to steer with the keys
          </span>
        )}
        <OverCard />
        <IntentMarker note={NOTE.A7} at="br-in" />
        <IntentMarker note={NOTE.A8} at="tr-in" />
      </div>
      <div className="mt-auto flex items-center gap-4 pb-1" data-testid="phone-controls">
        <span className="relative">
          <Joystick />
          <IntentMarker note={NOTE.A1} at="tl" />
        </span>
        <span className="relative min-w-0 flex-1">
          <ActionButton compact className="min-h-24!" />
          <IntentMarker note={NOTE.A2} at="tr" />
        </span>
      </div>
      <span className="text-center text-xs text-ink-3">Drag the stick to walk · press the button to act</span>
    </div>
  );
}
