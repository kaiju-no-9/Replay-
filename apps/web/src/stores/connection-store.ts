import { create } from 'zustand';

export interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  token: string | null;
  runtimeVersion: string | null;
  error: string | null;
  setConnected: (version: string) => void;
  setDisconnected: (error?: string) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setToken: (token: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  isReconnecting: false,
  token: null,
  runtimeVersion: null,
  error: null,
  setConnected: (version) =>
    set({ isConnected: true, isReconnecting: false, runtimeVersion: version, error: null }),
  setDisconnected: (error) =>
    set({ isConnected: false, error: error || 'Disconnected from Relay runtime' }),
  setReconnecting: (isReconnecting) => set({ isReconnecting }),
  setToken: (token) => set({ token }),
}));
