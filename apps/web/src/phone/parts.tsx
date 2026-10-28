import { DEV_WALK } from '@mule/engine';
import type { ChatMessage, MarketRow, MuleView } from '@mule/protocol';
import { EMOTES } from '@mule/protocol';
import { Button, cx, GoodTag, hungerRule, Panel, PlayerMark, sickRule, type Good } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { player, slotOf } from '../game/derive';
import { useClient, useClientState } from '../net/react';
import { usePhoneGame } from './game';

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

function coverTone(cover: number) {
  return cover < 0.5 ? 'text-alert' : cover < 1 ? 'text-warn' : 'text-ink-3';
}

/** The colony market as a row of trading-screen cells: posted price and months of cover. */
export function MarketCells({ rows, className }: { rows: MarketRow[]; className?: string }) {
  return (
    <div className={cx('grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line', className)}>
      {rows.map((r) => (
        <div key={r.good} className="flex flex-col bg-panel px-2 py-1.5">
          <GoodTag good={r.good} className="text-[11px]" />
          <span data-num className="font-mono text-base font-bold leading-tight">
            {r.price}
          </span>
          <span data-num className={cx('font-mono text-[11px]', coverTone(r.cover))}>
            {r.cover >= 99 ? 'no demand' : `${r.cover} mo`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NewsPanel({ news }: { news: string[] }) {
  if (news.length === 0) return null;
  return (
    <Panel title="News">
      <ul className="flex flex-col gap-2.5" data-testid="news">
        {news.map((n) => (
          <li key={n} className="flex gap-2.5 text-sm leading-snug">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-holo" />
            {n}
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

/** Table talk and whispers. A whisper reaches only the two of you, never the big screen. */
export function Chat() {
  const client = useClient();
  const { chat, seatId } = useClientState();
  const { view } = usePhoneGame();
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState('');
  const others = view.players.filter((p) => p.id !== seatId);
  const lines = chat.filter((m) => (to === null ? !m.to : (m.to === to && m.from === seatId) || (m.from === to && m.to === seatId)));
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);
  const target = player(view, to);

  const send = () => {
    client.chat(text, to ?? undefined);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-0.5">
        <button type="button" onClick={() => setTo(null)} className={cx('h-9 shrink-0 rounded-full border px-3 text-sm font-semibold', to === null ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')}>
          Whole table
        </button>
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setTo(p.id)}
            className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', to === p.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-faint text-ink-2')}
          >
            <PlayerMark slot={slotOf(view, p.id) ?? 0} size={10} glow={false} />
            {p.name}
          </button>
        ))}
      </div>
      {target && <p className="font-mono text-xs text-ink-3">WHISPER · ONLY YOU AND {target.name.toUpperCase()} SEE THIS</p>}
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-control border border-holo-faint bg-panel/50 p-2.5">
        {lines.length === 0 && <li className="text-sm text-ink-3">{target ? `Nothing whispered with ${target.name} yet.` : 'Nobody has said anything yet.'}</li>}
        {lines.map((l) => (
          <ChatLine key={l.id} line={l} view={view} />
        ))}
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
        className="flex shrink-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          placeholder={target ? `Whisper to ${target.name}` : 'Say something to everyone'}
          className="h-11 min-w-0 flex-1 rounded-control border border-holo-line bg-panel px-3 text-ink outline-none placeholder:text-ink-3 focus:border-holo"
        />
        <Button size="md" type="submit" disabled={!text.trim()}>
          Send
        </Button>
      </form>
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
          {from?.isAi && <span className="text-holo"> · AI</span>}
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
