// Copied from design/mocks/politics-deals/src/proposed/LawBallot.tsx (approved/awaiting-pick mock, 7–8 Nov); changes for the tabs are marked TABS:.
import { POLITICS } from '@mule/engine';
import { Button, cx, PlayerMark } from '@mule/ui';
import { useState } from 'react';
import { toSlot } from '../../../../../../apps/web/src/game/derive';
import { useClient } from '../../../../../../apps/web/src/net/react';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { CouncilBallot } from '../../../../../../apps/web/src/phone/hub/politics/LawBallot';
import { forYouWords, LAW_MEANING, proposalWords } from '../../../../../../apps/web/src/phone/hub/politics/LawPicker';
import { Who } from '../../../../../../apps/web/src/phone/hub/politics/parts';
import { YouPromised } from './ElectionDay';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/politics/LawBallot.tsx::CouncilBallot (WS7 path; S3-C21). As today, with one
 * change, marked CHANGE: with a promised law vote (MyPoliticsView.promised.law) the ballot says to whom, tags the
 * promised answer, and starts with it picked on this phone only (no voteLaw until the player taps or casts; F-4).
 * Without a promise it is today's CouncilBallot, untouched.
 */

export function PromisedCouncilBallot() {
  const { view, self, me } = usePhoneGame();
  const client = useClient();
  const promised = me.politics?.promised?.law ?? null;
  const [local, setLocal] = useState<boolean | null>(null);
  const c = view.politics?.council;
  if (!promised || !c || c.stage !== 'ballot') return <CouncilBallot />;
  const server = me.politics?.lawBallot ?? null;
  const mine = local ?? server ?? promised.yes;
  const weight = view.politics!.weights.find((w) => w.id === self.id)?.votes ?? POLITICS.weight.base;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const vote = (yes: boolean) => {
    setLocal(yes);
    client.intent({ type: 'voteLaw', yes });
  };
  const answer = (yes: boolean) => (
    <Button size="md" variant={mine === yes ? 'holo' : 'outline'} aria-pressed={mine === yes} onClick={() => vote(yes)} data-testid={`ballot-${yes ? 'yes' : 'no'}`}>
      {yes ? 'Yes' : 'No'}
      {promised.yes === yes && <span className={cx('ml-1.5 rounded-chip border px-1 font-mono text-[10px] font-bold', mine === yes ? 'border-on-holo' : 'border-holo text-holo')}>PROMISED</span>}
    </Button>
  );
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
      {/* CHANGE: the promise, before the answers. */}
      <YouPromised words={`You promised ${promised.to.map(name).join(' and ')} a ${promised.yes ? 'yes' : 'no'}`} testid="ballot-promised" />
      <span className="grid grid-cols-2 gap-2">
        {answer(true)}
        {answer(false)}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2" data-testid="ballot-voted">
        Voted:
        {c.voted.map((id) => {
          const p = view.players.find((q) => q.id === id);
          return p && <PlayerMark key={id} slot={toSlot(p.slot)} species={p.species} size={14} label={p.name} />;
        })}
        · {c.voted.length} of {view.players.length}. Never shown: how.
      </span>
    </section>
  );
}
