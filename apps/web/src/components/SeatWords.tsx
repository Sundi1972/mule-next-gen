import type { MuleView, PlayerView } from '@mule/protocol';
import type { ReactNode } from 'react';
import { AiMark } from '../chat/Chat';

type NewsView = Pick<MuleView, 'news' | 'newsLines' | 'players'>;
/** What the marker reads of a seat: its name, and whether a computer plays it. */
type Seat = Pick<PlayerView, 'id' | 'name' | 'isAi'>;

/**
 * Words that name seats, with " · AI" after each computer seat's name (Heiko, 7 Nov: a quiet mark wherever a computer
 * seat is named). `who` holds one seat id per name in the words, in their order, repeats kept (as NewsLine.who): the
 * news lists and the deal cards' break words both draw through this, so the mark follows one rule everywhere. The caller
 * pairs the words with their ids: a name the words spell differently from `players` is passed over, unmarked.
 */
export function SeatWords({ text, who, players }: { text: string; who: readonly string[]; players: readonly Seat[] }) {
  return <>{marked(text, who, players)}</>;
}

/**
 * News line `i` as a list shows it, through SeatWords. The seats come from newsLines, and only when that line's text is
 * the one shown, so an older server's view, or one whose lists drift, shows the words as they are. Every news list
 * draws its lines through this: the TV's news column, the phone's colony desk and its harvest results.
 */
export function NewsWords({ view, i }: { view: NewsView; i: number }) {
  const text = view.news[i] ?? '';
  const line = view.newsLines?.[i];
  return <SeatWords text={text} who={line?.text === text ? line.who : []} players={view.players} />;
}

/**
 * `who` names the seats in the words' order, so each is found after the one before, as a whole word ("Al", never
 * "Also"). A person's name is passed over unmarked, so a computer seat of the same name is found in its own place.
 */
function marked(text: string, who: readonly string[], players: readonly Seat[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const id of who) {
    const p = players.find((q) => q.id === id);
    if (!p) continue;
    const at = wholeWordAt(text, p.name, from);
    if (at < 0) continue;
    const end = at + p.name.length;
    parts.push(text.slice(from, end));
    if (p.isAi) parts.push(<AiMark key={end} />);
    from = end;
  }
  parts.push(text.slice(from));
  return parts;
}

const WORD = /[\p{L}\p{N}]/u;
function wholeWordAt(text: string, name: string, from: number): number {
  if (name === '') return -1;
  for (let at = text.indexOf(name, from); at >= 0; at = text.indexOf(name, at + 1)) {
    if (!WORD.test(text[at - 1] ?? '') && !WORD.test(text[at + name.length] ?? '')) return at;
  }
  return -1;
}
