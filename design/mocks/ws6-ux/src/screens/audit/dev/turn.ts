import { DEVELOPMENT, type Good, type Ground, type Outfit } from '@mule/engine';
import type { MuleView, TileView } from '@mule/protocol';
import { useEffect, useRef, useState } from 'react';
import { DEV_WALK_STAND_IN, paceOf, type Condition } from '../../../proposed/Condition';
import { SPOT, type Spot, type Visitor } from '../../../proposed/Hall';
import { bestFreePlot, GROUND, key, same, STORE } from './fixture';
import type { Arrow } from './parts';

/**
 * Lena's development turn, played in the mock (fixture data, no server). Walking is the audit's V-1: on the map she
 * walks a plot at a time along rows and columns (DEV_WALK's 0.4 s a step, divided by her pace), the path dotted ahead
 * of her; a tap on a plot only offers the walk. In the store a tap walks her across the floor (1 s at full pace), and
 * the room acts when she arrives. Analysing takes DEVELOPMENT.analysisSeconds, standing on the plot.
 */

export const FULL = DEVELOPMENT.fullSeconds;
export const ANALYSE = DEVELOPMENT.analysisSeconds;

export type Cell = { x: number; y: number };
export type Lead = Visitor['leading'];

export interface TurnStart {
  month: 1 | 2;
  money: number;
  place: 'store' | 'map';
  leading: Lead;
  /** In the store: where she stands. */
  hallAt?: Spot;
  /** On the map: the plot she stands on. */
  cell?: Cell;
  /** On the map: the plot she has tapped. */
  selected?: Cell | null;
  /** Seconds of everyone's clock already gone when the state opens. */
  elapsed?: number;
  /** V-8: the first month's clock waits for the first MULEs. */
  clockWaits?: boolean;
  /** Plots analysed before the state opens, beyond the fixture's. */
  analysed?: Cell[];
}

/**
 * V-8's model, as the mock shows it: one clock for everyone still, so it starts when every colonist's first MULE is
 * in. The others' first MULEs go in at these seconds (fixture: Ossa, an AI, at once; Kai and Brix while Lena shops).
 */
export const FIRST_MULE_AT: Record<string, number> = { ossa: 0, kai: 6, brix: 14 };

/** A plot's ground when it is not one of Lena's (the mock only analyses hers for real). */
const SOME_GROUND: Ground = { food: 0, water: 1, energy: 1, smithore: 1, crystite: 0, rareEarth: 0 };

/** The plots between two, along the row first and then the column (no diagonals), the end included. */
export function route(from: Cell, to: Cell): Cell[] {
  const out: Cell[] = [];
  let { x, y } = from;
  while (x !== to.x) out.push({ x: (x += Math.sign(to.x - x)), y });
  while (y !== to.y) out.push({ x, y: (y += Math.sign(to.y - y)) });
  return out;
}

const STEP: Record<Arrow, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export function useDevTurn(start: TurnStart, base: MuleView, cond: Condition) {
  /** Lena is a Zipwing: the species' pace times her condition's (47% in month 2). */
  const pace = DEV_WALK_STAND_IN.zipwingPace * paceOf(cond);
  const stepSecs = DEV_WALK_STAND_IN.tileSeconds / pace;
  const hallSecs = DEV_WALK_STAND_IN.hallSeconds / pace;

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const id of set) clearTimeout(id);
      set.clear();
    };
  }, []);

  const [t, setT] = useState(0);
  const tRef = useRef(0);
  tRef.current = t;
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, []);

  const [place, setPlace] = useState(start.place);
  const [money, setMoney] = useState(start.money);
  const moneyRef = useRef(money);
  moneyRef.current = money;
  const [leading, setLeadingState] = useState<Lead>(start.leading);
  const leadRef = useRef<Lead>(start.leading);
  const setLeading = (l: Lead) => {
    leadRef.current = l;
    setLeadingState(l);
  };
  const [corral, setCorral] = useState(base.storeMules);

  // The store floor.
  const startHall = SPOT[start.hallAt ?? 'doorL'];
  const [hall, setHall] = useState({ at: startHall, walk: 0, moving: false });
  const hallAt = useRef(startHall);
  const [hallPath, setHallPath] = useState<{ from: Cell; to: Cell } | null>(null);
  const [walkingTo, setWalkingTo] = useState<Spot | null>(null);

  // The map.
  const [cell, setCellState] = useState<Cell>(start.cell ?? STORE);
  const cellRef = useRef(cell);
  const setCell = (c: Cell) => {
    cellRef.current = c;
    setCellState(c);
  };
  const [moving, setMoving] = useState(false);
  /** A walk to a plot (Walk here) or one arrow key's step: only the first is "walking to" somewhere. */
  const [walkMode, setWalkMode] = useState<'route' | 'arrow' | null>(null);
  const [ahead, setAhead] = useState<Cell[]>([]);
  const [selected, setSelected] = useState<Cell | null>(start.selected ?? null);
  const [lit, setLit] = useState<Arrow | null>(null);
  const busy = useRef(false);

  // Lena's plots as the turn changes them: what stands on each, what she has analysed.
  const [plots, setPlots] = useState<Record<string, { outfit: Outfit | null; ground?: Ground }>>(() => {
    const out: Record<string, { outfit: Outfit | null; ground?: Ground }> = {};
    for (const tile of base.tiles) if (tile.owner === 'lena' || tile.ground) out[key(tile)] = { outfit: tile.outfit, ...(tile.ground ? { ground: tile.ground } : {}) };
    for (const c of start.analysed ?? []) out[key(c)] = { ...(out[key(c)] ?? { outfit: null }), ground: GROUND[key(c)] ?? SOME_GROUND };
    return out;
  });
  const [analysing, setAnalysing] = useState<{ at: Cell; from: number } | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ranAway, setRanAway] = useState<Outfit | null>(null);
  const [done, setDone] = useState<{ pub: number } | null>(null);

  // Everyone's clock. V-8: in the first month it stands until every first MULE is in (Lena's and the others').
  const [lenaInAt, setLenaInAt] = useState<number | null>(null);
  const othersIn = Math.max(...Object.values(FIRST_MULE_AT));
  const clockFrom = start.clockWaits ? (lenaInAt === null ? null : Math.max(lenaInAt, othersIn)) : -(start.elapsed ?? 0);
  const left = done ? 0 : clockFrom === null || t < clockFrom ? FULL : Math.max(0, FULL - (t - clockFrom));
  const waiting = start.clockWaits ? clockFrom === null || t < clockFrom : false;
  /** The pub's own sum (engine visitPub), from the whole seconds the clock shows. */
  const pubFor = (secs: number) => Math.round(DEVELOPMENT.pub.base + (DEVELOPMENT.pub.start + base.month * DEVELOPMENT.pub.perMonth) * Math.min(1, Math.ceil(secs) / FULL));
  const pub = pubFor(left);
  const leftRef = useRef(left);
  leftRef.current = left;

  // The view the screens read: the base fixture with this turn's money and plots.
  const tiles: TileView[] = base.tiles.map((tile) => {
    const p = plots[key(tile)];
    if (!p) return tile;
    const { ground: _g, ...rest } = tile;
    return { ...rest, outfit: p.outfit, ...(p.ground ? { ground: p.ground } : {}) };
  });
  const view: MuleView = { ...base, tiles, storeMules: corral, players: base.players.map((p) => (p.id === 'lena' ? { ...p, money } : p)) };
  const tileOf = (c: Cell | null) => (c ? tiles[c.y * base.width + c.x] : undefined);

  const outfitted = leading !== null && leading !== 'empty';
  /** V-2: where the guide sends an outfitted MULE: the best of her free plots for its good. */
  const guidePlot = outfitted ? (bestFreePlot(view, leading as Good, STORE) ?? null) : null;

  const enterStore = () => {
    setPlace('store');
    setSelected(null);
    setAhead([]);
    hallAt.current = SPOT.doorR;
    setHall({ at: SPOT.doorR, walk: 0, moving: false });
  };

  /** On the map, one plot at a time; then what the walk was for. */
  const walkCells = (cells: Cell[], then?: () => void) => {
    const [next, ...rest] = cells;
    if (!next) {
      setMoving(false);
      setWalkMode(null);
      setAhead([]);
      busy.current = false;
      then?.();
      return;
    }
    setCell(next);
    setAhead(rest);
    setMoving(true);
    later(stepSecs * 1000, () => walkCells(rest, then));
  };
  const walkTo = (to: Cell, then?: () => void) => {
    if (busy.current || done) return;
    busy.current = true;
    setWalkMode('route');
    walkCells(route(cellRef.current, to), then);
  };

  const startAnalysis = () => {
    const at = cellRef.current;
    busy.current = true;
    setAnalysing({ at, from: tRef.current });
    later(ANALYSE * 1000, () => {
      setPlots((p) => ({ ...p, [key(at)]: { ...(p[key(at)] ?? { outfit: null }), ground: GROUND[key(at)] ?? SOME_GROUND } }));
      setAnalysing(null);
      busy.current = false;
    });
  };

  /** What a room does once she stands in front of it. */
  const arrive = (spot: Spot, fit?: Good) => {
    const lead = leadRef.current;
    if (spot === 'doorL' || spot === 'doorR') {
      setPlace('map');
      setCell(STORE);
      // Walking out with an outfitted MULE, the guide's plot is tapped for her: the walk is offered, never started.
      const pick = lead && lead !== 'empty' ? bestFreePlot(view, lead, STORE) : null;
      setSelected(pick ? { x: pick.plot.x, y: pick.plot.y } : null);
    } else if (spot === 'pub') setDone({ pub: pubFor(leftRef.current) });
    else if (spot === 'corral' && lead === null && moneyRef.current >= base.mulePrice) {
      setMoney((m) => m - base.mulePrice);
      setCorral((c) => c - 1);
      setLeading('empty');
    } else if (lead === 'empty' && spot !== 'corral' && spot !== 'greenBelt') {
      const good = spot === 'works' ? fit : (spot as Good);
      const cost = good ? (base.me?.outfitCosts[good] ?? 0) : 0;
      if (good && moneyRef.current >= cost) {
        setMoney((m) => m - cost);
        setLeading(good);
      }
    }
  };

  /** In the store: she walks across the floor, dotted, and the room acts when she gets there. */
  const go = (spot: Spot, fit?: Good) => {
    if (busy.current || done) return;
    busy.current = true;
    const from = hallAt.current;
    const to = SPOT[spot];
    hallAt.current = to;
    setHallPath({ from, to });
    setWalkingTo(spot);
    setHall({ at: to, walk: hallSecs, moving: true });
    later(hallSecs * 1000, () => {
      busy.current = false;
      setHallPath(null);
      setWalkingTo(null);
      setHall((h) => ({ ...h, moving: false }));
      arrive(spot, fit);
    });
  };

  /** A laptop's arrow key: one plot that way. Onto the store's plot, she goes in. */
  const arrow = (k: Arrow) => {
    if (busy.current || done || place !== 'map') return;
    const [dx, dy] = STEP[k];
    const next = { x: Math.max(0, Math.min(base.width - 1, cellRef.current.x + dx)), y: Math.max(0, Math.min(base.height - 1, cellRef.current.y + dy)) };
    if (same(next, cellRef.current)) return;
    setLit(k);
    later(stepSecs * 1000, () => setLit((l) => (l === k ? null : l)));
    busy.current = true;
    setWalkMode('arrow');
    walkCells([next], () => (same(next, STORE) ? enterStore() : undefined));
  };

  const install = () => {
    const at = cellRef.current;
    const lead = leadRef.current;
    if (!lead || lead === 'empty' || busy.current) return;
    const old = plots[key(at)]?.outfit ?? null;
    setPlots((p) => ({ ...p, [key(at)]: { ...(p[key(at)] ?? {}), outfit: lead } }));
    setLeading(null);
    setRanAway(old);
    setInstalled(true);
    if (start.clockWaits && lenaInAt === null) setLenaInAt(tRef.current);
  };

  // Out of time: the turn ends where she stands.
  useEffect(() => {
    if (!done && !waiting && left <= 0) setDone({ pub: 0 });
  }, [left, done, waiting]);

  return {
    t,
    pace,
    stepSecs,
    hallSecs,
    place,
    money,
    leading,
    outfitted,
    corral,
    hall,
    hallPath,
    walkingTo,
    cell,
    moving,
    /** Walking to a plot by Walk here (not one arrow step). */
    routing: walkMode === 'route',
    ahead,
    selected,
    lit,
    plots,
    analysing,
    installed,
    ranAway,
    done,
    left,
    waiting,
    lenaIn: lenaInAt !== null,
    pub,
    view,
    tileOf,
    guidePlot,
    there: walkMode !== 'route' && same(cell, selected),
    busy: () => busy.current,
    select: (c: Cell | null) => (walkMode === 'route' ? undefined : setSelected(c)),
    go,
    walkTo,
    walkAndAnalyse: (to: Cell) => walkTo(to, startAnalysis),
    analyse: () => !busy.current && startAnalysis(),
    install,
    arrow,
    toStore: () => (same(cellRef.current, STORE) ? enterStore() : walkTo(STORE, enterStore)),
    toPub: () =>
      walkTo(STORE, () => {
        enterStore();
        later(50, () => go('pub'));
      }),
  };
}

export type Turn = ReturnType<typeof useDevTurn>;
