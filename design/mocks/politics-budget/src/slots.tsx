import { cx } from '@mule/ui';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MarketDesk, TalkDesk } from '../../../../apps/web/src/phone/hub/desks';
import { usePhoneGame } from '../../../../apps/web/src/phone/game';
import { useHub } from '../../../../apps/web/src/phone/hub/Hub';
import { ColonyWithFacts } from '../../../../apps/web/src/phone/hub/politics/Colony';
import { CouncilDesk } from '../../../../apps/web/src/phone/hub/politics/Council';
import { GovernorDesk } from '../../../../apps/web/src/phone/hub/politics/Governor';
import type { BannerSlot, DeskSlot, HubSeat, HubSlots } from '../../../../apps/web/src/phone/hub/slots';
import { useToday } from '../../../../apps/web/src/phone/hub/state';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { LookPanel } from '../../../../apps/web/src/phone/hub/tools';
import { Graft } from './Graft';
import { CouncilBudget } from './proposed/CouncilBudget';
import { FrozenTax, GovernorBudget, type Variant } from './proposed/GovernorBudget';
import { OVERRULE_STAGE, overruleNow, overruleReadyWords } from './proposed/OverruleBallot';
import { OverruleCall, OVERRULE_CALL_LINE } from './proposed/OverruleCall';

/**
 * The politics frame (P0, approved 7 Nov, option A) with P12 and P13 drawn in: today's hub, the real desks and tools,
 * the other slices' stubs as P0 left them. No new desk tab, no new tool button. What changed from P0:
 * - P12 is in the Governor desk, under the tax (GovernorBudget; FrozenTax while a call holds the tax);
 * - P13's call left the Council desk for the tax line in the Colony desk's fund card (PM ruling, 7 Nov), with a line
 *   under Now on every phone while it waits; the Council desk opens on the budget as set;
 * - the overrule ballot takes the hub's stage, as the law ballot does.
 */

/** Where a slice's mock goes (P0's stub, kept for the slices this mock does not draw). */
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
const taxCalled = ({ view }: Pick<HubSeat, 'view'>) => view.politics?.overrule?.target === 'tax' && view.politics.overrule.stage === 'called';

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
          <SlotStub piece="P1" owner="WS6 · deal cards">“Attach a card” on a whisper opens the composer as a sheet over this desk.</SlotStub>
          <SlotStub piece="P2" owner="WS6 · deal cards">An offered card lands in its whisper thread, with Accept / Decline.</SlotStub>
        </>
      ) : (
        <SlotStub piece="P3" owner="WS6 · deal cards">My cards: offered, active, kept, broken. Only you.</SlotStub>
      )}
    </div>
  );
}

/** Colony: as built, with the overrule call at the fund card's tax line, and commissioning moved to the Governor's Projects line. */
function ColonyFrame() {
  return (
    // MOCK: hides the Colony desk's own Commission button, which the build removes from ColonyWithFacts (it moves under Projects).
    <div className="flex flex-col gap-2.5 [&_[data-testid=commission-open]]:hidden @min-[1100px]/shell:gap-4">
      <ColonyWithFacts />
      <Graft at='[data-testid="fund-in"]' className="col-start-2">
        <OverruleCall />
      </Graft>
    </div>
  );
}

/** Council: the budget as set first, then the desk as built. P13's call is no longer here: it starts at the tax line. */
function CouncilFrame() {
  return (
    <div className="flex flex-col gap-2">
      <CouncilBudget />
      <CouncilDesk />
      <SlotStub piece="P11" owner="WS8 · sabotage">The fifth law, the sabotage ban, in the Governor's law list and this ballot.</SlotStub>
    </div>
  );
}

/** Governor: the tax as built (or frozen by a call), the budget under it, then the law picker as built. */
function governorFrame(variant: Variant) {
  return function GovernorFrame() {
    const { view } = usePhoneGame();
    const frozen = taxCalled({ view });
    return (
      // MOCK: while a call holds the tax, SalesTax's row is hidden and FrozenTax drawn in its place (the build swaps them in GovernorDesk).
      <div className={cx('flex flex-col gap-2 @min-[1100px]/shell:gap-4', frozen && '[&_[data-testid=gov-tax]]:hidden')}>
        <GovernorDesk />
        <Graft at='[data-testid="gov-tax"]' className="flex flex-col gap-2 @min-[1100px]/shell:gap-4">
          {frozen && <FrozenTax />}
          <GovernorBudget variant={variant} />
        </Graft>
      </div>
    );
  };
}

function SheriffFrame() {
  return (
    <div className="flex flex-col gap-2">
      <SlotStub piece="P7" owner="WS8 · Sheriff">The Sheriff's desk, the holder's alone and first, as the Governor's is.</SlotStub>
      <SlotStub piece="P8" owner="WS8 · Sheriff">Opening this desk turns the map to Guard.</SlotStub>
    </div>
  );
}

function LookWithSabotage() {
  const { looked } = useToday();
  const { view, self } = usePhoneGame();
  const owner = looked ? view.tiles.find((t) => t.x === looked.x && t.y === looked.y)?.owner : null;
  if (!owner || owner === self.id) return <LookPanel />;
  return (
    <div className="flex flex-col gap-1.5" data-testid="look-with-sabotage">
      <LookPanel />
      <SlotStub piece="P6" owner="WS8 · sabotage">On a rival's plot: “Sabotage this plot · Only you”.</SlotStub>
    </div>
  );
}

function MarketWithRumour() {
  return (
    <div className="flex flex-col gap-2">
      <MarketDesk />
      <SlotStub piece="P6" owner="WS8 · sabotage">“Start a rumour · Only you”: the other order, against a good.</SlotStub>
    </div>
  );
}

/** MOCK PLUMBING: the desk a screen's link opens, so the state it shows is in view. The build has no such slot. */
export const OpenDesk = createContext<string | null>(null);
function DeskOpener() {
  const want = useContext(OpenDesk);
  const { openDesk } = useHub();
  useEffect(() => {
    if (want) openDesk(want);
    // Once, as the phone is drawn: a tab tapped afterwards stays.
  }, []);
  return null;
}
const DESK_OPENER: BannerSlot = { id: 'mock-desk-opener', Body: DeskOpener };

const desk = (id: string) => HUB_SLOTS.desks.find((d) => d.id === id)!;

const SHERIFF_DESK: DeskSlot = {
  id: 'sheriff', label: 'Sheriff', icon: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z',
  Body: SheriffFrame, show: isSheriff, first: isSheriff,
};

const GOVERNOR_BODIES: Record<Variant, DeskSlot['Body']> = { a: governorFrame('a'), b: governorFrame('b') };

/** The frame's slots with P12 in variant `variant`. */
export function frameSlots(variant: Variant): HubSlots {
  return {
    ...HUB_SLOTS,
    banners: [...HUB_SLOTS.banners, DESK_OPENER],
    tools: HUB_SLOTS.tools.map((t) => (t.id === 'look' ? { ...t, Panel: LookWithSabotage } : t)),
    desks: [
      { ...desk('colony'), Body: ColonyFrame },
      { ...desk('talk'), Body: TalkFrame },
      { ...desk('council'), Body: CouncilFrame },
      { ...desk('market'), Body: MarketWithRumour },
      { ...desk('governor'), Body: GOVERNOR_BODIES[variant] },
      SHERIFF_DESK,
    ],
    underNow: [...(HUB_SLOTS.underNow ?? []), OVERRULE_CALL_LINE],
    stage: [...(HUB_SLOTS.stage ?? []), OVERRULE_STAGE],
    nows: [overruleNow, ...HUB_SLOTS.nows],
    readyWords: [...(HUB_SLOTS.readyWords ?? []), overruleReadyWords],
  };
}
