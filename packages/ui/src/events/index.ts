// The event show: what code outside this module uses. Names stay clear of ProductionMap's (landed, SHOW, showTime).
export * from './types';
export {
  eventHitAt,
  plotStrikes,
  plotUnitsAt,
  eventScript,
  eventSegments,
  eventStageAt,
  eventSkipTo,
  eventFrontAt,
  EVENT_FRONT,
  type EventScript,
  type EventSegment,
  type EventStage,
  type PlotStrike,
  type ShowPlot,
  type ShowGrid,
} from './timing';
export { EventBoundary } from './boundary';
export { EventShow, useShow as useEventShow, useEnclosingEventShow, type EventShowProps, type ShowCast, type ShowFrame } from './frame';
export { EventLivingMap, type EventLivingMapProps } from './map';
export { useEventLivingView } from './living';
export { EventSoloRail, EventTvPhoneRail, EventSkipHint } from './phone';
export { useEventReducedMotion } from './motion';
export { EventPips, EventTvLog, EventColonyChips, type EventPlotOutput } from './tv';
