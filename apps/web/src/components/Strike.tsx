import { COLONY } from '@mule/engine';
import type { ColonyView, MuleView } from '@mule/protocol';
import { Button, cx, EVENT_TOWN, EventColonist, GOOD_NAME } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { fmt } from '../game/derive';
import { useClient } from '../net/react';
import { usePhoneGame } from '../phone/game';
import type { Now } from '../phone/Shell';
import type { BannerSlot, HubSeat } from '../phone/hub/slots';
import type { Size } from './Colony';

/**
 * The general strike as state (G-5 C37), read from ColonyView.strike: the TV header's badge, the strikers on the
 * planning map, the Governor's Now card and everyone else's line under Now. The strike's stories are C26's.
 */

type Strike = NonNullable<ColonyView['strike']>;

const OUTPUT = `${Math.round(COLONY.strike.output * 100)}%`;
const goodName = (strike: Strike) => GOOD_NAME[strike.good];

/** This month's strike, or null: with politics off the view has no colony, and with no strike its strike is null. */
const strikeOf = (view: Pick<MuleView, 'colony'>): Strike | null => view.colony?.strike ?? null;

/** payStrike's rule (RULE-26 row 3): the Governor pays once the votes are over, the election's and the law ballot's. */
function votesOpen(view: MuleView): boolean {
  const politics = view.politics;
  const live = (stage: string | undefined) => stage !== undefined && stage !== 'over';
  return live(politics?.election?.stage) || live(politics?.council?.stage ?? undefined);
}

/** DS-GAP (WS8): the strike badge, "STRIKE · Food 20%" while it holds, "PAID · −240 cr" once the fund paid. */
export function StrikeBadge({ strike, size = 'tv' }: { strike: ColonyView['strike'] | undefined; size?: Size }) {
  if (!strike) return null;
  const tv = size === 'tv';
  return (
    <span
      className={cx(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border-2 font-mono font-bold leading-tight',
        tv ? 'px-2 py-0.5 text-base' : 'px-1 text-[10px]',
        strike.paid ? 'border-ok bg-holo-soft text-ok' : 'border-alert bg-alert-bg text-alert-ink shadow-glow-alert',
      )}
      data-testid="strike-badge"
      data-paid={strike.paid}
    >
      {strike.paid ? `PAID · −${fmt(strike.cost)} cr` : `STRIKE · ${goodName(strike)} ${OUTPUT}`}
    </span>
  );
}

/** DS-GAP (WS8): a striker's placard, a sign on a pole, in the alert's colours so it reads without colour too. */
function Placard() {
  return (
    <svg viewBox="0 0 20 24" className="h-auto w-full overflow-visible" aria-hidden>
      <path d="M10 10v14" stroke="var(--color-ink-2)" strokeWidth={1.6} />
      <rect x={1} y={1} width={18} height={10} rx={1.5} fill="var(--color-alert)" stroke="var(--color-void)" strokeWidth={1} />
      <path d="M4 4h12M4 8h8" stroke="white" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

const STRIKERS = ['bramblet', 'gearling', 'mollox', 'zipwing', 'quibbit', 'glimmer'] as const;

/**
 * A map with the planning strikers over it: one on every plot of the struck good while the strike holds, gone once
 * paid. DS-GAP: HoloMap has no layer slot, so they ride a box over the map's own; the TV's plots also get their chip.
 */
export function StrikeMap({ view, size, children }: { view: MuleView; size: Size; children: ReactNode }) {
  const strike = strikeOf(view);
  const on = view.phase === 'planning' && strike !== null && !strike.paid;
  if (!on) return children;
  const plots = view.tiles.filter((t) => t.outfit === strike.good);
  /** Centred on a point in tiles, `w` tiles wide, as the event show's At places its things. */
  const at = (x: number, y: number, w: number) => ({ left: `${(x / view.width) * 100}%`, top: `${(y / view.height) * 100}%`, width: `${(w / view.width) * 100}%`, transform: 'translate(-50%, -50%)' });
  return (
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel [container-type:inline-size]" data-testid="strikers">
        {plots.map((t, i) => (
          <div key={`${t.x},${t.y}`}>
            <div className="absolute z-[6]" style={at(t.x + 0.74, t.y + 0.62, 0.5)} data-testid={`striker-${t.x}-${t.y}`}>
              <EventColonist sp={STRIKERS[i % STRIKERS.length]!} color={EVENT_TOWN[i % EVENT_TOWN.length]!} prop={<Placard />} />
            </div>
            {size === 'tv' && (
              <div className="absolute z-[6] flex justify-center" style={at(t.x + 0.3, t.y + 0.2, 1)}>
                {/* Two lines, so neighbouring plots' chips never overlap; sized in the map's width, as the show's words are. */}
                <span className="flex flex-col items-center whitespace-nowrap rounded-chip bg-alert px-1 py-px font-mono font-bold leading-none text-white shadow-chip" style={{ fontSize: `${13 / 8.2}cqw` }} data-testid={`strike-chip-${t.x}-${t.y}`}>
                  <span>STRIKE</span>
                  <span>· {OUTPUT}</span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Fund({ fund, cost, paid }: { fund: number; cost: number; paid: boolean }) {
  return (
    <span data-num className="font-mono text-xs font-bold text-ink" data-testid="fund-line">
      {paid ? `Fund ${fmt(fund)} cr` : `Fund ${fmt(fund)} → ${fmt(fund - cost)} cr`}
    </span>
  );
}

/**
 * The Governor's Now card, option A (DS-GAP: Now has no buttons today): the strike, what it costs unpaid, the fund
 * before and after, Pay and Let them strike. Let them strike sends nothing: there is no intent, and they can still pay
 * until planning ends. A refusal comes back as the app's toast, in the engine's words.
 */
function StrikeCard() {
  const { view } = usePhoneGame();
  const client = useClient();
  const [let_, setLet] = useState(false);
  const strike = strikeOf(view)!;
  const fund = view.colony!.fund;
  const pay = () => client.intent({ type: 'payStrike' });
  const name = goodName(strike);
  if (strike.paid)
    return (
      <section className="flex flex-col gap-1 rounded-panel border-2 border-ok bg-holo-soft p-2.5" data-testid="strike-paid">
        <span className="label-caps text-[10px]! text-ok!">Governor · done</span>
        <h2 className="font-display text-base font-semibold leading-tight">You paid the strikers · −{fmt(strike.cost)} cr</h2>
        <span className="text-xs leading-snug text-ink-2">The strike is off: every {name} plot makes what it makes.</span>
        <Fund fund={fund} cost={strike.cost} paid />
      </section>
    );
  if (let_)
    return (
      <section className="flex flex-col gap-1 rounded-panel border-2 border-alert bg-alert-bg p-2.5" data-testid="strike-let">
        <span className="label-caps text-[10px]! text-alert-ink!">Governor</span>
        <h2 className="font-display text-base font-semibold leading-tight">You let them strike</h2>
        <span className="text-xs leading-snug text-ink-2">
          Every {name} plot makes {OUTPUT} this month. You can still pay until planning ends.
        </span>
        <Button variant="outline" size="md" onClick={pay} data-testid="pay-after-all">
          Pay the strikers {fmt(strike.cost)} cr
        </Button>
      </section>
    );
  const open = !votesOpen(view);
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
      <h2 className="font-display text-base font-semibold leading-tight">General strike on {name}</h2>
      <span className="text-xs leading-snug text-ink-2" data-testid="unpaid-cost">
        Unpaid: {name} plots make {OUTPUT} this month.
      </span>
      <Fund fund={fund} cost={strike.cost} paid={false} />
      <Button size="md" disabled={!open} onClick={pay} data-testid="pay-strike">
        Pay the strikers {fmt(strike.cost)} cr
      </Button>
      <Button variant="outline" size="md" disabled={!open} onClick={() => setLet(true)} data-testid="let-strike">
        Let them strike
      </Button>
    </section>
  );
}

const electionDay = (view: MuleView) => {
  const stage = view.politics?.election?.stage;
  return stage !== undefined && stage !== 'over';
};

/** The Governor's Now while this month's strike stands, paid or not; election day keeps its own steps. */
export function strikeNow({ view, self }: HubSeat): Now | null {
  const strike = strikeOf(view);
  if (!strike || view.politics?.governor !== self.id || electionDay(view)) return null;
  return { title: `General strike on ${goodName(strike)}`, Card: StrikeCard };
}

/** DS-GAP (WS8): everyone else's alert line under Now, the needs strip's alert row on its own. */
function StrikeAlert() {
  const { view } = usePhoneGame();
  const strike = strikeOf(view)!;
  const governor = view.players.find((p) => p.id === view.politics?.governor)?.name;
  const name = goodName(strike);
  const line = strike.paid
    ? `${governor} pays the ${name} strikers ${fmt(strike.cost)} cr: the strike is off.`
    : governor
      ? `General strike on ${name}: ${governor} decides whether the fund pays ${fmt(strike.cost)} cr`
      : `General strike on ${name}: ${name} plots make ${OUTPUT} this month.`;
  return (
    <span className={cx('rounded-control border px-2 py-1 text-xs leading-snug text-ink', strike.paid ? 'border-ok bg-holo-soft' : 'border-alert bg-alert-bg')} data-testid="strike-alert">
      {line}
    </span>
  );
}

export const STRIKE_ALERT: BannerSlot = {
  id: 'strike-alert',
  Body: StrikeAlert,
  show: ({ view, self }) => strikeOf(view) !== null && view.politics?.governor !== self.id,
};
