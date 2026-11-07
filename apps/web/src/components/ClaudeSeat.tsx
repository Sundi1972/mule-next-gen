import type { TableView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import { useEffect, useState } from 'react';
import { secondsUntil } from '../game/derive';
import { useServerNow } from '../net/react';

type Seat = TableView<unknown>['seats'][number];

/**
 * What Copy invite puts on the clipboard (spec §3): one message the host sends to whoever's Claude should play.
 * DESIGN-GAP: the hand-over's invite (PR-2a) comes from the server's `handoverCode`; this one is the lobby's.
 */
export const inviteText = (code: string) =>
  `Play MULE seat ${code}. Keep calling wait_for_my_turn with the code and answer every decision with submit_plan until the game is over. Don't stop to ask me.`;

/*
 * DS-GAP: @mule/ui has no chip. These are the lobby's chips (AI, HOST, PHONE, AWAY) and a Claude seat's, from the
 * same tokens. One chip component in packages/ui would hold both.
 */
export const CHIP_CLASS = {
  AI: 'bg-holo-soft text-holo',
  HOST: 'bg-warn/15 text-warn',
  PHONE: 'bg-ok/10 text-ok',
  AWAY: 'bg-warn/15 text-warn',
  'WAITING FOR CLAUDE': 'bg-warn/15 text-warn',
  'CLAUDE · CONNECTED': 'bg-ok/10 text-ok',
  'CLAUDE · THINKING': 'bg-holo-soft text-holo',
  'CLAUDE · READY': 'bg-holo-faint text-ink-3',
  'CLAUDE · OFFLINE': 'bg-warn/15 text-warn',
} as const;

export type ChipWord = keyof typeof CHIP_CLASS;

export type ClaudeStatus = NonNullable<Seat['claude']>;

/** A Claude seat's chip for each status the room reports (C6). */
export const STATUS_CHIP: Record<ClaudeStatus, ChipWord> = {
  waiting: 'WAITING FOR CLAUDE',
  connected: 'CLAUDE · CONNECTED',
  thinking: 'CLAUDE · THINKING',
  ready: 'CLAUDE · READY',
  offline: 'CLAUDE · OFFLINE',
};

/** A Claude seat's chip: waiting for its chat until the chat calls in with the code. */
export const claudeChip = (seat: Pick<Seat, 'claude'>): ChipWord => STATUS_CHIP[seat.claude ?? 'waiting'];

export const isClaude = (seat: Seat) => seat.kind === 'claude';

/** Seconds as the side pick's countdown shows them: 0:32. */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** `suffix` follows the word, such as the side pick's countdown (CLAUDE · THINKING · 0:32). */
export function Chip({ word, suffix, className, testid }: { word: ChipWord; suffix?: string | undefined; className?: string | undefined; testid?: string }) {
  return (
    <span className={cx('shrink-0 whitespace-nowrap rounded-chip px-1.5 font-mono text-[10px] font-bold', CHIP_CLASS[word], word === 'CLAUDE · THINKING' && 'animate-pulse', className)} data-testid={testid}>
      {word}
      {suffix && ` · ${suffix}`}
    </span>
  );
}

/** The seconds left on a Claude seat's side-pick wait, by the server's clock, as 0:32 (RULE-6). */
function useWaitLeft(until: number): string {
  const now = useServerNow(250);
  return clock(Math.ceil(secondsUntil(until, now) ?? 0));
}

/** A Claude seat the side pick waits for, as a chip: CLAUDE · THINKING · 0:32. */
export function ClaudeCountdown({ until, className, testid }: { until: number; className?: string | undefined; testid?: string }) {
  return <Chip word="CLAUDE · THINKING" suffix={useWaitLeft(until)} className={className} testid={testid} />;
}

/** The same, as a list row's state word. */
export function ClaudeCountdownWord({ until, className }: { until: number; className?: string }) {
  return <span className={cx('animate-pulse', className)}>{`CLAUDE · THINKING · ${useWaitLeft(until)}`}</span>;
}

function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
  };
  return [copied, copy];
}

/**
 * A line to copy: its label, the text in mono, and Copy (Copied for a moment after).
 * DS-GAP: no copyable-field component in @mule/ui; the join card's code and the Button stand in.
 */
function CopyLine({ label, text, testid }: { label: string; text: string; testid: string }) {
  const [copied, copy] = useCopied();
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <span className="label-caps text-[10px]!">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 whitespace-nowrap rounded-control border border-holo-line bg-void/40 px-2 py-1.5 font-mono text-sm font-bold tracking-[0.04em] text-holo" data-testid={`${testid}-text`}>
          {text}
        </code>
        <Button size="md" variant="outline" className="shrink-0" onClick={() => copy(text)} aria-label={`Copy ${label.toLowerCase()}`} data-testid={`${testid}-copy`}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

/** Copy invite (spec C11): the invite as it will be sent, and one button that copies all of it. */
function CopyInvite({ code, testid }: { code: string; testid: string }) {
  const [copied, copy] = useCopied();
  const invite = inviteText(code);
  return (
    // Beside the text, as Copy sits beside the code: a row of its own would push the sheet past a 390 px phone.
    <div className="flex flex-wrap items-center gap-2" data-testid={testid}>
      <p className="min-w-[14rem] flex-1 rounded-control border border-holo-line bg-void/40 px-2 py-1.5 text-[11px] leading-snug text-ink-2" data-testid={`${testid}-text`}>
        {invite}
      </p>
      <Button size="md" className="shrink-0" onClick={() => copy(invite)} data-testid={`${testid}-copy`}>
        {copied ? 'Invite copied' : 'Copy invite'}
      </Button>
    </div>
  );
}

/**
 * What the host hands on for a Claude seat: its seat code and the invite that carries it. The mock's "How to connect
 * Claude →" joins them with the setup page it opens (PR-3b): until that page exists the link would lead nowhere.
 */
export function ClaudeSetup({ code, testid }: { code: string; testid: string }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      <CopyLine label="Seat code" text={code} testid={`${testid}-code`} />
      <CopyInvite code={code} testid={`${testid}-invite`} />
    </div>
  );
}

/**
 * Built-in or Claude, for a computer seat. The pressed look is the lobby's species picker's.
 * DS-GAP: no segmented choice in @mule/ui.
 */
export function KindChoice({ onChange, testid }: { onChange: (k: 'builtin' | 'claude') => void; testid: string }) {
  const options = [
    { id: 'builtin', title: 'Built-in', detail: 'The game plays it' },
    { id: 'claude', title: 'Claude', detail: 'A Claude chat plays it' },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Who plays this seat" data-testid={testid}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === 'builtin'}
          onClick={() => onChange(o.id)}
          className={cx('flex flex-col items-start rounded-control border bg-panel px-2 py-1.5 text-left', o.id === 'builtin' ? 'border-2 border-holo bg-holo-soft shadow-glow' : 'border-holo-line hover:border-holo')}
          data-testid={`${testid}-${o.id}`}
        >
          <span className="text-sm font-semibold">{o.title}</span>
          <span className="text-[10px] leading-tight text-ink-2">{o.detail}</span>
        </button>
      ))}
    </div>
  );
}
