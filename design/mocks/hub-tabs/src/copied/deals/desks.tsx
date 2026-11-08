// Copied from design/mocks/politics-deals/src/proposed/desks.tsx (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import { cx } from '@mule/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientState } from '../../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { useHub } from '../../proposed/Hub';
import { useToday } from '../../../../../../apps/web/src/phone/hub/state';
import { IncomingDealSheet, incomingOf, MyDeals, type DraftKind } from './Deals';
import { Chat, type Composing, type Variant } from './phone-parts';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/desks.tsx::TalkDesk and ::ChatBadge (WS6). The Talk desk keeps P0's two
 * sections, Chat and My cards (the frame's switch, approved 7 Nov): no new desk tab. A door's focus opens it where the
 * action is: `whisper:<id>`, `compose:<id>[:pact|vote]`, `deals` (the agenda's door), `cards`.
 */

type Section = 'chat' | 'cards';

/** Where a focus lands: the section, the whisper, and the composer. */
function landing(focus: string, cards: { id: string; from: string; to: string }[], me: string): { section: Section; to?: string; compose?: Composing; card?: boolean; answer?: string } | null {
  const [kind, id, sub] = focus.split(':');
  if (kind === 'whisper' && id) return { section: 'chat', to: id };
  if (kind === 'compose' && id) return { section: 'chat', to: id, compose: { to: id, ...(sub ? { kind: sub as DraftKind } : {}) } };
  if (kind === 'card' && id) return { section: 'chat', to: id, card: true };
  if (kind === 'cards') return { section: 'cards' };
  if (kind === 'deals') {
    // One card waiting for me: its whisper thread, where it sits. More: My cards lists them together.
    const mine = cards.filter((c) => c.to === me);
    // F-9 (team-lead, 7 Nov): one card opens over the rail, in A's sheet, as well as sitting in its thread.
    return mine.length === 1 ? { section: 'chat', to: mine[0]!.from, answer: mine[0]!.id } : { section: 'cards' };
  }
  return null;
}

export function makeTalkDesk(variant: Variant) {
  return function TalkDesk() {
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
    return (
      <div ref={root} className="flex flex-col gap-2" data-testid="talk-desk">
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
        {section === 'chat' ? (
          <div className="flex h-[240px] flex-col @min-[1100px]/shell:h-[420px]" data-testid="channels">
            <Chat
              to={to}
              setTo={(id) => {
                setTo(id);
                setComposing(null);
              }}
              composing={composing}
              setComposing={setComposing}
              variant={variant}
              card={card}
              setCard={setCard}
            />
          </div>
        ) : (
          <MyDeals />
        )}
        {answer && <IncomingDealSheet id={answer} onClose={closeAnswer} anchor={root.current} />}
      </div>
    );
  };
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
