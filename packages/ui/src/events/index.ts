// The event show: what code outside this module uses. Names stay clear of ProductionMap's (landed, SHOW, showTime).
export * from './types';
export {
  eventHitAt,
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
  type PlotStrike,
  type ShowPlot,
  type ShowGrid,
} from './timing';
export { EVENT_ENTRY, type EventEntry, type EventMotion } from './catalogue';
export { EventBoundary } from './boundary';
export { EventSickTag, sickAt as eventSickAt } from './rollcall';
export { EventShow, useShow as useEventShow, useEnclosingEventShow, type EventShowProps } from './frame';
export { EventLivingMap } from './map';
export { useEventLivingView } from './living';
export { EventSoloRail, EventTvPhoneRail, EventSkipHint } from './phone';
export { useEventReducedMotion } from './motion';
export { EventPips, EventTvLog, EventColonyChips, type EventPlotOutput } from './tv';
