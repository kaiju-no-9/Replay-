import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Square, RotateCcw, Ban, GitBranch, Clock } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { AgentIcon } from '../../components/AgentIcon';
import { Terminal } from '../../components/Terminal';
import { useSessionStore } from '../../stores/session-store';
import { useRunStore } from '../../stores/run-store';

export const LiveRunView: React.FC<{ runId: string }> = ({ runId }) => {
  const queryClient = useQueryClient();
  const { selectedDispatchId, setSelectedDispatchId } = useSessionStore();
  const { setViewMode } = useRunStore();
  const [elapsed, setElapsed] = useState(0);

  const { data: runData, refetch } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => apiFetch(`/api/v1/runs/${runId}`),
    refetchInterval: 2000,
  });

  const dispatches: any[] = runData?.dispatches ?? [];
  const run = runData?.run;

  useEffect(() => {
    if (!selectedDispatchId && dispatches.length > 0) {
      setSelectedDispatchId(dispatches[0].id);
    }
  }, [dispatches, selectedDispatchId, setSelectedDispatchId]);

  useEffect(() => {
    if (run?.status === 'running' || run?.status === 'queued') {
      const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [run?.status]);

  const stopMutation = useMutation({
    mutationFn: (dispatchId: string) =>
      apiFetch(`/api/v1/dispatches/${dispatchId}/stop`, { method: 'POST' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (dispatchId: string) =>
      apiFetch(`/api/v1/dispatches/${dispatchId}/retry`, { method: 'POST' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const cancelRunMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/runs/${runId}/cancel`, { method: 'POST' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  if (!runData) {
    return <div className="p-8 text-center text-slate-400">Loading run…</div>;
  }

  const selectedDispatch = dispatches.find((d) => d.id === selectedDispatchId) ?? dispatches[0];
  const runFinished = ['completed', 'failed', 'partial', 'cancelled'].includes(run?.status);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Run header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white truncate max-w-md">{run?.title}</h1>
          <StatusBadge status={run?.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {elapsed}s
          </span>
          {runFinished && (
            <button
              onClick={() => setViewMode('comparison')}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition"
            >
              Open Scorecard
            </button>
          )}
          {!runFinished && (
            <button
              onClick={() => cancelRunMutation.mutate()}
              disabled={cancelRunMutation.isPending}
              className="px-3 py-2 bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-sm font-medium rounded-lg transition flex items-center gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancel Run
            </button>
          )}
        </div>
      </div>

      {/* Dispatch tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dispatches.map((d) => {
          const isSelected = selectedDispatch?.id === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setSelectedDispatchId(d.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm transition shrink-0 ${
                isSelected
                  ? 'border-sky-500 bg-sky-950/40 text-white'
                  : 'border-[#334155] bg-[#0f172a] text-slate-300 hover:border-slate-500'
              }`}
            >
              <AgentIcon agentId={d.agentId} />
              <span className="capitalize font-medium">{d.agentId}</span>
              <span className="text-xs text-slate-500">#{d.attemptNumber}</span>
              <StatusBadge status={d.status} size="sm" />
            </button>
          );
        })}
      </div>

      {/* Selected dispatch panel */}
      {selectedDispatch && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e293b] bg-[#182234]">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <code>{selectedDispatch.branchName ?? `relay/…/${selectedDispatch.agentId}-${selectedDispatch.attemptNumber}`}</code>
              </span>
              {selectedDispatch.exitCode !== null && (
                <span className="font-mono">exit {selectedDispatch.exitCode}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {['running', 'waiting_input', 'starting'].includes(selectedDispatch.status) && (
                <button
                  onClick={() => stopMutation.mutate(selectedDispatch.id)}
                  disabled={stopMutation.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-rose-900/50 hover:bg-rose-800 text-rose-200 rounded transition"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              )}
              {['succeeded', 'failed', 'cancelled', 'timed_out', 'lost'].includes(selectedDispatch.status) && (
                <button
                  onClick={() => retryMutation.mutate(selectedDispatch.id)}
                  disabled={retryMutation.isPending}
                  title="Retry in a fresh worktree (new attempt)"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-sky-900/50 hover:bg-sky-800 text-sky-200 rounded transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry (fresh worktree)
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <Terminal dispatchId={selectedDispatch.id} onExit={() => refetch()} />
          </div>
        </div>
      )}
    </div>
  );
};
