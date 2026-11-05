import { GOODS, PRESTIGE, type Good } from '@mule/engine';
import type { ColonyCatalogueView, ColonyProjectView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodIcon, ObjectGlyph } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmt } from '../game/derive';
import { useClient } from '../net/react';
import { usePhoneGame } from '../phone/game';

/*
 * C35, the Colony desk's buttons, grafted from the approved mock (design/mocks/ws8-desks, src/colony-desk.tsx):
 * each project's buttons for ColonyDeskCard's `action` slot, and the Governor's "Commission a project". Every
 * button sends one intent; the server decides, and a refusal arrives as the app's toast in the engine's words.
 */

// --- Small parts: one chip, one stepper ---------------------------------------------------------------

/** A chip that picks. DS-GAP: @mule/ui has no chip or segmented control; this is the hub's tab/tool look as a chip. */
function Chip({ on, disabled, onClick, children, testid }: { on?: boolean; disabled?: boolean; onClick(): void; children: ReactNode; testid: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-chip border px-2 font-mono text-[11px] font-bold disabled:pointer-events-none disabled:opacity-40',
        on ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:border-holo',
      )}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

/** − value + as the Governor's tax row draws it, in `step`s, between 0 and `max`. */
function Stepper({ value, max, step, onChange, label, unit, testid }: { value: number; max: number; step: number; onChange(n: number): void; label: ReactNode; unit: string; testid: string }) {
  return (
    <span className="flex items-center gap-1" data-testid={testid}>
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{label}</span>
      <Button size="md" variant="outline" className="h-8! w-8 shrink-0 px-0" aria-label="Less" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - step))} data-testid={`${testid}-down`}>
        −
      </Button>
      <span data-num className="w-16 shrink-0 text-center font-mono text-sm font-bold" data-testid={`${testid}-value`}>
        {fmt(value)}
        {unit && ` ${unit}`}
      </span>
      <Button size="md" variant="outline" className="h-8! w-8 shrink-0 px-0" aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} data-testid={`${testid}-up`}>
        +
      </Button>
    </span>
  );
}

/** A sheet under a project row: raised, so it reads as the row's own. */
function Sheet({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5 rounded-control border border-holo-line bg-raised p-2" data-testid={testid}>
      {children}
    </div>
  );
}

const Line = ({ children, tone = 'text-ink-2', testid }: { children: ReactNode; tone?: string; testid: string }) => (
  <span className={cx('text-[11px] leading-snug', tone)} data-testid={testid}>
    {children}
  </span>
);

// --- Each project's buttons, by its stage --------------------------------------------------------------

/** What goes in ColonyDeskCard's `action` slot under a project's row. */
export function ProjectActions({ p }: { p: ColonyProjectView }) {
  const { view, self } = usePhoneGame();
  const gov = view.politics?.governor === self.id;
  const plotless = PRESTIGE[p.id].needsPlot && p.plot === null;
  switch (p.stage) {
    case 'commissioned':
      return (
        <div className="flex flex-col gap-1 pb-1.5" data-testid={`actions-${p.id}`}>
          <Donate p={p} />
          {gov && plotless && <SiteBid p={p} />}
          {!gov && plotless && <Line testid={`bid-line-${p.id}`}>{p.maxBid ? `Bids up to ${fmt(p.maxBid)} cr at the land auction` : 'Waits for a plot: the Governor sets the colony’s bid'}</Line>}
        </div>
      );
    case 'damaged':
      return gov ? <Repair p={p} /> : null;
    case 'closed':
      return (
        <div className="pb-1.5">
          <Line testid={`closed-line-${p.id}`}>Reopens when the fund pays its upkeep</Line>
        </div>
      );
    default:
      return null;
  }
}

// --- Donate ------------------------------------------------------------------------------------------

/** What the project still lacks: credits, and each good it needs that is not in yet. */
function missingOf(p: ColonyProjectView) {
  const credits = Math.max(0, p.cost.credits - p.funded.credits);
  const goods = GOODS.filter((g) => (p.cost.goods[g] ?? 0) > (p.funded.goods[g] ?? 0)).map((g) => ({ good: g, n: p.cost.goods[g]! - (p.funded.goods[g] ?? 0) }));
  return { credits, goods };
}

function Donate({ p }: { p: ColonyProjectView }) {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<'A' | 'B'>('B');
  const [credits, setCredits] = useState(0);
  const [goods, setGoods] = useState<Partial<Record<Good, number>>>({});
  const missing = missingOf(p);
  const mine = p.plaque.find((d) => d.playerId === self.id)?.value ?? 0;
  const refPrice = view.colony?.refPrice ?? {};
  // The sheet stays open until the gift lands on the plaque: a refusal (a toast) leaves it there to try again.
  const sentAt = useRef<number | null>(null);
  useEffect(() => {
    if (sentAt.current !== null && mine !== sentAt.current) {
      sentAt.current = null;
      setOpen(false);
    }
  }, [mine]);
  const maxCr = Math.min(self.money, missing.credits);
  const picked = Object.entries(goods).filter(([, n]) => n) as [Good, number][];
  const value = credits + picked.reduce((a, [g, n]) => a + n * (refPrice[g] ?? 0), 0);
  const gift = [credits > 0 && `${fmt(credits)} cr`, ...picked.map(([g, n]) => `${n} ${GOOD_NAME[g]}`)].filter(Boolean).join(' and ');
  const reset = () => {
    setCredits(0);
    setGoods({});
  };
  if (!open) {
    return (
      <span className="flex items-center gap-2">
        <Button size="md" variant="outline" className="h-8! shrink-0 whitespace-nowrap px-3 text-xs" onClick={() => setOpen(true)} data-testid={`donate-${p.id}`}>
          Donate
        </Button>
        <Line testid={`donate-hint-${p.id}`}>{mine > 0 ? `Your plaque ${fmt(mine)} cr` : 'Your name goes on its plaque'}</Line>
      </span>
    );
  }
  const give = () => {
    sentAt.current = mine;
    client.intent({ type: 'donate', id: p.id, credits, ...(picked.length ? { goods: Object.fromEntries(picked) } : {}) });
    reset();
  };
  return (
    <Sheet testid={`donate-sheet-${p.id}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]!">Donate to the {p.name}</span>
        <span className="text-[10px] text-ink-3" data-testid="donate-missing">
          needs {fmt(missing.credits)} cr{missing.goods.map((m) => ` · ${m.n} ${GOOD_NAME[m.good]}`).join('')}
        </span>
      </span>
      {variant === 'B' ? (
        <span className="flex flex-wrap gap-1" data-testid="donate-chips">
          {[50, 100, 250]
            .filter((c) => c < maxCr)
            .map((c) => (
              <Chip key={c} on={credits === c} onClick={() => setCredits(credits === c ? 0 : c)} testid={`chip-cr-${c}`}>
                {c} cr
              </Chip>
            ))}
          <Chip on={credits === maxCr && maxCr > 0} disabled={maxCr === 0} onClick={() => setCredits(credits === maxCr ? 0 : maxCr)} testid="chip-cr-rest">
            {maxCr < missing.credits ? `all you have (${fmt(maxCr)})` : `the rest (${fmt(maxCr)})`}
          </Chip>
          {missing.goods
            .filter((m) => me.stock[m.good] > 0)
            .map((m) => (
              <Chip key={m.good} on={(goods[m.good] ?? 0) > 0} onClick={() => setGoods((g) => ({ ...g, [m.good]: g[m.good] ? 0 : 1 }))} testid={`chip-good-${m.good}`}>
                <GoodIcon good={m.good} size={12} />+1 {GOOD_NAME[m.good]}
              </Chip>
            ))}
          <Chip onClick={() => setVariant('A')} testid="chip-other">
            Other…
          </Chip>
        </span>
      ) : (
        <span className="flex flex-col gap-1" data-testid="donate-steppers">
          <Stepper value={credits} max={maxCr} step={10} onChange={setCredits} label={`Credits · you have ${fmt(self.money)}`} unit="cr" testid="step-cr" />
          {missing.goods.map((m) => (
            <Stepper
              key={m.good}
              value={goods[m.good] ?? 0}
              max={Math.min(me.stock[m.good], m.n)}
              step={1}
              onChange={(n) => setGoods((g) => ({ ...g, [m.good]: n }))}
              label={
                <span className="inline-flex items-center gap-1">
                  <GoodIcon good={m.good} size={12} />
                  {GOOD_NAME[m.good]} · you have {me.stock[m.good]}, it needs {m.n}
                </span>
              }
              unit=""
              testid={`step-${m.good}`}
            />
          ))}
        </span>
      )}
      <Line tone={value > 0 ? 'text-ink' : 'text-ink-3'} testid="donate-preview">
        {value > 0 ? (
          <>
            Your plaque: {fmt(mine)} → <strong className="font-semibold text-holo">{fmt(mine + value)} cr</strong> · counts toward your vote weight
          </>
        ) : (
          'Give at least 1 cr or 1 unit'
        )}
      </Line>
      <span className="flex gap-1.5">
        <Button size="md" variant="holo" className="h-9! flex-1 px-2 text-sm" disabled={value === 0} onClick={give} data-testid="donate-give">
          {value > 0 ? `Give ${gift}` : 'Give'}
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="h-9! px-3 text-sm"
          onClick={() => {
            reset();
            setVariant('B');
            setOpen(false);
          }}
          data-testid="donate-cancel"
        >
          Cancel
        </Button>
      </span>
    </Sheet>
  );
}

// --- The site bid ------------------------------------------------------------------------------------

function SiteBid({ p }: { p: ColonyProjectView }) {
  const client = useClient();
  const [open, setOpen] = useState(false);
  const [bid, setBid] = useState<number | null>(p.maxBid ?? 300);
  const [other, setOther] = useState(false);
  if (!open) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={`bid-${p.id}`}>
        <Line tone={p.maxBid ? 'text-ink' : 'text-warn'} testid={`bid-line-${p.id}`}>
          {p.maxBid ? `Bids up to ${fmt(p.maxBid)} cr at the land auction` : 'No plot yet, and the colony doesn’t bid for one'}
        </Line>
        <Button size="md" variant="outline" className="h-8! shrink-0 whitespace-nowrap px-3 text-xs" onClick={() => setOpen(true)} data-testid={`bid-open-${p.id}`}>
          {p.maxBid ? 'Change' : 'Set a bid'}
        </Button>
      </span>
    );
  }
  return (
    <Sheet testid={`bid-sheet-${p.id}`}>
      <span className="label-caps text-[10px]!">The colony’s top bid for the {p.name}’s plot</span>
      <span className="flex flex-wrap gap-1" data-testid="bid-chips">
        {[100, 200, 300].map((b) => (
          <Chip
            key={b}
            on={!other && bid === b}
            onClick={() => {
              setOther(false);
              setBid(b);
            }}
            testid={`bid-chip-${b}`}
          >
            {b} cr
          </Chip>
        ))}
        <Chip
          on={other}
          onClick={() => {
            setOther(true);
            setBid((b) => b ?? 300);
          }}
          testid="bid-chip-other"
        >
          Other…
        </Chip>
        <Chip
          on={bid === null}
          onClick={() => {
            setOther(false);
            setBid(null);
          }}
          testid="bid-chip-none"
        >
          No bid
        </Chip>
      </span>
      {other && <Stepper value={bid ?? 0} max={2_000} step={25} onChange={setBid} label="Up to" unit="cr" testid="bid-step" />}
      <Line testid="bid-explain">At the land auction the colony bids up to this from the fund.</Line>
      <span className="flex gap-1.5">
        <Button
          size="md"
          variant="holo"
          className="h-9! flex-1 px-2 text-sm"
          onClick={() => {
            client.intent({ type: 'setSiteBid', id: p.id, maxBid: bid });
            setOpen(false);
          }}
          data-testid="bid-set"
        >
          {bid === null ? 'Don’t bid' : `Bid up to ${fmt(bid)} cr`}
        </Button>
        <Button size="md" variant="ghost" className="h-9! px-3 text-sm" onClick={() => setOpen(false)} data-testid="bid-cancel">
          Cancel
        </Button>
      </span>
    </Sheet>
  );
}

// --- Repair ------------------------------------------------------------------------------------------

function Repair({ p }: { p: ColonyProjectView }) {
  const { view } = usePhoneGame();
  const client = useClient();
  const fund = view.colony?.fund ?? 0;
  const cost = p.repairCost ?? 0;
  const short = fund < cost;
  return (
    <div className="flex flex-col gap-0.5 pb-1.5" data-testid={`repair-${p.id}`}>
      <span className="flex items-center gap-2">
        <Button size="md" variant="holo" className="h-8! shrink-0 whitespace-nowrap px-3 text-xs" disabled={short} onClick={() => client.intent({ type: 'repair', id: p.id })} data-testid={`repair-button-${p.id}`}>
          Repair {fmt(cost)} cr
        </Button>
        {!short && (
          <span data-num className="font-mono text-[11px] text-ink-2" data-testid={`repair-fund-${p.id}`}>
            Fund {fmt(fund)} → {fmt(fund - cost)} cr
          </span>
        )}
      </span>
      {short && (
        // RULE-21's refusal, in the engine's words and figures (repair() in colony.ts).
        <Line tone="text-alert-ink" testid={`repair-short-${p.id}`}>
          The fund has {fund} cr; the repair costs {cost} cr
        </Line>
      )}
    </div>
  );
}

// --- Commission (the Governor) ------------------------------------------------------------------------

/** "420 cr and 2 Alloy"; "1,000 cr, 2 Alloy and 1 Electronics". */
function priceWords(c: Pick<ColonyCatalogueView, 'credits' | 'goods'>): string {
  const parts = [`${fmt(c.credits)} cr`, ...GOODS.filter((g) => c.goods[g]).map((g) => `${c.goods[g]} ${GOOD_NAME[g]}`)];
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** The Governor's "Commission a project": the catalogue, a row the server refuses dimmed with its why, and a confirm line. */
export function Commission() {
  const { view, self } = usePhoneGame();
  const client = useClient();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<ColonyCatalogueView | null>(null);
  const [sent, setSent] = useState<ColonyCatalogueView | null>(null);
  const colony = view.colony;
  if (!colony || view.politics?.governor !== self.id) return null;
  // The news line once the server has the project: a refused commission shows its toast and no news.
  const landed = sent && colony.projects.some((q) => q.id === sent.id) ? sent : null;
  if (!open) {
    return (
      <span className="flex flex-col gap-1">
        <Button size="md" variant="outline" className="h-9! text-sm" onClick={() => setOpen(true)} data-testid="commission-open">
          Commission a project
        </Button>
        {landed && (
          <Line tone="text-ok" testid="commission-news">
            News: {self.name} commissions a {landed.name}
          </Line>
        )}
      </span>
    );
  }
  return (
    <section className="flex flex-col gap-1.5 rounded-panel border border-holo bg-panel p-2" data-testid="commission-list">
      <span className="flex items-baseline justify-between">
        <span className="label-caps text-[10px]!">Commission a project</span>
        <button type="button" className="min-h-8 text-[11px] font-semibold text-holo" onClick={() => setOpen(false)} data-testid="commission-close">
          Close
        </button>
      </span>
      <ul className="flex flex-col">
        {colony.catalogue.map((c) => (
          <li key={c.id} className="border-t border-holo-faint first:border-t-0">
            <button
              type="button"
              disabled={!c.commissionable}
              aria-pressed={pick?.id === c.id}
              onClick={() => setPick(c)}
              className={cx('flex w-full items-start gap-2 rounded-control px-1 py-1.5 text-left disabled:opacity-50', pick?.id === c.id && 'bg-holo-soft')}
              data-testid={`cat-${c.id}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-control border border-holo-line text-holo">
                <ObjectGlyph kind={c.id} size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-sm font-semibold">{c.name}</span>
                  <span className="ml-auto font-mono text-[11px] font-bold text-holo">+{c.prestige} prestige</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 font-mono text-[11px]" data-testid={`cat-cost-${c.id}`}>
                  <span className="font-bold">{fmt(c.credits)} cr</span>
                  {GOODS.filter((g) => c.goods[g]).map((g) => (
                    <span key={g} className="flex items-center gap-0.5 font-bold">
                      <GoodIcon good={g} size={12} />
                      {c.goods[g]}
                    </span>
                  ))}
                  <span className="text-ink-2">
                    {c.buildMonths} month{c.buildMonths > 1 ? 's' : ''} to build
                  </span>
                </span>
                <span className="text-[11px] text-ink-2">
                  {c.needsPlot ? 'Needs a plot · ' : ''}upkeep {c.upkeep} cr a month
                </span>
                {c.why && (
                  <span className="text-[11px] font-semibold text-warn" data-testid={`cat-why-${c.id}`}>
                    {c.why}
                  </span>
                )}
              </span>
            </button>
            {pick?.id === c.id && (
              <div className="flex flex-col gap-1.5 px-1 pb-1.5" data-testid="commission-confirm">
                <Line tone="text-ink" testid="commission-confirm-line">
                  Commission the {pick.name}: {priceWords(pick)}, from the fund and donations
                </Line>
                <span className="flex gap-1.5">
                  <Button
                    size="md"
                    variant="holo"
                    className="h-9! flex-1 text-sm"
                    onClick={() => {
                      client.intent({ type: 'commission', id: pick.id });
                      setSent(pick);
                      setPick(null);
                      setOpen(false);
                    }}
                    data-testid="commission-go"
                  >
                    Commission
                  </Button>
                  <Button size="md" variant="ghost" className="h-9! px-3 text-sm" onClick={() => setPick(null)} data-testid="commission-cancel">
                    Cancel
                  </Button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
