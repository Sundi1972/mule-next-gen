import type { DealCard, DealOffer } from '@mule/engine';
import type { MuleView, MyView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useClient, useClientState } from '../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { REFUSE_BELOW } from '../fixture';
import { CardWho, Marked, RepChip, shellOf, Who } from './parts';
import { bindsWords, lawUp, monthsWords, nameOf, stakesWords, statusWords, titleWords } from './words';

/*
 * GRAFT TARGET: new apps/web/src/phone/hub/politics/Deals.tsx (WS7 path; S3-C17, S3-C18).
 *   P1 · the composer: DealComposerSheet (variant A) or DealComposerInline (variant B); one goes after Heiko's pick.
 *   P2 · the incoming card: IncomingDeal, in the pair's whisper thread (DealsInThread) and behind the agenda's door.
 *   P3 · My cards: MyDeals, one section of the Talk desk.
 * Reads only the contract on trunk: me.deals (MyDealsView), PlayerView.reputation, politics.candidates/proposal/council.
 * Sends only offerDeal, withdrawDeal, answerDeal. A refusal arrives as the server's toast (RuleError's words).
 */

// ---- The composer's draft ----------------------------------------------------------------------------------------

export type DraftKind = 'pact' | 'vote';
/** A choice on a ballot: `gov:<candidate>` or `law:yes` / `law:no`. */
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

const open = (c: DealCard) => c.status === 'offered' || c.status === 'active';
const between = (c: DealCard, a: string, b: string) => (c.from === a && c.to === b) || (c.from === b && c.to === a);
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
  /** The law proposed, on its own line: the words that matter most must never be cut. */
  sub?: string;
  choices: Choice[];
  no?: string;
}

/** The ballots a vote card can bind, as this phone can tell them: the next Governor election and the next law vote. */
function ballotsFor(view: MuleView, me: MyView, to: string): BallotChoices[] {
  const p = view.politics!;
  const cards = me.deals?.cards ?? [];
  // S3-RULE-2 row 13: my own open vote card on that ballot with another choice.
  const promisedOn = (key: 'gov' | 'law') => cards.find((c) => c.from === me.id && open(c) && choiceOf(c)?.startsWith(`${key}:`));
  const taken = (key: 'gov' | 'law', id: string) => {
    const c = promisedOn(key);
    return c && choiceOf(c) !== id ? 'You already promised your vote on this ballot' : undefined;
  };
  const running = (p.election && p.election.stage !== 'over' ? p.election.candidates.governor : p.candidates.governor) ?? [];
  const month = p.election && p.election.stage !== 'over' ? view.month : p.next;
  const gov: BallotChoices =
    month === null
      ? { key: 'gov', title: 'Governor', choices: [], no: 'No election is left this game' }
      : {
          key: 'gov',
          title: `Governor · month ${month}`,
          choices: running
            .filter((id) => id !== me.id)
            .map((id) => ({ id: `gov:${id}`, label: <Who view={view} id={id} me={me.id} size={14} rep />, ...(taken('gov', `gov:${id}`) ? { no: taken('gov', `gov:${id}`)! } : {}) })),
          ...(running.filter((id) => id !== me.id).length === 0 ? { no: 'Nobody is running for Governor yet' } : {}),
        };
  const law = lawUp(view);
  const lawBallot: BallotChoices = law
    ? {
        key: 'law',
        title: `Law vote · month ${law.month}`,
        sub: law.words,
        choices: (['yes', 'no'] as const).map((y) => ({ id: `law:${y}`, label: y === 'yes' ? 'Yes' : 'No', ...(taken('law', `law:${y}`) ? { no: taken('law', `law:${y}`)! } : {}) })),
      }
    : { key: 'law', title: 'Law vote', choices: [], no: 'No law is up for a vote' };
  void to;
  return [gov, lawBallot];
}

/** The composer's state and its send, shared by both variants. Closes itself once the server lists the new card. */
function useComposer(to: string, kind: DraftKind | undefined, onSent: () => void) {
  const { view, me } = usePhoneGame();
  const client = useClient();
  const { toasts } = useClientState();
  const [draft, setDraft] = useState<Draft>({ kind: kind ?? 'pact', months: 3, choice: null });
  const before = useRef<Set<string> | null>(null);
  const cards = me.deals?.cards ?? [];
  const offersLeft = me.deals?.offersLeft ?? 0;
  const pactMonths = me.deals?.pactMonths ?? [1, 3, 6];
  const other = view.players.find((p) => p.id === to)!;
  const myRep = view.players.find((p) => p.id === me.id)?.reputation ?? 50;
  const pactNo = cards.some((c) => c.terms.kind === 'pact' && open(c) && between(c, me.id, to)) ? `You already have a pact with ${other.name}` : undefined;
  const offer = toOffer(to, draft);
  // The refusal on screen: the server's words for this phone's last intent (S3-HC-7).
  const refusal = toasts.at(-1) ?? null;
  const blocked = offersLeft <= 0 ? `You have ${cards.filter((c) => c.from === me.id && c.status === 'offered').length} cards waiting for an answer` : draft.kind === 'pact' ? pactNo : undefined;
  const landed = cards.find((c) => c.from === me.id && c.to === to && c.status === 'offered' && before.current && !before.current.has(c.id));
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
    ballots: ballotsFor(view, me, to),
    refusal,
    blocked,
    // S3-RULE-9 row 1, said before the send: the AI seat will decline. Still sendable: the seat's answer is the rule.
    aiWarning: other.isAi && myRep < REFUSE_BELOW ? `${other.name} turns down cards from a name under ${REFUSE_BELOW}. Yours is ${myRep}.` : null,
    stakes: offer ? stakesWords(view, { from: me.id, to, terms: offer.terms }, me.id) : null,
    canSend: !!offer && !blocked,
    send() {
      if (!offer) return;
      before.current = new Set(cards.map((c) => c.id));
      if (refusal) client.dismiss(refusal.id);
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
                {b.sub && <span className="block font-normal text-ink" data-testid={`${testid}-ballot-${b.key}-sub`}>{b.sub}</span>}
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

/** The stakes, the AI's warning, the server's refusal: under the fields in both variants. */
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

/**
 * P1 · variant A, the sheet: "+ Deal" covers the whole rail (header to Ready) with the composer, so the choice and the
 * send fit the rail at 667×375 without a scroll. Over the rail only: the map and the stage stay in view.
 */
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
 * A sheet over the whole rail, header to Ready, at the rail's width: the composer (A) and an offered card opened from
 * the agenda. Its buttons sit in its footer, under the thumb and clear of the rail's top corner.
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

/**
 * P2 from the agenda (team-lead's F-9 decision, 7 Nov): "1 deal offer" opens the card in the same sheet as the composer,
 * so its label, terms and Accept / Decline are on screen together on the smallest phone. The card stays in the thread.
 * The sheet closes itself once the card is answered (or withdrawn, or expired).
 */
export function IncomingDealSheet({ id, onClose, anchor }: { id: string; onClose: () => void; anchor: Element | null }) {
  const { view, me } = usePhoneGame();
  const c = (me.deals?.cards ?? []).find((x) => x.id === id && x.status === 'offered' && x.to === me.id);
  useEffect(() => {
    if (!c) onClose();
  }, [c, onClose]);
  if (!c) return null;
  return (
    <RailSheet
      label={`Deal offer from ${nameOf(view, c.from, me.id)}`}
      testid="incoming-sheet"
      anchor={anchor}
      onClose={onClose}
      closeWord={`Answer later, in the whisper`}
      title={
        <>
          <span className="label-caps text-[10px]!">Deal offer</span>
          <span className="shrink-0 whitespace-nowrap">
            <OnlyYou />
          </span>
        </>
      }
    >
      <IncomingDeal c={c} testid={`sheet-card-${c.id}`} pair={false} />
    </RailSheet>
  );
}

/**
 * P1 · variant B, the card inline: "+ Deal" turns the whisper's input into a draft of the card itself, at the foot of
 * the thread, dashed until it is sent. What you build is what the other player receives; it scrolls with the rail.
 */
export function DealComposerInline({ to, kind, onClose }: { to: string; kind?: DraftKind | undefined; onClose: () => void }) {
  const c = useComposer(to, kind, onClose);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: 'nearest' }), []);
  return (
    <section ref={ref} className="flex shrink-0 flex-col gap-1.5 rounded-panel border-2 border-dashed border-holo bg-holo-soft p-2" aria-label={`Draft deal card for ${c.other.name}`} data-testid="composer-b">
      <span className="flex items-center gap-1">
        <span className="label-caps text-[10px]!">Draft · card for</span>
        <CardWho view={c.view} id={to} size={14} rep />
      </span>
      <ComposerFields c={c} testid="composer-b" />
      <ComposerNotes c={c} testid="composer-b" />
      <span className="grid grid-cols-[auto_1fr] gap-1.5">
        <Button size="md" variant="ghost" onClick={onClose} data-testid="composer-b-cancel">
          Cancel
        </Button>
        <Button size="md" disabled={!c.canSend} onClick={c.send} data-testid="composer-b-send">
          Offer to {c.other.name}
        </Button>
      </span>
      <span className="text-[10px] text-ink-3" data-testid="composer-b-expiry">
        {c.other.name} answers before planning ends, or it expires.
      </span>
    </section>
  );
}

// ---- P2 · a card as its two players see it ------------------------------------------------------------------------

/** A card's face: who, what it binds, both names with their reputation, what it risks. Children: its buttons. */
function DealFace({ c, tone = 'solid', expiry = false, pair = true, testid, children }: { c: DealCard; tone?: 'solid' | 'quiet'; expiry?: boolean; pair?: boolean; testid: string; children?: ReactNode }) {
  const { view, me } = usePhoneGame();
  return (
    <section className={cx('flex shrink-0 flex-col gap-1 rounded-panel border-2 p-2', tone === 'solid' ? 'border-holo bg-holo-soft' : 'border-holo-line bg-panel')} data-testid={testid} data-status={c.status}>
      <span className="flex items-center justify-between gap-1">
        <span className="label-caps truncate text-[10px]!" data-testid={`${testid}-label`}>
          <Marked text={`Card ${c.from === me.id ? `to ${nameOf(view, c.to, me.id)}` : `from ${nameOf(view, c.from, me.id)}`}`} view={view} />
        </span>
        {/* In the rail sheet its header says Only you, and the label keeps the room. */}
        {pair && (
          <span className="shrink-0 whitespace-nowrap">
            <OnlyYou text="You two" />
          </span>
        )}
      </span>
      <span className="font-display text-base font-semibold leading-tight" data-testid={`${testid}-title`}>
        <Marked text={titleWords(view, c, me.id)} view={view} />
      </span>
      <span className="text-xs leading-snug" data-testid={`${testid}-binds`}>
        <Marked text={bindsWords(view, c, me.id)} view={view} />
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" data-testid={`${testid}-names`}>
        <CardWho view={view} id={c.from} me={me.id} size={14} rep open testid={`${testid}-from`} />
        <CardWho view={view} id={c.to} me={me.id} size={14} rep open testid={`${testid}-to`} />
      </span>
      <span className="text-[11px] leading-snug text-ink-2" data-testid={`${testid}-stakes`}>
        <Marked text={stakesWords(view, c, me.id)} view={view} />
        {expiry && <> Unanswered, it expires when planning ends.</>}
      </span>
      {children}
    </section>
  );
}

/** P2: a card offered to me, with Accept and Decline, one tap each. */
export function IncomingDeal({ c, testid = `incoming-${c.id}`, pair = true }: { c: DealCard; testid?: string; pair?: boolean }) {
  const client = useClient();
  const { view, me } = usePhoneGame();
  return (
    <DealFace c={c} expiry pair={pair} testid={testid}>
      <span className="grid grid-cols-2 gap-1.5">
        <Button size="md" onClick={() => client.intent({ type: 'answerDeal', id: c.id, accept: true })} data-testid={`${testid}-accept`}>
          Accept
        </Button>
        <Button size="md" variant="outline" onClick={() => client.intent({ type: 'answerDeal', id: c.id, accept: false })} data-testid={`${testid}-decline`}>
          Decline
        </Button>
      </span>
      <span className="sr-only">{statusWords(view, c, me.id)}</span>
    </DealFace>
  );
}

/** My card, sent and not yet answered: "Waiting for Brix" and Withdraw. */
export function OutgoingDeal({ c }: { c: DealCard }) {
  const client = useClient();
  const { view, me } = usePhoneGame();
  return (
    <DealFace c={c} tone="quiet" testid={`outgoing-${c.id}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-holo" data-testid={`outgoing-${c.id}-waiting`}>
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-holo" />
          <Marked text={statusWords(view, c, me.id)} view={view} />
        </span>
        <Button size="md" variant="ghost" className="-mr-2" onClick={() => client.intent({ type: 'withdrawDeal', id: c.id })} data-testid={`outgoing-${c.id}-withdraw`}>
          Withdraw
        </Button>
      </span>
    </DealFace>
  );
}

const MARK: Record<DealCard['status'], string> = { offered: '…', active: '✓', kept: '✓', broken: '✗', declined: '–', withdrawn: '–', expired: '–' };
const TONE: Record<DealCard['status'], string> = { offered: 'text-holo', active: 'text-ok', kept: 'text-ok', broken: 'text-alert', declined: 'text-ink-3', withdrawn: 'text-ink-3', expired: 'text-ink-3' };

/** One line for a card that has been answered: its title and where it stands. The mark and the words carry it, not colour. */
export function DealLine({ c, testid }: { c: DealCard; testid?: string }) {
  const { view, me } = usePhoneGame();
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-xs" data-testid={testid ?? `deal-line-${c.id}`} data-status={c.status}>
      <span aria-hidden className={cx('w-3 shrink-0 text-center font-mono font-bold', TONE[c.status])}>
        {MARK[c.status]}
      </span>
      <span className="min-w-0">
        <strong className="font-semibold">
          <Marked text={titleWords(view, c, me.id)} view={view} />
        </strong>
        <span className="text-ink-2">
          {' '}
          · <Marked text={statusWords(view, c, me.id)} view={view} />
        </span>
      </span>
    </span>
  );
}

/**
 * The cards in a whisper thread with `other`, at its foot (a card has no time of its own to sit between the lines,
 * finding F-5): the open ones as cards, this month's answered ones as a line each.
 */
export function DealsInThread({ other }: { other: string }) {
  const { view, me } = usePhoneGame();
  const cards = (me.deals?.cards ?? []).filter((c) => between(c, me.id, other));
  const offered = cards.filter((c) => c.status === 'offered');
  const recent = cards.filter((c) => c.status !== 'offered' && (c.settled === view.month || (c.status === 'active' && c.offered === view.month)));
  if (offered.length === 0 && recent.length === 0) return null;
  return (
    <li className="flex flex-col gap-1.5" data-testid={`thread-deals-${other}`}>
      {recent.map((c) => (
        <DealLine key={c.id} c={c} testid={`thread-line-${c.id}`} />
      ))}
      {offered.map((c) => (c.from === me.id ? <OutgoingDeal key={c.id} c={c} /> : <IncomingDeal key={c.id} c={c} />))}
    </li>
  );
}

// ---- P3 · My cards -------------------------------------------------------------------------------------------------

function Group({ title, count, testid, children }: { title: ReactNode; count: number; testid: string; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="flex flex-col gap-1" data-testid={testid}>
      <h3 className="label-caps flex items-center gap-1.5 text-[10px]! @min-[1100px]/shell:text-xs!">
        {title} <span className="font-mono text-ink-3">{count}</span>
      </h3>
      {children}
    </section>
  );
}

/** A card in My cards that is not waiting on anyone: with whom, what it binds and until when, or how it ended. */
function MyDealRow({ c }: { c: DealCard }) {
  const { view, me } = usePhoneGame();
  const other = c.from === me.id ? c.to : c.from;
  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-holo-faint bg-panel px-2 py-1" data-testid={`my-deal-${c.id}`} data-status={c.status}>
      <span className="flex items-center justify-between gap-1.5">
        <DealLine c={c} testid={`my-deal-${c.id}-line`} />
      </span>
      <span className="flex flex-wrap items-center gap-x-1.5 pl-[18px] text-[11px] text-ink-2">
        with <CardWho view={view} id={other} me={me.id} size={12} rep open testid={`my-deal-${c.id}-with`} />
        {c.status === 'active' && (
          <span data-testid={`my-deal-${c.id}-binds`}>
            · <Marked text={bindsWords(view, c, me.id)} view={view} />
          </span>
        )}
        {c.settled !== null && <span className="font-mono text-[10px] text-ink-3">· month {c.settled}</span>}
      </span>
    </div>
  );
}

/** P3: every card of mine, by where it stands. One section of the Talk desk (P0: no new tab). */
export function MyDeals() {
  const { me } = usePhoneGame();
  const cards = me.deals?.cards ?? [];
  const incoming = cards.filter((c) => c.status === 'offered' && c.to === me.id);
  const waiting = cards.filter((c) => c.status === 'offered' && c.from === me.id);
  const active = cards.filter((c) => c.status === 'active');
  const settled = cards.filter((c) => !open(c));
  return (
    <div className="flex flex-col gap-2.5" data-testid="my-deals">
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-2">
        <span className="shrink-0 whitespace-nowrap">
          <OnlyYou />
        </span>
        <span>A card is seen only by its two players, until it is broken: then the whole table sees it.</span>
      </p>
      {cards.length === 0 && (
        <p className="text-sm text-ink-3" data-testid="my-deals-empty">
          No cards yet. Whisper someone and tap + Deal: a pact, or your vote.
        </p>
      )}
      <Group title="For you to answer" count={incoming.length} testid="my-deals-incoming">
        {incoming.map((c) => (
          <IncomingDeal key={c.id} c={c} />
        ))}
      </Group>
      <Group
        title={
          <>
            Waiting for an answer <span className="normal-case tracking-normal text-ink-3">· {me.deals?.offersLeft ?? 0} more you can offer</span>
          </>
        }
        count={waiting.length}
        testid="my-deals-waiting"
      >
        {waiting.map((c) => (
          <OutgoingDeal key={c.id} c={c} />
        ))}
      </Group>
      <Group title="Active" count={active.length} testid="my-deals-active">
        {active.map((c) => (
          <MyDealRow key={c.id} c={c} />
        ))}
      </Group>
      <Group title="Settled" count={settled.length} testid="my-deals-settled">
        {settled.map((c) => (
          <MyDealRow key={c.id} c={c} />
        ))}
      </Group>
    </div>
  );
}

/** Cards offered to me and not answered yet: the agenda's door and the Talk tab's badge count them. */
export const incomingOf = (me: Pick<MyView, 'id' | 'deals'>) => (me.deals?.cards ?? []).filter((c) => c.status === 'offered' && c.to === me.id);

export { RepChip };
