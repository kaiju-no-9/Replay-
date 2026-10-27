import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, RefreshCw, Cpu } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import Card from '../../components/ascii/card';
import Badge from '../../components/ascii/badge';
import Button from '../../components/ascii/button';
import { AgentIcon } from '../../components/AgentIcon';

interface AgentData {
  id: string;
  agentId: string;
  displayName: string;
  icon: { src: string; alt: string } | null;
  defaultBinary: string;
  installed: boolean;
  version: string | null;
  binaryPath: string | null;
  diagnostic: string;
  capabilities: Record<string, boolean>;
}

export const AgentDiagnosticsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [probingId, setProbingId] = React.useState<string | null>(null);

  const { data: agents, isLoading } = useQuery<AgentData[]>({
    queryKey: ['agents'],
    queryFn: () => apiFetch('/api/v1/agents'),
  });

  const reprobeMutation = useMutation({
    mutationFn: (agentId: string) =>
      apiFetch(`/api/v1/agents/${agentId}/probe`, { method: 'POST' }),
    onMutate: (agentId) => setProbingId(agentId),
    onSettled: () => {
      setProbingId(null);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const capabilityLabels: Record<string, string> = {
    interactiveTerminal: 'Interactive Terminal (PTY)',
    oneShotPrompt: 'One-Shot Task Prompt',
    sendInput: 'Stdin / User Input',
    stopProcess: 'Clean Stop / Kill',
    resumeSession: 'Resume Session',
    structuredOutput: 'Structured Output (JSON)',
    modelSelection: 'Model Flag Override',
    permissionModes: 'Permission Bypass Flags',
  };

  if (isLoading) {
    return <div className="p-8 text-slate-400">Scanning installed agent CLIs...</div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Cpu className="w-6 h-6 text-indigo-400" />
          Agent Providers & CLI Diagnostics
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Relay detects installed CLIs on your machine. Probes verify binary availability, version, and capability flags.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents?.map((agent) => {
          const isProbing = probingId === agent.id;
          return (
            <Card
              key={agent.id}
              pattern="none"
              className="p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AgentIcon
                      agentId={agent.agentId}
                      src={agent.icon?.src}
                      alt={agent.icon?.alt}
                      className="w-5 h-5"
                    />
                    <span className="font-semibold text-white">{agent.displayName}</span>
                    <code className="text-xs text-slate-400 bg-[#182234] px-1.5 py-0.5 rounded">
                      {agent.defaultBinary}
                    </code>
                  </div>
                  <Badge variant="default" className={agent.installed ? 'text-emerald-400' : 'text-amber-400'}>
                    {agent.installed ? 'Installed' : 'Missing'}
                  </Badge>
                </div>

                <div className="mt-3 text-sm space-y-1 text-slate-300">
                  <div>
                    <span className="text-slate-500">Version: </span>
                    {agent.version || 'N/A'}
                  </div>
                  <div>
                    <span className="text-slate-500">Path: </span>
                    <span className="font-mono text-xs text-slate-400">
                      {agent.binaryPath || 'Not found'}
                    </span>
                  </div>
                  <div className="mt-2 p-2 bg-[#090d16] rounded text-xs text-slate-400 border border-[#1e293b]">
                    {agent.diagnostic}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1e293b] flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => reprobeMutation.mutate(agent.id)}
                  disabled={isProbing}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                  {isProbing ? 'Probing...' : 'Re-probe'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Card pattern="none" className="p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Capability Matrix</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#1e293b] text-slate-400">
                <th className="py-2.5 px-3">Feature Capability</th>
                {agents?.map((a) => (
                  <th key={a.id} className="py-2.5 px-3 text-center">
                    {a.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/60">
              {Object.entries(capabilityLabels).map(([key, label]) => (
                <tr key={key} className="hover:bg-[#1e293b]/20">
                  <td className="py-2.5 px-3 text-slate-300">{label}</td>
                  {agents?.map((a) => {
                    const hasCap = (a.capabilities as any)[key];
                    return (
                      <td key={a.id} className="py-2.5 px-3 text-center">
                        {hasCap ? (
                          <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-slate-600 mx-auto" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
