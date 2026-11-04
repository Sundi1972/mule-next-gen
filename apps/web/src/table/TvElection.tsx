import { POLITICS } from '@mule/engine';
import type { MuleView, PoliticsView, TableView } from '@mule/protocol';
import { Creature, cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../game/derive';
import { connectedIn, stillPlanning } from '../phone/hub/ready';
import { WaitingFor } from '../phone/hub/ReadyBar';
import { colorOf, OfficesCard, Steps } from '../phone/hub/politics/parts';
import { Ceremony, Progress, showOf } from '../phone/hub/politics/Reveal';
import { JOB, listNames, namer, OFFICE_NAME, officeNames, promiseWords, termEnd } from '../phone/hub/politics/words';
import { TvHeader } from './TableApp';

/** Election day on the big screen (E-2): the announcement, the ballot, then the reveal. Never who voted for whom. */
export function TvElection({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const election = game.politics?.election;
  if (!election) return null;
  if (election.stage === 'announce') return <TvAnnounce table={table} game={game} />;
  if (election.stage === 'ballot') return <TvBallot table={table} game={game} />;
  return <TvReveal game={game} />;
}

/** "Lena, the host, can continue without Kai.", or nothing when nobody is waited for. */
function hostLine(table: TableView<MuleView>, game: MuleView, left: string[]): string | null {
  const host = game.players.find((p) => p.id === table.hostId);
  if (!host || left.length === 0) return null;
  return `${host.name}, the host, can continue without ${listNames(left, null, namer(game))}.`;
}

/** The people the stage still waits for, as every phone's footer has them. */
const waitedFor = (table: TableView<MuleView>, game: MuleView) => stillPlanning(game.players, connectedIn(table.seats));

/**
 * The frame holds up to six candidates: the mock's sizes up to two, then smaller rows, avatars and gaps for four, then
 * six. `big` is the announcement's field, `list` the ballot's.
 */
const FIELD = {
  big: [
    { row: 'gap-5', creature: 80, name: 'text-5xl', promise: 'text-3xl', section: 'gap-5 py-6' },
    { row: 'gap-4', creature: 56, name: 'text-4xl', promise: 'text-2xl', section: 'gap-3 py-4' },
    { row: 'gap-3', creature: 36, name: 'text-2xl', promise: 'text-xl', section: 'gap-1.5 py-3' },
  ],
  list: [
    { row: 'gap-3', creature: 48, name: 'text-3xl', promise: 'text-2xl', section: 'gap-3 py-4' },
    { row: 'gap-3', creature: 36, name: 'text-2xl', promise: 'text-xl', section: 'gap-2 py-3' },
    { row: 'gap-2', creature: 28, name: 'text-xl', promise: 'text-lg', section: 'gap-1 py-2' },
  ],
} as const;

/** Which of three sizes a count of candidates or seats takes: up to two, four, six. */
const fill = (n: number) => (n <= 2 ? 0 : n <= 4 ? 1 : 2);
const fieldOf = (size: keyof typeof FIELD, n: number) => FIELD[size][fill(n)];

/** The ballot's who-has-voted list and its votes table, by the count of seats. */
const SEATS = [
  { voted: 'gap-2 py-4', count: 'text-3xl', item: 'gap-3 text-2xl', mark: 24, list: 'gap-1.5', host: 'text-lg', table: 'py-3 text-xl', rule: 'text-sm', cell: 'py-0.5', creature: 24 },
  { voted: 'gap-2 py-3', count: 'text-3xl', item: 'gap-3 text-xl', mark: 20, list: 'gap-1', host: 'text-base', table: 'py-2 text-lg', rule: 'text-sm', cell: 'py-0.5', creature: 20 },
  { voted: 'gap-1 py-2', count: 'text-2xl', item: 'gap-2 text-base', mark: 16, list: 'gap-0.5', host: 'text-sm', table: 'py-2 text-base', rule: 'text-xs', cell: 'py-0', creature: 18 },
] as const;

/** Each candidate standing for an office, with a Governor candidate's promise. */
function Candidates({ game, politics, candidates, promises, size, testid }: { game: MuleView; politics: PoliticsView; candidates: string[]; promises: PoliticsView['promises']; size: 'big' | 'list'; testid?: string }) {
  const z = fieldOf(size, candidates.length);
  return candidates.map((id, i) => {
    const p = game.players.find((q) => q.id === id);
    const promise = promiseWords(promises[id], politics.tax.percent);
    return (
      <span
        key={id}
        className={cx('flex items-center', z.row, size === 'big' && 'animate-[show-badge-in_0.4s_ease-out_both]')}
        style={size === 'big' ? { animationDelay: `${0.4 + 0.3 * i}s` } : undefined}
        data-testid={testid && `${testid}-${id}`}
      >
        {p && <Creature species={p.species} color={colorOf(game, id)} size={z.creature} />}
        <span className={cx('whitespace-nowrap font-display font-semibold', z.name)}>{p?.name}</span>
        {promise && <span className={cx('text-ink-2', z.promise)}>{promise}</span>}
      </span>
    );
  });
}

function TvAnnounce({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const politics = game.politics!;
  const left = waitedFor(table, game);
  const host = hostLine(table, game, left.map((s) => s.id));
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-announce">
      <TvHeader game={game} title="Election day" />
      <div className="flex items-center gap-6 animate-[show-card-in_0.6s_ease-out_both]">
        <h2 className="font-display text-6xl font-semibold" data-testid="tv-day-title">
          {officeNames().join(' and ')}
        </h2>
        <span className="text-2xl text-ink-2">
          months {game.month} to {termEnd(politics.next, game.maxMonths)}
        </span>
        <span className="ml-auto">
          <Steps at={1} tv />
        </span>
      </div>
      <div className={cx('grid gap-6', POLITICS.offices.length > 1 ? 'grid-cols-2' : 'grid-cols-[1fr_440px]')}>
        {POLITICS.offices.map((o) => (
          <section key={o} className={cx('flex flex-col justify-center rounded-sheet border border-holo-line bg-panel px-8', fieldOf('big', politics.candidates[o]?.length ?? 0).section)} data-testid={`tv-field-${o}`}>
            <span className="flex items-baseline gap-3">
              <span className="font-display text-3xl font-semibold">{OFFICE_NAME[o]}</span>
              <span className="text-xl text-ink-2">{JOB[o]}</span>
            </span>
            {/* Until the ballot opens the candidacy is Politics'. */}
            {(politics.candidates[o] ?? []).length === 0 ? (
              <span className="text-3xl text-ink-3">nobody yet</span>
            ) : (
              <Candidates game={game} politics={politics} candidates={politics.candidates[o]!} promises={o === 'governor' ? politics.promises : {}} size="big" testid={`tv-field-${o}`} />
            )}
          </section>
        ))}
        <OfficesCard tv />
      </div>
      <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft px-6 py-3 shadow-glow" data-testid="tv-vote-on-phone">
        <span className="flex items-baseline gap-4">
          <span className="whitespace-nowrap font-display text-4xl font-semibold text-holo">Vote on your phone</span>
          <span className="text-2xl text-ink-2">in secret. First tap Ready to vote: the ballot opens once everyone is ready.</span>
        </span>
        {left.length > 0 && (
          <span className="flex items-center gap-4 text-2xl">
            <WaitingFor seats={left} me={null} tv lead="Still waiting for" />
            {host && <span className="text-ink-2">· {host}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function TvBallot({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const politics = game.politics!;
  const election = politics.election!;
  const connected = connectedIn(table.seats);
  const left = waitedFor(table, game).map((s) => s.id);
  const host = hostLine(table, game, left);
  const { plotsPerVote, repHigh, taxPerVote, taxCap } = POLITICS.weight;
  const cols = [
    { key: 'base', head: 'Everyone', rule: '1 each' },
    { key: 'land', head: 'Land', rule: `+1 per ${plotsPerVote} plots` },
    { key: 'reputation', head: 'Good name', rule: `+1 at ${repHigh}+` },
    { key: 'taxes', head: 'Tax paid', rule: `+1 per ${taxPerVote} cr, up to ${taxCap}` },
    { key: 'baron', head: 'Land Baron', rule: '+1' },
  ] as const;
  const name = namer(game);
  const z = SEATS[fill(game.players.length)];
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-ballot">
      <TvHeader game={game} title="Election day · vote" />
      <div className="flex items-center gap-6">
        <span className="font-display text-4xl font-semibold text-holo">Vote on your phone</span>
        <span className="text-2xl text-ink-2">Nobody sees for whom.</span>
        <span className="ml-auto">
          <Steps at={2} tv />
        </span>
      </div>
      <div className={cx('grid min-h-0 flex-1 gap-6', POLITICS.offices.length > 1 ? 'grid-cols-[1fr_1fr_420px]' : 'grid-cols-[1fr_440px]')}>
        {POLITICS.offices.map((o) => (
          <section key={o} className={cx('flex flex-col rounded-sheet border border-holo-line bg-panel px-6', fieldOf('list', election.candidates[o]?.length ?? 0).section)} data-testid={`tv-ballot-${o}`}>
            <span className="flex items-baseline gap-3">
              <span className="font-display text-3xl font-semibold">{OFFICE_NAME[o]}</span>
              <span className="text-xl text-ink-2">{JOB[o]}</span>
            </span>
            <Candidates game={game} politics={politics} candidates={election.candidates[o] ?? []} promises={o === 'governor' ? election.promises : {}} size="list" />
          </section>
        ))}
        <section className={cx('flex flex-col rounded-sheet border-2 border-holo bg-holo-soft px-6', z.voted)} data-testid="tv-voted">
          <span className={cx('font-display font-semibold', z.count)} data-testid="tv-voted-count">
            Voted {election.done.length} of {game.players.length}
          </span>
          <ul className={cx('flex flex-col', z.list)}>
            {game.players.map((p) => {
              const voted = election.done.includes(p.id);
              const away = !connected(p.id);
              return (
                <li key={p.id} className={cx('flex items-center', z.item, voted ? 'text-ink-2' : 'font-semibold')}>
                  <PlayerMark slot={toSlot(p.slot)} size={z.mark} glow={!voted} />
                  <span className="flex-1 whitespace-nowrap">{p.name}</span>
                  <span className={cx('font-mono text-lg', voted ? 'text-ok' : away ? 'text-warn' : 'text-holo')}>{voted ? 'VOTED ✓' : away ? 'AWAY' : 'VOTING'}</span>
                </li>
              );
            })}
          </ul>
          {host && (
            <span className={cx('text-ink-2', z.host)}>
              Still waiting for {listNames(left, null, name)} · {host}
            </span>
          )}
        </section>
      </div>
      <section className={cx('rounded-panel border border-holo-line bg-panel px-6', z.table)} data-testid="tv-weights">
        <table className="w-full text-left">
          <thead>
            <tr className="text-ink-2">
              <th className="pb-1 font-normal">Votes this month</th>
              {cols.map((c) => (
                <th key={c.key} className="pb-1 text-right font-normal">
                  <span className="block font-semibold text-ink">{c.head}</span>
                  <span className={cx('block', z.rule)}>{c.rule}</span>
                </th>
              ))}
              <th className="pb-1 text-right font-semibold text-ink">Votes</th>
            </tr>
          </thead>
          <tbody>
            {politics.weights.map((w) => {
              const p = game.players.find((q) => q.id === w.id);
              return (
                <tr key={w.id} className="border-t border-holo-faint" data-testid={`tv-weight-${w.id}`}>
                  <td className={z.cell}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold">
                      {p && <Creature species={p.species} color={colorOf(game, w.id)} size={z.creature} />}
                      {p?.name}
                    </span>
                  </td>
                  {cols.map((c, i) => {
                    const v = w.parts[c.key];
                    return (
                      <td key={c.key} data-num className="text-right font-mono">
                        {i === 0 ? v : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '·'}
                      </td>
                    );
                  })}
                  <td data-num className="text-right font-mono font-bold">
                    {w.votes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** The ceremony on the big screen, its centrepiece. */
function TvReveal({ game }: { game: MuleView }) {
  const show = showOf(game);
  return (
    <div className="relative flex h-[720px] w-[1280px] flex-col gap-4 overflow-hidden bg-table px-10 py-7 text-ink" data-phase="planning" data-testid="tv-reveal">
      <TvHeader game={game} title="Election day · the result" />
      {show && <Ceremony game={game} show={show} size="tv" me={null} />}
      <div className="flex items-center justify-between">
        {show && <Progress game={game} show={show} size="tv" />}
        <Steps at={3} tv />
      </div>
    </div>
  );
}

