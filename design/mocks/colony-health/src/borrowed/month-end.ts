/**
 * The real MonthEnd module with this mock's ColonyPanel in its place. vite.config.ts's seam serves this file to the
 * real phone `Results` (and only to it) for its `../components/MonthEnd` import, so the phone pages mount the real
 * screen with the Health block. A local export shadows the star export's ColonyPanel.
 */
export * from '../../../../../apps/web/src/components/MonthEnd';
export { ColonyPanel } from '../panel';
