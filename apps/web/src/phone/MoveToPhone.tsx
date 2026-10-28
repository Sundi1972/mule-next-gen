import { Button } from '@mule/ui';
import { useEffect } from 'react';
import { joinUrl } from '../components/Qr';
import { useClient, useClientState } from '../net/react';
import { codeState, HandoffCode } from './HandoffCode';

/**
 * The body of a "move to your phone" dialog: the one-time link that moves this seat to another device. The code lives
 * as long as this body: asked for when it opens, forgotten however it goes (Done, Escape, or the screen leaving).
 */
export function MoveToPhone({
  titleId,
  title,
  room,
  who,
  what,
  doneTestId,
  onDone,
}: {
  titleId: string;
  title: string;
  room: string;
  /** Who the phone becomes, after "you, ". */
  who: string;
  /** What comes with the seat and what happens next, after the bold "you, …". */
  what: string;
  doneTestId?: string | undefined;
  onDone: () => void;
}) {
  const client = useClient();
  const { handoffCode } = useClientState();
  useEffect(() => {
    client.handoff();
    return () => client.closeHandoff();
  }, [client]);
  return (
    <>
      <h2 id={titleId} className="font-display text-xl font-semibold @min-[1100px]/shell:text-3xl">
        {title}
      </h2>
      <div className="flex items-center gap-4">
        <HandoffCode url={handoffCode ? joinUrl(room, handoffCode.code) : ''} state={codeState(handoffCode)} onRenew={() => client.handoff()} />
        <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">
          Scan this with your phone. It becomes <strong className="text-ink">you, {who}</strong>
          {what}
        </p>
      </div>
      <Button size="md" variant="outline" autoFocus onClick={onDone} data-testid={doneTestId}>
        Done
      </Button>
    </>
  );
}
