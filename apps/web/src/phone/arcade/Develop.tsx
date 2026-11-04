import { DEV_WALK } from '@mule/engine';
import { ActionButton, cx, Joystick, Panel, SharedClock, YourPace, type Condition } from '@mule/ui';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useTableChat } from '../../chat/store';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useClient } from '../../net/react';
import { usePhoneGame } from '../game';
import { WIDE_PX } from '../Shell';
import { keyDown, keyUp } from './controls';
import { colonistBox, css, FRAMES, freeRun, overlap, phoneLayout, tileBox, type Box } from './layout';
import { PhoneLive, useArcade, useLive } from './live';
import { ChatTicker, CompactClock, GroundChip, GuideNote, LeadChip, Money, OverCard, PaceLine, PlotCard, PlotsLegend, Reconnecting, WaitWords, waitWords } from './parts';
import { arcadeSeat, type ArcadeSeat } from './seat';
import { SeatProvider, YourStage } from './stages';

/**
 * Development, steered (arcade spec C11): the approved mock's landscape phone (Phone.tsx::PhoneLandscape) and laptop
 * (Laptop.tsx) at d30ae057, grafted onto the view, the frames and your own prediction. The server is the truth: the
 * button says its reach, the frames say where everyone stands, and a press is only a request.
 */
export function ArcadeDevelop() {
  const box = useRef<HTMLDivElement>(null);
  const frame = useFrameSize(box);
  return (
    <div ref={box} className="h-full w-full">
      <PhoneLive>{frame.w >= WIDE_PX ? <LaptopArcade frame={frame} /> : <PhoneLandscape frame={frame} />}</PhoneLive>
    </div>
  );
}

const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** The screen's own size, measured; the harness's phone frame before the first measure (and in a static render). */
function useFrameSize(box: RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: FRAMES[844].w, h: FRAMES[844].h });
  useBeforePaint(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // A screen not laid out yet (hidden, or 0 wide) keeps the size it had.
    const measure = () => el.clientWidth > 0 && setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  return size;
}

/** Fed and well: what the screen shows should the view carry no condition. */
const WELL: Condition = { foodShare: 1, sick: false, sickBecause: null, conditionPace: 1 };

/** This frame's seat, and how many MULEs went in this turn: a plot of yours whose MULE changed since the screen opened. */
function useArcadeSeat(): { seat: ArcadeSeat; installs: number; now: number } {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const live = useLive();
  const now = client.serverNow();
  const seat = arcadeSeat(view, me, self, live, now);
  const [opened] = useState(() => new Map(view.tiles.filter((t) => t.owner === me.id).map((t) => [`${t.x},${t.y}`, t.outfit])));
  const changed = view.tiles.filter((t) => t.owner === me.id && t.outfit && opened.get(`${t.x},${t.y}`) !== t.outfit).length;
  return { seat, installs: Math.max(changed, me.installedThisTurn ? 1 : 0), now };
}

/**
 * Makes an element the game's keyboard: arrows steer, SPACE presses the action button, and nothing else is taken from
 * the page. Focused on load; `focused` drives the "click the game to steer" hint, and a blur lets go of every key.
 */
function useGameKeys() {
  const arcade = useArcade();
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const listeners = useRef(new Set<() => void>());
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const emit = () => listeners.current.forEach((l) => l());
    const down = (e: KeyboardEvent) => keyDown(arcade.controls, e, arcade.press);
    const up = (e: KeyboardEvent) => keyUp(arcade.controls, e);
    const focus = () => {
      focusedRef.current = true;
      emit();
    };
    const blur = () => {
      focusedRef.current = false;
      arcade.controls.keys.clear();
      emit();
    };
    el.addEventListener('keydown', down);
    el.addEventListener('keyup', up);
    el.addEventListener('focus', focus);
    el.addEventListener('blur', blur);
    el.focus({ preventScroll: true });
    return () => {
      el.removeEventListener('keydown', down);
      el.removeEventListener('keyup', up);
      el.removeEventListener('focus', focus);
      el.removeEventListener('blur', blur);
    };
  }, [arcade]);
  const focused = useSyncExternalStore(
    (l) => {
      listeners.current.add(l);
      return () => listeners.current.delete(l);
    },
    () => focusedRef.current,
    () => false,
  );
  return { ref, focused, focus: () => ref.current?.focus({ preventScroll: true }) };
}

/**
 * Whether a speech bubble inside `stage` meets the `over` element: measured every frame while a bubble shows, since
 * speakers move and a bubble slides to fit.
 */
function useBubbleMeets(stage: RefObject<HTMLElement | null>, over: RefObject<HTMLElement | null>, on: boolean): boolean {
  const [meets, setMeets] = useState(false);
  useBeforePaint(() => {
    if (!on) {
      setMeets(false);
      return;
    }
    let raf = 0;
    const measure = () => {
      raf = requestAnimationFrame(measure);
      const bubble = stage.current?.querySelector('[data-testid^=chat-bubble-]')?.getBoundingClientRect();
      const box = over.current?.getBoundingClientRect();
      setMeets(!!bubble && !!box && bubble.left < box.right && box.left < bubble.right && bubble.top < box.bottom && box.top < bubble.bottom);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [on, stage, over]);
  return meets;
}

const near = (r: Box, p: { x: number; y: number } | null, by: number) => !!p && p.x > r.x - by && p.x < r.x + r.w + by && p.y > r.y - by && p.y < r.y + r.h + by;

/** A control over a plot of yours (AM-20): translucent, so the plot's marks read through, and still plainly a control. */
const OVER_YOUR_PLOTS = 'opacity-60';

/** Under this a side column drops the month's label and the big clock for a compact one. */
const SIDE_ROOM_FULL = 90;

/**
 * V-3's card over the map, as shares of the map: where the mock places it, rows 1 to 4 of the 15 × 9 map's columns 5
 * to 14; and when your colonist or the target is under that, the map's other half, columns 0 to 9 (spec AM-20).
 */
const CARDS = [
  { x: 4.15 / 15, y: 0.95 / 9, w: 9.7 / 15, h: 3 / 9 },
  { x: 0.15 / 15, y: 0.95 / 9, w: 9.7 / 15, h: 3 / 9 },
];

function Button({ seat, small, className }: { seat: ArcadeSeat; small?: boolean; className?: string }) {
  const arcade = useArcade();
  const r = seat.reach;
  return <ActionButton verb={r.verb} detail={r.detail} enabled={r.enabled} onPress={arcade.press} wrap small={!!small} {...(className ? { className } : {})} />;
}

function Stick({ size, className }: { size: number; className: string }) {
  const arcade = useArcade();
  return <Joystick size={size} className={className} onStick={(at) => (arcade.controls.stick = at)} />;
}

/**
 * Your phone, held sideways: the whole map fills the screen, the joystick under your left thumb and the one button
 * under your right lie over it, translucent. Your next step is ringed on the map or in the hall, so the phone alone
 * shows where to go, with no TV. A control fades to near-clear while you, or the ringed target, are under or beside
 * it. At 667 × 375 the same, scaled to the frame, the status in a bar over the map's top edge (layout.ts).
 */
export function PhoneLandscape({ frame }: { frame: { w: number; h: number } }) {
  const { seat, installs, now } = useArcadeSeat();
  const keys = useGameKeys();
  const { view, me } = seat;
  const space = seat.mine?.space ?? 'map';
  const L = phoneLayout(frame, space, view.width, view.height);
  const onFrame = (p: { x: number; y: number }) => ({ x: L.stage.x + p.x * L.cell, y: L.stage.y + p.y * L.cell });
  const mePx = seat.mine ? onFrame(seat.mine) : null;
  const g = seat.guide;
  const spots = g?.space === 'map' && space === 'map' ? g.spots : [];
  const targets = spots.map((s) => onFrame({ x: s.at.x + 0.5, y: s.at.y + 0.5 }));
  const fade = (r: Box) => near(r, mePx, L.cell * 0.8) || targets.some((t) => near(r, t, L.cell * 0.5));
  const stickFaded = fade(L.stick);
  const buttonFaded = fade(L.button);
  // Over a plot of yours a control is translucent, so the plot's marks read through it (AM-20); near you or the target
  // it fades further, near-clear, as the scaffold has it.
  const myPlots = space === 'map' ? view.tiles.filter((t) => t.owner === me.id) : [];
  const overMine = (r: Box) => myPlots.some((t) => overlap(r, tileBox(L, t)) > 0);
  const look = (faded: boolean, r: Box) => (faded ? 'opacity-25' : overMine(r) ? OVER_YOUR_PLOTS : 'opacity-100');
  // At 667 the status bar: row 0's widest run with no plot of yours and no target on it.
  let bar: Box | null = null;
  if (L.mode === 'top') {
    const blocked = [...view.tiles.filter((t) => t.owner === me.id && t.y === 0).map((t) => t.x), ...spots.filter((s) => s.at.y === 0).map((s) => s.at.x)];
    const [c0, c1] = freeRun(view.width, blocked);
    bar = { x: L.stage.x + c0 * L.cell + 3, y: L.stage.y + 2, w: (c1 - c0 + 1) * L.cell - 6, h: L.cell - 6 };
  }
  // The bar fades while you walk under it, and while a speech bubble meets it: the bubble then paints above it.
  const stageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { showing } = useTableChat();
  const bubbleOverBar = useBubbleMeets(stageRef, barRef, !!bar && !!showing);
  const barFaded = !!bar && (near(bar, mePx, L.cell * 0.5) || bubbleOverBar);
  // The card covers neither your colonist nor the target (AM-20): the first of its places clear of both. Under both
  // places at once (your plot in columns 5 to 9 of rows 1 to 3) it is not drawn: the button's words still say what a
  // press does there, and your colonist stays in sight (ruled with AM-20).
  const target = seat.target;
  const clearOf: Box[] = [
    ...(seat.mine && space === 'map' ? [colonistBox(L, seat.mine)] : []),
    ...spots.map((s) => tileBox(L, s.at)),
    ...(target && 'tile' in target ? [tileBox(L, target.tile)] : target && 'door' in target ? [tileBox(L, seat.store)] : []),
  ];
  const card: Box | null =
    space === 'map'
      ? (CARDS.map((c) => ({ x: L.stage.x + c.x * L.stage.w, y: L.stage.y + c.y * L.stage.h, w: c.w * L.stage.w, h: c.h * L.stage.h })).find((b) => clearOf.every((k) => overlap(b, k) === 0)) ?? null)
      : null;
  const bannerFaded = near(L.banner, mePx, L.cell * 0.4);
  const choosing = space === 'hall' && me.carriedMule === 'empty';
  const compactLeft = !!L.left && L.left.w < SIDE_ROOM_FULL;
  const waits = !!waitWords(seat);
  // A full side room with nothing waiting: the month's label, and the newest line wrapped under the clock.
  const roomy = !compactLeft && !waits;
  const keysHint = !keys.focused && !compactLeft && (
    <span className="rounded-chip bg-panel/90 px-1 py-0.5 text-[10px] leading-tight text-ink-2 shadow-chip" data-testid="focus-hint">
      Click the game to steer with the keys
    </span>
  );
  return (
    <SeatProvider value={seat}>
      <div
        ref={keys.ref}
        tabIndex={0}
        onPointerDown={keys.focus}
        className="relative h-full w-full overflow-hidden bg-table text-ink outline-none"
        data-testid="phone-game"
        data-variant="landscape"
        data-size={L.small ? 667 : 844}
        data-mode={L.mode}
        data-focused={keys.focused}
        // The measurement surface for the overlap check: the store's tile and each of your plots.
        data-store={`${seat.store.x},${seat.store.y}`}
        data-my-plots={view.tiles.filter((t) => t.owner === me.id).map((t) => `${t.x},${t.y}`).join(' ')}
      >
        <div ref={stageRef} className="absolute" style={css(L.stage)} data-testid="phone-stage">
          <YourStage seat={seat} width={L.stage.w} height={L.stage.h} density="phone" guide walkersOnTop={bubbleOverBar} />
          <OverCard seat={seat} installs={installs} />
        </div>
        {/* The status: in the side room either side of the map (nothing of it over the map), or at 667 a bar over the
            map's top edge, clear of your plots and the target. The left room stops above the stick, and the phone always
            shows the newest line: a speaker in the other space is drawn nowhere here. */}
        {L.left && (
          <div className={cx('absolute flex flex-col overflow-hidden', compactLeft ? 'gap-1.5 p-1' : waits ? 'gap-1 px-1.5 pb-0 pt-1.5' : 'gap-1.5 p-1.5')} style={{ left: L.left.x, top: L.left.y, width: L.left.w, height: L.left.h }} data-testid="phone-status-left" data-overlay="status-left">
            {roomy && <span className="label-caps text-[10px]! leading-tight">M{view.month} · Development</span>}
            <Money seat={seat} className={compactLeft ? 'text-[11px] [&_*]:whitespace-nowrap' : 'text-base'} />
            {compactLeft ? <CompactClock seat={seat} /> : <SharedClock seconds={seat.seconds} total={seat.total} />}
            {/* With room, the newest line wraps under the clock and keeps its rows. */}
            {roomy && (
              <div className="shrink-0">
                <ChatTicker seat={seat} keep={1} wrap />
              </div>
            )}
            {/* The wait words say why the clock waits, so they never give way: the month's label makes room for them,
                and the newest line drops to one cut row under them, the first thing cut should the room run short. */}
            {waits && (
              <div className="shrink-0" data-testid="wait-room">
                <WaitWords seat={seat} short={compactLeft} />
              </div>
            )}
            {!roomy && (
              <div className={cx('min-h-0 overflow-hidden', compactLeft && 'mt-auto')} data-testid="chat-foot">
                <ChatTicker seat={seat} keep={1} />
              </div>
            )}
            {roomy && keysHint}
          </div>
        )}
        {L.right && (
          <div className="absolute flex flex-col gap-1.5 p-1.5" style={{ left: L.right.x, top: L.right.y, width: L.right.w }} data-testid="phone-status-right" data-overlay="status-right">
            <span className="relative min-w-0">
              <LeadChip seat={seat} className="w-full flex-wrap! gap-x-1! px-1! text-xs! [&_span]:whitespace-normal!" />
            </span>
            <span className="relative min-w-0">
              <GroundChip seat={seat} className="w-full flex-wrap! gap-x-1! px-1! text-xs! [&_span]:whitespace-normal!" />
            </span>
            <PaceLine seat={seat} short={choosing || L.small} />
            {choosing && <PlotsLegend seat={seat} short={L.small} />}
            {/* While the wait fills the left room, the keys hint stands here instead. */}
            {waits && keysHint}
          </div>
        )}
        {bar && (
          <div
            ref={barRef}
            className={cx('absolute z-20 flex items-center gap-2 rounded-chip border border-holo-faint bg-panel/88 px-2 text-xs shadow-chip backdrop-blur-[2px] transition-opacity duration-200', barFaded && 'opacity-25')}
            style={{ left: bar.x, top: bar.y, width: bar.w, minHeight: bar.h }}
            data-testid="phone-status-bar"
            data-overlay="status-bar"
            data-faded={barFaded || undefined}
          >
            <Money seat={seat} className="text-xs" />
            <CompactClock seat={seat} />
            <WaitWords seat={seat} short />
            <span className="relative min-w-0 shrink">
              <LeadChip seat={seat} className="px-1! text-[11px]!" />
            </span>
            <span className="min-w-0 shrink">
              <PaceLine seat={seat} short />
            </span>
            {/* The newest line keeps a share of the bar however much the status says: the rest of it gives way first. */}
            <span className="min-w-0 flex-[1_1_40%]">
              <ChatTicker seat={seat} keep={1} />
            </span>
          </div>
        )}
        {card && <PlotCard seat={seat} now={now} at={{ left: card.x, top: card.y, width: card.w, maxHeight: card.h }} />}
        {/* The banner box: the guide's note (V-7); on the map along the bottom row between the stick and the button, in
            the hall across the walkway. It fades while you walk under it. */}
        <div className="pointer-events-none absolute z-20 flex items-center justify-center" style={css(L.banner)} data-testid="scramble-banner-box">
          <GuideNote seat={seat} faded={bannerFaded} />
        </div>
        {/* The controls, over the bottom corners. */}
        <span
          className={cx('absolute z-30 transition-opacity duration-200', look(stickFaded, L.stick))}
          style={{ left: L.stick.x, top: L.stick.y }}
          data-testid="overlay-stick"
          data-overlay="stick"
          data-faded={stickFaded || undefined}
          data-over-plot={(!stickFaded && overMine(L.stick)) || undefined}
        >
          <Stick size={L.stick.w} className="border-holo/60! bg-panel/30! backdrop-blur-[2px]" />
        </span>
        <span
          className={cx('absolute z-30 rounded-panel bg-panel/80 p-1 shadow-map backdrop-blur-[2px] transition-opacity duration-200', look(buttonFaded, L.button))}
          style={css(L.button)}
          data-testid="overlay-button"
          data-overlay="button"
          data-faded={buttonFaded || undefined}
          data-over-plot={(!buttonFaded && overMine(L.button)) || undefined}
        >
          <Button seat={seat} small={L.small} className="h-full! min-h-0! px-2! py-1! disabled:opacity-90!" />
        </span>
        <Reconnecting seat={seat} />
      </div>
    </SeatProvider>
  );
}

const KEYS: [string, string][] = [
  ['← ↑ → ↓', 'walk (two at once: diagonally)'],
  ['SPACE', 'the action button'],
  ['Mouse', 'hold a spot to walk to it; click the glowing thing to act'],
];

/** The laptop's rail beside its stage, and the page's padding and header, as the mock lays out 1440 × 900. */
const RAIL = { w: 252, gap: 24, padX: 32, chrome: 160 };

/**
 * Development on a laptop: where you are fills the stage, the map or the store's hall, and the rail holds the one
 * action button, your pace, the land underfoot and your MULE. Arrow keys, SPACE, or the mouse.
 */
export function LaptopArcade({ frame }: { frame: { w: number; h: number } }) {
  const { seat, installs } = useArcadeSeat();
  const keys = useGameKeys();
  const { view, me, self } = seat;
  const arcade = useArcade();
  const stageW = Math.min(frame.w - 2 * RAIL.padX - RAIL.gap - RAIL.w, ((frame.h - RAIL.chrome) * view.width) / view.height);
  const stageH = (stageW * view.height) / view.width;
  const r = seat.reach;
  return (
    <SeatProvider value={seat}>
      <div ref={keys.ref} tabIndex={0} onPointerDown={keys.focus} className="relative flex h-full w-full flex-col gap-4 bg-table px-8 py-6 text-ink outline-none" data-testid="laptop-game" data-focused={keys.focused}>
        <header className="flex items-center gap-6">
          <div className="flex shrink-0 flex-col">
            <span className="label-caps">Month {view.month}</span>
            <h1 className="font-display text-3xl font-semibold leading-none">Development</h1>
          </div>
          <div className="min-w-0 flex-1">
            <SharedClock seconds={seat.seconds} total={seat.total} />
          </div>
          <Money seat={seat} className="text-2xl" />
          <ThemeToggle />
        </header>
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="relative shrink-0">
            <YourStage seat={seat} width={stageW} height={stageH} density="wide" />
            {!keys.focused && (
              <span className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-panel/90 px-3 py-1 text-sm text-ink-2 shadow-chip" data-testid="focus-hint">
                Click the game to steer
              </span>
            )}
            <OverCard seat={seat} installs={installs} className="inset-x-auto left-1/2 w-[420px] -translate-x-1/2" />
          </div>
          <aside className="flex min-w-0 flex-1 flex-col gap-4" data-testid="laptop-rail">
            <ActionButton verb={r.verb} detail={r.detail} enabled={r.enabled} onPress={arcade.press} hint="SPACE" />
            <YourPace condition={self.condition ?? WELL} rule={DEV_WALK} food={{ ate: Math.min(me.stock.food, me.needs.food), need: me.needs.food }} />
            <span className="relative flex flex-col items-start gap-2">
              <GroundChip seat={seat} />
            </span>
            <span className="relative flex flex-col items-start">
              <LeadChip seat={seat} />
            </span>
            {/* On a short window the chat panel is what folds, its older line first: Controls stays in sight. */}
            <Panel title="Table chat" className="min-h-0 overflow-hidden">
              <ChatTicker seat={seat} keep={2} wrap wide />
            </Panel>
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
        <Reconnecting seat={seat} />
      </div>
    </SeatProvider>
  );
}

