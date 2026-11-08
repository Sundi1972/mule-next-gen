import { POLITICS, type DealCard, type DealOffer } from '@mule/engine';
import type { MuleView, MyView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useClient, useClientState } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { lawUp, monthsWords, stakesWords } from './deals-words';
import { CardWho, shellOf, Who } from './parts';

/**
 * Deal cards on the phone (S3-C17, S3-C18): the composer over the rail. Reads me.deals and the public politics view;
 * sends only offerDeal, withdrawDeal and answerDeal, and shows a refusal as the server words it.
 */

export type DraftKind = 'pact' | 'vote';
/** `choice` is a pick on a ballot: `gov:<candidate>`, or `law:yes` / `law:no`. */
interface Draft {
  kind: DraftKind;
  months: number;
  choice: string | null;
}

function toOffer(to: string, d: Draft): DealOffer | null {
  if (d.kind === 'pact') return { to, terms: { kind: 'pact' }, months: d.months };
  if (!d.choice) return null;
  const [ballot, pick] = d.choice.split(':') as [string, string];
  if (ballot === 'law') return { to, terms: { kind: 'vote', law: true, yes: pick === 'yes' } };
  return { to, terms: { kind: 'vote', office: 'governor', candidate: pick } };
}

export const isOpen = (c: DealCard) => c.status === 'offered' || c.status === 'active';
export const between = (c: DealCard, a: string, b: string) => (c.from === a && c.to === b) || (c.from === b && c.to === a);
const choiceOf = (c: DealCard): string | null => (c.terms.kind !== 'vote' ? null : 'law' in c.terms ? `law:${c.terms.yes ? 'yes' : 'no'}` : `gov:${c.terms.candidate}`);

interface Choice {
  id: string;
  label: ReactNode;
  /** The engine's words for why not, shown in place of the choice. */
  no?: string;
}
interface BallotChoices {
  key: 'gov' | 'law';
  title: string;
  /** The law proposed, on its own line, so it is never cut. */
  sub?: string;
  choices: Choice[];
  no?: string;
}

/** The ballots a vote card can bind: the next Governor election and the next law vote, refused as S3-RULE-2 would. */
function ballotsFor(view: MuleView, me: MyView): BallotChoices[] {
  const p = view.politics!;
  const cards = me.deals?.cards ?? [];
  // S3-RULE-2 row 13: my own open vote card on that ballot with another choice.
  const promisedOn = (key: 'gov' | 'law') => cards.find((c) => c.from === me.id && isOpen(c) && choiceOf(c)?.startsWith(`${key}:`));
  const taken = (key: 'gov' | 'law', id: string) => {
    const c = promisedOn(key);
    return c && choiceOf(c) !== id ? 'You already promised your vote on this ballot' : undefined;
  };
  const voting = p.election && p.election.stage !== 'over';
  const running = ((voting ? p.election!.candidates.governor : p.candidates.governor) ?? []).filter((id) => id !== me.id);
  const month = voting ? view.month : p.next;
  const gov: BallotChoices =
    month === null
      ? { key: 'gov', title: 'Governor', choices: [], no: 'No election is left this game' }
      : {
          key: 'gov',
          title: `Governor · month ${month}`,
          choices: running.map((id) => {
            const no = taken('gov', `gov:${id}`);
            return { id: `gov:${id}`, label: <Who view={view} id={id} me={me.id} size={14} rep />, ...(no ? { no } : {}) };
          }),
          ...(running.length === 0 ? { no: 'Nobody is running for Governor yet' } : {}),
        };
  const law = lawUp(view);
  const lawBallot: BallotChoices = law
    ? {
        key: 'law',
        title: `Law vote · month ${law.month}`,
        sub: law.words,
        choices: (['yes', 'no'] as const).map((y) => {
          const no = taken('law', `law:${y}`);
          return { id: `law:${y}`, label: y === 'yes' ? 'Yes' : 'No', ...(no ? { no } : {}) };
        }),
      }
    : { key: 'law', title: 'Law vote', choices: [], no: 'No law is up for a vote' };
  return [gov, lawBallot];
}

/** The composer's draft and its send. Calls `onSent` once the server lists the new card. */
function useComposer(to: string, kind: DraftKind | undefined, onSent: () => void) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const { toasts } = useClientState();
  const cards = me.deals?.cards ?? [];
  const pactMonths = me.deals?.pactMonths ?? POLITICS.deals.pactMonths;
  const [draft, setDraft] = useState<Draft>({ kind: kind ?? 'pact', months: pactMonths[Math.floor(pactMonths.length / 2)] ?? 1, choice: null });
  const before = useRef<Set<string> | null>(null);
  // The newest toast when this composer last sent: only a later one is this card's refusal.
  const [sentAfter, setSentAfter] = useState<number | null>(null);
  const offersLeft = me.deals?.offersLeft ?? 0;
  const other = view.players.find((p) => p.id === to)!;
  const myRep = view.players.find((p) => p.id === me.id)?.reputation ?? 0;
  const refuseBelow = POLITICS.ai.deals.refuseBelow;
  const pactNo = cards.some((c) => c.terms.kind === 'pact' && isOpen(c) && between(c, me.id, to)) ? `You already have a pact with ${other.name}` : undefined;
  const offer = toOffer(to, draft);
  const refusal = sentAfter === null ? null : (toasts.filter((t) => t.id > sentAfter).at(-1) ?? null);
  const blocked = offersLeft <= 0 ? `You have ${cards.filter((c) => c.from === me.id && c.status === 'offered').length} cards waiting for an answer` : draft.kind === 'pact' ? pactNo : undefined;
  const landed = cards.some((c) => c.from === me.id && c.to === to && c.status === 'offered' && before.current && !before.current.has(c.id));
  useEffect(() => {
    if (landed) onSent();
  }, [landed, onSent]);
  return {
    view,
    me,
    other,
    draft,
    setDraft,
    pactMonths,
    pactNo,
    ballots: ballotsFor(view, me),
    refusal,
    blocked,
    // S3-RULE-9 row 1, said before the send: the AI seat will decline. Still sendable: the seat's answer is the rule.
    aiWarning: other.isAi && myRep < refuseBelow ? `${other.name} turns down cards from a name under ${refuseBelow}. Yours is ${myRep}.` : null,
    stakes: offer ? stakesWords(view, { from: me.id, to, terms: offer.terms }, me.id) : null,
    canSend: !!offer && !blocked,
    send() {
      if (!offer) return;
      before.current = new Set(cards.map((c) => c.id));
      if (refusal) client.dismiss(refusal.id);
      setSentAfter(toasts.at(-1)?.id ?? -1);
      client.intent({ type: 'offerDeal', offer });
    },
    dismiss() {
      if (refusal) client.dismiss(refusal.id);
    },
  };
}
type Composer = ReturnType<typeof useComposer>;

/** Pact or My vote, then its terms. One tap each; nothing to type. */
function ComposerFields({ c, testid }: { c: Composer; testid: string }) {
  const { draft, setDraft } = c;
  const pick = (k: DraftKind) => setDraft({ ...draft, kind: k, choice: null });
  const seg = (on: boolean) => cx('h-9 rounded-control border text-sm font-semibold', on ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2');
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Kind of card" className="grid grid-cols-2 gap-1">
        <button type="button" role="radio" aria-checked={draft.kind === 'pact'} className={seg(draft.kind === 'pact')} onClick={() => pick('pact')} data-testid={`${testid}-kind-pact`}>
          Pact
        </button>
        <button type="button" role="radio" aria-checked={draft.kind === 'vote'} className={seg(draft.kind === 'vote')} onClick={() => pick('vote')} data-testid={`${testid}-kind-vote`}>
          My vote
        </button>
      </div>
      {draft.kind === 'pact' ? (
        c.pactNo ? (
          <p className="text-xs font-semibold text-alert" data-testid={`${testid}-pact-no`}>
            {c.pactNo}
          </p>
        ) : (
          <>
            <div role="radiogroup" aria-label="How long" className="grid grid-cols-3 gap-1" data-testid={`${testid}-months`}>
              {c.pactMonths.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={draft.months === m} className={seg(draft.months === m)} onClick={() => setDraft({ ...draft, months: m })} data-testid={`${testid}-months-${m}`}>
                  {m} {m === 1 ? 'month' : 'months'}
                </button>
              ))}
            </div>
            <p className="text-xs leading-snug" data-testid={`${testid}-binds`}>
              Neither of you sabotages the other, {monthsWords(c.view.month, c.view.month + draft.months - 1)}.
            </p>
          </>
        )
      ) : (
        <div className="flex flex-col gap-1.5" data-testid={`${testid}-ballots`}>
          {c.ballots.map((b) => (
            <fieldset key={b.key} className="flex min-w-0 flex-col gap-1" data-testid={`${testid}-ballot-${b.key}`}>
              <legend className="mb-0.5 text-[11px] font-semibold leading-tight text-ink-2">
                {b.title}
                {b.sub && (
                  <span className="block font-normal text-ink" data-testid={`${testid}-ballot-${b.key}-sub`}>
                    {b.sub}
                  </span>
                )}
              </legend>
              {b.no ? (
                <span className="text-xs text-ink-3" data-testid={`${testid}-ballot-${b.key}-no`}>
                  {b.no}
                </span>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {b.choices.map((ch) =>
                    ch.no ? (
                      <span key={ch.id} className="flex min-h-9 items-center rounded-control border border-dashed border-holo-faint px-1.5 text-[10px] leading-tight text-ink-3" data-testid={`${testid}-choice-${ch.id}-no`}>
                        {ch.no}
                      </span>
                    ) : (
                      <button
                        key={ch.id}
                        type="button"
                        role="radio"
                        aria-checked={draft.choice === ch.id}
                        onClick={() => setDraft({ ...draft, choice: ch.id })}
                        className={cx('flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-control border px-1 text-sm', draft.choice === ch.id ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2')}
                        data-testid={`${testid}-choice-${ch.id}`}
                      >
                        {ch.label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}

/** The stakes, the AI's warning and the server's refusal, under the fields. */
function ComposerNotes({ c, testid }: { c: Composer; testid: string }) {
  return (
    <>
      {c.stakes && (
        <p className="text-[11px] leading-snug text-ink-2" data-testid={`${testid}-stakes`}>
          {c.stakes}
        </p>
      )}
      {c.aiWarning && (
        <p className="rounded-control border border-dashed border-warn px-2 py-1 text-[11px] font-semibold leading-snug text-warn" data-testid={`${testid}-ai-warning`}>
          {c.aiWarning}
        </p>
      )}
      {(c.blocked || c.refusal) && (
        <p role="alert" className="flex items-start gap-1.5 rounded-control border border-alert bg-alert-bg px-2 py-1 text-xs font-semibold text-alert-ink" data-testid={`${testid}-refusal`}>
          <span className="min-w-0 flex-1">{c.refusal?.message ?? c.blocked}</span>
          {c.refusal && (
            <button type="button" className="shrink-0 text-ink-2" aria-label="Dismiss" onClick={c.dismiss} data-testid={`${testid}-refusal-dismiss`}>
              ✕
            </button>
          )}
        </p>
      )}
    </>
  );
}

/** The composer: a sheet over the whole rail, header to Ready, so the choice and the send fit at 667×375 without a scroll. */
export function DealComposerSheet({ to, kind, onClose, anchor }: { to: string; kind?: DraftKind | undefined; onClose: () => void; anchor: Element | null }) {
  const c = useComposer(to, kind, onClose);
  return (
    <RailSheet
      label={`Deal card for ${c.other.name}`}
      testid="composer-a"
      anchor={anchor}
      onClose={onClose}
      closeWord="Cancel"
      title={
        <>
          <span className="whitespace-nowrap text-xs font-semibold text-ink-2">Card for</span>
          <CardWho view={c.view} id={to} size={14} rep />
        </>
      }
      action={
        <Button size="md" className="px-3" disabled={!c.canSend} onClick={c.send} data-testid="composer-a-send">
          Offer to {c.other.name}
        </Button>
      }
      note={`${c.other.name} answers before planning ends, or it expires.`}
    >
      <ComposerFields c={c} testid="composer-a" />
      <ComposerNotes c={c} testid="composer-a" />
    </RailSheet>
  );
}

/**
 * A sheet over the whole rail at the rail's width, portalled into the shell: the hub has no slot over its rail. Its
 * buttons sit in its footer, under the thumb.
 */
function RailSheet({ label, title, testid, anchor, onClose, closeWord = 'Close', action, note, children }: { label: string; title: ReactNode; testid: string; anchor: Element | null; onClose: () => void; closeWord?: string; action?: ReactNode; note?: string; children: ReactNode }) {
  const sheet = (
    <div className="absolute inset-y-0 right-0 z-40 flex w-(--rail) flex-col border-l-2 border-holo bg-panel shadow-glow" role="dialog" aria-modal aria-label={label} data-testid={testid}>
      <header className="flex min-h-10 items-center gap-1.5 border-b border-holo-faint px-3 py-1.5">{title}</header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2" data-testid={`${testid}-body`}>
        {children}
      </div>
      <footer className="flex flex-col gap-1 border-t border-holo-faint px-3 py-2">
        <span className={cx('grid gap-1.5', action ? 'grid-cols-[auto_1fr]' : 'grid-cols-1')}>
          <Button size="md" variant={action ? 'ghost' : 'outline'} className="px-3" onClick={onClose} data-testid={`${testid}-close`}>
            {closeWord}
          </Button>
          {action}
        </span>
        {note && (
          <span className="text-center text-[10px] leading-tight text-ink-3" data-testid={`${testid}-note`}>
            {note}
          </span>
        )}
      </footer>
    </div>
  );
  const shell = shellOf(anchor);
  return shell ? createPortal(sheet, shell) : sheet;
}
