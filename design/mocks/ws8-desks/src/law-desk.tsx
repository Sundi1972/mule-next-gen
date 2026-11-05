import { POLITICS, type LawId, type LawProposal } from '@mule/engine';
import type { PoliticsView } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { useState } from 'react';
import { toSlot } from '../../../../apps/web/src/game/derive';
import { useClient } from '../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../apps/web/src/phone/game';
import { CouncilDesk } from '../../../../apps/web/src/phone/hub/politics/Council';
import { GovernorDesk } from '../../../../apps/web/src/phone/hub/politics/Governor';
import { Section, Who } from '../../../../apps/web/src/phone/hub/politics/parts';
import { listNames, namer } from '../../../../apps/web/src/phone/hub/politics/words';
import type { Now } from '../../../../apps/web/src/phone/Shell';
import type { AgendaSlot, HubSeat, ReadyBarWords, StageSlot } from '../../../../apps/web/src/phone/hub/slots';
import { Chip } from './colony-desk';
import { usePreset } from './live';
import { chipWords, costChip, forYouWords, impactOf, inForceWords, LAW_IDS, LAW_MEANING, LAW_NAME, proposalWords, REPLACES_WORDS, retryShort, settingWords, type Impact } from './words';

/*
 * C46, the laws on the phone.
 * GRAFT: apps/web/src/phone/hub/politics/Governor.tsx (WS7) — LawDesk under SalesTax, in WS6's "This month's law" place.
 * GRAFT: apps/web/src/phone/hub/politics/Council.tsx (WS7) — LawsInForce and the pending proposal above CouncilBody.
 * GRAFT: apps/web/src/phone/hub/politics/slots.ts (WS7) — LAW_AGENDA, COUNCIL_STAGE, councilNow, councilReadyWords.
 */

type Laws = NonNullable<PoliticsView['laws']>;
const lawsOf = (p: PoliticsView | null): Laws => p?.laws ?? {};

/** A law waiting to come back (RULE-41 row 4): the month it failed, or null. */
function waitOf(p: PoliticsView, month: number, kind: LawProposal['kind'], law: LawId): number | null {
  const failedIn = p.retry?.[`${kind}:${law}`];
  return failedIn !== undefined && month <= failedIn + POLITICS.council.retryMonths ? failedIn : null;
}

// --- Laws in force: a chip strip, on the phone's Council desk and on the TV -------------------------------

export function LawsInForce({ laws, tv = false }: { laws: Laws; tv?: boolean }) {
  const ids = LAW_IDS.filter((l) => laws[l]);
  return (
    <span className={cx('flex flex-wrap items-center', tv ? 'gap-3' : 'gap-1')} data-testid="laws-in-force">
      <span className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]!')}>Laws in force</span>
      {ids.length === 0 ? (
        <span className={cx('text-ink-3', tv ? 'text-xl' : 'text-[11px]')} data-testid="laws-none">
          none yet
        </span>
      ) : (
        ids.map((l) => (
          <span key={l} className={cx('whitespace-nowrap rounded-chip border border-ok font-mono font-bold text-ok', tv ? 'px-3 py-1 text-xl' : 'px-1.5 text-[10px] leading-5')} data-testid={`law-chip-${l}`}>
            {inForceWords(l, laws[l]!)}
          </span>
        ))
      )}
    </span>
  );
}

// --- RULE-45's preview: each player's mark, name and monthly cost or saving ------------------------------

export function ForEachPlayer({ proposal, impact, me }: { proposal: LawProposal; impact: Record<string, Impact>; me: string }) {
  const { view } = usePhoneGame();
  return (
    <div className="flex flex-col gap-0.5" data-testid="for-each">
      <span className="label-caps text-[10px]!">For each player</span>
      <ul className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5 gap-y-0.5 text-[11px]">
        {view.players.map((p) => {
          const c = costChip(proposal, impact[p.id]);
          return (
            <li key={p.id} className="contents" data-testid={`for-each-${p.id}`}>
              <PlayerMark slot={toSlot(p.slot)} species={p.species} size={14} label={p.name} />
              <span className={cx('truncate', p.id === me && 'font-semibold')}>{p.id === me ? 'You' : p.name}</span>
              <span data-num className={cx('text-right font-mono font-bold', c.tone === 'cost' ? 'text-rise' : c.tone === 'save' ? 'text-fall' : 'text-ink-3')}>
                {c.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- The Governor's desk --------------------------------------------------------------------------------

/** The Governor's desk: the sales tax as today, then next month's law. */
export function GovernorDeskC46() {
  return (
    <>
      <GovernorDesk />
      <LawDesk />
    </>
  );
}

interface LawPick {
  law: LawId;
  kind: LawProposal['kind'];
  setting: number | null;
}

function LawDesk() {
  const { view, self } = usePhoneGame();
  const preset = usePreset();
  const client = useClient();
  const pol = view.politics;
  const pending = pol?.proposal ?? null;
  const [changing, setChanging] = useState(false);
  if (!pol || pol.governor !== self.id) return null;
  const votesOpen = !!pol.council && pol.council.stage !== 'over';
  if (votesOpen) {
    return (
      <Section title="Next month’s law" testid="gov-law">
        <span className="text-[11px] text-ink-2">Propose once the votes are over</span>
      </Section>
    );
  }
  if (pending && !changing) {
    return (
      <Section title="Next month’s vote" testid="gov-law">
        <div className="flex flex-col gap-1.5 rounded-panel border border-holo bg-holo-soft p-2" data-testid="pending">
          <span className="text-sm font-semibold" data-testid="pending-words">
            You propose {proposalWords(pending.proposal)}
          </span>
          <span className="text-[11px] text-ink-2">Everyone sees it and what it costs them. The ballot opens when next month’s planning starts.</span>
          <ForEachPlayer proposal={pending.proposal} impact={pending.impact} me={self.id} />
          <span className="flex gap-1.5">
            <Button size="md" variant="outline" className="h-9! flex-1 text-sm" onClick={() => setChanging(true)} data-testid="pending-change">
              Change
            </Button>
            <Button size="md" variant="ghost" className="h-9! flex-1 text-sm" onClick={() => client.intent({ type: 'propose', proposal: null })} data-testid="pending-withdraw">
              Withdraw
            </Button>
          </span>
        </div>
      </Section>
    );
  }
  const start: LawPick | null = pending ? { law: pending.proposal.law, kind: pending.proposal.kind, setting: pending.proposal.kind === 'enact' ? pending.proposal.setting : null } : null;
  const propose = (p: LawProposal) => {
    client.intent({ type: 'propose', proposal: p });
    setChanging(false);
  };
  return (
    <Section title="Next month’s law" testid="gov-law">
      {(preset.picker ?? 'A') === 'A' ? <PickerA pol={pol} start={start} onPropose={propose} /> : <PickerB pol={pol} start={start} onPropose={propose} />}
      {changing && (
        <Button size="md" variant="ghost" className="h-8! text-xs" onClick={() => setChanging(false)} data-testid="change-cancel">
          Keep {proposalWords(pending!.proposal)}
        </Button>
      )}
    </Section>
  );
}

/** The proposal a pick makes, with what it replaces when three laws are in force. */
function proposalOf(pick: LawPick | null, replaces: LawId | null): LawProposal | null {
  if (!pick) return null;
  if (pick.kind === 'repeal') return { kind: 'repeal', law: pick.law };
  if (pick.setting === null) return null;
  return { kind: 'enact', law: pick.law, setting: pick.setting, ...(replaces ? { replaces } : {}) };
}

/** The end of both pickers: "This replaces:" when it must, the preview, and Propose. */
function PickerFoot({ pol, pick, onPropose }: { pol: PoliticsView; pick: LawPick | null; onPropose(p: LawProposal): void }) {
  const { self } = usePhoneGame();
  const laws = lawsOf(pol);
  const [replaces, setReplaces] = useState<LawId | null>(null);
  const full = Object.keys(laws).length >= POLITICS.council.maxInForce;
  const needsReplace = !!pick && pick.kind === 'enact' && !laws[pick.law] && full;
  const proposal = proposalOf(pick, needsReplace ? replaces : null);
  const blocked = needsReplace && !replaces;
  return (
    <>
      {needsReplace && (
        <div className="flex flex-col gap-1 rounded-control border border-warn/60 p-1.5" data-testid="replaces">
          <span className="text-[11px] font-semibold text-warn">{REPLACES_WORDS}</span>
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-semibold">This replaces:</span>
            {LAW_IDS.filter((l) => laws[l]).map((l) => (
              <Chip key={l} on={replaces === l} onClick={() => setReplaces(l)} testid={`replaces-${l}`}>
                {LAW_NAME[l]} {chipWords(l, laws[l]!.setting)}
              </Chip>
            ))}
          </span>
        </div>
      )}
      {proposal && !blocked && <ForEachPlayer proposal={proposal} impact={impactOf(proposal, laws)} me={self.id} />}
      <Button size="md" variant="holo" className="h-10! text-sm" disabled={!proposal || blocked} onClick={() => proposal && onPropose(proposal)} data-testid="propose">
        {proposal && !blocked ? `Propose ${proposalWords(proposal)} for next month’s vote` : 'Propose for next month’s vote'}
      </Button>
    </>
  );
}

/** A: all four laws as rows, each with its settings as a chip group; the setting in force is marked. */
function PickerA({ pol, start, onPropose }: { pol: PoliticsView; start: LawPick | null; onPropose(p: LawProposal): void }) {
  const { view } = usePhoneGame();
  const laws = lawsOf(pol);
  const [pick, setPick] = useState<LawPick | null>(start);
  return (
    <div className="flex flex-col gap-1.5" data-testid="picker-a">
      <ul className="flex flex-col gap-1">
        {LAW_IDS.map((law) => {
          const inForce = laws[law];
          const wait = waitOf(pol, view.month, 'enact', law);
          const repealWait = waitOf(pol, view.month, 'repeal', law);
          return (
            <li key={law} className={cx('flex flex-col gap-0.5 rounded-control border p-1.5', pick?.law === law ? 'border-holo' : 'border-holo-line', wait !== null && 'opacity-50')} data-testid={`law-row-${law}`}>
              <span className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold">{LAW_NAME[law]}</span>
                {inForce && (
                  <span className="text-[10px] font-semibold text-ok" data-testid={`law-inforce-${law}`}>
                    in force since month {inForce.since}
                  </span>
                )}
              </span>
              <span className="text-[11px] leading-snug text-ink-2">{LAW_MEANING[law]}</span>
              {wait !== null ? (
                <span className="text-[11px] font-semibold text-warn" data-testid={`law-wait-${law}`}>
                  {retryShort(wait)}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-1" role="group" aria-label={`${LAW_NAME[law]} settings`}>
                  {POLITICS.laws[law].settings.map((s) => {
                    const here = inForce?.setting === s;
                    return (
                      <Chip
                        key={s}
                        on={pick?.law === law && pick.kind === 'enact' && pick.setting === s}
                        disabled={here}
                        onClick={() => setPick({ law, kind: 'enact', setting: s })}
                        className={cx(here && 'border-ok text-ok opacity-100!')}
                        testid={`law-${law}-${s}`}
                      >
                        {chipWords(law, s)}
                        {here && ' · in force'}
                      </Chip>
                    );
                  })}
                  {inForce && (
                    <Chip on={pick?.law === law && pick.kind === 'repeal'} disabled={repealWait !== null} onClick={() => setPick({ law, kind: 'repeal', setting: null })} testid={`law-repeal-${law}`}>
                      Repeal
                    </Chip>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <PickerFoot key={pick ? `${pick.law}:${pick.kind}` : 'none'} pol={pol} pick={pick} onPropose={onPropose} />
    </div>
  );
}

/** B: pick a law, then its setting. */
function PickerB({ pol, start, onPropose }: { pol: PoliticsView; start: LawPick | null; onPropose(p: LawProposal): void }) {
  const { view } = usePhoneGame();
  const laws = lawsOf(pol);
  const [law, setLaw] = useState<LawId | null>(start?.law ?? null);
  const [pick, setPick] = useState<LawPick | null>(start);
  if (!law) {
    return (
      <ul className="grid grid-cols-2 gap-1" data-testid="picker-b">
        {LAW_IDS.map((l) => {
          const inForce = laws[l];
          const wait = waitOf(pol, view.month, 'enact', l);
          return (
            <li key={l}>
              <button type="button" disabled={wait !== null} onClick={() => setLaw(l)} className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-control border border-holo-line p-1.5 text-left hover:border-holo disabled:opacity-50" data-testid={`law-pick-${l}`}>
                <span className="text-xs font-semibold">{LAW_NAME[l]}</span>
                <span className={cx('text-[10px] leading-tight', wait !== null ? 'font-semibold text-warn' : inForce ? 'text-ok' : 'text-ink-3')}>
                  {wait !== null ? retryShort(wait) : inForce ? `${chipWords(l, inForce.setting)} · since month ${inForce.since}` : POLITICS.laws[l].settings.map((s) => chipWords(l, s)).join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
  const inForce = laws[law];
  return (
    <div className="flex flex-col gap-1.5" data-testid="picker-b-step2">
      <span className="flex items-baseline gap-2">
        <button
          type="button"
          className="min-h-8 text-[11px] font-semibold text-holo"
          onClick={() => {
            setLaw(null);
            setPick(null);
          }}
          data-testid="picker-b-back"
        >
          ← Laws
        </button>
        <span className="text-sm font-semibold">{LAW_NAME[law]}</span>
        {inForce && <span className="text-[10px] font-semibold text-ok">in force since month {inForce.since}</span>}
      </span>
      <span className="text-[11px] leading-snug text-ink-2">{LAW_MEANING[law]}</span>
      <span className="grid grid-cols-3 gap-1" role="group" aria-label={`${LAW_NAME[law]} settings`}>
        {POLITICS.laws[law].settings.map((s) => {
          const here = inForce?.setting === s;
          return (
            <Chip key={s} on={pick?.kind === 'enact' && pick.setting === s} disabled={here} onClick={() => setPick({ law, kind: 'enact', setting: s })} className={cx('min-h-10 text-xs', here && 'border-ok text-ok opacity-100!')} testid={`law-${law}-${s}`}>
              {settingWords(law, s)}
              {here && ' · in force'}
            </Chip>
          );
        })}
      </span>
      {inForce && (
        <Chip on={pick?.kind === 'repeal'} onClick={() => setPick({ law, kind: 'repeal', setting: null })} testid={`law-repeal-${law}`}>
          Repeal the {LAW_NAME[law]}
        </Chip>
      )}
      <PickerFoot key={pick ? `${pick.law}:${pick.kind}` : 'none'} pol={pol} pick={pick} onPropose={onPropose} />
    </div>
  );
}

// --- The Council desk -----------------------------------------------------------------------------------

/** Laws in force and next month's vote, above WS7's desk as it is. */
export function CouncilDeskC46() {
  const { view, self } = usePhoneGame();
  const pol = view.politics;
  const pending = pol?.proposal;
  return (
    <>
      {pol && <LawsInForce laws={lawsOf(pol)} />}
      {pending && (
        <div className="flex flex-col gap-0.5 rounded-panel border border-holo-line bg-panel p-2" data-testid="council-pending">
          <span className="label-caps text-[10px]!">Next month’s vote</span>
          <span className="text-xs">
            <Who view={view} id={pending.by} me={self.id} size={12} /> {pending.by === self.id ? 'propose' : 'proposes'} <strong>{proposalWords(pending.proposal)}</strong>
          </span>
          <span className="text-[11px] text-ink-2" data-testid="council-pending-for-you">
            For you: {forYouWords(pending.proposal, pending.impact[self.id])}.
          </span>
        </div>
      )}
      <CouncilDesk />
    </>
  );
}

// --- Every phone's agenda, while a proposal is pending ----------------------------------------------------

const pendingOf = ({ view }: HubSeat) => (view.politics?.council && view.politics.council.stage !== 'over' ? null : (view.politics?.proposal ?? null));

export const LAW_AGENDA: AgendaSlot = {
  key: 'law',
  title: () => 'Next month’s vote',
  sub: (seat) => {
    const p = pendingOf(seat)!;
    const who = p.by === seat.self.id ? 'You propose' : `${namer(seat.view)(p.by)} proposes`;
    return `${who} ${proposalWords(p.proposal)}. For you: ${forYouWords(p.proposal, p.impact[seat.self.id])}.`;
  },
  opens: { desk: 'council' },
  show: (seat) => pendingOf(seat) !== null,
};

/** WS7's Governor door, its words widened to the law. */
export const GOVERNOR_AGENDA_C46: AgendaSlot = { key: 'governor', title: () => 'Governor’s desk', sub: () => 'Set the sales tax · propose a law', opens: { desk: 'governor' } };

// --- The ballot: it takes the hub's stage the way the election does -----------------------------------------

const councilOpen = ({ view }: HubSeat) => {
  const s = view.politics?.council?.stage;
  return s === 'ballot' || s === 'reveal';
};

function CouncilBallot() {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const pol = view.politics!;
  const c = pol.council!;
  const mine = me.politics?.lawBallot ?? null;
  const weight = pol.weights.find((w) => w.id === self.id)?.votes ?? 1;
  const impact = c.impact[self.id] ?? impactOf(c.proposal, lawsOf(pol))[self.id];
  const name = namer(view);
  if (c.stage === 'reveal' && c.result) {
    const r = c.result;
    return (
      <section className={cx('flex flex-col items-start gap-2 rounded-panel border-2 bg-panel p-3', r.passed ? 'border-ok' : 'border-alert')} data-testid="phone-reveal" data-passed={r.passed}>
        <span className="label-caps text-[10px]!">The law vote · month {view.month}</span>
        <span className="text-sm">{proposalWords(c.proposal)}</span>
        <span className={cx('rounded-control border-2 px-3 font-display text-3xl font-bold uppercase tracking-wider', r.passed ? 'border-ok text-ok' : 'border-alert text-alert')} data-testid="phone-stamp">
          {r.passed ? 'Passed' : 'Failed'}
        </span>
        <span className="text-sm font-semibold" data-testid="phone-reveal-line">
          {r.tie ? `${r.yes} to ${r.no} · the Governor’s vote decides · ` : `${r.passed ? 'Passed' : 'Failed'} ${r.passed ? r.yes : r.no} to ${r.passed ? r.no : r.yes} · `}
          {r.passed ? `${proposalWords(c.proposal)} is in force from now` : `it can come back in month ${view.month + POLITICS.council.retryMonths + 1}`}
        </span>
        <span className="text-[11px] text-ink-2">Totals only: nobody sees how anyone voted.</span>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2 rounded-panel border-2 border-holo bg-panel p-3" data-testid="phone-ballot">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps text-[10px]!">The law vote · month {view.month}</span>
        <span className="text-[11px] text-ink-2" data-testid="ballot-weight">
          Your vote weighs <strong className="text-ink">{weight}</strong>
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-xs">
          <Who view={view} id={c.proposer} me={self.id} size={14} /> {c.proposer === self.id ? 'propose' : 'proposes'}
        </span>
        <span className="font-display text-xl font-semibold leading-tight" data-testid="ballot-proposal">
          {proposalWords(c.proposal)}
        </span>
        <span className="text-[11px] leading-snug text-ink-2">{LAW_MEANING[c.proposal.law]}</span>
      </span>
      <span className="text-sm font-semibold" data-testid="ballot-for-you">
        For you: {forYouWords(c.proposal, impact)}.
      </span>
      <span className="grid grid-cols-2 gap-2">
        <Button size="md" variant={mine === true ? 'holo' : 'outline'} aria-pressed={mine === true} onClick={() => client.intent({ type: 'voteLaw', yes: true })} data-testid="ballot-yes">
          Yes
        </Button>
        <Button size="md" variant={mine === false ? 'holo' : 'outline'} aria-pressed={mine === false} onClick={() => client.intent({ type: 'voteLaw', yes: false })} data-testid="ballot-no">
          No
        </Button>
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2" data-testid="ballot-voted">
        Voted:
        {c.voted.map((id) => {
          const p = view.players.find((q) => q.id === id)!;
          return <PlayerMark key={id} slot={toSlot(p.slot)} species={p.species} size={14} label={p.name} />;
        })}
        · {c.voted.length} of {view.players.length}. Never shown: how.
      </span>
      {c.waitingFor.length > 0 && c.done.includes(self.id) && (
        <span className="text-[11px] text-ink-2" data-testid="ballot-waiting">
          Waiting for {c.waitingFor.length}: {listNames(c.waitingFor, self.id, name)}. Change your vote until the last one is in.
        </span>
      )}
    </section>
  );
}

/** The rail beside the ballot: the laws in force, so a voter sees what a new one joins or replaces. */
function CouncilRail() {
  const { view } = usePhoneGame();
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2" data-testid="council-rail">
      <LawsInForce laws={lawsOf(view.politics)} />
      <span className="text-[11px] text-ink-2">A law passes on more yes than no, by vote weight; a tie goes the Governor’s way. It takes effect once the result is shown.</span>
    </div>
  );
}

export const COUNCIL_STAGE: StageSlot = { id: 'council-ballot', show: councilOpen, phase: () => 'Law vote', Body: CouncilBallot, Rail: CouncilRail };

const BALLOT_WORDS: ReadyBarWords = {
  ready: 'Done',
  done: 'You voted',
  waiting: 'Still waiting for',
  all: 'Everyone has voted. The result is shown.',
  confirm: (names, n) => `Close the vote now? ${n === 1 ? `${names}’s vote` : `The votes of ${names}`} won’t count, and the result is shown.`,
  label: 'VOTED',
};

export function councilReadyWords({ view, me }: HubSeat): ReadyBarWords | null {
  const c = view.politics?.council;
  if (!c || c.stage !== 'ballot') return null;
  return { ...BALLOT_WORDS, canReady: (me.politics?.lawBallot ?? null) !== null };
}

export function councilNow({ view, self }: HubSeat): Now | null {
  const c = view.politics?.council;
  if (!c || c.stage === 'over') return null;
  if (c.stage === 'reveal') return { step: 2, of: 2, title: 'The result', detail: 'On the TV and every phone at once.' };
  const left = c.waitingFor.filter((id) => id !== self.id);
  if (c.done.includes(self.id))
    return { step: 1, of: 2, title: left.length ? `You voted. Waiting for ${left.length}: ${listNames(left, null, namer(view))}` : 'Everyone has voted', detail: 'Change your vote until the last one is in, or until the host closes the vote for someone who is away.' };
  return { step: 1, of: 2, title: 'Vote on the law', detail: 'Yes or No, then Done. Nobody sees how you voted. No clock: it closes once everyone is Done.' };
}
