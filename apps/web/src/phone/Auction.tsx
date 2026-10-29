import type { AuctionView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, TimeBar, WalkBoard } from '@mule/ui';
import { useState } from 'react';
import { BoardKey, boardWalkers, dealLine, Hint, MyStoreLine, shipWants, ShipWants, SIDE_WORD, skippedLine, StatusTable, toggleSide, walkHint } from '../components/AuctionParts';
import { speakerAt } from '../chat/Chat';
import { PHASE_NAME } from '../game/derive';
import { useAuctionSound } from '../game/sound';
import type { MouseEvent, PointerEvent } from 'react';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { connectedIn, pickedIn, SIDE_PICK_WORDS, stillPicking, type Seat } from './hub/ready';
import { ReadyCount, WaitingFor } from './hub/ReadyBar';
import { PhoneShell } from './Shell';
import { stepDir, useWalkIntent } from './useWalkIntent';

type Side = AuctionView['walkers'][number]['side'];
const SIDE_NAME: Record<Side, string> = { buyer: 'Buyer', seller: 'Seller', pass: 'Pass' };

/**
 * The goods auction, the original's walk: goods come up one at a time. A
 * status screen shows what everyone has, beside your side, already picked
 * from what you have and need: tap Buy or Sell to change it, then Ready. It
 * has no clock (A-7): the walk starts once everyone has picked, or when the
 * host moves on for whoever is still picking. Then you hold
 * Up or Down (or drag on the board) to walk your creature. Your height is
 * your bid or your ask; meet someone and units change hands.
 */
export function Auction() {
  const client = useClient();
  const { table, view, me, self } = usePhoneGame();
  const [asking, setAsking] = useState(false);
  const auction = view.auction;
  useAuctionSound(auction);
  const stage = auction?.stage;
  const mine = auction?.walkers.find((w) => w.id === me.id);
  const onBoard = stage === 'walk' && mine !== undefined && mine.side !== 'pass';
  const walk = useWalkIntent(onBoard, auction?.good ?? '');

  if (!auction) {
    return (
      <PhoneShell phase={PHASE_NAME.auction}>
        <p className="text-ink-2">The auction is closing…</p>
      </PhoneShell>
    );
  }

  const good = auction.good;
  const row = auction.status.find((r) => r.id === me.id);
  const have = me.stock[good];
  const need = row?.need ?? 0;
  const spare = have - need;
  const done = mine?.done ?? false;
  const myDeal = auction.deals.find((d) => d.buyer === me.id || d.seller === me.id);
  const skipped = skippedLine(auction);
  const walkers = boardWalkers(view, auction);
  const declare = (side: Side) => client.intent({ type: 'declare', side });

  const doneButton = (
    <Button size="md" variant={done ? 'outline' : 'holo'} className="h-10 w-full" disabled={done} data-testid="done" onClick={() => client.intent({ type: 'ready' })}>
      {done ? 'Done · waiting' : stage === 'status' ? 'Ready' : `Done with ${GOOD_NAME[good]}`}
    </Button>
  );

  if (stage === 'status') {
    const side = mine?.side;
    const ship = shipWants(view, auction);
    // A table the room has not listed yet counts every seat as connected.
    const connected = connectedIn(table.seats ?? []);
    const waiting = stillPicking(view, connected);
    const others = waiting.filter((s) => s.id !== me.id);
    const isHost = table.hostId === me.id;
    const picked = view.players.map((p) => ({ ...p, ready: pickedIn(view, p.id) }));
    return (
      <PhoneShell
        phase={`${GOOD_NAME[good]} · buy or sell?`}
        rail={
          <>
            <div className="flex items-center justify-between rounded-control border border-holo-faint bg-panel px-2.5 py-1.5">
              <GoodTag good={good} name />
              <span data-num className={cx('font-mono text-sm font-bold', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
                {spare < 0 ? `${-spare} SHORT` : spare > 0 ? `+${spare} SPARE` : 'EVEN'}
              </span>
            </div>
            <p className="text-xs leading-snug text-ink-2" data-testid="status-words">
              {spare < 0 ? `You need ${-spare} more ${GOOD_NAME[good]} this month.` : spare > 0 ? `You have ${spare} more than you need.` : 'You have just what you need.'} Pick your side; you can change it until everyone has.
            </p>
          </>
        }
        footer={
          <>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Your side" data-testid="declare">
              <div className="grid grid-cols-2 gap-2">
                {(['buyer', 'seller'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={side === s}
                    disabled={s === 'seller' && have === 0}
                    onClick={() => declare(toggleSide(side, s))}
                    data-testid={`side-${s}`}
                    className={cx(
                      'h-14 rounded-control border-2 font-display text-lg font-semibold disabled:opacity-35',
                      side === s ? (s === 'seller' ? 'border-rise bg-rise text-on-holo' : 'border-fall bg-fall text-on-holo') : s === 'seller' ? 'border-rise/60 text-rise' : 'border-fall/60 text-fall',
                    )}
                  >
                    {SIDE_WORD[s]}
                  </button>
                ))}
              </div>
              <span className="text-center font-mono text-[10px] text-ink-3" data-testid="side-now">
                {side === 'buyer' || side === 'seller' ? `✓ YOU ${side === 'buyer' ? 'BUY' : 'SELL'} · TAP AGAIN TO PASS` : '✓ YOU SIT THIS GOOD OUT'}
              </span>
            </div>
            {/* Ready is the pick; once pressed it gives way to who is still picking, and the host's way on (G-7). */}
            {!done ? (
              doneButton
            ) : (
              <div className="flex flex-col gap-1.5" data-testid="pick-wait">
                {others.length > 0 ? <WaitingToPick seats={others} /> : <span className="text-sm font-semibold text-holo @min-[1100px]/shell:text-lg">{SIDE_PICK_WORDS.all}</span>}
                {isHost && others.length > 0 && (
                  <Button size="md" variant="outline" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={() => setAsking(true)} data-testid="move-on">
                    {SIDE_PICK_WORDS.moveOn(others)}
                  </Button>
                )}
              </div>
            )}
          </>
        }
      >
        {/* Where the time bar was: no clock (G-7), the count of who has picked. */}
        <div className="mb-1.5 flex items-center gap-2 @min-[1100px]/shell:gap-4" data-testid="pick-bar">
          <ReadyCount players={picked} label="PICKED" />
          <span className="text-xs leading-snug text-ink-2 @min-[1100px]/shell:text-lg">
            <strong className="font-semibold text-ink">No clock:</strong> {SIDE_PICK_WORDS.noClock}
          </span>
        </div>
        {skipped && (
          <p className="mb-1.5 shrink-0 truncate font-mono text-[11px] text-ink-3" data-testid="skipped">
            {skipped}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <div className="rounded-panel border border-holo-line bg-panel px-2 py-1.5">
            <StatusTable view={view} auction={auction} meId={self.id} />
          </div>
          <MyStoreLine auction={auction} />
          {ship && <ShipWants want={ship.first} also={ship.also} have={me.stock[ship.first.good]} />}
        </div>
        {asking && isHost && others.length > 0 && (
          <MoveOn
            auction={auction}
            seats={others}
            onNow={() => {
              setAsking(false);
              client.intent({ type: 'continue' });
            }}
            onKeep={() => setAsking(false)}
          />
        )}
      </PhoneShell>
    );
  }

  const sides = (
    <div className={cx('grid grid-cols-3 gap-1 rounded-control border border-holo-line bg-void p-1')} role="radiogroup" aria-label="Your side">
      {(['buyer', 'seller', 'pass'] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={mine?.side === s}
          disabled={s === 'seller' && have === 0}
          onClick={() => declare(s)}
          className={cx(
            'h-8 rounded-[8px] font-display text-xs font-semibold disabled:opacity-35',
            mine?.side === s ? (s === 'seller' ? 'bg-rise text-on-holo' : s === 'buyer' ? 'bg-fall text-on-holo' : 'bg-raised text-ink') : 'text-ink-2',
          )}
        >
          {SIDE_NAME[s]}
        </button>
      ))}
    </div>
  );

  const hint = walkHint(view, auction, me.id, have);
  const rail = (
    <>
      <div className="flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="good-row">
        <GoodTag good={good} name />
        <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3">
          <span className="flex flex-col">
            HAVE
            <strong data-num className="text-sm text-ink" data-testid="have">
              {have}
            </strong>
          </span>
          <span className="flex flex-col">
            NEED<strong data-num className="text-sm text-ink">{need}</strong>
          </span>
          <span className="flex flex-col">
            {spare < 0 ? 'SHORT' : 'SPARE'}
            <strong data-num className={cx('text-sm', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
              {spare > 0 ? '+' : ''}
              {spare}
            </strong>
          </span>
        </div>
      </div>
      {myDeal ? <Hint tone="lit" line={dealLine(view, myDeal, me.id)} testid="my-deal" /> : <Hint line={hint.line} how={hint.how} />}
      {sides}
    </>
  );

  const footer = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <WalkHold dir="up" disabled={!onBoard} onHold={(on) => walk(on ? 'up' : 'stop')} />
        <WalkHold dir="down" disabled={!onBoard} onHold={(on) => walk(on ? 'down' : 'stop')} />
      </div>
      {doneButton}
    </>
  );

  return (
    <PhoneShell phase={`${GOOD_NAME[good]} auction`} fill rail={rail} footer={footer}>
      <TimeBar seconds={auction.seconds} total={auction.total} slowed={auction.slowed} className="mb-1.5" />
      {skipped && (
        <p className="mb-1.5 shrink-0 truncate font-mono text-[11px] text-ink-3" data-testid="skipped">
          {skipped}
        </p>
      )}
      {mine && mine.side !== 'pass' && <BoardKey auction={auction} side={mine.side} />}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {auction.deals.some((d) => d !== myDeal) && (
          <div className="flex shrink-0 gap-2 overflow-hidden" data-testid="deals">
            {auction.deals.filter((d) => d !== myDeal).map((d) => (
              <span key={`${d.buyer}-${d.seller}`} className="truncate rounded-chip border border-holo bg-holo-soft px-2 py-0.5 font-mono text-[11px] font-bold text-holo">
                {dealLine(view, d, me.id)}
              </span>
            ))}
          </div>
        )}
        <WalkBoard
          lo={auction.lo}
          hi={auction.hi}
          walkers={walkers}
          deals={auction.deals}
          storeBuys={auction.storeBuys}
          storeSells={auction.storeSells}
          shipPays={auction.shipPays}
          {...(auction.shipPays !== null ? { shipCaption: `The ship buys ${GOOD_NAME[good]} at ${auction.shipPays}` } : {})}
          storeStock={auction.storeForSale}
          marks={{ ask: true, bid: true }}
          meId={me.id}
          wrapCreature={speakerAt}
          {...(onBoard ? { onDir: (d: -1 | 0 | 1) => walk(stepDir(d)) } : {})}
          className="min-h-0 flex-1"
        />
      </div>
    </PhoneShell>
  );
}

/** "Waiting for Kai to pick": planning's names line, each with its creature and an AWAY mark for a dropped phone. */
export function WaitingToPick({ seats, tv = false }: { seats: readonly Seat[]; tv?: boolean }) {
  return (
    <span className={cx('flex flex-wrap items-center gap-x-1.5 gap-y-1', tv ? 'text-3xl' : 'text-sm @min-[1100px]/shell:text-lg')} data-testid="waiting-to-pick" aria-label={`Waiting for ${seats.map((s) => s.name).join(' and ')} to pick`}>
      <WaitingFor seats={seats} me={null} tv={tv} />
      <span className="text-ink-2">to pick</span>
    </span>
  );
}

/**
 * The side a seat starts the walk on if the host moves on now, in words: "Kai buys Food: 1 of 3, short 2." A dropped
 * phone sits the walk out, so it says so. `given` is whether it is the side the numbers give (the engine's defaultSide).
 */
export function sideWords(auction: AuctionView, seat: Seat, good: AuctionView['good']): { line: string; given: boolean } {
  const g = GOOD_NAME[good];
  const row = auction.status.find((r) => r.id === seat.id);
  const now = row?.now ?? 0;
  const need = row?.need ?? 0;
  const side = auction.walkers.find((w) => w.id === seat.id)?.side ?? 'pass';
  const given = side === (now > need ? 'seller' : now < need ? 'buyer' : 'pass');
  if (seat.away) return { line: `${seat.name} is away and sits ${g} out.`, given: false };
  if (side === 'buyer') return { line: now < need ? `${seat.name} buys ${g}: ${now} of ${need}, short ${need - now}.` : `${seat.name} buys ${g}.`, given };
  if (side === 'seller') return { line: now > need ? `${seat.name} sells ${g}: ${now - need} spare.` : `${seat.name} sells ${g}.`, given };
  return { line: now === need ? `${seat.name} sits ${g} out: ${now} of ${need}, just enough.` : `${seat.name} sits ${g} out.`, given };
}

/** The host's one confirming tap before moving on for the seats still picking. */
function MoveOn({ auction, seats, onNow, onKeep }: { auction: AuctionView; seats: readonly Seat[]; onNow: () => void; onKeep: () => void }) {
  const words = seats.map((s) => sideWords(auction, s, auction.good));
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="move-on-title" data-testid="move-on-dialog">
      <div className="flex w-full max-w-[420px] flex-col gap-2 rounded-sheet border-2 border-warn bg-panel p-3 shadow-glow @min-[1100px]/shell:max-w-[560px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6">
        <h2 id="move-on-title" className="font-display text-lg font-semibold @min-[1100px]/shell:text-3xl">
          {SIDE_PICK_WORDS.title(seats)}
        </h2>
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg" data-testid="move-on-words">
          {words.map((w) => w.line).join(' ')} {SIDE_PICK_WORDS.tail(words.every((w) => w.given))}
        </p>
        <div className="flex gap-2">
          <Button size="md" className="flex-1" onClick={onNow} data-testid="move-on-now">
            {SIDE_PICK_WORDS.now}
          </Button>
          <Button size="md" variant="ghost" className="flex-1" onClick={onKeep} data-testid="keep-waiting">
            {SIDE_PICK_WORDS.keep}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A big button you hold: walking while pressed, standing when let go. */
export function Hold({ label, glyph, disabled, onHold }: { label: string; glyph: string; disabled: boolean; onHold: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={`Hold to walk ${label.toLowerCase()}`}
      disabled={disabled}
      data-testid={`hold-${label.toLowerCase()}`}
      className="flex h-16 touch-none select-none flex-col items-center justify-center rounded-control border-2 border-holo bg-holo-soft font-display text-sm font-semibold text-holo active:bg-holo active:text-on-holo disabled:opacity-35"
      {...holdHandlers(onHold)}
    >
      <span aria-hidden className="text-2xl leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}

/** The goods walk's Hold: it says so on the button, "Hold ▲ to walk up". */
function WalkHold({ dir, disabled, onHold }: { dir: 'up' | 'down'; disabled: boolean; onHold: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={`Hold to walk ${dir}`}
      disabled={disabled}
      data-testid={`hold-${dir}`}
      className="flex h-12 touch-none select-none flex-col items-center justify-center gap-1 rounded-control border-2 border-holo bg-holo-soft font-display text-holo active:bg-holo active:text-on-holo disabled:opacity-35 @min-[1100px]/shell:h-20"
      {...holdHandlers(onHold)}
    >
      <span className="flex items-center gap-1 text-sm font-semibold leading-none @min-[1100px]/shell:text-xl">
        Hold{' '}
        <span aria-hidden className="text-lg leading-none @min-[1100px]/shell:text-2xl">
          {dir === 'up' ? '▲' : '▼'}
        </span>
      </span>
      <span className="text-[11px] font-medium leading-none @min-[1100px]/shell:text-base">to walk {dir}</span>
    </button>
  );
}

/** Walking while pressed, standing when let go, however the press ends. */
function holdHandlers(onHold: (on: boolean) => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic press has no pointer to capture.
      }
      onHold(true);
    },
    onPointerUp: () => onHold(false),
    onPointerCancel: () => onHold(false),
    onLostPointerCapture: () => onHold(false),
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}
