import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Select, type SelectOption } from './ui/Fields';

/** Row that hosts filter controls with consistent spacing. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label="Filters" className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
    </div>
  );
}

/** Compact labelled select used inside a FilterBar. */
export function FilterSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return <Select label={label} value={value} options={options} onValueChange={onChange} fieldClassName={cn('min-w-[150px]', className)} />;
}
