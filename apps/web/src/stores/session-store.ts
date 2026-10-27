import { create } from 'zustand';

export interface SessionState {
  selectedDispatchId: string | null;
  setSelectedDispatchId: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  selectedDispatchId: null,
  setSelectedDispatchId: (id) => set({ selectedDispatchId: id }),
}));
