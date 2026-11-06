import { DEV_WALK, DEVELOPMENT } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx, PaceList, SeatSpeciesProvider, SharedClock, type PaceRow } from '@mule/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tvSpeakerAt } from '../chat/Chat';
import { secondsUntil, seatSpecies, toSlot } from '../game/derive';
import { useServerNow } from '../net/react';
import { BoardLive, useLive } from '../phone/arcade/live';
import { stillNeeding, tvLines, tvLinesPlace, TV_LINE } from '../phone/arcade/moments';
import type { DrawnMoments } from '../phone/arcade/frames';
import { colonistsOf, type ArcadeColonist } from '../phone/arcade/seat';
import { HallStage, MapStage } from '../phone/arcade/stages';
import { TvHeader } from './TableApp';

/**
 * The big screen in development, steered (arcade spec C12): the approved mock's TV (Tv.tsx::TvArcade at d30ae057) on
 * the view and the frames. The whole colony with every colonist walking live, named; the store's hall beside it with
 * whoever is shopping; everyone's clock; each colonist's pace and what they are doing; the chat ticker as today.
 */
export function TvDevelop({ game }: { game: MuleView }) {
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <BoardLive view={game}>
        <TvArcade game={game} />
      </BoardLive>
    </SeatSpeciesProvider>
  );
}

/** What each colonist is doing, at its row's end, as far as the frames and the view say: a moment first. */
function doing(c: ArcadeColonist | undefined, done: boolean, drawn: DrawnMoments | null, racing: readonly string[]): string {
  if (done) return 'PUB';
  if (!c) return '';
  if (c.encounter) return c.encounter === 'fight' ? 'FIGHT' : c.encounter === 'chase' ? 'RUN' : 'WOLVES';
  if (racing.includes(c.id)) return 'CORRAL';
  if (drawn?.glint && drawn.racers.includes(c.id)) return 'GLINT';
  return c.space === 'hall' ? (c.lead ? 'OUTFIT' : 'STORE') : c.lead?.good ? '→ PLOT' : '→ STORE';
}

/** The hall at 4:3 in the box the pace list leaves it: as wide as the box, or as tall, whichever is less. */
export function fitHall(box: { w: number; h: number }): { w: number; h: number } {
  return { w: Math.min(box.w, (box.h * 4) / 3), h: Math.min(box.h, (box.w * 3) / 4) };
}

/** The TV's map, as wide as the mock draws it. */
const MAP_W = 740;

/** The hall's box at the mock's four seats, before it is measured: 424 wide at 4:3. */
const HALL_BOX = { w: 424, h: 318 };

const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** The screen itself, under whichever Live its caller gives it: the board's frames, or a test's moment. */
export function TvArcade({ game }: { game: MuleView }) {
  const live = useLive();
  const serverNow = useServerNow(200);
  const colonists = colonistsOf(game, live, null);
  const seconds = secondsUntil(game.phaseEndsAt, serverNow) ?? 0;
  const drawn = live.moments ?? null;
  const racing = stillNeeding(drawn?.scramble, colonists);
  const rows: PaceRow[] = game.players.map((p) => ({ id: p.id, name: p.name, slot: toSlot(p.slot), condition: p.condition, note: doing(colonists.find((c) => c.id === p.id), p.doneDeveloping, drawn, racing), done: p.doneDeveloping }));
  const data = { view: game, colonists };
  // The hall takes the height the pace list leaves (A-1: six seats and a three-line ticker), at 4:3.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(HALL_BOX);
  useBeforePaint(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // A box not laid out yet keeps the mock's four-seat size.
    const measure = () => el.clientWidth > 0 && setRoom((r) => (r.w === el.clientWidth && r.h === el.clientHeight ? r : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hall = fitHall(room);
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-6 text-ink" data-phase="development" data-testid="tv-game">
      {/* No clock in the header: "Everyone's time" right under it is development's clock, so the colony's gauges keep their
          place beside the title and the map its size (PM ruling, 6 Nov; rulebook #gauges-row). */}
      <TvHeader game={game} title="Development" />
      <SharedClock seconds={seconds} total={DEVELOPMENT.fullSeconds} size="tv" />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="relative shrink-0 self-start" data-testid="tv-map">
          <MapStage data={data} width={MAP_W} density="tv" names testid="tv-map-stage" />
          <TvBeats game={game} colonists={colonists} mapW={MAP_W} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <span className="label-caps text-base!">In the store now</span>
          <div ref={box} className="min-h-0 flex-1" data-testid="tv-hall-box">
            <HallStage data={data} width={hall.w} density="tv" store="phone" names testid="tv-hall-stage" />
          </div>
          <div className="shrink-0">
            <PaceList rows={rows} rule={DEV_WALK} columns={1} wrapMark={tvSpeakerAt} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The TV's lines along the map's foot, clear of the store (above it when the store sits too low): the moments now (the
 * scramble's call, the glint, each colonist meeting wolves), then the frames' latest beats. Everyone at the table sees every pack, every fight and every race.
 */
function TvBeats({ game, colonists, mapW }: { game: MuleView; colonists: ArcadeColonist[]; mapW: number }) {
  const live = useLive();
  const place = tvLinesPlace(game, mapW);
  const lines = [...tvLines({ drawn: live.moments ?? null, colonists, beats: live.beats.map((b) => b.text), mulesLeft: game.storeMules })].slice(0, place.most);
  if (lines.length === 0) return null;
  return (
    <div
      className={cx('pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center', place.edge === 'bottom' ? 'bottom-3' : 'top-3')}
      style={{ gap: TV_LINE.gap }}
      data-testid="tv-beats"
      data-edge={place.edge}
    >
      {lines.map((l) => (
        <span
          key={l.key}
          className={cx(
            'whitespace-nowrap rounded-panel border-2 bg-panel/95 px-4 py-1.5 font-display text-xl font-bold leading-7 shadow-glow',
            l.tone === 'alert' ? 'border-alert text-alert' : l.tone === 'ok' ? 'border-ok text-ok' : l.tone === 'glint' ? 'border-g-crystite text-ink' : 'border-warn text-warn',
          )}
          data-testid="tv-beat"
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
