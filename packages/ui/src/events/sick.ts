import type { ShowEventView } from './types';

/** Why a sick player fell sick, read from the server's line ("Lena fell sick: the air is bad."), or null. */
/**
 * Who an epidemic made sick: everyone whose Medicine it did not use (RULE-4). The view names only the cured, by a
 * Medicine effect, so every other seat is sick.
 */
export function epidemicSick(ev: Pick<ShowEventView, 'effects'>, players: readonly { id: string }[]): string[] {
  const cured = new Set((ev.effects ?? []).filter((f) => f.what === 'medicine').map((f) => f.on));
  return players.filter((p) => !cured.has(p.id)).map((p) => p.id);
}

export const sickBecause = (line: string) => line.match(/fell sick: (.+?)\.?$/)?.[1] ?? null;
