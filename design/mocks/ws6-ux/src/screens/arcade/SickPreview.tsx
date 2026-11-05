import { cx, sickReason } from '@mule/ui';
import { createContext, useContext } from 'react';

/**
 * The sick line on the sideways phone (PM, 5 Nov): the arcade's pace line says "Pace 50%: sick" in small orange, with
 * no cause and nothing that says it strikes this turn; the tap screen's start card said both. Two ways to say it, beside
 * today's, on the same live phone.
 *
 *   today  the line as it ships: "Your pace 50%: you are sick" (844), "Pace 50%: sick" (667's bar).
 *   A      the line names the sickness and its cause in the roll call's medicine colour; a tap says it struck as the
 *          turn began. No new box: the side room's line and the bar's.
 *   B      A, and the turn opens with it: for its first 6 s the banner box (between the stick and the button) says
 *          "✚ Sick: the air is toxic. It strikes now: you walk at 50% this turn.", then gives way to the guide's note.
 */
export type SickVariant = 'today' | 'A' | 'B';
export type SickCause = 'chance' | 'air' | 'pollution';

export const SickPreview = createContext<{ variant: SickVariant; because: SickCause }>({ variant: 'today', because: 'chance' });

export const useSickPreview = () => useContext(SickPreview);

/** How long B's opening banner stays up, in ms of the turn. */
export const SICK_BANNER_MS = 6_000;

/** The roll call's sick tag, small: a white cross on the medicine colour, so it reads without the colour too. */
export function SickTag({ size = 12 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-g-medicine font-bold leading-none text-void" style={{ width: size, height: size, fontSize: size - 2 }} aria-hidden>
      ✚
    </span>
  );
}

/** A and B's words: the cause (sickReason's own), the pace, and what hunger adds. */
export function sickWords(because: SickCause, pct: number, hungry: { food: number; need: number } | null): { title: string; pace: string; short: string; why: string } {
  return {
    title: sickReason(because),
    pace: hungry ? `${pct}% pace this turn · you ate ${hungry.food} of ${hungry.need} Food` : `${pct}% pace this turn`,
    short: hungry ? `Sick · ate ${hungry.food} of ${hungry.need} · ${pct}%` : `Sick · ${pct}% pace`,
    why: 'It struck as your turn began, with no Medicine to cure it. Hold one Medicine and sickness can’t slow you.',
  };
}

/** B: the banner the turn opens with, in the banner box. */
export function SickBanner({ because, pct, faded }: { because: SickCause; pct: number; faded: boolean }) {
  return (
    <span
      className={cx('pointer-events-none flex max-w-full items-center gap-1.5 rounded-chip border-2 border-g-medicine bg-panel/95 px-2 py-1 font-display text-sm font-bold leading-tight text-ink shadow-chip transition-opacity duration-200', faded && 'opacity-25')}
      data-testid="sick-banner"
    >
      <SickTag size={14} />
      <span>
        {sickReason(because)} It strikes now: you walk at {pct}% this turn.
      </span>
    </span>
  );
}
