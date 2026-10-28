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

/** Each candidate standing for an office, with a Governor candidate's promise. */
function Candidates({ game, politics, candidates, promises, size, testid }: { game: MuleView; politics: PoliticsView; candidates: string[]; promises: PoliticsView['promises']; size: 'big' | 'list'; testid?: string }) {
  return candidates.map((id, i) => {
    const p = game.players.find((q) => q.id === id);
    const promise = promiseWords(promises[id], politics.tax.percent);
    return (
      <span
        key={id}
        className={cx('flex items-center', size === 'big' ? 'gap-5 animate-[show-badge-in_0.4s_ease-out_both]' : 'gap-3')}
        style={size === 'big' ? { animationDelay: `${0.4 + 0.3 * i}s` } : undefined}
        data-testid={testid && `${testid}-${id}`}
      >
        {p && <Creature species={p.species} color={colorOf(game, id)} size={size === 'big' ? 80 : 48} />}
        <span className={cx('font-display font-semibold', size === 'big' ? 'text-5xl' : 'text-3xl')}>{p?.name}</span>
        {promise && <span className={cx('text-ink-2', size === 'big' ? 'text-3xl' : 'text-2xl')}>{promise}</span>}
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
          <section key={o} className="flex flex-col justify-center gap-5 rounded-sheet border border-holo-line bg-panel px-8 py-6" data-testid={`tv-field-${o}`}>
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
          <span className="font-display text-4xl font-semibold text-holo">Vote on your phone</span>
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
          <section key={o} className="flex flex-col gap-3 rounded-sheet border border-holo-line bg-panel px-6 py-4" data-testid={`tv-ballot-${o}`}>
            <span className="flex items-baseline gap-3">
              <span className="font-display text-3xl font-semibold">{OFFICE_NAME[o]}</span>
              <span className="text-xl text-ink-2">{JOB[o]}</span>
            </span>
            <Candidates game={game} politics={politics} candidates={election.candidates[o] ?? []} promises={o === 'governor' ? election.promises : {}} size="list" />
          </section>
        ))}
        <section className="flex flex-col gap-2 rounded-sheet border-2 border-holo bg-holo-soft px-6 py-4" data-testid="tv-voted">
          <span className="font-display text-3xl font-semibold" data-testid="tv-voted-count">
            Voted {election.done.length} of {game.players.length}
          </span>
          <ul className="flex flex-col gap-1.5">
            {game.players.map((p) => {
              const voted = election.done.includes(p.id);
              const away = !connected(p.id);
              return (
                <li key={p.id} className={cx('flex items-center gap-3 text-2xl', voted ? 'text-ink-2' : 'font-semibold')}>
                  <PlayerMark slot={toSlot(p.slot)} size={24} glow={!voted} />
                  <span className="flex-1">{p.name}</span>
                  <span className={cx('font-mono text-lg', voted ? 'text-ok' : away ? 'text-warn' : 'text-holo')}>{voted ? 'VOTED ✓' : away ? 'AWAY' : 'VOTING'}</span>
                </li>
              );
            })}
          </ul>
          {host && (
            <span className="text-lg text-ink-2">
              Still waiting for {listNames(left, null, name)} · {host}
            </span>
          )}
        </section>
      </div>
      <section className="rounded-panel border border-holo-line bg-panel px-6 py-3" data-testid="tv-weights">
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
            {politics.weights.map((w) => {
              const p = game.players.find((q) => q.id === w.id);
              return (
                <tr key={w.id} className="border-t border-holo-faint" data-testid={`tv-weight-${w.id}`}>
                  <td className="py-0.5">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      {p && <Creature species={p.species} color={colorOf(game, w.id)} size={24} />}
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

