import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionStore } from '../stores/connection-store';
import { useRunStore } from '../stores/run-store';
import { TokenGate } from '../features/setup/TokenGate';
import { Layout } from './Layout';
import { WorkspaceScreen } from '../features/workspace/WorkspaceScreen';
import { LiveRunView } from '../features/runs/LiveRunView';
import { ComparisonView } from '../features/comparison/ComparisonView';
import { DiffViewer } from '../features/diffs/DiffViewer';
import { AgentDiagnosticsPage } from '../features/agents/AgentDiagnosticsPage';
import { wsUrl } from '../lib/api';
import { FixWorkflowPanel } from '../features/fix/FixWorkflowPanel';
import { InvestigationPanel } from '../features/investigation/InvestigationPanel';

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const { isConnected, token } = useConnectionStore();
  const { viewMode, activeRunId, diffDispatchId } = useRunStore();

  // Restore run from URL query param after browser refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runId = params.get('run');
    if (runId && !activeRunId) {
      useRunStore.getState().setActiveRunId(runId);
    }
  }, []);

  // Persist active run in URL so refresh restores it
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeRunId) {
      url.searchParams.set('run', activeRunId);
    } else {
      url.searchParams.delete('run');
    }
    window.history.replaceState({}, '', url.toString());
  }, [activeRunId]);

  // Global WS listener for cache reconciliation
  useEffect(() => {
    if (!isConnected || !token) return;

    const ws = new WebSocket(wsUrl(token));
    ws.onopen=()=>{const after=Number(sessionStorage.getItem('relay-event-cursor')||'0');ws.send(JSON.stringify({type:'subscribe_events',after}));};
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if(msg.type==='event.snapshot'){
          sessionStorage.setItem('relay-event-cursor',String(msg.cursor));
          if(msg.hasMore)ws.send(JSON.stringify({type:'subscribe_events',after:msg.cursor}));
          queryClient.invalidateQueries({queryKey:['fix']});
        } else if (msg.type === 'dispatch.status' || msg.type === 'run.status') {
          if (activeRunId) {
            queryClient.invalidateQueries({ queryKey: ['run', activeRunId] });
            queryClient.invalidateQueries({ queryKey: ['scorecard', activeRunId] });
          }
        } else if (msg.type === 'validation.command.finished') {
          queryClient.invalidateQueries({ queryKey: ['scorecard', activeRunId] });
        } else if(typeof msg.type==='string'&&msg.type.startsWith('fix.')){
          queryClient.invalidateQueries({queryKey:['fix']});
        }
      } catch {
        // Ignore malformed frames
      }
    };

    return () => ws.close();
  }, [isConnected, token, activeRunId, queryClient]);

  if (!isConnected) {
    return <TokenGate />;
  }

  let content: React.ReactNode;
  switch (viewMode) {
    case 'live':
      content = activeRunId ? <LiveRunView runId={activeRunId} /> : <WorkspaceScreen />;
      break;
    case 'comparison':
      content = activeRunId ? <ComparisonView runId={activeRunId} /> : <WorkspaceScreen />;
      break;
    case 'diff':
      content = diffDispatchId ? <DiffViewer dispatchId={diffDispatchId} /> : <WorkspaceScreen />;
      break;
    case 'agents':
      content = <AgentDiagnosticsPage />;
      break;
    case 'fix':
      content = <FixWorkflowPanel />;
      break;
    case 'investigate':
      content = <InvestigationPanel />;
      break;
    case 'workspace':
    default:
      content = <WorkspaceScreen />;
  }

  return <Layout>{content}</Layout>;
};
