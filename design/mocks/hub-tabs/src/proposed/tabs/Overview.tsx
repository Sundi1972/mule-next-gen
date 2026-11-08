import { Button, cx } from '@mule/ui';
import { useState } from 'react';
import { OnlyYou } from '../../../../../../apps/web/src/phone/hub/OnlyYou';
import type { AgendaSlot, HubSeat, MapToolSlot } from '../../../../../../apps/web/src/phone/hub/slots';
import { DESK_DOORS, useDrawn, useHub } from '../Hub';
import { Glyph } from '../parts';
import type { Door, PlotPickSlot, TabId } from '../slots';

/*
 * GRAFT TARGET: new apps/web/src/phone/hub/tabs/Overview.tsx, from Hub.tsx's HubStage, MapTools and AgendaRow.
 * Overview is the one map (PM ruling): the tool row above it (Look, Geo drone, My plots, Sell a plot, which absorbs
 * today's Market desk), the map as large as the stage allows, and "This month" under it as compact rows, each a door
 * into the tab where it is done. The tool's panel and action are in the rail, under Now.
 */

export const TAB_WORD: Record<TabId, (seat: HubSeat) => string> = {
  overview: () => 'Overview',
  politics: ({ view, self }) => (view.politics?.governor === self.id ? 'Governor' : 'Council'),
  colony: () => 'Colony',
  talk: () => 'Talk',
};

export function OverviewTab() {
  const nav = useHub();
  const { slots, seat, pick } = useDrawn();
  const tool = slots.tools.find((t) => t.id === nav.tool) ?? slots.tools[0];
  const ToolMap = pick ? pick.Map : tool?.Map;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="overview">
      {slots.banners.filter((b) => b.show?.(seat) ?? true).map(({ id, Body }) => (
        <Body key={id} />
      ))}
      {pick ? !pick.ownBar && <PickBar pick={pick} seat={seat} onBack={() => { nav.endPick(); nav.open(pick.back); }} /> : <ToolRow tools={slots.tools} active={tool?.id ?? ''} onPick={nav.pickTool} />}
      <div className={cx('flex min-h-0 flex-1 flex-col', pick && !pick.ownBar && 'rounded-control ring-2 ring-warn')} data-testid="hub-map">
        {ToolMap && <ToolMap />}
      </div>
      {!pick && <AgendaRows items={slots.agenda} seat={seat} onOpen={nav.open} />}
    </div>
  );
}

/** The map's tools in one row above it: what a tap on the map does. The one pressed is lit. DS-GAP: Button has no size under 44 px; 32 px chips, as MapTools today. */
function ToolRow({ tools, active, onPick }: { tools: MapToolSlot[]; active: string; onPick(id: string): void }) {
  return (
    <div role="toolbar" aria-label="Map tools" className="flex shrink-0 gap-1" data-testid="map-tools">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={active === t.id}
          onClick={() => onPick(t.id)}
          className={cx(
            'flex h-8 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-control border px-1.5 text-[11px] font-semibold',
            active === t.id ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:text-ink',
          )}
          data-testid={`tool-${t.id}`}
        >
          <span className="truncate">{t.label}</span>
          {t.locked && <OnlyYou text="" />}
        </button>
      ))}
    </div>
  );
}

/** A pick another tab handed to the map: the bar says what a tap does and goes back where it came from. */
function PickBar({ pick, seat, onBack }: { pick: PlotPickSlot; seat: HubSeat; onBack(): void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-control border border-warn bg-warn/10 py-0.5 pl-2 pr-0.5" role="status" data-testid={`pick-bar-${pick.id}`}>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <strong className="text-xs font-semibold text-warn">
          {pick.label} · <span className="font-normal text-ink">{pick.hint(seat)}</span>
        </strong>
      </span>
      <Button size="md" variant="outline" className="shrink-0 gap-1 whitespace-nowrap px-2.5" onClick={onBack} data-testid="pick-back">
        <Glyph d="M15 6l-6 6 6 6" size={12} />
        Back to {pick.back.label}
      </Button>
    </div>
  );
}

/** An agenda item's door as a tab door; null for a map tool's door, which the tool row already shows. */
export function doorOf(opens: AgendaSlot['opens']): Door | null {
  if ('tool' in opens) return null;
  return DESK_DOORS[opens.desk]?.(opens.focus) ?? null;
}

/**
 * "This month": compact rows under the map, each opening the tab where it is done: the deal offer (Talk), next month's
 * vote and the election (Council), what you are short of (Colony).
 *
 * The Overview height check (PM, 8 Nov): the box is always two lines of two, whatever it holds, so the map above it is the
 * same size whatever the needs or the month say. Measured before (scripts/measure-needs.mjs): the rows set the box's
 * height, and the map moved with them, 506 × 304 with nothing waiting to 312 × 187 with five rows at 844 (A). Nothing
 * waiting: a quiet line holds the box. More than four: three rows and "+N more", which turns the box's page; the second
 * page ends on "Back".
 */
const AGENDA_CELLS = 4;

function AgendaRows({ items, seat, onOpen }: { items: AgendaSlot[]; seat: HubSeat; onOpen(d: Door): void }) {
  const [page, setPage] = useState(0);
  const rows = items.flatMap((it) => {
    const door = doorOf(it.opens);
    return door ? [{ it, door }] : [];
  });
  const paged = rows.length > AGENDA_CELLS;
  const per = paged ? AGENDA_CELLS - 1 : AGENDA_CELLS;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * per, at * per + per);
  const cell = 'flex min-h-9 min-w-0 items-center gap-1.5 rounded-control border bg-panel px-2 py-0.5 text-left hover:border-holo';
  return (
    <section className="flex shrink-0 flex-col gap-1" aria-label="This month" data-testid="agenda">
      <span className="label-caps text-[10px]!">This month</span>
      {/* Two lines of two, always: the box's height never follows its rows (h-19 = two 36 px rows and the gap). */}
      <div className="grid h-19 grid-cols-2 grid-rows-2 gap-1" data-testid="agenda-box">
        {rows.length === 0 && (
          <span className="col-span-2 flex items-center text-xs text-ink-3" data-testid="agenda-empty">
            Nothing waits on you this month.
          </span>
        )}
        {shown.map(({ it, door }) => (
          <button
            key={it.key}
            type="button"
            onClick={() => onOpen(door)}
            className={cx(cell, it.lead?.(seat) ? 'border-holo bg-holo-soft' : 'border-holo-line')}
            data-testid={`agenda-${it.key}`}
          >
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-xs font-semibold">{it.title(seat)}</span>
                {it.locked && <OnlyYou text="" />}
              </span>
              <span className="truncate text-[10px] text-ink-2">{it.sub(seat)}</span>
            </span>
            <span className="flex shrink-0 items-center text-[10px] font-semibold text-holo" data-testid={`agenda-${it.key}-tab`}>
              {TAB_WORD[door.tab](seat)}
              <Glyph d="M9 6l6 6-6 6" size={10} />
            </span>
          </button>
        ))}
        {paged && (
          <button
            type="button"
            onClick={() => setPage(at + 1 < pages ? at + 1 : 0)}
            className={cx(cell, 'justify-center border-holo-line text-xs font-semibold text-holo')}
            aria-label={at + 1 < pages ? `${rows.length - (at + 1) * per} more this month` : 'Back to the first rows'}
            data-testid={at + 1 < pages ? 'agenda-more' : 'agenda-back'}
          >
            {at + 1 < pages ? (
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-xs font-semibold">+{rows.length - (at + 1) * per} more</span>
                {/* What waits behind it, so a shortfall on the second page is never out of sight. */}
                <span className="truncate text-[10px] font-normal text-ink-2" data-testid="agenda-more-titles">
                  {rows
                    .slice((at + 1) * per)
                    .map(({ it }) => it.title(seat))
                    .join(' · ')}
                </span>
              </span>
            ) : (
              'Back'
            )}
          </button>
        )}
      </div>
    </section>
  );
}
