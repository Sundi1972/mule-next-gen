import { cx, SharedClock, YourPace } from '@mule/ui';
import { AltLine, CompactClock, GuideNote, PaceLine, PlotCard, PlotsLegend } from './AddendumLayer';
import { css, FRAMES, freeRun, phoneLayout, type Box, type PhoneSize } from './layout';
import type { ReactNode } from 'react';
import { IntentMarker } from '../../proposed/IntentNote';
import { MONTH } from './fixture';
import { guideOf } from './guide';
import { useGameKeys, useTunables, useWorld } from './loop';
import { NOTE } from './notes';
import { ScrambleBanner } from './ScrambleLayer';
import { reachOf } from './sim';
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

/** The small phone of the small-phone audit (667 × 375), beside the harness's 844 × 390 PhoneFrame. */
export function SmallPhoneFrame({ children }: { children: ReactNode }) {
  const f = FRAMES[667];
  return (
    <div className="max-w-full shrink-0 overflow-x-auto">
      <div className="overflow-hidden rounded-sheet border border-holo-line shadow-map" style={{ width: f.outerW, height: f.outerH }} data-testid="phone-frame" data-size="667">
        {children}
      </div>
    </div>
  );
}

const near = (r: Box, p: { x: number; y: number } | null, by: number) => !!p && p.x > r.x - by && p.x < r.x + r.w + by && p.y > r.y - by && p.y < r.y + r.h + by;

/**
 * Your phone, held sideways (always, Heiko): the whole map fills the screen, the joystick under your left thumb and
 * the one button under your right lie over it, translucent. Your next step is ringed on the map or in the hall, so the
 * phone alone shows where to go, with no TV. A control fades to near-clear while you, or the ringed target, are under
 * or beside it. At 667 × 375 the same, scaled to the frame, the status in a bar over the map's top edge (layout.ts).
 */
export function PhoneLandscape({ size = 844 }: { size?: PhoneSize }) {
  const world = useWorld();
  const tun = useTunables();
  const me = meOf(world);
  const keys = useGameKeys();
  const L = phoneLayout(size, me.space, world.width, world.height);
  const onFrame = (p: { x: number; y: number }) => ({ x: L.stage.x + p.x * L.cell, y: L.stage.y + p.y * L.cell });
  const mePx = onFrame(me);
  const g = guideOf(world, me, tun);
  const spots = g?.space === 'map' && me.space === 'map' ? g.spots : [];
  const targets = spots.map((s) => onFrame({ x: s.at.x + 0.5, y: s.at.y + 0.5 }));
  const fade = (r: Box) => near(r, mePx, L.cell * 0.8) || targets.some((t) => near(r, t, L.cell * 0.5));
  const stickFaded = fade(L.stick);
  const buttonFaded = fade(L.button);
  const altFaded = fade(L.alt);
  const reach = reachOf(world, me, tun);
  // At 667 the status bar: row 0's widest run with no plot of yours and no target on it.
  let bar: Box | null = null;
  if (L.mode === 'top') {
    const blocked = [...world.tiles.filter((t) => t.owner === me.id && t.y === 0).map((t) => t.x), ...spots.filter((s) => Math.floor(s.at.y) === 0).map((s) => Math.floor(s.at.x))];
    const [c0, c1] = freeRun(world.width, blocked);
    bar = { x: L.stage.x + c0 * L.cell + 3, y: 2, w: (c1 - c0 + 1) * L.cell - 6, h: L.cell - 6 };
  }
  const barFaded = !!bar && near(bar, mePx, L.cell * 0.5);
  // V-3's card: over the map away from your plots, below row 0's status bar, above the store's row (rows 1 to 3 of
  // columns 5 to 14: Lena's plots are all outside it, at columns 3, 4 and 15). As tall as its words, at most the box.
  const here = me.space === 'map';
  const card: Box | null = here ? { x: L.stage.x + 4.15 * L.cell, y: 0.95 * L.cell, w: 9.7 * L.cell, h: 3.0 * L.cell } : null;
  const bannerFaded = near(L.banner, mePx, L.cell * 0.4);
  const showScramble = !!world.scramble;
  const choosing = me.space === 'hall' && !!me.mule && (!me.mule.good || !!me.mule.taken);
  const markers = (
    <span className="flex flex-wrap gap-x-3 gap-y-2 pl-1 pt-1">
      {[NOTE.A10, NOTE.A7, NOTE.A8, NOTE.A9].map((n) => (
        <span key={n.id} className="relative block size-3">
          <IntentMarker note={n} at="tl" />
        </span>
      ))}
    </span>
  );
  const compactLeft = !!L.left && L.left.w < SIDE_ROOM_FULL;
  return (
    <div
      ref={keys.ref}
      tabIndex={0}
      onPointerDown={keys.focus}
      className="relative h-full w-full overflow-hidden bg-table text-ink outline-none"
      data-testid="phone-game"
      data-variant="landscape"
      data-size={size}
      data-mode={L.mode}
      data-focused={keys.focused}
      // The measurement surface for the overlap check: the store's tile and each of your plots.
      data-store={`${world.store.x},${world.store.y}`}
      data-my-plots={world.tiles.filter((t) => t.owner === me.id).map((t) => `${t.x},${t.y}`).join(' ')}
    >
      <div className="absolute" style={css(L.stage)} data-testid="phone-stage">
        <YourStage width={L.stage.w} height={L.stage.h} density="phone" guide banner={false} />
        <OverCard />
      </div>
      {/* The status: in the side room either side of the map (nothing of it over the map), or at 667 a bar over the
          map's top edge, clear of your plots and the target. */}
      {L.left && (
        <div className={cx('absolute flex flex-col gap-1.5', compactLeft ? 'p-1' : 'p-1.5')} style={{ left: L.left.x, top: L.left.y, width: L.left.w }} data-testid="phone-status-left" data-overlay="status-left">
          {!compactLeft && <span className="label-caps text-[10px]! leading-tight">M{MONTH} · Development</span>}
          <Money className={compactLeft ? 'text-[11px] [&_*]:whitespace-nowrap' : 'text-base'} />
          {compactLeft ? <CompactClock world={world} tun={tun} /> : <SharedClock seconds={secondsLeft(world, tun)} total={tun.devSeconds} />}
          {markers}
          {!keys.focused && !compactLeft && (
            <span className="rounded-chip bg-panel/90 px-1 py-0.5 text-[10px] leading-tight text-ink-2 shadow-chip" data-testid="focus-hint">
              Click the game to steer with the keys
            </span>
          )}
        </div>
      )}
      {L.right && (
        <div className="absolute flex flex-col gap-1.5 p-1.5" style={{ left: L.right.x, top: L.right.y, width: L.right.w }} data-testid="phone-status-right" data-overlay="status-right">
          <span className="relative min-w-0">
            <LeadChip className="w-full flex-wrap! gap-x-1! px-1! text-xs! [&_span]:whitespace-normal!" />
            <IntentMarker note={NOTE.A4} at="tl" />
          </span>
          <span className="relative min-w-0">
            <GroundChip className="w-full flex-wrap! gap-x-1! px-1! text-xs! [&_span]:whitespace-normal!" />
            <IntentMarker note={NOTE.A3} at="tl" />
          </span>
          <PaceLine world={world} me={me} tun={tun} short={choosing || L.small} />
          {choosing && <PlotsLegend world={world} me={me} />}
        </div>
      )}
      {bar && (
        <div
          className={cx('absolute z-20 flex items-center gap-2 rounded-chip border border-holo-faint bg-panel/88 px-2 text-xs shadow-chip backdrop-blur-[2px] transition-opacity duration-200', barFaded && 'opacity-25')}
          style={{ left: bar.x, top: bar.y, width: bar.w, minHeight: bar.h }}
          data-testid="phone-status-bar"
          data-overlay="status-bar"
          data-faded={barFaded || undefined}
        >
          <Money className="text-xs" />
          <CompactClock world={world} tun={tun} />
          <span className="relative min-w-0 shrink">
            <LeadChip className="px-1! text-[11px]!" />
          </span>
          <span className="min-w-0 flex-1">
            <PaceLine world={world} me={me} tun={tun} short />
          </span>
        </div>
      )}
      <PlotCard world={world} me={me} tun={tun} at={card ? { left: card.x, top: card.y, width: card.w, maxHeight: card.h } : {}} />
      {/* The banner box: the scramble's banner, or the guide's note (V-7); on the map along the bottom row between the
          stick and the button (no store and none of your plots there); in the hall across the walkway, between the
          shops and the corral and between the two doors. It fades while you walk under it. */}
      <div className="pointer-events-none absolute z-20 flex items-center justify-center" style={css(L.banner)} data-testid="scramble-banner-box">
        {showScramble ? <ScrambleBanner world={world} me={me} tun={tun} at={{ position: 'static', maxWidth: '100%' }} faded={bannerFaded} /> : <GuideNote world={world} me={me} tun={tun} faded={bannerFaded} />}
      </div>
      {/* The controls, over the bottom corners; the second choice as a line above the button. */}
      <span className={cx('absolute z-30 transition-opacity duration-200', stickFaded ? 'opacity-25' : 'opacity-100')} style={{ left: L.stick.x, top: L.stick.y }} data-testid="overlay-stick" data-overlay="stick" data-faded={stickFaded || undefined}>
        <Joystick size={L.stick.w} className="border-holo/60! bg-panel/30! backdrop-blur-[2px]" />
        <IntentMarker note={NOTE.A1} at="tl" />
      </span>
      {reach.alt && (
        <span className={cx('absolute z-30 rounded-panel bg-panel/80 p-0.5 shadow-map transition-opacity duration-200', altFaded ? 'opacity-25' : 'opacity-100')} style={css(L.alt)} data-testid="overlay-alt" data-overlay="alt" data-faded={altFaded || undefined}>
          <AltLine world={world} me={me} tun={tun} small={L.small} />
        </span>
      )}
      <span
        className={cx('absolute z-30 rounded-panel bg-panel/80 p-1 shadow-map backdrop-blur-[2px] transition-opacity duration-200', buttonFaded ? 'opacity-25' : 'opacity-100')}
        style={css(L.button)}
        data-testid="overlay-button"
        data-overlay="button"
        data-faded={buttonFaded || undefined}
      >
        <ActionButton wrap small={L.small} className="h-full! min-h-0! px-2! py-1! disabled:opacity-90!" />
        <IntentMarker note={NOTE.A2} at="tl" />
      </span>
    </div>
  );
}

/** Under this a side column drops the month's label and the big clock for a compact one. */
const SIDE_ROOM_FULL = 90;
