import { LAW_NAME, POLITICS, type LawId } from '@mule/engine';
import type { CouncilView, MuleView, PoliticsView } from '@mule/protocol';
import { Button, cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../../../game/derive';
import { useClient } from '../../../net/react';
import { usePhoneGame } from '../../game';
import { chipWords, forYouWords, LAW_IDS, LAW_MEANING, proposalWords } from './LawPicker';
import { Who } from './parts';
import { listNames, namer } from './words';

/*
 * C46: next month's law ballot on the hub's stage, its reveal, and the laws in force, grafted from the approved
 * ws8-desks mock (c4f4cc42): CouncilBallot, CouncilRail and LawsInForce of its law-desk.tsx.
 */

type Laws = NonNullable<PoliticsView['laws']>;

/** A law in force on its chip: "Land tax 10 cr · since month 3". */
export const inForceWords = (law: LawId, l: { setting: number; since: number }) => `${LAW_NAME[law]} ${chipWords(law, l.setting)} · since month ${l.since}`;

/** The laws in force as a chip strip: on the Council desk, beside the ballot, and along the TV's foot. */
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

/** The month a failed proposal may come back: the engine's retry wait after this one. */
export const backIn = (month: number) => month + POLITICS.council.retryMonths + 1;

/** What follows the score: the law in force from now, or when it may come back. */
export function thenWords(c: CouncilView, passed: boolean, month: number): string {
  return passed ? `${proposalWords(c.proposal)} is in force from now` : `it can come back in month ${backIn(month)}`;
}

/** The ballot's stage body: the proposal and its cost to you, Yes and No, who has voted; then the reveal. */
export function CouncilBallot() {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const c = view.politics!.council!;
  if (c.stage === 'reveal' && c.result) return <PhoneReveal view={view} c={c} result={c.result} />;
  const mine = me.politics?.lawBallot ?? null;
  const weight = view.politics!.weights.find((w) => w.id === self.id)?.votes ?? POLITICS.weight.base;
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
        For you: {forYouWords(c.proposal, c.impact[self.id], view.air.level)}.
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
          const p = view.players.find((q) => q.id === id);
          return p && <PlayerMark key={id} slot={toSlot(p.slot)} species={p.species} size={14} label={p.name} />;
        })}
        · {c.voted.length} of {view.players.length}. Never shown: how.
      </span>
      {c.waitingFor.length > 0 && c.done.includes(self.id) && (
        <span className="text-[11px] text-ink-2" data-testid="ballot-waiting">
          Waiting for {c.waitingFor.length}: {listNames(c.waitingFor, self.id, namer(view))}. Change your vote until the last one is in.
        </span>
      )}
    </section>
  );
}

/** The result on the phone, as on the TV: the stamp and the totals only (RULE-47). */
function PhoneReveal({ view, c, result: r }: { view: MuleView; c: CouncilView; result: NonNullable<CouncilView['result']> }) {
  const score = r.tie ? `${r.yes} to ${r.no} · the Governor’s vote decides · ` : `${r.passed ? 'Passed' : 'Failed'} ${r.passed ? r.yes : r.no} to ${r.passed ? r.no : r.yes} · `;
  return (
    <section className={cx('flex flex-col items-start gap-2 rounded-panel border-2 bg-panel p-3', r.passed ? 'border-ok' : 'border-alert')} data-testid="phone-reveal" data-passed={r.passed}>
      <span className="label-caps text-[10px]!">The law vote · month {view.month}</span>
      <span className="text-sm">{proposalWords(c.proposal)}</span>
      <span className={cx('rounded-control border-2 px-3 font-display text-3xl font-bold uppercase tracking-wider', r.passed ? 'border-ok text-ok' : 'border-alert text-alert')} data-testid="phone-stamp">
        {r.passed ? 'Passed' : 'Failed'}
      </span>
      <span className="text-sm font-semibold" data-testid="phone-reveal-line">
        {score}
        {thenWords(c, r.passed, view.month)}
      </span>
      <span className="text-[11px] text-ink-2">Totals only: nobody sees how anyone voted.</span>
    </section>
  );
}

/** The rail beside the ballot: the laws in force, so a voter sees what a new one joins or replaces. */
export function CouncilRail() {
  const { view } = usePhoneGame();
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2" data-testid="council-rail">
      <LawsInForce laws={view.politics?.laws ?? {}} />
      <span className="text-[11px] text-ink-2">A law passes on more yes than no, by vote weight; a tie goes the Governor’s way. It takes effect once the result is shown.</span>
    </div>
  );
}
