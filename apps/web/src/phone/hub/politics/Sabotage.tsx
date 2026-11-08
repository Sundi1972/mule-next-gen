import { GOODS, POLITICS, type Good, type SabotageTarget } from '@mule/engine';
import type { MuleView, MyPoliticsView, MyView, TileView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodIcon } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { tileAt } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { OnlyYou } from '../OnlyYou';
import { useToday } from '../state';

/**
 * P6, the secret order (slice 4, S4-C14, S4-RULE-1..4), from the approved mock design/mocks/politics-p2 @ d6977e1a. Two
 * ways in, one order a month between them:
 *  - a power cut, from Look on a rival's working plot ("Sabotage this plot · Only you");
 *  - a market rumour, at the Market desk ("Start a rumour · Only you").
 * The pending order says what it costs and offers Withdraw; "Your orders" lists every order this player made. Costs and
 * odds are the server's (PoliticsView.sabotage.terms). The TV never shows any of it.
 */

type Sab = NonNullable<MyPoliticsView['sabotage']>;
type Terms = { cost: number; success: number; detect: number };
const pct = (p: number) => `${Math.round(p * 100)}%`;
const shift = () => pct(POLITICS.sabotage.orders.rumour.shift);
const nameOf = (view: Pick<MuleView, 'players'>, id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';
const goodWord = (g: Good) => GOOD_NAME[g].toLowerCase();
const working = (tile: Pick<TileView, 'outfit'>) => tile.outfit !== null && tile.outfit !== 'greenBelt';

/** The order in words, for the pending line and the "you already ordered" line. */
export function orderWords(view: MuleView, t: SabotageTarget): string {
  if (t.kind === 'rumour') return `a rumour: ${goodWord(t.good)} ${t.dir} ${shift()}`;
  const tile = view.tiles[t.tile];
  const good = tile && working(tile) ? `${goodWord(tile.outfit as Good)} ` : '';
  return `a power cut on ${nameOf(view, tile?.owner ?? null)}’s ${good}plot`;
}

/** The players this one holds an active pact with (slice 3's cards): a caught cut on them breaks it. */
export function pactPartners(me: Pick<MyView, 'id' | 'deals'>): string[] {
  return (me.deals?.cards ?? []).filter((c) => c.terms.kind === 'pact' && c.status === 'active').map((c) => (c.from === me.id ? c.to : c.from));
}

/** The sabotage ban's multiplier in force now: 1 with no ban. */
export const banOf = (view: Pick<MuleView, 'politics'>) => view.politics?.laws?.sabotageBan?.setting ?? 1;

/**
 * What a caught saboteur loses (S4-RULE-5): the caught points times the ban, and on a pact partner the broken pact's
 * points on top (Heiko, 7 Nov: −10, −20 more under a pact).
 */
function caughtWords(view: MuleView, victim: string | null, pacts: string[], mult: number): string {
  const pact = victim !== null && pacts.includes(victim);
  const points = -POLITICS.reputation.moves.caught * mult - (pact ? POLITICS.reputation.moves.pactBroken : 0);
  return `−${points} reputation${pact ? ` (your pact with ${nameOf(view, victim)})` : ''}${mult > 1 ? `, ×${mult} under the ban` : ''}, and a fine.`;
}

/** Cost, odds and what being caught costs: the same block for both orders. */
function TermsList({ terms, caughtCost, children }: { terms: Terms; caughtCost: string; children?: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs @min-[1100px]/shell:text-sm" data-testid="order-terms">
      <dt className="text-ink-3">Crew</dt>
      <dd data-testid="order-cost">
        <strong data-num className="font-mono">
          {terms.cost} cr
        </strong>
        , paid at the month end
      </dd>
      <dt className="text-ink-3">Works</dt>
      <dd data-testid="order-success">
        <strong data-num className="font-mono">
          {pct(terms.success)}
        </strong>{' '}
        of the time
      </dd>
      <dt className="text-ink-3">Seen</dt>
      <dd data-testid="order-detect">
        <strong data-num className="font-mono">
          {pct(terms.detect)}
        </strong>{' '}
        of the time{children}
      </dd>
      <dt className="text-ink-3">If seen</dt>
      <dd data-testid="order-caught">Your name on every screen, {caughtCost}</dd>
    </dl>
  );
}

/** Why no order can be placed now, if none can. */
function blocked(sab: Sab): string | null {
  return sab.canOrder === 'notPlanning' ? 'Orders are placed in planning.' : null;
}

/** The month's one order, already placed: what it is, what it costs, and Withdraw. */
function PendingOrder({ view, sab, here, onWithdraw }: { view: MuleView; sab: Sab; here: boolean; onWithdraw(): void }) {
  if (!sab.order) return null;
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-control border p-2', here ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} role="status" data-testid="order-pending">
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps text-[10px]!">{here ? 'Ordered in secret' : 'This month’s order'}</span>
        <OnlyYou />
      </span>
      <p className="text-sm" data-testid="order-pending-words">
        {here ? (
          sab.order.kind === 'powerCut' ? (
            'The crew cuts the power when production starts.'
          ) : (
            'The rumour spreads at production; the price moves when the auction opens.'
          )
        ) : (
          <>You already ordered {orderWords(view, sab.order)}. One order a month: withdraw it to order this instead.</>
        )}{' '}
        <span className="text-ink-2">{sab.owed} cr at the month end.</span>
      </p>
      <Button size="md" variant="outline" className="w-full" onClick={onWithdraw} data-testid="order-withdraw">
        Withdraw the order
      </Button>
    </div>
  );
}

interface OrderProps {
  view: MuleView;
  sab: Sab;
  ban: number;
  pacts: string[];
  onOrder(t: SabotageTarget): void;
  onWithdraw(): void;
}

/** Under Look, on a rival's plot: the door, then the order. Nothing on your own plot, a free one, or the store. */
function PowerCutOrder({ view, tile, meId, sab, ban, pacts, onOrder, onWithdraw }: OrderProps & { tile: TileView; meId: string }) {
  const [open, setOpen] = useState(false);
  const terms = view.politics?.sabotage?.terms.powerCut;
  if (!terms || !tile.owner || tile.owner === meId || sab.canOrder === 'off') return null;
  const index = tile.y * view.width + tile.x;
  const here = sab.order?.kind === 'powerCut' && sab.order.tile === index;
  if (sab.order) return <PendingOrder view={view} sab={sab} here={here} onWithdraw={onWithdraw} />;
  if (!open)
    return (
      <Button size="md" variant="outline" className="w-full justify-between" onClick={() => setOpen(true)} data-testid="sabotage-door">
        <span>Sabotage this plot</span>
        <OnlyYou />
      </Button>
    );
  return (
    <section className="flex flex-col gap-1.5 rounded-control border border-alert p-2" data-testid="order-powercut">
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps text-[10px]!">Power cut</span>
        <OnlyYou />
      </span>
      {working(tile) ? (
        <>
          <p className="text-sm" data-testid="order-effect">
            {nameOf(view, tile.owner)}’s {goodWord(tile.outfit as Good)} plot makes nothing this month.
          </p>
          <TermsList terms={terms} caughtCost={caughtWords(view, tile.owner, pacts, ban)}>
            <span className="block text-ink-3">A guarded plot always catches you, and nobody but the Sheriff knows which are guarded.</span>
          </TermsList>
          {blocked(sab) ? (
            <p className="text-xs text-ink-2" data-testid="order-blocked">
              {blocked(sab)}
            </p>
          ) : (
            <Button size="md" variant="danger" className="w-full" onClick={() => onOrder({ kind: 'powerCut', tile: index })} data-testid="order-confirm">
              Order in secret · {terms.cost} cr
            </Button>
          )}
          <span className="text-[11px] text-ink-3">One order a month: a power cut or a rumour.</span>
        </>
      ) : (
        <p className="text-sm text-ink-2" data-testid="order-not-working">
          No MULE works here, so there is no power to cut.
        </p>
      )}
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 self-start text-xs font-semibold text-holo" data-testid="order-cancel">
        Not now
      </button>
    </section>
  );
}

/** At the market: the other order, against a good's opening price at the auction. */
function RumourOrder({ view, sab, ban, pacts, onOrder, onWithdraw }: OrderProps) {
  const [open, setOpen] = useState(false);
  const [good, setGood] = useState<Good | null>(null);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const terms = view.politics?.sabotage?.terms.rumour;
  if (!terms || sab.canOrder === 'off') return null;
  if (sab.order) return <PendingOrder view={view} sab={sab} here={sab.order.kind === 'rumour'} onWithdraw={onWithdraw} />;
  if (!open)
    return (
      <Button size="md" variant="outline" className="w-full justify-between" onClick={() => setOpen(true)} data-testid="rumour-door">
        <span>Start a rumour</span>
        <OnlyYou />
      </Button>
    );
  return (
    <section className="flex flex-col gap-1.5 rounded-control border border-alert p-2" data-testid="order-rumour">
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps text-[10px]!">Rumour</span>
        <OnlyYou />
      </span>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Which good" data-testid="rumour-goods">
        {GOODS.map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={good === g}
            onClick={() => setGood(g)}
            data-testid={`rumour-good-${g}`}
            className={cx('flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control border px-1 py-1 text-[11px] font-semibold leading-tight', good === g ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}
          >
            <GoodIcon good={g} size={14} />
            <span>{GOOD_NAME[g]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Which way" data-testid="rumour-dir">
        {(['up', 'down'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dir === d}
            onClick={() => setDir(d)}
            data-testid={`rumour-${d}`}
            className={cx('min-h-11 rounded-control border text-sm font-semibold', dir === d ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}
          >
            {d === 'up' ? `Price up ${shift()}` : `Price down ${shift()}`}
          </button>
        ))}
      </div>
      {good && (
        <p className="text-sm" data-testid="rumour-effect">
          {GOOD_NAME[good]} opens {shift()} {dir === 'up' ? 'higher' : 'lower'} at this month’s auction.
        </p>
      )}
      <TermsList terms={terms} caughtCost={caughtWords(view, null, pacts, ban)} />
      {blocked(sab) ? (
        <p className="text-xs text-ink-2" data-testid="rumour-blocked">
          {blocked(sab)}
        </p>
      ) : (
        <Button size="md" variant="danger" className="w-full" disabled={!good} onClick={() => good && onOrder({ kind: 'rumour', good, dir })} data-testid="rumour-confirm">
          {good ? `Order in secret · ${terms.cost} cr` : 'Pick a good'}
        </Button>
      )}
      <span className="text-[11px] text-ink-3">One order a month: a power cut or a rumour.</span>
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 self-start text-xs font-semibold text-holo" data-testid="rumour-cancel">
        Not now
      </button>
    </section>
  );
}

const OUTCOME: Record<Sab['mine'][number]['outcome'], [string, string]> = {
  pending: ['Ordered', 'border-holo-line text-ink-2'],
  done: ['Worked', 'border-ok text-ok'],
  failed: ['Failed', 'border-holo-line text-ink-3'],
  caught: ['Caught', 'border-alert text-alert'],
};

/** Whose plot an order of yours cut: the victim once it resolved; while pending (no victim yet), the plot's owner now. */
function cutOwner(view: MuleView, o: Sab['mine'][number]): string | null {
  return o.victim ?? (o.at ? (tileAt(view, o.at.x, o.at.y)?.owner ?? null) : null);
}

/**
 * Your own orders, newest first: how each came out, and whether anyone else knows it was you. `public` says the order
 * is public (its effect is known: done, caught or revealed); only `how`, set once the culprit is known, says it was you.
 */
function MyOrders({ view, sab }: { view: MuleView; sab: Sab }) {
  if (sab.mine.length === 0) return null;
  const mine = [...sab.mine].sort((a, b) => b.month - a.month);
  return (
    <section className="flex flex-col gap-1.5" data-testid="my-orders">
      <span className="label-caps flex items-center gap-1.5">
        Your orders <OnlyYou text="" />
      </span>
      <ul className="flex flex-col gap-1">
        {mine.map((o) => {
          const [word, tone] = OUTCOME[o.outcome];
          return (
            <li key={o.id} className="flex items-start gap-2 rounded-control border border-holo-faint p-1.5 text-xs" data-testid={`my-order-${o.id}`}>
              {/* A pending cut on a plot that has since lost its MULE has no crop (good null, WS7's #746). */}
              {o.good && <GoodIcon good={o.good} size={14} />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">
                  Month {o.month}: {o.kind === 'rumour' ? `rumour, ${o.good ? goodWord(o.good) : ''} ${o.dir}` : `power cut on ${nameOf(view, cutOwner(view, o))}’s plot`}
                </span>
                <span className="text-ink-3" data-testid={`my-order-known-${o.id}`}>
                  {o.how !== null ? (o.fine ? `Everyone knows. Fined ${o.fine.due} cr.` : 'Everyone knows it was you.') : 'Nobody knows it was you.'}
                </span>
              </span>
              <span className={cx('shrink-0 rounded-chip border px-1 font-mono text-[10px] font-bold uppercase leading-4', tone)}>{word}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Why this phone may not order sabotage at all, or null when it may: the sitting Sheriff orders none (Heiko; WS7's
 * engine canOrder answers 'sheriff', #780). Read from the public office holder, as WS7 advises. The one place this is
 * decided: if S4-PR-9 puts that reason in the view, this switches to it.
 */
export function orderBarred(view: Pick<MuleView, 'politics'>, me: Pick<MyView, 'id'>): 'sheriff' | null {
  return view.politics?.sheriff === me.id ? 'sheriff' : null;
}

/** This phone's order props: its sabotage, the ban, its pacts, and the intents a tap sends. Null with sabotage off. */
function useOrder(): (OrderProps & { meId: string; barred: 'sheriff' | null }) | null {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const sab = me.politics?.sabotage;
  if (!sab || !view.politics?.sabotage) return null;
  return {
    view,
    sab,
    meId: me.id,
    barred: orderBarred(view, me),
    ban: banOf(view),
    pacts: pactPartners(me),
    onOrder: (target) => client.intent({ type: 'sabotage', target }),
    onWithdraw: () => client.intent({ type: 'sabotage', target: null }),
  };
}

/** Under Look: the power cut's door on the plot looked at, when it is a rival's. */
export function LookSabotage() {
  const order = useOrder();
  const { looked } = useToday();
  const tile = order && looked ? tileAt(order.view, looked.x, looked.y) : undefined;
  if (!order || !tile || order.barred) return null;
  return <PowerCutOrder key={`${tile.x},${tile.y}`} tile={tile} {...order} />;
}

/** At the Market desk: the rumour's door (never the Sheriff's), then this player's orders. */
export function MarketSabotage() {
  const order = useOrder();
  if (!order) return null;
  return (
    <>
      {!order.barred && <RumourOrder {...order} />}
      <MyOrders view={order.view} sab={order.sab} />
    </>
  );
}
