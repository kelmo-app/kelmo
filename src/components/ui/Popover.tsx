import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

interface TriggerProps {
  onClick?: (e: React.MouseEvent) => void;
  'aria-haspopup'?: string;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  ref?: React.Ref<HTMLElement>;
}

export interface PopoverProps {
  trigger: ReactElement<TriggerProps>;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  role?: 'menu' | 'dialog';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  width?: number;
}

/**
 * Anchored popover rendered in a portal with fixed positioning, so it never
 * gets clipped by scrolling tables or overflow-hidden cards.
 */
export function Popover({ trigger, children, align = 'end', className, role = 'dialog', open: controlled, onOpenChange, width }: PopoverProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = useCallback(
    (v: boolean) => {
      if (controlled === undefined) setInner(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange],
  );
  const anchor = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const a = anchor.current!.getBoundingClientRect();
      const p = panel.current?.getBoundingClientRect();
      const w = width ?? p?.width ?? 220;
      const h = p?.height ?? 200;
      let left = align === 'end' ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = a.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6);
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        anchor.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (open && role === 'menu') {
      const first = panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
      first?.focus();
    }
  }, [open, role, pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isValidElement(trigger)) return null;
  const el = cloneElement(trigger, {
    ref: (node: HTMLElement | null) => {
      anchor.current = node;
    },
    'aria-haspopup': role === 'menu' ? 'menu' : 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e);
      setOpen(!open);
    },
  });

  return (
    <>
      {el}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role={role}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, zIndex: 60 }}
            className={cn('animate-pop-in rounded-lg border border-line bg-surface shadow-lift', className)}
            onKeyDown={(e) => {
              if (role !== 'menu') return;
              const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
              const i = items.indexOf(document.activeElement as HTMLElement);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                items[(i + 1) % items.length]?.focus();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                items[(i - 1 + items.length) % items.length]?.focus();
              } else if (e.key === 'Tab') {
                setOpen(false);
              }
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  hint?: string;
  close: () => void;
}

export function MenuItem({ icon, label, onSelect, tone = 'default', disabled, hint, close }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition disabled:opacity-40',
        tone === 'danger' ? 'text-bad hover:bg-bad/10' : 'text-fg hover:bg-surface2',
      )}
    >
      {icon && <span className="shrink-0 text-fg3">{icon}</span>}
      <span className="flex-1">{label}</span>
      {hint && <span className="kbd">{hint}</span>}
    </button>
  );
}

export function MenuPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-[200px] p-1.5', className)}>{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
