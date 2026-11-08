import { Button, cx, GOOD_NAME, GoodIcon } from '@mule/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NewsWords } from '../../components/SeatWords';
import { useClientState } from '../../net/react';
import { usePhoneGame } from '../game';
import { Chat, ShipLine, type Composing } from '../parts';
import { SellRail } from '../Sell';
import { useHub } from './Hub';
import { needRows } from './needs';
import { IncomingDealSheet, incomingOf, MyDeals, type DraftKind } from './politics/Deals';
import { useToday } from './state';

function Section({ title, children, testid }: { title: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-2" data-testid={testid}>
      <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">{title}</h3>
      {children}
    </section>
  );
}

/** Colony: what you need this month, the news, the export ship. */
export function ColonyDesk() {
  const { view } = usePhoneGame();
  return (
    <>
      <ThisMonth />
      <News />
      <ShipLine view={view} />
    </>
  );
}

/** RULE-8: each good you need this month against what you hold, SHORT or OK, with what needs it. */
export function ThisMonth() {
  const { view, me } = usePhoneGame();
  const rows = needRows(me.monthNeeds, me.stock, view.tiles.filter((t) => t.owner === me.id));
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-2.5" data-testid="this-month">
      <span className="label-caps @min-[1100px]/shell:text-xs!">This month you need</span>
      {rows.map((n) => {
        const ok = n.short === 0;
        const scale = Math.max(n.need, n.have);
        return (
          <div key={n.good} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5" data-testid={`need-${n.good}`}>
            <GoodIcon good={n.good} size={16} />
            <span className="text-sm font-semibold @min-[1100px]/shell:text-base">
              {GOOD_NAME[n.good]} {n.why && <span className="text-xs font-normal text-ink-3 @min-[1100px]/shell:text-sm">· {n.why}</span>}
            </span>
            <span data-num className={cx('font-mono text-xs font-bold @min-[1100px]/shell:text-sm', ok ? 'text-ok' : 'text-alert')}>
              {ok ? 'OK' : `SHORT ${n.short}`}
            </span>
            <div className="relative col-span-3 h-2 overflow-hidden rounded-full bg-raised">
              <div className={cx('absolute inset-y-0 left-0 rounded-full', ok ? 'bg-ok' : 'bg-alert')} style={{ width: `${(n.have / scale) * 100}%` }} />
              <div className="absolute inset-y-0 border-l-2 border-ink" style={{ left: `${(n.need / scale) * 100}%` }} title={`need ${n.need}`} />
            </div>
            <span className="col-span-3 font-mono text-[10px] text-ink-3 @min-[1100px]/shell:text-xs">
              HAVE {n.have} · NEED {n.need}
            </span>
          </div>
        );
      })}
    </section>
  );
}

export function News() {
  const { view } = usePhoneGame();
  if (view.news.length === 0) return null;
  return (
    <section className="flex flex-col gap-1" data-testid="news">
      <span className="label-caps @min-[1100px]/shell:text-xs!">News</span>
      <ul className="flex flex-col gap-1 text-sm">
        {view.news.map((n, i) => (
          <li key={n} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-holo" />
            <NewsWords view={view} i={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type TalkSection = 'chat' | 'cards';

/**
 * Where a door's focus lands the Talk desk: `whisper:<id>`, `compose:<id>[:pact|vote]`, `card:<id>`, `cards`, or
 * `deals` (the agenda's door: one card offered to me opens over the rail and in its thread; more open My cards).
 */
function landing(focus: string, offered: { id: string; from: string }[]): { section: TalkSection; to?: string; compose?: Composing; card?: boolean; answer?: string } | null {
  const [kind, id, sub] = focus.split(':');
  if (kind === 'whisper' && id) return { section: 'chat', to: id };
  if (kind === 'compose' && id) return { section: 'chat', to: id, compose: { to: id, ...(sub ? { kind: sub as DraftKind } : {}) } };
  if (kind === 'card' && id) return { section: 'chat', to: id, card: true };
  if (kind === 'cards') return { section: 'cards' };
  if (kind === 'deals') return offered.length === 1 ? { section: 'chat', to: offered[0]!.from, answer: offered[0]!.id } : { section: 'cards' };
  return null;
}

/** Talk: the table chat and whispers, and My cards. Opening it reads what was said. */
export function TalkDesk() {
  const { chat } = useClientState();
  const { me } = usePhoneGame();
  const { setSeenChat } = useToday();
  const { focus, takeFocus } = useHub();
  const [section, setSection] = useState<TalkSection>('chat');
  const [to, setTo] = useState<string | null>(null);
  const [composing, setComposing] = useState<Composing | null>(null);
  const [card, setCard] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const closeAnswer = useCallback(() => setAnswer(null), []);
  useEffect(() => setSeenChat(chat.length), [chat.length, setSeenChat]);
  useEffect(() => {
    if (!focus) return;
    const at = landing(focus, incomingOf(me));
    takeFocus();
    if (!at) return;
    setSection(at.section);
    if (at.to) setTo(at.to);
    setComposing(at.compose ?? null);
    setCard(at.card ?? false);
    setAnswer(at.answer ?? null);
  }, [focus, takeFocus, me]);
  const incoming = incomingOf(me).length;
  return (
    <div ref={root} className="flex flex-col gap-2" data-testid="talk-desk">
      {me.deals && (
        <div role="tablist" aria-label="Talk" className="grid grid-cols-2 gap-1">
          {(['chat', 'cards'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={section === v}
              onClick={() => setSection(v)}
              data-testid={`talk-${v}`}
              className={cx('relative h-11 rounded-control border text-sm font-semibold', section === v ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2')}
            >
              {v === 'chat' ? 'Chat' : 'My cards'}
              {v === 'cards' && incoming > 0 && (
                <span className="absolute -right-1 -top-1 size-4 rounded-full bg-holo text-center font-mono text-[10px] font-bold leading-4 text-on-holo" data-testid="talk-cards-badge">
                  {incoming}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {section === 'chat' || !me.deals ? (
        <div className="flex h-[240px] flex-col @min-[1100px]/shell:h-[420px]" data-testid="channels">
          <Chat
            focus={{
              to,
              setTo: (id) => {
                setTo(id);
                setComposing(null);
              },
              composing,
              setComposing,
              card,
              setCard,
            }}
          />
        </div>
      ) : (
        <MyDeals />
      )}
      {answer && <IncomingDealSheet id={answer} onClose={closeAnswer} anchor={root.current} />}
    </div>
  );
}

/** The Talk tab's badge: unread table chat, and cards waiting for my answer. */
export function TalkBadge() {
  const { chat } = useClientState();
  const { me } = usePhoneGame();
  const { seenChat } = useToday();
  const { desk } = useHub();
  const unread = (desk === 'talk' ? 0 : chat.length - seenChat) + incomingOf(me).length;
  if (unread <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 size-4 rounded-full bg-holo text-center font-mono text-[10px] font-bold leading-4 text-on-holo" data-testid="talk-badge">
      {unread}
    </span>
  );
}

/** Market: put a plot or a MULE up for the auction after planning; the month's line-up; on a phone, the prices. */
export function MarketDesk() {
  const { sell } = useToday();
  const { pickTool } = useHub();
  return (
    <>
      <Section title="Sell at the auction after planning" testid="list-asset">
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">Everything of value is sold at auction, so everyone gets a fair chance to bid.</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="md" variant="outline" onClick={() => pickTool('list')} data-testid="list-plot">
            A plot…
          </Button>
          <Button size="md" variant="outline" onClick={() => pickTool('list')} data-testid="list-mule">
            A MULE…
          </Button>
        </div>
      </Section>
      <div className="flex flex-col gap-2.5" data-testid="listings">
        <SellRail sell={sell} />
      </div>
      <div className="@min-[1100px]/shell:hidden">
        <MarketStrip />
      </div>
    </>
  );
}

/** The store's prices and stock in one row of goods: what buying or selling would cost. The ship is This month's line. */
export function MarketStrip() {
  const { view } = usePhoneGame();
  return (
    <section className="flex flex-col gap-1" data-testid="market-strip">
      <span className="label-caps flex justify-between gap-2 @min-[1100px]/shell:text-xs!">
        Store prices{' '}
        <span>
          MULE {view.mulePrice} cr · {view.storeMules} left
        </span>
      </span>
      <div className="grid grid-cols-3 gap-1 @min-[1100px]/shell:grid-cols-5 @min-[1100px]/shell:gap-2">
        {view.market.map((r) => (
          <div key={r.good} className="flex items-center gap-2 rounded-control border border-holo-faint bg-panel px-2 py-1 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2" data-good={r.good}>
            <GoodIcon good={r.good} size={18} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-semibold @min-[1100px]/shell:text-sm">{GOOD_NAME[r.good]}</span>
              <span data-num className="font-mono text-sm font-bold @min-[1100px]/shell:text-lg">
                {r.storeSells === null ? '—' : <>{r.storeSells} <span className="text-[10px] font-normal text-ink-3">cr</span></>}
              </span>
            </span>
            <span className={cx('ml-auto font-mono text-[10px] @min-[1100px]/shell:text-xs', r.storeStock === 0 ? 'text-alert' : 'text-ink-3')}>{r.storeStock === 0 ? 'SOLD OUT' : `${r.storeStock} left`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
