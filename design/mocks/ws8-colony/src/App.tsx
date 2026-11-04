import { useEffect, useState, type ReactNode } from 'react';
import { EMPTY, FINAL, FINAL_FAILED, FINAL_UNREST, MIDGAME, TROUBLE } from './colony';
import { PhoneColonyDesk, PhoneGameOver, TvGameOverA, TvGameOverB, TvMonthEnd, TvPlanning } from './screens';

/** Every screen and state, by hash: #/tv-gameover-a and so on. */
const SCREENS: { id: string; group: string; title: string; note: string; render: () => ReactNode }[] = [
  { id: 'tv-gameover-a', group: 'Game over · the TV (pick one)', title: 'A · The colony’s line', note: 'Today’s game over kept whole; the bottom band becomes the colony’s score beside who gave most.', render: () => <TvGameOverA colony={FINAL} /> },
  { id: 'tv-gameover-b', group: 'Game over · the TV (pick one)', title: 'B · Two scoreboards', note: 'The colony gets half the screen as a second winner, with its skyline; the players’ table moves to the winner card.', render: () => <TvGameOverB colony={FINAL} /> },
  { id: 'tv-gameover-a-unrest', group: 'Game over · the TV (pick one)', title: 'A · a colony in Unrest', note: 'The same screen when the colony was run badly: × 0.82, a damaged hospital.', render: () => <TvGameOverA colony={FINAL_UNREST} /> },
  { id: 'tv-gameover-b-unrest', group: 'Game over · the TV (pick one)', title: 'B · a colony in Unrest', note: 'Damaged objects stay on the skyline, dark, at “counts 0”.', render: () => <TvGameOverB colony={FINAL_UNREST} /> },
  { id: 'phone-gameover', group: 'Game over · the phone', title: 'Your phone at game over', note: 'Your place and Worth as today; the colony card shows its score and your plaques.', render: () => <PhoneGameOver colony={FINAL} /> },
  { id: 'phone-gameover-small', group: 'Game over · the phone', title: 'The same on a small phone (667 × 375)', note: 'The smallest phone the shell supports.', render: () => <PhoneGameOver colony={FINAL} small /> },
  { id: 'phone-gameover-failed', group: 'Game over · the phone', title: 'Your phone when the colony failed', note: 'The air ended in Collapse: the card turns alert with the verdict’s title and rule (WS6), as PhoneVerdict does today.', render: () => <PhoneGameOver colony={FINAL_FAILED} /> },
  { id: 'phone-gameover-failed-small', group: 'Game over · the phone', title: 'Failed, on a small phone', note: 'The longest card at the smallest size.', render: () => <PhoneGameOver colony={FINAL_FAILED} small /> },
  { id: 'tv-planning', group: 'During the game · the TV', title: 'The four gauges in the header', note: 'Wealth, Environment, Prestige and Happiness take the air gauge’s place, all game.', render: () => <TvPlanning colony={MIDGAME} /> },
  { id: 'tv-monthend', group: 'During the game · the TV', title: 'Month end: the build site', note: 'Today’s colony report beside the projects: collecting, building, standing.', render: () => <TvMonthEnd colony={MIDGAME} /> },
  { id: 'tv-monthend-trouble', group: 'During the game · the TV', title: 'Month end: closed and damaged', note: 'The fund ran dry (park closed), a riot hit the hospital: both count 0 until fixed.', render: () => <TvMonthEnd colony={TROUBLE} /> },
  { id: 'tv-monthend-empty', group: 'During the game · the TV', title: 'Month end: nothing built yet', note: 'Before the Governor commissions anything.', render: () => <TvMonthEnd colony={EMPTY} /> },
  { id: 'phone-desk', group: 'During the game · the phone', title: 'Colony desk', note: 'The gauges and the build site in the planning hub; Donate opens WS7’s desk.', render: () => <PhoneColonyDesk colony={MIDGAME} governor={false} /> },
  { id: 'phone-desk-governor', group: 'During the game · the phone', title: 'Colony desk, as the Governor', note: 'The same, plus Commission (WS7’s C35 desk).', render: () => <PhoneColonyDesk colony={MIDGAME} governor /> },
  { id: 'phone-desk-trouble', group: 'During the game · the phone', title: 'Colony desk in trouble', note: 'Closed and damaged, Unhappy.', render: () => <PhoneColonyDesk colony={TROUBLE} governor={false} /> },
];

const DECISIONS = [
  'The colony is scored like a player: one big number, and the sum that made it written out (wealth + environment + prestige, × the happiness factor), so the table can argue about it.',
  'The four gauges replace the TV header’s air gauge all game. Environment is the air everyone already knows, with its bands; Happiness shows its number and its band together (WS7).',
  'The build site is one list, newest first, each project at its stage: Collecting (credits and goods in), Building (months as pips), Standing (its perk), Closed or Damaged (red, “counts 0”, what fixes it).',
  'The winner’s words change in every game: “The game goes to” and “You win the game!”, since the colony now has its own score (WS6 OK). Without politics the TV keeps today’s tall winner card and the phone keeps its air verdict.',
  'Plaques are shown beside a player’s standing, not added to their Worth (WS7’s lean for RULE-25): who gave most is its own small table.',
  'Without politics nothing changes: no gauges, no build site, today’s game over (HC-22).',
  'Every number is a fixture: the objects are WS1’s placeholders, the score’s terms wait for RULE-25 (WS3, C31).',
];

function useHash() {
  const [hash, setHash] = useState(() => location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => setHash(location.hash.replace(/^#\/?/, ''));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const screen = SCREENS.find((s) => s.id === hash);
  if (screen) {
    return (
      <div className="flex min-h-full flex-col items-start gap-3 bg-void p-6 text-ink">
        <a href="#/" className="text-sm text-holo underline" data-testid="back">
          ← All colony screens
        </a>
        <div className="flex flex-col">
          <span className="label-caps">{screen.group}</span>
          <h1 className="font-display text-2xl font-semibold">{screen.title}</h1>
          <p className="max-w-3xl text-sm text-ink-2">{screen.note}</p>
        </div>
        {screen.render()}
      </div>
    );
  }
  const groups = [...new Set(SCREENS.map((s) => s.group))];
  return (
    <div className="flex min-h-full flex-col gap-6 bg-void p-8 text-ink" data-testid="index">
      <header className="flex flex-col gap-1">
        <span className="label-caps">G-5 · C34 · WS8 mocks</span>
        <h1 className="font-display text-4xl font-semibold">The colony at the table</h1>
        <p className="max-w-3xl text-base text-ink-2">
          What everyone sees of the colony: its four gauges all game, the projects it builds, and at game over the colony’s own score beside each player’s standing.
        </p>
      </header>
      <section className="flex max-w-4xl flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" data-testid="decisions">
        <h2 className="label-caps">Design decisions</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {DECISIONS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" data-testid="variants">
        <h2 className="label-caps">The open choice: game over on the TV, A or B</h2>
        <div className="flex flex-wrap gap-6">
          {(['tv-gameover-a', 'tv-gameover-b'] as const).map((id) => {
            const s = SCREENS.find((x) => x.id === id)!;
            return (
              <a key={id} href={`#/${id}`} className="flex flex-col gap-2" data-testid={`variant-${id}`}>
                <span className="font-display text-xl font-semibold text-holo underline">{s.title}</span>
                <div className="h-[360px] w-[640px] overflow-hidden rounded-panel border border-holo-line">
                  <div className="origin-top-left scale-50">{s.render()}</div>
                </div>
              </a>
            );
          })}
        </div>
      </section>
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="label-caps">{g}</h2>
          <ul className="flex flex-col gap-1">
            {SCREENS.filter((s) => s.group === g).map((s) => (
              <li key={s.id}>
                <a href={`#/${s.id}`} className="font-semibold text-holo underline" data-testid={`link-${s.id}`}>
                  {s.title}
                </a>
                <span className="text-sm text-ink-2"> · {s.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
