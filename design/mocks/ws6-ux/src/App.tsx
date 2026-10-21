import { useState, type ReactNode } from 'react';
import { LAND_LEAD, LAND_UNDER, LAND_WALK, SMITHORE_MID, SMITHORE_SOLD_OUT, SMITHORE_START, SMITHORE_STATUS, SMITHORE_TRADE, TRADE_MOVED, VIEW } from './fixture';
import { Board, Game, PhoneFrame, TvFrame, useHash } from './harness';
import { EVENTS, type EventKind } from './production';
import { PhoneGoodsWalk, TvGoodsWalk, useWalkSim, type LineStyle } from './screens/GoodsAuction';
import { PhoneLandLine, TvLandLine } from './screens/LandLine';
import { PhoneProduction, ShowControls, TvProduction, useShow } from './screens/Production';
import { PhoneStatusDeclare, TvStatusDeclare } from './screens/StatusDeclare';

const DECISIONS = [
  'Concepts from the original, never its art or layout: every screen here is our holo-table style on @mule/ui.',
  'Goods auction: two moving lines, the lowest ask (red, pushed down by sellers) and the highest bid (green, pushed up by buyers), the gap labelled. When they meet they become the glowing trade bar.',
  'Units and surplus under every creature ("12 (+8)"); the store’s stock on its selling line, or SOLD OUT with no ceiling.',
  'The store and ship lines stay but go thinner: they are limits, not moves.',
  'Buy or Sell is picked on the status screen (R2): one stage per good fewer. Nothing picked by the bell means Pass.',
  'Land auction: buyers only, so one line: the highest bid, naming who wins at the bell.',
  'Production (R3, ~15 s): plots fill with one bar per unit in the owner’s colour, badges say why (+1 cluster, ½ no Water…), the event plays over the map in its own way, then the goods fly home: TV into the public colony bar, phone into your private 9-goods strip.',
  'What each plot made is public (as in the original and our status screen); what you hold stays on your phone.',
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

function StylePick({ style, onStyle }: { style: LineStyle; onStyle: (s: LineStyle) => void }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs" data-testid="variant-pick">
      <span className="text-ink-3">variant:</span>
      {(['lines', 'band'] as const).map((s) => (
        <button key={s} type="button" onClick={() => onStyle(s)} className={s === style ? 'rounded-chip border border-holo bg-holo-soft px-2 py-0.5' : 'rounded-chip border border-holo-faint px-2 py-0.5 text-ink-2'} data-testid={`variant-${s}`}>
          {s === 'lines' ? 'A · two lines' : 'B · lines with the gap shaded'}
        </button>
      ))}
    </div>
  );
}

/** The walk, playable: hold Up or Down (or drag on the board) as Lena, a buyer. */
function PlayableWalk() {
  const [style, setStyle] = useState<LineStyle>('lines');
  const sim = useWalkSim(SMITHORE_START);
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <StylePick style={style} onStyle={setStyle} />
        <button type="button" className="font-mono text-xs text-holo underline" onClick={sim.restart} data-testid="restart-walk">
          play the walk again
        </button>
      </div>
      <PhoneFrame>
        <Game>
          <PhoneGoodsWalk view={VIEW} auction={sim.auction} style={style} moved={sim.moved} onWalk={sim.walk} />
        </Game>
      </PhoneFrame>
      <p className="max-w-[844px] text-sm text-ink-2">You are Lena, short 2 Smithore. Hold Up (or drag on the board): Brix and Ossa walk their asks down, Kai bids up. Watch the two lines close; when they meet the units move one at a time.</p>
      <TvFrame>
        <Board>
          <TvGoodsWalk view={VIEW} auction={sim.auction} style={style} moved={sim.moved} />
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

export default function App() {
  const hash = useHash();
  const [style, setStyle] = useState<LineStyle>('lines');

  if (hash === 'walk') return <Page title="Goods auction · the walk, playable · phone and TV"><PlayableWalk /></Page>;
  if (hash === 'production') return <Page title="Production show · TV and phone"><PlayableShow /></Page>;

  const a = AUCTION_STATES.find((s) => s.id === hash);
  if (a)
    return (
      <Page title={`Goods auction · ${a.title}`}>
        <Links states={AUCTION_STATES} current={hash} />
        <StylePick style={style} onStyle={setStyle} />
        <PhoneFrame>
          <Game>
            <PhoneGoodsWalk view={VIEW} auction={a.a} style={style} {...(a.moved ? { moved: a.moved } : {})} />
          </Game>
        </PhoneFrame>
        <TvFrame>
          <Board>
            <TvGoodsWalk view={VIEW} auction={a.a} style={style} {...(a.moved ? { moved: a.moved } : {})} />
          </Board>
        </TvFrame>
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
        <p className="max-w-[844px] text-sm text-ink-2">Tap Buy or Sell; tap it again to go back to Pass. Lena has no Smithore, so Sell is off.</p>
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
            The goods auction walk, playable, variants A and B (phone and TV)
          </a>
        </li>
      </ul>
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
      <p className="mt-8 text-xs text-ink-3">Next, after these: the store interior (one hall, two rows, D1), the start-of-turn time fill, and creatures walking on the TV map.</p>
    </div>
  );
}
