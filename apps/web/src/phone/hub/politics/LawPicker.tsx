import { LAW_NAME, POLITICS, type LawId, type LawImpact, type LawProposal } from '@mule/engine';
import type { PoliticsView } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { toSlot } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { Section } from './parts';

/*
 * C46: next month's law on the Governor's desk, grafted from the approved ws8-desks mock (picker A, c4f4cc42):
 * all four laws as rows, each with its settings as chips; "This replaces:" with three in force; RULE-45's "For each
 * player" before Propose, its figures the server's (MyPoliticsView.candidates); pending, Change and Withdraw.
 */

type Laws = NonNullable<PoliticsView['laws']>;

// --- The law words every phone shares ---------------------------------------------------------------------

export const LAW_IDS = Object.keys(POLITICS.laws) as LawId[];

/** One setting, with its unit: "10 cr a plot", "20%", "air 50". */
export function settingWords(law: LawId, s: number): string {
  switch (law) {
    case 'exportTax':
      return `${s}%`;
    case 'landTax':
      return `${s} cr a plot`;
    case 'pollutionTax':
      return `${s} cr per air point`;
    case 'emissionCap':
      return `air ${s}`;
  }
}

/** The chip's short label: the number and the least of its unit. */
export const chipWords = (law: LawId, s: number) => (law === 'exportTax' ? `${s}%` : law === 'emissionCap' ? `air ${s}` : `${s} cr`);

/** What the law does, in plain words, at no particular setting. */
export const LAW_MEANING: Record<LawId, string> = {
  exportTax: 'A share of every unit a player sells to the export ship goes to the colony fund.',
  landTax: 'Every player pays for each plot they own, at each month end, into the fund.',
  pollutionTax: 'Each player pays for the air their plots fouled that month, at its end.',
  emissionCap: 'No new Rare earth mine or smelter while the air is above the cap.',
};

/** "Land tax 10 cr a plot", "Repeal the Export tax". */
export function proposalWords(p: LawProposal): string {
  if (p.kind === 'repeal') return `Repeal the ${LAW_NAME[p.law]}`;
  return `${LAW_NAME[p.law]} ${settingWords(p.law, p.setting)}${p.replaces ? `, in place of the ${LAW_NAME[p.replaces]}` : ''}`;
}

/** "For you: …": what a proposal would cost or save this player a month, in words; `air` is the colony's air now. */
export function forYouWords(p: LawProposal, i: LawImpact | undefined, air: number): string {
  if (!i) return 'nothing';
  if (p.law === 'emissionCap' && i.capped) {
    const { blocksNow, plots } = i.capped;
    if (p.kind === 'repeal') return plots === 0 ? 'nothing of yours is capped' : `your ${plots} capped plot${plots === 1 ? '' : 's'} could be outfitted again`;
    if (plots === 0) return 'it stops none of your plots';
    return blocksNow ? `it stops new mines on your ${plots} plot${plots === 1 ? '' : 's'} now (air ${air})` : `it stops nothing now (air ${air}); your ${plots} plot${plots === 1 ? '' : 's'} later`;
  }
  if (i.cost === 0) return 'nothing';
  const per = p.law === 'exportTax' ? ', if you sell to the ship' : ' a month';
  return i.cost > 0 ? `about ${i.cost} cr${per}` : `you save about ${-i.cost} cr${per}`;
}

/** The short figure in the preview list: "70 cr a month", "saves 40 cr", "stops 2 plots now", "nothing". */
export function costChip(p: LawProposal, i: LawImpact | undefined): { text: string; tone: 'cost' | 'save' | 'none' } {
  if (!i) return { text: '·', tone: 'none' };
  if (p.law === 'emissionCap' && i.capped) {
    if (i.capped.plots === 0) return { text: 'none of theirs', tone: 'none' };
    return { text: `${p.kind === 'repeal' ? 'frees' : 'stops'} ${i.capped.plots} plot${i.capped.plots === 1 ? '' : 's'}${i.capped.blocksNow ? ' now' : ' later'}`, tone: p.kind === 'repeal' ? 'save' : i.capped.blocksNow ? 'cost' : 'none' };
  }
  if (i.cost === 0) return { text: 'nothing', tone: 'none' };
  return i.cost > 0 ? { text: `${i.cost} cr a month`, tone: 'cost' } : { text: `saves ${-i.cost} cr`, tone: 'save' };
}

/** RULE-41 row 4, the engine's words (proposeLaw), from the first month the view says the proposal may come back. */
export function retryWords(back: number): string {
  return `That proposal failed in month ${back - POLITICS.council.retryMonths - 1}; it can come back in month ${back}`;
}

/** RULE-41 row 12, as the engine words it (proposeLaw). */
export const REPLACES_WORDS = `${POLITICS.council.maxInForce} laws are in force: pick the one this replaces`;

/** The key of a proposal in MyPoliticsView.candidates. */
export const candidateKey = (p: LawProposal) => (p.kind === 'repeal' ? `repeal:${p.law}` : `${p.law}:${p.setting}`);

/** The month a waiting proposal may come back, while it still waits (RULE-41 row 4); null when it may be made. */
function waitOf(pol: PoliticsView, month: number, kind: LawProposal['kind'], law: LawId): number | null {
  const back = pol.retry?.[`${kind}:${law}`];
  return back !== undefined && month < back ? back : null;
}

// --- Parts --------------------------------------------------------------------------------------------------

/** DS-GAP: @mule/ui has no chip or segmented control; drawn in the hub's tab and tool tokens, as the mock does. */
function Chip({ on, disabled, onClick, children, testid, className }: { on?: boolean; disabled?: boolean; onClick(): void; children: ReactNode; testid: string; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-chip border px-2 font-mono text-[11px] font-bold disabled:pointer-events-none disabled:opacity-40',
        on ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:border-holo',
        className,
      )}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

/** RULE-45's preview: each player's mark, name and monthly cost or saving. */
export function ForEachPlayer({ proposal, impact, me }: { proposal: LawProposal; impact: Record<string, LawImpact>; me: string }) {
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

// --- The desk -----------------------------------------------------------------------------------------------

interface LawPick {
  law: LawId;
  kind: LawProposal['kind'];
  setting: number | null;
}

/** Next month's law, on the Governor's desk under the sales tax; nothing on any other phone. */
export function LawPicker() {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const pol = view.politics;
  const pending = pol?.proposal ?? null;
  const [changing, setChanging] = useState(false);
  if (!pol || pol.governor !== self.id) return null;
  const votesOpen = (!!pol.council && pol.council.stage !== 'over') || (!!pol.election && pol.election.stage !== 'over');
  // While a vote is open its stage holds the phone (the election or the law ballot), so the picker never shows then.
  if (votesOpen) return null;
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
      <PickerA pol={pol} candidates={me.politics?.candidates ?? {}} start={start} onPropose={propose} />
      {changing && pending && (
        <Button size="md" variant="ghost" className="h-8! text-xs" onClick={() => setChanging(false)} data-testid="change-cancel">
          Keep {proposalWords(pending.proposal)}
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

/** MyPoliticsView.candidates: each proposal's cost per player, by candidateKey. */
type Candidates = Record<string, Record<string, LawImpact>>;

/** The picker's end: "This replaces:" when it must, the preview from the server's figures, and Propose. */
function PickerFoot({ laws, candidates, pick, onPropose }: { laws: Laws; candidates: Candidates; pick: LawPick | null; onPropose(p: LawProposal): void }) {
  const { self } = usePhoneGame();
  const [replaces, setReplaces] = useState<LawId | null>(null);
  const full = Object.keys(laws).length >= POLITICS.council.maxInForce;
  const needsReplace = !!pick && pick.kind === 'enact' && !laws[pick.law] && full;
  const proposal = proposalOf(pick, needsReplace ? replaces : null);
  const blocked = needsReplace && !replaces;
  const impact = proposal ? candidates[candidateKey(proposal)] : undefined;
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
      {proposal && !blocked && impact && <ForEachPlayer proposal={proposal} impact={impact} me={self.id} />}
      <Button size="md" variant="holo" className="h-10! text-sm" disabled={!proposal || blocked} onClick={() => proposal && !blocked && onPropose(proposal)} data-testid="propose">
        {proposal && !blocked ? `Propose ${proposalWords(proposal)} for next month’s vote` : 'Propose for next month’s vote'}
      </Button>
    </>
  );
}

/** Picker A: all four laws as rows, each with its settings as a chip group; the setting in force is marked. */
function PickerA({ pol, candidates, start, onPropose }: { pol: PoliticsView; candidates: Candidates; start: LawPick | null; onPropose(p: LawProposal): void }) {
  const { view } = usePhoneGame();
  const laws = pol.laws ?? {};
  const [pick, setPick] = useState<LawPick | null>(start);
  return (
    <div className="flex flex-col gap-1.5" data-testid="picker-a">
      <ul className="flex flex-col gap-1">
        {LAW_IDS.map((law) => {
          const inForce = laws[law];
          const wait = waitOf(pol, view.month, 'enact', law);
          const repealWait = waitOf(pol, view.month, 'repeal', law);
          // RULE-41 row 4 keys a wait by kind: a waiting enact leaves the repeal of a law in force open, so the row stays lit for it.
          const canRepeal = !!inForce && repealWait === null;
          return (
            <li key={law} className={cx('flex flex-col gap-0.5 rounded-control border p-1.5', pick?.law === law ? 'border-holo' : 'border-holo-line', wait !== null && !canRepeal && 'opacity-50')} data-testid={`law-row-${law}`}>
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
                  {retryWords(wait)}
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
                </span>
              )}
              {inForce && (
                <span className="flex flex-wrap items-center gap-1">
                  <Chip on={pick?.law === law && pick.kind === 'repeal'} disabled={repealWait !== null} onClick={() => setPick({ law, kind: 'repeal', setting: null })} testid={`law-repeal-${law}`}>
                    Repeal
                  </Chip>
                  {repealWait !== null && (
                    <span className="text-[11px] font-semibold text-warn" data-testid={`law-repeal-wait-${law}`}>
                      {retryWords(repealWait)}
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <PickerFoot key={pick ? `${pick.law}:${pick.kind}` : 'none'} laws={laws} candidates={candidates} pick={pick} onPropose={onPropose} />
    </div>
  );
}
