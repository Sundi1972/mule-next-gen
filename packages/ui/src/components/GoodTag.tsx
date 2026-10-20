import { GoodIcon } from './GoodIcon';
import { cx, GOOD_CODE, GOOD_NAME, type Good } from './tokens';

/** A good with its glyph and a short code, or the full name. */
export function GoodTag({ good, name = false, className }: { good: Good; name?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider', className)}>
      <GoodIcon good={good} size={name ? 16 : 14} />
      {name ? <span className="font-sans text-sm font-semibold tracking-normal">{GOOD_NAME[good]}</span> : GOOD_CODE[good]}
    </span>
  );
}
