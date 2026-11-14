import { createContext, useContext, type ReactNode } from 'react';

/** The text typed in the Settings search box. Rows that don't match hide themselves. */
export const SettingsQueryContext = createContext('');

/** One labelled setting: text on the left, control on the right. */
export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const q = useContext(SettingsQueryContext);
  if (q && !`${title} ${description ?? ''}`.toLowerCase().includes(q)) return null;
  return (
    <div data-row className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-5 py-4 first:border-t-0">
      <div className="min-w-[220px] flex-1">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        {description && <p className="mt-0.5 max-w-xl text-[13px] text-fg3">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
