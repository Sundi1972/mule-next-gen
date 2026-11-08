import { cx } from '@mule/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientState } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { Chat, type Composing } from '../../parts';
import { useHub } from '../Hub';
import { IncomingDealSheet, incomingOf, MyDeals, type DraftKind } from '../politics/Deals';
import { useToday } from '../state';
import { Badges, TabBadge } from './parts';

/*
 * The Talk tab (the approved hub-tabs mock, D11): the table's chat and whispers, and My cards, with the whole stage, so
 * the thread takes the stage's height. An incoming offer opens as a sheet over this stage. Opening it reads what was
 * said. Its doors: `whisper:<id>`, `compose:<id>[:pact|vote]`, `card:<id>`, `cards`, and `deals` (This month's row:
 * one card offered to me opens in its thread with the offer over it; more open My cards).
 */

type Section = 'chat' | 'cards';

function landing(focus: string, offered: { id: string; from: string }[]): { section: Section; to?: string; compose?: Composing; card?: boolean; answer?: string } | null {
  const [kind, id, sub] = focus.split(':');
  if (kind === 'whisper' && id) return { section: 'chat', to: id };
  if (kind === 'compose' && id) return { section: 'chat', to: id, compose: { to: id, ...(sub ? { kind: sub as DraftKind } : {}) } };
  if (kind === 'card' && id) return { section: 'chat', to: id, card: true };
  if (kind === 'cards') return { section: 'cards' };
  if (kind === 'deals') return offered.length === 1 ? { section: 'chat', to: offered[0]!.from, answer: offered[0]!.id } : { section: 'cards' };
  return null;
}

export function TalkTab() {
  const { chat } = useClientState();
  const { me } = usePhoneGame();
  const { setSeenChat } = useToday();
  const { focus, takeFocus } = useHub();
  const [section, setSection] = useState<Section>('chat');
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
    <div ref={root} className="relative flex min-h-0 flex-1 flex-col gap-2" data-testid="talk-stage">
      {/* My cards only while the table plays deals; without them Talk is the chat alone. */}
      {me.deals && (
        <div role="tablist" aria-label="Talk" className="grid shrink-0 grid-cols-2 gap-1">
          {(['chat', 'cards'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={section === v}
              onClick={() => setSection(v)}
              data-testid={`talk-${v}`}
              className={cx('relative h-9 rounded-control border text-xs font-semibold', section === v ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2')}
            >
              {v === 'chat' ? 'Chat' : 'My cards'}
              {v === 'cards' && incoming > 0 && (
                <Badges>
                  <TabBadge tone="holo" label={`${incoming} deal ${incoming === 1 ? 'offer' : 'offers'} waiting`} testid="talk-cards-badge">
                    {incoming}
                  </TabBadge>
                </Badges>
              )}
            </button>
          ))}
        </div>
      )}
      {section === 'chat' || !me.deals ? (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="channels">
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
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" data-testid="my-cards">
          <MyDeals />
        </div>
      )}
      {answer && <IncomingDealSheet id={answer} onClose={closeAnswer} anchor={root.current} />}
    </div>
  );
}

/** The Talk tab's count while another tab is open: unread table chat and the offers waiting for my answer. */
export function TalkBadge() {
  const { chat } = useClientState();
  const { me } = usePhoneGame();
  const { seenChat } = useToday();
  const { tab } = useHub();
  if (tab === 'talk') return null;
  const offers = incomingOf(me).length;
  const unread = Math.max(0, chat.length - seenChat);
  if (offers + unread === 0) return null;
  const label = [offers > 0 ? `${offers} deal ${offers === 1 ? 'offer' : 'offers'} waiting` : '', unread > 0 ? `${unread} unread` : ''].filter(Boolean).join(', ');
  return (
    <TabBadge tone="holo" label={label} testid="talk-badge">
      {offers + unread}
    </TabBadge>
  );
}
