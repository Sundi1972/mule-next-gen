import {
  AI_PLANS,
  cloneForSim,
  GAME,
  GOOD_CONFIG,
  GOODS,
  list,
  monthNeeds,
  MS_PER_SECOND,
  observe,
  orderGeoDrone,
  RuleError,
  STRATEGIST,
  unlist,
  type GameState,
  type Good,
  type Outfit,
  type Playbook,
  type PlayerId,
  type RecordedWrite,
} from '@mule/engine';
import { outlook } from '../outlook.js';
import { capCodePoints } from '../text.js';
import { unitValues, type Mind } from '../value.js';
import { draftPlaybook, KINDS, type DraftPhase, type LandPick } from './draft.js';

/**
 * The gate every playbook passes before it plays (spec C1, RULE-1, RULE-2): each edit is accepted, clamped to the
 * rules' bounds, or refused and the draft's value kept. The one place a playbook's value bounds live.
 */

/** One edit a writer sends: a JSON Pointer into the playbook, the value it wants there, and why. */
export type PlanEdit = RecordedWrite['edits'][number];

/** The gate every playbook passes (spec C1); WS2's writer calls it with the same structure. */
export type ValidatePlan = (
  state: GameState,
  seat: PlayerId,
  draft: Playbook,
  edits: readonly PlanEdit[],
) => { playbook: Playbook; rejected: NonNullable<Playbook['rejected']> };

/** What the gate closes over: the seat's mind (its level, as GameState has none), its draft seed and its land pick. */
export interface ValidatorProfile {
  mind: Mind;
  seed: number;
  land?: LandPick | null;
}

type Rejected = NonNullable<Playbook['rejected']>[number];
type Accepted = NonNullable<Playbook['edits']>[number];

/** A row's verdict on a value: it plays (clamped, when `why` says so), or it is refused. */
type Verdict = { plays: unknown; why?: string } | { refused: string };

interface Ctx {
  state: GameState;
  seat: PlayerId;
  mind: Mind;
  corners: boolean;
  others: Set<PlayerId>;
  /** The playbook as edited so far. */
  pb: Playbook;
  /** The playbook before any part edit: the draft, re-drafted under an edited strategy. */
  base: Playbook;
}

type Row = (value: unknown, ctx: Ctx, unit: string[]) => Verdict;

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const ok = (plays: unknown): Verdict => ({ plays });
const clamped = (plays: unknown, bound: string): Verdict => ({ plays, why: `clamped to ${show(plays)}: ${bound}` });
const refuse = (refused: string): Verdict => ({ refused });
/** A list clamped by dropping entries: its why counts them, as a ranking can run to the whole map. */
const dropped = (kept: unknown[], from: number, keeping: string): Verdict => {
  const n = from - kept.length;
  return { plays: kept, why: `clamped: dropped ${n} ${n === 1 ? 'entry' : 'entries'}, keeping ${keeping}` };
};
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const oneOf =
  (values: readonly unknown[], why: string): Row =>
  (v) =>
    values.includes(v) ? ok(v) : refuse(why);

const STANCES = ['ally', 'neutral', 'rival', 'target'];
const TACTICS = ['hold', 'undercut1', 'yield'];
const OUTFITS: readonly Outfit[] = [...GOODS, 'greenBelt'];
const isGood = (v: unknown): v is Good => (GOODS as readonly unknown[]).includes(v);

/** A whole number from lo to hi, clamped, naming the bound it met. */
function whole(v: unknown, lo: number, hi: number, loWhy: string, hiWhy: string): Verdict {
  if (typeof v !== 'number' || !Number.isFinite(v)) return refuse('not a number');
  const r = Math.round(v);
  const c = Math.min(hi, Math.max(lo, r));
  if (c === v) return ok(v);
  return clamped(c, r > hi ? hiWhy : r < lo ? loWhy : 'a whole number');
}

const tileOf = (ctx: Ctx, plot: unknown) => (Number.isInteger(plot) ? ctx.state.tiles[plot as number] : undefined);
const isPlot = (ctx: Ctx, plot: unknown) => {
  const t = tileOf(ctx, plot);
  return !!t && t.terrain !== 'store';
};
const isFree = (ctx: Ctx, plot: unknown) => isPlot(ctx, plot) && tileOf(ctx, plot)!.owner === null;
const isMine = (ctx: Ctx, plot: unknown) => isPlot(ctx, plot) && tileOf(ctx, plot)!.owner === ctx.seat;
/** A plot index as the engine's {x, y}; an index off the map becomes a square off it, which the engine refuses. */
const xyOf = (ctx: Ctx, plot: unknown) => {
  const t = tileOf(ctx, plot);
  return t ? { x: t.x, y: t.y } : { x: -1, y: -1 };
};

/** Runs one of the engine's own rules on a copy; a refusal carries the rule's own words. */
function dryRun(run: () => void): Verdict | null {
  try {
    run();
    return null;
  } catch (err) {
    if (err instanceof RuleError) return refuse(err.message);
    throw err;
  }
}

function notes(v: unknown, max: number, maxName: string): Verdict {
  if (!Array.isArray(v) || !v.every((n) => typeof n === 'string')) return refuse('not a list of notes');
  const chars = AI_PLANS.bounds.rivalReadChars;
  const cut = v.slice(0, max).map((n: string) => capCodePoints(n, chars));
  if (cut.length === v.length && cut.every((n, i) => n === v[i])) return ok(v);
  return clamped(cut, v.length > max ? `AI_PLANS.bounds.${maxName}` : 'AI_PLANS.bounds.rivalReadChars');
}

/** RULE-1b: (analyse | buyMule outfit install | filter)* pub?, own plots for install and filter, the level's MULEs. */
function routeFault(route: unknown, ctx: Ctx): [string, number] | null {
  if (!Array.isArray(route)) return ['not a list of steps', 0];
  const cap = AI_PLANS.bounds.routeSteps;
  const mulesPerMonth = ctx.mind.level?.mulesPerMonth ?? 0;
  const step = (i: number) => (isObject(route[i]) ? route[i] : {});
  let mules = 0;
  for (let i = 0; i < route.length; i++) {
    if (i >= cap) return [`more than ${cap} steps`, cap];
    const s = step(i);
    switch (s.act) {
      case 'analyse':
        if (!isPlot(ctx, s.plot)) return ['no such plot', i];
        break;
      case 'filter':
        if (!isMine(ctx, s.plot)) return [isPlot(ctx, s.plot) ? 'not your plot' : 'no such plot', i];
        break;
      case 'buyMule': {
        if (++mules > mulesPerMonth) return [`more than ${mulesPerMonth} MULEs`, i];
        const outfitAt = i + 1;
        const installAt = outfitAt + 1;
        const [outfit, install] = [step(outfitAt), step(installAt)];
        if (outfit.act !== 'outfit') return ['buyMule not followed by outfit and install', outfitAt];
        if (!OUTFITS.includes(outfit.outfit as Outfit)) return ['no such outfit', outfitAt];
        if (install.act !== 'install') return ['buyMule not followed by outfit and install', installAt];
        if (!isMine(ctx, install.plot)) return [isPlot(ctx, install.plot) ? 'not your plot' : 'no such plot', installAt];
        i = installAt;
        break;
      }
      case 'outfit':
        return ['an outfit with no MULE bought', i];
      case 'install':
        return ['an install with no MULE bought', i];
      case 'pub':
        if (i !== route.length - 1) return ['the pub is the last step', i];
        break;
      default:
        return ['no such act', i];
    }
  }
  return route.length > cap ? [`more than ${cap} steps`, cap] : null;
}

const goodOf = (ctx: Ctx, unit: string[]) => ctx.pb.auction![unit[1] as Good]!;

const STRATEGY_ROWS: Record<string, Row> = {
  // RULE-2 rows 1 and 2 come before RULE-1's: first match wins.
  kind: (v, ctx) => (!ctx.corners && v === 'monopolist' ? refuse('level never corners') : oneOf(KINDS, 'no such kind')(v, ctx, [])),
  moneyMaker: (v) => (v === null || isGood(v) ? ok(v) : refuse('no such good')),
  monopolyTarget: (v, ctx) => {
    if (v === null) return ok(v);
    if (!ctx.corners) return refuse('level never corners');
    if (!isGood(v) || !AI_PLANS.monopoly.goods.includes(v)) return refuse('not a good to corner');
    return GOOD_CONFIG[v].spoilage < STRATEGIST.cornerMaxSpoilage ? ok(v) : refuse('spoils too fast to corner');
  },
  cashFloor: (v) => whole(v, 0, AI_PLANS.bounds.cashFloorMax, 'a cash floor of 0 or more', 'AI_PLANS.bounds.cashFloorMax'),
  landTarget: (v, ctx) => {
    if (!isObject(v) || typeof v.plots !== 'number' || typeof v.byMonth !== 'number' || !Number.isFinite(v.plots) || !Number.isFinite(v.byMonth)) {
      return refuse('not a land target');
    }
    const { month, maxMonths } = ctx.state;
    const byMonth = Math.min(maxMonths, Math.max(month, Math.round(v.byMonth)));
    const owned = ctx.state.tiles.filter((t) => t.owner === ctx.seat).length;
    const plots = Math.min(owned + GAME.claimsPerGrant * (byMonth - month), Math.max(owned, Math.round(v.plots)));
    const target = { plots, byMonth };
    return plots === v.plots && byMonth === v.byMonth && Object.keys(v).length === Object.keys(target).length
      ? ok(v)
      : clamped(target, 'plots owned now to GAME.claimsPerGrant more a month, by this month to the last');
  },
  reason: (v) => (typeof v === 'string' ? ok(v) : refuse('not text')),
};

const stance: Row = (v, ctx, unit) => (!ctx.others.has(unit[2]!) ? refuse('no such player') : oneOf(STANCES, 'no such stance')(v, ctx, unit));
const rivalRead: Row = (v, ctx, unit) => (!ctx.others.has(unit[1]!) ? refuse('no such player') : notes(v, AI_PLANS.bounds.rivalReadNotes, 'rivalReadNotes'));
const lessons: Row = (v) => notes(v, AI_PLANS.bounds.lessons, 'lessons');

const plotListOf = (v: unknown): number[] | null => (Array.isArray(v) && v.every((p) => Number.isInteger(p)) ? (v as number[]) : null);

const PART_ROWS: Record<'planning' | 'landGrant' | 'development', Record<string, Row>> = {
  planning: {
    drone: (v, ctx) => {
      const plots = plotListOf(v);
      if (!plots) return refuse('not a list of plots');
      if (plots.length === 0) return ok(v);
      return dryRun(() => orderGeoDrone(cloneForSim(ctx.state), ctx.seat, plots.map((p) => xyOf(ctx, p)))) ?? ok(v);
    },
    list: (v, ctx) => {
      if (!Array.isArray(v) || !v.every(isObject)) return refuse('not a list of listings');
      const copy = cloneForSim(ctx.state);
      // The playbook's list is the whole of the seat's listings (RULE-13), so its standing ones are taken down first.
      const fault = dryRun(() => {
        for (const l of copy.listings.filter((x) => x.seller === ctx.seat)) unlist(copy, ctx.seat, l.id);
        for (const e of v as Record<string, unknown>[]) {
          list(copy, ctx.seat, { item: { kind: e.item as 'plot' | 'mule', ...xyOf(ctx, e.plot) }, minimum: e.minimum as number, unsold: e.unsold as 'store' | 'keep' });
        }
      });
      return fault ?? ok(v);
    },
  },
  landGrant: {
    ranked: (v, ctx) => {
      if (!Array.isArray(v)) return refuse('not a ranking');
      const seen = new Set<unknown>();
      const kept = v.filter((r) => {
        const good = isObject(r) && isFree(ctx, r.plot) && !seen.has(r.plot) && Number.isInteger(r.value) && (r.value as number) >= 0;
        if (good) seen.add(r.plot);
        return good;
      });
      if (kept.length === 0 && v.length > 0) return refuse('no free plot left to rank');
      return kept.length === v.length ? ok(v) : dropped(kept, v.length, 'free plots, each once, at a whole value of 0 or more');
    },
    pressShare: (v) => {
      if (!isObject(v) || typeof v.start !== 'number' || typeof v.end !== 'number' || !Number.isFinite(v.start) || !Number.isFinite(v.end)) {
        return refuse('not a press share');
      }
      const start = Math.min(1, Math.max(0, v.start));
      const end = Math.min(start, Math.max(0, v.end));
      return start === v.start && end === v.end && Object.keys(v).length === Object.keys({ start, end }).length ? ok(v) : clamped({ start, end }, '0 ≤ end ≤ start ≤ 1');
    },
    claims: (v) => whole(v, 0, GAME.claimsPerGrant, 'claims of 0 or more', 'GAME.claimsPerGrant'),
    deny: (v, ctx) => {
      if (!Array.isArray(v)) return refuse('not a list of plots to deny');
      const seen = new Set<unknown>();
      const kept = v.filter((d) => {
        const good =
          isObject(d) && isFree(ctx, d.plot) && !seen.has(d.plot) && ctx.others.has(d.rival as string) && typeof d.maxCost === 'number' && Number.isFinite(d.maxCost) && d.maxCost >= 0;
        if (good) seen.add(d.plot);
        return good;
      });
      return kept.length === v.length ? ok(v) : dropped(kept, v.length, 'free, distinct plots, another seat, a cost of 0 or more');
    },
    planB: (v, ctx) => {
      const plots = plotListOf(v);
      if (!plots) return refuse('not a list of plots');
      const kept = plots.filter((p, i) => isFree(ctx, p) && plots.indexOf(p) === i);
      return kept.length === plots.length ? ok(v) : dropped(kept, plots.length, 'free, distinct plots');
    },
    pair: (v, ctx) => {
      const plots = plotListOf(v);
      // literal-ok: a pair is two plots, as LandGrantPlay's tuple type says
      return plots && plots.length === new Set(plots).size && plots.length === 2 && plots.every((p) => isFree(ctx, p)) ? ok(v) : refuse('not two free, distinct plots');
    },
  },
  development: {
    route: (v, ctx) => {
      const fault = routeFault(v, ctx);
      return fault ? refuse(`route: ${fault[0]}, step ${fault[1]}`) : ok(v);
    },
    timeBudgetMs: (v, ctx) => {
      const me = ctx.state.players.find((p) => p.id === ctx.seat)!;
      return whole(v, 0, me.devSeconds * MS_PER_SECOND, 'a time of 0 or more', "the seat's development time");
    },
    ifSoldOut: oneOf(['pub', 'analyse', 'stop'], 'no such choice'),
  },
};

const GOOD_ROWS: Record<string, Row> = {
  role: oneOf(['buyer', 'seller', 'out'], 'no such role'),
  hold: (v, ctx, unit) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return refuse('not a number');
    const good = unit[1] as Good;
    const { role } = goodOf(ctx, unit);
    let hold = Math.round(v);
    let why = 'a whole number';
    // RULE-2 row 3: a seat that never corners buys no more than its draft would.
    const drafted = ctx.base.auction?.[good]?.hold ?? Infinity;
    if (!ctx.corners && role === 'buyer' && hold > drafted) [hold, why] = [drafted, 'level never corners'];
    const staple = role === 'seller' && (good === 'food' || good === 'energy');
    const least = staple ? stapleFloor(ctx, good) : 0;
    if (hold < least) [hold, why] = [least, staple ? "next month's need" : 'a hold of 0 or more'];
    return hold === v ? ok(v) : clamped(hold, why);
  },
  walkAway: (v) => whole(v, 1, Infinity, 'a price of 1 or more', ''),
  start: (v, ctx, unit) => {
    const at = whole(v, 1, Infinity, 'a price of 1 or more', '');
    if ('refused' in at) return at;
    const { role, walkAway } = goodOf(ctx, unit);
    const start = at.plays as number;
    if (role === 'buyer' && start > walkAway) return clamped(walkAway, 'a buyer starts at or below its walk-away');
    if (role === 'seller' && start < walkAway) return clamped(walkAway, 'a seller starts at or above its walk-away');
    return at;
  },
  concedeCrPerS: (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return refuse('not a number');
    const c = Math.min(AI_PLANS.bounds.concedeMaxCrPerS, Math.max(0, v));
    return c === v ? ok(v) : clamped(c, c > 0 ? 'AI_PLANS.bounds.concedeMaxCrPerS' : 'a rate of 0 or more');
  },
  vsRival: oneOf(TACTICS, 'no such tactic'),
  bluff: (v) => (typeof v === 'boolean' ? ok(v) : refuse('not a boolean')),
};

/**
 * P12's floor: the Food or Energy the seat needs next month, as its hands measure it (unitValues' floorUnits): Energy
 * its own power plants will make is not needed from stock. A profile with no level reads the gross monthNeeds.
 */
function stapleFloor(ctx: Ctx, good: Good): number {
  if (!ctx.mind.level) return monthNeeds(ctx.state, ctx.seat)[good];
  const obs = observe(ctx.state, ctx.seat);
  return unitValues(obs, outlook(obs, ctx.seat, { lookAhead: ctx.mind.level.lookAhead }), good, ctx.mind).floorUnits;
}

const perRow: Row = (v, ctx, unit) => (!ctx.others.has(unit[3]!) ? refuse('no such player') : oneOf(TACTICS, 'no such tactic')(v, ctx, unit));

type Unit = { unit: string[]; row: Row } | { refused: string };
const NO_FIELD: Unit = { refused: 'no such field' };
const NOT_HERE: Unit = { refused: 'not in this playbook' };
const has = (o: object, k: string | undefined) => k !== undefined && Object.hasOwn(o, k);

/** The field an edit's path falls in (its row and the path to the whole field), or why there is none. */
function unitOf(segs: string[], pb: Playbook): Unit {
  const [root, a, b, c] = segs;
  switch (root) {
    case 'strategy':
      if (a === 'stances') return b === undefined ? NO_FIELD : { unit: ['strategy', 'stances', b], row: stance };
      return has(STRATEGY_ROWS, a) ? { unit: ['strategy', a!], row: STRATEGY_ROWS[a!]! } : NO_FIELD;
    case 'rivalReads':
      return a === undefined ? NO_FIELD : { unit: ['rivalReads', a], row: rivalRead };
    case 'lessons':
      return { unit: ['lessons'], row: lessons };
    case 'store':
      return { refused: 'no store play in v1' };
    case 'planning':
    case 'landGrant':
    case 'development':
      if (pb[root] === undefined) return NOT_HERE;
      return has(PART_ROWS[root], a) ? { unit: [root, a!], row: PART_ROWS[root][a!]! } : NO_FIELD;
    case 'auction':
      if (!pb.auction || (a !== undefined && !has(pb.auction, a))) return NOT_HERE;
      if (a === undefined) return NO_FIELD;
      if (b === 'market') return { refused: 'market play is step 3' };
      if (b === 'per') return c === undefined ? NO_FIELD : { unit: ['auction', a, 'per', c], row: perRow };
      return has(GOOD_ROWS, b) ? { unit: ['auction', a, b!], row: GOOD_ROWS[b!]! } : NO_FIELD;
    default:
      return NO_FIELD;
  }
}

/** A JSON Pointer's keys, or null for a string that is not one. */
function parse(path: unknown): string[] | null {
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  return path
    .slice(1)
    .split('/')
    .map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function getAt(root: unknown, segs: readonly string[]): unknown {
  return segs.reduce<unknown>((at, k) => (at !== null && typeof at === 'object' && Object.hasOwn(at, k) ? (at as Record<string, unknown>)[k] : undefined), root);
}

/**
 * Sets a value at a key the field already holds, or appends to an array (`-`, or the index after its last). Returns
 * the key it set, or null: an object's own keys only, so never a prototype key, and an array index only as digits.
 */
function setAt(root: unknown, segs: readonly string[], value: unknown): string | null {
  const parent = getAt(root, segs.slice(0, -1));
  const key = segs.at(-1)!;
  if (Array.isArray(parent)) {
    if (key !== '-' && !/^(0|[1-9][0-9]*)$/.test(key)) return null;
    const i = key === '-' ? parent.length : Number(key);
    if (i > parent.length) return null;
    parent[i] = value;
    return String(i);
  }
  if (!isObject(parent) || !Object.hasOwn(parent, key)) return null;
  parent[key] = value;
  return key;
}

/** Writes a whole field, making the optional objects above it (rivalReads, per). */
function putUnit(pb: Playbook, unit: readonly string[], value: unknown): void {
  let at = pb as unknown as Record<string, unknown>;
  for (const k of unit.slice(0, -1)) {
    if (!isObject(at[k])) at[k] = {};
    at = at[k] as Record<string, unknown>;
  }
  at[unit.at(-1)!] = value;
}

function dropUnit(pb: Playbook, unit: readonly string[]): void {
  const parent = getAt(pb, unit.slice(0, -1));
  if (isObject(parent)) delete parent[unit.at(-1)!];
}

/** Every field the playbook holds, in the order step 5 checks them (a walk-away before the start it bounds). */
function unitsOf(pb: Playbook): string[][] {
  const out: string[][] = ['kind', 'moneyMaker', 'monopolyTarget', 'cashFloor', 'landTarget', 'reason'].map((k) => ['strategy', k]);
  for (const p of Object.keys(pb.strategy.stances ?? {})) out.push(['strategy', 'stances', p]);
  for (const p of Object.keys(pb.rivalReads ?? {})) out.push(['rivalReads', p]);
  if (pb.lessons !== undefined) out.push(['lessons']);
  for (const k of ['drone', 'list'] as const) if (pb.planning?.[k] !== undefined) out.push(['planning', k]);
  if (pb.landGrant) {
    for (const k of ['ranked', 'pressShare', 'claims', 'deny', 'planB']) out.push(['landGrant', k]);
    if (pb.landGrant.pair !== undefined) out.push(['landGrant', 'pair']);
  }
  if (pb.development) for (const k of ['route', 'timeBudgetMs', 'ifSoldOut']) out.push(['development', k]);
  for (const [g, part] of Object.entries(pb.auction ?? {})) {
    for (const k of ['role', 'hold', 'walkAway', 'start', 'concedeCrPerS', 'vsRival', 'bluff']) out.push(['auction', g, k]);
    for (const p of Object.keys(part?.per ?? {})) out.push(['auction', g, 'per', p]);
    if (part?.market !== undefined) out.push(['auction', g, 'market']);
  }
  if (pb.store !== undefined) out.push(['store']);
  return out;
}

/** The objects a playbook holds its fields in, where present: the stances, each part, each good, a good's per, the rival reads. */
function containersOf(pb: Playbook): string[][] {
  const out: string[][] = [['strategy', 'stances']];
  for (const k of PART_KEYS) if (pb[k] !== undefined) out.push([k]);
  if (isObject(pb.auction)) {
    for (const [g, part] of Object.entries(pb.auction)) {
      out.push(['auction', g]);
      if (isObject(part) && part.per !== undefined) out.push(['auction', g, 'per']);
    }
  }
  if (pb.rivalReads !== undefined) out.push(['rivalReads']);
  return out;
}

/**
 * What a refused field that the playbook must have is replaced with: a strategy field alone, else the whole part or
 * the good's whole play that holds it, so the siblings that bound its value (a role, a walk-away) come with it.
 */
const holderOf = (unit: readonly string[]) => unit.slice(0, unit[0] === 'strategy' || unit[0] === 'auction' ? 2 : 1); // literal-ok: a strategy field and a good sit two keys deep, a part one

/** A field the playbook may lack: one that fails step 5 is dropped; a field every playbook of its phase has stays. */
const isOptional = (unit: readonly string[]) =>
  ['rivalReads', 'lessons', 'store'].includes(unit[0]!) || (unit[1] === 'stances' && unit[2] !== undefined) || unit.includes('per') || ['drone', 'list', 'pair', 'market'].includes(unit.at(-1)!);

const pathOf = (segs: readonly string[]) => `/${segs.map((k) => k.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const STRATEGY_ROOTS = new Set(['strategy', 'rivalReads', 'lessons']);
const PART_KEYS = ['planning', 'landGrant', 'development', 'auction'] as const;
/** The draft phase that writes a playbook phase's parts: WS2's land-grant playbook is the planning draft's. */
const DRAFTS: Partial<Record<Playbook['phase'], DraftPhase>> = { planning: 'planning', landGrant: 'planning', development: 'development', auction: 'auction' };

function validate(profile: ValidatorProfile, state: GameState, seat: PlayerId, draft: Playbook, edits: readonly PlanEdit[]): ReturnType<ValidatePlan> {
  if (!state.players.some((p) => p.id === seat)) throw new Error(`Unknown player ${seat}`);
  const pb = structuredClone(draft);
  delete pb.edits;
  delete pb.rejected;
  const ctx: Ctx = {
    state,
    seat,
    mind: profile.mind,
    // A profile with no level reads as one that never corners (RULE-2's unknown).
    corners: profile.mind.level?.corners === true,
    others: new Set(state.players.map((p) => p.id).filter((id) => id !== seat)),
    pb,
    base: pb,
  };
  /**
   * Each accepted edit, with the keys of the value it set (an append's `-` as the index it took) and the length of each
   * list on that path as the edit left it: a clamp that changes one has shifted the entries, so the keys no longer
   * reach what the edit set.
   */
  const accepted: (Accepted & { i: number; at: string[]; lists: [string[], number][] })[] = [];
  const rejected: (Rejected & { i: number })[] = [];

  const apply = (e: PlanEdit, i: number): void => {
    const segs = parse(e.path);
    const u = segs ? unitOf(segs, pb) : NO_FIELD;
    const refused = (why: string) => rejected.push({ path: e.path, to: e.to, why, i });
    if ('refused' in u) return void refused(u.refused);
    let value: unknown = structuredClone(e.to);
    let at = segs!;
    const lists: [string[], number][] = [];
    if (segs!.length > u.unit.length) {
      value = structuredClone(getAt(pb, u.unit));
      const key = setAt(value, segs!.slice(u.unit.length), structuredClone(e.to));
      if (key === null) return void refused('no such field');
      at = [...segs!.slice(0, -1), key];
      for (let k = u.unit.length; k < at.length; k++) {
        const list = getAt(value, at.slice(u.unit.length, k));
        if (Array.isArray(list)) lists.push([at.slice(0, k), list.length]);
      }
    }
    const verdict = u.row(value, ctx, u.unit);
    if ('refused' in verdict) return void refused(verdict.refused);
    const from = getAt(pb, at);
    putUnit(pb, u.unit, verdict.plays);
    accepted.push({ path: e.path, from, to: undefined, reason: e.reason, i, at, lists });
    if (verdict.why) refused(verdict.why);
  };

  // Steps 2-4: the strategy's edits, a re-draft if the plan changed, then the parts' edits.
  edits.forEach((e, i) => STRATEGY_ROOTS.has(parse(e.path)?.[0] ?? '') && apply(e, i));
  const phase = DRAFTS[draft.phase];
  const replanned = (['kind', 'moneyMaker', 'monopolyTarget'] as const).some((k) => pb.strategy[k] !== draft.strategy[k]);
  if (replanned && phase) {
    const redrafted = draftPlaybook({ state, seat, mind: profile.mind, seed: profile.seed, phase, land: profile.land ?? null, strategy: pb.strategy, month: draft.month });
    for (const k of PART_KEYS) if (pb[k] !== undefined && redrafted[k] !== undefined) Object.assign(pb, { [k]: redrafted[k] });
  }
  ctx.base = structuredClone(pb);
  edits.forEach((e, i) => !STRATEGY_ROOTS.has(parse(e.path)?.[0] ?? '') && apply(e, i));

  // Step 5: every value that plays, against the same rows, pass after pass until one changes nothing. A refused field
  // the playbook may lack is dropped; any other plays the engine's own draft of what holds it (holderOf), which passes
  // the rows by INV-1. The next pass checks it against the rest of the playbook (RULE-2's hold against the draft's).
  const drafted = new Map<DraftPhase | 'strategy', Playbook>();
  const engineDraft = (unit: readonly string[]): Playbook => {
    const part = (PART_KEYS as readonly string[]).includes(unit[0]!) ? DRAFTS[unit[0] as (typeof PART_KEYS)[number]]! : null;
    const key = part ?? 'strategy';
    if (!drafted.has(key)) {
      const phase = part ?? DRAFTS[draft.phase] ?? 'planning';
      // A part is drafted under the strategy that plays; a strategy field is the engine's own.
      drafted.set(key, draftPlaybook({ state, seat, mind: profile.mind, seed: profile.seed, phase, land: profile.land ?? null, month: draft.month, ...(part && { strategy: pb.strategy }) }));
    }
    return drafted.get(key)!;
  };
  const check = (): boolean => {
    let changed = false;
    /** What this pass dropped: nothing under it is checked. */
    const gone: string[][] = [];
    const under = (unit: readonly string[]) => gone.some((g) => g.every((k, n) => unit[n] === k));
    const settle = (unit: string[], v: Verdict) => {
      const value = getAt(pb, unit);
      const reject = (why: string) => rejected.push({ path: pathOf(unit), to: value, why, i: edits.length });
      const drop = (at: string[], why: string) => {
        reject(why);
        dropUnit(pb, at);
        gone.push(at);
        changed = true;
      };
      if (!('refused' in v)) {
        if (same(v.plays, value)) return;
        reject(v.why ?? `clamped to ${show(v.plays)}`);
        putUnit(pb, unit, v.plays);
        changed = true;
        return;
      }
      if (isOptional(unit)) return drop(unit, v.refused);
      const holder = holderOf(unit);
      const plays = getAt(engineDraft(unit), holder);
      // The engine drafts nothing there (a good no longer up): it goes.
      if (plays === undefined) return drop(holder, v.refused);
      const named = holder.length < unit.length ? `${pathOf(holder)} plays` : plays === null || typeof plays !== 'object' ? `draft plays ${show(plays)}` : 'draft value plays';
      reject(`${v.refused}; the engine's ${named}`);
      if (same(plays, getAt(pb, holder))) return;
      putUnit(pb, holder, structuredClone(plays));
      putUnit(ctx.base, holder, structuredClone(plays));
      changed = true;
    };
    for (const unit of containersOf(pb)) if (!under(unit) && !isObject(getAt(pb, unit))) settle(unit, refuse('not an object'));
    for (const unit of unitsOf(pb)) {
      if (under(unit)) continue;
      const verdict = unitOf(unit, pb);
      settle(unit, 'refused' in verdict ? verdict : verdict.row(getAt(pb, unit), ctx, unit));
    }
    return changed;
  };
  // literal-ok: a guard, not a bound: a replaced part settles in two passes, and a third finds nothing to change
  for (let passes = 4; passes > 0 && check(); passes--);

  const strip = <T extends { i: number }>(xs: T[]) => xs.sort((a, b) => a.i - b.i).map(({ i: _, ...x }) => x);
  // Step 6: an accepted edit's `to` is the value that plays. An edit to a field that was dropped, or inside a list a
  // clamp shortened or lengthened, is clamped only: it stays in rejected and is not listed here.
  const stillPlays = ({ at, lists }: (typeof accepted)[number]) =>
    getAt(pb, at) !== undefined && lists.every(([path, length]) => (getAt(pb, path) as unknown[] | undefined)?.length === length);
  const outEdits = strip(accepted.filter(stillPlays).map(({ at, lists: _, ...a }) => ({ ...a, to: getAt(pb, at) })));
  const outRejected = strip(rejected);
  pb.by = outEdits.length > 0 ? 'llm' : 'engine';
  if (outEdits.length > 0) pb.edits = outEdits;
  if (outRejected.length > 0) pb.rejected = outRejected;
  return { playbook: pb, rejected: outRejected };
}

/** The gate for one seat, throwing on its own error: for a caller that handles it (HC-9). */
export function validatePlaybook(profile: ValidatorProfile): ValidatePlan {
  return (state, seat, draft, edits) => validate(profile, state, seat, draft, edits);
}

/** The gate for one seat. The function it returns never throws: on its own error, the draft plays and every edit is refused. */
export function validatorFor(profile: ValidatorProfile): ValidatePlan {
  const gate = validatePlaybook(profile);
  return (state, seat, draft, edits) => {
    try {
      return gate(state, seat, draft, edits);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`AI seat ${seat}: validator error, the draft plays and every edit is refused: ${message}`);
      const all = Array.isArray(edits) ? edits : [];
      return { playbook: draft, rejected: all.map((e) => ({ path: e?.path, to: e?.to, why: `validator error: ${message}` })) };
    }
  };
}
