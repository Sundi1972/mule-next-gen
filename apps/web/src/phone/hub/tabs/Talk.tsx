import { useEffect } from 'react';
import { useClientState } from '../../../net/react';
import { Chat } from '../../parts';
import { useHub } from '../Hub';
import { useToday } from '../state';
import { TabBadge } from './parts';

/*
 * The Talk tab (the approved hub-tabs mock, D11): the table's chat with the whole stage, so the thread takes the
 * stage's height. Opening it reads what was said.
 */

export function TalkTab() {
  const { chat } = useClientState();
  const { setSeenChat } = useToday();
  useEffect(() => setSeenChat(chat.length), [chat.length, setSeenChat]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="channels">
      <Chat />
    </div>
  );
}

/** Unread table chat, a count on the Talk tab while another tab is open. */
export function TalkBadge() {
  const { chat } = useClientState();
  const { seenChat } = useToday();
  const { tab } = useHub();
  const unread = tab === 'talk' ? 0 : chat.length - seenChat;
  if (unread <= 0) return null;
  return (
    <TabBadge tone="holo" label={`${unread} unread`} testid="talk-badge">
      {unread}
    </TabBadge>
  );
}
