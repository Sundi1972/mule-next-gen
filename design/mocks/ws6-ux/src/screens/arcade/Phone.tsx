import { cx, SharedClock, YourPace } from '@mule/ui';
import type { ReactNode } from 'react';
import { IntentMarker } from '../../proposed/IntentNote';
import { MONTH } from './fixture';
import { guideOf } from './guide';
import { useGameKeys, useTunables, useWorld } from './loop';
import { HALL } from './sim';
import { NOTE } from './notes';
import { ScrambleBanner } from './ScrambleLayer';
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
 * EARLIER (kept for comparison, #arcade-phone-portrait): your phone, upright: the clock and how you walk on top, the stage in the middle, the thumb controls at the bottom
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
        <IntentMarker note={NOTE.A9} at="tl-in" />
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

// --- The phone, landscape (A-10): Heiko, 29 Oct ---------------------------------------------------

/**
 * The landscape phone's geometry, in the screen's pixels: the harness's PhoneFrame is 844 × 390 outside, its 1 px
 * border leaves 842 × 388 inside. The 15 × 9 map fits by height (about 647 × 388, 43 px a plot), centred; the 98 px
 * either side holds the status. The stick and the button lie over the map's bottom corners, where neither the store
 * nor any of Lena's plots is: verify measures 0 px overlap.
 */
export const LANDSCAPE = {
  w: 842,
  h: 388,
  mapW: (388 * 15) / 9,
  side: (842 - (388 * 15) / 9) / 2,
  stick: { left: 12, bottom: 12, size: 128 },
  button: { right: 12, bottom: 12, w: 168, h: 88 },
} as const;

type Rect = { x0: number; y0: number; x1: number; y1: number };
const L = LANDSCAPE;
const STICK_RECT: Rect = { x0: L.stick.left, y0: L.h - L.stick.bottom - L.stick.size, x1: L.stick.left + L.stick.size, y1: L.h - L.stick.bottom };
const BUTTON_RECT: Rect = { x0: L.w - L.button.right - L.button.w, y0: L.h - L.button.bottom - L.button.h, x1: L.w - L.button.right, y1: L.h - L.button.bottom };
const near = (r: Rect, p: { x: number; y: number } | null, by: number) => !!p && p.x > r.x0 - by && p.x < r.x1 + by && p.y > r.y0 - by && p.y < r.y1 + by;

/**
 * Your phone, held sideways (always, Heiko): the whole map fills the screen, the joystick under your left thumb and
 * the one button under your right lie over it, translucent. Your next step is ringed on the map or in the hall
 * (store → corral → outfitter → your plot → pub), so the phone alone shows where to go, with no TV. A control fades
 * to near-clear while you, or the ringed target, are under or beside it.
 */
export function PhoneLandscape() {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const keys = useGameKeys();
  const condition = conditionOf(me, tun);
  const need = tun.seats[me.id]!.need;
  // Where you, and your target, are on the frame: the map's 43 px plots, or the hall centred at the map's height.
  const cell = L.mapW / world.width;
  const hallW = Math.min(L.mapW, (L.h * HALL.w) / HALL.h);
  const hallX = L.side + (L.mapW - hallW) / 2;
  const onFrame = (p: { x: number; y: number }, space: 'map' | 'hall') =>
    space === 'map' ? { x: L.side + p.x * cell, y: p.y * cell } : { x: hallX + (p.x / HALL.w) * hallW, y: (p.y / HALL.h) * L.h };
  const mePx = onFrame(me, me.space);
  const g = guideOf(world, me, tun);
  const targetPx = g?.space === 'map' && me.space === 'map' ? onFrame({ x: g.at.x + 0.5, y: g.at.y + 0.5 }, 'map') : null;
  const fade = (r: Rect) => near(r, mePx, cell * 0.8) || near(r, targetPx, cell * 0.5);
  const stickFaded = fade(STICK_RECT);
  const bannerRect: Rect =
    me.space === 'hall'
      ? { x0: hallX + hallW * 0.09, x1: hallX + hallW * 0.91, y0: L.h * 0.405, y1: L.h * 0.585 }
      : { x0: STICK_RECT.x1 + 8, x1: BUTTON_RECT.x0 - 8, y0: L.h - cell * 1.45, y1: L.h - 4 };
  // The box it may use; the banner itself is only as big as its words, centred in it.
  const bannerAt = { left: bannerRect.x0, width: bannerRect.x1 - bannerRect.x0, top: bannerRect.y0, height: bannerRect.y1 - bannerRect.y0 };
  const buttonFaded = fade(BUTTON_RECT);
  return (
    <div
      ref={keys.ref}
      tabIndex={0}
      onPointerDown={keys.focus}
      className="relative h-full w-full overflow-hidden bg-table text-ink outline-none"
      data-testid="phone-game"
      data-variant="landscape"
      data-focused={keys.focused}
      // The measurement surface for the overlap check: the store's tile and each of your plots.
      data-store={`${world.store.x},${world.store.y}`}
      data-my-plots={world.tiles.filter((t) => t.owner === me.id).map((t) => `${t.x},${t.y}`).join(' ')}
    >
      <div className="absolute inset-y-0" style={{ left: L.side, width: L.mapW }} data-testid="phone-stage">
        <YourStage width={L.mapW} height={L.h} density="phone" guide banner={false} />
        <OverCard />
      </div>
      {/* The status, in the side room either side of the map: nothing of it lies over the map. */}
      <div className="absolute left-0 top-0 flex flex-col gap-1.5 p-1.5" style={{ width: L.side }} data-testid="phone-status-left">
        <span className="label-caps text-[10px]! leading-tight">M{MONTH} · Development</span>
        <Money className="text-base" />
        <SharedClock seconds={secondsLeft(world, tun)} total={tun.devSeconds} />
        <span className="flex gap-3 pl-1 pt-1">
          <span className="relative block size-3"><IntentMarker note={NOTE.A10} at="tl" /></span>
          <span className="relative block size-3"><IntentMarker note={NOTE.A7} at="tl" /></span>
          <span className="relative block size-3"><IntentMarker note={NOTE.A8} at="tl" /></span>
          <span className="relative block size-3"><IntentMarker note={NOTE.A9} at="tl" /></span>
        </span>
        {!keys.focused && (
          <span className="rounded-chip bg-panel/90 px-1 py-0.5 text-[10px] leading-tight text-ink-2 shadow-chip" data-testid="focus-hint">
            Click the game to steer with the keys
          </span>
        )}
      </div>
      <div className="absolute right-0 top-0 flex flex-col gap-1.5 p-1.5" style={{ width: L.side }} data-testid="phone-status-right">
        <span className="relative min-w-0">
          <LeadChip className="w-full flex-wrap! gap-x-1! px-1! text-xs! [&_span]:whitespace-normal!" />
          <IntentMarker note={NOTE.A4} at="tl" />
        </span>
        <span className="relative min-w-0">
          <GroundChip className="w-full flex-wrap! gap-x-1! px-1! text-xs! [&_span]:whitespace-normal!" />
          <IntentMarker note={NOTE.A3} at="tl" />
        </span>
        <YourPace condition={condition} rule={ruleOf(tun)} food={{ ate: tun.seats[me.id]!.food, need }} />
      </div>
      {/* The scramble's banner, placed so it covers nothing you must reach: on the map along the bottom row between the
          stick and the button (no store and none of your plots there); in the hall across the walkway, between the
          shops and the corral and between the two doors. It fades while you walk under it. */}
      <div className="pointer-events-none absolute z-20 flex items-center justify-center" style={bannerAt} data-testid="scramble-banner-box">
        <ScrambleBanner world={world} me={me} tun={tun} at={{ position: 'static', maxWidth: '100%' }} faded={near(bannerRect, mePx, cell * 0.4)} />
      </div>
      {/* The controls, over the map's bottom corners. */}
      <span
        className={cx('absolute z-30 transition-opacity duration-200', stickFaded ? 'opacity-25' : 'opacity-100')}
        style={{ left: L.stick.left, bottom: L.stick.bottom }}
        data-testid="overlay-stick"
        data-faded={stickFaded || undefined}
      >
        <Joystick className="border-holo/60! bg-panel/30! backdrop-blur-[2px]" />
        <IntentMarker note={NOTE.A1} at="tl" />
      </span>
      <span
        className={cx('absolute z-30 rounded-panel bg-panel/80 p-1 shadow-map backdrop-blur-[2px] transition-opacity duration-200', buttonFaded ? 'opacity-25' : 'opacity-100')}
        style={{ right: L.button.right, bottom: L.button.bottom, width: L.button.w, height: L.button.h }}
        data-testid="overlay-button"
        data-faded={buttonFaded || undefined}
      >
        <ActionButton wrap className="h-full! min-h-0! px-2! py-1! disabled:opacity-90!" />
        <IntentMarker note={NOTE.A2} at="tl" />
      </span>
    </div>
  );
}
