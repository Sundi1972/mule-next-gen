import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { ADDENDUM, GLINT_RACE, ME, newWorld, SCRAMBLE_RACE, TRACK, WOLF_START } from './fixture';
import { callGlint, callScramble, callWolves, DEFAULT_TUNABLES, mulePrice, setBot, step, teleport, type Colonist, type Input, type P, type Space, type Tunables, type WalkTerrain, type World } from './sim';

/** How a page's turn starts: as the table has it, or (#arcade-wolves) Lena on forest with a pack due in about 2 s. */
export type Scenario = 'table' | 'wolves' | 'glint' | 'scramble' | 'plots' | 'analyse' | 'reoutfit' | 'pace' | 'broke';
const WOLVES_DUE_MS = 2000;

/**
 * The imperative shell: one requestAnimationFrame loop per page, stepping the pure sim at a fixed 60 Hz and feeding
 * every view on the page (phone, laptop, TV, the tunables' readout) the same world. Inputs from keys, the joystick
 * and the mouse land in one mutable box; the loop turns them into this step's Input for Lena.
 */

const STEP_MS = 1000 / 60;
/** After a stall (a hidden tab), catch up at most this many steps rather than fast-forwarding the turn. */
const MAX_STEPS = 6;

type Listener = () => void;

/** What the controls write and the loop reads: never React state, so a key press costs no render. */
interface Controls {
  keys: Set<string>;
  stick: P | null;
  mouse: (P & { space: Space }) | null;
  action: boolean;
  /** The second choice (the line above the button, or A): V-3's ANALYSE, V-5's filter. */
  alt: boolean;
}

const ADDENDUM_SCENARIOS: Scenario[] = ['plots', 'analyse', 'reoutfit', 'pace', 'broke'];

/**
 * The addendum's starts (fixture.ts ADDENDUM): Lena placed at the moment each change is about. The seeded moments wait
 * 20 s, as on the scramble's route, so the first look is the change itself.
 */
function addendumStart(w0: World, scenario: Scenario, tun: Tunables): World {
  const calm = (w: World): World => ({ ...w, glintAfter: 20_000, colonists: w.colonists.map((c) => ({ ...c, wolvesAfter: 20_000 })) });
  const lena = (w: World, f: (c: Colonist) => Colonist): World => ({ ...w, colonists: w.colonists.map((c) => (c.id === ME ? f(c) : c)) });
  const inHall = (c: Colonist, at: P): Colonist => ({ ...c, space: 'hall', x: at.x, y: at.y, trail: [], facing: 'right' });
  const price = mulePrice(tun);
  if (scenario === 'plots') {
    const at = ADDENDUM.plots.hall;
    return calm(lena({ ...w0, storeMules: w0.storeMules - 1 }, (c) => ({ ...inHall(c, at), money: c.money - price, mule: { good: null, x: at.x - 0.7, y: at.y, facing: 'right', paid: price } })));
  }
  if (scenario === 'analyse') {
    const { at, good } = ADDENDUM.analyse;
    const w = teleport(w0, ME, { x: at.x + 0.5, y: at.y + 0.6 }, tun);
    const cost = price + tun.outfit[good];
    return calm(lena({ ...w, storeMules: w.storeMules - 1 }, (c) => ({ ...c, money: c.money - cost, mule: { good, x: at.x - 0.2, y: at.y + 0.6, facing: 'right', paid: cost }, trail: [{ x: at.x - 0.2, y: at.y + 0.6 }, { x: c.x, y: c.y }] })));
  }
  if (scenario === 'reoutfit') return calm(teleport(w0, ME, { x: ADDENDUM.reoutfit.at.x + 0.5, y: ADDENDUM.reoutfit.at.y + 0.6 }, tun));
  if (scenario === 'broke') return calm(lena(w0, (c) => ({ ...inHall(c, ADDENDUM.broke.hall), money: ADDENDUM.broke.money })));
  return calm(w0);
}

export class Arcade {
  world: World;
  tunables: Tunables;
  controls: Controls = { keys: new Set(), stick: null, mouse: null, action: false, alt: false };
  private worldListeners = new Set<Listener>();
  private tunListeners = new Set<Listener>();

  scenario: Scenario;

  constructor(tunables0: Tunables = DEFAULT_TUNABLES, scenario: Scenario = 'table') {
    // V-6's start: Lena ate 1 of the 3 Food she needs, so she walks slower and the side room says why.
    const tunables = scenario === 'pace' ? { ...tunables0, seats: { ...tunables0.seats, [ME]: { ...tunables0.seats[ME]!, food: ADDENDUM.pace.food } } } : tunables0;
    this.tunables = tunables;
    this.scenario = scenario;
    this.world = this.fresh();
  }

  private fresh(): World {
    const w = newWorld(this.tunables);
    if (this.scenario === 'glint') {
      // Lena on the plains, a bot as far on the glint's other side, the glint in about 2 s; no pack for 15 s to spoil it.
      const r = GLINT_RACE;
      const placed = teleport(teleport(w, ME, { x: r.lena.x + 0.5, y: r.lena.y + 0.5 }, this.tunables), r.bot, { x: r.botAt.x + 0.5, y: r.botAt.y + 0.5 }, this.tunables);
      // The racing bot waits where it is till the glint lights, so the two start as far from it.
      const calm = { ...placed, colonists: placed.colonists.map((c) => ({ ...c, wolvesAfter: 15_000, waitUntil: c.id === r.bot ? WOLVES_DUE_MS : 0 })) };
      return callGlint(calm, WOLVES_DUE_MS, r.at, [r.bot]);
    }
    if (this.scenario === 'scramble') {
      // Three MULEs for four colonists, so the first sale starts it; Lena about as far from the store as the nearest
      // bot; no pack and no glint for 20 s to spoil it.
      const r = SCRAMBLE_RACE;
      const placed = teleport(w, ME, { x: r.lena.x + 0.5, y: r.lena.y + 0.5 }, this.tunables);
      return { ...placed, storeMules: r.mules, glintAfter: 20_000, colonists: placed.colonists.map((c) => ({ ...c, wolvesAfter: 20_000 })) };
    }
    if (ADDENDUM_SCENARIOS.includes(this.scenario)) return addendumStart(w, this.scenario, this.tunables);
    if (this.scenario !== 'wolves') return w;
    const placed = teleport(w, ME, { x: WOLF_START.x + 0.5, y: WOLF_START.y + 0.5 }, this.tunables);
    // No chance pack before the called one, so it is always the 2 s one Heiko meets.
    const held = { ...placed, colonists: placed.colonists.map((c) => (c.id === ME ? { ...c, wolvesAfter: WOLVES_DUE_MS + 1 } : c)) };
    return callWolves(held, ME, WOLVES_DUE_MS);
  }

  /** The tunables' "Start a scramble now": the race to the corral, with whatever it holds. */
  callScramble() {
    this.world = callScramble(this.world, 0);
    this.emit();
  }

  /** The tunables' "Call a glint now": a glint at once, on the seed's tile, with the bots' share racing. */
  callGlint() {
    this.world = callGlint(this.world, 0);
    this.emit();
  }

  /** The tunables' "Call the wolves now": a pack for Lena at once, wherever she is on the map. */
  callWolves() {
    this.world = callWolves(this.world, ME, 0);
    this.emit();
  }

  subscribe = (l: Listener) => {
    this.worldListeners.add(l);
    return () => this.worldListeners.delete(l);
  };
  subscribeTunables = (l: Listener) => {
    this.tunListeners.add(l);
    return () => this.tunListeners.delete(l);
  };
  private emit() {
    for (const l of this.worldListeners) l();
  }

  /** This step's input for the human: the stick wins over the keys, the keys over a held mouse. */
  input(): Input {
    const c = this.controls;
    const action = c.action;
    const alt = c.alt;
    c.action = false;
    c.alt = false;
    if (c.stick && Math.hypot(c.stick.x, c.stick.y) > 0.08) return { dir: c.stick, action, alt };
    const k = c.keys;
    const dir = { x: (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0), y: (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0) };
    if (dir.x || dir.y) return { dir, action, alt };
    return { dir: { x: 0, y: 0 }, action, alt, toward: c.mouse };
  }

  tick(ms: number) {
    let n = Math.min(MAX_STEPS, Math.floor(ms / STEP_MS));
    if (n <= 0) return 0;
    const used = n * STEP_MS;
    let w = this.world;
    while (n-- > 0) w = step(w, { [ME]: this.input() }, STEP_MS, this.tunables);
    if (w !== this.world) {
      this.world = w;
      this.emit();
    }
    return used;
  }

  press() {
    this.controls.action = true;
  }

  pressAlt() {
    this.controls.alt = true;
  }

  setTunables(t: Tunables) {
    this.tunables = t;
    for (const l of this.tunListeners) l();
    this.emit();
  }

  restart() {
    const autopilot = this.world.colonists.find((c) => c.id === ME)?.bot ?? false;
    this.world = setBot(this.fresh(), ME, autopilot);
    this.controls = { keys: new Set(), stick: null, mouse: null, action: false, alt: false };
    this.emit();
  }

  dropOn(terrain: WalkTerrain) {
    const at = TRACK[terrain];
    if (!at) return;
    this.world = teleport(this.world, ME, { x: at.x + 0.2, y: at.y + 0.5 }, this.tunables);
    this.emit();
  }

  setAutopilot(on: boolean) {
    this.world = setBot(this.world, ME, on);
    this.emit();
  }
}

const Ctx = createContext<Arcade | null>(null);

/** One arcade per page: every view under it draws the same world. */
export function ArcadeProvider({ children, autopilot = false, scenario = 'table' }: { children: ReactNode; autopilot?: boolean; scenario?: Scenario }) {
  const arcade = useMemo(() => {
    const a = new Arcade(DEFAULT_TUNABLES, scenario);
    if (autopilot) a.setAutopilot(true);
    return a;
  }, [autopilot, scenario]);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const frame = (now: number) => {
      carry += now - last;
      last = now;
      carry -= arcade.tick(carry);
      // A stall longer than the catch-up is dropped, never replayed.
      if (carry > STEP_MS * MAX_STEPS) carry = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [arcade]);
  return <Ctx.Provider value={arcade}>{children}</Ctx.Provider>;
}

export function useArcade(): Arcade {
  const a = useContext(Ctx);
  if (!a) throw new Error('useArcade outside ArcadeProvider');
  return a;
}

export function useWorld(): World {
  const a = useArcade();
  return useSyncExternalStore(a.subscribe, () => a.world);
}

export function useTunables(): Tunables {
  const a = useArcade();
  return useSyncExternalStore(a.subscribeTunables, () => a.tunables);
}

const STEER_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Makes an element the game's keyboard: arrows steer, SPACE presses the action button. preventDefault only for those,
 * so the review loop's S, N and Esc (and ⌥-click) still reach select-client. Focused on load; `focused` drives the
 * "click the game to steer" hint. Pressing an arrow takes Lena back from the autopilot.
 */
export function useGameKeys() {
  const arcade = useArcade();
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const listeners = useRef(new Set<Listener>());
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const emit = () => listeners.current.forEach((l) => l());
    const down = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (STEER_KEYS.has(e.key)) {
        e.preventDefault();
        arcade.controls.keys.add(e.key);
        // Steering takes Lena back from the autopilot.
        if (arcade.world.colonists.find((c) => c.id === ME)?.bot) arcade.setAutopilot(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) arcade.press();
      } else if (e.key === 'a' || e.key === 'A') {
        // The second choice on a keyboard (the review loop keeps S, N and Esc).
        if (!e.repeat) arcade.pressAlt();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (STEER_KEYS.has(e.key)) arcade.controls.keys.delete(e.key);
    };
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
  );
  return { ref, focused, focus: () => ref.current?.focus({ preventScroll: true }) };
}
