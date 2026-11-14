import { useRef, type KeyboardEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Download, FolderOpen, Layers, LayoutDashboard, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { APP_VERSION } from '@/data/defaults';
import { formatMBps } from '@/lib/format';
import { useSettingsStore } from '@/store/settingsStore';
import { useTotals } from '@/hooks/useDownloadData';
import { useMediaQuery, useOnline } from '@/hooks/useBrowser';
import { Wordmark } from '../Common';
import { ThemeSwitcher } from '../ThemeToggle';
import { ModeSwitch } from '../ModeSwitch';
import { IconButton } from '../ui/Button';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'active';
}

/** Overview and Library only exist in the Advanced interface. */
export const ADVANCED_ONLY = ['/overview', '/library'];

export const NAV: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/downloads', label: 'Downloads', icon: Download, badge: 'active' },
  { to: '/queues', label: 'Queues', icon: Layers },
  { to: '/scheduler', label: 'Scheduler', icon: CalendarClock },
  { to: '/library', label: 'Library', icon: FolderOpen },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  const collapsedSetting = useSettingsStore((s) => s.settings.sidebarCollapsed);
  const update = useSettingsStore((s) => s.update);
  const userName = useSettingsStore((s) => s.settings.userName);
  const uiMode = useSettingsStore((s) => s.settings.uiMode);
  const narrow = useMediaQuery('(max-width: 1199px)');
  const collapsed = collapsedSetting || narrow;
  const totals = useTotals();
  const online = useOnline();
  const navRef = useRef<HTMLElement>(null);

  // Roving arrow-key navigation between links.
  const onNavKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const links = Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  };

  return (
    <aside
      aria-label="Primary"
      className={cn(
        'relative flex shrink-0 flex-col border-r border-line bg-surface/80 transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <div className={cn('flex items-center pb-5 pt-6', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
        <Wordmark collapsed={collapsed} />
      </div>

      <nav ref={navRef} aria-label="Main navigation" onKeyDown={onNavKey} className={cn('flex flex-col gap-1', collapsed ? 'px-3' : 'px-3.5')}>
        {NAV.filter((n) => uiMode === 'advanced' || !ADVANCED_ONLY.includes(n.to)).map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={false}
            data-tip={collapsed ? label : undefined}
            data-tip-pos="right"
            aria-label={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex h-11 items-center rounded-lg text-[14px] font-medium transition',
                collapsed ? 'justify-center' : 'gap-3.5 px-3.5',
                isActive ? 'bg-accent/12 text-accent' : 'text-fg2 hover:bg-surface2 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute -left-[14px] top-2 h-7 w-[3px] rounded-r bg-accent" />}
                <Icon size={20} strokeWidth={1.8} aria-hidden />
                {!collapsed && <span className="flex-1">{label}</span>}
                {badge === 'active' && totals.active > 0 && (
                  <span
                    className={cn('tnum rounded-full bg-accent/20 px-1.5 text-[11px] font-semibold text-accent', collapsed && 'absolute right-1.5 top-1.5 px-1')}
                    aria-label={`${totals.active} active`}
                  >
                    {totals.active}
                  </span>
                )}
                {isActive && <span className="sr-only">(current page)</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 p-3.5">
        {/* connection + activity */}
        <div
          className={cn('rounded-lg border border-line bg-surface2/60', collapsed ? 'flex flex-col items-center gap-1 px-1 py-2.5' : 'px-3.5 py-3')}
          role="status"
          aria-label={`${online ? 'System online' : 'Offline'}, ${totals.active} active downloads`}
        >
          <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col gap-1')}>
            <span className="relative flex h-2.5 w-2.5">
              {online && totals.active > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok/60" />}
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', online ? 'bg-ok' : 'bg-bad')} />
            </span>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="text-[13px] font-medium text-fg">{online ? 'System Online' : 'Offline'}</p>
                <p className="truncate text-[11px] text-fg3">
                  {online ? (totals.active > 0 ? `${totals.active} active · ${formatMBps(totals.speed)}` : 'All services operational') : 'Check your connection'}
                </p>
              </div>
            )}
          </div>
          {collapsed && (
            <span className="tnum text-[10px] text-fg3" aria-hidden>
              {totals.active}↓
            </span>
          )}
        </div>

        <div className={cn('flex', collapsed ? 'justify-center' : 'justify-start')}>
          <ModeSwitch collapsed={collapsed} />
        </div>

        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
          {collapsed ? <ThemeSwitcher className="[&>button]:px-1.5" size="sm" /> : <ThemeSwitcher />}
          {!narrow && (
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              tipPos={collapsed ? 'right' : 'top'}
              onClick={() => update({ sidebarCollapsed: !collapsedSetting })}
              aria-pressed={collapsedSetting}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </IconButton>
          )}
        </div>

        <div className={cn('flex items-center border-t border-line pt-3', collapsed ? 'justify-center' : 'gap-3')}>
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[13px] font-semibold text-accent">
            {userName.slice(0, 1).toUpperCase() || 'K'}
          </span>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium text-fg">{userName || 'KELMO user'}</p>
              <p className="tnum text-[11px] text-fg3">v{APP_VERSION} · GPLv3</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
