import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class HermesAdapter implements AgentAdapter {
  readonly id: AgentId = 'hermes';
  readonly displayName = 'Hermes Agent';
  readonly defaultBinary = 'hermes';

  getCapabilities(): AgentCapabilities {
    return { interactiveTerminal: true, oneShotPrompt: true, sendInput: true, stopProcess: true, resumeSession: false, structuredOutput: false, modelSelection: true, permissionModes: false };
  }

  async probe(): Promise<AgentProbeResult> {
    const resolution = await findBinary(this.defaultBinary);
    if (!resolution.found || !resolution.path) return { installed: false, version: null, binaryPath: null, capabilities: this.getCapabilities(), diagnostic: 'Hermes Agent CLI not found on PATH. See https://hermes-agent.nousresearch.com/docs/getting-started/quickstart/.' };
    const version = await getBinaryVersion(resolution.path, ['--version']);
    return { installed: true, version, binaryPath: resolution.path, capabilities: this.getCapabilities(), diagnostic: `Hermes Agent CLI found at ${resolution.path} (version: ${version || 'unknown'}). Configure Hermes authentication before running tasks.` };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const args: string[] = [];
    if (request.model) args.push('--model', request.model);
    if (request.permissionMode === 'bypass-permissions') args.push('--yolo');
    if (request.taskPrompt) args.push('-z', request.taskPrompt);
    return { executable: resolution.path || this.defaultBinary, args, cwd: request.worktreePath, env: { ...(process.env as Record<string, string>), ...request.envOverrides }, terminal: !request.taskPrompt, outputParser: 'plain' };
  }

  parseExit(exitCode: number | null, signal: string | null): AgentExitResult {
    if (signal) return { succeeded: false, reason: `Hermes Agent stopped by signal: ${signal}` };
    return exitCode === 0 ? { succeeded: true, reason: 'Hermes Agent completed successfully' } : { succeeded: false, reason: `Hermes Agent exited with code: ${exitCode}` };
  }
}
