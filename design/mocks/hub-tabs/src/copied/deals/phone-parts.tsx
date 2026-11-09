// Copied from design/mocks/politics-deals/src/proposed/phone-parts.tsx (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import type { ChatMessage, MuleView } from '@mule/protocol';
import { EMOTES } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { player, slotOf } from '../../../../../../apps/web/src/game/derive';
import { useClient, useClientState } from '../../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { DealComposerInline, DealComposerSheet, DealsInThread, type DraftKind } from './Deals';
import { AiMark, RepChip, PlayerCard } from './parts';

/*
 * GRAFT TARGET: apps/web/src/phone/parts.tsx::Chat (the phone's whisper input and thread). The spec names
 * apps/web/src/chat/Chat.tsx for this mount, but that file holds the bubbles and the ticker; the whisper input is here
 * (finding F-1). As Chat today, with four changes, each marked CHANGE:
 *   1. the thread's player is the desk's (`to`), so a door or a name can open a whisper;
 *   2. the whisper line carries the other player's reputation chip;
 *   3. the thread ends with the pair's cards (DealsInThread);
 *   4. "+ Deal" beside Send on a whisper, in planning: variant A opens the sheet, variant B the inline draft.
 */

export type Variant = 'a' | 'b';
export interface Composing {
  to: string;
  kind?: DraftKind;
}

export function Chat({ to, setTo, composing, setComposing, variant, card, setCard }: { to: string | null; setTo: (id: string | null) => void; composing: Composing | null; setComposing: (c: Composing | null) => void; variant: Variant; card: boolean; setCard: (open: boolean) => void }) {
  const client = useClient();
  const { chat, seatId } = useClientState();
  const { view, me } = usePhoneGame();
  const [text, setText] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const others = view.players.filter((p) => p.id !== seatId);
  const lines = chat.filter((m) => (to === null ? !m.to : (m.to === to && m.from === seatId) || (m.from === to && m.to === seatId)));
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [lines.length]);
  const target = player(view, to);
  // CHANGE 4: a card is offered in planning only (S3-RULE-2 row 2); one unanswered card to a player at a time (row 5).
  const planning = view.phase === 'planning';
  const waiting = !!to && (me.deals?.cards ?? []).some((c) => c.from === me.id && c.to === to && c.status === 'offered');
  const inline = variant === 'b' && composing !== null && composing.to === to;

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
            {/* TABS: a computer seat's name always carries "· AI" (Heiko's ruling, #684). */}
            {p.isAi && <AiMark />}
          </button>
        ))}
      </div>
      {target && (
        // CHANGE 2: the whisper's player, with their reputation; the chip opens their card.
        <p className="flex items-center gap-1.5 font-mono text-xs text-ink-3" data-testid="whisper-line">
          <span className="min-w-0 truncate">WHISPER · ONLY YOU AND {target.name.toUpperCase()}</span>
          <RepChip view={view} id={target.id} onOpen={() => setCard(true)} testid="whisper-rep" />
        </p>
      )}
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-control border border-holo-faint bg-panel/50 p-2.5" data-testid="chat-lines">
        {lines.length === 0 && <li className="text-sm text-ink-3">{target ? `Nothing whispered with ${target.name} yet.` : 'Nobody has said anything yet.'}</li>}
        {lines.map((l) => (
          <ChatLine key={l.id} line={l} view={view} />
        ))}
        {/* CHANGE 3: the pair's cards, at the thread's foot. */}
        {to && <DealsInThread other={to} />}
        {inline && (
          <li>
            <DealComposerInline to={to!} kind={composing!.kind} onClose={() => setComposing(null)} />
          </li>
        )}
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
      {!inline && (
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
              disabled={waiting}
              title={waiting ? `${target.name} has not answered your last card` : undefined}
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
      )}
      {variant === 'a' && composing && <DealComposerSheet to={composing.to} kind={composing.kind} onClose={() => setComposing(null)} anchor={root.current} />}
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
          {from?.isAi && <span className="text-holo"> · AI</span>}
        </span>
        <span className="leading-snug">{line.text}</span>
      </div>
    </li>
  );
}
