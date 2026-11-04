import type { ReactNode } from 'react';
import { Button } from './Button';
import { cx } from './tokens';

export interface ActionButtonProps {
  /** What a press does now, as the server words it (MyView.reach): the verb, a detail such as a price, and whether it works. */
  verb: string;
  detail: string | null;
  enabled: boolean;
  onPress(): void;
  size?: 'lg' | 'xl';
  compact?: boolean;
  /** The landscape phone's narrow button: its words take two lines rather than cut them. */
  wrap?: boolean;
  /** The small phone's (667 × 375). */
  small?: boolean;
  className?: string;
  /** Under the verb when there is no detail, such as the key that presses it. */
  hint?: ReactNode;
}

/**
 * The one action button (arcade spec C3, C11): it always says what a press does right now, and is dim when nothing is
 * in reach. It acts on the press, not the release, as an arcade button does, and keeps the keyboard's focus where it
 * was; a keyboard's Enter on it (a click with no pointer) presses it too.
 */
export function ActionButton({ verb, detail, enabled, onPress, size = 'xl', compact = false, wrap = false, small = false, className, hint }: ActionButtonProps) {
  const label = `${verb}${detail ? ` · ${detail}` : ''}`;
  return (
    <Button
      variant={enabled ? 'holo' : 'outline'}
      size={size}
      disabled={!enabled}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!e.altKey) onPress();
      }}
      onClick={(e) => e.detail === 0 && onPress()}
      className={cx('h-auto! min-h-20 w-full flex-col gap-0! px-3! py-2', className)}
      data-testid="action-button"
      data-enabled={enabled}
    >
      <span className={cx('block max-w-full font-display font-bold leading-tight', wrap ? cx('line-clamp-2 text-balance', small ? 'text-sm' : 'text-base') : cx('truncate', compact ? 'text-lg' : 'text-xl'))} data-testid="action-verb">
        {verb}
      </span>
      {(detail || hint) && (
        <span className={cx('block max-w-full font-mono font-semibold leading-tight opacity-80', wrap ? cx('line-clamp-2 text-balance', small ? 'text-[10px]' : 'text-xs') : 'truncate text-sm')} data-testid="action-detail">
          {detail ?? hint}
        </span>
      )}
    </Button>
  );
}
