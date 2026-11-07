import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MarketDesk } from '../../../../apps/web/src/phone/hub/desks';
import { useHub } from '../../../../apps/web/src/phone/hub/Hub';
import { CouncilDesk } from '../../../../apps/web/src/phone/hub/politics/Council';
import { GovernorDesk } from '../../../../apps/web/src/phone/hub/politics/Governor';
import { COUNCIL_STAGE, ELECTION_DAY_STAGE } from '../../../../apps/web/src/phone/hub/politics/slots';
import type { DeskSlot, HubSeat, HubSlots } from '../../../../apps/web/src/phone/hub/slots';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { makeTalkDesk, TalkBadge } from './proposed/desks';
import { PromisedElectionDay } from './proposed/ElectionDay';
import { PromisedCouncilBallot } from './proposed/LawBallot';
import type { Variant } from './proposed/phone-parts';
import { StandingsSheet } from './proposed/Standings';
import { DEALS_AGENDA } from './proposed/today';

/**
 * P0's frame (design/mocks/politics-frame/src/slots.tsx, approved option A, 7 Nov) with slice 3's pieces in it: the
 * Talk desk is the real proposed one (Chat with + Deal, My cards), the agenda leads with "1 deal offer", and the ballots
 * carry "You promised". Every other new piece stays the frame's dashed stub, untouched: the budget mock (P12-P15) and
 * WS8's (P6-P11) fill those.
 */

export function SlotStub({ piece, owner, children }: { piece: string; owner: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-panel border-2 border-dashed border-holo-line bg-holo-soft p-2.5" data-testid={`slot-${piece.toLowerCase()}`}>
      <span className="label-caps text-[10px]! text-holo">
        {piece} · {owner}
      </span>
      <div className="text-xs leading-snug text-ink-2">{children}</div>
    </div>
  );
}

const isSheriff = ({ view, self }: HubSeat) => view.politics !== null && view.politics.sheriff === self.id;

function CouncilFrame() {
  return (
    <div className="flex flex-col gap-2">
      <CouncilDesk />
      <SlotStub piece="P13" owner="WS6 · budget">“Call an overrule vote” on the tax or the budget, once a month; the vote is today's law ballot (LawBallot).</SlotStub>
      <SlotStub piece="P11" owner="WS8 · sabotage">The fifth law, the sabotage ban, in the Governor's law list and this ballot.</SlotStub>
    </div>
  );
}

function GovernorFrame() {
  return (
    <div className="flex flex-col gap-2">
      <GovernorDesk />
      <SlotStub piece="P12" owner="WS6 · budget">Budget: Projects, Security, Welfare and the reserve split this month's fund; commissioning moves under Projects.</SlotStub>
    </div>
  );
}

function SheriffFrame() {
  return (
    <div className="flex flex-col gap-2">
      <SlotStub piece="P7" owner="WS8 · Sheriff">The Sheriff's desk, the holder's alone and first, as the Governor's is: investigate one case a month, fine a revealed culprit.</SlotStub>
      <SlotStub piece="P8" owner="WS8 · Sheriff">Opening this desk turns the map to Guard: tap a plot to guard it this month; the marks show on the Sheriff's map only.</SlotStub>
    </div>
  );
}

function MarketWithRumour() {
  return (
    <div className="flex flex-col gap-2">
      <MarketDesk />
      <SlotStub piece="P6" owner="WS8 · sabotage">“Start a rumour · Only you”: the other order, against a good, not a plot.</SlotStub>
    </div>
  );
}

// ---- The mock's harness: not a design, only how a state is reached on load ----------------------------------------

/** What a mock page asks of the phone it draws: a door to open on load, and the standings sheet. */
export interface HarnessAsk {
  focus: string | null;
  standings: boolean;
  setStandings(open: boolean): void;
}
export const Harness = createContext<HarnessAsk>({ focus: null, standings: false, setStandings: () => {} });

/** Inside the hub, so it can open a door as the agenda does, and draw the standings sheet where the hub would. */
function HarnessSlot() {
  const ask = useContext(Harness);
  const hub = useHub();
  const anchor = useRef<HTMLSpanElement>(null);
  const opened = useRef(false);
  const [shell, setShell] = useState<Element | null>(null);
  useLayoutEffect(() => setShell(anchor.current?.closest('[data-testid="game-shell"]') ?? null), []);
  useEffect(() => {
    if (opened.current || !ask.focus) return;
    opened.current = true;
    hub.openDesk('talk', ask.focus);
  });
  return (
    <span ref={anchor} className="hidden">
      {ask.standings && shell && createPortal(<StandingsSheet onClose={() => ask.setStandings(false)} />, shell)}
    </span>
  );
}

const desk = (id: string) => HUB_SLOTS.desks.find((d) => d.id === id)!;

const SHERIFF_DESK: DeskSlot = {
  id: 'sheriff', label: 'Sheriff', icon: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z',
  Body: SheriffFrame, show: isSheriff, first: isSheriff,
};

function slotsFor(variant: Variant): HubSlots {
  return {
    ...HUB_SLOTS,
    agenda: [DEALS_AGENDA, ...HUB_SLOTS.agenda],
    underNow: [...(HUB_SLOTS.underNow ?? []), { id: 'mock-harness', Body: HarnessSlot }],
    desks: [
      desk('colony'),
      { ...desk('talk'), Body: makeTalkDesk(variant), Badge: TalkBadge },
      { ...desk('council'), Body: CouncilFrame },
      { ...desk('market'), Body: MarketWithRumour },
      { ...desk('governor'), Body: GovernorFrame },
      SHERIFF_DESK,
    ],
    stage: [
      { ...ELECTION_DAY_STAGE, Body: PromisedElectionDay },
      { ...COUNCIL_STAGE, Body: PromisedCouncilBallot },
    ],
  };
}

export const SLOTS: Record<Variant, HubSlots> = { a: slotsFor('a'), b: slotsFor('b') };
