import { cx } from '@mule/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientState } from '../../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { useToday } from '../../../../../../apps/web/src/phone/hub/state';
import { IncomingDealSheet, incomingOf, MyDeals, type DraftKind } from '../../copied/deals/Deals';
import { Chat, type Composing } from '../../copied/deals/phone-parts';
import { useHub } from '../Hub';
import { Badges, TabBadge } from '../parts';

/*
 * GRAFT TARGET: new apps/web/src/phone/hub/tabs/Talk.tsx, from the deals mock's Talk desk (design/mocks/politics-deals
 * src/proposed/desks.tsx, approved with composer A). What changed for the tab: it has the whole stage, so the thread
 * takes the stage's height (not 240 px); the composer and an incoming offer open as one sheet over this stage (not
 * the rail). Chat and My cards stay its two sections. Its doors, as the desk's: `whisper:<id>`, `compose:<id>[:kind]`,
 * `deals`, `cards`.
 */

type Section = 'chat' | 'cards';

/** A card I made or took that the other player broke at the last month end: what the "!" on the tab is for. */
export const brokenToMe = (me: { id: string; deals?: { cards: { status: string; brokenBy: string | null; settled: number | null; from: string; to: string }[] } | null }, month: number) =>
  (me.deals?.cards ?? []).filter((c) => c.status === 'broken' && c.brokenBy !== me.id && (c.settled ?? 0) >= month - 1);

function landing(focus: string, cards: { id: string; from: string; to: string }[], me: string): { section: Section; to?: string; compose?: Composing; card?: boolean; answer?: string } | null {
  const [kind, id, sub] = focus.split(':');
  if (kind === 'whisper' && id) return { section: 'chat', to: id };
  if (kind === 'compose' && id) return { section: 'chat', to: id, compose: { to: id, ...(sub ? { kind: sub as DraftKind } : {}) } };
  if (kind === 'card' && id) return { section: 'chat', to: id, card: true };
  if (kind === 'cards') return { section: 'cards' };
  if (kind === 'answer' && id) {
    const c = cards.find((x) => x.id === id);
    return c ? { section: 'chat', to: c.from, answer: c.id } : null;
  }
  if (kind === 'deals') {
    const mine = cards.filter((c) => c.to === me);
    return mine.length === 1 ? { section: 'chat', to: mine[0]!.from, answer: mine[0]!.id } : { section: 'cards' };
  }
  return null;
}

export function TalkTab() {
  const { chat } = useClientState();
  const { view, me } = usePhoneGame();
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
    const at = landing(focus, incomingOf(me), me.id);
    takeFocus();
    if (!at) return;
    setSection(at.section);
    if (at.to) setTo(at.to);
    setComposing(at.compose ?? null);
    setCard(at.card ?? false);
    setAnswer(at.answer ?? null);
  }, [focus, takeFocus, me]);
  const incoming = incomingOf(me).length;
  const broken = brokenToMe(me, view.month).length;
  return (
    <div ref={root} className="relative flex min-h-0 flex-1 flex-col gap-2" data-testid="talk-stage">
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
            {v === 'cards' && (incoming > 0 || broken > 0) && (
              <Badges>
                {incoming > 0 && <TabBadge tone="holo" label={`${incoming} deal ${incoming === 1 ? 'offer' : 'offers'} waiting`} testid="talk-cards-badge">{incoming}</TabBadge>}
                {broken > 0 && <TabBadge tone="alert" label="A card was broken" testid="talk-cards-broken">!</TabBadge>}
              </Badges>
            )}
          </button>
        ))}
      </div>
      {section === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="channels">
          <Chat
            to={to}
            setTo={(id) => {
              setTo(id);
              setComposing(null);
            }}
            composing={composing}
            setComposing={setComposing}
            variant="a"
            card={card}
            setCard={setCard}
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

/**
 * The Talk tab's badges: the offers waiting for my answer (a count, holo) and, beside it, "!" (alert) while a card
 * made with me was broken at the last month end. Unread table chat counts into the number, as the desk's did.
 */
export function TalkBadge() {
  const { chat } = useClientState();
  const { view, me } = usePhoneGame();
  const { seenChat } = useToday();
  const { tab } = useHub();
  if (tab === 'talk') return null;
  const offers = incomingOf(me).length;
  const unread = Math.max(0, chat.length - seenChat);
  const broken = brokenToMe(me, view.month).length;
  if (offers + unread + broken === 0) return null;
  return (
    <Badges>
      {offers + unread > 0 && (
        <TabBadge tone="holo" label={`${offers > 0 ? `${offers} deal ${offers === 1 ? 'offer' : 'offers'} waiting` : ''}${offers > 0 && unread > 0 ? ', ' : ''}${unread > 0 ? `${unread} unread` : ''}`} testid="talk-badge">
          {offers + unread}
        </TabBadge>
      )}
      {broken > 0 && (
        <TabBadge tone="alert" label="A card made with you was broken" testid="talk-badge-broken">
          !
        </TabBadge>
      )}
    </Badges>
  );
}
