import { cx } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { MarketDesk, TalkDesk } from '../../../../apps/web/src/phone/hub/desks';
import { CouncilDesk } from '../../../../apps/web/src/phone/hub/politics/Council';
import { GovernorDesk } from '../../../../apps/web/src/phone/hub/politics/Governor';
import type { DeskSlot, HubSeat, HubSlots } from '../../../../apps/web/src/phone/hub/slots';
import { LookPanel } from '../../../../apps/web/src/phone/hub/tools';
import { useToday } from '../../../../apps/web/src/phone/hub/state';
import { usePhoneGame } from '../../../../apps/web/src/phone/game';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';

/**
 * P0, the politics RC's frame: today's hub (HUB_SLOTS, the real desks and tools) plus a slot for every new piece, each
 * a marked stub its slice mock fills. No new desk tab: a seat still sees at most five (Colony, Talk, Council, Market,
 * and its one office, Governor or Sheriff, never both). No new button in the map's tools column either.
 */

/** Where a slice's mock goes: the piece's id, its owner, and what the slot holds. Replaced, never styled further. */
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

/** Talk: the table's chat and whispers as today, and the deal cards beside them (P1–P3). */
function TalkFrame() {
  const [view, setView] = useState<'chat' | 'cards'>('chat');
  return (
    <div className="flex flex-col gap-2" data-testid="talk-frame">
      <div role="tablist" aria-label="Talk" className="grid grid-cols-2 gap-1">
        {(['chat', 'cards'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} data-testid={`talk-${v}`}
            className={cx('h-11 rounded-control border text-sm font-semibold', view === v ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2')}>
            {v === 'chat' ? 'Chat' : 'My cards'}
          </button>
        ))}
      </div>
      {view === 'chat' ? (
        <>
          <TalkDesk />
          <SlotStub piece="P1" owner="WS6 · deal cards">“Attach a card” on a whisper opens the composer as a sheet over this desk: type, terms, months.</SlotStub>
          <SlotStub piece="P2" owner="WS6 · deal cards">An offered card lands in its whisper thread, with the proposer's reputation and Accept / Decline; Now says “Brix offers you a card”.</SlotStub>
        </>
      ) : (
        <SlotStub piece="P3" owner="WS6 · deal cards">My cards: offered, active, kept, broken. Only you.</SlotStub>
      )}
    </div>
  );
}

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
      <SlotStub piece="P8" owner="WS8 · Sheriff">Opening this desk turns the map to Guard: tap a plot to guard it this month; the marks show on the Sheriff's map only. Guard is a desk-only tool, with no button in the tools column (the slot model gains it; WS6 builds that in Hub).</SlotStub>
    </div>
  );
}

/** Look, as built, and under it where a power-line cut starts: the plot looked at is a rival's. */
function LookWithSabotage() {
  const { looked } = useToday();
  const { view, self } = usePhoneGame();
  const owner = looked ? view.tiles.find((t) => t.x === looked.x && t.y === looked.y)?.owner : null;
  if (!owner || owner === self.id) return <LookPanel />;
  return (
    <div className="flex flex-col gap-1.5" data-testid="look-with-sabotage">
      <LookPanel />
      <SlotStub piece="P6" owner="WS8 · sabotage">On a rival's plot: “Sabotage this plot · Only you” opens the secret order here (power-line cut, cost, odds, “Order in secret”). One order a month. The TV never shows it.</SlotStub>
    </div>
  );
}

function MarketWithRumour() {
  return (
    <div className="flex flex-col gap-2">
      <MarketDesk />
      <SlotStub piece="P6" owner="WS8 · sabotage">“Start a rumour · Only you”: the other order, against a good, not a plot. It shares the month's one order with the power-line cut.</SlotStub>
    </div>
  );
}

const desk = (id: string) => HUB_SLOTS.desks.find((d) => d.id === id)!;

const SHERIFF_DESK: DeskSlot = {
  id: 'sheriff', label: 'Sheriff', icon: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z',
  Body: SheriffFrame, show: isSheriff, first: isSheriff,
};

export const FRAME_SLOTS: HubSlots = {
  ...HUB_SLOTS,
  // No new button in the tools column: a fifth one squeezes the map at 667 from 157 px wide to 65 (measured, 7 Nov).
  tools: HUB_SLOTS.tools.map((t) => (t.id === 'look' ? { ...t, Panel: LookWithSabotage } : t)),
  desks: [
    desk('colony'),
    { ...desk('talk'), Body: TalkFrame },
    { ...desk('council'), Body: CouncilFrame },
    { ...desk('market'), Body: MarketWithRumour },
    { ...desk('governor'), Body: GovernorFrame },
    SHERIFF_DESK,
  ],
};
