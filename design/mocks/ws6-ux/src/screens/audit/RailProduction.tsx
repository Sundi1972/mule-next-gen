import type { Good } from '@mule/engine';
import { Button, cx, GoodIcon } from '@mule/ui';
import { W, H } from '../../fixture';
import { Game, PhoneFrame } from '../../harness';
import { EVENTS, SHOW } from '../../production';
import { ChatProvider, useChatSim } from '../../proposed/Chat';
import { GameShell } from '../../proposed/GameShell';
import { TickerRuleSwitch } from '../../proposed/TickerRule';
import { MapShow, ShowRoot } from '../Production';

/**
 * #rail-production: a STAND-IN for the rail-chat measurement (TickerRule.tsx), not a design. Production on a phone
 * alone, at the moment WS8's T-AC-5 holds (apps/web/e2e/events.ts on ws8-events): the last event's result is up, the
 * skip hint is by the actions, and the phase's earlier event sits as one line under the card. The rail copies the
 * shape of WS8's EventSoloRail (packages/ui/src/events/phone.tsx on ws8-events: EventPhoneCard at "you", then
 * EventRailTail), which this workspace's @mule/ui does not have yet; its sizes are WS8's, its words this fixture's.
 * What is measured is where "rail-earlier" ends against the footer with the seat row and two chat lines in the header.
 * GRAFT: none. WS8 owns the screen; the rule, once ruled, lands in the chat's Ticker.
 */

/** The sign badge's stand-in (WS8's EventSignBadge): the good the event touched, in a ring of the event's tone. */
function Badge({ good, size, bad }: { good: Good; size: number; bad: boolean }) {
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full border-2 bg-panel', bad ? 'border-alert' : 'border-ok')} style={{ width: size, height: size }}>
      <GoodIcon good={good} size={Math.round(size * 0.55)} />
    </span>
  );
}

function SoloRail() {
  return (
    <>
      {/* The last event's result: WS8's EventPhoneCard at "you". */}
      <div className="flex flex-col gap-1.5 rounded-panel border-2 border-alert bg-alert-bg p-2.5" data-testid="phone-card" data-at="you">
        <div className="flex items-center gap-2">
          <Badge good="food" size={40} bad />
          <span className="flex min-w-0 flex-col">
            <span className="label-caps whitespace-nowrap text-[10px]! text-alert-ink!">Event 2 of 2 · this month</span>
            <span className="font-display text-lg font-bold leading-tight">{EVENTS.blight.title}</span>
          </span>
        </div>
        <div className="flex flex-col gap-1" data-testid="phone-you">
          <span className="font-display text-base font-bold text-alert-ink">−3 Food for you</span>
          <span className="truncate text-xs leading-snug text-ink-2" title="Pests ate half of three of your farms: 6, 7 and 7,3 on the river.">
            Pests ate half of three of your farms on the river.
          </span>
        </div>
      </div>
      {/* The phase's earlier event, one line: WS8's EventRailTail. */}
      <div className="flex items-center gap-2 rounded-control bg-raised px-2 py-1" data-testid="rail-earlier">
        <Badge good="energy" size={22} bad />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{EVENTS.storm.title}</span>
        <span className="text-xs font-bold text-alert-ink">−2 Energy</span>
      </div>
    </>
  );
}

function SoloProduction() {
  return (
    <GameShell
      phase="Production"
      rail={<SoloRail />}
      footer={
        <>
          <span className="self-end rounded-chip bg-void/75 px-1.5 py-0.5 font-mono text-[10px] text-ink-2" data-testid="skip-hint">
            tap the map: next ›
          </span>
          <Button size="lg" className="w-full px-2" data-testid="ready">
            On to the auction
          </Button>
        </>
      }
    >
      <ShowRoot className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div style={{ width: `min(100cqw, calc(100cqh * ${W} / ${H}))` }}>
            <MapShow t={SHOW.flyStart} ev={EVENTS.blight} only="lena" />
          </div>
        </div>
      </ShowRoot>
    </GameShell>
  );
}

export function RailProductionPage() {
  const chat = useChatSim(0, 'lena');
  return (
    <ChatProvider value={chat}>
      <p className="max-w-[900px] text-sm text-ink-2">
        A stand-in, for one measurement: production on a phone alone, at the moment WS8’s T-AC-5 holds (the last event’s result up, the skip hint by the actions, the earlier event as one line under the card). The rail copies the shape of WS8’s EventSoloRail; WS8 owns the screen. The table chat runs in the rail’s header. Does the earlier event’s line clear the footer?
      </p>
      <TickerRuleSwitch />
      <PhoneFrame>
        <Game>
          <SoloProduction />
        </Game>
      </PhoneFrame>
    </ChatProvider>
  );
}
