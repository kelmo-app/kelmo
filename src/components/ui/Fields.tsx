import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------------------------------------------------------------- Field */
export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  /** visually hide label but keep it for screen readers */
  srOnlyLabel?: boolean;
}

export function Field({ label, hint, error, htmlFor, children, className, srOnlyLabel }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className={cn('text-[13px] font-medium text-fg', srOnlyLabel && 'sr-only')}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg3">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  'h-9 w-full rounded-md border border-line bg-surface2 px-3 text-sm text-fg placeholder:text-fg3 transition ' +
  'hover:border-fg3/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50 aria-[invalid=true]:border-bad';

/* ------------------------------------------------------------ TextField */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  srOnlyLabel?: boolean;
  fieldClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, srOnlyLabel, fieldClassName, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} srOnlyLabel={srOnlyLabel} className={fieldClassName}>
      <input ref={ref} id={inputId} aria-invalid={error ? true : undefined} className={cn(inputBase, className)} {...rest} />
    </Field>
  );
});

/* ---------------------------------------------------------- NumberField */
export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label: string;
  value: number;
  onValueChange: (n: number) => void;
  hint?: string;
  error?: string;
  suffix?: string;
  fieldClassName?: string;
  srOnlyLabel?: boolean;
}

export function NumberField({ label, value, onValueChange, hint, error, suffix, fieldClassName, srOnlyLabel, id, className, ...rest }: NumberFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={fieldClassName} srOnlyLabel={srOnlyLabel}>
      <div className="relative">
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : ''}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onValueChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className={cn(inputBase, suffix && 'pr-12', className)}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg3">{suffix}</span>}
      </div>
    </Field>
  );
}

/* --------------------------------------------------------------- Select */
export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  onValueChange: (v: T) => void;
  hint?: string;
  error?: string;
  srOnlyLabel?: boolean;
  fieldClassName?: string;
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  hint,
  error,
  srOnlyLabel,
  fieldClassName,
  className,
  id,
  ...rest
}: SelectProps<T>) {
  const auto = useId();
  const selectId = id ?? auto;
  const numeric = typeof options[0]?.value === 'number';
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId} srOnlyLabel={srOnlyLabel} className={fieldClassName}>
      <div className="relative">
        <select
          id={selectId}
          value={String(value)}
          onChange={(e) => onValueChange((numeric ? Number(e.target.value) : e.target.value) as T)}
          className={cn(inputBase, 'appearance-none pr-9', className)}
          {...rest}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg3" aria-hidden />
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------- Textarea */
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const tid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={tid}>
      <textarea ref={ref} id={tid} className={cn(inputBase, 'h-auto min-h-[72px] py-2', className)} {...rest} />
    </Field>
  );
});

/* ------------------------------------------------------------- Checkbox */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: ReactNode;
  description?: string;
  onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({ label, description, onCheckedChange, className, id, ...rest }: CheckboxProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={cid}
        type="checkbox"
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[rgb(var(--accent))]"
        {...rest}
      />
      <label htmlFor={cid} className="cursor-pointer text-sm text-fg">
        {label}
        {description && <span className="mt-0.5 block text-xs text-fg3">{description}</span>}
      </label>
    </div>
  );
}

/* --------------------------------------------------------------- Toggle */
export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Accessible switch. `label` names it for screen readers even when no text is shown. */
export function Toggle({ checked, onChange, label, disabled, size = 'md', className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors disabled:opacity-45',
        size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
        checked ? 'border-accent bg-accent' : 'border-line bg-surface3',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full shadow transition-transform',
          size === 'md' ? 'h-[18px] w-[18px]' : 'h-[14px] w-[14px]',
          checked ? 'bg-accent-fg' : 'bg-fg2',
          checked ? (size === 'md' ? 'translate-x-[22px]' : 'translate-x-[18px]') : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------ Segmented */
export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; ariaLabel?: string }>;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-line bg-surface2 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded px-3 font-medium transition',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
              active ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-fg2 hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- Slider */
export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        <span className="tnum text-[13px] text-fg2">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[rgb(var(--accent))]"
      />
    </div>
  );
}
