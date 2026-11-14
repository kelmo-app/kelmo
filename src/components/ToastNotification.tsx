import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import type { Toast, ToastTone } from '@/types';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/store/uiStore';

const TONES: Record<ToastTone, { icon: LucideIcon; cls: string; label: string }> = {
  success: { icon: CheckCircle2, cls: 'text-ok', label: 'Success' },
  info: { icon: Info, cls: 'text-accent', label: 'Info' },
  warning: { icon: AlertTriangle, cls: 'text-warn', label: 'Warning' },
  error: { icon: XCircle, cls: 'text-bad', label: 'Error' },
};

export function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, cls, label } = TONES[toast.tone];
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] animate-pop-in items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-lift"
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-fg">
          <span className="sr-only">{label}: </span>
          {toast.title}
        </p>
        {toast.description && <p className="mt-0.5 break-words text-xs text-fg2">{toast.description}</p>}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.run();
              onDismiss();
            }}
            className="mt-1.5 text-xs font-semibold text-accent hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss} className="rounded p-0.5 text-fg3 hover:bg-surface2 hover:text-fg">
        <X size={14} />
      </button>
    </div>
  );
}

/** Fixed viewport in the bottom-right corner. */
export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div aria-live="polite" aria-label="Notifications" className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <ToastNotification key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
