import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, FileDiff } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';
import { AgentIcon } from '../../components/AgentIcon';
import { useRunStore } from '../../stores/run-store';

export const ComparisonView: React.FC<{ runId: string }> = ({ runId }) => {
  const queryClient = useQueryClient();
  const { openDiff } = useRunStore();

  const { data: scorecard, isLoading } = useQuery({
    queryKey: ['scorecard', runId],
    queryFn: () => apiFetch(`/api/v1/runs/${runId}/scorecard`),
    refetchInterval: 3000,
  });

  const validateMutation = useMutation({
    mutationFn: ({ dispatchId, profileId }: { dispatchId: string; profileId: string }) =>
      apiFetch(`/api/v1/dispatches/${dispatchId}/validate`, {
        method: 'POST',
        body: JSON.stringify({ profileId }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard', runId] });
    },
  });

  const selectMutation = useMutation({
    mutationFn: (dispatchId: string) =>
      apiFetch(`/api/v1/runs/${runId}/select-candidate`, {
        method: 'POST',
        body: JSON.stringify({ dispatchId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard', runId] });
    },
  });

  if (isLoading) return <div className="p-8 text-center text-slate-400">Generating scorecard...</div>;
  if (!scorecard) return <div className="p-8 text-center text-rose-400">Scorecard unavailable.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Race to Green Scorecard</h1>
          <p className="text-sm text-slate-400">
            Validation profile:{' '}
            <span className="text-sky-400">{scorecard.validationProfileName || 'None'}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {scorecard.candidates.map((candidate: any) => (
          <div
            key={candidate.dispatchId}
            className={`flex flex-col bg-[#0f172a] border rounded-xl overflow-hidden transition ${
              candidate.isSelected ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-[#1e293b]'
            }`}
          >
            <div className="p-4 border-b border-[#1e293b] flex items-center justify-between bg-[#182234]">
              <div className="flex items-center gap-2.5">
                <AgentIcon agentId={candidate.agentId} className="w-5 h-5" />
                <span className="font-semibold text-white capitalize">{candidate.agentId}</span>
                <span className="text-xs text-slate-500">attempt {candidate.attemptNumber}</span>
              </div>
              <StatusBadge status={candidate.derivedLabel} />
            </div>

            <div className="p-5 flex-1 space-y-4 text-sm">
              {/* Process outcome */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Agent process:</span>
                <StatusBadge status={candidate.processStatus} size="sm" />
              </div>

              {/* Diff stats */}
              <div className="flex items-center justify-between p-2.5 bg-[#090d16] rounded-lg border border-[#1e293b]">
                <span className="text-xs text-slate-400">Diff Stats:</span>
                <span className="text-xs font-mono font-medium">
                  <span className="text-emerald-400">+{candidate.diffStats.additions}</span>{' '}
                  <span className="text-rose-400">-{candidate.diffStats.deletions}</span> in{' '}
                  {candidate.diffStats.filesChanged} files
                </span>
              </div>

              {/* Validation results */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Validation ({candidate.validationResults.length})
                  </p>
                  {candidate.validationResults.length === 0 && scorecard.validationProfileId && (
                    <button
                      onClick={() =>
                        validateMutation.mutate({
                          dispatchId: candidate.dispatchId,
                          profileId: scorecard.validationProfileId,
                        })
                      }
                      disabled={validateMutation.isPending}
                      className="text-xs px-2 py-1 bg-sky-900/50 hover:bg-sky-800 text-sky-200 rounded transition"
                    >
                      Run validation
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {candidate.validationResults.map((vr: any) => (
                    <div
                      key={vr.id}
                      className="flex items-center justify-between text-xs p-2 bg-[#182234] rounded border border-[#334155]"
                      title={vr.stderr || vr.stdout}
                    >
                      <span className="font-medium text-slate-200">{vr.commandLabel}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono">{vr.durationMs}ms</span>
                        <StatusBadge status={vr.status} size="sm" />
                      </div>
                    </div>
                  ))}
                  {candidate.validationResults.length === 0 && (
                    <p className="text-xs text-slate-500 italic">No validation results recorded.</p>
                  )}
                </div>
              </div>

              {/* Untrusted agent summary */}
              <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Agent Self-Report (Untrusted Evidence)</span>
                </div>
                <p className="text-xs text-slate-300 italic leading-relaxed">
                  "{candidate.agentSummary.text}"
                </p>
              </div>

              <p className="text-xs text-slate-500">{candidate.labelReason}</p>
            </div>

            <div className="p-4 border-t border-[#1e293b] bg-[#182234] flex gap-2">
              <button
                onClick={() => openDiff(candidate.dispatchId)}
                className="flex-1 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#1e293b] hover:bg-[#26354a] rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <FileDiff className="w-3.5 h-3.5" />
                View Diff
              </button>
              <button
                onClick={() => selectMutation.mutate(candidate.dispatchId)}
                disabled={candidate.isSelected || selectMutation.isPending}
                className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                  candidate.isSelected
                    ? 'bg-purple-900/60 text-purple-200 border border-purple-500 font-semibold cursor-default'
                    : 'bg-sky-600 hover:bg-sky-700 text-white'
                }`}
              >
                {candidate.isSelected ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Selected
                  </>
                ) : (
                  'Keep Candidate'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
