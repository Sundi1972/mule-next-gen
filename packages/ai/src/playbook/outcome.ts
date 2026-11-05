/** How a phase went against the seat's playbook: its own items beside the plan, and the rivals' public facts. See RULE-11. */
import { observe, type AuctionSide, type GameState, type Good, type NoticeEntry, type PhaseOutcome, type Playbook, type PlayerId } from '@mule/engine';

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A public fact as it settled in the open phase: the server's `Notice`, the record's NoticeEntry without its step. */
export type PhaseFact = Without<NoticeEntry, 'type' | 'at' | 'seq'>;

type TradeFact = Extract<PhaseFact, { kind: 'trade' }>;
type DeclareFact = Extract<PhaseFact, { kind: 'declare' }>;
type Rival = PhaseOutcome['rivals'][PlayerId];
type Traded = NonNullable<Rival['traded']>[number];

/** What became of one development step, as the hand logs it; `route` is its index in the route, absent off the route. */
export interface DevelopmentStepLog {
  route?: number;
  outcome: 'done' | 'refused' | 'skipped' | 'replaced' | 'not reached';
  /** The route's log note, or the runner's named drop. */
  note?: string;
}

export interface DevelopmentLog {
  steps: readonly DevelopmentStepLog[];
  usedMs: number;
}

/** A side the seat itself declared for a good, in order; a refused declare left its side as it was. */
export interface OwnDeclare {
  good: Good;
  side: AuctionSide;
  refused?: string;
}

/** The development outcome: each route step beside what became of it, and the time used against the budget. See RULE-11. */
export function developmentOutcome(playbook: Playbook, log: DevelopmentLog): PhaseOutcome {
  const part = playbook.development;
  const items: PhaseOutcome['items'] = [];
  if (part) {
    const byStep = new Map(log.steps.filter((s) => s.route !== undefined).map((s) => [s.route!, s]));
    part.route.forEach((step, i) => {
      const logged = byStep.get(i);
      items.push({ path: `/development/route/${i}`, expected: step, actual: logged?.outcome ?? 'not reached', ...(logged?.note && { note: logged.note }) });
    });
    items.push({ path: '/development/timeBudgetMs', expected: part.timeBudgetMs, actual: log.usedMs });
  }
  return { seat: playbook.seat, month: playbook.month, phase: 'development', items, rivals: emptyRivals(playbook, playbook.seat, []) };
}

/**
 * The auction outcome. The seat's side is its own last accepted declare, else its declare fact (a late declare has
 * none); its hold is read from `observe(state, seat)`. Rivals come from the facts only. See RULE-11, AM-23.
 */
export function auctionOutcome(playbook: Playbook, state: GameState, facts: readonly PhaseFact[], seat: PlayerId, declared: readonly OwnDeclare[] = []): PhaseOutcome {
  const phaseFacts = facts.filter((f) => f.month === playbook.month && f.phase === 'auction');
  const trades = phaseFacts.filter((f): f is TradeFact => f.kind === 'trade');
  const declares = phaseFacts.filter((f): f is DeclareFact => f.kind === 'declare');
  const stock = observe(state, seat).players.find((p) => p.id === seat)!.stock;

  const items: PhaseOutcome['items'] = [];
  for (const [good, play] of Object.entries(playbook.auction ?? {}) as [Good, NonNullable<NonNullable<Playbook['auction']>[Good]>][]) {
    const own = declared.filter((d) => d.good === good);
    const side = own.filter((d) => !d.refused).at(-1)?.side ?? declares.find((d) => d.seat === seat && d.good === good)?.side;
    const notes = [...(play.bluff ? ['bluff'] : []), ...own.flatMap((d) => (d.refused ? [d.refused] : []))];
    // There is no Pass (#335, the auto-trade amendment's RULE-2): a seat sits a good out by staying the buyer everyone
    // starts as and trading none of it, so an 'out' play stood as a buyer that traded nothing is met as 'out'.
    const satOut = play.role === 'out' && side === 'buyer' && !trades.some((t) => t.good === good && (t.buyer === seat || t.seller === seat));
    const role = side === undefined ? 'skipped' : side === 'pass' || satOut ? 'out' : side;
    const priced = side === 'buyer' || side === 'seller' ? side : play.role === 'out' ? null : play.role;
    items.push(
      { path: `/auction/${good}/role`, expected: play.role, actual: role, ...(notes.length > 0 && { note: notes.join('; ') }) },
      { path: `/auction/${good}/hold`, expected: play.hold, actual: stock[good] },
      { path: `/auction/${good}/walkAway`, expected: play.walkAway, actual: priced && worstPrice(trades, seat, good, priced) },
    );
  }

  const rivals = emptyRivals(playbook, seat, [...declares.map((d) => d.seat), ...trades.flatMap((t) => [t.buyer, t.seller])].filter((id) => id !== seat && !isHouse(id)));
  for (const [id, rival] of Object.entries(rivals)) {
    const traded = tradedBy(trades, id);
    const idle = declares.filter((d) => d.seat === id && d.side !== 'pass' && !traded.some((t) => t.good === d.good)).map((d) => d.good);
    if (traded.length > 0) rival.traded = traded;
    if (idle.length > 0) rival.declaredButIdle = [...new Set(idle)];
  }
  return { seat, month: playbook.month, phase: 'auction', items, rivals };
}

const isHouse = (id: string): boolean => id === 'store' || id === 'ship';

/** Every other seat the strategy names, and any the facts add, each with nothing yet. */
function emptyRivals(playbook: Playbook, seat: PlayerId, seen: readonly PlayerId[]): PhaseOutcome['rivals'] {
  const ids = new Set([...Object.keys(playbook.strategy.stances), ...seen]);
  ids.delete(seat);
  return Object.fromEntries([...ids].map((id) => [id, {}]));
}

/** A buyer's highest price paid or a seller's lowest got for the good, houses included; null with no trade. */
function worstPrice(trades: readonly TradeFact[], seat: PlayerId, good: Good, side: 'buyer' | 'seller'): number | null {
  const prices = trades.filter((t) => t.good === good && t[side] === seat).map((t) => t.price);
  if (prices.length === 0) return null;
  return side === 'buyer' ? Math.max(...prices) : Math.min(...prices);
}

/** A seat's trades, one line per good, side and price in the order first traded, its units summed. */
function tradedBy(trades: readonly TradeFact[], id: PlayerId): Traded[] {
  const lines = new Map<string, Traded>();
  for (const t of trades) {
    const side = t.buyer === id ? 'buyer' : t.seller === id ? 'seller' : null;
    if (!side) continue;
    const key = `${t.good}:${side}:${t.price}`;
    const line = lines.get(key);
    if (line) line.qty += t.qty;
    else lines.set(key, { good: t.good, side, price: t.price, qty: t.qty });
  }
  return [...lines.values()];
}
