import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastViewport } from '@/components/ToastNotification';
import { AddDownloadDialog } from '@/features/downloads/AddDownloadDialog';
import { DetailDrawer } from '@/features/downloads/DetailDrawer';
import { useEngineLoop } from '@/hooks/useEngineLoop';
import { useLinkDrop } from '@/hooks/useLinkDrop';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useThemeEffect } from '@/hooks/useTheme';
import DownloadsPage from '@/pages/DownloadsPage';
import LibraryPage from '@/pages/LibraryPage';
import OverviewPage from '@/pages/OverviewPage';
import QueuesPage from '@/pages/QueuesPage';
import SchedulerPage from '@/pages/SchedulerPage';
import SettingsPage from '@/pages/SettingsPage';
import SimpleHome from '@/pages/SimpleHome';
import { SetupWizard } from '@/features/setup/SetupWizard';
import { useSettingsStore } from '@/store/settingsStore';

/** Root: global effects, routes and the overlays shared by every screen. */
export function App() {
  useThemeEffect();
  useEngineLoop();
  useShortcuts();
  const dragging = useLinkDrop();
  const { pathname } = useLocation();
  const mode = useSettingsStore((s) => s.settings.uiMode);
  const setupDone = useSettingsStore((s) => s.settings.setupDone);
  const home = mode === 'simple' ? '/downloads' : '/overview';
  // Simple mode: the downloads screen is the whole window (no sidebar, no top bar)
  const simpleHome = mode === 'simple' && pathname === '/downloads';

  return (
    <>
      {simpleHome ? (
        <ErrorBoundary resetKey={mode}>
          <SimpleHome />
        </ErrorBoundary>
      ) : (
      <AppShell>
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<Navigate to={home} replace />} />
            <Route path="/overview" element={mode === 'simple' ? <Navigate to={home} replace /> : <OverviewPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/queues" element={<QueuesPage />} />
            <Route path="/queues/:queueId" element={<QueuesPage />} />
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/library" element={mode === 'simple' ? <Navigate to={home} replace /> : <LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </ErrorBoundary>
      </AppShell>
      )}
      {dragging && setupDone && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-bg/70 backdrop-blur-sm" aria-hidden>
          <div className="rounded-2xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-glow">
            <p className="text-[18px] font-semibold text-accent">Drop the link to download it</p>
            <p className="mt-1 text-[13px] text-fg3">KDM opens the Add download window</p>
          </div>
        </div>
      )}
      {!setupDone && <SetupWizard />}
      <AddDownloadDialog />
      <DetailDrawer />
      <ConfirmDialog />
      <ToastViewport />
    </>
  );
}
