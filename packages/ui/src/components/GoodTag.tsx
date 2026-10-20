import { cx, GOOD_CODE, GOOD_NAME, type Good } from './tokens';

/** A good as the hologram writes it: a coloured dot and a short code, or the full name. */
export function GoodTag({ good, name = false, className }: { good: Good; name?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider', className)}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--color-g-${good})` }} />
      {name ? <span className="font-sans text-sm font-semibold tracking-normal">{GOOD_NAME[good]}</span> : GOOD_CODE[good]}
    </span>
  );
}
