import { useState, type ReactNode } from 'react';
import { LAND_LEAD, LAND_UNDER, LAND_WALK, SMITHORE_MID, SMITHORE_SOLD_OUT, SMITHORE_START, SMITHORE_STATUS, SMITHORE_TRADE, TRADE_MOVED, VIEW } from './fixture';
import { Board, Game, LaptopFrame, PhoneFrame, TvFrame, useHash } from './harness';
import { DevelopTurn, type Start } from './screens/DevelopTurn';
import { LobbyColonist, type LobbyState } from './screens/LobbyColonist';
import { PlanningBrief } from './screens/PlanningBrief';
import { MuleSheet } from './screens/MuleSheet';
import { PlanningHub, type Desk, type Office } from './screens/PlanningHub';
import { EVENTS, type EventKind } from './production';
import { PhoneGoodsWalk, TvGoodsWalk, useWalkSim } from './screens/GoodsAuction';
import { PhoneLandLine, TvLandLine } from './screens/LandLine';
import { PhoneProduction, ShowControls, TvProduction, useShow } from './screens/Production';
import { PhoneStatusDeclare, TvStatusDeclare } from './screens/StatusDeclare';
import { PhoneStore, TvDevelop } from './screens/Store';

const DECISIONS = [
  'Concepts from the original, never its art or layout: every screen here is our holo-table style on @mule/ui.',
  'Goods auction (Heiko chose variant A, plain lines): two moving lines, the lowest ask (red, pushed down by sellers) and the highest bid (green, pushed up by buyers), the gap labelled. When they meet they become the glowing trade bar.',
  'Units and surplus under every creature ("12 (+8)"); the store’s stock on its selling line, or SOLD OUT with no ceiling.',
  'The store and ship lines stay but go thinner: they are limits, not moves.',
  'Buy or Sell is picked on the status screen (R2): one stage per good fewer. Your side starts where the numbers point (short → Buy, surplus → Sell: spec AM-1); tap to change it. The status table shows on the TV (Heiko’s exemption from “the TV never shows stock”).',
  'Land auction: buyers only, so one line: the highest bid, naming who wins at the bell.',
  'Production (R3, ~15 s): plots fill with one bar per unit in the owner’s colour, badges say why (+1 cluster, ½ no Water…), the event plays over the map in its own way, then the goods fly home: TV into the public colony bar, phone into your private 9-goods strip.',
  'What each plot made is public (as in the original and our status screen); what you hold stays on your phone.',
  'Store (D1, Heiko): one hall, two rows. Top: the six outfitters, crops left, mines right. Bottom: the works (three factory fits), green belt, MULE corral, pub, with a door to the map at each end.',
  'Tap to walk (R1): tap a room and your creature walks there; time keeps running, so walking costs time. Placeholders until WS1’s sim: the hall in about 2 s, 0.6 s a tile on the map. Zipwings walk twice as fast.',
  'Everyone in the store walks the same floor, each with a time bar over their head, as in the original.',
  'Start of turn: “You eat 5 Food and fill up your time bar”: the bar fills in front of you, shorter when you are short of Food.',
  'Redesign (Heiko, 2026-10-22): every player screen is a stage (what you act on) and a guide rail that opens with “Now”, the next step and why; from a phone held sideways to a laptop, using the space.',
  'Development on a laptop: the store above the map (Heiko chose A), so walking out of the door lands you on the map; the next room glows and says TAP.',
];

const STORE_STATES = [
  { id: 'store', title: 'Fed: full time' },
  { id: 'store-hungry', title: 'Short of Food: less time' },
  { id: 'store-soldout', title: 'Corral sold out' },
];

const AUCTION_STATES = [
  { id: 'auction-start', title: 'The bell: lines far apart', a: SMITHORE_START },
  { id: 'auction-mid', title: 'Mid-walk: 9 apart', a: SMITHORE_MID },
  { id: 'auction-trade', title: 'Lines met: trading', a: SMITHORE_TRADE, moved: TRADE_MOVED },
  { id: 'auction-soldout', title: 'Store sold out', a: SMITHORE_SOLD_OUT },
];

const LAND_STATES = [
  { id: 'land-under', title: 'Nobody at the minimum yet', lot: LAND_UNDER },
  { id: 'land-walk', title: 'Ossa leads', lot: LAND_WALK },
  { id: 'land-lead', title: 'You lead', lot: LAND_LEAD },
];

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-table p-8 text-ink">
      <a href="#" className="font-mono text-xs text-holo underline" data-testid="back">
        ← index
      </a>
      <h1 className="mb-4 mt-2 font-display text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Links({ states, current }: { states: { id: string; title: string }[]; current?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {states.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className={s.id === current ? 'text-ink' : 'text-holo underline'} data-testid={`link-${s.id}`}>
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The walk, playable: hold Up or Down (or drag on the board) as Lena, a buyer. */
function PlayableWalk() {
  const sim = useWalkSim(SMITHORE_START);
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="font-mono text-xs text-holo underline" onClick={sim.restart} data-testid="restart-walk">
          play the walk again
        </button>
      </div>
      <PhoneFrame>
        <Game>
          <PhoneGoodsWalk view={VIEW} auction={sim.auction} moved={sim.moved} onWalk={sim.walk} />
        </Game>
      </PhoneFrame>
      <p className="max-w-[844px] text-sm text-ink-2">You are Lena, short 2 Smithore. Hold Up (or drag on the board): Brix and Ossa walk their asks down, Kai bids up. Watch the two lines close; when they meet the units move one at a time.</p>
      <TvFrame>
        <Board>
          <TvGoodsWalk view={VIEW} auction={sim.auction} moved={sim.moved} />
        </Board>
      </TvFrame>
    </>
  );
}

function PlayableShow() {
  const [kind, setKind] = useState<EventKind | 'none'>('storm');
  const show = useShow();
  const ev = kind === 'none' ? null : EVENTS[kind];
  return (
    <>
      <ShowControls show={show} kind={kind} onKind={setKind} />
      <TvFrame>
        <Board>
          <TvProduction t={show.t} ev={ev} />
        </Board>
      </TvFrame>
      <p className="max-w-[960px] text-sm text-ink-2">
        The big screen first. 0–4 s the plots fill in reading order with their badges; 4–9.5 s the event card and the event over the map; from 9.6 s the goods fly into each player's slot. Pick another event above; scrub to stop on any moment.
      </p>
      <PhoneFrame>
        <Game>
          <PhoneProduction t={show.t} ev={ev} />
        </Game>
      </PhoneFrame>
      <p className="max-w-[844px] text-sm text-ink-2">Lena's phone at the same moment: only her plots fill, and her harvest flies into her private strip of nine goods under the map.</p>
    </>
  );
}

const DEV_STATES: { id: string; title: string; start: Start }[] = [
  { id: 'dev', title: 'Start of the turn: buy a MULE', start: 'start' },
  { id: 'dev-outfitted', title: 'MULE outfitted: walk out', start: 'outfitted' },
  { id: 'dev-map', title: 'On the map: to your plot', start: 'map' },
  { id: 'dev-installed', title: 'Installed: what next', start: 'installed' },
];

const LOBBY_STATES: { id: string; title: string; state: LobbyState }[] = [
  { id: 'lobby', title: 'A player: make your colonist', state: 'guest' },
  { id: 'lobby-host', title: 'The host', state: 'host' },
  { id: 'lobby-kick', title: 'Host: remove a player', state: 'kick' },
  { id: 'lobby-handoff', title: 'Host: move the host to my phone', state: 'handoff' },
  { id: 'lobby-close', title: 'Host: close the room', state: 'close' },
];

const PLAN_STATES = [
  { id: 'plan', title: 'The briefing: map, needs, prices', mode: 'look' as const },
  { id: 'plan-drone', title: 'Geo drone mode on the map', mode: 'drone' as const },
];

const HUB_STATES: { id: string; title: string; desk: Desk; office: Office }[] = [
  { id: 'hub', title: 'This month, the colony desk (Lena, running for Sheriff)', desk: 'colony', office: 'none' },
  { id: 'hub-council', title: 'Council: election and law vote', desk: 'council', office: 'none' },
  { id: 'hub-talk', title: 'Talk: a whisper with a deal card', desk: 'talk', office: 'none' },
  { id: 'hub-market', title: 'Market: sell a plot or MULE', desk: 'market', office: 'none' },
  { id: 'hub-secret', title: 'Secret: a sabotage order', desk: 'secret', office: 'none' },
  { id: 'hub-governor', title: "As Governor: the Governor's desk", desk: 'governor', office: 'governor' },
  { id: 'hub-sheriff', title: "As Sheriff: the Sheriff's desk", desk: 'sheriff', office: 'sheriff' },
];

export default function App() {
  const hash = useHash();

  const hub = HUB_STATES.find((s) => s.id === hash);
  if (hub)
    return (
      <Page title={`Planning, the hub · ${hub.title}`}>
        <Links states={HUB_STATES} current={hash} />
        <p className="max-w-[900px] text-sm text-ink-2">
          Month 4, an election month. Everything the month allows sits in “This month” and in the desks; SOON marks what WS7 builds; the lock marks what only you see. Laptop (1440 × 900), then the phone held sideways.
        </p>
        <LaptopFrame>
          <Game>
            <PlanningHub key={`${hash}-l`} desk={hub.desk} office={hub.office} />
          </Game>
        </LaptopFrame>
        <PhoneFrame>
          <Game>
            <PlanningHub key={`${hash}-p`} desk={hub.desk} office={hub.office} />
          </Game>
        </PhoneFrame>
      </Page>
    );

  if (hash === 'mule')
    return (
      <Page title="The MULE · a cute mechanical dromedary (AM-8)">
        <MuleSheet />
      </Page>
    );

  const plan = PLAN_STATES.find((s) => s.id === hash);
  if (plan)
    return (
      <Page title={`Planning, redesigned · ${plan.title}`}>
        <Links states={PLAN_STATES} current={hash} />
        <LaptopFrame>
          <Game>
            <PlanningBrief key={`${hash}-l`} mode={plan.mode} />
          </Game>
        </LaptopFrame>
        <PhoneFrame>
          <Game>
            <PlanningBrief key={`${hash}-p`} mode={plan.mode} />
          </Game>
        </PhoneFrame>
      </Page>
    );

  const lobby = LOBBY_STATES.find((s) => s.id === hash);
  if (lobby)
    return (
      <Page title={`Lobby, redesigned · ${lobby.title}`}>
        <Links states={LOBBY_STATES} current={hash} />
        <p className="max-w-[900px] text-sm text-ink-2">Playable: pick a species and a colour; a colour someone has is marked with their creature. Laptop window (1440 × 900) first, then the phone held sideways.</p>
        <LaptopFrame>
          <LobbyColonist key={`${hash}-l`} state={lobby.state} />
        </LaptopFrame>
        <PhoneFrame>
          <LobbyColonist key={`${hash}-p`} state={lobby.state} />
        </PhoneFrame>
      </Page>
    );

  const dev = DEV_STATES.find((s) => s.id === hash);
  if (dev)
    return (
      <Page title={`Development, redesigned · ${dev.title}`}>
        <Links states={DEV_STATES} current={hash} />
        <p className="max-w-[900px] text-sm text-ink-2">
          Playable. The rail always opens with "Now": the one next step and why. The room for it glows and says TAP; rooms you can't use yet say why. Your Zipwing walks (and waddles) from room to room and out of the door; the clock never stops. Laptop window (1440 × 900) first, then the phone held sideways.
        </p>
        <LaptopFrame>
          <Game>
            <DevelopTurn key={`${hash}-l`} start={dev.start} />
          </Game>
        </LaptopFrame>
        <PhoneFrame>
          <Game>
            <DevelopTurn key={`${hash}-p`} start={dev.start} />
          </Game>
        </PhoneFrame>
      </Page>
    );

  if (hash === 'walk') return <Page title="Goods auction · the walk, playable · phone and TV"><PlayableWalk /></Page>;
  if (hash === 'production') return <Page title="Production show · TV and phone"><PlayableShow /></Page>;

  const a = AUCTION_STATES.find((s) => s.id === hash);
  if (a)
    return (
      <Page title={`Goods auction · ${a.title}`}>
        <Links states={AUCTION_STATES} current={hash} />
        <PhoneFrame>
          <Game>
            <PhoneGoodsWalk view={VIEW} auction={a.a} {...(a.moved ? { moved: a.moved } : {})} />
          </Game>
        </PhoneFrame>
        <TvFrame>
          <Board>
            <TvGoodsWalk view={VIEW} auction={a.a} {...(a.moved ? { moved: a.moved } : {})} />
          </Board>
        </TvFrame>
      </Page>
    );

  const store = STORE_STATES.find((st) => st.id === hash);
  if (store)
    return (
      <Page title={`Store · ${store.title}`}>
        <Links states={STORE_STATES} current={hash} />
        <PhoneFrame>
          <Game>
            <PhoneStore key={hash} hungry={hash === 'store-hungry'} mules={hash === 'store-soldout' ? 0 : 5} />
          </Game>
        </PhoneFrame>
        <p className="max-w-[844px] text-sm text-ink-2">
          The first 2 s: you eat and your bar fills. Then tap the corral, an outfitter (or a fit at the works), and a door: your Zipwing walks each leg while the clock runs. Ossa, Brix and Kai are in the store too. Reload the page to start the turn again.
        </p>
      </Page>
    );

  if (hash === 'tv-develop')
    return (
      <Page title="Development on the big screen · everyone walking">
        <TvFrame>
          <Board>
            <TvDevelop />
          </Board>
        </TvFrame>
        <p className="max-w-[960px] text-sm text-ink-2">Ossa leads an Energy MULE out to a far plot, Kai walks to the lakes, Brix goes into the store; whoever is inside shows on the store floor at the right.</p>
      </Page>
    );

  if (hash === 'status')
    return (
      <Page title="Before each good · status and Buy / Sell on one screen (R2)">
        <PhoneFrame>
          <Game>
            <PhoneStatusDeclare view={VIEW} auction={SMITHORE_STATUS} />
          </Game>
        </PhoneFrame>
        <p className="max-w-[844px] text-sm text-ink-2">Lena is short, so she starts as a buyer; tap Buy again to pass. She has no Smithore, so Sell is off.</p>
        <TvFrame>
          <Board>
            <TvStatusDeclare view={VIEW} auction={SMITHORE_STATUS} />
          </Board>
        </TvFrame>
      </Page>
    );

  const land = LAND_STATES.find((s) => s.id === hash);
  if (land)
    return (
      <Page title={`Land auction · ${land.title}`}>
        <Links states={LAND_STATES} current={hash} />
        <PhoneFrame>
          <Game>
            <PhoneLandLine view={VIEW} lot={land.lot} />
          </Game>
        </PhoneFrame>
        <TvFrame>
          <Board>
            <TvLandLine view={VIEW} lot={land.lot} />
          </Board>
        </TvFrame>
      </Page>
    );

  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid="index">
      <h1 className="font-display text-3xl font-semibold">WS6 · UX & gameplay · mocks</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        What we take from the original M.U.L.E., as concepts on our own screens. Analysis: docs/research/2026-10-21-ws6-original-vs-ours.md. Fixture: month 5, four players; Lena holds the phone, Ossa and Kai are AI.
      </p>
      <h2 className="label-caps mt-6">Decided</h2>
      <ul className="mt-2 flex max-w-3xl list-disc flex-col gap-1 pl-5 text-sm text-ink-2" data-testid="decisions">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <h2 className="label-caps mt-8">Start here</h2>
      <ul className="mt-2 flex flex-col gap-1">
        <li>
          <a href="#production" className="font-display text-lg font-semibold text-holo underline" data-testid="link-production">
            The production show, with three animated events (TV and phone)
          </a>
        </li>
        <li>
          <a href="#walk" className="font-display text-lg font-semibold text-holo underline" data-testid="link-walk">
            The goods auction walk, playable (phone and TV)
          </a>
        </li>
      </ul>
      <h2 className="label-caps mt-8">Redesign 2026-10-22 · phone and laptop (Heiko's points)</h2>
      <div className="mt-2 flex flex-col gap-2">
        <Links states={[{ id: 'mule', title: 'The MULE: model sheet' }]} />
        <Links states={HUB_STATES} />
        <Links states={LOBBY_STATES} />
        <Links states={PLAN_STATES} />
        <Links states={DEV_STATES} />
      </div>
      <h2 className="label-caps mt-8">Goods auction · every state</h2>
      <div className="mt-2">
        <Links states={AUCTION_STATES} />
      </div>
      <h2 className="label-caps mt-8">Before each good</h2>
      <div className="mt-2">
        <Links states={[{ id: 'status', title: 'Status with Buy / Sell (R2)' }]} />
      </div>
      <h2 className="label-caps mt-8">Land auction · the highest-bid line</h2>
      <div className="mt-2">
        <Links states={LAND_STATES} />
      </div>
      <h2 className="label-caps mt-8">Store and development (D1, R1)</h2>
      <div className="mt-2">
        <Links states={[...STORE_STATES, { id: 'tv-develop', title: 'Big screen: everyone walking' }]} />
      </div>
    </div>
  );
}
