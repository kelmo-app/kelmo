import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent-outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-soft',
  'accent-outline': 'border border-accent/60 bg-accent/10 text-accent hover:bg-accent/15 hover:shadow-glow',
  secondary: 'border border-line bg-surface2 text-fg hover:bg-surface3',
  outline: 'border border-line bg-transparent text-fg hover:bg-surface2',
  ghost: 'text-fg2 hover:bg-surface2 hover:text-fg',
  danger: 'bg-bad text-white hover:brightness-110 active:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: icon-only controls must have an accessible name (also shown as a tooltip). */
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger' | 'accent';
  tipPos?: 'top' | 'bottom' | 'right';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', tone = 'default', tipPos = 'top', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-tip={label}
      data-tip-pos={tipPos === 'top' ? undefined : tipPos}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-fg2 transition',
        'hover:bg-surface2 hover:text-fg disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        tone === 'danger' && 'hover:bg-bad/10 hover:text-bad',
        tone === 'accent' && 'text-accent hover:bg-accent/10 hover:text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
