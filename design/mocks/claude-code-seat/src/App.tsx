import { useState } from 'react';
import { JOIN_CODE, SETUP_DECISION, type LobbyLink, type PlayLink } from './fixture';
import { Page, PhoneFrame, States, TvFrame, useCountdown, useHash, type Choice } from './harness';
import { MoveDialog, type ClaudeCode, type MoveTo } from './screens/MoveDialog';
import { CLAUDE_SIDE_PICK_SECONDS, PhonePlanning, TvPlanning, type Person, type Stage, type Table } from './screens/Planning';
import { PhoneLobby, type JunoState, type Variant, type Viewer } from './screens/PhoneLobby';
import { SetupPage } from './screens/SetupPage';
import { TvLobby } from './screens/TvLobby';

const DECISIONS = [
  'A computer seat is played Built-in (the game) or by Claude Code (a session someone runs). The host picks, by tapping the seat in the lobby.',
  'A Claude Code seat has its own join code (MULE-XXXX-XXXX-XXXX) for the whole game. Only the host’s phone shows it, with Copy, the one setup line with its own Copy, and a link to the setup page.',
  'Its chip says where it stands: WAITING FOR CLAUDE, then CLAUDE · CONNECTED. Other phones and the TV see the seat and its chip, never the code.',
  'The host can switch the seat back to Built-in; its code stops working.',
  'In play the TV ready list and the phone’s ready bar say CLAUDE · THINKING, CLAUDE · READY or CLAUDE · OFFLINE, on the seat’s own row (never folded in with the AIs); offline plays its built-in plan, unlike an AWAY phone.',
  'HC-3: a Claude Code seat never holds the table. THINKING is a label only and the seat counts as ready, except at the first good’s side pick: there it is waited for, CLAUDE · THINKING · 0:32, at most 45 s, then plays its built-in plan.',
  'The host can start while a seat is WAITING FOR CLAUDE: the seat says it plays its built-in plan until Claude joins.',
  'At the side pick, the host’s Move on for… covers a thinking Claude seat too; it then plays its built-in plan.',
  'Mid-game, Move my seat gains a second choice: Hand my seat to Claude Code. Its code works 10 minutes (counting down); the phone is let go once Claude joins.',
  SETUP_DECISION,
  'Open: two variants of the host’s lobby row. A opens the seat in place in the rail; B keeps the row one line, with a Code button that opens a sheet.',
];

const SCREENS = [
  { id: 'lobby-a', title: 'Phone lobby, variant A: the seat opens in place' },
  { id: 'lobby-b', title: 'Phone lobby, variant B: compact row, Code opens a sheet' },
  { id: 'tv-lobby', title: 'TV lobby' },
  { id: 'tv-ready', title: 'TV: planning ready list' },
  { id: 'phone-ready', title: 'Phone: planning ready bar' },
  { id: 'move', title: 'Phone: Move my seat (mid-game)' },
  { id: 'setup', title: 'Setup page (/claude-code)' },
];

const VIEWERS: Choice<Viewer>[] = [
  { id: 'host', title: 'Host (Lena)' },
  { id: 'guest', title: 'Another phone (Kai)' },
];
const JUNO: Choice<JunoState>[] = [
  { id: 'builtin', title: 'Built-in' },
  { id: 'waiting', title: 'Claude Code · waiting' },
  { id: 'connected', title: 'Claude Code · connected' },
];
const LOBBY_LINK: Choice<LobbyLink>[] = [
  { id: 'waiting', title: 'Waiting for Claude' },
  { id: 'connected', title: 'Claude connected' },
];
const PLAY_LINK: Choice<PlayLink>[] = [
  { id: 'thinking', title: 'Thinking' },
  { id: 'ready', title: 'Ready' },
  { id: 'offline', title: 'Offline' },
];
type StageChoice = Stage | 'sidepick-late';
const STAGE: Choice<StageChoice>[] = [
  { id: 'planning', title: 'Planning' },
  { id: 'sidepick', title: 'Side pick, first good' },
  { id: 'sidepick-late', title: 'Side pick, Claude’s 45 s running out' },
];

/** The stage and Claude's side-pick clock: 45 s, or the last 3 to watch it run out. */
function useStage(choice: StageChoice): Pick<Table, 'stage' | 'left'> {
  const left = useCountdown(choice === 'sidepick' ? CLAUDE_SIDE_PICK_SECONDS : choice === 'sidepick-late' ? 3 : 0);
  return { stage: choice === 'planning' ? 'planning' : 'sidepick', left };
}

const KAI: Choice<Person>[] = [
  { id: 'planning', title: 'Planning' },
  { id: 'ready', title: 'Ready' },
  { id: 'away', title: 'Away' },
];
const ME_STATES: Choice<Table['me']>[] = [
  { id: 'planning', title: 'Planning' },
  { id: 'ready', title: 'Ready' },
];
const MOVE_TO: Choice<MoveTo>[] = [
  { id: 'phone', title: 'To another phone' },
  { id: 'claude', title: 'To Claude Code' },
];
const CODE: Choice<ClaudeCode>[] = [
  { id: 'fresh', title: '10:00 left' },
  { id: 'last', title: 'Last seconds' },
  { id: 'expired', title: 'Expired' },
  { id: 'joined', title: 'Claude joined' },
];
const SETUP: Choice<'plain' | 'code'>[] = [
  { id: 'plain', title: 'Opened directly' },
  { id: 'code', title: 'Opened from a seat (code filled in)' },
];
const SHEET: Choice<'closed' | 'open'>[] = [
  { id: 'closed', title: 'Closed' },
  { id: 'open', title: 'Open' },
];

function Index() {
  const [a, setA] = useState<JunoState>('waiting');
  const [b, setB] = useState<JunoState>('waiting');
  return (
    <Page title="Claude Code plays a computer seat" lead="WS2 mock, 6 Nov. Every screen has a state switcher above it; a plain click uses the prototype.">
      <section className="flex flex-col gap-2" data-testid="decisions">
        <h2 className="label-caps">Design decisions</h2>
        <ul className="flex max-w-4xl list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
          {DECISIONS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" data-testid="screens">
        <h2 className="label-caps">Screens</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {SCREENS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-holo underline" data-testid={`link-${s.id}`}>
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" data-testid="variants">
        <h2 className="label-caps">The open question: the host’s lobby, side by side (host view, Claude waiting)</h2>
        <div className="flex flex-wrap gap-6">
          <figure className="flex flex-col gap-1">
            <figcaption className="text-sm">
              <a href="#lobby-a" className="text-holo underline" data-testid="variant-a-link">
                A · opens in place
              </a>
            </figcaption>
            <PhoneFrame scale={0.6} testid="variant-a">
              <PhoneLobby variant="A" viewer="host" juno={a} onJuno={setA} />
            </PhoneFrame>
          </figure>
          <figure className="flex flex-col gap-1">
            <figcaption className="text-sm">
              <a href="#lobby-b" className="text-holo underline" data-testid="variant-b-link">
                B · compact row and a sheet
              </a>
            </figcaption>
            <PhoneFrame scale={0.6} testid="variant-b">
              <PhoneLobby variant="B" viewer="host" juno={b} onJuno={setB} sheetOpen />
            </PhoneFrame>
          </figure>
        </div>
      </section>
    </Page>
  );
}

function LobbyPage({ variant }: { variant: Variant }) {
  const [viewer, setViewer] = useState<Viewer>('host');
  const [juno, setJuno] = useState<JunoState>('waiting');
  const [sheet, setSheet] = useState<'closed' | 'open'>(variant === 'B' ? 'open' : 'closed');
  const title = variant === 'A' ? 'Phone lobby, variant A: the seat opens in place' : 'Phone lobby, variant B: compact row, Code opens a sheet';
  return (
    <Page title={title} lead="Juno is the Claude Code seat; Brix is a Built-in one the host can switch too. Kai’s phone sees chips only.">
      <States label="Viewer" choices={VIEWERS} value={viewer} onChange={setViewer} testid="viewer" />
      <States label="Juno" choices={JUNO} value={juno} onChange={setJuno} testid="juno" />
      {variant === 'B' && <States label="Sheet" choices={SHEET} value={sheet} onChange={setSheet} testid="sheet" />}
      <PhoneFrame>
        <PhoneLobby key={`${viewer}-${sheet}`} variant={variant} viewer={viewer} juno={juno} onJuno={setJuno} sheetOpen={sheet === 'open'} />
      </PhoneFrame>
    </Page>
  );
}

function TvLobbyPage() {
  const [juno, setJuno] = useState<LobbyLink>('waiting');
  return (
    <Page title="TV lobby" lead="The Claude Code seat says so and wears its chip. The TV never shows a seat’s code.">
      <States label="Juno" choices={LOBBY_LINK} value={juno} onChange={setJuno} testid="juno" />
      <TvFrame>
        <TvLobby juno={juno} />
      </TvFrame>
    </Page>
  );
}

function TvReadyPage() {
  const [juno, setJuno] = useState<PlayLink>('thinking');
  const [kai, setKai] = useState<Person>('planning');
  const [stage, setStage] = useState<StageChoice>('planning');
  const s = useStage(stage);
  return (
    <Page title="TV: planning ready list" lead="Lena is ready, Brix is Built-in. Juno has its own row, never folded in with the AIs. Thinking counts as ready, except at the first good’s side pick (45 s at most).">
      <States label="Stage" choices={STAGE} value={stage} onChange={setStage} testid="stage" />
      <States label="Juno" choices={PLAY_LINK} value={juno} onChange={setJuno} testid="juno" />
      <States label="Kai" choices={KAI} value={kai} onChange={setKai} testid="kai" />
      <TvFrame>
        <TvPlanning t={{ juno, kai, me: 'ready', ...s }} />
      </TvFrame>
    </Page>
  );
}

function PhoneReadyPage() {
  const [juno, setJuno] = useState<PlayLink>('thinking');
  const [kai, setKai] = useState<Person>('ready');
  const [me, setMe] = useState<Table['me']>('planning');
  const [stage, setStage] = useState<StageChoice>('planning');
  const s = useStage(stage);
  return (
    <Page title="Phone: planning ready bar" lead="Lena’s phone, the host’s. Juno has its own line; only at the first good’s side pick is a thinking Claude in the waiting line, with its 45 s.">
      <States label="Stage" choices={STAGE} value={stage} onChange={setStage} testid="stage" />
      <States label="Juno" choices={PLAY_LINK} value={juno} onChange={setJuno} testid="juno" />
      <States label="Kai" choices={KAI} value={kai} onChange={setKai} testid="kai" />
      <States label="Lena (you)" choices={ME_STATES} value={me} onChange={setMe} testid="me" />
      <PhoneFrame>
        <PhonePlanning t={{ juno, kai, me, ...s }} onReady={() => setMe('ready')} />
      </PhoneFrame>
    </Page>
  );
}

function MovePage() {
  const [to, setTo] = useState<MoveTo>('claude');
  const [code, setCode] = useState<ClaudeCode>('fresh');
  const [open, setOpen] = useState(true);
  const [renews, setRenews] = useState(0);
  const renew = () => {
    setCode('fresh');
    setRenews((n) => n + 1);
  };
  return (
    <Page title="Phone: Move my seat (mid-game)" lead="Opened from the phone button in the rail’s header. Done closes it; the button opens it again.">
      <States label="Move to" choices={MOVE_TO} value={to} onChange={setTo} testid="move-to" />
      <States label="Claude code" choices={CODE} value={code} onChange={(c) => (setCode(c), setOpen(true))} testid="code" />
      <PhoneFrame>
        <div className="relative h-full">
          <PhonePlanning t={{ juno: 'ready', kai: 'planning', me: 'planning', stage: 'planning', left: 0 }} onReady={() => {}} onMove={() => setOpen(true)} />
          {open && <MoveDialog key={`${code}-${renews}`} to={to} onTo={setTo} code={code} onRenew={renew} onClose={() => setOpen(false)} />}
        </div>
      </PhoneFrame>
    </Page>
  );
}

function SetupRoute() {
  const [from, setFrom] = useState<'plain' | 'code'>('code');
  return (
    <Page title="Setup page (/claude-code)" lead="A plain web page, read on the computer that runs Claude Code.">
      <States label="Opened" choices={SETUP} value={from} onChange={setFrom} testid="opened" />
      <div className="max-w-full overflow-hidden rounded-panel border border-holo-line" data-testid="browser-frame">
        <SetupPage code={from === 'code' ? JOIN_CODE : null} />
      </div>
    </Page>
  );
}

export default function App() {
  const hash = useHash();
  switch (hash) {
    case 'lobby-a':
      return <LobbyPage key="A" variant="A" />;
    case 'lobby-b':
      return <LobbyPage key="B" variant="B" />;
    case 'tv-lobby':
      return <TvLobbyPage />;
    case 'tv-ready':
      return <TvReadyPage />;
    case 'phone-ready':
      return <PhoneReadyPage />;
    case 'move':
      return <MovePage />;
    case 'setup':
      return <SetupRoute />;
    default:
      return <Index />;
  }
}
