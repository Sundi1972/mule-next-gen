import { POLITICS, type DealCard, type DealOffer } from '@mule/engine';
import type { MuleView, MyView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useClient, useClientState } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { OnlyYou } from '../OnlyYou';
import { SeatWords } from '../../../components/SeatWords';
import { bindsWords, lawUp, monthsWords, nameOf, plain, stakesWords, statusWords, titleWords, who, whoOf, type Said } from './deals-words';
import { CardWho, shellOf, Who } from './parts';

/**
 * Deal cards on the phone (S3-C17, S3-C18): the composer over the rail, a card offered to me (in its whisper thread
 * and behind the agenda's door), and My cards, one section of the Talk desk. Reads me.deals and the public politics view;
 * sends only offerDeal, withdrawDeal and answerDeal, and shows a refusal as the server words it.
 */

/** A card's words, with each computer seat they name marked by SeatWords. */
function Words({ said, view }: { said: Said; view: Pick<MuleView, 'players'> }) {
  return <SeatWords text={plain(said)} who={whoOf(said, view.players)} players={view.players} />;
}

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
    stakes: offer ? plain(stakesWords(view, { from: me.id, to, terms: offer.terms }, me.id)) : null,
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

/**
 * A card offered to me, opened from the agenda in the composer's sheet, so its label, terms and Accept / Decline fit
 * the smallest phone together. Closes itself once the card is no longer offered.
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
      closeWord="Answer later, in the whisper"
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

/** A card's face: who, what it binds, both names with their reputation, what it risks. Children: its buttons. */
function DealFace({ c, tone = 'solid', expiry = false, pair = true, testid, children }: { c: DealCard; tone?: 'solid' | 'quiet'; expiry?: boolean; pair?: boolean; testid: string; children?: ReactNode }) {
  const { view, me } = usePhoneGame();
  return (
    <section className={cx('flex shrink-0 flex-col gap-1 rounded-panel border-2 p-2', tone === 'solid' ? 'border-holo bg-holo-soft' : 'border-holo-line bg-panel')} data-testid={testid} data-status={c.status}>
      <span className="flex items-center justify-between gap-1">
        <span className="label-caps truncate text-[10px]!" data-testid={`${testid}-label`}>
          <Words said={c.from === me.id ? ['Card to ', who(view, c.to, me.id)] : ['Card from ', who(view, c.from, me.id)]} view={view} />
        </span>
        {/* In the rail sheet its header says Only you, and the label keeps the room. */}
        {pair && (
          <span className="shrink-0 whitespace-nowrap">
            <OnlyYou text="You two" />
          </span>
        )}
      </span>
      <span className="font-display text-base font-semibold leading-tight" data-testid={`${testid}-title`}>
        <Words said={titleWords(view, c, me.id)} view={view} />
      </span>
      <span className="text-xs leading-snug" data-testid={`${testid}-binds`}>
        <Words said={bindsWords(view, c, me.id)} view={view} />
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" data-testid={`${testid}-names`}>
        <CardWho view={view} id={c.from} me={me.id} size={14} rep open testid={`${testid}-from`} />
        <CardWho view={view} id={c.to} me={me.id} size={14} rep open testid={`${testid}-to`} />
      </span>
      <span className="text-[11px] leading-snug text-ink-2" data-testid={`${testid}-stakes`}>
        <Words said={stakesWords(view, c, me.id)} view={view} />
        {expiry && <> Unanswered, it expires when planning ends.</>}
      </span>
      {children}
    </section>
  );
}

/** A card offered to me, with Accept and Decline, one tap each. */
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
      <span className="sr-only">{plain(statusWords(view, c, me.id))}</span>
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
          <Words said={statusWords(view, c, me.id)} view={view} />
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

/** One line for an answered card: its title and where it stands. The mark and the words carry it, not colour. */
export function DealLine({ c, testid }: { c: DealCard; testid?: string }) {
  const { view, me } = usePhoneGame();
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-xs" data-testid={testid ?? `deal-line-${c.id}`} data-status={c.status}>
      <span aria-hidden className={cx('w-3 shrink-0 text-center font-mono font-bold', TONE[c.status])}>
        {MARK[c.status]}
      </span>
      <span className="min-w-0">
        <strong className="font-semibold">
          <Words said={titleWords(view, c, me.id)} view={view} />
        </strong>
        <span className="text-ink-2">
          {' '}
          · <Words said={statusWords(view, c, me.id)} view={view} />
        </span>
      </span>
    </span>
  );
}

/**
 * The cards in a whisper thread with `other`, at its foot (a card carries months, not a time, so it cannot sit
 * between the lines): the offered ones as cards, this month's answered ones as a line each.
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

/** A card in My cards that waits on nobody: with whom, what it binds and until when, or how it ended. */
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
            · <Words said={bindsWords(view, c, me.id)} view={view} />
          </span>
        )}
        {c.settled !== null && <span className="font-mono text-[10px] text-ink-3">· month {c.settled}</span>}
      </span>
    </div>
  );
}

/** Every card of mine, by what I must do: answer, waiting, active, settled. One section of the Talk desk. */
export function MyDeals() {
  const { me } = usePhoneGame();
  const cards = me.deals?.cards ?? [];
  const incoming = cards.filter((c) => c.status === 'offered' && c.to === me.id);
  const waiting = cards.filter((c) => c.status === 'offered' && c.from === me.id);
  const active = cards.filter((c) => c.status === 'active');
  const settled = cards.filter((c) => !isOpen(c));
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
