import { analysisSeconds, DEV_STEER, floorConfig, placeAt, pubPayoutFor, terrainShare, WOLVES, type FloorConfig, type GameState, type HallPlace } from '@mule/engine';
import type { MuleView, MyView, PlayerView, ReachView, TileView } from '@mule/protocol';
import type { LiveWalker, Slot } from '@mule/ui';
import { toSlot } from '../../game/derive';
import type { Drawn } from './frames';
import { guideOf, storeOf, type Guide } from './guide';
import { fromView, paceOf, type Live } from './live';

/**
 * Everything an arcade screen draws, worked out once a frame from the view and the live positions: pure, so the phone,
 * the laptop and the tests read the same. The mock read these off its sim's world; here the view is the truth for
 * money, stock, plots and the button's words, and the frames (and your own prediction) for where everyone stands.
 */

export interface Where {
  x: number;
  y: number;
  space: 'map' | 'hall';
}

/** A colonist with where it stands, as the live layer draws it, and what the screens say of it. */
export interface ArcadeColonist extends LiveWalker {
  space: 'map' | 'hall';
  done: boolean;
  /** Wolf pelts it carries to sell at the store. */
  pelts: number;
}

/** The ground under a colonist and what it does to its speed, the parts of RULE-2 a screen can say in words. */
export interface Underfoot {
  /** The plot it stands on; null in the hall. */
  tile: TileView | null;
  ground: number;
  lead: number;
  bitten: number;
}

/** What a press does, where: the thing the button would act on, lit on your own screen. */
export type Target = { space: 'map'; tile: { x: number; y: number } } | { space: 'map'; door: 'L' | 'R' } | { space: 'hall'; room: HallPlace } | null;

export interface ArcadeSeat {
  view: MuleView;
  me: MyView;
  self: PlayerView;
  slot: Slot;
  /** Your colonist, where your screen shows it; null before the server has placed it. */
  mine: Where | null;
  colonists: ArcadeColonist[];
  /** Development seconds left on the one clock, and its length. While month 1's clock waits it stands full. */
  seconds: number;
  total: number;
  waiting: boolean;
  over: boolean;
  reach: ReachView;
  target: Target;
  /** What the pub pays now. */
  pay: number;
  guide: Guide;
  underfoot: Underfoot;
  /** Assaying the plot it stands on, until this server time. */
  assayUntil: number | null;
  store: TileView;
  status: Live['status'];
  cfg: FloorConfig;
}

/** Before the server's first reach (a server that does not steer yet): a dim button with no words to act on. */
const NO_REACH: ReachView = { verb: '', detail: null, enabled: false };

export const tileUnder = (view: Pick<MuleView, 'tiles' | 'width'>, at: Where): TileView | null =>
  at.space === 'map' ? (view.tiles[Math.floor(at.y) * view.width + Math.floor(at.x)] ?? null) : null;

type SeatSums = Pick<MyView, 'id' | 'species' | 'devSeconds'>;

/** Your seat as the GameState the engine's sums read: the month, and your species and turn, still developing. */
function sumsState(view: Pick<MuleView, 'month'>, me: SeatSums): GameState {
  const player = { id: me.id, species: me.species, devSeconds: me.devSeconds, doneDeveloping: false };
  return { phase: 'development', month: view.month, players: [player] } as unknown as GameState;
}

/** What the pub pays with `seconds` left: the engine's pubPayoutFor. */
export function pubPay(view: Pick<MuleView, 'month'>, me: SeatSums, seconds: number): number {
  return pubPayoutFor(sumsState(view, me), me.id, seconds);
}

/** Seconds a geo analysis takes you: the engine's analysisSeconds. */
export function assaySeconds(view: Pick<MuleView, 'month'>, me: SeatSums): number {
  return analysisSeconds(sumsState(view, me), me.id);
}

function walkerOf(view: MuleView, p: PlayerView, at: Drawn, mine: boolean, cfg: FloorConfig): ArcadeColonist {
  const tile = tileUnder(view, at);
  return {
    id: p.id,
    slot: toSlot(p.slot),
    species: p.species,
    name: p.name,
    x: at.x,
    y: at.y,
    space: at.space,
    facing: at.facing,
    moving: at.moving,
    lead: at.lead,
    pace: paceOf(p),
    terrain: tile ? terrainShare(tile.terrain, cfg) || 1 : 1,
    bitten: !!p.colonist?.bitten,
    encounter: p.colonist?.encounter ?? null,
    condition: p.condition,
    mine,
    done: p.doneDeveloping,
    pelts: p.colonist?.pelts ?? 0,
  };
}

/** Where every colonist stands: yours from your prediction, the others from the frames, else the view's own. */
export function colonistsOf(view: MuleView, live: Live, meId: string | null, cfg: FloorConfig = floorConfig()): ArcadeColonist[] {
  return view.players.flatMap((p) => {
    const mine = p.id === meId;
    const at = (mine ? live.me && { id: p.id, ...live.me } : null) ?? live.others.get(p.id) ?? fromView(p);
    return at ? [walkerOf(view, p, at, mine, cfg)] : [];
  });
}

/** The thing the server's reach acts on, from where you stand: the plot under you, the door you are at, the room you are in. */
export function targetOf(reach: ReachView, mine: Where | null, store: { x: number }): Target {
  if (!reach.enabled || !mine) return null;
  const word = reach.verb.split(' ')[0];
  if (mine.space === 'hall') {
    const room = placeAt(mine);
    return room ? { space: 'hall', room } : null;
  }
  if (word === 'ENTER') return { space: 'map', door: mine.x < store.x + 0.5 ? 'L' : 'R' };
  if (word === 'INSTALL' || word === 'SWAP' || word === 'ANALYSE' || word === 'FIT') return { space: 'map', tile: { x: Math.floor(mine.x), y: Math.floor(mine.y) } };
  return null;
}

export function arcadeSeat(view: MuleView, me: MyView, self: PlayerView, live: Live, serverNow: number, cfg: FloorConfig = floorConfig()): ArcadeSeat {
  const waiting = !!view.clockWaitsFor;
  const total = me.devSeconds;
  const seconds = waiting ? total : me.devEndsAt === null ? 0 : Math.max(0, (me.devEndsAt - serverNow) / 1000);
  const over = !waiting && seconds <= 0;
  const colonists = colonistsOf(view, live, me.id, cfg);
  const at = colonists.find((c) => c.id === me.id);
  const mine: Where | null = at ? { x: at.x, y: at.y, space: at.space } : null;
  const store = storeOf(view.tiles);
  const reach = me.reach ?? NO_REACH;
  const assayUntil = self.colonist?.assayUntil != null && self.colonist.assayUntil > serverNow ? self.colonist.assayUntil : null;
  const pay = pubPay(view, me, seconds);
  const tile = mine ? tileUnder(view, mine) : null;
  return {
    view,
    me,
    self,
    slot: toSlot(self.slot),
    mine,
    colonists,
    seconds,
    total,
    waiting,
    over,
    reach,
    target: targetOf(reach, mine, store),
    pay,
    guide: mine ? guideOf({ view, me, self, at: mine, analysing: assayUntil !== null, over, pay, cfg }) : null,
    underfoot: {
      tile,
      ground: tile ? terrainShare(tile.terrain, cfg) || 1 : 1,
      lead: me.carriedMule ? DEV_STEER.leadPace : 1,
      bitten: self.colonist?.bitten && mine?.space === 'map' ? WOLVES.bittenPace : 1,
    },
    assayUntil,
    store,
    status: live.status,
    cfg,
  };
}
