import type { MuleView } from '@mule/protocol';
import { DEVELOPMENT, GAME, POLITICS } from '@mule/engine';
import { Button, Creature, cx, GOOD_NAME, GoodIcon, HoloMap, SLOT_COLOR, TERRAIN_NAME, type MapTile } from '@mule/ui';
import { useState } from 'react';
import { fmt, mapTiles, plotName, TERRAIN_ODDS, tileAt, toSlot } from '../../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../../apps/web/src/phone/Shell';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { H, W } from '../../fixture';
import { GameShell, useWide, type Now } from '../../proposed/GameShell';
import { IntentMarker, type IntentNoteData } from '../../proposed/IntentNote';
import { ReadyBar, ReadyCount, readyNow, useWaiting } from '../../proposed/PlanningReady';
import { MarketStrip, NEEDS, News, PlainWords, ThisMonth } from '../PlanningBrief';
import { CouncilDesk, DESKS, EyeOff, Glyph, ICON, MarketDesk, OnlyYouLook, PLAYER, Private, SecretDesk, Section, Soon, TalkDesk, Who, type Desk, type Status, type Tool } from '../PlanningHub';

/**
 * The planning hub after the UX audit (docs/research/2026-10-28-ws6-ux-audit.md §2, proposals H-1…H-7), for Heiko's
 * approval. Forked from PlanningHub (#hub): its desks, map, tools and ReadyBar are reused as they are; only what a
 * proposal changes is drawn here. Each change carries a numbered IntentMarker; the review page lists, per number, the
 * intent it serves and why (HUB_NOTES, below).
 *
 * Month 4 after the election, Lena holds no office: Kai is the new Governor, Brix the Sheriff. Every rule number comes
 * from @mule/engine's config (the drone's fee and plots, the offices' pay, the election months, a plot's score).
 *
 * GRAFT TARGET: apps/web/src/phone/hub/ (Hub.tsx's stage and rail, today.tsx's agenda and drone slots, tools.tsx's
 * DroneRail and DroneAction) and apps/web/src/phone/Shell.tsx's header. Drop every IntentMarker.
 */

/** The audit's seven proposals for this screen, as the review page explains them. */
export const HUB_NOTES = {
  H1: {
    id: 'H1',
    n: 1,
    title: 'A month roadmap',
    what: "At the top of the map, the month's steps in order with this one lit, one plain line on what to do now and what comes next, and the offices folded into a short line under it.",
    serves: '1',
    intent: 'Find out what I should do this month',
    why: "“Plan your month” never said what planning is for, and nothing showed the month's order (land grant, develop, produce, auction), so a newcomer could not say what comes after this screen.",
    differs: 'the land auction is a step too, because it runs this month (two plots are up for sale); in a month with none, the step is not drawn.',
  },
  H2: {
    id: 'H2',
    n: 2,
    title: 'Needs on the stage',
    what: 'A strip under the roadmap: each good you need this month against what you hold, red when you are short. Tap it and the Colony desk opens at the full list.',
    serves: '2',
    intent: 'Enough Food and Energy next month',
    why: 'The needs sat in the Colony desk below the Now card and the desk tabs; on the phone the rail had to scroll (414 px of content in 199) to reach them.',
    differs: '“This month you need”, not “Next month you eat”: Energy is not eaten, and the engine counts this month’s need, the same number the Colony desk’s list shows under that name.',
  },
  H3: {
    id: 'H3',
    n: 3,
    title: 'The drone says what it does',
    what: 'An eye-slash “Only you” replaces the lock (here on every “only you see this”); with the drone open the rail says “Tap up to 2 free plots”; the button counts the plots and says the second one is in the price. Try it: tap free plots on the map. While the drone is open its hint and button take the rail, so the desk tabs are one scroll down until you send it or pick another tool.',
    serves: '3',
    intent: 'Scout free plots with the drone',
    why: 'The lock on “Geo drone” reads “locked”, not “only you see this”; the phone had no “tap a plot” hint (laptop only); and the drone flew with 1 of its 2 plots at the full 60 cr with no “pick one more”.',
    elsewhere: 'the land grant’s rail says “Your drone: 10·5 Plains, often good for Food and Energy” while that plot is lit, so the result shows where it was promised.',
  },
  H4: {
    id: 'H4',
    n: 4,
    title: 'Standings',
    what: '“2nd of 4” under your money; tap either for the standings: rank, creature, name, money, land, goods and worth.',
    serves: '6',
    intent: "See how I'm doing against the others",
    why: "Nothing in planning ranked the players, on the phone or the TV, and others' money was not shown; “who's winning?” was a newcomer's own top question.",
    differs: 'under the money, not beside it: beside it, on a phone’s rail, it pushed your name down to “L”.',
    elsewhere: "the TV's ready list gains each player's rank.",
    open:
      'others’ goods are private today, so the rank is money plus land (300 cr a plot, the score’s own value), and their Goods say “secret”. Show goods for everyone, or keep them secret until each good’s auction?',
  },
  H5: {
    id: 'H5',
    n: 5,
    title: 'The colony fund in one card',
    what: 'First in the Colony desk: how much is in the fund, what fills it (the sales tax) and what it pays out each month (the Governor and the Sheriff).',
    serves: '7',
    intent: 'The colony fund, how much and where it goes',
    why: 'The fund and its two pay lines sat in the last block of the Colony desk, 1–2 scrolls down, and that the sales tax fills it was a separate line.',
  },
  H6: {
    id: 'H6',
    n: 6,
    title: 'Plain words',
    what: '“Governor: Kai, until month 6”, “Next election: month 7”, “Export ship in month 6: it buys the colony’s leftovers”. No codes left on this screen.',
    serves: '1 (cross-cutting)',
    intent: 'Find out what I should do this month',
    why: '“M1–3”, “NEXT ELECTION M4” and “EXPORT SHIP IN MONTH 3” are codes: which ship, and why should I care?',
    differs: 'month 7, not month 4: this is month 4 after its election, so the next one is in month 7 (elections in months 1, 4, 7 and 10).',
  },
  H7: {
    id: 'H7',
    n: 7,
    title: 'Room on the phone',
    what: 'Once read, the Now card folds to its title; tap it to read it again, and a new step opens it. The five desk tabs sit on one row. On a phone the map’s tools stand beside the map, in the room its shape leaves, so the roadmap and the needs cost the map little (259 × 156 against 287 × 172).',
    serves: '1 and 2 (cross-cutting)',
    intent: 'Find out what I should do this month · Enough Food and Energy next month',
    why: 'At 844 × 390 the open Now card left the desk tab row half cut off at the bottom of the rail.',
  },
} satisfies Record<string, IntentNoteData>;

const N = HUB_NOTES;

/** Lots in this month's land auction: the Market desk's "Up for auction this month" (Brix's plot and a colony plot). */
const LOTS_THIS_MONTH = 2;

/** The month in order, as the engine runs it (game.ts ORDER); the land auction only in a month with a lot. */
const STEPS: { id: string; label: string; show: boolean }[] = [
  { id: 'plan', label: 'Plan', show: true },
  { id: 'grant', label: 'Land grant', show: true },
  { id: 'land', label: 'Land auction', show: LOTS_THIS_MONTH > 0 },
  { id: 'develop', label: 'Develop', show: true },
  { id: 'produce', label: 'Produce', show: true },
  { id: 'auction', label: 'Goods auction', show: true },
];

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/**
 * Public worth: money plus land at a plot's score, what everyone can see, and the measure the engine already ranks
 * players by (events.ts pickStart). derive's standings() ranks by money alone; goods are private until game over.
 */
export function worthStandings(view: MuleView) {
  return view.players
    .map((p) => ({ player: p, slot: toSlot(p.slot), land: p.plots * GAME.plotScore, worth: p.money + p.plots * GAME.plotScore }))
    .sort((a, b) => b.worth - a.worth);
}

/** After this month's election: who holds what, until when, and when the next vote is. */
function offices(month: number) {
  const next = POLITICS.electionMonths.find((m) => m > month);
  return { governor: 'kai', sheriff: 'brix', until: next ? next - 1 : null, next: next ?? null };
}

// --- H-1 · the month roadmap ------------------------------------------------------------------

function Roadmap({ month, ready }: { month: number; ready: boolean }) {
  const steps = STEPS.filter((s) => s.show);
  const o = offices(month);
  return (
    <section
      className="relative flex flex-col gap-1 rounded-panel border border-holo-line bg-panel px-2 py-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3"
      aria-label={`Month ${month}: step 1 of ${steps.length}, planning`}
      data-testid="roadmap"
    >
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 @min-[1100px]/shell:gap-x-2" data-testid="roadmap-steps">
        {steps.map((s, i) => (
          <li key={s.id} className="flex shrink-0 items-center gap-1 @min-[1100px]/shell:gap-2" aria-current={i === 0 ? 'step' : undefined} data-testid={`step-${s.id}`}>
            {i > 0 && (
              <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} className="text-ink-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            <span
              className={cx(
                'whitespace-nowrap rounded-chip text-[11px] font-semibold leading-5 @min-[1100px]/shell:text-base @min-[1100px]/shell:leading-8',
                i === 0 ? 'bg-holo px-1.5 text-on-holo @min-[1100px]/shell:px-3' : 'text-ink-2',
              )}
            >
              {i === 0 && <span className="sr-only">Now: </span>}
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] leading-snug @min-[1100px]/shell:text-base" data-testid="roadmap-now">
        {ready ? (
          <>
            <strong className="text-holo">Now:</strong> you're ready; the rest are still planning. <strong>Next:</strong> the land grant, where you claim up to {GAME.claimsPerGrant} free plots.
          </>
        ) : (
          <>
            <strong className="text-holo">Now:</strong> look around, scout land if you like, then press Ready. <strong>Next:</strong> you claim up to {GAME.claimsPerGrant} free plots.
          </>
        )}
      </p>
      <p className="relative flex flex-wrap items-center gap-x-1 text-[11px] text-ink-2 @min-[1100px]/shell:gap-x-1.5 @min-[1100px]/shell:text-sm" data-testid="roadmap-offices">
        <span data-testid="office-governor">
          Governor: <Who id={o.governor} size={12} />
          {o.until && `, until month ${o.until}`}
        </span>
        ·
        <span data-testid="office-sheriff">
          Sheriff: <Who id={o.sheriff} size={12} />
        </span>
        {o.next && (
          <>
            · <span data-testid="next-election">Next election: month {o.next}</span>
          </>
        )}
        <IntentMarker note={N.H6} part="offices" at="tr" />
      </p>
      <IntentMarker note={N.H1} />
    </section>
  );
}

// --- H-2 · the needs strip --------------------------------------------------------------------

const STRIP_ORDER = ['food', 'energy', 'water'] as const;

function NeedsStrip({ onOpen }: { onOpen: (el: Element) => void }) {
  const rows = STRIP_ORDER.map((g) => NEEDS.find((n) => n.good === g)!);
  const short = rows.filter((n) => n.have < n.need);
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className={cx(
        'relative flex items-center gap-x-2 whitespace-nowrap rounded-control border bg-panel px-2 py-1 text-left text-[11px] hover:border-holo @min-[1100px]/shell:gap-x-4 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-base',
        short.length > 0 ? 'border-alert/60' : 'border-holo-line',
      )}
      aria-label={`This month you need: ${rows.map((n) => `${GOOD_NAME[n.good]}, ${n.have} of ${n.need}${n.have < n.need ? `, short ${n.need - n.have}` : ''}`).join('; ')}. Opens the Colony desk.`}
      data-testid="needs-strip"
    >
      <span className="font-semibold text-ink-2">This month you need</span>
      {rows.map((n) => {
        const ok = n.have >= n.need;
        return (
          <span key={n.good} className={cx('flex items-center gap-1', ok ? 'text-ink' : 'font-semibold text-alert')} data-testid={`strip-${n.good}`}>
            <GoodIcon good={n.good} size={14} />
            {GOOD_NAME[n.good]}
            <span data-num className="font-mono font-bold">
              {n.have} of {n.need}
            </span>
            {ok ? <span className="text-ok">✓</span> : <span>short {n.need - n.have}</span>}
          </span>
        );
      })}
      <span aria-hidden className="ml-auto text-holo">
        ›
      </span>
      <IntentMarker note={N.H2} />
    </button>
  );
}

// --- This month (the approved agenda, with H-3's chip and H-6's ship line) ---------------------

function Agenda({ sent, onDesk, onTool }: { sent: boolean; onDesk: (d: Desk) => void; onTool: (t: Tool) => void }) {
  const { view } = usePhoneGame();
  const items: { key: string; title: string; sub: string; status: Status; slice?: number; only?: boolean; go: () => void }[] = [
    { key: 'law', title: 'Law vote', sub: 'Pollution tax: 20 cr a point', status: 'soon', slice: 2, go: () => onDesk('council') },
    { key: 'deals', title: '2 deal offers', sub: 'Ossa, Kai', status: 'soon', slice: 3, only: true, go: () => onDesk('talk') },
    { key: 'drone', title: 'Geo drone', sub: sent ? 'On its way · read at the land grant' : `${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`, status: 'today', only: true, go: () => onTool('drone') },
    { key: 'list', title: 'Sell a plot or MULE', sub: 'At the auction after planning', status: 'today', go: () => onDesk('market') },
    { key: 'sabotage', title: 'Sabotage', sub: 'One secret order', status: 'soon', slice: 4, only: true, go: () => onDesk('secret') },
  ];
  return (
    <section className="flex flex-col gap-1" data-testid="agenda">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps shrink-0 text-[10px]! @min-[1100px]/shell:text-sm!">This month</span>
        <span className="relative min-w-0">
          <span className="block truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm" data-testid="ship-line">
            Export ship in month {view.ship.arrives}: it buys the colony’s leftovers
          </span>
          <IntentMarker note={N.H6} part="ship" at="left" />
        </span>
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1 @min-[1100px]/shell:grid @min-[1100px]/shell:grid-cols-[repeat(auto-fit,minmax(0,1fr))] @min-[1100px]/shell:grid-flow-col @min-[1100px]/shell:gap-2 @min-[1100px]/shell:overflow-visible">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.go}
            className="relative flex min-w-[124px] shrink-0 flex-col items-start gap-0.5 rounded-control border border-holo-line bg-panel px-2 py-1 text-left hover:border-holo @min-[1100px]/shell:min-w-0 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2"
            data-testid={`agenda-${it.key}`}
          >
            <span className="flex w-full flex-wrap items-center gap-x-1">
              <span className="truncate text-xs font-semibold @min-[1100px]/shell:text-base">{it.title}</span>
              {it.only && <Private text="Only you" />}
            </span>
            <span className="truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm">{it.sub}</span>
            {it.status !== 'today' && <Soon part={it.status === 'part'} {...(it.slice ? { slice: it.slice } : {})} />}
            {it.key === 'drone' && <IntentMarker note={N.H3} part="card" at="br-in" />}
          </button>
        ))}
      </div>
    </section>
  );
}

// --- H-3 · the drone, in the rail and the footer ------------------------------------------------

function DronePanel({ picked, sent }: { picked: { x: number; y: number }[]; sent: boolean }) {
  const { view } = usePhoneGame();
  const last = picked.at(-1);
  const lastTile = last ? tileAt(view, last.x, last.y) : undefined;
  return (
    <section className="relative flex flex-col gap-1 rounded-control border border-holo bg-panel p-2 @min-[1100px]/shell:gap-1.5 @min-[1100px]/shell:p-3" data-testid="drone-panel">
      <span className="flex items-center gap-1.5">
        <span className="font-display text-sm font-semibold @min-[1100px]/shell:text-lg" data-testid="drone-hint">
          {sent ? 'Your drone is on its way' : `Tap up to ${DEVELOPMENT.dronePlots} free plots`}
        </span>
        <Private text="Only you" />
      </span>
      <span className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm">
        {sent
          ? 'Only you see what it finds, when the land grant starts.'
          : `The drone reads their ground from orbit for ${DEVELOPMENT.droneFee} cr, before anyone claims them. Only you see what it finds, at the land grant.`}
      </span>
      {lastTile && (
        <span className="border-t border-holo-faint pt-1 text-[11px] leading-snug @min-[1100px]/shell:text-sm" data-testid="drone-pick">
          <strong className="font-semibold">
            Plot {plotName(lastTile.x, lastTile.y)} · {TERRAIN_NAME[lastTile.terrain]}
          </strong>{' '}
          <span className="text-ink-2">{TERRAIN_ODDS[lastTile.terrain]}</span>
        </span>
      )}
      <IntentMarker note={N.H3} part="hint" />
    </section>
  );
}

function DroneSend({ picked, onSend }: { picked: number; onSend: () => void }) {
  const left = DEVELOPMENT.dronePlots - picked;
  return (
    <div className="relative flex flex-col gap-1">
      <Button size="md" className="w-full whitespace-nowrap px-1.5 text-xs! tracking-tight @min-[1100px]/shell:text-base! @min-[1100px]/shell:tracking-normal" disabled={picked === 0} onClick={onSend} data-testid="drone-send">
        {picked === 0 ? 'Pick a free plot for the drone' : `Send the drone · ${picked} of ${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`}
      </Button>
      {picked > 0 && left > 0 && (
        <span className="text-[11px] leading-snug text-warn @min-[1100px]/shell:text-sm" data-testid="drone-one-more">
          Pick {left} more: {left === 1 ? 'it costs' : 'they cost'} nothing extra.
        </span>
      )}
      <IntentMarker note={N.H3} part="send" />
    </div>
  );
}

// --- H-4 · standings ----------------------------------------------------------------------------

/** Your place, for the shell's header: "2nd of 4" under your money. */
function useStanding(onOpen: () => void) {
  const { view, self } = usePhoneGame();
  const rank = worthStandings(view).findIndex((r) => r.player.id === self.id) + 1;
  const label = `${ordinal(rank)} of ${view.players.length}`;
  return { label, aria: `You're ${label}. Open the standings.`, onOpen, mark: <IntentMarker note={N.H4} at="left" /> };
}

function StandingsSheet({ onClose }: { onClose: () => void }) {
  const { view, self, me } = usePhoneGame();
  const rows = worthStandings(view);
  const units = Object.values(me.stock).reduce((a, b) => a + b, 0);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="standings-title" data-testid="standings-sheet">
      <div className="relative flex w-full max-w-[560px] flex-col gap-2 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]/shell:max-w-[720px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6">
        <header className="flex items-center justify-between gap-2">
          <h2 id="standings-title" className="font-display text-lg font-semibold @min-[1100px]/shell:text-3xl">
            Standings · month {view.month}
          </h2>
          <Button size="md" variant="ghost" onClick={onClose} data-testid="standings-close">
            Close
          </Button>
        </header>
        <table className="w-full text-left text-sm @min-[1100px]/shell:text-lg" data-testid="standings-table">
          <thead className="text-xs text-ink-3 @min-[1100px]/shell:text-sm">
            <tr>
              <th className="w-6 font-normal">#</th>
              <th className="font-normal">Player</th>
              <th className="text-right font-normal">Money</th>
              <th className="text-right font-normal">Land</th>
              <th className="text-right font-normal">Goods</th>
              <th className="text-right font-semibold text-ink">Worth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const mine = r.player.id === self.id;
              return (
                <tr key={r.player.id} className={cx('border-t border-holo-faint', mine && 'bg-holo-soft')} data-testid={`standing-${r.player.id}`}>
                  <td data-num className="py-1 font-mono text-ink-3 @min-[1100px]/shell:py-2">
                    {i + 1}
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Creature species={r.player.species} color={SLOT_COLOR[r.slot]} size={18} />
                      {mine ? `You (${r.player.name})` : r.player.name}
                    </span>
                  </td>
                  <td data-num className="text-right font-mono">
                    {fmt(r.player.money)}
                  </td>
                  <td data-num className="text-right font-mono" title={`${fmt(r.land)} cr at ${GAME.plotScore} cr a plot`}>
                    {r.player.plots} plots
                  </td>
                  <td className="text-right">
                    {mine ? (
                      <span data-num className="font-mono">
                        {units} units
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs text-ink-3 @min-[1100px]/shell:text-sm" data-testid={`goods-secret-${r.player.id}`}>
                        <EyeOff /> secret
                      </span>
                    )}
                  </td>
                  <td data-num className="text-right font-mono font-bold">
                    {fmt(r.worth)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs leading-snug text-ink-2 @min-[1100px]/shell:text-base" data-testid="standings-rule">
          Worth is money plus land at {GAME.plotScore} cr a plot: what everyone can see. Goods stay secret until their auction, where everyone's stock of that good shows; at the end of the game they count too.
        </p>
        <IntentMarker note={N.H4} part="sheet" />
      </div>
    </div>
  );
}

// --- H-5 · the Colony desk, the fund first --------------------------------------------------------

function FundCard() {
  const { view } = usePhoneGame();
  const o = offices(view.month);
  return (
    <section className="relative flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4" data-testid="fund-card">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps shrink-0 text-[10px]! @min-[1100px]/shell:text-xs!">Colony fund</span>
        <span data-num className="shrink-0 whitespace-nowrap font-mono text-lg font-bold @min-[1100px]/shell:text-2xl" data-testid="fund-total">
          {fmt(view.treasury.money)} cr
        </span>
      </span>
      <span className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5 text-xs @min-[1100px]/shell:text-sm">
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">In</span>
        <span data-testid="fund-in">
          the {Math.round(view.treasury.salesTax * 100)}% sales tax on every sale; <Who id={o.governor} size={12} />, the Governor, sets it
        </span>
        <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Out</span>
        <span data-testid="fund-out">
          Governor {POLITICS.pay.governor} cr, Sheriff {POLITICS.pay.sheriff} cr, every month
        </span>
      </span>
      <span>
        <Soon slice={1} />
      </span>
      <IntentMarker note={N.H5} />
    </section>
  );
}

function ColonyDesk() {
  const { view } = usePhoneGame();
  return (
    <>
      <FundCard />
      <ThisMonth />
      <News />
      <Section title="Colony" badge={<Soon slice={1} />} testid="colony-facts">
        <ul className="flex flex-col gap-1 text-sm">
          <li data-testid="land-baron">
            Land Baron <Who id="ossa" />: whoever owns the most plots, checked every planning phase. +1 vote, and breaks a tied election.
          </li>
          <li>
            Air {view.air.level} · {view.air.band}
          </li>
        </ul>
      </Section>
    </>
  );
}

// --- The hub ----------------------------------------------------------------------------------


type ToolRow = { id: Tool; label: string; status: Status; only?: boolean };

/**
 * The map and its tools. On a phone the tools stand beside the map, in the room its shape leaves (H-7); on a laptop,
 * above it, with the tool's hint. A child of the shell, so it knows the shell's width.
 */
function ToolsAndMap({ tools, tool, setTool, hint, tiles, onTile, selected }: { tools: ToolRow[]; tool: Tool; setTool: (t: Tool) => void; hint: string | undefined; tiles: MapTile[]; onTile: (t: MapTile) => void; selected: { x: number; y: number } | null }) {
  const wide = useWide();
  return (
    <div className="flex min-h-0 flex-1 gap-2 @min-[1100px]/shell:flex-col @min-[1100px]/shell:gap-4">
      <div className="flex shrink-0 flex-col items-stretch gap-1 @min-[1100px]/shell:flex-row @min-[1100px]/shell:flex-wrap @min-[1100px]/shell:items-center" role="toolbar" aria-label="Map tools" data-testid="map-tools">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={cx(
              'relative flex h-7 items-center gap-1 rounded-control border px-2 text-[11px] font-semibold @min-[1100px]/shell:h-9 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-sm',
              tool === t.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
            )}
            data-testid={`tool-${t.id}`}
          >
            {t.label}
            {t.only && <Private text={t.id === 'drone' ? 'Only you' : ''} />}
            {t.status === 'soon' && <span className="size-1.5 rounded-full bg-warn" aria-label="soon" />}
            {t.id === 'drone' && <IntentMarker note={N.H3} part="tool" at="tr" />}
          </button>
        ))}
        {/* The drone's hint is in the rail on every screen now (H-3); the other tools keep theirs here on a laptop. */}
        {wide && hint && <span className="ml-2 text-sm text-ink-2">{hint}</span>}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="hub-map">
        <MapFit width={W} height={H}>
          <HoloMap width={W} height={H} tiles={tiles} onTile={onTile} focusSlot={0} density={wide ? 'tv' : 'phone'} selected={selected} />
        </MapFit>
      </div>
    </div>
  );
}

const free = (t: MapTile) => t.owner === null && t.terrain !== 'store';

export function HubAudit({
  desk: startDesk = 'colony',
  tool: startTool = 'look',
  picked: startPicked = [],
  standings: startStandings = false,
}: {
  desk?: Desk;
  tool?: Tool;
  /** Mock only: plots already picked for the drone (#audit-hub-drone). */
  picked?: { x: number; y: number }[];
  /** Mock only: open with the standings sheet showing (#audit-hub-standings). */
  standings?: boolean;
}) {
  const { view } = usePhoneGame();
  const [ready, setReady] = useState(false);
  const { players, others, isHost } = useWaiting(ready);
  const [desk, setDesk] = useState<Desk>(startDesk);
  const [tool, setTool] = useState<Tool>(startTool);
  const [picked, setPicked] = useState(startPicked);
  const [sent, setSent] = useState(false);
  const [sheet, setSheet] = useState(startStandings);
  const desks = DESKS.filter((d) => !d.office);
  const standing = useStanding(() => setSheet(true));
  const now: Now = ready ? readyNow(others, isHost) : { title: 'Plan your month, then press Ready', detail: `Next is the land grant. ${PLAYER[offices(view.month).governor]!.name}, the new Governor, is setting the tax.` };

  const openNeeds = (el: Element) => {
    setDesk('colony');
    // The full list sits second in the Colony desk, under the fund: bring it into the rail's view.
    requestAnimationFrame(() => el.closest('[data-testid="game-shell"]')?.querySelector('[data-testid="this-month"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const onTile = (t: MapTile) => {
    if (tool !== 'drone' || sent || !free(t)) return;
    setPicked((p) => (p.some((q) => q.x === t.x && q.y === t.y) ? p.filter((q) => q.x !== t.x || q.y !== t.y) : [...p, { x: t.x, y: t.y }].slice(-DEVELOPMENT.dronePlots)));
  };
  const tiles: MapTile[] = mapTiles(view).map((t) =>
    tool === 'drone' && picked.some((p) => p.x === t.x && p.y === t.y) ? { ...t, flag: 'survey' } : tool === 'target' && t.x === 11 && t.y === 2 ? { ...t, flag: 'sabotage' } : tool === 'list' && t.x === 5 && t.y === 6 ? { ...t, flag: 'sale' } : t,
  );
  const selected = tool === 'drone' ? (picked.at(-1) ?? null) : tool === 'target' ? { x: 11, y: 2 } : tool === 'list' ? { x: 5, y: 6 } : null;
  const tools: (ToolRow & { show: boolean })[] = [
    { id: 'look', label: 'Look', status: 'today', show: true },
    { id: 'drone', label: 'Geo drone', status: 'today', only: true, show: true },
    { id: 'list', label: 'Sell a plot', status: 'today', show: true },
    { id: 'factory', label: 'Plan a factory', status: 'soon', show: true },
    { id: 'target', label: 'Target', status: 'soon', only: true, show: desk === 'secret' || tool === 'target' },
  ];
  const hint: Partial<Record<Tool, string>> = {
    look: 'Tap a plot to see what it can make and who owns it.',
    list: 'Tap a plot of yours (or one with your MULE) to put it up for the auction.',
    factory: 'Tap a plot: see what a factory there would need and which neighbours feed it.',
    target: 'Tap the plot to sabotage. Nobody sees this.',
  };
  const deskBody =
    desk === 'colony' ? <ColonyDesk /> : desk === 'talk' ? <TalkDesk /> : desk === 'council' ? <CouncilDesk election="ballot" /> : desk === 'market' ? <MarketDesk onTool={setTool} /> : <SecretDesk onTool={setTool} />;

  return (
    <OnlyYouLook.Provider value="eye">
      <PlainWords.Provider value>
        <GameShell
          phase="Planning"
          status={<ReadyCount players={players} />}
          now={now}
          foldNow
          nowMark={<IntentMarker note={N.H7} part="now" />}
          standing={standing}
          rail={
            <>
              {tool === 'drone' && <DronePanel picked={picked} sent={sent} />}
              <div role="tablist" aria-label="Desks" className={cx('relative grid gap-1', desks.length > 5 ? 'grid-cols-4' : 'grid-cols-5')} data-testid="desks">
                {desks.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="tab"
                    aria-selected={desk === d.id}
                    onClick={() => setDesk(d.id)}
                    className={cx(
                      'relative flex flex-col items-center gap-0.5 rounded-control border px-0.5 py-1 text-[10px] font-semibold @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xs',
                      desk === d.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
                    )}
                    data-testid={`desk-${d.id}`}
                  >
                    <Glyph d={ICON[d.id]} size={16} />
                    {d.label}
                    {d.status !== 'today' && <span className={cx('absolute right-1 top-1 size-1.5 rounded-full', d.status === 'part' ? 'bg-warn/60' : 'bg-warn')} />}
                    {d.locked && (
                      <span className="absolute left-1 top-1 text-holo" role="img" aria-label="Only you see this">
                        <EyeOff size={9} strokeWidth={2.6} />
                      </span>
                    )}
                  </button>
                ))}
                <IntentMarker note={N.H7} part="desks" at="tr" />
              </div>
              <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${desk}`}>
                {deskBody}
              </div>
            </>
          }
          footer={
            <>
              {tool === 'drone' && !sent && <DroneSend picked={picked.length} onSend={() => setSent(true)} />}
              <ReadyBar ready={ready} onReady={() => setReady(true)} planningProper />
            </>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
            <Roadmap month={view.month} ready={ready} />
            <NeedsStrip onOpen={openNeeds} />
            <Agenda sent={sent} onDesk={setDesk} onTool={setTool} />
            <ToolsAndMap tools={tools.filter((t) => t.show)} tool={tool} setTool={setTool} hint={hint[tool]} tiles={tiles} onTile={onTile} selected={selected} />
            <div className="hidden @min-[1100px]/shell:block">
              <MarketStrip />
            </div>
          </div>
          {sheet && <StandingsSheet onClose={() => setSheet(false)} />}
        </GameShell>
      </PlainWords.Provider>
    </OnlyYouLook.Provider>
  );
}
