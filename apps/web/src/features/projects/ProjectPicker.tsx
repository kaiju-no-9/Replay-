import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, GitCommit, Folder, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useProjectStore } from '../../stores/project-store';
import Card from '../../components/ascii/card';
import Button from '../../components/ascii/button';
import Input from '../../components/ascii/input';

interface Project {
  id: string;
  name: string;
  repoPath: string;
  defaultBranch: string;
  gitInfo?: {
    currentBranch: string;
    headSha: string;
    isClean: boolean;
    changedFilesCount: number;
  } | null;
}

export const ProjectPicker: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedProjectId, setSelectedProjectId } = useProjectStore();
  const [inputPath, setInputPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch('/api/v1/projects'),
  });

  const registerMutation = useMutation({
    mutationFn: (repoPath: string) =>
      apiFetch('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ repoPath }),
      }),
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProjectId(project.id);
      setInputPath('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message);
    },
  });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPath.trim()) return;
    setError(null);
    registerMutation.mutate(inputPath.trim());
  };

  return (
    <Card pattern="none" className="p-5">
      <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
        <Folder className="w-5 h-5 text-indigo-400" />
        Git Repository Workspace
      </h2>

      <form onSubmit={handleRegister} className="flex gap-2 mb-4">
        <div className="flex-1">
          <Input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="/Users/username/projects/my-app"
            className="ascii-input placeholder:text-muted-foreground"
          />
        </div>
        <Button
          type="submit"
          disabled={registerMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          {registerMutation.isPending ? 'Adding...' : 'Register Repo'}
        </Button>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        {projects?.length === 0 && (
          <p className="text-sm text-slate-500 py-4 text-center">
            No repositories registered yet. Add a local Git repository path above.
          </p>
        )}
        {projects?.map((proj) => {
          const isSelected = selectedProjectId === proj.id;
          return (
            <Button
              key={proj.id}
              type="button"
              variant="ghost"
              onClick={() => setSelectedProjectId(proj.id)}
              className={`w-full p-4 text-left border transition ${
                isSelected
                  ? 'border-amber-500 bg-accent/20 opacity-100'
                  : 'border-border bg-transparent hover:border-ring/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    {proj.name}
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 truncate">{proj.repoPath}</p>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <div className="flex items-center gap-1 text-slate-300">
                    <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                    <span>{proj.defaultBranch}</span>
                  </div>
                  {proj.gitInfo && (
                    <div className="flex items-center gap-1 text-slate-400" title={proj.gitInfo.headSha}>
                      <GitCommit className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-mono">{proj.gitInfo.headSha.slice(0, 7)}</span>
                    </div>
                  )}
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </Card>
  );
};
