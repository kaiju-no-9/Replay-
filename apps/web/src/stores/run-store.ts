import { create } from 'zustand';

export type ViewMode = 'setup' | 'workspace' | 'live' | 'comparison' | 'diff' | 'agents' | 'fix' | 'investigate';

export interface RunState {
  activeRunId: string | null;
  viewMode: ViewMode;
  diffDispatchId: string | null;
  setActiveRunId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  openDiff: (dispatchId: string) => void;
}

export const useRunStore = create<RunState>((set) => ({
  activeRunId: null,
  viewMode: 'workspace',
  diffDispatchId: null,
  setActiveRunId: (id) => set({ activeRunId: id, viewMode: id ? 'live' : 'workspace' }),
  setViewMode: (mode) => set({ viewMode: mode }),
  openDiff: (dispatchId) => set({ diffDispatchId: dispatchId, viewMode: 'diff' }),
}));
