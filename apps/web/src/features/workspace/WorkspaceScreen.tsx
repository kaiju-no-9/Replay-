import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Play, Check } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { AgentIcon } from '../../components/AgentIcon';
import { useRunStore } from '../../stores/run-store';
import { ProjectPicker } from '../projects/ProjectPicker';
import { useProjectStore } from '../../stores/project-store';
import Card from '../../components/ascii/card';
import Button from '../../components/ascii/button';

export const WorkspaceScreen: React.FC = () => {
  const { selectedProjectId } = useProjectStore();
  const [prompt, setPrompt] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [concurrency, setConcurrency] = useState(3);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const { setActiveRunId } = useRunStore();

  const { data: agents } = useQuery<any[]>({
    queryKey: ['agents'],
    queryFn: () => apiFetch('/api/v1/agents'),
  });

  const { data: profiles } = useQuery<any[]>({
    queryKey: ['validation-profiles', selectedProjectId],
    queryFn: () => apiFetch(`/api/v1/projects/${selectedProjectId}/validation-profiles`),
    enabled: !!selectedProjectId,
  });

  const launchMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/runs', {
        method: 'POST',
        body: JSON.stringify({
          projectId: selectedProjectId,
          objective: prompt,
          agentIds: selectedAgents,
          validationProfileId: selectedProfileId || null,
          concurrencyLimit: concurrency,
        }),
      }),
    onSuccess: (data: any) => {
      setLaunchError(null);
      setActiveRunId(data.run.id);
    },
    onError: (err: any) => {
      setLaunchError(err.message);
    },
  });

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]
    );
  };

  const canLaunch =
    !!selectedProjectId && prompt.trim().length > 0 && selectedAgents.length > 0 && !launchMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ProjectPicker />

      {selectedProjectId && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-white">Start "Race to Green"</h1>
            <p className="text-sm text-slate-400">
              Dispatch the same coding prompt to multiple agents in isolated Git worktrees.
            </p>
          </div>

          <Card pattern="none" className="p-5 space-y-2">
            <label className="block text-sm font-semibold text-slate-200">Coding Task Prompt</label>
            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Fix the off-by-one error in calculateDiscount() and ensure tests in test.js pass cleanly."
              className="w-full bg-[#182234] border border-[#334155] rounded-lg p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
            />
          </Card>

          <Card pattern="none" className="p-5 space-y-3">
            <label className="block text-sm font-semibold text-slate-200">Select Competing Agents</label>
            <div className="grid grid-cols-2 gap-3">
              {agents?.map((agent) => {
                const isSelected = selectedAgents.includes(agent.agentId);
                return (
                  <Button
                    key={agent.agentId}
                    type="button"
                    variant="ghost"
                    onClick={() => agent.installed && toggleAgent(agent.agentId)}
                    disabled={!agent.installed}
                    className={`flex items-center justify-between p-3.5 text-left border transition ${
                      !agent.installed
                        ? 'opacity-40 cursor-not-allowed border-border bg-transparent'
                        : isSelected
                          ? 'opacity-100 border-amber-500 bg-accent/20 text-foreground'
                          : 'border-border bg-transparent text-foreground hover:border-ring/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AgentIcon
                        agentId={agent.agentId}
                        src={agent.icon?.src}
                        alt={agent.icon?.alt}
                      />
                      <div>
                        <p className="text-sm font-medium">{agent.displayName}</p>
                        <p className="text-xs text-slate-400">
                          {agent.installed ? `Ready (${agent.version ?? 'version unknown'})` : 'Not installed'}
                        </p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-sky-400" />}
                  </Button>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card pattern="none" className="p-5 space-y-2">
              <label className="block text-sm font-semibold text-slate-200">Validation Profile</label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-[#182234] border border-[#334155] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
              >
                <option value="">None (Run without automated checks)</option>
                {profiles?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.commands.length} checks)
                  </option>
                ))}
              </select>
            </Card>

            <Card pattern="none" className="p-5 space-y-2">
              <label className="block text-sm font-semibold text-slate-200">
                Max Concurrency: {concurrency}
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-[#182234] rounded-lg appearance-none cursor-pointer accent-sky-500 mt-2"
              />
            </Card>
          </div>

          {launchError && (
            <div className="p-3 bg-red-950 border border-red-800 rounded-lg text-xs text-red-300">
              {launchError}
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            onClick={() => launchMutation.mutate()}
            disabled={!canLaunch}
            title={
              !selectedProjectId
                ? 'Register and select a repository first'
                : selectedAgents.length === 0
                  ? 'Select at least one installed agent'
                  : prompt.trim().length === 0
                    ? 'Enter a coding task prompt'
                    : undefined
            }
            className="relay-primary w-full py-3.5 disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 transition"
          >
            <Play className="w-4 h-4 fill-white" />
            {launchMutation.isPending ? 'Launching...' : 'Launch Race to Green'}
          </Button>
        </>
      )}
    </div>
  );
};
