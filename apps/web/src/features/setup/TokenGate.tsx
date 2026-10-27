import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, CheckCircle2, XCircle, TerminalSquare } from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';
import Card from '../../components/ascii/card';
import Button from '../../components/ascii/button';
import Input from '../../components/ascii/input';
import { AgentIcon } from '../../components/AgentIcon';

const BACKDROP_AGENTS = [
  { id: 'codex', position: { left: '13%', top: '17%' } },
  { id: 'claude', position: { left: '27%', top: '76%' } },
  { id: 'opencode', position: { left: '76%', top: '20%' } },
  { id: 'antigravity', position: { left: '88%', top: '58%' } },
  { id: 'gemini', position: { left: '64%', top: '82%' } },
  { id: 'copilot', position: { left: '11%', top: '58%' } },
  { id: 'hermes', position: { left: '39%', top: '19%' } },
  { id: 'openclaw', position: { left: '57%', top: '48%' } },
];

/**
 * Token gate: the runtime prints a transient bearer token at startup.
 * The token is held in memory only (never localStorage).
 */
export const TokenGate: React.FC = () => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { setToken, setConnected } = useConnectionStore();

  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch('/api/v1/bootstrap', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Invalid token' : `Runtime error ${res.status}`);
      }
      return (await res.json()).data;
    },
    onSuccess: (data, token) => {
      setToken(token);
      setConnected(data.runtimeVersion);
    },
    onError: (err: any) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setError(null);
    verifyMutation.mutate(input.trim());
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#090d16] p-6"
      style={{
        backgroundImage: 'radial-gradient(ellipse at center, var(--ds-surface-raised) 0%, var(--ds-bg) 68%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 hidden sm:block" aria-hidden="true">
        {BACKDROP_AGENTS.map(({ id, position }) => (
          <span
            key={id}
            className="absolute opacity-[0.13]"
            style={{ ...position, transform: 'translate(-50%, -50%)' }}
          >
            <AgentIcon agentId={id} className="h-10 w-10" decorative />
          </span>
        ))}
      </div>

      <Card pattern="none" className="relative z-10 w-full max-w-lg p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center font-bold text-white">
            R
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Relay Cockpit</h1>
            <p className="text-xs text-slate-400">Browser-first multi-agent workspace</p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-[#182234] border border-[#334155] rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200 mb-2">
            <TerminalSquare className="w-4 h-4 text-sky-400" />
            Connect to local runtime
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Start the runtime with{' '}
            <code className="text-sky-300 bg-[#090d16] px-1.5 py-0.5 rounded">pnpm dev:runtime</code>{' '}
            and paste the bearer token it prints below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste runtime auth token"
              className="ascii-input pl-10 pr-3 py-2.5 placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg p-2.5">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={!input.trim() || verifyMutation.isPending}
            className="relay-primary w-full py-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {verifyMutation.isPending ? 'Verifying...' : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Connect
              </>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
};
