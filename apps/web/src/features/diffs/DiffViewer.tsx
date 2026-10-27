import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDiff, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useRunStore } from '../../stores/run-store';

/**
 * Unified git diff viewer with add/del syntax highlighting.
 */
export const DiffViewer: React.FC<{ dispatchId: string }> = ({ dispatchId }) => {
  const { setViewMode } = useRunStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: diff, isLoading } = useQuery({
    queryKey: ['dispatch-diff', dispatchId],
    queryFn: () => apiFetch(`/api/v1/dispatches/${dispatchId}/diff`),
  });

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading diff…</div>;
  if (!diff) return <div className="p-8 text-center text-rose-400">Diff unavailable.</div>;

  const files: Array<{ path: string; status: string }> = diff.changedFiles ?? [];

  // Split the unified diff into per-file hunks
  const diffByFile: Record<string, string[]> = {};
  let currentFile = '(all changes)';
  diffByFile[currentFile] = [];
  for (const line of (diff.diffContent ?? '').split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match?.[1] ?? line;
      diffByFile[currentFile] = [line];
    } else {
      (diffByFile[currentFile] ??= []).push(line);
    }
  }

  const visibleLines = selectedFile
    ? (diffByFile[selectedFile] ?? [])
    : (diff.diffContent ?? '').split('\n');

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewMode('comparison')}
          className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Scorecard
        </button>
        <span className="text-xs font-mono text-slate-400">
          <span className="text-emerald-400">+{diff.totalAdditions}</span>{' '}
          <span className="text-rose-400">-{diff.totalDeletions}</span>
          {diff.isTruncated && <span className="ml-2 text-amber-400">(truncated at 500KB)</span>}
        </span>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* File list */}
        <div className="w-64 shrink-0 bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-y-auto">
          <div className="p-3 border-b border-[#1e293b] text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Changed Files ({files.length})
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className={`w-full text-left px-3 py-2 text-xs transition ${selectedFile === null ? 'bg-sky-950/50 text-sky-300' : 'text-slate-400 hover:bg-[#182234]'}`}
          >
            (all changes)
          </button>
          {Object.keys(diffByFile)
            .filter((f) => f !== '(all changes)')
            .map((file) => (
              <button
                key={file}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-3 py-2 text-xs font-mono truncate transition ${
                  selectedFile === file ? 'bg-sky-950/50 text-sky-300' : 'text-slate-400 hover:bg-[#182234]'
                }`}
                title={file}
              >
                {file}
              </button>
            ))}
        </div>

        {/* Diff content */}
        <div className="flex-1 bg-[#090d16] border border-[#1e293b] rounded-xl overflow-auto p-4">
          {visibleLines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
              <FileDiff className="w-8 h-8" />
              <p className="text-sm">No changes detected in this candidate's worktree.</p>
            </div>
          ) : (
            <pre className="text-xs font-mono leading-relaxed">
              {visibleLines.map((line: string, i: number) => {
                let cls = 'text-slate-400';
                if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-emerald-300 bg-emerald-950/30';
                else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-rose-300 bg-rose-950/30';
                else if (line.startsWith('@@')) cls = 'text-sky-400';
                else if (line.startsWith('diff --git') || line.startsWith('index')) cls = 'text-slate-500';
                return (
                  <div key={i} className={`${cls} px-1 whitespace-pre-wrap break-all`}>
                    {line || ' '}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
