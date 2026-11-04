import type { ChatMessage } from '@mule/protocol';
import { Button, Creature, cx, HoloMap, SLOT_COLOR } from '@mule/ui';
import { H, W } from '../../fixture';
import { mapTiles } from '../../../../../../apps/web/src/game/derive';
import { DeskTabs } from '../../../../../../apps/web/src/phone/hub/Hub';
import { MapFit } from '../../../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { IntentMarker } from '../../proposed/IntentNote';
import { LINES, MUTE_VIEW, SECONDS } from './fixture';
import { MuteShell } from './MuteShell';
import { MUTE_NOTES } from './notes';
import { MuteTableChat, MuteTalkDesk, MuteTvTicker, PlayStrip, SEATS, TalkGlyph, tvLines, useMute } from './parts';

/** The product's planning desks (apps/web/src/phone/hub/today.tsx), Talk open. Their bodies other than Talk are not drawn. */
const None = () => null;
const DESKS = [
  { id: 'colony', label: 'Colony', icon: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6', Body: None },
  { id: 'talk', label: 'Talk', icon: 'M4 5h16v10H9l-5 4z', Body: None },
  { id: 'council', label: 'Council', icon: 'M4 10h16 M6 10v8 M10 10v8 M14 10v8 M18 10v8 M3 20h18 M12 3l9 5H3z', Body: None },
  { id: 'market', label: 'Market', icon: 'M3 12l9-9h8v8l-9 9z M16 7h.01', Body: None },
];

/** Heiko's phone in planning: the map on the stage, the Talk desk open on The Baron's channel. */
export function MutePhone() {
  return (
    <MuteShell
      phase="Planning"
      seconds={SECONDS}
      chat={<MuteTableChat />}
      rail={
        <>
          <DeskTabs desks={DESKS} active="talk" onPick={() => {}} />
          <div className="flex flex-col gap-2.5 @min-[1100px]/shell:gap-4" data-testid="desk-body-talk">
            <MuteTalkDesk />
          </div>
        </>
      }
      footer={
        <Button size="md" variant="outline" className="w-full" data-testid="ready">
          I’m done planning
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 @min-[1100px]/shell:gap-4">
        <PlayStrip />
        <div className="flex min-h-0 flex-1 flex-col" data-testid="hub-map">
          <MapFit width={W} height={H}>
            <HoloMap width={W} height={H} tiles={mapTiles(MUTE_VIEW)} focusSlot={0} />
          </MapFit>
        </div>
      </div>
    </MuteShell>
  );
}

/** Where each creature stands on the TV's map (its own plots), as ChatDemo's TvChat places them. */
const ON_MAP: { id: string; x: number; y: number }[] = [
  { id: 'baron', x: 12, y: 4 },
  { id: 'kai', x: 9, y: 7 },
  { id: 'brix', x: 9, y: 2 },
  { id: 'heiko', x: 6, y: 2 },
];

/** A public line's bubble above its speaker's creature, at the TV's size: the product's Bubble, size tv. */
function TvBubble({ line }: { line: ChatMessage }) {
  const s = SEATS[line.from]!;
  return (
    <span
      className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[360px] -translate-x-1/2 rounded-panel border-2 bg-panel px-2.5 py-1 text-xl font-semibold leading-snug shadow-chip"
      style={{ borderColor: SLOT_COLOR[s.slot] }}
      data-testid={`tv-bubble-${line.from}`}
      role="status"
    >
      {line.text}
      <span aria-hidden className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent" style={{ borderTopColor: SLOT_COLOR[s.slot] }} />
    </span>
  );
}

/**
 * The TV in the same moment. By default it never knows about a phone's mute: every public line shows, The Baron's
 * included. In the alternative the host's mute reaches it: The Baron's lines go, and its seat says so.
 */
export function MuteTv() {
  const { muted, tvHides } = useMute();
  const hostMuted = tvHides ? muted : new Set<string>();
  const lines = tvLines(LINES, muted, tvHides);
  // The newest public line pops at its speaker, unless the alternative hid it: then nothing pops.
  const newest = LINES.filter((l) => !l.to).at(-1);
  const showing = newest && lines.includes(newest) ? newest : undefined;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-testid="tv-chat" data-state-tv={tvHides ? 'hides' : 'table'}>
      <TvHeader game={MUTE_VIEW} title="Planning" seconds={SECONDS} />
      <MuteTvTicker />
      <div className="flex items-center gap-6 text-lg" data-testid="tv-seats">
        {MUTE_VIEW.players.map((p) => {
          const s = SEATS[p.id]!;
          const off = hostMuted.has(p.id);
          return (
            <span key={p.id} className="inline-flex items-center gap-2" data-testid={`tv-seat-${p.id}`}>
              <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={28} />
              <span className="font-semibold">{p.name}</span>
              <span className={cx('font-mono text-sm', p.ready ? 'text-ok' : 'text-ink-3')}>{p.ready ? 'READY' : 'PLANNING'}</span>
              {off && (
                <span className="relative inline-flex items-center gap-1 rounded-chip border border-warn/70 px-2 font-mono text-sm text-warn" data-testid={`muted-${p.id}-tv`}>
                  <IntentMarker note={MUTE_NOTES.M5} part="tv-seat" at="tr" />
                  <TalkGlyph muted size={16} /> MUTED BY THE HOST
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="relative mx-auto w-[820px]">
        <HoloMap width={W} height={H} tiles={mapTiles(MUTE_VIEW)} density="tv" hideGround className="w-full" />
        {ON_MAP.map((c) => {
          const s = SEATS[c.id]!;
          return (
            <span key={c.id} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${((c.x + 0.5) / W) * 100}%`, top: `${((c.y + 0.5) / H) * 100}%` }}>
              <span className="relative inline-flex" data-speaker={c.id}>
                <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={44} />
                {showing?.from === c.id && <TvBubble line={showing} />}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
