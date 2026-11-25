import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** `drawer` slides in from the right (used for the download detail drawer). */
  variant?: 'center' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  /** Don't close on backdrop click (forms with unsaved input). */
  persistent?: boolean;
  /** Visually hide the title row (still announced to screen readers). */
  bare?: boolean;
  testId?: string;
}

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' } as const;

/** Accessible dialog: focus trap, Esc to close, focus restore, aria-modal. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'center',
  size = 'md',
  persistent,
  testId,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const t = window.setTimeout(() => {
      const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node)?.focus();
    }, 0);
    const prevOverflow = document.body.style.overflow;
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const isDrawer = variant === 'drawer';

  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex animate-fade-in', isDrawer ? 'justify-end' : 'items-center justify-center p-4')}
      style={{ background: 'rgb(var(--scrim))' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !persistent) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={onKeyDown}
        className={cn(
          'flex max-h-full flex-col border border-line bg-surface shadow-lift outline-none',
          isDrawer
            ? 'h-full w-full max-w-[440px] animate-slide-in-right rounded-l-xl border-r-0'
            : cn('w-full animate-pop-in rounded-xl', widths[size]),
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-[13px] text-fg2">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" size="sm" onClick={onClose} tipPos="bottom">
            <X size={16} />
          </IconButton>
        </header>
        {children != null && children !== false && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
