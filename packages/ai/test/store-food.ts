import { START, STRATEGIST, UPKEEP } from '@mule/engine';

/**
 * A store whose Food lasts the colonists past the AI's outlook (STRATEGIST.horizon and a month more). With the store's
 * per-seat Food (START.storeFoodPerPlayer) the outlook sees the shelf run dry, prices Food at what colonists pay, and
 * every land plan reaches for the same farm. A test whose premise is a market-priced farm, or land plans that differ,
 * stocks the store with this.
 */
export const FOOD_TO_SPARE = Math.ceil(START.colonists / UPKEEP.colonistsPerUnit) * (STRATEGIST.horizon + 1);
