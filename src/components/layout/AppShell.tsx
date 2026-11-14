import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Sidebar + top bar + scrolling content region. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const setQuery = useUiStore((s) => s.setQuery);
  const clearSelection = useUiStore((s) => s.clearSelection);

  // Search text and selection are per-screen; don't let them leak between pages.
  useEffect(() => {
    setQuery('');
    clearSelection();
  }, [pathname, setQuery, clearSelection]);

  return (
    <div className="flex h-full min-h-0 w-full bg-bg text-fg">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[90] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 outline-none 2xl:px-10">
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
