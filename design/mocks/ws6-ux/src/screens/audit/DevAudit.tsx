import type { Good, RawGood } from '@mule/engine';
import { Button, cx, GOOD_NAME, GoodIcon, HoloMap, MuleIcon, PlayerMark, type Slot } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { mapTiles, slotOf } from '../../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../../apps/web/src/phone/Shell';
import { H, W } from '../../fixture';
import { Game } from '../../harness';
import { ConditionProvider, ConditionVariant, paceOf } from '../../proposed/Condition';
import { GameShell, useWide, type Now } from '../../proposed/GameShell';
import { HallWalker } from '../../proposed/Hall';
import { IntentMarker, type IntentNoteData } from '../../proposed/IntentNote';
import { DevHall, type Spot, type SuitMark } from './dev/DevHall';
import { bestHere, conditions, devView, key, PLAINS, pips, plotTitle, same, STORE, suits, suitsLine, TUNDRA } from './dev/fixture';
import { ClockRow, DecisionFlag, Dots, KeysPanel, PaceBlock, PlotsStrip, Readout, Two, type Arrow, type PlotRow } from './dev/parts';
import { ANALYSE, FIRST_MULE_AT, FULL, route, useDevTurn, type Cell, type Turn, type TurnStart } from './dev/turn';

/**
 * Development after the UX audit (docs/research/2026-10-28-ws6-ux-audit.md §6, proposals V-1…V-8), for Heiko's
 * approval. Built from the approved development mocks (#dev, #dev-installed, #dev-hungry…, #store, #tv-develop): the
 * GameShell, the hall (forked to dev/DevHall.tsx for V-1 and V-2), HallWalker, the MULE, the condition tags and the
 * TimeBar are reused as they are; only what a proposal changes is drawn here. Each change carries a numbered
 * IntentMarker; the review page lists, per number, the intent it serves and why (DEV_NOTES, below).
 *
 * Month 2, Lena: Plains 4·1 (no MULE), Tundra 3·4 (an Energy MULE on ground that reads Water 3 of 4, Energy 1 of 4),
 * Crater 15·1 (no MULE). She ate 1 of the 3 Food she needs: pace 47%. #first-month is month 1.
 *
 * GRAFT TARGET: apps/web/src/phone/Develop.tsx (WS4's file; WS6's changes go in as named edits WS4 reviews, SEAMS
 * 2026-10-21, PR-4), apps/web/src/phone/next-step.ts (RULE-7, WS6's: rows 2, 5 and 7 change), the walk itself (WS3's
 * server walk), packages/ui Store.tsx (the hall). Drop every IntentMarker and DecisionFlag.
 */

/** The audit's eight proposals for development, as the review page explains them. */
export const DEV_NOTES = {
  V1: {
    id: 'V1',
    n: 1,
    title: 'Walking you can see and steer',
    what: 'Your colonist is drawn on the phone’s map. Tapping a plot only offers the walk, “Walk here · 4 s”, with a dotted path from where you stand; Install and Analyse appear once you are there, never before. On a laptop the arrow keys walk you a plot at a time, and the rail says so. Every room, door and plot says you walk there first: the glowing room says “WALK 1.4s”, the doors “WALK OUT”, and a tap dots your way across the floor.',
    serves: '11 and 3',
    intent: 'Move my colonist · Walk my MULE to my plot and set it up',
    why: 'Heiko, playing on his Mac, asked twice “how do I walk?”: walking only happened as a side effect of a tap, his colonist wasn’t drawn on the phone’s map, the arrow keys did nothing, and “Install here” was lit before he arrived, then did nothing.',
    differs: 'Store and Pub on the map say the walk too (“walk 4 s”), and the Pub button walks you there: under V-1 nothing acts at a distance. On a phone the rail drops the “MULE in tow” row while you are on the map: your colonist leads the MULE there for all to see.',
  },
  V2: {
    id: 'V2',
    n: 2,
    title: 'Your plots, and what each suits, while you choose',
    what: 'Above the shops: each of your plots, what it suits (from its analysis, else its land) and whether it has a MULE. Each outfitter marks the plots of yours that suit its good, dashed with a MULE where one already stands. Walking out, the guide takes the MULE to the best of your free plots for its good.',
    serves: '4',
    intent: 'Know which of my plots is best for which good',
    why: 'Nothing named your plots or what they suit while you chose, and the guide sent an Energy MULE to the hills when the plains suited it: it picks the nearest plot with no MULE.',
    differs: 'On Lena’s map the best free plot for Energy, Plains 4·1, is also the nearest, so here the old rule and the new one agree; the rule is in dev/fixture.ts bestFreePlot (RULE-7 row 5, WS6’s).',
  },
  V3: {
    id: 'V3',
    n: 3,
    title: 'Analyse before you install, in words',
    what: 'Arriving with a MULE on a plot nobody has analysed, “Analyse first · 8 s” stands beside Install. The readout names every good (Food, Water, Energy, Smithore, Crystite, Rare earth) and says what is best here; when that is not your MULE’s good, it says so: “Your MULE makes Energy; this plot is best for Water”. Every time shown includes the walk: “Walk + analyse · 12 s” from 4 s away.',
    serves: '4 and 5',
    intent: 'Know which of my plots is best for which good · Check what’s underground, and what it costs in time',
    why: 'The readout’s labels were codes (H2O, NRG, ORE, CRY, REE), the 8 s left out the walk, and the audit put an Energy MULE where the plot reads Water 3 of 4, Energy 1 of 4, finding out only by analysing afterwards.',
    differs: 'the plot’s card opens over the map, on the half away from the plot, at every size: today it sits in the rail, which on a phone has no room for the readout, a swap and the filter beside the Now card (a plot with a MULE needs about 300 px; the rail has 185 to 237).',
  },
  V4: {
    id: 'V4',
    n: 4,
    title: 'Say how to swap a MULE',
    what: 'On a plot with a MULE: “Swap it: bring a new MULE here; the old one runs away.” With a new MULE in tow there, the button says so: “Swap · your Energy MULE runs away”.',
    serves: '10',
    intent: 'Change what a MULE makes, or move it to another plot',
    why: 'There was no button and no word for it: the only way is a new MULE installed over the old one, which then runs away, a rule the screen never states; moving a MULE isn’t possible.',
    rule: 'Leading a MULE back to the store to re-outfit it (or to another plot) would change the rules (WS1, WS3). It is drawn dashed on the plot and does nothing.',
  },
  V5: {
    id: 'V5',
    n: 5,
    title: 'The filter says where Alloy comes from',
    what: 'The filter button, still off with no Alloy, says what it needs and where to get it: “Needs 1 Alloy: buy it at the auction, or make it with a factory MULE at the Works”.',
    serves: '6',
    intent: 'Fit a pollution filter',
    why: '“Fit a filter · 1 Alloy (have 0)” never said that Alloy is made by a factory MULE from Smithore and Energy, or bought at the auction.',
    differs: 'shown on a plot of yours with a MULE, not on every plot of yours as today: a filter on empty land does nothing.',
  },
  V6: {
    id: 'V6',
    n: 6,
    title: 'Your pace, and why',
    what: 'Everyone’s clock and your pace are two things now: the clock across the top of the stage, as the TV has it, and in the rail “Your pace 47%: you ate 1 of the 3 Food you need”, on the phone too, then what to do about it: “Next month: buy 3 Food at the auction, or put a Food MULE on a plot”.',
    serves: '8 and 9',
    intent: 'See how much time I have left, and why I’m slow · Stop being hungry or sick',
    why: '“EVERYONE’S TIME · 47% PACE” read as if everyone were slow; the why was a hover tooltip a phone never shows, the start-of-turn message was gone by the time you looked, and nothing in development said how to eat next month.',
    differs: '“buy 3”, not “buy 2”: Lena ate her only Food (1 of the 3 she needs) and nothing of hers makes Food, so next month she must buy all 3; the mock works it out from her stock and need. On a phone the next-month line opens with a tap on your pace (no hover), so the walk’s buttons keep their room; on a laptop it always shows.',
  },
  V7: {
    id: 'V7',
    n: 7,
    title: 'The guide never sends you where you can’t go',
    what: 'With 66 cr the corral doesn’t glow; it says why (“139 cr · you have 66”), and the guide offers what you can do: “A MULE costs 139 cr; you have 66. Analyse a plot, or end at the pub for ≈114 cr.” The pub and the doors glow instead.',
    serves: '1',
    intent: 'Buy a MULE',
    why: 'In month 2, with 66 cr, the guide still said “Tap the glowing corral: 139 cr”.',
  },
  V8: {
    id: 'V8',
    n: 8,
    title: 'Time for a first month',
    what: 'In the first month the clock waits: “The clock starts when your first MULE is in.” Until then the header shows no countdown and the bar stands full; the TV says whose first MULE is still to come.',
    serves: '3 (the 50 s)',
    intent: 'Walk my MULE to my plot and set it up',
    why: 'At real speed the clock already showed 0:42 of 50 at the first look, and the audit, knowing where everything was, installed with about 5 s left: a newcomer’s first month runs out before the first MULE is in.',
    open: 'A balance decision (WS1’s numbers): Heiko’s. With one clock for everyone, the mock waits for every colonist’s first MULE (it would need a cap, so nobody holds the table). The other ways: each colonist’s clock starts with their own first MULE (one clock no longer, in month 1), or simply a longer first-month clock.',
  },
} satisfies Record<string, IntentNoteData>;

type NoteId = keyof typeof DEV_NOTES;
const N = DEV_NOTES;

export type DevState = 'walk' | 'choose' | 'arrive' | 'arrive-read' | 'swap' | 'pace' | 'first-month';

/** Each state: where the turn opens, and which proposals it shows (their numbers on the screens, their notes beside). */
export const DEV_STATES: Record<DevState, { start: TurnStart; notes: NoteId[] }> = {
  walk: { start: { month: 2, money: 300, place: 'map', leading: 'energy', cell: STORE, selected: PLAINS, elapsed: 6 }, notes: ['V1', 'V3'] },
  choose: { start: { month: 2, money: 300, place: 'store', leading: 'empty', hallAt: 'corral', elapsed: 4 }, notes: ['V2', 'V1'] },
  arrive: { start: { month: 2, money: 300, place: 'map', leading: 'energy', cell: PLAINS, selected: PLAINS, elapsed: 10 }, notes: ['V3', 'V1'] },
  'arrive-read': { start: { month: 2, money: 300, place: 'map', leading: 'energy', cell: PLAINS, selected: PLAINS, elapsed: 18, analysed: [PLAINS] }, notes: ['V3'] },
  swap: { start: { month: 2, money: 300, place: 'map', leading: null, cell: TUNDRA, selected: TUNDRA, elapsed: 12 }, notes: ['V4', 'V5', 'V3'] },
  pace: { start: { month: 2, money: 66, place: 'store', leading: null, hallAt: 'doorL', elapsed: 2 }, notes: ['V6', 'V7'] },
  'first-month': { start: { month: 1, money: 300, place: 'store', leading: null, hallAt: 'doorL', clockWaits: true }, notes: ['V8'] },
};

/** The markers this state shows: a proposal's number appears only on the states that are about it. */
type Mark = (id: NoteId, part?: string, at?: Parameters<typeof IntentMarker>[0]['at']) => ReactNode;

const OUTFIT_NAME = (o: string) => (o === 'greenBelt' ? 'Green belt' : GOOD_NAME[o as Good]);
const secs = (s: number) => `${Math.max(1, Math.round(s))} s`;

/** The guide, RULE-7 with the audit's rows: what to do now, which rooms glow, and why closed ones are closed. */
function guide(turn: Turn): { now: Now; next: Spot[]; locks: Partial<Record<Spot, string>>; open: Spot[] } {
  const { leading, place, money, done, analysing, there, selected, outfitted, waiting, installed, left, pub, view, guidePlot } = turn;
  const price = view.mulePrice;
  const warn = left <= 10 && !waiting && !done;
  const needMule = { food: 'needs a MULE', water: 'needs a MULE', energy: 'needs a MULE', smithore: 'needs a MULE', crystite: 'needs a MULE', rareEarth: 'needs a MULE', works: 'needs a MULE', greenBelt: 'needs a MULE' } as const;
  const broke = money < price;
  // V-7: with too little money the corral is closed and says why; it never glows.
  const locks: Partial<Record<Spot, string>> =
    leading === null
      ? { ...needMule, ...(broke ? { corral: `${price} cr · you have ${money}` } : {}) }
      : leading === 'empty'
        ? { corral: 'one at a time' }
        : { corral: 'one at a time', food: '', water: '', energy: '', smithore: '', crystite: '', rareEarth: '', works: '', greenBelt: '' };
  const open: Spot[] =
    leading === null
      ? [...(broke ? [] : (['corral'] as Spot[])), 'pub', 'doorL', 'doorR']
      : leading === 'empty'
        ? ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'works', 'greenBelt', 'pub', 'doorL', 'doorR']
        : ['pub', 'doorL', 'doorR'];
  const r = (now: Now, next: Spot[] = []) => ({ now: { ...now, warn: now.warn ?? warn }, next, locks, open });
  const tile = turn.tileOf(selected);
  const name = tile ? plotTitle(tile) : '';

  if (done) return r(done.pub ? { title: `+${done.pub} cr at the pub`, detail: 'You cashed out. Your turn is over; the others keep building until the clock runs out.' } : { title: 'Out of time', detail: 'Everyone’s clock ran out. Your turn is over.' });

  // V-7: never "tap the corral" when you can't pay for a MULE.
  const cantBuy = () => r({ title: `A MULE costs ${price} cr; you have ${money}`, detail: `Analyse a plot, or end at the pub for ≈${pub} cr.` }, place === 'store' ? ['pub', 'doorL', 'doorR'] : []);

  if (leading === null && !installed) {
    if (broke) return cantBuy();
    // V-8: the first month's clock waits for the first MULE.
    if (waiting) return r({ step: 1, of: 3, title: 'Buy a MULE at the corral', detail: 'Your first month: no rush. The clock starts when your first MULE is in.' }, ['corral']);
    if (place === 'map') return r({ step: 1, of: 3, title: 'Buy a MULE at the corral', detail: `Walk back into the store: ${price} cr, ${view.storeMules} left.` });
    return r({ step: 1, of: 3, title: 'Buy a MULE at the corral', detail: `Tap it: you walk there, then buy. ${price} cr, ${view.storeMules} left.` }, ['corral']);
  }
  if (leading === 'empty') {
    const need = view.me!.monthNeeds.food;
    const have = view.me!.stock.food;
    return r({ step: 2, of: 3, title: 'Choose what your MULE makes', detail: `Short of Food: need ${need}, have ${have}. Each shop marks your plots that suit it.` }, ['food']);
  }
  if (outfitted) {
    const good = leading as Good;
    const pick = guidePlot ? plotTitle(guidePlot.plot) : null;
    // V-2: the guide names the plot it picks, and why: the best of your free plots for this good.
    if (place === 'store') return r({ step: 3, of: 3, title: 'Walk out and install it', detail: pick ? `Your guide picks ${pick}: the best of your free plots for ${GOOD_NAME[good]}.` : 'Every plot of yours has a MULE: installing on one swaps it.' }, ['doorL', 'doorR']);
    if (turn.routing) return r({ step: 3, of: 3, title: `Walking to ${name || 'the store'}`, detail: 'Its buttons open when you get there.' });
    if (!there && tile) {
      if (same(selected, STORE)) return r({ step: 3, of: 3, title: 'Back into the store?', detail: 'Tap Walk here: you walk there first.' });
      const best = guidePlot && same(guidePlot.plot, tile);
      return r({ step: 3, of: 3, title: `Walk to ${name}`, detail: best ? `The best of your free plots for ${GOOD_NAME[good]}. Tap Walk here: you walk there first.` : tile.owner === 'lena' ? 'Tap Walk here: you walk there first.' : 'You can analyse any plot; a MULE goes only on yours.' });
    }
    if (there && tile?.owner === 'lena') {
      if (analysing) return r({ step: 3, of: 3, title: `Analysing · ${secs(ANALYSE - (turn.t - analysing.from))}`, detail: 'Your colonist reads the ground. Only you see what it finds.' });
      if (tile.outfit) return r({ step: 3, of: 3, title: `Swap your ${OUTFIT_NAME(tile.outfit)} MULE?`, detail: `Installing puts your ${GOOD_NAME[good]} MULE in; the ${OUTFIT_NAME(tile.outfit)} one runs away.` });
      // V-3: analyse before you install; then say whether this plot suits the MULE.
      if (!tile.ground) return r({ step: 3, of: 3, title: 'Analyse first?', detail: `${ANALYSE} s tells you what ${name} is best for, before your ${GOOD_NAME[good]} MULE goes in.` });
      const best = bestHere(tile.ground);
      if (best !== good) return r({ step: 3, of: 3, title: `Best here: ${GOOD_NAME[best]}, not ${GOOD_NAME[good]}`, detail: `${GOOD_NAME[good]} here: ${pips(good as RawGood, tile.ground[good as RawGood])} of 4. Install it anyway, or walk it to another plot of yours.` });
      return r({ step: 3, of: 3, title: `Install your ${GOOD_NAME[good]} MULE here`, detail: `Best here: ${GOOD_NAME[good]}. Installing is instant.` });
    }
    if (there) return r({ step: 3, of: 3, title: 'A MULE goes only on your plot', detail: 'Walk to one of yours, or analyse this one.' });
    return r({ step: 3, of: 3, title: pick ? `Walk to your plot ${pick}` : 'Walk to a plot of yours', detail: 'Tap it on the map: you walk there first.' });
  }
  // Installed this turn.
  if (waiting) {
    const still = Object.entries(FIRST_MULE_AT).filter(([, at]) => at > turn.t).map(([id]) => view.players.find((p) => p.id === id)?.name);
    return r({ title: 'Your MULE is in', detail: still.length ? `The clock starts when every first MULE is in: ${still.join(' and ')} still to come.` : 'Every first MULE is in: the clock starts now.' });
  }
  if (broke) return cantBuy();
  return r({ title: 'MULE installed. What next?', detail: `${Math.ceil(left)} s left on everyone’s clock. Buy another MULE (${price} cr), analyse a plot, or end at the pub for ≈${pub} cr.` }, place === 'store' ? ['corral', 'pub'] : []);
}

/** A row in the rail: the MULE you lead (the approved #dev row). */
function MuleRow({ leading, installed, phone }: { leading: Turn['leading']; installed: boolean; phone: boolean }) {
  const outfitted = leading !== null && leading !== 'empty';
  return (
    <div className={cx('items-center gap-2.5 @min-[1100px]/shell:flex @min-[1100px]/shell:text-lg', phone ? 'flex' : 'hidden')} data-testid="mule">
      <span className={cx('flex items-center', leading === null ? 'text-ink-3' : 'text-ink')}>
        <MuleIcon size={20} />
        {outfitted && <GoodIcon good={leading as Good} size={13} />}
      </span>
      <span className="flex-1 font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg">
        {leading === null ? (installed ? 'MULE installed' : 'No MULE yet') : leading === 'empty' ? 'Empty MULE in tow' : `${GOOD_NAME[leading as Good]} MULE in tow`}
      </span>
    </div>
  );
}

/**
 * The plot you tapped: whose, how far, what is underground (V-3), how to swap (V-4), the filter (V-5). It opens over
 * the half of the map away from the plot, at every size, so the walk stays in view: the rail has no room for it beside
 * the Now card and your pace (a plot with a MULE needs some 300 px; a phone's rail has 185 to 237).
 */
function PlotCard({ turn, mark }: { turn: Turn; mark: Mark }) {
  const wide = useWide();
  const tile = turn.tileOf(turn.selected);
  const sheet = true;
  if (!tile || same(tile, STORE)) return null;
  const mine = tile.owner === 'lena';
  const owner = tile.owner ? turn.view.players.find((p) => p.id === tile.owner) : undefined;
  const steps = route(turn.cell, tile).length;
  const good = turn.outfitted ? (turn.leading as Good) : null;
  const installedGood = tile.outfit && tile.outfit !== 'greenBelt' ? tile.outfit : null;
  const best = tile.ground ? bestHere(tile.ground) : null;
  // V-3: the MULE you lead, or the one standing here, against what the ground is best for.
  const against = good ?? (mine ? installedGood : null);
  const mismatch = best && against && best !== against;
  const alloy = turn.view.me!.stock.alloy;
  return (
    <section
      className={cx(
        'flex flex-col gap-1 @min-[1100px]/shell:gap-2',
        sheet ? cx('absolute top-1 z-[4] max-h-[calc(100%-0.5rem)] w-[48%] overflow-hidden rounded-panel border border-holo-line bg-panel/95 p-2 shadow-map @min-[1100px]/shell:top-3 @min-[1100px]/shell:w-[40%] @min-[1100px]/shell:p-4', tile.x < W / 2 ? 'right-1 @min-[1100px]/shell:right-3' : 'left-1 @min-[1100px]/shell:left-3') : 'relative border-t border-holo-faint pt-3',
      )}
      data-testid="plot-card"
      {...(sheet ? { 'data-side': tile.x < W / 2 ? 'right' : 'left' } : {})}
    >
      <header className="flex items-center justify-between gap-1.5">
        <h2 className="whitespace-nowrap font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-xl" data-testid="plot-title">
          {plotTitle(tile)}
        </h2>
        <span className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-holo @min-[1100px]/shell:text-sm" data-testid="plot-owner">
          {owner && !mine && <PlayerMark slot={(slotOf(turn.view, owner.id) ?? 0) as Slot} size={10} glow={false} />}
          {mine ? (installedGood ? `YOURS · ${GOOD_NAME[installedGood].toUpperCase()} MULE` : 'YOURS · NO MULE') : owner ? owner.name.toUpperCase() : 'FREE'}
        </span>
        {sheet && (
          <button type="button" onClick={() => turn.select(null)} aria-label="Close the plot" className="-my-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-chip text-ink-2 hover:bg-holo-soft hover:text-ink" data-testid="plot-close">
            <svg aria-hidden viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </header>
      {/* V-1: how far, in time, at your pace. */}
      {(steps > 0 || wide) && (
        <span className="relative text-[11px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm" data-testid="plot-distance">
          {turn.routing ? `Walking: ${secs(turn.ahead.length * turn.stepSecs)} to go` : steps === 0 ? 'You’re here.' : `${steps} steps away: ${secs(steps * turn.stepSecs)} at your pace.`}
        </span>
      )}
      {turn.analysing && same(turn.analysing.at, tile) ? (
        <div className="flex flex-col gap-1" data-testid="analysing">
          <span className="text-[11px] text-ink-2 @min-[1100px]/shell:text-sm">Reading the ground… {secs(ANALYSE - (turn.t - turn.analysing.from))}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-holo transition-[width] duration-100 ease-linear" style={{ width: `${Math.min(100, ((turn.t - turn.analysing.from) / ANALYSE) * 100)}%` }} />
          </div>
        </div>
      ) : tile.ground ? (
        <div className="relative">
          <Readout ground={tile.ground} wide={wide} mule={against as RawGood | null} />
          {mark('V3', 'readout', 'tr')}
        </div>
      ) : (
        <span className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm" data-testid="terrain-hint">
          {suitsLine(tile).replace(/^./, (c) => c.toUpperCase())}, by its land. Not analysed.
        </span>
      )}
      {mismatch && (
        <p className="relative rounded-control border border-warn/60 bg-warn/10 py-1 pl-2 pr-3 text-[11px] leading-snug text-ink @min-[1100px]/shell:pr-5 @min-[1100px]/shell:text-sm" data-testid="mismatch">
          {good ? 'Your MULE makes' : 'Your MULE here makes'} <strong>{GOOD_NAME[against as Good]}</strong>; this plot is best for <strong>{GOOD_NAME[best]}</strong>.
          {mark('V3', 'mismatch', 'tr')}
        </p>
      )}
      {mine && installedGood && !good && (
        <>
          {/* V-4: say how to swap. */}
          <p className="relative pr-3 text-[11px] leading-snug text-ink @min-[1100px]/shell:pr-5 @min-[1100px]/shell:text-sm" data-testid="swap-line">
            <strong className="font-semibold">Swap it:</strong> bring a new MULE here; the old one runs away.
            {mark('V4', 'swap', 'tr')}
          </p>
          <span className="relative flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-control border border-dashed border-ink-3 py-0.5 pl-2 pr-3 text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:py-1 @min-[1100px]/shell:text-sm" data-testid="rule-reoutfit">
            Or re-outfit it at the store
            <DecisionFlag testid="flag-reoutfit">Rule change: Heiko’s decision</DecisionFlag>
            {mark('V4', 'rule', 'tr')}
          </span>
          {/* V-5: the filter says where Alloy comes from. */}
          <div className="relative flex items-center gap-2" data-testid="filter">
            <Button size="md" variant="outline" disabled={alloy < 1} className="h-11 shrink-0 px-2 text-xs @min-[1100px]/shell:h-14 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-base" aria-describedby="filter-why" data-testid="filter-button">
              <Two top="Fit a filter" sub={alloy < 1 ? 'needs 1 Alloy' : '1 Alloy'} />
            </Button>
            {alloy < 1 && (
              <span id="filter-why" className="text-[11px] leading-snug text-ink @min-[1100px]/shell:text-sm" data-testid="filter-why">
                Needs 1 Alloy: buy it at the auction, or make it with a factory MULE at the Works.
              </span>
            )}
            {mark('V5', 'filter', 'tl')}
          </div>
        </>
      )}
    </section>
  );
}

/** The colony map with Lena drawn on it (V-1), the walk dotted ahead of her, and the arrow keys on a laptop. */
function MapStage({ turn, mark }: { turn: Turn; mark: Mark }) {
  const wide = useWide();
  const tiles = mapTiles(turn.view);
  const pct = (c: Cell) => ({ x: ((c.x + 0.5) / W) * 100, y: ((c.y + 0.5) / H) * 100 });
  // The walk ahead: while walking, what is left of it; before, the walk Walk here would take.
  const way = turn.selected && !same(turn.cell, turn.selected) ? [turn.cell, ...route(turn.cell, turn.selected)] : [];
  const dots = way.slice(1).flatMap((c, i) => {
    const a = pct(way[i]!);
    const b = pct(c);
    return [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b];
  });
  const end = way.at(-1);
  const me = { id: 'lena', at: pct(turn.cell), walk: turn.moving ? turn.stepSecs : 0, moving: turn.moving, leading: turn.leading, me: true };
  const hint = turn.guidePlot && !turn.selected ? turn.guidePlot.plot : null;
  return (
    <MapFit width={W} height={H}>
      <div
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-holo"
        data-testid="dev-map"
        tabIndex={wide ? 0 : -1}
        aria-label={wide ? 'The colony map. Arrow keys walk you a plot at a time.' : 'The colony map'}
        onKeyDown={(e) => {
          if (!wide || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
          e.preventDefault();
          turn.arrow(e.key as Arrow);
        }}
      >
        <HoloMap width={W} height={H} tiles={tiles} focusSlot={0 as Slot} density={wide ? 'tv' : 'phone'} selected={turn.selected} onTile={(t) => turn.select({ x: t.x, y: t.y })} />
        <Dots at={dots} size="size-1.5 @min-[1100px]/shell:size-2" testid="map-path" />
        {end && dots.length > 0 && (
          <span className="pointer-events-none absolute" style={{ left: `${pct(end).x}%`, top: `${pct(end).y}%` }}>
            {mark('V1', 'path', 'tr')}
          </span>
        )}
        {hint && (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[170%] whitespace-nowrap rounded-full bg-holo px-1.5 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow"
            style={{ left: `${pct(hint).x}%`, top: `${pct(hint).y}%` }}
            data-testid="plot-tap-here"
          >
            WALK HERE
          </span>
        )}
        <PlotCard turn={turn} mark={mark} />
        <div className="pointer-events-none absolute inset-0 z-[3]">
          <HallWalker v={me} wide={wide} />
          <span className="absolute" style={{ left: `${pct(turn.cell).x}%`, top: `${pct(turn.cell).y}%`, transition: `left ${me.walk}s linear, top ${me.walk}s linear` }}>
            {mark('V1', 'colonist', 'bl')}
          </span>
        </div>
      </div>
    </MapFit>
  );
}

/** The hall at the shell's size: the laptop's type and creatures when wide, the phone's otherwise. */
function WideDevHall(props: Omit<Parameters<typeof DevHall>[0], 'wide'>) {
  return <DevHall {...props} wide={useWide()} />;
}

/** The laptop's walk by arrow keys, played once as the page opens (#walk): ← ← ← then ↑ ↑ ↑ ↑ from the store to Plains 4·1. */
function ArrowDemo({ play, stepMs, keys }: { play: (k: Arrow) => void; stepMs: number; keys: Arrow[] }) {
  const wide = useWide();
  useEffect(() => {
    if (!wide) return;
    const ids = keys.map((k, i) => setTimeout(() => play(k), 1600 + i * (stepMs + 140)));
    return () => ids.forEach(clearTimeout);
  }, [wide]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** The footer on the map: walk first (V-1), then the plot's own buttons once you are there (V-3, V-4). */
function MapActions({ turn, mark }: { turn: Turn; mark: Mark }) {
  const tile = turn.tileOf(turn.selected);
  const toStore = route(turn.cell, STORE).length * turn.stepSecs;
  const btn = 'h-11 min-w-0 flex-1 px-1.5 text-xs @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-base';
  const good = turn.outfitted ? (turn.leading as Good) : null;
  let row: ReactNode = null;
  if (turn.routing) {
    row = (
      <Button size="md" variant="outline" disabled className={btn} data-testid="walking">
        <Two top="Walking…" sub={`${secs(turn.ahead.length * turn.stepSecs)} to go`} />
      </Button>
    );
  } else if (tile && !turn.there) {
    const walk = route(turn.cell, tile).length * turn.stepSecs;
    const isStore = same(tile, STORE);
    row = (
      <>
        <span className="relative flex min-w-0 flex-1">
          <Button size="md" className={btn} onClick={() => (isStore ? turn.toStore() : turn.walkTo(tile))} data-testid="walk-here">
            <Two top={isStore ? 'Walk into the store' : 'Walk here'} sub={secs(walk)} />
          </Button>
          {mark('V1', 'walk-here', 'tl')}
        </span>
        {!isStore && !tile.ground && (
          <span className="relative flex min-w-0 flex-1">
            <Button size="md" variant="outline" className={btn} onClick={() => turn.walkAndAnalyse(tile)} data-testid="walk-analyse">
              <Two top="Walk + analyse" sub={secs(walk + ANALYSE)} />
            </Button>
            {mark('V3', 'walk-analyse', 'tr')}
          </span>
        )}
      </>
    );
  } else if (tile && turn.there) {
    const mine = tile.owner === 'lena';
    if (turn.analysing) {
      row = (
        <Button size="md" variant="outline" disabled className={btn} data-testid="analysing-button">
          <Two top="Analysing…" sub={secs(ANALYSE - (turn.t - turn.analysing.from))} />
        </Button>
      );
    } else if (mine && good) {
      const best = tile.ground ? bestHere(tile.ground) : null;
      row = tile.outfit ? (
        <Button size="md" className={btn} onClick={turn.install} data-testid="install">
          <Two top="Swap" sub={`your ${OUTFIT_NAME(tile.outfit)} MULE runs away`} />
        </Button>
      ) : !tile.ground ? (
        <>
          <span className="relative flex min-w-0 flex-1">
            <Button size="md" className={btn} onClick={turn.analyse} data-testid="analyse-first">
              <Two top="Analyse first" sub={secs(ANALYSE)} />
            </Button>
            {mark('V3', 'analyse-first', 'tl')}
          </span>
          <Button size="md" variant="outline" className={btn} onClick={turn.install} data-testid="install">
            <Two top="Install" sub="now" />
          </Button>
        </>
      ) : best !== good ? (
        <Button size="md" variant="outline" className={btn} onClick={turn.install} data-testid="install">
          <Two top="Install anyway" sub={`${GOOD_NAME[good]} ${pips(good as RawGood, tile.ground[good as RawGood])} of 4 here`} />
        </Button>
      ) : (
        <Button size="md" className={btn} onClick={turn.install} data-testid="install">
          <Two top="Install here" sub="instant" />
        </Button>
      );
    } else if (!tile.ground) {
      row = (
        <Button size="md" variant="outline" className={btn} onClick={turn.analyse} data-testid="analyse">
          <Two top="Analyse" sub={secs(ANALYSE)} />
        </Button>
      );
    }
  }
  return (
    <>
      {row && (
        <div className="relative flex gap-2" data-testid="plot-actions">
          {row}
          {turn.there && mark('V1', 'there', 'tr')}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="md" variant="outline" className={btn} disabled={turn.routing} onClick={turn.toStore} data-testid="to-store">
          <Two top="Store" sub={toStore === 0 ? 'step in' : `walk ${secs(toStore)}`} />
        </Button>
        <Button size="md" variant="ghost" className={btn} disabled={turn.routing} onClick={turn.toPub} aria-label="Walk to the pub and end your turn" data-testid="to-pub">
          <Two top="Pub · end turn" sub={`walk ${secs(toStore + turn.hallSecs)}`} />
        </Button>
      </div>
    </>
  );
}

export function DevAudit({ state }: { state: DevState }) {
  const { start, notes } = DEV_STATES[state];
  const [base] = useState(() => devView(start.month, start.money));
  const cond = conditions(start.month);
  const turn = useDevTurn(start, base, cond.lena!);
  const latest = useRef(turn);
  latest.current = turn;
  const [paceOpen, setPaceOpen] = useState(state === 'pace');
  const shown = new Set<NoteId>(notes);
  const mark: Mark = (id, part, at) => (shown.has(id) ? <IntentMarker note={N[id]} {...(part ? { part } : {})} {...(at ? { at } : {})} /> : null);

  const g = guide(turn);
  const outfitted = turn.outfitted;
  const lena = cond.lena!;
  const need = base.me!.monthNeeds.food;
  // V-6: what to do about it next month, from her stock and her need (production.ts needsOf).
  const buy = Math.max(0, need - base.me!.stock.food);
  const nextMonth = lena.ate < lena.need ? `Next month: buy ${buy} Food at the auction, or put a Food MULE on a plot.` : null;

  // V-2: her plots, what each suits, and which shops suit which plot.
  const mine = turn.view.tiles.filter((t) => t.owner === 'lena');
  const rows: PlotRow[] = mine.map((t) => ({ id: key(t), name: plotTitle(t), suits: suitsLine(t), mule: t.outfit ? (t.outfit === 'greenBelt' ? 'other' : (t.outfit as RawGood)) : null }));
  const suitMarks: Partial<Record<Good, SuitMark[]>> = {};
  for (const t of mine) for (const s of suits(t)) (suitMarks[s] ??= []).push({ id: key(t), name: `${t.x + 1}·${t.y + 1}`, mule: !!t.outfit });

  const hallMarks: Parameters<typeof DevHall>[0]['marks'] & {} = {};
  const glowing = g.next[0];
  if (glowing) hallMarks[glowing] = mark('V1', 'room', 'br-in');
  hallMarks.doorR = mark('V1', 'door', 'tl');
  hallMarks['suits-water'] = mark('V2', 'shops', 'tr');
  if (state === 'pace') hallMarks.corral = mark('V7', 'corral', 'tr-in');
  hallMarks.floor = mark('V1', 'floor', 'tl');

  const walk = `${turn.hallSecs.toFixed(1)}s`;
  const btn = 'h-11 min-w-0 flex-1 px-1.5 text-xs @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-base';
  const storeFooter = (
    <div className="flex gap-2">
      <Button size="md" variant={outfitted ? 'holo' : 'outline'} className={btn} onClick={() => turn.go('doorR')} data-testid="walk-out">
        <Two top="Walk out" sub={`to the map · ${walk}`} />
      </Button>
      <span className="relative flex min-w-0 flex-1">
        <Button size="md" variant={g.next.includes('pub') && !outfitted ? 'holo' : 'ghost'} className={btn} onClick={() => turn.go('pub')} aria-label="Walk to the pub and end your turn" data-testid="pub">
          <Two top="Pub · end turn" sub={`≈${turn.pub} cr · ${walk}`} />
        </Button>
        {state === 'pace' && mark('V7', 'pub', 'tr')}
      </span>
    </div>
  );

  const waitingNote = turn.lenaIn ? 'The clock starts when every first MULE is in' : 'The clock starts when your first MULE is in';

  return (
    <ConditionProvider value={cond}>
      <ConditionVariant value="B">
        <Game view={turn.view}>
          <GameShell
            phase="Development"
            seconds={turn.waiting ? undefined : turn.left}
            status={
              <span className="relative inline-flex h-8 items-center gap-1 rounded-chip border border-dashed border-holo-line px-2 font-mono text-xs font-bold text-holo @min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-lg" data-testid="clock-waits">
                <svg aria-hidden viewBox="0 0 24 24" width={12} height={12} fill="currentColor">
                  <rect x={6} y={5} width={4} height={14} rx={1} />
                  <rect x={14} y={5} width={4} height={14} rx={1} />
                </svg>
                0:{FULL}
                {mark('V8', 'status', 'bl')}
              </span>
            }
            now={{ ...g.now, detail: g.now.detail && <span className="relative block">{g.now.detail}{state === 'pace' ? mark('V7', 'now', 'br') : state === 'choose' && outfitted ? mark('V2', 'guide', 'br') : state === 'first-month' ? mark('V8', 'now', 'br') : null}</span> }}
            rail={
              <>
                <ArrowDemo play={(k) => latest.current.arrow(k)} stepMs={turn.stepSecs * 1000} keys={state === 'walk' ? ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'] : []} />
                <MuleRow leading={turn.leading} installed={turn.installed} phone={turn.place === 'store' && turn.leading !== null} />
                {turn.place === 'map' && <KeysPanel lit={turn.lit} step={`${turn.stepSecs.toFixed(1)} s`} mark={mark('V1', 'keys', 'tr')} />}
                <PaceBlock pace={paceOf(lena)} ate={lena.ate} need={lena.need} next={nextMonth} open={paceOpen} onToggle={() => setPaceOpen((o) => !o)} mark={mark('V6', 'pace', 'tr')} />
              </>
            }
            footer={turn.done ? undefined : turn.place === 'store' ? storeFooter : <MapActions turn={turn} mark={mark} />}
          >
            <div className={cx('flex min-h-0 flex-1 flex-col gap-1.5 @min-[1100px]/shell:gap-3', turn.done && 'opacity-60')} data-testid="dev-stage">
              <ClockRow
                seconds={turn.left}
                total={FULL}
                {...(turn.waiting ? { waits: <>{waitingNote}</> } : {})}
                labelMark={
                  <>
                    {mark('V6', 'clock', 'tr')}
                    {mark('V8', 'clock', 'tr')}
                  </>
                }
                mark={
                  state === 'first-month' && (
                    <DecisionFlag testid="flag-first-month">
                      <span className="@min-[1100px]/shell:hidden">Balance: Heiko’s</span>
                      <span className="hidden @min-[1100px]/shell:inline">Balance decision (WS1’s numbers): Heiko’s</span>
                    </DecisionFlag>
                  )
                }
              />
              {turn.place === 'store' ? (
                <>
                  <PlotsStrip rows={rows} mark={mark('V2', 'plots', 'bl')} />
                  <div className="min-h-[300px] flex-1">
                    <WideDevHall
                      visitors={[{ id: 'lena', at: turn.hall.at, walk: turn.hall.walk, moving: turn.hall.moving, leading: turn.leading, me: true }]}
                      mules={turn.corral}
                      mulePrice={turn.view.mulePrice}
                      prices={base.me!.outfitCosts}
                      pubPayout={turn.pub}
                      open={turn.done ? [] : g.open}
                      onSpot={turn.go}
                      next={turn.done ? [] : g.next}
                      locks={g.locks}
                      walk={walk}
                      walking={turn.walkingTo}
                      path={turn.hallPath}
                      suits={suitMarks}
                      marks={hallMarks}
                    />
                  </div>
                </>
              ) : (
                <MapStage turn={turn} mark={mark} />
              )}
            </div>
          </GameShell>
        </Game>
      </ConditionVariant>
    </ConditionProvider>
  );
}
