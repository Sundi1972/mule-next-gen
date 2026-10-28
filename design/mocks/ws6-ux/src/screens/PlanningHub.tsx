import { Button, Creature, cx, HoloMap, SLOT_COLOR, type MapTile, type Slot } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { mapTiles, plotName } from '../../../../../apps/web/src/game/derive';
import { MapFit } from '../../../../../apps/web/src/phone/Shell';
import { H, VIEW, W } from '../fixture';
import { GameShell, useWide, type Now } from '../proposed/GameShell';
import { ReadyBar, ReadyCount, readyNow, useWaiting } from '../proposed/PlanningReady';
import type { CodeState } from '../proposed/HandoffCode';
import { MarketStrip, News, ThisMonth } from './PlanningBrief';

/**
 * Planning as the hub (Heiko 2026-10-22, AM-8: "isn't that where I can
 * investigate, plan my factories, chat with people to do trades, mark plots and
 * MULEs for sale, plan sabotage, plan elections, do politics, chat privately…
 * if I am the governor I can manage the colony, set taxes; the sheriff can do
 * his stuff — isn't that all happening in the plan phase?").
 *
 * The council table of 00-concept "Core loop" step 1 and 05-colony-politics:
 * - STAGE: "This month" (everything the month allows, at a glance, each a door
 *   into its desk), then the colony map, the place most of it happens: look,
 *   geo drone, list a plot, plan a factory, and (by office or in secret) guard
 *   a plot or pick a sabotage target. Store prices under the map on a laptop.
 * - GUIDE: Now, then the desks: Colony · Talk · Council · Market · Secret, and
 *   the Governor's and Sheriff's desks only for whoever holds the office.
 *
 * What exists today is plain; what WS7 builds is marked SOON; what only you see
 * is marked with a lock (00-concept "your phone is your private hand of
 * cards"). No deal swaps goods, money, plots or MULEs (decided 21 Oct): deal
 * cards are pacts, joint ventures, promises and lent votes.
 *
 * GRAFT TARGET: apps/web/src/phone/Planning.tsx (frame: WS6; each desk's
 * workings: WS7, from this scaffold). Fixture: month 4, an election month.
 */

export type Desk = 'colony' | 'talk' | 'council' | 'market' | 'secret' | 'governor' | 'sheriff';
export type Office = 'none' | 'governor' | 'sheriff';
type Status = 'today' | 'part' | 'soon';
type Tool = 'look' | 'drone' | 'list' | 'factory' | 'guard' | 'target';

const ICON: Record<Desk, string> = {
  colony: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6',
  talk: 'M4 5h16v10H9l-5 4z',
  council: 'M4 10h16 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M3 20h18 M12 3l9 5H3z',
  market: 'M3 12l9-9h8v8l-9 9z M16 7h.01',
  secret: 'M3 10c3-4 15-4 18 0-1 4-5 6-9 6s-8-2-9-6z M8 10h.01 M16 10h.01',
  governor: 'M4 18h16 M5 18l-1-9 5 4 3-7 3 7 5-4-1 9',
  sheriff: 'M12 2l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 15.6 6.6 18.5l1.2-6L3.3 8.3l6.1-.7z',
};

const DESKS: { id: Desk; label: string; status: Status; locked?: boolean; office?: Office }[] = [
  { id: 'colony', label: 'Colony', status: 'today' },
  { id: 'talk', label: 'Talk', status: 'part' },
  { id: 'council', label: 'Council', status: 'part' },
  { id: 'market', label: 'Market', status: 'today' },
  { id: 'secret', label: 'Secret', status: 'soon', locked: true },
  { id: 'governor', label: 'Governor', status: 'part', office: 'governor' },
  { id: 'sheriff', label: 'Sheriff', status: 'soon', office: 'sheriff', locked: true },
];

function Glyph({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Built by WS7, not yet in the game. */
function Soon({ part = false, slice }: { part?: boolean; slice?: number }) {
  const next = slice === 1;
  return (
    <span className={cx('rounded-chip border px-1 font-mono text-[9px] font-bold leading-4 @min-[1100px]/shell:text-[10px]', next ? 'border-holo/60 text-holo' : 'border-warn/50 text-warn')}>
      {slice ? (next ? 'WS7 · SLICE 1 · NEXT' : `LATER · WS7 SLICE ${slice}`) : part ? 'PART SOON' : 'SOON · WS7'}
    </span>
  );
}

/** Only you see this. */
function Private({ text = 'ONLY YOU' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-chip bg-holo-soft px-1 font-mono text-[9px] font-bold leading-4 text-holo @min-[1100px]/shell:text-[10px]">
      <svg aria-hidden viewBox="0 0 24 24" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={2.4}>
        <rect x={5} y={11} width={14} height={10} rx={2} />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {text}
    </span>
  );
}

function Section({ title, badge, children, testid }: { title: ReactNode; badge?: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-2" data-testid={testid}>
      <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">
        {title}
        {badge}
      </h3>
      {children}
    </section>
  );
}

const PLAYER = Object.fromEntries(VIEW.players.map((p, i) => [p.id, { ...p, slot: i as Slot }]));
const Who = ({ id, size = 16 }: { id: string; size?: number }) => {
  const p = PLAYER[id]!;
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Creature species={p.species} color={SLOT_COLOR[p.slot]} size={size} />
      {p.name}
    </span>
  );
};

// --- This month: everything the month allows, as doors into the desks ---------------------------

function Agenda({ office, after, onDesk, onTool }: { office: Office; after: boolean; onDesk: (d: Desk) => void; onTool: (t: Tool) => void }) {
  const items: { key: string; title: string; sub: string; status: Status; slice?: number; locked?: boolean; go: () => void }[] = [
    ...(after ? [] : [{ key: 'election', title: 'Election day', sub: 'Run, then vote: Governor and Sheriff', status: 'soon' as Status, slice: 1, go: () => onDesk('council') }]),
    { key: 'law', title: 'Law vote', sub: 'Pollution tax: 20 cr a point', status: 'soon', slice: 2, go: () => onDesk('council') },
    { key: 'deals', title: '2 deal offers', sub: 'Ossa, Kai', status: 'soon', slice: 3, locked: true, go: () => onDesk('talk') },
    { key: 'drone', title: 'Geo drone', sub: '2 plots · 40 cr', status: 'today', locked: true, go: () => onTool('drone') },
    { key: 'list', title: 'Sell a plot or MULE', sub: 'At the auction after planning', status: 'today', go: () => onDesk('market') },
    { key: 'sabotage', title: 'Sabotage', sub: 'One secret order', status: 'soon', slice: 4, locked: true, go: () => onDesk('secret') },
    ...(office === 'sheriff' ? [{ key: 'sheriff', title: "Sheriff's desk", sub: '2 guards · 1 inspection', status: 'soon' as Status, slice: 4, locked: true, go: () => onDesk('sheriff') }] : []),
    ...(office === 'governor' ? [{ key: 'governor', title: "Governor's desk", sub: 'Set the sales tax', status: 'soon' as Status, slice: 1, go: () => onDesk('governor') }] : []),
  ];
  return (
    <section className="flex flex-col gap-1.5" data-testid="agenda">
      <span className="label-caps flex items-center justify-between @min-[1100px]/shell:text-sm!">
        This month · month 4 <span className="font-mono text-[10px] text-ink-3 @min-[1100px]/shell:text-xs">EXPORT SHIP NEXT MONTH · LAND BARON: OSSA</span>
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1 @min-[1100px]/shell:grid @min-[1100px]/shell:grid-cols-[repeat(auto-fit,minmax(0,1fr))] @min-[1100px]/shell:grid-flow-col @min-[1100px]/shell:gap-2 @min-[1100px]/shell:overflow-visible">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={it.go}
            className={cx(
              'flex min-w-[124px] shrink-0 flex-col items-start gap-0.5 rounded-control border bg-panel px-2 py-1 text-left hover:border-holo @min-[1100px]/shell:min-w-0 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2',
              it.key === 'election' ? 'border-2 border-holo bg-holo-soft' : 'border-holo-line',
            )}
            data-testid={`agenda-${it.key}`}
          >
            <span className="flex w-full items-center gap-1">
              <span className="truncate text-xs font-semibold @min-[1100px]/shell:text-base">{it.title}</span>
              {it.locked && <Private text="" />}
            </span>
            <span className="truncate text-[10px] text-ink-2 @min-[1100px]/shell:text-sm">{it.sub}</span>
            {it.status !== 'today' && <Soon part={it.status === 'part'} {...(it.slice ? { slice: it.slice } : {})} />}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Who holds which office, on every planning screen and the TV (WS7 slice 1). */
function Offices({ after, office }: { after: boolean; office: Office }) {
  // Before the vote, last term's holders; after it, the winners (the reveal: Kai and Lena, or Lena as Governor in that state).
  const gov = !after ? 'ossa' : office === 'governor' ? 'lena' : 'kai';
  const sheriff = !after ? 'brix' : office === 'governor' ? 'brix' : 'lena';
  const term = after ? 'M4–6' : 'M1–3';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-holo-line bg-panel px-2 py-1 text-xs @min-[1100px]/shell:gap-x-5 @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-1.5 @min-[1100px]/shell:text-sm" data-testid="offices">
      <span>
        Governor <Who id={gov} size={14} /> <span className="font-mono text-ink-3">{term}</span>
      </span>
      <span>
        Sheriff <Who id={sheriff} size={14} /> <span className="font-mono text-ink-3">{term}</span>
      </span>
      <span>
        Land Baron <Who id="ossa" size={14} /> <span className="font-mono text-ink-3">9 PLOTS</span>
      </span>
      <span className="ml-auto font-mono text-ink-3">{after ? 'NEXT ELECTION M7' : 'ELECTION NOW · NEXT M7'}</span>
      <Soon slice={1} />
    </div>
  );
}

// --- The desks --------------------------------------------------------------------------------

function ColonyDesk() {
  return (
    <>
      <ThisMonth />
      <News />
      <Section title="Colony" badge={<Soon slice={1} />} testid="colony-facts">
        <ul className="flex flex-col gap-1 text-sm">
          <li data-testid="tax-readonly">Sales tax 5% (set by Ossa, ±0) · colony fund 840 cr</li>
          <li>From the fund each month: Governor 50 cr, Sheriff 30 cr</li>
          <li data-testid="land-baron">
            Land Baron <Who id="ossa" /> · 9 plots: +1 vote, breaks a tied election. Whoever owns the most plots, checked every planning phase.
          </li>
          <li>Air 22 · clean</li>
        </ul>
      </Section>
    </>
  );
}

function TalkDesk() {
  const [channel, setChannel] = useState<'all' | 'ossa' | 'kai' | 'pact'>('ossa');
  const channels: { id: typeof channel; label: ReactNode; private: boolean; status: Status }[] = [
    { id: 'all', label: 'Everyone', private: false, status: 'today' },
    { id: 'ossa', label: <Who id="ossa" size={14} />, private: true, status: 'soon' },
    { id: 'kai', label: <Who id="kai" size={14} />, private: true, status: 'soon' },
    { id: 'pact', label: 'Pact: Ossa + you', private: true, status: 'soon' },
  ];
  return (
    <>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Chat" data-testid="channels">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={channel === c.id}
            onClick={() => setChannel(c.id)}
            className={cx('flex items-center gap-1 rounded-chip border px-2 py-0.5 text-xs @min-[1100px]/shell:text-sm', channel === c.id ? 'border-holo bg-holo-soft' : 'border-holo-line')}
            data-testid={`channel-${c.id}`}
          >
            {c.label}
            {c.private && <Private text="" />}
          </button>
        ))}
      </div>
      {channel === 'all' ? (
        <Section title="Table chat" badge={<span className="font-mono text-[10px] text-ink-3">EVERYONE SEES IT</span>}>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              <Who id="kai" size={14} />: Smithore is going to spike. Just saying.
            </li>
            <li>
              <Who id="ossa" size={14} />: Vote Ossa: no land tax while I'm Governor.
            </li>
          </ul>
        </Section>
      ) : (
        <Section title={channel === 'pact' ? 'Pact channel' : 'Whisper'} badge={<><Private text="ONLY YOU TWO" /><Soon slice={3} /></>} testid="whisper">
          <ul className="flex flex-col gap-1.5 text-sm">
            <li>
              <Who id="ossa" size={14} />: Kai is leading. Let's not hurt each other, and vote together on the land tax?
            </li>
            <li className="flex flex-col gap-1.5 rounded-panel border-2 border-holo bg-holo-soft p-2" data-testid="deal-card">
              <span className="label-caps flex justify-between">
                Deal card from Ossa <span className="text-ink-3">expires at Ready</span>
              </span>
              <span className="font-display font-semibold @min-[1100px]/shell:text-lg">Non-aggression pact · 3 months</span>
              <span className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">Neither of you may sabotage the other until month 7. Breaking it costs a lot of reputation (you 74, Ossa 61).</span>
              <span className="font-display font-semibold @min-[1100px]/shell:text-lg">+ Vote together on the land tax</span>
              <span className="grid grid-cols-2 gap-1.5">
                <Button size="md">Accept</Button>
                <Button size="md" variant="outline">
                  Decline
                </Button>
              </span>
            </li>
          </ul>
        </Section>
      )}
      <div className="flex gap-1.5">
        <input className="h-9 min-w-0 flex-1 rounded-control border border-holo-line bg-panel px-2 text-sm" placeholder={channel === 'all' ? 'Say something to everyone' : 'Whisper to Ossa'} />
        <Button size="md" variant="outline" aria-label="Attach a deal card" data-testid="add-deal">
          + Deal
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-ink-3 @min-[1100px]/shell:text-xs">
        Deal cards: a non-aggression pact, a joint venture, a promise, or lending your votes for a month. Goods, money, plots and MULEs never change hands in a deal: they go to auction.
      </p>
    </>
  );
}

/** Everyone's votes and where they come from (05 "How you get more votes"); public. */
const WEIGHTS = [
  { id: 'lena', base: 1, land: 0, rep: 0, baron: 0, taxes: 1 },
  { id: 'ossa', base: 1, land: 0, rep: 0, baron: 1, taxes: 0 },
  { id: 'brix', base: 1, land: 0, rep: 0, baron: 0, taxes: 1 },
  { id: 'kai', base: 1, land: 0, rep: 0, baron: 0, taxes: 0 },
];

function VoteWeights() {
  return (
    <Section title="Votes this month" badge={<Soon slice={1} />} testid="vote-weights">
      <table className="w-full text-left text-xs @min-[1100px]/shell:text-sm">
        <thead className="text-ink-3">
          <tr>
            <th className="font-normal">Player</th>
            <th className="text-right font-normal" title="1 each">Base</th>
            <th className="text-right font-normal" title="+1 per 10 plots">Land</th>
            <th className="text-right font-normal" title="+1 at 70, −1 below 30; everyone 50 until slice 3">Rep.</th>
            <th className="text-right font-normal">Baron</th>
            <th className="text-right font-normal" title="+1 per 300 cr paid, at most +2">Taxes</th>
            <th className="text-right font-semibold text-ink">Votes</th>
          </tr>
        </thead>
        <tbody>
          {WEIGHTS.map((w) => (
            <tr key={w.id} className={cx('border-t border-holo-faint', w.id === 'lena' && 'bg-holo-soft')} data-testid={`weight-${w.id}`}>
              <td className="py-1">
                <Who id={w.id} size={14} />
              </td>
              {[w.base, w.land, w.rep, w.baron, w.taxes].map((n, i) => (
                <td key={i} data-num className="text-right font-mono">
                  {i === 0 ? n : n > 0 ? `+${n}` : n < 0 ? n : '·'}
                </td>
              ))}
              <td data-num className="text-right font-mono font-bold">
                {w.base + w.land + w.rep + w.baron + w.taxes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export type Election = 'nominate' | 'promise' | 'ballot';

/** The colony's tax this month, for the promise picker's starting cap. */
const TAX_NOW: number = 5;
const TAX_MAX = 15;

/** WS7 C12 / RULE-10 (Heiko: "Tax promises now"): a Governor candidate picks one; a Sheriff makes none until slice 4. */
type Promise = { kind: 'cap'; n: number } | { kind: 'lower' } | { kind: 'hold' };
const promiseText = (p: Promise) => (p.kind === 'cap' ? `Tax no higher than ${p.n}%` : p.kind === 'lower' ? 'Lower the tax' : 'Hold the tax');

/**
 * Running for Governor asks for a promise first: one of three, no free text. The cap starts at today's tax; "Lower"
 * can't be promised at 0 %. Nothing is sent until "Run with this promise".
 */
function PromisePicker({ onRun, onCancel }: { onRun: (p: Promise) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Promise['kind'] | null>(null);
  const [n, setN] = useState(TAX_NOW);
  const chosen: Promise | null = kind === 'cap' ? { kind, n } : kind ? { kind } : null;
  const chip = (k: Promise['kind'], label: ReactNode, testid: string, disabled?: string) => (
    <label
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-2 py-1 text-sm',
        kind === k ? 'border-holo bg-holo-soft' : 'border-holo-line',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      data-testid={testid}
    >
      <input type="radio" name="promise" checked={kind === k} disabled={!!disabled} onChange={() => setKind(k)} className="accent-[var(--color-holo)]" />
      <span className="flex min-w-0 flex-1 flex-col">
        {label}
        {disabled && <span className="text-[11px] text-ink-3">{disabled}</span>}
      </span>
    </label>
  );
  return (
    <div className="flex flex-col gap-1.5 rounded-panel border border-holo bg-panel p-2" role="radiogroup" aria-label="Your promise as Governor" data-testid="promise-pick">
      <span className="text-sm font-semibold">Your promise as Governor</span>
      <span className="text-xs text-ink-2">Everyone sees it on the ballot and the TV. Tax today: {TAX_NOW}%.</span>
      {chip(
        'cap',
        <span className="flex flex-wrap items-center gap-1.5">
          Tax no higher than
          <span className="inline-flex items-center rounded-control border border-holo-line" onClick={() => setKind('cap')}>
            <button type="button" aria-label="Lower the cap" disabled={n <= 0} onClick={() => setN((x) => Math.max(0, x - 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-minus">
              −
            </button>
            <span data-num className="w-9 text-center font-mono font-bold" data-testid="promise-cap-value">
              {n}%
            </span>
            <button type="button" aria-label="Raise the cap" disabled={n >= TAX_MAX} onClick={() => setN((x) => Math.min(TAX_MAX, x + 1))} className="grid size-9 place-items-center text-holo disabled:opacity-40" data-testid="promise-cap-plus">
              +
            </button>
          </span>
        </span>,
        'promise-cap',
      )}
      {chip('lower', 'Lower the tax', 'promise-lower', TAX_NOW === 0 ? 'The tax is already 0 %.' : undefined)}
      {chip('hold', 'Hold the tax', 'promise-hold')}
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <Button size="md" disabled={!chosen} onClick={() => chosen && onRun(chosen)} data-testid="promise-run">
          {chosen ? `Run, promising “${promiseText(chosen)}”` : 'Pick a promise to run'}
        </Button>
        <Button size="md" variant="ghost" onClick={onCancel} data-testid="promise-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CouncilDesk({ election }: { election: Election }) {
  const [running, setRunning] = useState<'governor' | 'sheriff' | null>(election === 'promise' ? null : 'sheriff');
  const [picking, setPicking] = useState(election === 'promise');
  const [promise, setPromise] = useState<Promise | null>(null);
  const [gov, setGov] = useState<string | null>('kai');
  const [sheriff, setSheriff] = useState<string | null>(null);
  const [law, setLaw] = useState<'yes' | 'no' | null>(null);
  const Ballot = ({ title, cands, pick, onPick }: { title: string; cands: { id: string; promise: string }[]; pick: string | null; onPick: (id: string | null) => void }) => (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold @min-[1100px]/shell:text-base">{title}</legend>
      {[...cands, { id: '', promise: '' }].map((c) => (
        <label key={c.id || 'abstain'} className={cx('flex cursor-pointer items-start gap-2 rounded-control border p-1.5 text-sm', (pick ?? '') === c.id ? 'border-holo bg-holo-soft' : 'border-holo-line')}>
          <input type="radio" name={title} checked={(pick ?? '') === c.id} onChange={() => onPick(c.id || null)} className="mt-1 accent-[var(--color-holo)]" />
          {c.id ? (
            <span className="flex flex-col">
              <Who id={c.id} />
              {/* A Sheriff makes no promise yet (slice 4): no line, not an empty quote. */}
              {c.promise && <span className="text-xs text-ink-2" data-testid={`promise-${c.id}`}>“{c.promise}”</span>}
            </span>
          ) : (
            <span className="text-ink-2">Abstain</span>
          )}
        </label>
      ))}
    </fieldset>
  );
  const voted = ['ossa', 'kai', 'brix'];
  return (
    <>
      <Section title={election !== 'ballot' ? 'Election · who runs' : 'Election · secret ballot'} badge={<Soon slice={1} />} testid="election">
        <span className="flex items-center justify-between rounded-control bg-holo-soft px-2 py-1 font-mono text-[10px] font-bold text-holo @min-[1100px]/shell:text-xs" data-testid="election-stage">
          {election !== 'ballot' ? '1 NOMINATE · 2 BALLOT · 3 REVEAL' : '1 NOMINATE ✓ · 2 BALLOT · 3 REVEAL'}
          <span data-num>0:14</span>
        </span>
        {election !== 'ballot' ? (
          <>
            <div className="grid grid-cols-2 gap-1.5" data-testid="run">
              {/* Running for the other office switches your candidacy (WS7: one office per election). */}
              {/* Governor asks for a promise first; Sheriff stays one tap. */}
              <Button size="md" variant={running === 'governor' ? 'holo' : 'outline'} onClick={() => setPicking(true)} data-testid="run-governor">
                {running === 'sheriff' ? 'Run for Governor instead' : 'Run for Governor'}
              </Button>
              <Button size="md" variant={running === 'sheriff' ? 'holo' : 'outline'} onClick={() => (setRunning('sheriff'), setPromise(null), setPicking(false))} data-testid="run-sheriff">
                {running === 'governor' ? 'Run for Sheriff instead' : 'Run for Sheriff'}
              </Button>
            </div>
            <span className="text-xs text-ink-3" data-testid="cannot-run">
              When you can't run, the button says why: “Candidates are closed” or “Two Governor terms in a row”.
            </span>
            {picking && (
              <PromisePicker
                onRun={(p) => (setRunning('governor'), setPromise(p), setPicking(false))}
                onCancel={() => setPicking(false)}
              />
            )}
            {running && !picking && (
              <span className="flex items-center justify-between gap-2 text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="running">
                {running === 'governor' && promise
                  ? `You run for Governor, promising “${promiseText(promise)}”; one office at a time.`
                  : `You run for ${running === 'sheriff' ? 'Sheriff' : 'Governor'}; one office at a time.`}
                <button type="button" className="text-holo underline" onClick={() => setRunning(null)} data-testid="withdraw">
                  Withdraw
                </button>
              </span>
            )}
            <ul className="flex flex-col gap-1 text-sm" data-testid="candidates">
              <li>
                Governor: <Who id="ossa" size={14} />, <Who id="kai" size={14} />
                {running === 'governor' && (
                  <>
                    , <Who id="lena" size={14} />
                  </>
                )}
              </li>
              <li>
                Sheriff: <Who id="brix" size={14} />
                {running === 'sheriff' && (
                  <>
                    , <Who id="lena" size={14} />
                  </>
                )}
              </li>
            </ul>
            <span className="text-xs text-ink-3">Nobody runs: the richest player is appointed. One candidate: elected unopposed, no ballot.</span>
          </>
        ) : (
          <>
            <Ballot title="Governor" cands={[{ id: 'ossa', promise: 'Tax no higher than 3%' }, { id: 'kai', promise: 'Lower the tax' }]} pick={gov} onPick={setGov} />
            <Ballot title="Sheriff" cands={[{ id: 'brix', promise: '' }, { id: 'lena', promise: '' }]} pick={sheriff} onPick={setSheriff} />
            <span className="flex items-center gap-1.5 text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="voted">
              Voted: {voted.map((id) => <Who key={id} id={id} size={14} />)} · 3 of 4. Never shown: for whom.
            </span>
            <span className="text-xs text-ink-2 @min-[1100px]/shell:text-sm" data-testid="vote-weight">
              Your vote weighs <strong className="text-ink">2</strong>. Change it until the ballot closes; the result shows on every screen together.
            </span>
          </>
        )}
      </Section>
      <VoteWeights />
      <Section title="Law vote" badge={<Soon slice={2} />} testid="law-vote">
        <div className="flex flex-col gap-1.5 rounded-panel border border-holo-line bg-panel p-2 opacity-80">
          <span className="text-sm">
            <Who id="ossa" size={14} /> proposes: <strong>Pollution tax at 20 cr per air point</strong> (each polluter pays for the air it fouls, into the colony fund).
          </span>
          <span className="text-xs text-ink-2">For you: none of your plots pollute, so you pay nothing; Kai's smelter would pay about 40 cr a month.</span>
          <span className="grid grid-cols-2 gap-1.5">
            <Button size="md" variant={law === 'yes' ? 'holo' : 'outline'} onClick={() => setLaw('yes')}>
              Yes
            </Button>
            <Button size="md" variant={law === 'no' ? 'holo' : 'outline'} onClick={() => setLaw('no')}>
              No
            </Button>
          </span>
        </div>
        <span className="flex items-center gap-1.5">
          <button type="button" className="text-left text-sm text-holo underline-offset-2 hover:underline" data-testid="overrule">
            Call an overrule vote on the Governor's tax…
          </button>
          <Soon slice={5} />
        </span>
      </Section>
    </>
  );
}

function MarketDesk({ onTool }: { onTool: (t: Tool) => void }) {
  return (
    <>
      <Section title="Sell at the auction after planning" testid="list-asset">
        <p className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">Everything of value is sold at auction, so everyone gets a fair chance to bid.</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="md" variant="outline" onClick={() => onTool('list')} data-testid="list-plot">
            A plot…
          </Button>
          <Button size="md" variant="outline" onClick={() => onTool('list')} data-testid="list-mule">
            A MULE…
          </Button>
        </div>
        <span className="text-xs text-ink-3">Pick it on the map, set the minimum, and whether the store buys it if nobody bids.</span>
      </Section>
      <Section title="Up for auction this month">
        <ul className="flex flex-col gap-1 text-sm" data-testid="listings">
          <li>
            Plot {plotName(4, 5)} from <Who id="brix" size={14} /> · from 250 cr
          </li>
          <li>A colony plot · from 180 cr</li>
        </ul>
      </Section>
      <div className="@min-[1100px]/shell:hidden">
        <MarketStrip />
      </div>
    </>
  );
}

const SABOTAGE = [
  { id: 'power', name: 'Cut the power line', effect: 'one plot makes nothing next month', cost: 120, ok: 60, caught: 35 },
  { id: 'assay', name: 'Fake assay report', effect: 'a plot shows false Crystite', cost: 90, ok: 70, caught: 25 },
  { id: 'rumour', name: 'Market rumour', effect: "one good's opening price shifts", cost: 60, ok: 80, caught: 15 },
  { id: 'pirates', name: 'Tip off the pirates', effect: "raises the raid chance on a player's stock", cost: 150, ok: 45, caught: 40 },
  { id: 'steal', name: 'Steal a MULE', effect: "takes an empty MULE; low success", cost: 200, ok: 25, caught: 55 },
];

function SecretDesk({ onTool }: { onTool: (t: Tool) => void }) {
  const [pick, setPick] = useState('power');
  return (
    <>
      <div className="flex flex-col gap-1 rounded-panel border border-holo bg-holo-soft p-2 text-xs @min-[1100px]/shell:text-sm" data-testid="secret-banner">
        <span className="flex items-center gap-1.5">
          <Private /> <Soon slice={4} />
        </span>
        Only you see this. It plays out in production. If it is detected, everyone learns it was you.
      </div>
      <Section title="One order this month (numbers are placeholders)" testid="sabotage">
        <ul className="flex flex-col gap-1">
          {SABOTAGE.map((s) => (
            <li key={s.id}>
              <label className={cx('flex cursor-pointer items-start gap-2 rounded-control border p-1.5 text-sm', pick === s.id ? 'border-holo bg-holo-soft' : 'border-holo-line')}>
                <input type="radio" name="sabotage" checked={pick === s.id} onChange={() => setPick(s.id)} className="mt-1 accent-[var(--color-holo)]" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-ink-2">{s.effect}</span>
                  <span className="font-mono text-[10px] text-ink-3 @min-[1100px]/shell:text-xs">
                    {s.cost} CR · WORKS {s.ok}% · CAUGHT {s.caught}%
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button size="md" variant="outline" onClick={() => onTool('target')}>
          Pick the target on the map…
        </Button>
        <span className="text-xs text-warn">Ossa has a non-aggression pact with you: an order against her breaks it.</span>
      </Section>
    </>
  );
}

const BUDGET = [
  { id: 'reserve', name: 'Reserve', buys: 'an emergency shipment if a good runs short' },
  { id: 'security', name: 'Security', buys: 'sabotage detection +10% per 100' },
  { id: 'environment', name: 'Environment', buys: 'air −4 and one plot cleaned per 100' },
  { id: 'welfare', name: 'Welfare', buys: '100 cr to the last-placed player' },
  { id: 'projects', name: 'Projects', buys: 'saved toward the levee (500)' },
];

function GovernorDesk() {
  const START = 5;
  const [tax, setTax] = useState(8);
  const [lines, setLines] = useState<Record<string, number>>({ reserve: 100, security: 200, environment: 200, welfare: 0, projects: 300 });
  const fund = 840;
  const spent = Object.values(lines).reduce((a, b) => a + b, 0);
  return (
    <>
      <Section title="Sales tax" badge={<Soon slice={1} />} testid="gov-tax">
        <div className="flex items-center gap-2">
          <Button size="md" variant="outline" aria-label="One point lower" disabled={tax <= Math.max(0, START - 5)} onClick={() => setTax((x) => x - 1)} data-testid="tax-down">
            −
          </Button>
          <span data-num className="flex-1 text-center font-mono text-3xl font-bold @min-[1100px]/shell:text-4xl" data-testid="tax-value">
            {tax}%
          </span>
          <Button size="md" variant="outline" aria-label="One point higher" disabled={tax >= Math.min(15, START + 5)} onClick={() => setTax((x) => x + 1)} data-testid="tax-up">
            +
          </Button>
        </div>
        <span className="text-xs text-ink-2 @min-[1100px]/shell:text-sm">
          Last month {START}%. This month {Math.max(0, START - 5)}–{Math.min(15, START + 5)}%. At last month's sales this collects about <strong className="text-ink">{Math.round(tax * 21)} cr</strong>.
        </span>
        <Button size="md" data-testid="tax-confirm">
          Set the tax at {tax}%
        </Button>
        <span className="text-xs text-ink-3">Everyone sees “Sales tax {tax}% (set by you, {tax - START >= 0 ? '+' : ''}{tax - START})”. You can change it until planning ends.</span>
      </Section>
      <Section title={`Budget · fund ${fund} cr · ${fund - spent} left`} badge={<Soon slice={5} />} testid="gov-budget">
        {BUDGET.map((b) => (
          <div key={b.id} className="flex flex-col">
            <span className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 font-semibold">{b.name}</span>
              <input
                type="range"
                min={0}
                max={400}
                step={50}
                value={lines[b.id]}
                onChange={(e) => setLines((l) => ({ ...l, [b.id]: +e.target.value }))}
                className="min-w-0 flex-1 accent-[var(--color-holo)]"
                aria-label={b.name}
              />
              <span data-num className="w-10 text-right font-mono text-xs font-bold">
                {lines[b.id]}
              </span>
            </span>
            <span className="pl-24 text-[11px] text-ink-3">{b.buys}</span>
          </div>
        ))}
      </Section>
      <Section title="This month's law" badge={<Soon slice={2} />} testid="gov-law">
        <select className="h-9 rounded-control border border-holo-line bg-panel px-2 text-sm" aria-label="Propose a law">
          <option>Propose a law…</option>
          <option>Export tax (10 / 20 / 30%)</option>
          <option>Land tax (5 / 10 / 20 cr a plot)</option>
          <option>Pollution tax (10 / 20 / 40 cr per air point)</option>
          <option>Emission cap (air 40 / 50 / 60)</option>
          <option>Sabotage ban (fines 2× / 3×)</option>
        </select>
      </Section>
    </>
  );
}

function SheriffDesk({ onTool }: { onTool: (t: Tool) => void }) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-xs text-ink-2">
        <Private text="ONLY THE SHERIFF" /> <Soon slice={4} />
      </div>
      <Section title="Guards · 2 of 2 placed" testid="sheriff-guards">
        <span className="text-sm text-ink-2">Hidden until they catch someone. Sabotage on a guarded plot fails and the saboteur is revealed.</span>
        <Button size="md" variant="outline" onClick={() => onTool('guard')}>
          Move a guard on the map…
        </Button>
      </Section>
      <Section title="Investigate · 1 this month" testid="sheriff-investigate">
        <ul className="flex flex-col gap-1 text-sm">
          <li className="flex items-center justify-between gap-2 rounded-control border border-holo-line p-1.5">
            <span>Month 3: Kai's power line cut, culprit unknown</span>
            <Button size="md" variant="outline">
              Investigate
            </Button>
          </li>
        </ul>
      </Section>
      <Section title="Inspect one player" testid="sheriff-inspect">
        <select className="h-9 rounded-control border border-holo-line bg-panel px-2 text-sm" aria-label="Inspect">
          <option>Pick a player…</option>
          <option>Ossa</option>
          <option>Kai</option>
          <option>Brix</option>
        </select>
        <span className="text-xs text-ink-3">Laws' taxes reach only players you have inspected this term.</span>
      </Section>
      <button type="button" className="text-left text-sm text-alert underline-offset-2 hover:underline">
        Open an inquiry into the Governor (once per term)…
      </button>
    </>
  );
}

// --- The hub ----------------------------------------------------------------------------------

export function PlanningHub({
  desk: start = 'colony',
  office = 'sheriff',
  tool: startTool = 'look',
  election = 'ballot',
  handoff = false,
  ready: startReady = false,
  confirm = false,
}: {
  desk?: Desk;
  office?: Office;
  tool?: Tool;
  election?: Election | 'done';
  /** Mock only: open with the in-game hand-off dialog (#game-handoff), its code in that state. */
  handoff?: boolean | CodeState;
  /** Mock only: open already Ready (#hub-ready), or with the host's Continue confirmation open (#hub-continue). */
  ready?: boolean;
  confirm?: boolean;
}) {
  const [ready, setReady] = useState(startReady);
  const { players, others, isHost: host } = useWaiting(ready);
  const isHost = host && election === 'done';
  const [desk, setDesk] = useState<Desk>(start);
  const [tool, setTool] = useState<Tool>(startTool);
  const desks = DESKS.filter((d) => !d.office || d.office === office);
  const now: Now = ready
    ? readyNow(others, isHost)
    : election === 'nominate' || election === 'promise'
      ? { step: 1, of: 3, title: "Run for an office, or press I'm ready", detail: 'Election month: Governor and Sheriff. A Governor candidate promises something about the tax. Then the secret ballot, then the result on every screen at once.' }
      : election === 'ballot'
        ? { step: 2, of: 3, title: 'Cast your secret vote', detail: 'One vote per office, or abstain; your vote weighs 2. Then everything below is yours until you press Ready.' }
        : office === 'governor'
          ? { title: 'Set the sales tax, then plan your month', detail: 'You are the new Governor (months 4–6). The tax is yours to set until planning ends.' }
          : { title: 'Plan your month, then press Ready', detail: 'Next is the land grant. Kai, the new Governor, is setting the tax.' };
  const tools: { id: Tool; label: string; status: Status; locked?: boolean; show: boolean }[] = [
    { id: 'look', label: 'Look', status: 'today', show: true },
    { id: 'drone', label: 'Geo drone', status: 'today', locked: true, show: true },
    { id: 'list', label: 'Sell a plot', status: 'today', show: true },
    { id: 'factory', label: 'Plan a factory', status: 'soon', show: true },
    { id: 'guard', label: 'Guard', status: 'soon', locked: true, show: office === 'sheriff' },
    { id: 'target', label: 'Target', status: 'soon', locked: true, show: desk === 'secret' || tool === 'target' },
  ];
  const tiles: MapTile[] = mapTiles(VIEW).map((t) =>
    tool === 'drone' && t.x === 9 && t.y === 4 ? { ...t, flag: 'survey' } : tool === 'target' && t.x === 11 && t.y === 2 ? { ...t, flag: 'sabotage' } : tool === 'list' && t.x === 5 && t.y === 6 ? { ...t, flag: 'sale' } : t,
  );
  const deskBody =
    desk === 'colony' ? <ColonyDesk /> : desk === 'talk' ? <TalkDesk /> : desk === 'council' ? <CouncilDesk election={election === 'done' ? 'ballot' : election} /> : desk === 'market' ? <MarketDesk onTool={setTool} /> : desk === 'secret' ? <SecretDesk onTool={setTool} /> : desk === 'governor' ? <GovernorDesk /> : <SheriffDesk onTool={setTool} />;

  return (
    <GameShell
      phase="Planning"
      status={<ReadyCount players={players} />}
      now={now}
      handoff={handoff}
      rail={
        <>
          <div role="tablist" aria-label="Desks" className="grid grid-cols-4 gap-1" data-testid="desks">
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
                  d.office && 'border-warn/60',
                )}
                data-testid={`desk-${d.id}`}
              >
                <Glyph d={ICON[d.id]} size={16} />
                {d.label}
                {d.status !== 'today' && <span className={cx('absolute right-1 top-1 size-1.5 rounded-full', d.status === 'part' ? 'bg-warn/60' : 'bg-warn')} />}
                {d.locked && (
                  <svg aria-hidden viewBox="0 0 24 24" width={9} height={9} className="absolute left-1 top-1 text-holo" fill="none" stroke="currentColor" strokeWidth={2.6}>
                    <rect x={5} y={11} width={14} height={10} rx={2} />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid={`desk-body-${desk}`}>
            {deskBody}
          </div>
        </>
      }
      footer={<ReadyBar ready={ready} onReady={() => setReady(true)} confirm={confirm} planningProper={election === 'done'} />}
    >
      <HubStage tools={tools.filter((t) => t.show)} tool={tool} setTool={setTool} tiles={tiles} office={office} after={election === 'done'} setDesk={setDesk} />
    </GameShell>
  );
}

function HubStage({
  tools,
  tool,
  setTool,
  tiles,
  office,
  after,
  setDesk,
}: {
  tools: { id: Tool; label: string; status: Status; locked?: boolean }[];
  tool: Tool;
  setTool: (t: Tool) => void;
  tiles: MapTile[];
  office: Office;
  after: boolean;
  setDesk: (d: Desk) => void;
}) {
  const wide = useWide();
  const hint: Record<Tool, string> = {
    look: 'Tap a plot to see what it can make and who owns it.',
    drone: 'Tap up to 2 free plots: the drone reads their ground for 40 cr. Only you see the result.',
    list: 'Tap a plot of yours (or one with your MULE) to put it up for the auction.',
    factory: 'Tap a plot: see what a factory there would need and which neighbours feed it.',
    guard: 'Tap any plot to move a hidden guard there.',
    target: 'Tap the plot to sabotage. Nobody sees this.',
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
      <Offices after={after} office={office} />
      <Agenda office={office} after={after} onDesk={setDesk} onTool={setTool} />
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Map tools" data-testid="map-tools">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={cx('flex h-7 items-center gap-1 rounded-control border px-2 text-[11px] font-semibold @min-[1100px]/shell:h-9 @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-sm', tool === t.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2')}
            data-testid={`tool-${t.id}`}
          >
            {t.label}
            {t.locked && <Private text="" />}
            {t.status === 'soon' && <span className="size-1.5 rounded-full bg-warn" aria-label="soon" />}
          </button>
        ))}
        {wide && <span className="ml-2 text-sm text-ink-2">{hint[tool]}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="hub-map">
        <MapFit width={W} height={H}>
          <HoloMap width={W} height={H} tiles={tiles} focusSlot={0} density={wide ? 'tv' : 'phone'} selected={tool === 'look' ? null : tool === 'drone' ? { x: 9, y: 4 } : tool === 'target' ? { x: 11, y: 2 } : tool === 'list' ? { x: 5, y: 6 } : null} />
        </MapFit>
      </div>
      <div className="hidden @min-[1100px]/shell:block">
        <MarketStrip />
      </div>
    </div>
  );
}
