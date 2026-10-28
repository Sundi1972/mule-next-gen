import { beat, draw, IDLE, moveColonist, passable, say, tileAt, toward, type Colonist, type Fleeing, type Input, type Loose, type P, type Reach, type Tunables, type World, type WorldEvent } from './sim';

/**
 * Slice 2: wolves (Heiko's G-3). Pure, like the rest of the sim. On forest, hills or tundra a pack may come for a
 * colonist: a seeded roll each step queues a `wolves` event on the world, and its handler (spawnPack) sets the pack
 * around them. Then one choice with the two controls there are: push the stick and RUN (they chase; caught, you are
 * bitten and slowed till the store or your own plot), or press the button and FIGHT (about 10 s in place: dodge the
 * lunges with the stick, strike with the button when a wolf is close). Win and you carry pelts the store buys; lose and
 * your MULE bolts across the map till you catch it, or with no MULE you are stunned. Bots meet them by the same rules.
 *
 * This is the only way a MULE ever runs off (a MULE running off by itself is a non-goal).
 */

export type WolfState = 'prowl' | 'tell' | 'lunge' | 'open' | 'hurt';
export interface Wolf {
  x: number;
  y: number;
  angle: number;
  state: WolfState;
  /** When the state ends. */
  until: number;
  from: P | null;
  /** Where a lunge lands: the spot you stood on when the wolf crouched. */
  target: P | null;
  /** A bot's roll for this lunge: does it dodge? */
  dodge: boolean;
}

export interface Encounter {
  kind: 'choose' | 'chase' | 'fight';
  since: number;
  /** Where it began: the chase's give-up distance runs from here, and the fight stays round it. */
  centre: P;
  wolves: Wolf[];
  strikes: number;
  bites: number;
  nextLunge: number;
  /** A strike at nothing leaves you open this long. */
  recoverUntil: number;
  /** A bot's pick, drawn when the pack came. */
  botFights: boolean;
}

export const WOLF_LAND = ['forest', 'hills', 'tundra'] as const;

/** The fight's shape: display and feel, not balance (the balance numbers are the tunables). */
const RING_CHOOSE = 1.6;
/** The pack's spread round you, in radians: from one side, not a trap. */
const PACK_ARC = 1.9;
/** Wolves take this long to react when you bolt: the run's head start. */
const HEAD_START_MS = 400;
const RING_FIGHT = 1.3;
/** How far you may step from where the fight began. */
export const ARENA = 1;
const LUNGE_MS = 220;
const OPEN_MS = 900;
const HURT_MS = 700;
/** A lunge bites if you are still this close to where it lands. */
export const HIT_R = 0.38;
/** A strike lands on a wolf this close. */
export const STRIKE_REACH = 0.8;
const CATCH_R = 0.35;
const WHIFF_MS = 450;
const PROWL_SPEED = 4;
const FLEE_MS = 1400;
const FLEE_SPEED = 4.5;

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const replace = (w: World, c: Colonist): World => ({ ...w, colonists: w.colonists.map((x) => (x.id === c.id ? c : x)) });
const inMap = (w: World, p: P): P => ({ x: Math.min(w.width - 0.2, Math.max(0.2, p.x)), y: Math.min(w.height - 0.2, Math.max(0.2, p.y)) });
const ringSpot = (w: World, centre: P, angle: number, r: number) => inMap(w, { x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r });

/** Where a wolf can appear: on the ring at this angle, else nearer or a little round it, on land a body could stand on. */
function openSpot(w: World, tun: Tunables, c: P, angle: number): P {
  for (const r of [RING_CHOOSE, 1.3, 1.0])
    for (const da of [0, 0.4, -0.4, 0.8, -0.8]) {
      const p = ringSpot(w, c, angle + da, r);
      if (passable(w, tun, p.x, p.y, null)) return p;
    }
  return ringSpot(w, c, angle, RING_CHOOSE);
}

/** Each step on wolf land, the seed may send a pack: queued as an event, so the world's queue carries every happening. */
export function rollWolves(w: World, c: Colonist, dtMs: number, tun: Tunables): { w: World; c: Colonist } {
  if (!tun.wolves.on || c.space !== 'map' || c.done || c.encounter || w.t < c.wolvesAfter) return { w, c };
  const land = tileAt(w, c.x, c.y)?.terrain;
  if (!land || !(WOLF_LAND as readonly string[]).includes(land)) return { w, c };
  const [u, w2] = draw(w);
  if (u >= (tun.wolves.chancePerSecond * dtMs) / 1000) return { w: w2, c };
  const e: WorldEvent = { atMs: w2.t, kind: 'wolves', target: c.id };
  // Held off until the pack has come and gone; the real cooldown starts when it leaves.
  return { w: { ...w2, queue: [...w2.queue, e].sort((a, b) => a.atMs - b.atMs) }, c: { ...c, wolvesAfter: w2.t + 60_000 } };
}

/** The `wolves` event's handler: the pack appears in a ring round its colonist. */
export function spawnPack(w0: World, e: WorldEvent, tun: Tunables): World {
  const c = w0.colonists.find((x) => x.id === e.target);
  if (!c || c.done || c.space !== 'map' || c.encounter || (!e.forced && !tun.wolves.on)) {
    const why = !c ? 'nobody' : c.encounter ? 'already meeting wolves' : c.space !== 'map' ? 'in the store' : c.done ? 'in the pub' : 'wolves off';
    return { ...w0, log: say(w0, { name: c?.name ?? '?' }, `missed a pack (${why})`) };
  }
  let w = w0;
  const [a0, w1] = draw(w);
  const [f, w2] = draw(w1);
  w = w2;
  const n = Math.max(1, Math.min(6, Math.round(tun.wolves.packSize)));
  // A pack comes from one side, spread over an arc: running away from it is a real way out.
  const wolves: Wolf[] = Array.from({ length: n }, (_, i) => {
    const angle = a0 * Math.PI * 2 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * PACK_ARC);
    const at = openSpot(w, tun, c, angle);
    return { x: at.x, y: at.y, angle, state: 'prowl', until: 0, from: null, target: null, dodge: false };
  });
  const encounter: Encounter = { kind: 'choose', since: w.t, centre: { x: c.x, y: c.y }, wolves, strikes: 0, bites: 0, nextLunge: 0, recoverUntil: 0, botFights: f < tun.wolves.botFightShare };
  w = { ...w, log: say(w, c, 'met wolves'), beats: beat(w, c.id, `Wolves! ${c.name} — run or fight?`, 'alert') };
  return replace(w, { ...c, encounter, moving: false });
}

function end(w0: World, c: Colonist, tun: Tunables, line: string, tone: 'alert' | 'warn' | 'ok', patch: Partial<Colonist> = {}): { w: World; c: Colonist } {
  const e = c.encounter!;
  const fleeing: Fleeing[] = e.wolves.map((wf) => {
    const d = toward(c, wf, 0.001);
    const v = d.x || d.y ? d : { x: Math.cos(wf.angle), y: Math.sin(wf.angle) };
    return { x: wf.x, y: wf.y, vx: v.x * FLEE_SPEED, vy: v.y * FLEE_SPEED, until: w0.t + FLEE_MS };
  });
  const w = { ...w0, fleeing: [...w0.fleeing, ...fleeing], log: say(w0, c, line), beats: beat(w0, c.id, `${c.name} ${line}`, tone) };
  return { w, c: { ...c, ...patch, encounter: null, wolvesAfter: w0.t + tun.wolves.cooldownSeconds * 1000 } };
}

function startFight(w: World, c: Colonist, why: string): { w: World; c: Colonist } {
  const e = c.encounter!;
  return {
    w: { ...w, log: say(w, c, why), beats: beat(w, c.id, `${c.name} fights the wolves!`, 'warn') },
    c: { ...c, moving: false, encounter: { ...e, kind: 'fight', since: w.t, centre: { x: c.x, y: c.y }, nextLunge: w.t + 900 } },
  };
}

/** The wolf a strike would land on now: the nearest within reach, one that has just missed you first. */
export function strikeTarget(c: Colonist): number {
  const e = c.encounter;
  if (!e || e.kind !== 'fight') return -1;
  let best = -1;
  let score = Infinity;
  e.wolves.forEach((wf, i) => {
    if (wf.state === 'hurt' || wf.state === 'lunge') return;
    const d = dist(c, wf);
    if (d > STRIKE_REACH) return;
    const s = d - (wf.state === 'open' ? 1 : 0);
    if (s < score) {
      score = s;
      best = i;
    }
  });
  return best;
}

/** One step of a colonist meeting wolves: the choice, the chase or the fight. */
export function stepEncounter(w0: World, c0: Colonist, input: Input, dtMs: number, tun: Tunables): { w: World; c: Colonist } {
  let w = w0;
  let c = c0;
  const e = c.encounter!;
  const t = w.t;
  const W = tun.wolves;
  if (e.kind === 'choose') {
    if (input.action) return startFight(w, c, 'chose to fight');
    if (Math.hypot(input.dir.x, input.dir.y) > 0.3) {
      c = { ...c, encounter: { ...e, kind: 'chase', since: t } };
      w = { ...w, log: say(w, c, 'runs from the wolves'), beats: beat(w, c.id, `${c.name} runs!`, 'warn') };
    } else if (t - e.since > W.chooseSeconds * 1000) return startFight(w, c, 'was pounced on');
    else {
      // They circle and close in while you make up your mind.
      const k = Math.min(1, (t - e.since) / (W.chooseSeconds * 1000));
      const r = RING_CHOOSE - (RING_CHOOSE - RING_FIGHT - 0.1) * k;
      const wolves = e.wolves.map((wf, i) => {
        // They pace back and forth on their side, closing in.
        const sway = Math.sin((t - e.since) / 500 + i) * 0.004 * dtMs;
        const at = ringSpot(w, c, wf.angle + sway * 0.05, r);
        return { ...wf, x: at.x, y: at.y };
      });
      return { w, c: { ...c, encounter: { ...e, wolves } } };
    }
  }
  const en = c.encounter!;
  if (en.kind === 'chase') {
    c = moveColonist(w, c, input.dir, dtMs, tun);
    if (c.space === 'hall') return end(w, c, tun, 'reached the store: the wolves gave up', 'ok');
    const step = t - en.since < HEAD_START_MS ? 0 : (W.chaseSpeed * dtMs) / 1000;
    const wolves = en.wolves.map((wf, i) => {
      // Each aims a little beside you, so the pack spreads rather than stacking.
      const aim = { x: c.x + Math.cos(wf.angle) * 0.15 * (i % 3), y: c.y + Math.sin(wf.angle) * 0.15 * (i % 3) };
      const d = toward(wf, aim, 0.001);
      return { ...wf, x: wf.x + d.x * step, y: wf.y + d.y * step };
    });
    c = { ...c, encounter: { ...en, wolves } };
    if (wolves.some((wf) => dist(wf, c) < CATCH_R)) return end(w, c, tun, 'was bitten: slowed till the store or a plot of their own', 'alert', { bitten: true });
    if (t - en.since > W.giveUpSeconds * 1000 || dist(c, en.centre) > W.giveUpTiles) return end(w, c, tun, 'got away from the wolves', 'ok');
    return { w, c };
  }
  // The fight: you stay near where it began; they circle, crouch, lunge.
  const centre = en.centre;
  const clamp = (p: P): P => {
    const d = dist(p, centre);
    return d <= ARENA ? p : { x: centre.x + ((p.x - centre.x) / d) * ARENA, y: centre.y + ((p.y - centre.y) / d) * ARENA };
  };
  c = moveColonist(w, c, input.dir, dtMs, tun, clamp);
  let { strikes, bites, nextLunge, recoverUntil } = en;
  let wolves = en.wolves.map((wf, i): Wolf => {
    if (wf.state === 'prowl' || wf.state === 'hurt') {
      const angle = wf.angle + ((i % 2 ? -0.7 : 0.7) * dtMs) / 1000;
      const spot = ringSpot(w, centre, angle, RING_FIGHT + (wf.state === 'hurt' ? 0.35 : 0));
      const d = dist(wf, spot);
      const s = Math.min(d, ((wf.state === 'hurt' ? 6 : PROWL_SPEED) * dtMs) / 1000);
      const v = toward(wf, spot, 0.001);
      const next = { ...wf, angle, x: wf.x + v.x * s, y: wf.y + v.y * s };
      return wf.state === 'hurt' && t >= wf.until ? { ...next, state: 'prowl' } : next;
    }
    if (wf.state === 'tell') return t >= wf.until ? { ...wf, state: 'lunge', from: { x: wf.x, y: wf.y }, until: t + LUNGE_MS } : wf;
    if (wf.state === 'lunge') {
      const k = Math.min(1, 1 - (wf.until - t) / LUNGE_MS);
      const at = { x: wf.from!.x + (wf.target!.x - wf.from!.x) * k, y: wf.from!.y + (wf.target!.y - wf.from!.y) * k };
      if (t < wf.until) return { ...wf, ...at };
      if (dist(c, wf.target!) < HIT_R) {
        bites += 1;
        return { ...wf, ...at, state: 'hurt', until: t + 300 };
      }
      return { ...wf, ...at, state: 'open', until: t + OPEN_MS };
    }
    // Open: it overshot you and stands exposed for a moment.
    return t >= wf.until ? { ...wf, state: 'prowl' } : wf;
  });
  if (t >= nextLunge && !wolves.some((wf) => wf.state === 'tell' || wf.state === 'lunge')) {
    const ready = wolves.map((wf, i) => [wf, i] as const).filter(([wf]) => wf.state === 'prowl');
    if (ready.length > 0) {
      const [u, w1] = draw(w);
      const [d, w2] = draw(w1);
      w = w2;
      const pick = ready[Math.floor(u * ready.length)]![1];
      wolves = wolves.map((wf, i) => (i === pick ? { ...wf, state: 'tell', until: t + W.warnSeconds * 1000, target: { x: c.x, y: c.y }, dodge: d < W.levels[c.level].dodge } : wf));
      nextLunge = t + W.lungeEverySeconds * 1000;
    }
  }
  c = { ...c, encounter: { ...en, wolves, strikes, bites, nextLunge, recoverUntil } };
  if (input.action && t >= recoverUntil) {
    const i = strikeTarget(c);
    if (i >= 0) {
      strikes += 1;
      wolves = wolves.map((wf, j) => (j === i ? { ...wf, state: 'hurt', until: t + HURT_MS } : wf));
    } else recoverUntil = t + WHIFF_MS;
    c = { ...c, encounter: { ...c.encounter!, wolves, strikes, recoverUntil } };
  }
  if (strikes >= W.strikesToWin) return end(w, c, tun, `beat the wolves: ${W.pelts} pelts`, 'ok', { pelts: c.pelts + W.pelts });
  if (bites >= W.bitesToLose) {
    if (c.mule) {
      const near = [...wolves].sort((a, b) => dist(a, c.mule!) - dist(b, c.mule!))[0]!;
      const [u, w1] = draw(w);
      w = w1;
      const away = toward(near, c.mule, 0.001);
      const base = Math.atan2(away.y || 0.001, away.x || 0.001) + (u - 0.5) * 1.2;
      const loose: Loose = {
        owner: c.id, slot: c.slot, good: c.mule.good, paid: c.mule.paid, x: c.mule.x, y: c.mule.y,
        dir: { x: Math.cos(base), y: Math.sin(base) }, left: W.boltTiles, facing: Math.cos(base) >= 0 ? 'right' : 'left',
      };
      const r = end({ ...w, loose: [...w.loose, loose] }, c, tun, 'lost the fight: the MULE bolted!', 'alert', { mule: null });
      return r;
    }
    return end(w, c, tun, 'lost the fight: stunned', 'alert', { stunnedUntil: t + W.stunSeconds * 1000 });
  }
  if (t - en.since > W.fightSeconds * 1000) return end(w, c, tun, 'held them off: the wolves slunk away', 'warn');
  return { w, c };
}

/** A bolting MULE runs straight, turning off what it cannot cross, till its run is spent; then it stands. */
export function stepBolts(w0: World, dtMs: number, tun: Tunables): World {
  let w = w0;
  if (!w.loose.some((m) => m.left > 0)) return w;
  const loose = w.loose.map((m) => {
    if (m.left <= 0) return m;
    const s = Math.min(m.left, (tun.wolves.boltSpeed * dtMs) / 1000);
    const next = { x: m.x + m.dir.x * s, y: m.y + m.dir.y * s };
    if (!passable(w, tun, next.x, next.y, null)) {
      const [u, w1] = draw(w);
      w = w1;
      const a = Math.atan2(m.dir.y, m.dir.x) + Math.PI / 2 + u * Math.PI;
      return { ...m, dir: { x: Math.cos(a), y: Math.sin(a) } };
    }
    return { ...m, ...next, left: m.left - s, facing: m.dir.x >= 0 ? ('right' as const) : ('left' as const) };
  });
  return { ...w, loose };
}

/** At the turn's end a bolting MULE stops where it is. */
export const endBolt = (w: World): World => ({ ...w, loose: w.loose.map((m) => ({ ...m, left: 0 })) });

/** The action button during an encounter: FIGHT or RUN, then RUN!, then STRIKE! or DODGE. */
export function wolfReach(w: World, c: Colonist, tun: Tunables): Reach {
  const e = c.encounter!;
  if (e.kind === 'choose') return { kind: 'fight', verb: 'FIGHT or RUN', detail: 'or push the stick', enabled: true };
  if (e.kind === 'chase') return { kind: 'none', verb: 'RUN!', detail: 'to the store or your plot', enabled: false };
  const score = `${e.strikes}/${tun.wolves.strikesToWin} · bites ${e.bites}/${tun.wolves.bitesToLose}`;
  if (strikeTarget(c) >= 0 && w.t >= e.recoverUntil) return { kind: 'strike', verb: 'STRIKE!', detail: score, enabled: true };
  return { kind: 'none', verb: 'DODGE', detail: score, enabled: false };
}

/** A bot meeting wolves: its drawn pick, then flight, or a fight with a rolled dodge per lunge and a strike when close. */
export function botWolfInput(w: World, c: Colonist, tun: Tunables): Input {
  const e = c.encounter!;
  const away = (): P => {
    const cx = e.wolves.reduce((s, wf) => s + wf.x, 0) / e.wolves.length;
    const cy = e.wolves.reduce((s, wf) => s + wf.y, 0) / e.wolves.length;
    const d = toward({ x: cx, y: cy }, c, 0.001);
    return d.x || d.y ? d : { x: 1, y: 0 };
  };
  if (e.kind === 'choose') {
    if (w.t - e.since < 600) return IDLE;
    return e.botFights ? { dir: { x: 0, y: 0 }, action: true } : { dir: away(), action: false };
  }
  if (e.kind === 'chase') return { dir: away(), action: false };
  const tell = e.wolves.find((wf) => wf.state === 'tell' && wf.dodge);
  if (tell && tell.target && dist(c, tell.target) < HIT_R + 0.2) {
    const off = toward(tell.target, c, 0.001);
    const side = off.x || off.y ? off : { x: -(tell.target.y - tell.y), y: tell.target.x - tell.x };
    const n = Math.hypot(side.x, side.y) || 1;
    return { dir: { x: side.x / n, y: side.y / n }, action: false };
  }
  // It strikes at a wolf that stands open, once its level's reaction time has passed: a rookie's often comes too late.
  const i = strikeTarget(c);
  const wf = i >= 0 ? e.wolves[i]! : null;
  const openFor = wf && wf.state === 'open' ? OPEN_MS - (wf.until - w.t) : -1;
  if (wf && openFor >= tun.wolves.levels[c.level].strikeDelaySeconds * 1000 && w.t >= e.recoverUntil) return { dir: { x: 0, y: 0 }, action: true };
  return IDLE;
}
