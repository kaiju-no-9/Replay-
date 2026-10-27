import React, { useState } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useRunStore } from '../stores/run-store';

type Theme = 'light' | 'dark';

export const Layout: React.FC<{ children: React.ReactNode; rightInspector?: React.ReactNode }> = ({
  children,
  rightInspector,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  );

  const { isConnected, isReconnecting, runtimeVersion } = useConnectionStore();
  const { viewMode, setViewMode, activeRunId } = useRunStore();

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('relay-theme', next);
    setTheme(next);
  };

  const navItem = (
    mode: typeof viewMode,
    icon: React.ReactNode,
    label: string,
    disabled?: boolean,
    disabledReason?: string
  ) => (
    <button
      key={mode}
      type="button"
      onClick={() => !disabled && setViewMode(mode)}
      disabled={disabled}
      title={disabled ? disabledReason : sidebarCollapsed ? label : undefined}
      aria-current={viewMode === mode ? 'page' : undefined}
      className="relay-nav-item w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors"
    >
      {icon}
      {!sidebarCollapsed && <span>{label}</span>}
    </button>
  );

  return (
    <div className="relay-shell flex h-screen w-screen overflow-hidden">
      <aside className={`relay-sidebar z-20 flex flex-col border-r transition-[width] duration-200 ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
        <div className="flex h-14 items-center justify-between border-b border-inherit px-4">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="relay-brand-mark flex h-6 w-6 items-center justify-center text-xs font-bold">R</div>
              <span className="text-sm font-semibold tracking-tight">Relay</span>
            </div>
          )}
          <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="relay-control" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <i aria-hidden="true" className={`relay-icon hn ${sidebarCollapsed ? 'hn-arrow-right' : 'hn-arrow-left'}`} />
          </button>
        </div>

        {!sidebarCollapsed && <p className="relay-kicker px-4 pb-2 pt-5">WORKSPACE</p>}
        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-2">
          {navItem('workspace', <i aria-hidden="true" className="relay-icon hn hn-folder" />, 'Workspace')}
          {navItem('investigate', <i aria-hidden="true" className="relay-icon hn hn-search" />, 'Investigate')}
          {navItem('fix', <i aria-hidden="true" className="relay-icon hn hn-shield" />, 'Incident Fix')}
          {navItem('live', <i aria-hidden="true" className="relay-icon hn hn-play" />, 'Live Run', !activeRunId, 'No active run')}
          {navItem('comparison', <i aria-hidden="true" className="relay-icon hn hn-check-circle" />, 'Scorecard', !activeRunId, 'No run to compare')}
          {navItem('agents', <i aria-hidden="true" className="relay-icon hn hn-people-carry" />, 'Agents')}
        </nav>

        <div className="border-t border-inherit p-3">
          <div className="flex min-h-8 items-center gap-2 text-xs" title={isConnected ? `Runtime v${runtimeVersion || '0.1.0'}` : isReconnecting ? 'Reconnecting' : 'Offline'}>
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? 'bg-emerald-600' : isReconnecting ? 'bg-amber-500' : 'bg-rose-600'}`} />
            {!sidebarCollapsed && <span className="truncate text-[var(--ds-text-muted)]">{isConnected ? `Runtime v${runtimeVersion || '0.1.0'}` : isReconnecting ? 'Reconnecting…' : 'Offline'}</span>}
          </div>
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col items-start gap-1 px-4 pb-3">
            <a className="relay-attribution" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Pixel icons by HackerNoon · CC BY 4.0</a>
            <a className="relay-attribution" href="https://github.com/lobehub/lobe-icons" target="_blank" rel="noreferrer">Provider logos by LobeHub</a>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relay-header flex h-14 shrink-0 items-center justify-between border-b px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <i aria-hidden="true" className="relay-icon hn hn-folder" />
            <span className="truncate font-medium">Relay Cockpit</span>
            <span className="relay-kicker hidden sm:inline">/ {viewMode === 'comparison' ? 'SCORECARD' : viewMode.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            {activeRunId && <span className="relay-kicker hidden border border-[var(--ds-border)] px-2 py-1 sm:inline">RUN {activeRunId.slice(0, 8)}</span>}
            <button type="button" className="relay-control" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
              <i aria-hidden="true" className={`relay-icon hn ${theme === 'light' ? 'hn-moon' : 'hn-sun'}`} />
            </button>
            {rightInspector && (
              <button type="button" onClick={() => setInspectorCollapsed(!inspectorCollapsed)} className="relay-control" aria-label={inspectorCollapsed ? 'Show details inspector' : 'Hide details inspector'} aria-expanded={!inspectorCollapsed}>
                <i aria-hidden="true" className="relay-icon hn hn-chart-line" />
              </button>
            )}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="relay-main min-w-0 flex-1 overflow-auto p-5 sm:p-8">{children}</main>
          {rightInspector && !inspectorCollapsed && <aside className="relay-inspector w-80 shrink-0 overflow-y-auto border-l p-4">{rightInspector}</aside>}
        </div>
      </div>
    </div>
  );
};
