// Copied from apps/web/src/phone/hub/politics/parts.tsx on origin/ws7-s3-phone-pr at 3bcfdd7c: RepChip and what it needs
// (bandOf, BAND_WORDS, BandMark, useChange), unchanged. WS4 draws it on the TV with `tv`, as a label.
import { POLITICS, START } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { cx } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';

export type Band = 'good' | 'fair' | 'low';

/** POLITICS.weight's thresholds: repHigh and up is a good name (+1 vote), under repLow a low one (−1 vote, AI seats refuse). */
export function bandOf(rep: number): Band {
  return rep >= POLITICS.weight.repHigh ? 'good' : rep < POLITICS.weight.repLow ? 'low' : 'fair';
}

export const BAND_WORDS: Record<Band, string> = {
  good: 'Good name: +1 vote',
  fair: 'Fair name',
  low: 'Low name: −1 vote, and AI players turn down their cards',
};

const STAR = 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z';
const WARN = 'M12 4l9 16H3z M12 10v4 M12 17v.01';

/** The band's mark: a star for a good name, a warning for a low one, nothing between. It says the band without colour. */
export function BandMark({ band, size }: { band: Band; size: number }) {
  if (band === 'fair') return null;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="shrink-0" fill={band === 'good' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d={band === 'good' ? STAR : WARN} />
    </svg>
  );
}

const CHANGE_MS = 6000;

/** How much the value moved since it last changed, for CHANGE_MS; null otherwise. Nothing in the view records a move. */
function useChange(value: number): number | null {
  const last = useRef(value);
  const [change, setChange] = useState<number | null>(null);
  useEffect(() => {
    if (value === last.current) return;
    setChange(value - last.current);
    last.current = value;
    const t = setTimeout(() => setChange(null), CHANGE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return change;
}

const SIZES = {
  phone: { box: 'h-4 gap-0.5 px-1 text-[10px] leading-4', mark: 9 },
  tv: { box: 'h-8 gap-1 px-2 text-xl leading-8', mark: 18 },
} as const;

const reputationOf = (view: Pick<MuleView, 'players'>, id: string) => view.players.find((q) => q.id === id)?.reputation ?? START.reputation;

/**
 * A player's reputation, beside their name: the number, its band's mark and edge, and for a few seconds its last move.
 * With `onOpen` it is a button (its hit area reaches past its edges); without, inside another control or on the TV, a label.
 */
export function RepChip({ view, id, tv = false, onOpen, testid }: { view: Pick<MuleView, 'players'>; id: string; tv?: boolean; onOpen?: () => void; testid?: string }) {
  const name = view.players.find((q) => q.id === id)?.name ?? id;
  const rep = reputationOf(view, id);
  const band = bandOf(rep);
  const change = useChange(rep);
  const s = SIZES[tv ? 'tv' : 'phone'];
  const tid = testid ?? `rep-${id}`;
  const label = `${name}: reputation ${rep}. ${BAND_WORDS[band]}.`;
  const body = (
    <>
      <BandMark band={band} size={s.mark} />
      <span data-num>{rep}</span>
      {change !== null && (
        <span className={cx('font-bold', change > 0 ? 'text-ok' : 'text-alert')} data-testid={`${tid}-change`}>
          {change > 0 ? `+${change}` : `−${-change}`}
        </span>
      )}
    </>
  );
  const cls = cx(
    'relative inline-flex shrink-0 items-center whitespace-nowrap rounded-chip border font-mono font-bold',
    s.box,
    band === 'good' && 'border-ok text-ok',
    band === 'fair' && 'border-holo-line text-ink-2',
    band === 'low' && 'border-dashed border-alert text-alert',
    change !== null && 'animate-[show-card-in_0.4s_ease-out]',
  );
  if (!onOpen)
    return (
      <span className={cls} role="img" aria-label={label} data-testid={tid} data-band={band}>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cx(cls, "before:absolute before:-inset-3 before:content-['']")}
      aria-label={`${label} Open ${name}'s card.`}
      data-testid={tid}
      data-band={band}
    >
      {body}
    </button>
  );
}
