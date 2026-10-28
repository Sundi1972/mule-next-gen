// The event show: the Living weather gallery's engine (design/mocks/ws8-events), wave 1. Names stay clear of
// ProductionMap's (landed, EventKind, SHOW, EventCard), which plays its events through this module.
export * from './types';
export {
  EVENT_BEAT,
  EVENT_SOLO_BEAT,
  EVENT_SOLO_PACE,
  eventHitAt,
  eventLanded,
  plotStrikes,
  plotUnitsAt,
  eventScript,
  eventSegments,
  eventStageAt,
  eventFrontAt,
  EVENT_FRONT,
  type EventScript,
  type EventSegment,
  type EventStage,
  type EventLandedHit,
  type PlotStrike,
  type ShowPlot,
  type ShowGrid,
} from './timing';
export { EVENT_CATALOGUE, EVENT_ENTRY, type EventEntry, type EventMotion } from './catalogue';
export { EventShow, eventCast, type EventShowProps, type ShowCast } from './frame';
export { EventLivingMap, type EventLivingMapProps } from './map';
export { useEventLivingView } from './living';
export { EventGlyph, EVENT_ACCENT, EventSignBadge, EventDeltaChip, EventBuzz } from './glyphs';
export { EventPhoneCard, EventRailTail, EventWaiting, EventNowPlaying, EventSoloRail, EventTvPhoneRail } from './phone';
export { useEventReducedMotion } from './motion';
export { EventPips, EventTvLog, EventColonyChips, eventPlayerChange, type EventPlotOutput } from './tv';
export { eventMissLine, eventSegLabel, eventSegmentSummary, eventSummary, eventWhoLine, eventYouSummary, type EventYouSummary } from './copy';
