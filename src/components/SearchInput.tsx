import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (v: string) => void;
  /** Name for screen readers (the placeholder is not a label). */
  label: string;
  shortcut?: string;
  containerClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, label, shortcut, containerClassName, className, onKeyDown, ...rest },
  ref,
) {
  return (
    <div role="search" className={cn('relative', containerClassName)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg3" aria-hidden />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onValueChange('');
          }
          onKeyDown?.(e);
        }}
        className={cn(
          'h-10 w-full rounded-lg border border-line bg-surface2 pl-9 text-sm text-fg placeholder:text-fg3 transition',
          'hover:border-fg3/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
          '[&::-webkit-search-cancel-button]:hidden',
          shortcut || value ? 'pr-20' : 'pr-3',
          className,
        )}
        {...rest}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onValueChange('')}
            className="flex h-6 w-6 items-center justify-center rounded text-fg3 hover:bg-surface3 hover:text-fg"
          >
            <X size={14} />
          </button>
        )}
        {shortcut && !value && (
          <span className="pointer-events-none hidden items-center gap-1 sm:flex" aria-hidden>
            {shortcut.split('+').map((k) => (
              <kbd key={k} className="kbd">
                {k}
              </kbd>
            ))}
          </span>
        )}
      </div>
    </div>
  );
});
