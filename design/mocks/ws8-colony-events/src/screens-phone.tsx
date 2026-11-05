import { Button, cx, EventLivingMap, EventShow, EventSkipHint, EventSoloRail, eventSegments, HoloMap } from '@mule/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { fmt } from '../../../../apps/web/src/game/derive';
import { NowCard } from '../../../../apps/web/src/phone/Shell';
import { bandOf, FESTIVAL, forShow, GOVERNOR, H, INTRO_MS, LENA, nameOf, PLAYERS, SLOTS, STRIKE, TILES, W } from './fixture';
import { PhoneFrame, StrikeBadge } from './frames';
import { NewStories } from './stories';
import { useScreen } from './screens-tv';

/**
 * The phones in planning. The Governor's card is WS7's to wire (a C35-style desk action sending { type: 'payStrike' },
 * planning, after the votes, Governor only); WS8 draws where it sits. The hub around it is PhoneShell's frame with the
 * map as the stage; its desks and roadmap are as today and left out.
 */

const AFTER = STRIKE.fund - STRIKE.cost;
/** When the mock's votes close: before it, payStrike's rule keeps both choices shut. */
export const VOTES_END = 3;

type Choice = null | 'paid' | 'strike';

function HubStage({ slot, strikePaid }: { slot: number; strikePaid: boolean }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2" data-testid="hub-map">
      <span className="flex items-center gap-2">
        <span className="label-caps text-[10px]!">This month</span>
        <StrikeBadge strike={{ good: STRIKE.good, cost: STRIKE.cost, paid: strikePaid }} size="phone" />
      </span>
      <HoloMap width={W} height={H} tiles={TILES} density="phone" hideGround focusSlot={slot as 0} className="w-full" />
    </div>
  );
}

function Fund({ paid }: { paid: boolean }) {
  return (
    <span data-num className="font-mono text-xs font-bold text-ink" data-testid="fund-line">
      {paid ? `Fund ${fmt(AFTER)} cr` : `Fund ${fmt(STRIKE.fund)} → ${fmt(AFTER)} cr`}
    </span>
  );
}

/** The card's state after a choice: what the Governor did, in the card's place. "Let them strike" is no intent: they can still pay until planning ends. */
function Chosen({ choice, onPay }: { choice: Exclude<Choice, null>; onPay: () => void }) {
  return choice === 'paid' ? (
    <section className="flex flex-col gap-1 rounded-panel border-2 border-ok bg-holo-soft p-2.5" data-testid="strike-paid">
      <span className="label-caps text-[10px]! text-ok!">Governor · done</span>
      <h2 className="font-display text-base font-semibold leading-tight">You paid the strikers · −{STRIKE.cost} cr</h2>
      <span className="text-xs leading-snug text-ink-2">The strike is off: every Food plot makes what it makes.</span>
      <Fund paid />
    </section>
  ) : (
    <section className="flex flex-col gap-1 rounded-panel border-2 border-alert bg-alert-bg p-2.5" data-testid="strike-let">
      <span className="label-caps text-[10px]! text-alert-ink!">Governor</span>
      <h2 className="font-display text-base font-semibold leading-tight">You let them strike</h2>
      <span className="text-xs leading-snug text-ink-2">Every Food plot makes 20% this month. You can still pay until planning ends.</span>
      <Button variant="outline" size="md" onClick={onPay} data-testid="pay-after-all">
        Pay the strikers {STRIKE.cost} cr
      </Button>
    </section>
  );
}

/**
 * Variant A: the decision is the hub's Now card (DS-GAP: Now has no buttons today; this is NowCard's frame in alert,
 * with the two choices in it). It shows the fund before and after and what an unpaid strike costs.
 */
function StrikeNow({ open, onPay, onLet }: { open: boolean; onPay: () => void; onLet: () => void }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-panel border-2 border-alert bg-alert-bg p-2.5" data-testid="strike-now" aria-live="polite">
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps text-[10px]! text-alert-ink!">Now · Governor</span>
        {!open && (
          <span className="rounded-chip border border-holo-line px-1 font-mono text-[10px] font-bold text-ink-2" data-testid="after-votes">
            After the votes
          </span>
        )}
      </span>
      <h2 className="font-display text-base font-semibold leading-tight">General strike on Food</h2>
      <span className="text-xs leading-snug text-ink-2" data-testid="unpaid-cost">
        Unpaid: Food plots make 20% this month.
      </span>
      <Fund paid={false} />
      <Button size="md" disabled={!open} onClick={onPay} data-testid="pay-strike">
        Pay the strikers {STRIKE.cost} cr
      </Button>
      <Button variant="outline" size="md" disabled={!open} onClick={onLet} data-testid="let-strike">
        Let them strike
      </Button>
    </section>
  );
}

/** Variant B: the same as a sheet over the hub, each choice a big tile with what follows from it. */
function StrikeSheet({ open, onPay, onLet, onClose }: { open: boolean; onPay: () => void; onLet: () => void; onClose: () => void }) {
  const tile = 'flex min-h-[132px] flex-col items-start gap-1 rounded-panel border-2 p-3 text-left transition-[box-shadow] disabled:opacity-40';
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-4" role="dialog" aria-modal aria-label="The general strike" data-testid="strike-sheet">
      <div className="flex w-[640px] flex-col gap-3 rounded-sheet border-2 border-alert bg-panel p-4 shadow-glow-alert">
        <span className="flex items-start justify-between gap-3">
          <span className="flex flex-col">
            <span className="label-caps text-[10px]! text-alert-ink!">Governor · general strike</span>
            <span className="font-display text-xl font-semibold leading-tight">The Food strikers want {STRIKE.cost} cr from the colony fund</span>
          </span>
          {!open ? (
            <span className="shrink-0 rounded-chip border border-holo-line px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-2" data-testid="after-votes">
              After the votes
            </span>
          ) : (
            <Button variant="ghost" size="md" onClick={onClose} data-testid="sheet-close">
              Later
            </Button>
          )}
        </span>
        <span className="grid grid-cols-2 gap-3">
          <button type="button" disabled={!open} onClick={onPay} className={cx(tile, 'border-holo bg-holo-soft enabled:hover:shadow-glow')} data-testid="tile-pay">
            <span className="font-display text-lg font-semibold">Pay the strikers</span>
            <span data-num className="font-mono text-2xl font-bold text-holo">−{STRIKE.cost} cr</span>
            <span className="text-xs text-ink-2">from the colony fund</span>
            <span data-num className="mt-auto font-mono text-xs font-bold">
              Fund {fmt(STRIKE.fund)} → {fmt(AFTER)} cr
            </span>
          </button>
          <button type="button" disabled={!open} onClick={onLet} className={cx(tile, 'border-alert bg-alert-bg enabled:hover:shadow-glow-alert')} data-testid="tile-let">
            <span className="font-display text-lg font-semibold">Let them strike</span>
            <span data-num className="font-mono text-2xl font-bold text-alert-ink">20%</span>
            <span className="text-xs text-ink-2">Food plots make 20% this month</span>
            <span data-num className="mt-auto font-mono text-xs font-bold">
              Fund stays {fmt(STRIKE.fund)} cr
            </span>
          </button>
        </span>
      </div>
    </div>
  );
}

/** The Governor's phone in planning, either variant; `votesOver` opens the two choices. */
export function GovernorPhone({ variant, votesOver }: { variant: 'A' | 'B'; votesOver: boolean }) {
  const [choice, setChoice] = useState<Choice>(null);
  const [sheet, setSheet] = useState(true);
  const pay = () => {
    setChoice('paid');
    setSheet(false);
  };
  const strike = () => {
    setChoice('strike');
    setSheet(false);
  };
  const now: ReactNode =
    choice !== null ? (
      <Chosen choice={choice} onPay={pay} />
    ) : variant === 'A' ? (
      <StrikeNow open={votesOver} onPay={pay} onLet={strike} />
    ) : (
      <div className="flex flex-col gap-1.5">
        <NowCard now={{ title: 'Decide on the strike', detail: `General strike on Food: the fund can pay the strikers ${STRIKE.cost} cr.`, warn: true }} />
        <Button variant="outline" size="md" onClick={() => setSheet(true)} data-testid="open-sheet">
          Open the decision
        </Button>
      </div>
    );
  return (
    <PhoneFrame
      testid={`governor-phone-${variant}`}
      phase="Planning"
      name={nameOf(GOVERNOR)}
      slot={SLOTS[GOVERNOR]!}
      money={412}
      seconds={votesOver ? 38 : 52}
      now={now}
      footer={<Button size="md" variant="outline" data-testid="ready">I’m ready</Button>}
      over={variant === 'B' && choice === null && sheet ? <StrikeSheet open={votesOver} onPay={pay} onLet={strike} onClose={() => setSheet(false)} /> : undefined}
    >
      <HubStage slot={SLOTS[GOVERNOR]!} strikePaid={choice === 'paid'} />
    </PhoneFrame>
  );
}

/** Everyone else's phone: an alert line under Now, read from ColonyView.strike. */
export function OtherPhone({ paid }: { paid: boolean }) {
  return (
    <PhoneFrame
      testid={paid ? 'other-phone-paid' : 'other-phone'}
      phase="Planning"
      name={nameOf(LENA)}
      slot={SLOTS[LENA]!}
      money={638}
      seconds={44}
      now={
        <div className="flex flex-col gap-1.5">
          <NowCard now={{ title: 'Outfit your plots', detail: 'Buy a MULE at the store and put it on your plot, then Ready.' }} />
          {/* DS-GAP: an alert line under Now (the needs strip's alert row, on its own). */}
          <span className={cx('rounded-control border px-2 py-1 text-xs leading-snug', paid ? 'border-ok bg-holo-soft text-ink' : 'border-alert bg-alert-bg text-ink')} data-testid="strike-alert">
            {paid ? `${nameOf(GOVERNOR)} pays the Food strikers ${STRIKE.cost} cr: the strike is off.` : `General strike on Food: ${nameOf(GOVERNOR)} decides whether the fund pays ${STRIKE.cost} cr`}
          </span>
        </div>
      }
      footer={<Button size="md" variant="outline">I’m ready</Button>}
    >
      <HubStage slot={SLOTS[LENA]!} strikePaid={paid} />
    </PhoneFrame>
  );
}

/** A planning page with the votes on the clock: they close at VOTES_END, and the Governor's choices open. */
export function GovernorPhonePage({ variant }: { variant: 'A' | 'B' }) {
  const { clock, controls } = useScreen(8);
  const over = clock.t >= VOTES_END;
  return (
    <>
      {controls([{ at: VOTES_END, label: 'votes close' }])}
      {/* A new key when the votes close, so a restart shows the shut state again. */}
      <GovernorPhone key={over ? 'open' : 'shut'} variant={variant} votesOver={over} />
    </>
  );
}

export function OtherPhonePage() {
  const { clock, controls } = useScreen(8);
  return (
    <>
      {controls([{ at: 5, label: 'Kai pays' }])}
      <OtherPhone paid={clock.t >= 5} />
    </>
  );
}

// --- 5 · Festival on a phone alone ----------------------------------------------------------------------------------

/**
 * A phone with no TV in the room plays the show itself (EventSoloRail, the solo pace). The Colony desk's gauges are not
 * on screen while a show plays, so the rail's result line names the mood instead.
 */
export function PhoneFestivalAlone() {
  const ev = useMemo(() => [forShow(FESTIVAL)], []);
  const seg = eventSegments({ events: ev, introMs: INTRO_MS }, 0, 'solo')[0]!;
  const end = seg.endAt + 1.5;
  const { clock, reduced, controls } = useScreen(end);
  const t = clock.t;
  const to = 74;
  return (
    <>
      {controls([
        { at: seg.announceAt, label: 'announced' },
        { at: seg.settleAt, label: 'result' },
      ])}
      <EventShow events={ev} introMs={INTRO_MS} t={t} mode="solo" reduced={reduced} width={W} height={H} tiles={TILES} players={PLAYERS}>
        <PhoneFrame
          testid="phone-festival-alone"
          reduced={reduced}
          phase="Planning"
          name={nameOf(LENA)}
          slot={SLOTS[LENA]!}
          money={638}
          rail={
            <>
              <EventSoloRail me={LENA} />
              {t >= seg.settleAt && (
                <span className="rounded-control border border-ok bg-holo-soft px-2 py-1 text-xs font-semibold leading-snug animate-[ev-drop_0.3s_ease-out]" data-testid="mood-result">
                  The colony’s mood: {to}, {bandOf(to) === 'thriving' ? 'Thriving' : 'Content'} · Prestige 7
                </span>
              )}
            </>
          }
        >
          <div className="relative flex min-h-0 flex-1 flex-col justify-center">
            <EventLivingMap size="phone" focusSlot={SLOTS[LENA]!} onSkip={clock.seek} over={<NewStories size="phone" />} />
            <EventSkipHint className="absolute bottom-1 right-1" />
          </div>
        </PhoneFrame>
      </EventShow>
    </>
  );
}
