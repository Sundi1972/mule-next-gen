// The event show: the Living weather gallery's engine (design/mocks/ws8-events), wave 1. Names stay clear of
// ProductionMap's (ShowEvent, hitAt, landed, EventKind, SHOW, EventCard).
export * from './types';
export {
  EVENT_BEAT,
  EVENT_SOLO_BEAT,
  EVENT_SOLO_PACE,
  eventHitAt,
  eventLanded,
  eventScript,
  eventSegments,
  eventStageAt,
  type EventScript,
  type EventSegment,
  type EventStage,
  type LandedHit,
  type ShowGrid,
} from './timing';
export { SHOW_CATALOGUE, SHOW_ENTRY, type ShowEntry, type ShowMotion } from './catalogue';
export { EventShow, showCast, type EventShowProps, type ShowCast } from './frame';
export { LivingMap, type LivingMapProps } from './map';
export { useLivingView } from './living';
export { EventGlyph, EVENT_ACCENT, SignBadge, DeltaChip, Buzz } from './glyphs';
export { EventPhoneCard, EventRailTail, EventWaiting, NowPlaying, PhoneSoloRail } from './phone';
export { missLine, segLabel, whoLine, youSummary, type YouSummary } from './copy';
