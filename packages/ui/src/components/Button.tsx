import type { ButtonHTMLAttributes } from 'react';
import { cx } from './tokens';

type Variant = 'holo' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  holo: 'bg-holo text-on-holo shadow-glow hover:bg-holo-strong',
  outline: 'border border-holo-line bg-holo-soft text-ink hover:border-holo',
  ghost: 'text-ink-2 hover:bg-holo-soft hover:text-ink',
  danger: 'border border-alert bg-alert-bg text-alert-ink hover:shadow-glow-alert',
};

const SIZE: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-5 text-base',
  xl: 'h-20 px-6 text-2xl',
};

/** Buttons are at least 44px tall: they are pressed by thumbs, sometimes in a hurry. */
export function Button({ variant = 'holo', size = 'lg', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-control font-display font-semibold transition-[background,box-shadow,border-color] disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
