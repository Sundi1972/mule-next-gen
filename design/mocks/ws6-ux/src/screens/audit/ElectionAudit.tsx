import { POLITICS, type ElectionHow, type Office, type TaxPromise } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Button, Creature, cx, HoloMap, PlayerMark, SLOT_COLOR, type Slot } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { mapTiles } from '../../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../../apps/web/src/phone/Shell';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { H, VIEW, W } from '../../fixture';
import { GameShell, useWide, type Now } from '../../proposed/GameShell';
import { IntentMarker, type IntentNoteData } from '../../proposed/IntentNote';
import { PLANNING_WORDS, ReadyBar, ReadyCount, useWaiting, type ReadyWords } from '../../proposed/PlanningReady';
import { MarketStrip, News, PlainWords, ThisMonth } from '../PlanningBrief';
import { DESKS, EyeOff, Glyph, ICON, MarketDesk, OnlyYouLook, Private, SecretDesk, Section, Soon, TalkDesk, type Desk } from '../PlanningHub';

/**
 * The election after the UX audit (docs/research/2026-10-28-ws6-ux-audit.md §3, proposals E-1…E-9), for Heiko's
 * approval, with his ruling of 2026-10-28: no clock anywhere. You run for office in any month (E-1, the Council
 * desk); an election month opens with an announcement, an untimed secret ballot, and a reveal ceremony one office at
 * a time (E-2; the ceremony is ElectionReveal.tsx). Each change carries a numbered IntentMarker; the review page lists,
 * per number, the intent it serves and why (ELECTION_NOTES, below).
 *
 * Fixture: four people (Ossa and Kai, AIs in the shared fixture, are people here: an election that waits needs
 * people to wait for). Month 1 elected Ossa Governor; the tax is 5%. By election day (month 4) the field is Lena (up
 * to 4%) and Kai (up to 8%). Lena, Ossa and Brix share the most plots (7), so there is no Land Baron, and the 3–3 tie
 * goes to the most plots of the two: Lena's 7 against Kai's 5. Kai's phone is locked through election day, so the
 * host meets the same Continue three times (E-10). Every rule number comes from @mule/engine's POLITICS.
 *
 * Governor only (Heiko 2026-10-28): no Sheriff is elected until it has powers (slice 4). Every layout still takes a
 * list of offices (OFFICES, length one now), so a second office returns as a second entry, not a redesign.
 *
 * GRAFT TARGETS (WS7's, from this scaffold): apps/web/src/phone/hub/politics/ (Council.tsx's candidacy and ballot,
 * Governor.tsx's tax desk, Offices.tsx's strip, words.ts's promise and tie words) and apps/web/src/table/TvElection.tsx
 * (the announcement, the ballot and the reveal). Drop every IntentMarker.
 */

/** The audit's proposals for the election, E-1 and E-2 as Heiko re-ruled them on 2026-10-28. */
export const ELECTION_NOTES = {
  E1: {
    id: 'E1',
    n: 1,
    title: 'Run for office in any month',
    what: 'The Council desk takes a candidacy in any month, with no clock: run for Governor with a tax promise, change the promise or withdraw, and see who runs so far. The hub points to it twice: a “Throw your hat in the ring” card under This month, and “Run for office” in the offices strip. Whoever runs when the election month opens is on its ballot. Try it: tap Run for Governor.',
    serves: '2 and 3',
    intent: 'Run for Governor, and pick my tax promise · Stop running, or switch office',
    why: 'Heiko ruled 2026-10-28: “I should be able to run for office anytime. Even in no election months; this gives me time for diplomacy and to adjust my promise etc.” Playing, he asked “how can I run for an office, how can I throw my hat in the ring”; the audit took about 40 s to run, against a 20 s stage.',
    rule: 'candidacies stay open all game instead of a 20 s nominate stage (POLITICS.nominateMs goes); the field closes when an election month opens. WS7 builds it.',
  },
  E2: {
    id: 'E2',
    n: 2,
    title: 'Election day: announce, vote, reveal',
    what: 'An election month opens on the TV and every phone with “Election day: Governor”: who runs, on which promise, then “Vote on your phone”. The ballot has no clock: it shows who has voted and who we are waiting for, never for whom, and closes once everybody has voted, or when the host closes it for someone away (confirm, then “Lena closed the ballot without Kai”). Then the reveal ceremony: the office’s title, the candidates, vote bars growing a block at a time, the winner’s celebration and “Congratulations, Governor Lena!”. A second office would follow with the same ceremony; Governor only for now. Press Replay, or open a still of each beat.',
    serves: '4, 5 and 7',
    intent: 'Vote secretly, and change my vote · See who runs and what each promised · See who won, and by how much',
    why: 'Heiko ruled 2026-10-28: “In an election month we should announce the elections, show who is running for what, and then let everybody vote. Once everybody has voted we dramatically reveal the results … Then the next office comes, same ceremony.” On the real clock nobody voted while a newcomer read, and the TV showed the result for about 3 s.',
    rule: 'the ballot closes when every person has voted (abstaining counts) or the host closes it, as planning’s Continue; POLITICS.ballotMs and the 6 s revealMs go, and the reveal lasts its ceremony. WS7 builds it.',
  },
  E3: {
    id: 'E3',
    n: 3,
    title: 'What the Governor does',
    what: 'One card says what the office is for: the Governor sets the sales tax each month, the tax fills the colony fund, and the job pays 50 cr a month. In the Council desk, and on election day for newcomers, phone and TV.',
    serves: '1',
    intent: 'Understand what the Governor does, and why I’d want the job',
    why: 'Nothing said what a Governor or a Sheriff does; the only “why” was “Governor 50 cr, Sheriff 30 cr a month”, in a different desk.',
    differs: 'the Governor alone, and it adds that a term adds 100 to the final score (POLITICS.termScore, a placeholder until the sim balances it): the other half of “why I’d want the job”.',
    rule: 'Heiko ruled 2026-10-28: Governor only until the Sheriff has powers (slice 4). No Sheriff is elected or drawn on any route here; every layout takes a list of offices, so the Sheriff returns as a second entry with the same ceremony.',
  },
  E4: {
    id: 'E4',
    n: 4,
    title: 'A promise reads as a change from today',
    what: '“up to 8% (it’s 5% now)”, “lower it”, “keep it at 5%”: beside each name in the Council desk, on the announcement, the ballot, the TV and the reveal. The picker offers the same three.',
    serves: '5',
    intent: 'See who runs and what each promised',
    why: '“Tax no higher than 8%” while the tax was 5% did not say it was a promise to raise it, and the picker said everyone sees it on the TV, which showed nothing until the result.',
  },
  E5: {
    id: 'E5',
    n: 5,
    title: 'Your votes in words',
    what: '“You have 1 vote”, then why, in a sentence: everyone gets 1; +1 for every 10 plots; +1 with a good name (70+); +1 for every 300 cr of tax you’ve paid, up to 2; +1 for the Land Baron. Then your own numbers. The table is on the TV, in words.',
    serves: '6',
    intent: 'See how many votes I have, and why',
    why: 'The reasons were hover tooltips, which a phone never shows, and the table was wider than the rail (266 px in 237), so its headers ran together and “Votes” was cut off.',
    differs: 'adds the Land Baron’s +1 and your own numbers (7 plots, a name of 50, 120 cr paid), so the why is yours. The −1 for a name under 30 joins it when names move (WS7 slice 3). The tax a player has paid is new in the view (WS7).',
  },
  E6: {
    id: 'E6',
    n: 6,
    title: 'The whole result, a tie in plain words',
    what: 'Every candidate with their votes, and a tie stamped, then said by the rule that decided it: “A tie, 3 votes each. Nobody is Land Baron to break it, so the most plots wins: Lena has 7, Kai 5.” When the ceremony ends the whole result stays, on the TV and every phone.',
    serves: '7',
    intent: 'See who won, and by how much',
    why: 'The phone showed only the winner’s count (“1 votes”), and a three-way tie went to seat order while the news said “tie broken by land”.',
    differs: 'the audit’s example, “nobody owns land yet, so the first seat wins”, is month 1’s. In month 4 everyone owns land, so the words name the rule that decided this tie.',
  },
  E7: {
    id: 'E7',
    n: 7,
    title: "The Governor's desk keeps the promise in view",
    what: '“You promised: no higher than 4%” above the tax; going past it says “this breaks your promise”; Set answers “Done: 4% from now on”; and the offices line everyone sees reads “Governor Lena · promised up to 4% · tax 4%, kept”. The phone shows the desk as it opens, at last month’s 5%; the laptop after Set at 4%. Try it: tap −, then Set.',
    serves: '8 and 9',
    intent: 'As Governor, change the tax rate · Check whether the Governor kept their promise',
    why: '“Set the tax” gave no sign it worked, nothing reminded the Governor of the promise or said what the tax does, and the promise was dropped after the election.',
    elsewhere: 'the promise has to outlive the election: today the engine drops it with the candidacy (Election.promises). Keeping it for the term is WS7’s.',
  },
  E8: {
    id: 'E8',
    n: 8,
    title: 'The Land Baron, always named',
    what: '“Land Baron: nobody yet. Whoever owns the most plots gets +1 vote and breaks ties.” Here Lena, Ossa and Brix share the most plots (7), so there is none: which is why the candidates’ own plots broke the tie.',
    serves: '10',
    intent: 'Know who the Land Baron is, and how to become it',
    why: 'The Land Baron appeared only once someone held it, and an AI named “The Baron” and a vote column “Baron” made it harder.',
    elsewhere: 'an AI not called “The Baron” is WS2’s naming.',
  },
  E9: {
    id: 'E9',
    n: 9,
    title: 'Fit on the phone',
    what: 'Button words that fit their buttons (“Run · up to 4%”, “Change promise”, “Set 4%”). On the Governor’s phone the six desk tabs sit on one row, the Governor’s first and open, and the Now card folds, so the tab and the desk stay above the footer.',
    serves: '2 and 8 (cross-cutting)',
    intent: 'Run for Governor, and pick my tax promise · As Governor, change the tax rate',
    why: '“Run, promising …” was 52 px of text in a 44 px button, and the Governor tab sat on a second row behind the footer at 844 × 390.',
  },
  E10: {
    id: 'E10',
    n: 10,
    title: 'One Continue, the same every time',
    what: 'With no clock, someone away can hold the month up three times: the announcement, the ballot, then planning. The host’s way past is the same each time, in the same place: planning’s own footer and confirm, reading “Still waiting for Kai · Continue without Kai”. Each Continue posts its own news line: “Lena opened the ballot without Kai”, “Lena closed the ballot without Kai”, “Lena continued without Kai”. The laptop opens ready, so it shows the host’s line; on the phone, tap the ready button first.',
    serves: '2 (the election waits for people)',
    intent: 'Run for Governor, and pick my tax promise',
    why: 'An absent player would otherwise stall the month three times; the same button in the same place reads as one habit (WS3).',
    elsewhere: 'planning’s approved footer says “Waiting for” once you are ready; for the three to read alike it says “Still waiting for” there too (WS3’s file, one word).',
  },
} satisfies Record<string, IntentNoteData>;

const N = ELECTION_NOTES;

/**
 * The offices an election fills, in the order every screen shows and reveals them. Governor only (Heiko 2026-10-28)
 * until the Sheriff has powers in slice 4; it then returns here as a second entry.
 */
export const OFFICES: readonly Office[] = ['governor'];

// --- Fixture ---------------------------------------------------------------------------------------------------------

export const ME = 'lena';
export const ANY_MONTH = 2;
export const ELECTION_MONTH = 4;
/** The sales tax as both months open, set by Ossa in month 1. */
export const TAX = 5;
export const TAX_LOW = Math.max(POLITICS.tax.min, TAX - POLITICS.tax.maxStep);
export const TAX_HIGH = Math.min(POLITICS.tax.max, TAX + POLITICS.tax.maxStep);
export const nextElection = (month: number) => POLITICS.electionMonths.find((m) => m > month) ?? null;
/** Kai's phone is locked through election day. */
export const AWAY = ['kai'];
export const OFFICE_NAME: Record<Office, string> = { governor: 'Governor', sheriff: 'Sheriff' };

/** E-10: the host's line is the same in every stage that waits for people; only what you finish differs. */
const STILL = 'Still waiting for';
const ANNOUNCE_WORDS: ReadyWords = {
  ready: 'Ready to vote',
  done: "You're ready to vote",
  waiting: STILL,
  all: 'Everyone is ready. The ballot opens.',
  confirm: (names) => `Open the ballot for everyone now? ${names} can still vote until it closes.`,
};
const BALLOT_WORDS: ReadyWords = {
  ready: 'Cast my vote',
  done: 'You voted',
  waiting: STILL,
  all: 'Everyone has voted. The reveal starts.',
  confirm: (names, n) => `Close the ballot for everyone now? ${n === 1 ? `${names}’s vote` : `The votes of ${names}`} won’t count, and the reveal starts.`,
};
const PLAN_WORDS: ReadyWords = { ...PLANNING_WORDS, waiting: STILL };
/** What an office is for, in a few words (E-3). */
export const JOB: Partial<Record<Office, string>> = { governor: 'sets the sales tax each month' };

const SEAT = Object.fromEntries(VIEW.players.map((p, i) => [p.id, { ...p, slot: i as Slot }]));
export const seat = (id: string) => SEAT[id]!;
export const PEOPLE = VIEW.players.map((p) => p.id);

/** The candidates' promises. */
export const PROMISE: Record<string, TaxPromise> = { lena: { kind: 'cap', percent: 4 }, kai: { kind: 'cap', percent: 8 } };
/** Lena's promise, which she must keep as Governor (E-7). */
export const LENA_CAP = 4;
/** Who runs when month 4 opens, in seat order. */
export const FIELD: Partial<Record<Office, string[]>> = { governor: ['lena', 'kai'] };
/** In month 2, before Lena runs. */
const SO_FAR: Partial<Record<Office, string[]>> = { governor: ['kai'] };

/** Everyone's votes this month, and what they come from. Nobody holds the Land Baron. */
export const WEIGHTS = [
  { id: 'lena', base: 1, land: 0, name: 0, baron: 0, taxes: 0, votes: 1, rep: 50, paid: 120 },
  { id: 'ossa', base: 1, land: 0, name: 0, baron: 0, taxes: 1, votes: 2, rep: 50, paid: 340 },
  { id: 'brix', base: 1, land: 0, name: 0, baron: 0, taxes: 1, votes: 2, rep: 50, paid: 310 },
  { id: 'kai', base: 1, land: 0, name: 0, baron: 0, taxes: 0, votes: 1, rep: 50, paid: 60 },
];

export interface Race {
  office: Office;
  /** Highest first, as the engine sorts them. */
  tallies: { id: string; votes: number }[];
  winner: string;
  how: ElectionHow;
}
/**
 * The ballots: Lena (1) and Ossa (2) for Lena; Kai (1) and Brix (2) for Kai. A 3–3 tie; with no Land Baron, the most
 * plots among the tied wins (the engine's decide()): Lena's 7 against Kai's 5.
 */
export const RESULT: Partial<Record<Office, Race>> = {
  governor: { office: 'governor', tallies: [{ id: 'lena', votes: 3 }, { id: 'kai', votes: 3 }], winner: 'lena', how: 'tieRule' },
};

/** A view for one route: four people, the month, who has pressed Ready. */
export function electionView(month: number, ready: string[] = []): MuleView {
  return { ...VIEW, month, phase: 'planning', players: VIEW.players.map((p) => ({ ...p, isAi: false, ready: ready.includes(p.id) })) };
}

// --- Words -----------------------------------------------------------------------------------------------------------

/** E-4: a promise as a change from today's tax. Long beside a name, short on a button ("Run · up to 4%"). */
export function promiseWords(p: TaxPromise | undefined, long = true): string | null {
  if (!p) return null;
  if (p.kind === 'lower') return 'lower it';
  if (p.kind === 'hold') return `keep it at ${TAX}%`;
  return long ? `up to ${p.percent}% (it's ${TAX}% now)` : `up to ${p.percent}%`;
}

const nameOf = (id: string, me: string | null) => (id === me ? 'you' : seat(id).name);
/** "Kai", "Ossa and Kai", "you, Ossa and Kai". */
export function listNames(ids: string[], me: string | null): string {
  const names = [...ids.filter((i) => i === me), ...ids.filter((i) => i !== me)].map((i) => nameOf(i, me));
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** E-6: how an office was won, in the words of the rule that decided it. */
export function howWords(r: Race, me: string | null): string {
  const [a, b] = r.tallies;
  if (r.how === 'unopposed' || !a || !b) return 'Elected unopposed: nobody ran against them.';
  if (r.how === 'votes') return `Won on votes, ${a.votes} to ${b.votes}.`;
  if (r.how === 'appointed') return 'Nobody ran, so the richest player is appointed.';
  const loser = r.tallies.find((t) => t.id !== r.winner)!;
  const w = seat(r.winner);
  const l = seat(loser.id);
  if (r.how === 'baron') return `A tie, ${a.votes} votes each, broken by the Land Baron's vote.`;
  return w.plots === l.plots
    ? `A tie, ${a.votes} votes each, and the same plots, so seat order decided: this election it starts at ${nameOf(r.winner, me)}.`
    : `A tie, ${a.votes} votes each. Nobody is Land Baron to break it, so the most plots wins: ${nameOf(r.winner, me)} ${r.winner === me ? 'have' : 'has'} ${w.plots}, ${nameOf(loser.id, me)} ${l.plots}.`;
}

/** E-8: who shares the most plots, when nobody holds them alone. */
export function baronWords(me: string | null): { head: string; rule: string } {
  const most = Math.max(...VIEW.players.map((p) => p.plots));
  const top = VIEW.players.filter((p) => p.plots === most).map((p) => p.id);
  return {
    head: top.length === 1 ? `Land Baron: ${cap(nameOf(top[0]!, me))}` : 'Land Baron: nobody yet',
    rule: `${top.length > 1 ? `${cap(listNames(top, me))} share the most plots (${most}). ` : ''}Whoever owns the most plots gets +1 vote and breaks ties.`,
  };
}

// --- Shared pieces ---------------------------------------------------------------------------------------------------

/** A player by creature and name; "You" on your own screen. */
export function Person({ id, me = ME, size = 16, className }: { id: string; me?: string | null; size?: number; className?: string }) {
  const p = seat(id);
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap font-semibold', className)} data-testid={`person-${id}`}>
      <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={size} />
      {id === me ? 'You' : p.name}
    </span>
  );
}

/** "Waiting for ● you ● Kai AWAY to vote": names with a creature mark, the away ones flagged. */
function Waiting({ ids, verb, me = ME, tv = false, lead = 'Waiting for' }: { ids: string[]; verb: string; me?: string | null; tv?: boolean; lead?: string }) {
  const ordered = [...ids.filter((i) => i === me), ...ids.filter((i) => i !== me)];
  if (ordered.length === 0) return <span className={cx('font-semibold text-ok', tv ? 'text-3xl' : 'text-xs @min-[1100px]/shell:text-lg')}>Everyone has voted</span>;
  return (
    <span className={cx('flex flex-wrap items-center gap-x-1.5 gap-y-0.5', tv ? 'text-3xl' : 'text-xs @min-[1100px]/shell:text-lg')} data-testid="waiting-for">
      <span className="text-ink-2">{lead}</span>
      {ordered.map((id) => (
        <span key={id} className="flex items-center gap-1 font-semibold" data-testid={`waiting-${id}`}>
          <PlayerMark slot={seat(id).slot} size={tv ? 28 : 12} glow={!AWAY.includes(id)} />
          {id === me ? 'you' : seat(id).name}
          {AWAY.includes(id) && <span className={cx('rounded-chip border border-warn/60 font-mono font-bold text-warn', tv ? 'px-2 text-lg' : 'px-1 text-[9px] @min-[1100px]/shell:text-xs')}>AWAY</span>}
        </span>
      ))}
      {verb && <span className="text-ink-2">{verb}</span>}
    </span>
  );
}

const STEPS = ['Who runs', 'Vote', 'Reveal'] as const;

/** Election day's three steps, the current one lit: no clock on any of them. */
export function Steps({ at, tv = false }: { at: 1 | 2 | 3; tv?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5" aria-label={`Step ${at} of 3`} data-testid="election-steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        return (
          <li key={s} className="flex items-center gap-1" aria-current={n === at ? 'step' : undefined} data-testid={`election-step-${n}`}>
            {i > 0 && (
              <svg aria-hidden viewBox="0 0 24 24" width={tv ? 20 : 10} height={tv ? 20 : 10} className="text-ink-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            <span
              className={cx(
                'whitespace-nowrap rounded-chip font-semibold',
                tv ? 'px-3 text-2xl leading-10' : 'px-1.5 text-[11px] leading-5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-base @min-[1100px]/shell:leading-8',
                n === at ? 'bg-holo text-on-holo' : n < at ? 'text-ok' : 'text-ink-2',
              )}
            >
              {n} {s}
              {n < at && ' ✓'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** E-3: what the offices are for, in one card. */
export function OfficesCard({ tv = false }: { tv?: boolean }) {
  return (
    <section
      className={cx('relative flex flex-col rounded-panel border border-holo-line bg-panel', tv ? 'gap-2 px-6 py-4' : 'gap-1 p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4')}
      data-testid="offices-card"
    >
      <span className={cx('label-caps', tv ? 'text-base!' : 'text-[10px]! @min-[1100px]/shell:text-xs!')}>What the Governor does</span>
      <dl className={cx('grid grid-cols-[auto_1fr] gap-x-2 leading-snug', tv ? 'gap-y-1 text-xl' : 'gap-y-0.5 text-xs @min-[1100px]/shell:gap-y-1 @min-[1100px]/shell:text-sm')}>
        <dt className="font-semibold">Governor</dt>
        <dd data-testid="job-governor">
          Sets the sales tax each month; the tax fills the colony fund. Paid {POLITICS.pay.governor} cr a month.
        </dd>
      </dl>
      <span className={cx('text-ink-2', tv ? 'text-lg' : 'text-[11px] @min-[1100px]/shell:text-sm')} data-testid="job-term">
        A term lasts until the next election and adds {POLITICS.termScore} to your final score.
      </span>
      <IntentMarker note={N.E3} at="tr" />
    </section>
  );
}

/** E-5: your votes, and why, in a sentence. */
function VotesCard() {
  const w = WEIGHTS.find((x) => x.id === ME)!;
  const { plotsPerVote, repHigh, taxPerVote, taxCap } = POLITICS.weight;
  return (
    <section className="relative flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-4" data-testid="votes-card">
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-xs!">Your votes</span>
      <p className="text-xs leading-snug @min-[1100px]/shell:text-base" data-testid="votes-sentence">
        <strong className="font-semibold">
          You have {w.votes} vote{w.votes === 1 ? '' : 's'}.
        </strong>{' '}
        Everyone gets 1; +1 for every {plotsPerVote} plots; +1 with a good name ({repHigh}+); +1 for every {taxPerVote} cr of tax you’ve paid, up to {taxCap}; +1 for the Land Baron.
      </p>
      <p className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-sm" data-testid="votes-mine">
        You: {seat(ME).plots} plots, a name of {w.rep}, {w.paid} cr of tax paid, so none of the extras yet.
      </p>
      <IntentMarker note={N.E5} />
    </section>
  );
}

/** The host's footer in every stage that waits for people (E-10): planning's own ReadyBar and confirm, in its words. */
function WaitFooter({ mark = true, ...bar }: Parameters<typeof ReadyBar>[0] & { mark?: boolean }) {
  return (
    <div className="relative flex flex-col gap-2 @min-[1100px]/shell:gap-3" data-testid="wait-footer">
      <ReadyBar fit {...bar} />
      {mark && <IntentMarker note={N.E10} part="footer" at="tr" />}
    </div>
  );
}

/** The map, under the election on a laptop (the stage holds two things there). */
function StageMap() {
  const { view } = usePhoneGame();
  const wide = useWide();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="stage-map">
      <MapFit width={W} height={H}>
        <HoloMap width={W} height={H} tiles={mapTiles(view)} focusSlot={0} density={wide ? 'tv' : 'phone'} />
      </MapFit>
    </div>
  );
}

/** The map under election day, on a laptop only: a child of the shell, so it knows the shell's width. */
function WideMap() {
  return useWide() ? <StageMap /> : null;
}

/** Election day on a phone's or laptop's stage: the card every step of it lives in. */
function DayCard({ at, testid, children }: { at: 1 | 2 | 3; testid: string; children: ReactNode }) {
  return (
    <section
      className="relative flex flex-col gap-1.5 rounded-panel border-2 border-holo bg-panel p-2.5 shadow-glow animate-[show-card-in_0.5s_ease-out_both] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6"
      aria-label={`Election day, step ${at} of 3`}
      data-testid={testid}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-base font-semibold leading-tight @min-[1100px]/shell:text-3xl" data-testid="day-title">
          Election day: {OFFICES.map((o) => OFFICE_NAME[o]).join(' and ')}
        </h2>
        <span className="ml-auto">
          <Steps at={at} />
        </span>
      </div>
      {children}
      <IntentMarker note={N.E2} part={testid} />
    </section>
  );
}

/** Who runs for what, with each Governor candidate's promise as a change from today (E-4). */
function Field({ field, me = ME, testid = 'field' }: { field: Partial<Record<Office, string[]>>; me?: string | null; testid?: string }) {
  const wide = useWide();
  return (
    <div className={cx('grid gap-1.5 @min-[1100px]/shell:gap-4', OFFICES.length > 1 ? 'grid-cols-2' : 'grid-cols-1')} data-testid={testid}>
      {OFFICES.map((o) => (
        <div key={o} className="relative flex min-w-0 flex-col gap-1 rounded-control border border-holo-line p-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:p-3" data-testid={`${testid}-${o}`}>
          <span className="text-xs font-semibold text-ink-2 @min-[1100px]/shell:text-lg">{OFFICE_NAME[o]}</span>
          {(field[o] ?? []).length === 0 ? (
            <span className="text-xs text-ink-3 @min-[1100px]/shell:text-base">nobody yet</span>
          ) : (
            field[o]!.map((id) => (
              <span key={id} className="flex flex-wrap items-baseline gap-x-1.5 text-xs @min-[1100px]/shell:text-lg" data-testid={`${testid}-${o}-${id}`}>
                <Person id={id} me={me} size={wide ? 26 : 15} className="self-center" />
                {o === 'governor' && <span className="text-ink-2">{promiseWords(PROMISE[id])}</span>}
              </span>
            ))
          )}
          {o === 'governor' && <IntentMarker note={N.E4} part={testid} at="tr" />}
        </div>
      ))}
    </div>
  );
}

// --- E-1 · running in any month (month 2) ----------------------------------------------------------------------------

/** The promise picker, as a sheet over the screen: one of three, no free text, and the field so far beside it. */
function PromiseSheet({ start, field, onRun, onCancel }: { start: TaxPromise | null; field: string[]; onRun: (p: TaxPromise) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<TaxPromise['kind'] | null>(start?.kind ?? 'cap');
  const [n, setN] = useState(start?.kind === 'cap' ? start.percent : LENA_CAP);
  const chosen: TaxPromise | null = kind === 'cap' ? { kind, percent: n } : kind ? { kind } : null;
  const chip = (k: TaxPromise['kind'], label: ReactNode, testid: string) => (
    <label className={cx('flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-2 text-sm @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-lg', kind === k ? 'border-holo bg-holo-soft' : 'border-holo-line')} data-testid={testid}>
      <input type="radio" name="promise" checked={kind === k} onChange={() => setKind(k)} className="accent-[var(--color-holo)]" />
      {label}
    </label>
  );
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="promise-title" data-testid="promise-sheet">
      <div className="relative flex w-full max-w-[560px] flex-col gap-2 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]/shell:max-w-[760px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6" role="radiogroup" aria-label="Your promise as Governor">
        <h2 id="promise-title" className="font-display text-lg font-semibold leading-tight @min-[1100px]/shell:text-3xl">
          Run for Governor: your promise on the tax
        </h2>
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-base">
          The sales tax is {TAX}% now. Everyone sees your promise beside your name, on the ballot and on the TV; you can change it until the election.
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2 @min-[1100px]/shell:text-base" data-testid="promise-field">
          Running so far:
          {field.map((id) => (
            <span key={id} className="inline-flex items-center gap-1">
              <Person id={id} size={14} /> {promiseWords(PROMISE[id])}
            </span>
          ))}
        </p>
        <div className="relative flex flex-wrap gap-1.5 @min-[1100px]/shell:gap-3" data-testid="promise-pick">
          {chip(
            'cap',
            <span className="flex items-center gap-1.5">
              Up to
              <span className="inline-flex items-center rounded-control border border-holo-line" onClick={() => setKind('cap')}>
                <button type="button" aria-label="Lower the cap" disabled={n <= POLITICS.tax.min} onClick={() => setN((x) => Math.max(POLITICS.tax.min, x - 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-minus">
                  −
                </button>
                <span data-num className="w-9 text-center font-mono font-bold" data-testid="promise-cap-value">
                  {n}%
                </span>
                <button type="button" aria-label="Raise the cap" disabled={n >= POLITICS.tax.max} onClick={() => setN((x) => Math.min(POLITICS.tax.max, x + 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-plus">
                  +
                </button>
              </span>
            </span>,
            'promise-cap',
          )}
          {chip('lower', 'Lower it', 'promise-lower')}
          {chip('hold', `Keep it at ${TAX}%`, 'promise-hold')}
          <IntentMarker note={N.E4} part="pick" at="tr" />
        </div>
        <div className="flex gap-2">
          <span className="relative flex-1">
            <Button size="md" className="w-full whitespace-nowrap @min-[1100px]/shell:text-lg" disabled={!chosen} onClick={() => chosen && onRun(chosen)} data-testid="promise-run">
              {chosen ? `Run · ${promiseWords(chosen, false)}` : 'Pick a promise'}
            </Button>
            <IntentMarker note={N.E9} part="run" at="tr" />
          </span>
          <Button size="md" variant="ghost" onClick={onCancel} data-testid="promise-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The Council desk's first block in any month: who runs so far, and your own candidacy. */
function RunForOffice({ running, promise, onRun, onWithdraw }: { running: boolean; promise: TaxPromise | null; onRun: () => void; onWithdraw: () => void }) {
  const next = nextElection(ANY_MONTH)!;
  return (
    <section className="relative flex flex-col gap-1.5 @min-[1100px]/shell:gap-2.5" data-testid="run-office">
      <h3 className="label-caps @min-[1100px]/shell:text-xs!">Run for office</h3>
      <p className="text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="run-any-month">
        Any month, no clock. Next election: month {next}. Whoever runs when it opens is on the ballot.
      </p>
      <dl className="relative grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs @min-[1100px]/shell:gap-y-1 @min-[1100px]/shell:text-sm" data-testid="field-so-far">
        {OFFICES.map((o) => {
          const ids = o === 'governor' && running ? [ME, ...(SO_FAR[o] ?? [])] : (SO_FAR[o] ?? []);
          return (
            <div key={o} className="contents">
              <dt className="text-ink-2">{OFFICE_NAME[o]}</dt>
              <dd className="flex flex-col gap-0.5" data-testid={`so-far-${o}`}>
                {ids.length === 0 ? (
                  <span className="text-ink-3">nobody yet</span>
                ) : (
                  ids.map((id) => (
                    <span key={id} className="flex flex-wrap items-baseline gap-x-1.5" data-testid={`so-far-${o}-${id}`}>
                      <Person id={id} size={13} className="self-center" />
                      <span className="text-ink-2">{promiseWords(id === ME ? (promise ?? undefined) : PROMISE[id])}</span>
                    </span>
                  ))
                )}
              </dd>
            </div>
          );
        })}
        <IntentMarker note={N.E4} part="so-far" at="tr" />
      </dl>
      {running && (
        <span className="flex items-baseline justify-between gap-2 text-xs @min-[1100px]/shell:text-sm" data-testid="running">
          <span>
            You run for <strong>Governor</strong>
            {promise && <>, promising {promiseWords(promise)}</>}.
          </span>
          <button type="button" className="shrink-0 text-holo underline" onClick={onWithdraw} data-testid="withdraw">
            Withdraw
          </button>
        </span>
      )}
      <div className="relative" data-testid="run">
        <Button size="md" variant="outline" className="w-full whitespace-nowrap px-2 text-xs! @min-[1100px]/shell:text-sm!" onClick={onRun} data-testid={running ? 'change-promise' : 'run-governor'}>
          {running ? 'Change promise' : 'Run for Governor'}
        </Button>
        <IntentMarker note={N.E9} part="change" at="tr" />
      </div>
      <IntentMarker note={N.E1} part="desk" at="tr" />
    </section>
  );
}

const PLAIN_DESKS = DESKS.filter((d) => !d.office);

/** One row of desk tabs (H-7), an office's own desk first when you hold it (E-9). */
function DeskTabs({ desks, desk, setDesk, mark }: { desks: Desk[]; desk: Desk; setDesk: (d: Desk) => void; mark?: ReactNode }) {
  return (
    <div role="tablist" aria-label="Desks" className="relative flex gap-1" data-testid="desks">
      {desks.map((id) => {
        const d = DESKS.find((x) => x.id === id)!;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={desk === id}
            onClick={() => setDesk(id)}
            className={cx(
              'relative flex min-w-0 flex-auto flex-col items-center whitespace-nowrap rounded-control border px-0.5 py-0.5 text-[10px] font-semibold leading-tight @min-[1100px]/shell:gap-0.5 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xs',
              desk === id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2',
              d.office && desk !== id && 'border-warn/60',
            )}
            data-testid={`desk-${id}`}
          >
            <Glyph d={ICON[id]} size={14} className="@min-[1100px]/shell:size-4" />
            {d.label}
            {d.status !== 'today' && !d.office && <span className={cx('absolute right-1 top-1 size-1.5 rounded-full', d.status === 'part' ? 'bg-warn/60' : 'bg-warn')} />}
            {d.locked && (
              <span className="absolute left-1 top-1 text-holo" role="img" aria-label="Only you see this">
                <EyeOff size={9} strokeWidth={2.6} />
              </span>
            )}
          </button>
        );
      })}
      {mark}
    </div>
  );
}

/** The hub's agenda in month 2, with the way into running for office first (E-1). Forked from #audit-hub's. */
function AnyMonthAgenda({ running, promise, onRun }: { running: boolean; promise: TaxPromise | null; onRun: (el: Element) => void }) {
  const items: { key: string; title: string; sub: string; slice?: number; only?: boolean }[] = [
    { key: 'drone', title: 'Geo drone', sub: '2 plots · 60 cr', only: true },
    { key: 'list', title: 'Sell a plot or MULE', sub: 'At the auction after planning' },
    { key: 'law', title: 'Law vote', sub: 'Pollution tax: 20 cr a point', slice: 2 },
    { key: 'sabotage', title: 'Sabotage', sub: 'One secret order', slice: 4, only: true },
  ];
  const next = nextElection(ANY_MONTH)!;
  return (
    <section className="flex flex-col gap-1" data-testid="agenda">
      <span className="label-caps text-[10px]! @min-[1100px]/shell:text-sm!">This month</span>
      <div className="flex gap-1.5 overflow-x-auto pb-1 @min-[1100px]/shell:grid @min-[1100px]/shell:grid-cols-[repeat(auto-fit,minmax(0,1fr))] @min-[1100px]/shell:grid-flow-col @min-[1100px]/shell:gap-2 @min-[1100px]/shell:overflow-visible">
        <button
          type="button"
          onClick={(e) => onRun(e.currentTarget)}
          className="relative flex shrink-0 flex-col items-start gap-0.5 rounded-control border-2 border-holo bg-holo-soft px-2 py-1 text-left hover:shadow-glow @min-[1100px]/shell:min-w-0 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2"
          data-testid="agenda-run"
        >
          <span className="whitespace-nowrap text-xs font-semibold @min-[1100px]/shell:whitespace-normal @min-[1100px]/shell:text-base">Throw your hat in the ring</span>
          <span className="whitespace-nowrap text-[10px] text-ink-2 @min-[1100px]/shell:whitespace-normal @min-[1100px]/shell:text-sm" data-testid="agenda-run-sub">
            {running && promise ? `You run for Governor · ${promiseWords(promise, false)}` : `Run for Governor · election in month ${next}`}
          </span>
          <IntentMarker note={N.E1} part="card" at="br-in" />
        </button>
        {items.map((it) => (
          <div key={it.key} className="flex min-w-[124px] shrink-0 flex-col items-start gap-0.5 rounded-control border border-holo-line bg-panel px-2 py-1 @min-[1100px]/shell:min-w-0 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2" data-testid={`agenda-${it.key}`}>
            <span className="flex w-full flex-wrap items-center gap-x-1">
              <span className="truncate text-xs font-semibold @min-[1100px]/shell:text-base">{it.title}</span>
              {it.only && <Private text="Only you" />}
            </span>
            <span className="truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm">{it.sub}</span>
            {it.slice && <Soon slice={it.slice} />}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Who holds what, across the top of planning in month 2, and the way to run (E-1). */
function OfficesStrip({ onRun }: { onRun: (el: Element) => void }) {
  const next = nextElection(ANY_MONTH)!;
  const baron = baronWords(ME);
  return (
    <section
      className="relative flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-panel border border-holo-line bg-panel px-2 py-1 text-[11px] text-ink-2 @min-[1100px]/shell:gap-x-2 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-2.5 @min-[1100px]/shell:text-sm"
      data-testid="offices-strip"
    >
      <span>
        Governor: <Person id="ossa" size={12} />, until month {next - 1}
      </span>
      · <span data-testid="strip-baron">{baron.head}</span> · <span>Next election: month {next}</span>
      <button type="button" onClick={(e) => onRun(e.currentTarget)} className="relative ml-auto whitespace-nowrap pr-2 font-semibold text-holo underline-offset-2 hover:underline" data-testid="strip-run">
        Run for office ›
        <IntentMarker note={N.E1} part="strip" at="left" />
      </button>
    </section>
  );
}

/**
 * #audit-election: the hub in month 2, no election, the Council desk open. Mock only: `running` opens with Lena
 * already running (the laptop opens one tap later than the phone).
 */
export function AnyMonth({ running: startRunning = false }: { running?: boolean }) {
  const { view } = usePhoneGame();
  const [ready, setReady] = useState(false);
  const { players } = useWaiting(ready);
  const [desk, setDesk] = useState<Desk>('council');
  const [running, setRunning] = useState(startRunning);
  const [promise, setPromise] = useState<TaxPromise | null>(startRunning ? PROMISE[ME]! : null);
  const [sheet, setSheet] = useState(false);
  // The strip and the card open the Council desk at its first block, in this frame's own rail.
  const openCouncil = (el: Element) => {
    setDesk('council');
    requestAnimationFrame(() => el.closest('[data-testid="game-shell"]')?.querySelector('[data-testid="run-office"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  // With one office, throwing your hat in opens its promise at once; once you run, it opens your candidacy.
  const onHat = (el: Element) => (running ? openCouncil(el) : (setDesk('council'), setSheet(true)));
  const now: Now = {
    title: 'Plan your month, then press Ready',
    detail: `Any month you can also run for office: the next election is in month ${nextElection(view.month)}.`,
  };
  const body =
    desk === 'council' ? (
      <>
        <RunForOffice running={running} promise={promise} onRun={() => setSheet(true)} onWithdraw={() => (setRunning(false), setPromise(null))} />
        <OfficesCard />
      </>
    ) : desk === 'colony' ? (
      <>
        <ThisMonth />
        <News />
      </>
    ) : desk === 'talk' ? (
      <TalkDesk />
    ) : desk === 'market' ? (
      <MarketDesk onTool={() => {}} />
    ) : (
      <SecretDesk onTool={() => {}} />
    );
  return (
    <OnlyYouLook.Provider value="eye">
      <PlainWords.Provider value>
        <GameShell
          phase="Planning"
          status={<ReadyCount players={players} />}
          now={now}
          foldNow
          rail={
            <>
              <DeskTabs desks={PLAIN_DESKS.map((d) => d.id)} desk={desk} setDesk={setDesk} />
              <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${desk}`}>
                {body}
              </div>
            </>
          }
          footer={<ReadyBar ready={ready} onReady={() => setReady(true)} planningProper />}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
            <OfficesStrip onRun={onHat} />
            <AnyMonthAgenda running={running} promise={promise} onRun={onHat} />
            <StageMap />
            <div className="hidden @min-[1100px]/shell:block">
              <MarketStrip />
            </div>
          </div>
          {sheet && <PromiseSheet start={promise} field={SO_FAR.governor ?? []} onRun={(p) => (setPromise(p), setRunning(true), setSheet(false))} onCancel={() => setSheet(false)} />}
        </GameShell>
      </PlainWords.Provider>
    </OnlyYouLook.Provider>
  );
}

// --- E-2 · election day: the announcement (month 4) -------------------------------------------------------------------

/**
 * #audit-election-announce on a phone or laptop: election day takes the stage; the ballot opens once everyone is
 * ready to vote, or when the host opens it without someone away (E-10). Mock only: `ready` opens already ready.
 */
export function Announce({ ready: startReady = false }: { ready?: boolean }) {
  const [ready, setReady] = useState(startReady);
  const { players, others } = useWaiting(ready);
  const left = others.map((s) => s.id);
  const title = `Election day: ${OFFICES.map((o) => OFFICE_NAME[o]).join(' and ')}`;
  const now: Now = ready
    ? { step: 1, of: 3, title: left.length ? `You're ready. Still waiting for ${listNames(left, ME)}` : 'Everyone is ready', detail: 'The secret ballot opens once everyone is ready. As the host, you can open it without someone who is away.' }
    : { step: 1, of: 3, title, detail: 'Read who runs and on what promise, then tap Ready to vote. No clock: the ballot opens once everyone is ready.' };
  return (
    <GameShell
      phase="Election day"
      status={<ReadyCount players={players} />}
      now={now}
      footer={<WaitFooter ready={ready} onReady={() => setReady(true)} planningProper words={ANNOUNCE_WORDS} onContinue={() => (window.location.hash = 'audit-election-ballot')} />}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
        <DayCard at={1} testid="announce">
          <p className="text-xs text-ink-2 @min-[1100px]/shell:text-lg">
            The colony elects its {OFFICES.map((o) => OFFICE_NAME[o]).join(' and ')} for months {ELECTION_MONTH} to {nextElection(ELECTION_MONTH)! - 1}. The candidates:
          </p>
          <div className="grid grid-cols-2 items-start gap-2 @min-[1100px]/shell:gap-4">
            <Field field={FIELD} testid="announce-field" />
            <OfficesCard />
          </div>
          <p className="font-display text-sm font-semibold text-holo @min-[1100px]/shell:text-2xl" data-testid="vote-on-phone">
            Then vote<span className="hidden @min-[1100px]/shell:inline">, here or on your phone</span><span className="@min-[1100px]/shell:hidden"> on your phone</span>: in secret, with no clock.
          </p>
        </DayCard>
        <WideMap />
      </div>
    </GameShell>
  );
}

/** The announcement on the big screen. Lena, Ossa and Brix are ready to vote; Kai is away. */
export function TvAnnounce() {
  return (
    <div className="h-[720px] w-[1280px] @container/shell">
      <div className="flex h-full flex-col gap-5 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-announce">
        <TvHeader game={{ ...VIEW, phase: 'planning', month: ELECTION_MONTH }} title="Election day" />
        <div className="relative flex items-center gap-6 animate-[show-card-in_0.6s_ease-out_both]">
          <h2 className="font-display text-6xl font-semibold" data-testid="tv-day-title">
            {OFFICES.map((o) => OFFICE_NAME[o]).join(' and ')}
          </h2>
          <span className="text-2xl text-ink-2">
            months {ELECTION_MONTH} to {nextElection(ELECTION_MONTH)! - 1}
          </span>
          <span className="ml-auto">
            <Steps at={1} tv />
          </span>
          <IntentMarker note={N.E2} part="tv" />
        </div>
        <div className={cx('grid gap-6', OFFICES.length > 1 ? 'grid-cols-2' : 'grid-cols-[1fr_440px]')}>
          {OFFICES.map((o, k) => (
            <section key={o} className="relative flex flex-col justify-center gap-5 rounded-sheet border border-holo-line bg-panel px-8 py-6" data-testid={`tv-field-${o}`}>
              <span className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-semibold">{OFFICE_NAME[o]}</span>
                <span className="text-xl text-ink-2">{JOB[o]}</span>
              </span>
              {(FIELD[o] ?? []).map((id, i) => (
                <span key={id} className="flex items-center gap-5 animate-[show-badge-in_0.4s_ease-out_both]" style={{ animationDelay: `${0.4 + 0.3 * (k * 2 + i)}s` }} data-testid={`tv-field-${o}-${id}`}>
                  <Creature species={seat(id).species} color={SLOT_COLOR[seat(id).slot]} size={80} />
                  <span className="font-display text-5xl font-semibold">{seat(id).name}</span>
                  {o === 'governor' && <span className="text-3xl text-ink-2">{promiseWords(PROMISE[id])}</span>}
                </span>
              ))}
              {o === 'governor' && <IntentMarker note={N.E4} part="tv" at="tr" />}
            </section>
          ))}
          <OfficesCard tv />
        </div>
        <div className="relative flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft px-6 py-3 shadow-glow" data-testid="tv-vote-on-phone">
          <span className="flex items-baseline gap-4">
            <span className="font-display text-4xl font-semibold text-holo">Vote on your phone</span>
            <span className="text-2xl text-ink-2">in secret. First tap Ready to vote: the ballot opens once everyone is ready.</span>
          </span>
          <span className="flex items-center gap-4 text-2xl">
            <Waiting ids={AWAY} verb="" me={null} tv lead="Still waiting for" />
            <span className="text-ink-2">· Lena, the host, can continue without Kai.</span>
          </span>
          <IntentMarker note={N.E10} part="tv-announce" at="tr" />
        </div>
      </div>
    </div>
  );
}

// --- E-2 · the untimed ballot ----------------------------------------------------------------------------------------

/** One office's ballot paper: a candidate, or abstain. Your pick shows at once; nobody else sees it. */
function BallotPaper({ office, pick, onPick }: { office: Office; pick: string | undefined; onPick: (id: string) => void }) {
  const wide = useWide();
  return (
    <fieldset className="relative flex min-w-0 flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid={`ballot-${office}`}>
      <legend className="mb-1 text-xs font-semibold @min-[1100px]/shell:text-lg">{OFFICE_NAME[office]}</legend>
      {[...(FIELD[office] ?? []), ''].map((id) => (
        <label
          key={id || 'abstain'}
          className={cx('flex min-h-9 cursor-pointer items-center gap-2 rounded-control border px-1.5 py-1 text-xs @min-[1100px]/shell:min-h-12 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-lg', pick === id ? 'border-holo bg-holo-soft' : 'border-holo-line')}
          data-testid={`ballot-${office}-${id || 'abstain'}`}
        >
          <input type="radio" name={`ballot-${office}`} checked={pick === id} onChange={() => onPick(id)} className="accent-[var(--color-holo)]" />
          {id ? (
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <Person id={id} size={wide ? 24 : 15} className="self-center" />
              {office === 'governor' && <span className="text-ink-2">{promiseWords(PROMISE[id])}</span>}
            </span>
          ) : (
            <span className="text-ink-2">Abstain</span>
          )}
        </label>
      ))}
      {office === 'governor' && <IntentMarker note={N.E4} part="ballot" at="tr" />}
    </fieldset>
  );
}

/**
 * #audit-election-ballot on a phone or laptop: no clock; it closes once everybody has voted, or when the host closes
 * it for someone away, with planning's own footer and confirm (E-10). Mock only: `voted` opens with Lena's vote cast.
 */
export function Ballot({ voted: startVoted = false }: { voted?: boolean }) {
  const [pick, setPick] = useState<Partial<Record<Office, string>>>(startVoted ? { governor: ME } : {});
  const [cast, setCast] = useState(startVoted);
  const [closed, setClosed] = useState(false);
  const complete = OFFICES.every((o) => pick[o] !== undefined);
  const { players, others } = useWaiting(cast);
  const voted = players.filter((p) => p.ready).map((p) => p.id);
  const left = others.map((s) => s.id);
  const now: Now = closed
    ? { step: 3, of: 3, title: 'The ballot is closed', detail: 'The reveal starts on the TV and every phone.' }
    : cast
      ? { step: 2, of: 3, title: left.length ? `You voted. Still waiting for ${listNames(left, ME)}` : 'Everyone has voted', detail: 'Change your vote until the last one is in. As the host, you can close the ballot for someone who is away.' }
      : { step: 2, of: 3, title: 'Vote in secret', detail: 'Pick one, or abstain, then Cast my vote. Nobody sees whom you chose. No clock: it closes once everyone has voted.' };
  return (
    <GameShell
      phase="Election day"
      status={<ReadyCount players={players} label="VOTED" />}
      now={now}
      footer={closed ? undefined : <WaitFooter ready={cast} onReady={() => setCast(true)} canReady={complete} planningProper words={BALLOT_WORDS} onContinue={() => setClosed(true)} />}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
        <DayCard at={2} testid="ballot-card">
          <span className="relative flex flex-wrap items-center gap-x-1.5 pr-4 text-xs @min-[1100px]/shell:text-lg" data-testid="voted">
            <span className="text-ink-2">Voted:</span>
            {voted.map((id) => (
              <Person key={id} id={id} size={14} />
            ))}
            <span className="text-ink-2">
              · {voted.length} of {players.length}. Never shown: for whom.
            </span>
            <IntentMarker note={N.E2} part="voted" at="tr" />
          </span>
          {closed ? (
            <div className="flex flex-col gap-1 rounded-control border border-warn/60 p-2 @min-[1100px]/shell:p-4" data-testid="ballot-closed">
              <span className="text-sm font-semibold @min-[1100px]/shell:text-xl" data-testid="closed-line">
                {seat(ME).name} closed the ballot without {listNames(left, null)}.
              </span>
              <span className="text-xs text-ink-2 @min-[1100px]/shell:text-base">Every screen’s news says so. {cap(listNames(left, null))}’s vote doesn’t count.</span>
              <a href="#audit-election-reveal" className="text-xs font-semibold text-holo underline @min-[1100px]/shell:text-base" data-testid="to-reveal">
                The reveal ›
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 @min-[1100px]/shell:gap-6">
              {OFFICES.map((o) => (
                <BallotPaper key={o} office={o} pick={pick[o]} onPick={(id) => setPick((p) => ({ ...p, [o]: id }))} />
              ))}
              <VotesCard />
            </div>
          )}
          {!closed && <p className="text-[11px] text-ink-2 @min-[1100px]/shell:text-base">Change your vote until the last one is in. Who voted for whom is never shown.</p>}
        </DayCard>
        <WideMap />
      </div>
    </GameShell>
  );
}

/** The ballot on the big screen: who runs, who has voted, everyone's votes in words (E-5). */
export function TvBallot() {
  const voted = ['lena', 'ossa', 'brix'];
  const { plotsPerVote, repHigh, taxPerVote, taxCap } = POLITICS.weight;
  const cols = [
    { key: 'base', head: 'Everyone', rule: '1 each' },
    { key: 'land', head: 'Land', rule: `+1 per ${plotsPerVote} plots` },
    { key: 'name', head: 'Good name', rule: `+1 at ${repHigh}+` },
    { key: 'taxes', head: 'Tax paid', rule: `+1 per ${taxPerVote} cr, up to ${taxCap}` },
    { key: 'baron', head: 'Land Baron', rule: '+1' },
  ] as const;
  return (
    <div className="h-[720px] w-[1280px] @container/shell">
      <div className="flex h-full flex-col gap-4 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-ballot">
        <TvHeader game={{ ...VIEW, phase: 'planning', month: ELECTION_MONTH }} title="Election day · vote" />
        <div className="flex items-center gap-6">
          <span className="font-display text-4xl font-semibold text-holo">Vote on your phone</span>
          <span className="text-2xl text-ink-2">Nobody sees for whom.</span>
          <span className="ml-auto">
            <Steps at={2} tv />
          </span>
        </div>
        <div className={cx('grid min-h-0 flex-1 gap-6', OFFICES.length > 1 ? 'grid-cols-[1fr_1fr_420px]' : 'grid-cols-[1fr_440px]')}>
          {OFFICES.map((o) => (
            <section key={o} className="relative flex flex-col gap-3 rounded-sheet border border-holo-line bg-panel px-6 py-4" data-testid={`tv-ballot-${o}`}>
              <span className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-semibold">{OFFICE_NAME[o]}</span>
                <span className="text-xl text-ink-2">{JOB[o]}</span>
              </span>
              {(FIELD[o] ?? []).map((id) => (
                <span key={id} className="flex items-center gap-3">
                  <Creature species={seat(id).species} color={SLOT_COLOR[seat(id).slot]} size={48} />
                  <span className="font-display text-3xl font-semibold">{seat(id).name}</span>
                  {o === 'governor' && <span className="text-2xl text-ink-2">{promiseWords(PROMISE[id])}</span>}
                </span>
              ))}
              {o === 'governor' && <IntentMarker note={N.E4} part="tv-ballot" at="tr" />}
            </section>
          ))}
          <section className="relative flex flex-col gap-2 rounded-sheet border-2 border-holo bg-holo-soft px-6 py-4" data-testid="tv-voted">
            <span className="font-display text-3xl font-semibold" data-testid="tv-voted-count">
              Voted {voted.length} of {PEOPLE.length}
            </span>
            <ul className="flex flex-col gap-1.5">
              {PEOPLE.map((id) => (
                <li key={id} className={cx('flex items-center gap-3 text-2xl', voted.includes(id) ? 'text-ink-2' : 'font-semibold')}>
                  <PlayerMark slot={seat(id).slot} size={24} glow={!voted.includes(id)} />
                  <span className="flex-1">{seat(id).name}</span>
                  <span className={cx('font-mono text-lg', voted.includes(id) ? 'text-ok' : AWAY.includes(id) ? 'text-warn' : 'text-holo')}>{voted.includes(id) ? 'VOTED ✓' : AWAY.includes(id) ? 'AWAY' : 'VOTING'}</span>
                </li>
              ))}
            </ul>
            <span className="text-lg text-ink-2">Still waiting for Kai · Lena, the host, can continue without Kai.</span>
            <IntentMarker note={N.E10} part="tv-ballot" at="tr" />
          </section>
        </div>
        <section className="relative rounded-panel border border-holo-line bg-panel px-6 py-3" data-testid="tv-weights">
          <table className="w-full text-left text-xl">
            <thead>
              <tr className="text-ink-2">
                <th className="pb-1 font-normal">Votes this month</th>
                {cols.map((c) => (
                  <th key={c.key} className="pb-1 text-right font-normal">
                    <span className="block font-semibold text-ink">{c.head}</span>
                    <span className="block text-sm">{c.rule}</span>
                  </th>
                ))}
                <th className="pb-1 text-right font-semibold text-ink">Votes</th>
              </tr>
            </thead>
            <tbody>
              {WEIGHTS.map((w) => (
                <tr key={w.id} className="border-t border-holo-faint" data-testid={`tv-weight-${w.id}`}>
                  <td className="py-0.5">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <Creature species={seat(w.id).species} color={SLOT_COLOR[seat(w.id).slot]} size={24} />
                      {seat(w.id).name}
                    </span>
                  </td>
                  {cols.map((c, i) => (
                    <td key={c.key} data-num className="text-right font-mono">
                      {i === 0 ? w[c.key] : w[c.key] > 0 ? `+${w[c.key]}` : '·'}
                    </td>
                  ))}
                  <td data-num className="text-right font-mono font-bold">
                    {w.votes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <IntentMarker note={N.E5} part="tv" at="tr" />
        </section>
      </div>
    </div>
  );
}

// --- E-6 · the result, kept after the ceremony -----------------------------------------------------------------------

/** Every candidate with their votes, and how each office was won, in plain words. */
export function ResultList({ me = ME, compact = false }: { me?: string | null; compact?: boolean }) {
  const wide = useWide();
  return (
    <div className="relative flex flex-col gap-1.5 @min-[1100px]/shell:gap-3" data-testid="result-list">
      {OFFICES.map((o) => {
        const r = RESULT[o]!;
        return (
          <section key={o} className="flex flex-col gap-0.5 @min-[1100px]/shell:gap-1" data-testid={`result-${o}`}>
            <span className="text-xs font-semibold text-ink-2 @min-[1100px]/shell:text-base">{OFFICE_NAME[o]}</span>
            {r.tallies.map((t) => (
              <span key={t.id} className="flex items-center gap-2 text-xs @min-[1100px]/shell:text-base" data-testid={`result-${o}-${t.id}`}>
                <Person id={t.id} me={me} size={wide ? 20 : 14} />
                <span className="flex gap-0.5" aria-hidden>
                  {Array.from({ length: t.votes }, (_, i) => (
                    <span key={i} className="h-2.5 w-3 rounded-chip @min-[1100px]/shell:h-3.5 @min-[1100px]/shell:w-4" style={{ background: SLOT_COLOR[seat(t.id).slot] }} />
                  ))}
                </span>
                <span data-num className="font-mono font-bold">
                  {t.votes} vote{t.votes === 1 ? '' : 's'}
                </span>
                {t.id === r.winner && <span className="rounded-chip bg-holo px-1 font-mono text-[9px] font-bold leading-4 text-on-holo @min-[1100px]/shell:text-xs">ELECTED</span>}
              </span>
            ))}
            {!compact && (
              <span className={cx('text-[11px] leading-snug @min-[1100px]/shell:text-sm', r.how === 'votes' ? 'text-ink-2' : 'text-warn')} data-testid={`result-how-${o}`}>
                {howWords(r, me)}
              </span>
            )}
          </section>
        );
      })}
      <IntentMarker note={N.E6} part="list" at="tr" />
    </div>
  );
}

// --- E-7 · the new Governor ------------------------------------------------------------------------------------------

/** The tax as everyone sees it: the promise beside it, kept or not (E-7), and the Land Baron named (E-8). */
function OfficesLine({ set }: { set: number | null }) {
  const baron = baronWords(ME);
  const status = set === null ? { text: `tax still ${TAX}%`, cls: 'text-warn' } : set <= LENA_CAP ? { text: `tax ${set}%, kept`, cls: 'text-ok' } : { text: `tax ${set}%, promise broken`, cls: 'text-alert' };
  const next = nextElection(ELECTION_MONTH)!;
  return (
    <section
      className="relative flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-panel border border-holo-line bg-panel px-2 py-1.5 text-[11px] text-ink-2 @min-[1100px]/shell:gap-x-2 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-base"
      data-testid="offices-line"
    >
      <span className="relative pr-4" data-testid="office-governor">
        Governor <Person id="lena" me={null} size={12} /> · promised {promiseWords(PROMISE[ME], false)} ·{' '}
        <strong className={status.cls} data-testid="promise-status">
          {status.text}
        </strong>
        <IntentMarker note={N.E7} part="line" at="tr" />
      </span>
      ·
      <span className="relative pr-4" data-testid="land-baron" title={baron.rule}>
        {baron.head}
        <IntentMarker note={N.E8} part="line" at="tr" />
      </span>
      · <span>Next election: month {next}</span>
    </section>
  );
}

/** The Governor's tax, with the promise in view (E-7). */
function GovernorDesk({ tax, setTax, set, onSet }: { tax: number; setTax: (n: number) => void; set: number | null; onSet: () => void }) {
  const breaks = tax > LENA_CAP;
  const done = set !== null && set === tax;
  const { view } = usePhoneGame();
  return (
    <section className="relative flex flex-col gap-1 @min-[1100px]/shell:gap-2" data-testid="gov-tax">
      <p className="text-xs @min-[1100px]/shell:text-base" data-testid="gov-promise">
        <span className="label-caps mr-1.5 text-[10px]! @min-[1100px]/shell:text-xs!">Sales tax</span>
        You promised: <strong className="font-semibold">no higher than {LENA_CAP}%</strong>
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label="One point lower" disabled={tax <= TAX_LOW} onClick={() => setTax(Math.max(TAX_LOW, tax - 1))} data-testid="tax-down">
          −
        </Button>
        <span data-num className={cx('w-14 shrink-0 text-center font-mono text-2xl font-bold @min-[1100px]/shell:w-20 @min-[1100px]/shell:text-4xl', breaks && 'text-alert')} data-testid="tax-value">
          {tax}%
        </span>
        <Button size="md" variant="outline" className="w-11 shrink-0 px-0" aria-label="One point higher" disabled={tax >= TAX_HIGH} onClick={() => setTax(Math.min(TAX_HIGH, tax + 1))} data-testid="tax-up">
          +
        </Button>
        <Button size="md" className="min-w-0 flex-1 whitespace-nowrap px-2" disabled={done} onClick={onSet} data-testid="tax-confirm">
          Set {tax}%
        </Button>
      </div>
      {breaks ? (
        <p className="text-xs font-semibold text-alert @min-[1100px]/shell:text-base" data-testid="gov-breaks">
          {tax}%: this breaks your promise.
        </p>
      ) : done ? (
        <p className="text-xs font-semibold text-ok @min-[1100px]/shell:text-base" data-testid="gov-done">
          Done: {tax}% from now on.
        </p>
      ) : (
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-base" data-testid="gov-within">
          Within your promise. Set it to make it count.
        </p>
      )}
      <p className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-sm">
        This month {TAX_LOW}–{TAX_HIGH}%, from last month’s {TAX}%. The tax fills the colony fund ({view.treasury.money} cr), which pays you {POLITICS.pay.governor} cr a month. Everyone sees your tax beside your promise.
      </p>
      <IntentMarker note={N.E7} part="desk" at="tr" />
    </section>
  );
}

/**
 * #audit-election-governor: month 4 after the reveal, Lena the new Governor. Mock only: `set` is the tax Lena has
 * already set as the frame opens (the laptop opens after Set at 4%).
 */
export function NewGovernor({ set: startSet = null, ready: startReady = false }: { set?: number | null; ready?: boolean }) {
  const [ready, setReady] = useState(startReady);
  const { players } = useWaiting(ready);
  const [desk, setDesk] = useState<Desk>('governor');
  const [tax, setTax] = useState(startSet ?? TAX);
  const [set, setSet] = useState<number | null>(startSet);
  const desks: Desk[] = ['governor', ...PLAIN_DESKS.map((d) => d.id)];
  const now: Now = { title: 'Set the sales tax', detail: `Then plan your month. You are the new Governor, until month ${nextElection(ELECTION_MONTH)! - 1}. You promised no higher than ${LENA_CAP}%.` };
  const body =
    desk === 'governor' ? (
      <GovernorDesk tax={tax} setTax={setTax} set={set} onSet={() => setSet(tax)} />
    ) : desk === 'council' ? (
      <>
        <Section title={`Election results · month ${ELECTION_MONTH}`} testid="council-result">
          <ResultList />
        </Section>
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">Run for office any month: the next election is in month {nextElection(ELECTION_MONTH)}.</p>
      </>
    ) : desk === 'colony' ? (
      <>
        <ThisMonth />
        <News />
      </>
    ) : desk === 'talk' ? (
      <TalkDesk />
    ) : desk === 'market' ? (
      <MarketDesk onTool={() => {}} />
    ) : (
      <SecretDesk onTool={() => {}} />
    );
  return (
    <OnlyYouLook.Provider value="eye">
      <PlainWords.Provider value>
        <GameShell
          phase="Planning"
          status={<ReadyCount players={players} />}
          now={now}
          foldNow
          nowMark={<IntentMarker note={N.E9} part="now" />}
          rail={
            <>
              <DeskTabs desks={desks} desk={desk} setDesk={setDesk} mark={<IntentMarker note={N.E9} part="desks" at="tr" />} />
              <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${desk}`}>
                {body}
              </div>
            </>
          }
          footer={<WaitFooter ready={ready} onReady={() => setReady(true)} planningProper words={PLAN_WORDS} />}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
            <OfficesLine set={set} />
            <StageMap />
            <div className="hidden @min-[1100px]/shell:block">
              <MarketStrip />
            </div>
          </div>
        </GameShell>
      </PlainWords.Provider>
    </OnlyYouLook.Provider>
  );
}
