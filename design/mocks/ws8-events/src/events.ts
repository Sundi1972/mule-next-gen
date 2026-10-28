import type { MonthEvent } from '@mule/engine';
import type { Good } from '@mule/ui';
import { ENTRY, TIER, type EventKey, type Phase } from './catalogue';
import { H, OUTPUT, W } from './fixture';

export { TIER, type EventKey, type Phase, type Tier } from './catalogue';

/**
 * What the screens get for one event: today's engine MonthEvent (packages/engine/src/types.ts), with the fields the
 * visuals need and the engine does not send yet. Every PROPOSED field is listed in GAPS for WS1.
 * The mock keys plots by x and y; the engine sends `index` (x = index % width, y = floor(index / width)).
 */

export interface Hit {
  x: number;
  y: number;
  order: number;
  /** PROPOSED optional: a meteor can hit a plot with nothing on it. MonthEvent requires a good today. */
  good?: Good;
  delta: number;
  /** PROPOSED: the plot's MULE is gone: destroyed (meteor) or taken (theft). */
  muleLost?: boolean;
  /** PROPOSED: what the plot becomes: the meteor's crater (WS5's badge), a caved-in cavern's plain plot, an idle plot. */
  becomes?: 'crater' | 'plain' | 'idle';
  /** PROPOSED: announced now, lands in a later phase (the general strike's plots, in production). */
  pending?: boolean;
}

/** PROPOSED (MonthEvent.effects): what an event changes off the map. Each delta is the change, never the new value. */
export interface Effect {
  /** A player's id, 'colony' or 'store'. */
  on: string;
  what: Good | 'cash' | 'pace' | 'reputation' | 'mood' | 'prestige' | 'air' | 'colonists' | 'demand' | 'energyNeed' | 'mules' | 'price' | 'fund';
  delta: number;
  /** The delta is a percentage (−10% cash, +25% demand), not units. */
  pct?: boolean;
  /** The good a demand or price change is for. */
  good?: Good;
  /** How many turns it lasts, when more than this one (the epidemic's 2). */
  turns?: number;
}

export interface ShowEvent {
  key: EventKey;
  title: string;
  line: string;
  scope: MonthEvent['scope'];
  /** PROPOSED 'neutral' (the colony plot offered). MonthEvent has good, bad and mixed. */
  sign: 'good' | 'bad' | 'neutral';
  /** PROPOSED by WS1's event-model spec (C2): the phase the event fired in. */
  phase: Phase;
  origin: { x: number; y: number };
  direction?: MonthEvent['direction'];
  plots: Hit[];
  /** A personal event's player. */
  player?: string;
  /** PROPOSED (sickness): why, in words: WS6's sickBecause. */
  because?: string;
  /** PROPOSED: what it changes off the map. */
  effects?: Effect[];
  /** PROPOSED: announced in this phase, takes effect in that one (the general strike, in production). */
  landsIn?: Phase;
}

export const made = (x: number, y: number) => OUTPUT.find((o) => o.x === x && o.y === y)!.made;
const halve = (x: number, y: number) => Math.floor(made(x, y) / 2) - made(x, y);

// --- The four representative events, on WS6's fixture colony ---------------------------------------------------

/** A colony sweep: comes in from the west edge, takes half of every Energy plot in the order it reaches them. */
export const STORM: ShowEvent = {
  key: 'dustStorm',
  title: 'Dust storm',
  line: 'A dust storm takes 50% of every Energy plot’s output.',
  scope: 'colony',
  sign: 'bad',
  phase: 'production',
  origin: { x: 0, y: 5 },
  direction: 'w',
  plots: [
    [1, 4],
    [3, 5],
    [3, 6],
    [4, 5],
    [5, 5],
    [6, 5],
  ].map(([x, y], order) => ({ x: x!, y: y!, order, good: 'energy' as const, delta: halve(x!, y!) })),
};

/** A personal event: starts on one of Lena's farms and spreads to the farms joined to it. */
export const PESTS: ShowEvent = {
  key: 'pestSwarm',
  title: 'Pest swarm',
  line: 'Pests eat 50% of the Food on the plots they reach.',
  scope: 'personal',
  sign: 'bad',
  phase: 'production',
  origin: { x: 6, y: 2 },
  player: 'lena',
  plots: [
    [6, 2],
    [7, 2],
    [7, 3],
  ].map(([x, y], order) => ({ x: x!, y: y!, order, good: 'food' as const, delta: halve(x!, y!) })),
};

/** Wave 2 (Heiko, 28 Oct): one random tile, the installation destroyed, a crater left behind. */
export const METEOR: ShowEvent = {
  key: 'meteorStrike',
  title: 'Meteor strike',
  line: 'A meteor hits one plot: what stands on it is destroyed, and it leaves a crater rich in Crystite.',
  scope: 'colony',
  sign: 'bad',
  phase: 'production',
  origin: { x: 13, y: 4 },
  direction: 'n',
  plots: [{ x: 13, y: 4, order: 0, good: 'smithore', delta: -made(13, 4), muleLost: true, becomes: 'crater' }],
};

/** Per player, at the start of development: not on any plot, on the colonist. */
export const SICK_LENA: ShowEvent = {
  key: 'sickness',
  title: 'Sickness',
  line: 'Sick: walks at half pace this turn.',
  scope: 'personal',
  sign: 'bad',
  phase: 'development',
  origin: { x: 5, y: 4 },
  player: 'lena',
  plots: [],
  because: 'the air is Smoggy',
};
export const SICK_BRIX: ShowEvent = { ...SICK_LENA, origin: { x: 6, y: 3 }, player: 'brix', because: 'his smelter fouled the air' };

export interface Scenario {
  id: string;
  title: string;
  phase: Phase;
  events: ShowEvent[];
  /** What this scenario demonstrates. */
  shows: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'storm', title: 'Dust storm', phase: 'production', events: [STORM], shows: 'A colony event sweeps in from its edge onto every plot it hits.' },
  { id: 'pests', title: 'Pest swarm', phase: 'production', events: [PESTS], shows: 'A player’s own event: the table sees whose land it is, and it spreads farm to farm.' },
  { id: 'sick', title: 'Sickness ×2', phase: 'development', events: [SICK_LENA, SICK_BRIX], shows: 'Two players fall sick as the walk starts: one roll call, never an interruption.' },
  { id: 'meteor', title: 'Meteor strike', phase: 'production', events: [METEOR], shows: 'One random plot: the installation is destroyed and a crater is left.' },
  { id: 'sequence', title: 'Three in one phase', phase: 'production', events: [STORM, PESTS, METEOR], shows: 'Dust storm, pest swarm and meteor in the same production: announced together, played one after another.' },
];

// --- The timeline, in seconds from the phase's start ------------------------------------------------------------

/** Display timing, not balance: how long each step of the show lasts on the TV. */
export const BEAT = {
  /** The phase opens with its roll call of what fired. */
  intro: 1.8,
  /** Each event's announcement before it plays. */
  announce: 2.2,
  /** After an event has played, its marks settle before the next. */
  settle: 1.2,
  /** The recap holds at the end. */
  outro: 3,
} as const;

/**
 * A phone with no TV in the room plays the weather itself, shorter: quicker cards, and the motion itself at 75% of
 * the TV's length. With a TV, the phone keeps the light card and runs on the TV's clock.
 */
export const SOLO_BEAT = { intro: 1.1, announce: 1.4, settle: 0.8, outro: 2.4 } as const;
export const SOLO_PACE = 0.75;
export type Mode = 'tv' | 'solo';

/** How long an event plays, by how it moves. */
export function playLength(ev: ShowEvent): number {
  switch (ENTRY[ev.key].motion) {
    case 'sweep':
      return 3.6;
    case 'spread':
      return 0.6 + ev.plots.length * 0.9;
    case 'strike':
      return 3;
    case 'colonists':
      return 1.6;
    case 'source':
      return 0.8 + ev.plots.length * 0.35;
    case 'plot':
      return 1.8;
    case 'plots':
    case 'ledger':
      return 2;
    default:
      return 2.4;
  }
}

/** One beat of the show: a single event, or the phase's roll call of bulletins. */
export interface Segment {
  events: ShowEvent[];
  /** How fast its motion plays: 1 on the TV, SOLO_PACE on a phone alone. */
  pace: number;
  /** 1-based, of `count`. */
  n: number;
  count: number;
  announceAt: number;
  playAt: number;
  settleAt: number;
  endAt: number;
}

export interface Script {
  phase: Phase;
  events: ShowEvent[];
  segments: Segment[];
  end: number;
  mode: Mode;
  /** When the phase's intro ends and the first event is announced. */
  intro: number;
}

export function script(phase: Phase, events: ShowEvent[], mode: Mode = 'tv'): Script {
  const beat = mode === 'tv' ? BEAT : SOLO_BEAT;
  const pace = mode === 'tv' ? 1 : SOLO_PACE;
  // Headlines and spotlights play one by one, in the order they fired; every bulletin of the phase gathers into one
  // roll call that closes it, so the big news comes first and the personal news never interrupts it.
  const roll = events.filter((ev) => TIER[ev.key] === 'bulletin');
  const groups = [...events.filter((ev) => TIER[ev.key] !== 'bulletin').map((ev) => [ev]), ...(roll.length ? [roll] : [])];
  let at: number = beat.intro;
  const segments = groups.map((g, i) => {
    const play = (Math.max(...g.map(playLength)) + (g.length - 1) * 0.5) * pace;
    const s = { events: g, pace, n: i + 1, count: groups.length, announceAt: at, playAt: at + beat.announce, settleAt: at + beat.announce + play, endAt: at + beat.announce + play + beat.settle };
    at = s.endAt;
    return s;
  });
  return { phase, events, segments, end: at + beat.outro, mode, intro: beat.intro };
}

/** A roll call: a segment of bulletins. */
export const isRollCall = (seg: Segment) => TIER[seg.events[0]!.key] === 'bulletin';

export type Stage = 'intro' | 'announce' | 'play' | 'settle' | 'outro';

export function stageAt(s: Script, t: number): { stage: Stage; seg: Segment | null } {
  if (t < s.intro) return { stage: 'intro', seg: null };
  const seg = s.segments.find((g) => t < g.endAt) ?? null;
  if (!seg) return { stage: 'outro', seg: null };
  return { stage: t < seg.playAt ? 'announce' : t < seg.settleAt ? 'play' : 'settle', seg };
}

/** How far a colony sweep has to travel to reach a plot: 0 at its edge, 1 at the far one. */
export function sweep(ev: ShowEvent, h: { x: number; y: number }): number {
  switch (ev.direction ?? 'w') {
    case 'w':
      return (h.x + 0.5) / W;
    case 'e':
      return (W - h.x - 0.5) / W;
    case 'n':
      return (h.y + 0.5) / H;
    case 's':
      return (H - h.y - 0.5) / H;
  }
}

/** The storm's front, 0 at its edge to 1 off the far side, over its play. */
export const FRONT = { lead: 0.3, cross: 2.8 } as const;
export const frontAt = (seg: Segment, t: number) => (t - seg.playAt - FRONT.lead * seg.pace) / (FRONT.cross * seg.pace);

/** When the event lands on a plot (or, with none, on its player). Without motion, everything lands at once. */
export function hitAt(seg: Segment, ev: ShowEvent, h: Hit | null, reduced: boolean): number {
  const p = seg.playAt;
  if (reduced) return p + 0.2;
  const nth = seg.events.indexOf(ev);
  const after = (() => {
    switch (ENTRY[ev.key].motion) {
      case 'sweep':
        return h ? FRONT.lead + sweep(ev, h) * FRONT.cross : FRONT.lead + FRONT.cross / 2;
      case 'spread':
        return 0.4 + (h?.order ?? 0) * 0.9;
      case 'strike':
        return METEOR_FALL;
      case 'colonists':
        return 0.3 + nth * 0.5;
      case 'source':
        return 0.5 + (h?.order ?? 0) * 0.35;
      default:
        return 0.5 + nth * 0.5 + (h?.order ?? 0) * 0.15;
    }
  })();
  return p + after * seg.pace;
}
/** Seconds from the meteor's first glint to impact, on the TV. */
export const METEOR_FALL = 1.4;
/** When a segment's meteor lands. */
export const impactAt = (seg: Segment) => seg.playAt + METEOR_FALL * seg.pace;

/** Every hit that has landed by `t`, with its event and segment. */
export function landed(s: Script, t: number, reduced: boolean): { ev: ShowEvent; seg: Segment; hit: Hit; at: number }[] {
  return s.segments.flatMap((seg) =>
    seg.events.flatMap((ev) =>
      ev.plots.map((hit) => ({ ev, seg, hit, at: hitAt(seg, ev, hit, reduced) })).filter((l) => t >= l.at),
    ),
  );
}

/** Every effect off the map that has landed by `t`: with no plots, when the event lands; with plots, after the last. */
export function effectsAt(s: Script, t: number, reduced: boolean): { ev: ShowEvent; seg: Segment; effect: Effect; at: number }[] {
  return s.segments.flatMap((seg) =>
    seg.events.flatMap((ev) => {
      const at = Math.max(hitAt(seg, ev, null, reduced), ...ev.plots.map((h) => hitAt(seg, ev, h, reduced)));
      return (ev.effects ?? []).map((effect, i) => ({ ev, seg, effect, at: at + (reduced ? 0 : i * 0.15) })).filter((l) => t >= l.at);
    }),
  );
}

/** The players whose sickness has landed by `t`: sick players, and everyone an epidemic slows. */
export function sickAt(s: Script, t: number, reduced: boolean): Set<string> {
  const sick = s.segments.flatMap((g) => g.events.filter((e) => e.key === 'sickness' && t >= hitAt(g, e, null, reduced)).map((e) => e.player!));
  const slowed = effectsAt(s, t, reduced).filter((l) => l.effect.what === 'pace').map((l) => l.effect.on);
  return new Set([...sick, ...slowed]);
}

/** What a plot makes by `t`: its output, then every landed hit in turn, never below 0. A pending hit lands later. */
export function unitsAt(s: Script, t: number, reduced: boolean, x: number, y: number): { now: number; before: number; lostAt: number | null } {
  const base = OUTPUT.find((o) => o.x === x && o.y === y)?.made ?? 0;
  let now = base;
  let lostAt: number | null = null;
  for (const l of landed(s, t, reduced)) {
    if (l.hit.x !== x || l.hit.y !== y || l.hit.pending) continue;
    now = Math.max(0, now + l.hit.delta);
    lostAt = l.at;
  }
  return { now, before: base, lostAt };
}

/** One player's change from this phase's events by `t`, per good. */
export function playerChange(s: Script, t: number, reduced: boolean, id: string): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  for (const o of OUTPUT.filter((o) => o.owner === id)) {
    const { now, before } = unitsAt(s, t, reduced, o.x, o.y);
    if (now !== before) out[o.good] = (out[o.good] ?? 0) + now - before;
  }
  return out;
}

/** Who an event is about, in words, for its announcement. */
export function whoLine(ev: ShowEvent, name: (id: string) => string): string {
  if (ev.key === 'meteorStrike') return 'One plot, anywhere';
  if (ev.key === 'colonyPlot') return 'One free plot';
  if (ev.player) return name(ev.player);
  if (ev.scope === 'colony') return 'The whole colony';
  if (ev.scope === 'local') return 'One area of the map';
  return 'One player';
}

// --- What the engine does not send yet (WS8 → WS1, via the PM) ---------------------------------------------------

export const GAPS: { id: string; field: string; why: string }[] = [
  { id: 'phase', field: 'MonthEvent.phase', why: 'Which phase an event belongs to, so each phase announces only its own. WS1’s spec C2 adds it.' },
  { id: 'sickEvent', field: 'Sickness as a MonthEvent (phase development, scope personal, player, no plots)', why: 'Today sickness lives on Player.sick only; the roll call needs it in the phase’s event list, in the order it fired, with the others.' },
  { id: 'because', field: 'MonthEvent.because (sickness)', why: '“Sick: his smelter fouled the air.” WS6’s approved sick tag already carries sickBecause; the event should carry the same reason.' },
  { id: 'meteor', field: 'EventKey meteorStrike and EventKind meteor', why: 'Wave 2. The meteor needs its own animation kind; none of today’s nine fits a strike from the sky.' },
  { id: 'goodOptional', field: 'plots[].good optional', why: 'A meteor can hit an empty or unowned plot; MonthEvent requires a good on every plot today.' },
  { id: 'muleLost', field: 'plots[].muleLost, plots[].becomes', why: 'The meteor destroys the installation and leaves a crater; theft leaves the plot idle; a cavern caves in to a plain plot. The screens draw the change and hand a crater to WS5’s badge.' },
  { id: 'length', field: 'A phase’s show length that grows with its events', why: 'Production’s event window today is 4.0–9.6 s, room for one event. Three take about 20 s; the phase must wait for the last one before the goods fly (WS6’s R3 timeline).' },
  { id: 'keys', field: 'EventKey and EventKind for the 25 new events', why: 'Wave 2 and Goal 5 add 25 keys. Each needs a kind (its motion family: sweep, spread, source, strike, plot, plots, colonists, store, ledger, colony) so a screen picks its animation without knowing the key.' },
  { id: 'effects', field: 'MonthEvent.effects[] (on, what, delta, pct, good, turns)', why: 'Sixteen events change nothing on the map: cash, held goods, the store’s stock and prices, reputation, pace, and the colony’s mood, prestige, air and head count. The screens need the change, per player, to say “−64 cr for you”.' },
  { id: 'phases', field: 'MonthReport.events for every phase, not only production', why: 'Planning, the land grant, development, the auction and upkeep get events; MonthEvent.when is "afterProduction" only.' },
  { id: 'neutral', field: 'sign "neutral"', why: 'The colony plot offered is neither good nor bad: its badge has its own shape (a square).' },
  { id: 'landsIn', field: 'MonthEvent.landsIn (general strike)', why: 'Announced in planning, it hits in production; the production show must replay it as it lands, with whether the Governor paid.' },
  { id: 'notEvents', field: 'Colony plot offered and cavern collapse as MonthEvents', why: 'Both happen today but outside MonthReport.events (lots.ts, specials.ts), so no screen can announce them as events.' },
  { id: 'energyShort', field: 'Cold snap: which plots went short, per plot', why: 'ProductionLine already has a noEnergy part; it should name the event (part.event = coldSnap) so the plots it cost are marked.' },
];

/** Which gaps each event needs closed before its screens can be built for real. */
export const EVENT_GAPS: Record<EventKey, string[]> = {
  federationTax: ['keys', 'effects', 'phases'], federationGrant: ['keys', 'effects', 'phases'], immigrationWave: ['keys', 'effects', 'phases'], emigrationWave: ['keys', 'effects', 'phases'],
  festival: ['keys', 'effects', 'phases'], generalStrike: ['keys', 'effects', 'phases', 'landsIn'], inheritance: ['keys', 'effects', 'phases'], blamedForUnrest: ['keys', 'effects', 'phases'],
  colonyPlot: ['notEvents', 'phases', 'neutral'],
  sickness: ['sickEvent', 'because', 'phases'], muleTheft: ['keys', 'muleLost', 'phases'], epidemic: ['keys', 'effects', 'phases'], storeStrike: ['keys', 'effects', 'phases'],
  dustStorm: ['phase', 'length'], drought: ['phase', 'length'], acidRain: ['phase', 'length'], solarFlare: ['phase', 'length'], cometPass: ['phase', 'length'], flood: ['phase', 'length'], volcanicAsh: ['phase', 'length'],
  coldSnap: ['keys', 'energyShort', 'length'], meteorStrike: ['meteor', 'goodOptional', 'muleLost', 'length'],
  pestSwarm: ['phase', 'length'], wildfire: ['phase', 'length'], bumperHarvest: ['phase', 'length'], cavernCollapse: ['notEvents', 'muleLost'], walkout: ['keys', 'length'], loyalCrew: ['keys', 'length'],
  pirateRaid: ['keys', 'effects', 'phases'], storeFire: ['keys', 'effects', 'phases'],
  ratsInSilo: ['keys', 'effects', 'phases'], crookedAccountant: ['keys', 'effects', 'phases'], packageFromHome: ['keys', 'effects', 'phases'], riot: ['keys', 'effects', 'phases'], volunteerCleanup: ['keys', 'effects', 'phases'],
};
