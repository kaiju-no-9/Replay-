import { IPty } from 'node-pty';

export interface ProcessSpawnConfig {
  sessionId: string;
  dispatchId: string;
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export type SessionStatus = 'starting' | 'running' | 'stopping' | 'exited' | 'error';

export interface ProcessSession {
  sessionId: string;
  dispatchId: string;
  pty: IPty;
  pid: number;
  status: SessionStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  scrollbackBuffer: import('./scrollback-buffer.js').ScrollbackBuffer;
  stopTimeoutTimer?: NodeJS.Timeout;
}

export interface SessionOutputEvent {
  sessionId: string;
  dispatchId: string;
  data: string;
}

export interface SessionExitEvent {
  sessionId: string;
  dispatchId: string;
  exitCode: number | null;
  signal: string | null;
}
