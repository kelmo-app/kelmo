import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, BellOff, Command, HelpCircle, Info, Plus, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { looksLikeUrl } from '@/lib/url';
import { formatRelative } from '@/lib/format';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { SearchInput } from '../SearchInput';
import { ThemeToggle } from '../ThemeToggle';
import { Button, IconButton } from '../ui/Button';
import { MenuItem, MenuPanel, MenuSeparator, Popover } from '../ui/Popover';
import { AboutDialog, ShortcutsDialog } from './HelpDialogs';
import { NAV } from './Sidebar';

/** Routes whose content reacts to the global search field. */
const SEARCHABLE = ['/overview', '/downloads', '/queues', '/library'];

export function pageTitle(pathname: string): string {
  const hit = NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return hit?.label ?? 'KELMO';
}

export function Topbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const query = useUiStore((s) => s.query);
  const setQuery = useUiStore((s) => s.setQuery);
  const focusTick = useUiStore((s) => s.focusSearchTick);
  const openAdd = useUiStore((s) => s.openAddDialog);
  const userName = useSettingsStore((s) => s.settings.userName);
  const inputRef = useRef<HTMLInputElement>(null);
  const [about, setAbout] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const searchable = SEARCHABLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (focusTick > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusTick]);

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    if (looksLikeUrl(q)) {
      setQuery('');
      openAdd(q);
    } else if (!searchable) {
      navigate('/downloads');
    }
  };

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-line bg-bg/60 px-6 backdrop-blur-sm">
      <div className="hidden min-w-[120px] items-center gap-2 text-[13px] text-fg3 xl:flex" aria-hidden>
        <span>KELMO</span>
        <span>/</span>
        <span className="font-medium text-fg2">{pageTitle(pathname)}</span>
      </div>

      <SearchInput
        ref={inputRef}
        label="Search downloads, files, or paste a link"
        placeholder="Search downloads, files, or paste a link…"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        shortcut="Ctrl+K"
        containerClassName="min-w-0 max-w-[620px] flex-1"
        data-testid="global-search"
      />

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="accent-outline" size="md" icon={<Plus size={17} />} onClick={() => openAdd()} data-testid="add-download-button">
          Add Download
        </Button>

        <NotificationsMenu />
        <ThemeToggle />

        <Popover
          role="menu"
          width={248}
          trigger={
            <button
              type="button"
              aria-label="Profile menu"
              className="ml-1 flex h-10 items-center gap-2 rounded-full border border-line bg-surface2 py-1 pl-1 pr-3 text-sm text-fg transition hover:bg-surface3"
            >
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-[13px] font-semibold text-accent">
                {userName.slice(0, 1).toUpperCase() || 'K'}
              </span>
              <span className="hidden max-w-[90px] truncate text-[13px] font-medium lg:block">{userName}</span>
            </button>
          }
        >
          {(close) => (
            <MenuPanel>
              <div className="px-2.5 pb-2 pt-1.5">
                <p className="text-[13px] font-semibold text-fg">{userName}</p>
                <p className="text-xs text-fg3">Local workspace</p>
              </div>
              <MenuSeparator />
              <MenuItem icon={<SettingsIcon size={15} />} label="Settings" hint="Ctrl ," onSelect={() => navigate('/settings')} close={close} />
              <MenuItem icon={<Command size={15} />} label="Keyboard shortcuts" onSelect={() => setShortcuts(true)} close={close} />
              <MenuItem icon={<Info size={15} />} label="About KELMO" onSelect={() => setAbout(true)} close={close} />
              <MenuItem icon={<HelpCircle size={15} />} label="Add a download" hint="Ctrl N" onSelect={() => openAdd()} close={close} />
            </MenuPanel>
          )}
        </Popover>
      </div>

      <AboutDialog open={about} onClose={() => setAbout(false)} />
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
    </header>
  );
}

function NotificationsMenu() {
  const notifications = useUiStore((s) => s.notifications);
  const markAllRead = useUiStore((s) => s.markAllRead);
  const clear = useUiStore((s) => s.clearNotifications);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Popover
      width={360}
      trigger={
        <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} tipPos="bottom" className="relative">
          <Bell size={18} />
          {unread > 0 && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent2 ring-2 ring-bg" />}
        </IconButton>
      }
      onOpenChange={(o) => {
        if (!o && unread > 0) markAllRead();
      }}
    >
      {() => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[13px] font-semibold text-fg">Notifications</p>
            {notifications.length > 0 && (
              <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-fg2 hover:text-fg">
                <Trash2 size={12} aria-hidden /> Clear all
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-9 text-center">
              <BellOff size={22} className="text-fg3" aria-hidden />
              <p className="text-[13px] font-medium text-fg">You’re all caught up</p>
              <p className="text-xs text-fg3">Completed and failed downloads show up here.</p>
            </div>
          ) : (
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.tone === 'success' ? 'bg-ok' : n.tone === 'error' ? 'bg-bad' : n.tone === 'warning' ? 'bg-warn' : 'bg-accent',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-fg">{n.title}</p>
                    {n.description && <p className="break-words text-xs text-fg2">{n.description}</p>}
                    <p className="mt-0.5 text-[11px] text-fg3">{formatRelative(n.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
