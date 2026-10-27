export type AgentId =
  | 'codex'
  | 'claude'
  | 'opencode'
  | 'antigravity'
  | 'gemini'
  | 'copilot'
  | 'hermes'
  | 'openclaw'
  | 'custom'
  // Deterministic demo fixtures — registered only when RELAY_DEMO_MODE=true
  | 'demo-winner'
  | 'demo-loser';

export interface AgentCapabilities {
  interactiveTerminal: boolean;
  oneShotPrompt: boolean;
  sendInput: boolean;
  stopProcess: boolean;
  resumeSession: boolean;
  structuredOutput: boolean;
  modelSelection: boolean;
  permissionModes: boolean;
}

export interface AgentLaunchRequest {
  projectPath: string;
  worktreePath: string;
  taskPrompt?: string;
  mode: 'interactive' | 'one-shot';
  model?: string;
  permissionMode?: string;
  envOverrides?: Record<string, string>;
}

export interface AgentLaunchSpec {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  terminal: boolean;
  outputParser?: 'plain' | 'json-lines' | 'provider-specific';
}

export interface AgentProbeResult {
  installed: boolean;
  version: string | null;
  binaryPath: string | null;
  capabilities: AgentCapabilities;
  diagnostic: string;
}

export interface AgentExitResult {
  succeeded: boolean;
  reason: string;
}

export interface AgentAdapter {
  readonly id: AgentId;
  readonly displayName: string;
  readonly defaultBinary: string;

  probe(): Promise<AgentProbeResult>;
  getCapabilities(): AgentCapabilities;
  buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec>;
  parseExit?(exitCode: number | null, signal: string | null): AgentExitResult;
}
