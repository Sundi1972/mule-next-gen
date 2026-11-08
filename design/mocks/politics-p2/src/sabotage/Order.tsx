import { GOODS, type Good, type SabotageTarget } from '@mule/engine';
import type { MuleView, MyPoliticsView, TileView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodIcon } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { PACTS } from '../fixture';

/**
 * P6, the secret order (slice 4, S4-RULE-1..4). Two ways in, one order a month between them:
 *  - a power cut, from Look on a rival's working plot ("Sabotage this plot · Only you");
 *  - a market rumour, from the market ("Start a rumour · Only you").
 * Placement-neutral (PM, 8 Nov): WS6's shell puts Look under Overview's map; the rumour likely beside the market there.
 * The TV never shows any of it.
 */

type Sab = NonNullable<MyPoliticsView['sabotage']>;
type Terms = { cost: number; success: number; detect: number };
const pct = (p: number) => `${Math.round(p * 100)}%`;
const nameOf = (view: Pick<MuleView, 'players'>, id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';
const goodWord = (g: Good) => GOOD_NAME[g].toLowerCase();

/** The order in words, for the pending line and the "you already ordered" line. */
export function orderWords(view: MuleView, t: SabotageTarget): string {
  if (t.kind === 'rumour') return `a rumour: ${goodWord(t.good)} ${t.dir} 25%`;
  const tile = view.tiles[t.tile]!;
  return `a power cut on ${nameOf(view, tile.owner)}’s ${tile.outfit && tile.outfit !== 'greenBelt' ? goodWord(tile.outfit) : ''} plot`.replace('  ', ' ');
}

/** Cost, odds and what being caught costs: the same block for both orders. */
function Terms({ terms, caughtCost, children }: { terms: Terms; caughtCost: string; children?: ReactNode }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs @min-[1100px]/shell:text-sm" data-testid="order-terms">
      <dt className="text-ink-3">Crew</dt>
      <dd data-testid="order-cost"><strong data-num className="font-mono">{terms.cost} cr</strong>, paid at the month end</dd>
      <dt className="text-ink-3">Works</dt>
      <dd data-testid="order-success"><strong data-num className="font-mono">{pct(terms.success)}</strong> of the time</dd>
      <dt className="text-ink-3">Seen</dt>
      <dd data-testid="order-detect">
        <strong data-num className="font-mono">{pct(terms.detect)}</strong> of the time{children}
      </dd>
      <dt className="text-ink-3">If seen</dt>
      <dd data-testid="order-caught">Your name on every screen, {caughtCost}</dd>
    </dl>
  );
}

/**
 * What a caught saboteur loses: 10 reputation, 20 more under a pact with the victim, times the ban (Heiko, 7 Nov).
 * `ban` is the sabotage ban's multiplier, a prop because trunk's LawId has no sabotageBan yet (P11 adds it).
 */
function caughtWords(view: MuleView, victim: string | null, mult: number): string {
  const pact = victim !== null && PACTS.includes(victim);
  const points = (10 + (pact ? 20 : 0)) * mult;
  return `−${points} reputation${pact ? ` (your pact with ${nameOf(view, victim)})` : ''}${mult > 1 ? `, ×${mult} under the ban` : ''}, and a fine.`;
}

/** Why no order can be placed now, if none can. */
function blocked(sab: Sab): string | null {
  if (sab.canOrder === 'notPlanning') return 'Orders are placed in planning.';
  if (sab.canOrder === 'off') return null;
  return null;
}

/** The month's one order, already placed: what it is, what it costs, and Withdraw. */
export function PendingOrder({ view, sab, here, onWithdraw }: { view: MuleView; sab: Sab; here: boolean; onWithdraw(): void }) {
  if (!sab.order) return null;
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-control border p-2', here ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} role="status" data-testid="order-pending">
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps text-[10px]!">{here ? 'Ordered in secret' : 'This month’s order'}</span>
        <OnlyYou />
      </span>
      <p className="text-sm" data-testid="order-pending-words">
        {here ? (sab.order.kind === 'powerCut' ? 'The crew cuts the power when production starts.' : 'The rumour spreads at production; the price moves when the auction opens.') : <>You already ordered {orderWords(view, sab.order)}. One order a month: withdraw it to order this instead.</>}
        {' '}<span className="text-ink-2">{sab.owed} cr at the month end.</span>
      </p>
      <Button size="md" variant="outline" className="w-full" onClick={onWithdraw} data-testid="order-withdraw">
        Withdraw the order
      </Button>
    </div>
  );
}

/** Under Look, on a rival's plot: the door, then the order. Nothing on your own plot, a free one, or the store. */
export function PowerCutOrder({ view, tile, meId, sab, ban = 1, onOrder, onWithdraw }: { view: MuleView; tile: TileView; meId: string; sab: Sab; ban?: number; onOrder(t: SabotageTarget): void; onWithdraw(): void }) {
  const [open, setOpen] = useState(false);
  if (!tile.owner || tile.owner === meId || sab.canOrder === 'off') return null;
  const index = tile.y * view.width + tile.x;
  const here = sab.order?.kind === 'powerCut' && sab.order.tile === index;
  const terms = view.politics!.sabotage!.terms.powerCut;
  const working = tile.outfit !== null && tile.outfit !== 'greenBelt';
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
      {working ? (
        <>
          <p className="text-sm" data-testid="order-effect">
            {nameOf(view, tile.owner)}’s {goodWord(tile.outfit as Good)} plot makes nothing this month.
          </p>
          <Terms terms={terms} caughtCost={caughtWords(view, tile.owner, ban)}>
            <span className="block text-ink-3">A guarded plot always catches you, and nobody but the Sheriff knows which are guarded.</span>
          </Terms>
          {blocked(sab) ? (
            <p className="text-xs text-ink-2" data-testid="order-blocked">{blocked(sab)}</p>
          ) : (
            <Button size="md" variant="danger" className="w-full" onClick={() => onOrder({ kind: 'powerCut', tile: index })} data-testid="order-confirm">
              Order in secret · {terms.cost} cr
            </Button>
          )}
          <span className="text-[11px] text-ink-3">One order a month: a power cut or a rumour.</span>
        </>
      ) : (
        <p className="text-sm text-ink-2" data-testid="order-not-working">No MULE works here, so there is no power to cut.</p>
      )}
      <button type="button" onClick={() => setOpen(false)} className="min-h-8 self-start text-xs font-semibold text-holo" data-testid="order-cancel">
        Not now
      </button>
    </section>
  );
}

/** At the market: the other order, against a good's opening price at the auction. */
export function RumourOrder({ view, sab, ban = 1, onOrder, onWithdraw }: { view: MuleView; sab: Sab; ban?: number; onOrder(t: SabotageTarget): void; onWithdraw(): void }) {
  const [open, setOpen] = useState(false);
  const [good, setGood] = useState<Good | null>(null);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  if (sab.canOrder === 'off') return null;
  const here = sab.order?.kind === 'rumour';
  if (sab.order) return <PendingOrder view={view} sab={sab} here={here} onWithdraw={onWithdraw} />;
  if (!open)
    return (
      <Button size="md" variant="outline" className="w-full justify-between" onClick={() => setOpen(true)} data-testid="rumour-door">
        <span>Start a rumour</span>
        <OnlyYou />
      </Button>
    );
  const terms = view.politics!.sabotage!.terms.rumour;
  return (
    <section className="flex flex-col gap-1.5 rounded-control border border-alert p-2" data-testid="order-rumour">
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps text-[10px]!">Rumour</span>
        <OnlyYou />
      </span>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Which good" data-testid="rumour-goods">
        {GOODS.map((g) => (
          <button key={g} type="button" role="radio" aria-checked={good === g} onClick={() => setGood(g)} data-testid={`rumour-good-${g}`}
            className={cx('flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control border px-1 py-1 text-[11px] font-semibold leading-tight', good === g ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
            <GoodIcon good={g} size={14} />
            <span>{GOOD_NAME[g]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Which way" data-testid="rumour-dir">
        {(['up', 'down'] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={dir === d} onClick={() => setDir(d)} data-testid={`rumour-${d}`}
            className={cx('min-h-11 rounded-control border text-sm font-semibold', dir === d ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
            {d === 'up' ? 'Price up 25%' : 'Price down 25%'}
          </button>
        ))}
      </div>
      {good && (
        <p className="text-sm" data-testid="rumour-effect">
          {GOOD_NAME[good]} opens {dir === 'up' ? '25% higher' : '25% lower'} at this month’s auction.
        </p>
      )}
      <Terms terms={terms} caughtCost={caughtWords(view, null, ban)} />
      {blocked(sab) ? (
        <p className="text-xs text-ink-2" data-testid="rumour-blocked">{blocked(sab)}</p>
      ) : (
        <Button size="md" variant="danger" className="w-full" disabled={!good} onClick={() => good && onOrder({ kind: 'rumour', good, dir })} data-testid="rumour-confirm">
          {good ? `Order in secret · ${terms.cost} cr` : 'Pick a good'}
        </Button>
      )}
      <span className="text-[11px] text-ink-3">One order a month: a power cut or a rumour.</span>
      <button type="button" onClick={() => setOpen(false)} className="min-h-8 self-start text-xs font-semibold text-holo" data-testid="rumour-cancel">
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

/** Your own orders, newest first: how each came out, and whether anyone else knows it was you. */
export function MyOrders({ view, sab }: { view: MuleView; sab: Sab }) {
  if (sab.mine.length === 0) return null;
  const mine = [...sab.mine].sort((a, b) => b.month - a.month);
  return (
    <section className="flex flex-col gap-1.5" data-testid="my-orders">
      <span className="label-caps flex items-center gap-1.5">Your orders <OnlyYou text="" /></span>
      <ul className="flex flex-col gap-1">
        {mine.map((o) => {
          const [word, tone] = OUTCOME[o.outcome];
          return (
            <li key={o.id} className="flex items-start gap-2 rounded-control border border-holo-faint p-1.5 text-xs" data-testid={`my-order-${o.id}`}>
              <GoodIcon good={o.good} size={14} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">
                  Month {o.month}: {o.kind === 'rumour' ? `rumour, ${goodWord(o.good)} ${o.dir}` : `power cut on ${nameOf(view, o.victim)}’s plot`}
                </span>
                <span className="text-ink-3" data-testid={`my-order-known-${o.id}`}>
                  {o.public ? (o.fine ? `Everyone knows. Fined ${o.fine.due} cr.` : 'Everyone knows it was you.') : 'Nobody knows it was you.'}
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
