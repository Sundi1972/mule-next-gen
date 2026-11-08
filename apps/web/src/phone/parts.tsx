import { DEV_WALK } from '@mule/engine';
import type { ChatMessage, MuleView } from '@mule/protocol';
import { EMOTES } from '@mule/protocol';
import { Button, cx, GoodTag, hungerRule, Panel, PlayerMark, sickRule, type Good } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { AiMark } from '../chat/Chat';
import { NewsWords } from '../components/SeatWords';
import { player, slotOf } from '../game/derive';
import { useClient, useClientState } from '../net/react';
import { usePhoneGame } from './game';
import { DealComposerSheet, DealsInThread, noNewCard, type DraftKind } from './hub/politics/Deals';
import { PlayerCard, RepChip } from './hub/politics/parts';

const ALL: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'];

/** This player's depot: Food, Water and Energy always, other goods once they hold some. */
export function StockPanel({ title = 'Your stock' }: { title?: string }) {
  const { me } = usePhoneGame();
  const goods = ALL.filter((g) => g === 'food' || g === 'water' || g === 'energy' || me.stock[g] > 0);
  const shortFood = me.stock.food < me.needs.food;
  const shortWater = me.stock.water < me.needs.water;
  return (
    <Panel title={title} className="gap-2 p-3">
      <div className="grid grid-cols-4 gap-x-2 gap-y-2" data-testid="stock">
        {goods.map((good) => (
          <div key={good} className="flex min-w-0 flex-col items-start gap-1">
            <GoodTag good={good} className="gap-1 text-[11px]" />
            <span data-num className="font-mono text-xl font-bold">
              {me.stock[good]}
            </span>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11px] text-ink-3">
        UPKEEP NEEDS {me.needs.food} FOOD · {me.needs.water} WATER
      </p>
      {(shortFood || shortWater) && (
        <p className="text-sm text-warn">
          You are short of {[shortFood && 'Food', shortWater && 'Water'].filter(Boolean).join(' and ')} for upkeep. Buy it at the auction.
        </p>
      )}
      {(me.hungry || me.sick) && (
        <p className="text-sm text-alert">{[me.hungry && `Hungry this month. ${hungerRule(DEV_WALK)}`, me.sick && `Sick this month. ${sickRule(DEV_WALK)} Medicine cures it.`].filter(Boolean).join(' ')}</p>
      )}
    </Panel>
  );
}

export function NewsPanel({ view }: { view: Pick<MuleView, 'news' | 'newsLines' | 'players'> }) {
  if (view.news.length === 0) return null;
  return (
    <Panel title="News">
      <ul className="flex flex-col gap-2.5" data-testid="news">
        {view.news.map((n, i) => (
          <li key={n} className="flex gap-2.5 text-sm leading-snug">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-holo" />
            <NewsWords view={view} i={i} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The export ship: when it calls and what it still wants. */
export function ShipLine({ view }: { view: MuleView }) {
  const wants = view.ship.wants ? (Object.entries(view.ship.wants) as [Good, number][]).filter(([, n]) => n > 0) : [];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-holo-faint bg-panel px-3 py-2 text-sm">
      <span className="label-caps">Export ship</span>
      <span>{view.ship.inPort ? 'In port now' : `Calls in month ${view.ship.arrives}`}</span>
      {wants.length > 0 && (
        <span className="flex flex-wrap items-center gap-2 text-ink-2">
          · wants
          {wants.map(([g, n]) => (
            <span key={g} className="flex items-center gap-1">
              <GoodTag good={g} className="text-[11px]" />
              <span data-num className="font-mono text-xs">{n}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** A deal card being drafted, for whom, and the kind it opens on. */
export interface Composing {
  to: string;
  kind?: DraftKind;
}

/** Where the Talk desk points Chat: the whisper, the composer, the whispered player's card. Absent, Chat holds its own. */
export interface ChatFocus {
  to: string | null;
  setTo(id: string | null): void;
  composing: Composing | null;
  setComposing(c: Composing | null): void;
  card: boolean;
  setCard(open: boolean): void;
}

/**
 * Table talk and whispers. A whisper reaches only the two of you, never the big screen; in planning it ends with the
 * pair's deal cards and offers "+ Deal".
 */
export function Chat({ focus }: { focus?: ChatFocus }) {
  const client = useClient();
  const { chat, seatId } = useClientState();
  const { view, me } = usePhoneGame();
  const [ownTo, setOwnTo] = useState<string | null>(null);
  const [ownComposing, setOwnComposing] = useState<Composing | null>(null);
  const [ownCard, setOwnCard] = useState(false);
  const { to, setTo, composing, setComposing, card, setCard } = focus ?? {
    to: ownTo,
    setTo: (id: string | null) => {
      setOwnTo(id);
      setOwnComposing(null);
    },
    composing: ownComposing,
    setComposing: setOwnComposing,
    card: ownCard,
    setCard: setOwnCard,
  };
  const [text, setText] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const others = view.players.filter((p) => p.id !== seatId);
  const lines = chat.filter((m) => (to === null ? !m.to : (m.to === to && m.from === seatId) || (m.from === to && m.to === seatId)));
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);
  const target = player(view, to);
  // A card is offered in planning only (S3-RULE-2 row 2), and one unanswered card to a player at a time (row 5).
  const planning = view.phase === 'planning' && !!view.politics;
  const waiting = to ? noNewCard(view, me, to) : null;

  const send = () => {
    client.chat(text, to ?? undefined);
    setText('');
  };

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-2" data-testid="chat">
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-0.5" data-testid="chat-to">
        <button type="button" onClick={() => setTo(null)} className={cx('h-9 shrink-0 rounded-full border px-3 text-sm font-semibold', to === null ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')} data-testid="chat-to-all">
          Whole table
        </button>
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setTo(p.id)}
            className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', to === p.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')}
            data-testid={`chat-to-${p.id}`}
          >
            <PlayerMark slot={slotOf(view, p.id) ?? 0} size={10} glow={false} />
            {p.name}
          </button>
        ))}
      </div>
      {target && (
        <p className="flex items-center gap-1.5 font-mono text-xs text-ink-3" data-testid="whisper-line">
          <span className="min-w-0 truncate">WHISPER · ONLY YOU AND {target.name.toUpperCase()}</span>
          {view.politics && <RepChip view={view} id={target.id} onOpen={() => setCard(true)} testid="whisper-rep" />}
        </p>
      )}
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-control border border-holo-faint bg-panel/50 p-2.5" data-testid="chat-lines">
        {lines.length === 0 && <li className="text-sm text-ink-3">{target ? `Nothing whispered with ${target.name} yet.` : 'Nobody has said anything yet.'}</li>}
        {lines.map((l) => (
          <ChatLine key={l.id} line={l} view={view} />
        ))}
        {to && <DealsInThread other={to} />}
        <li ref={end} aria-hidden />
      </ul>
      {to === null && (
        <div className="flex shrink-0 gap-2">
          {EMOTES.map((e) => (
            <button key={e} type="button" onClick={() => client.emote(e)} className="h-9 flex-1 rounded-chip border border-holo-faint bg-panel text-xs font-semibold text-ink-2 hover:text-ink">
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex shrink-0 gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        data-testid="chat-form"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          placeholder={target ? `Whisper to ${target.name}` : 'Say something to everyone'}
          className="h-11 min-w-0 flex-1 rounded-control border border-holo-line bg-panel px-3 text-ink outline-none placeholder:text-ink-3 focus:border-holo"
          data-testid="chat-input"
        />
        {target && planning && (
          <Button
            size="md"
            variant="outline"
            type="button"
            className="shrink-0 px-2.5"
            disabled={!!waiting}
            title={waiting ?? undefined}
            aria-label={`Offer ${target.name} a deal card`}
            onClick={() => setComposing({ to: target.id })}
            data-testid="add-deal"
          >
            + Deal
          </Button>
        )}
        <Button size="md" type="submit" className="shrink-0 px-3" disabled={!text.trim()} data-testid="chat-send">
          Send
        </Button>
      </form>
      {composing && <DealComposerSheet to={composing.to} kind={composing.kind} onClose={() => setComposing(null)} anchor={root.current} />}
      {card && target && <PlayerCard view={view} id={target.id} me={me.id} anchor={root.current} onClose={() => setCard(false)} />}
    </div>
  );
}

function ChatLine({ line, view }: { line: ChatMessage; view: MuleView }) {
  const from = player(view, line.from);
  return (
    <li className="flex gap-2.5">
      <PlayerMark slot={slotOf(view, line.from) ?? 0} size={14} />
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-ink-2">
          {from?.name ?? 'Someone'}
          {from?.isAi && <AiMark />}
        </span>
        <span className="leading-snug">{line.text}</span>
      </div>
    </li>
  );
}

/** Emotes float up briefly on every screen, drawn by the shell (ShellLayer) just left of its rail. */
export function EmoteBubbles({ view }: { view: MuleView }) {
  const { emotes } = useClientState();
  if (emotes.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-[calc(var(--rail)+0.75rem+env(safe-area-inset-right))] top-3 z-30 flex flex-col items-end gap-1.5" data-testid="emotes">
      {emotes.map((e) => (
        <span key={e.id} className="flex items-center gap-1.5 rounded-full border border-holo-line bg-panel px-3 py-1 text-sm font-semibold shadow-chip">
          <PlayerMark slot={slotOf(view, e.from) ?? 0} size={14} glow={false} />
          {e.emote}
        </span>
      ))}
    </div>
  );
}
