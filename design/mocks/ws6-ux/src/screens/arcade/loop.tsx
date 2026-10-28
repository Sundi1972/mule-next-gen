import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { GLINT_RACE, ME, newWorld, SCRAMBLE_RACE, TRACK, WOLF_START } from './fixture';
import { callGlint, callScramble, callWolves, DEFAULT_TUNABLES, setBot, step, teleport, type Input, type P, type Space, type Tunables, type WalkTerrain, type World } from './sim';

/** How a page's turn starts: as the table has it, or (#arcade-wolves) Lena on forest with a pack due in about 2 s. */
export type Scenario = 'table' | 'wolves' | 'glint' | 'scramble';
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
}

export class Arcade {
  world: World;
  tunables: Tunables;
  controls: Controls = { keys: new Set(), stick: null, mouse: null, action: false };
  private worldListeners = new Set<Listener>();
  private tunListeners = new Set<Listener>();

  scenario: Scenario;

  constructor(tunables: Tunables = DEFAULT_TUNABLES, scenario: Scenario = 'table') {
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
    c.action = false;
    if (c.stick && Math.hypot(c.stick.x, c.stick.y) > 0.08) return { dir: c.stick, action };
    const k = c.keys;
    const dir = { x: (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0), y: (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0) };
    if (dir.x || dir.y) return { dir, action };
    return { dir: { x: 0, y: 0 }, action, toward: c.mouse };
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

  setTunables(t: Tunables) {
    this.tunables = t;
    for (const l of this.tunListeners) l();
    this.emit();
  }

  restart() {
    const autopilot = this.world.colonists.find((c) => c.id === ME)?.bot ?? false;
    this.world = setBot(this.fresh(), ME, autopilot);
    this.controls = { keys: new Set(), stick: null, mouse: null, action: false };
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
