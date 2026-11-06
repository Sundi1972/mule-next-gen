import { Button, cx } from '@mule/ui';
import { useEffect, useState } from 'react';
import { setupLine, type LobbyLink, type PlayLink } from './fixture';

/*
 * DS-GAP: @mule/ui has no chip. Lobby.tsx keeps its own CHIP_CLASS (AI, HOST, PHONE, AWAY); these are its entries
 * plus the Claude Code ones, from the same tokens. One chip component in packages/ui would hold both.
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

export const LOBBY_CHIP: Record<LobbyLink, ChipWord> = { waiting: 'WAITING FOR CLAUDE', connected: 'CLAUDE · CONNECTED' };
export const PLAY_CHIP: Record<PlayLink, ChipWord> = { thinking: 'CLAUDE · THINKING', ready: 'CLAUDE · READY', offline: 'CLAUDE · OFFLINE' };

/** `suffix` follows the word, such as the side pick's countdown (CLAUDE · THINKING · 0:32). */
export function Chip({ word, suffix, className, testid }: { word: ChipWord; suffix?: string | undefined; className?: string; testid?: string }) {
  return (
    <span className={cx('shrink-0 whitespace-nowrap rounded-chip px-1.5 font-mono text-[10px] font-bold', CHIP_CLASS[word], word === 'CLAUDE · THINKING' && 'animate-pulse', className)} data-testid={testid}>
      {word}
      {suffix && ` · ${suffix}`}
    </span>
  );
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
export function CopyLine({ label, text, testid, big = false }: { label: string; text: string; testid: string; big?: boolean }) {
  const [copied, copy] = useCopied();
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <span className="label-caps text-[10px]!">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className={cx('min-w-0 flex-1 rounded-control border border-holo-line bg-void/40 px-2 py-1.5 font-mono text-ink', big ? 'whitespace-nowrap text-sm font-bold tracking-[0.04em] text-holo' : 'break-all text-[11px] leading-snug')}
          data-testid={`${testid}-text`}
        >
          {text}
        </code>
        <Button size="md" variant="outline" className="shrink-0" onClick={() => copy(text)} aria-label={`Copy ${label.toLowerCase()}`} data-testid={`${testid}-copy`}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

export function SetupLink({ testid = 'setup-link' }: { testid?: string }) {
  return (
    <a href="#setup" className="min-h-8 self-start text-sm text-holo underline-offset-2 hover:underline" data-testid={testid}>
      How to set up Claude Code →
    </a>
  );
}

/** What the host hands to whoever runs Claude Code: the seat's code, the one setup line, and the page that explains them. */
export function ClaudeSetup({ code, testid = 'claude-setup' }: { code: string; testid?: string }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      <CopyLine label="Join code" text={code} testid={`${testid}-code`} big />
      <CopyLine label="Setup, once per computer" text={setupLine()} testid={`${testid}-line`} />
      <SetupLink testid={`${testid}-link`} />
    </div>
  );
}

export type ComputerKind = 'builtin' | 'claude';

/**
 * Built-in or Claude Code, for a computer seat. The pressed look is the lobby's species picker's.
 * DS-GAP: no segmented choice in @mule/ui.
 */
export function KindChoice({ value, onChange, testid = 'kind' }: { value: ComputerKind; onChange: (k: ComputerKind) => void; testid?: string }) {
  const options: { id: ComputerKind; title: string; detail: string }[] = [
    { id: 'builtin', title: 'Built-in', detail: 'The game plays it' },
    { id: 'claude', title: 'Claude Code', detail: 'A Claude Code session plays it' },
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Who plays this seat" data-testid={testid}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cx('flex flex-col items-start rounded-control border bg-panel px-2 py-1.5 text-left', o.id === value ? 'border-2 border-holo bg-holo-soft shadow-glow' : 'border-holo-line hover:border-holo')}
          data-testid={`${testid}-${o.id}`}
        >
          <span className="text-sm font-semibold">{o.title}</span>
          <span className="text-[10px] leading-tight text-ink-2">{o.detail}</span>
        </button>
      ))}
    </div>
  );
}
