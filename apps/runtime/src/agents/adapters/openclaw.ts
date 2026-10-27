import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class OpenClawAdapter implements AgentAdapter {
  readonly id: AgentId = 'openclaw';
  readonly displayName = 'OpenClaw';
  readonly defaultBinary = 'openclaw';

  getCapabilities(): AgentCapabilities {
    return { interactiveTerminal: true, oneShotPrompt: true, sendInput: true, stopProcess: true, resumeSession: false, structuredOutput: true, modelSelection: true, permissionModes: false };
  }

  async probe(): Promise<AgentProbeResult> {
    const resolution = await findBinary(this.defaultBinary);
    if (!resolution.found || !resolution.path) return { installed: false, version: null, binaryPath: null, capabilities: this.getCapabilities(), diagnostic: 'OpenClaw CLI not found on PATH. See https://docs.openclaw.ai/cli.' };
    const version = await getBinaryVersion(resolution.path, ['--version']);
    return { installed: true, version, binaryPath: resolution.path, capabilities: this.getCapabilities(), diagnostic: `OpenClaw CLI found at ${resolution.path} (version: ${version || 'unknown'}). Configure an OpenClaw provider and agent before running tasks.` };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    if (request.taskPrompt) {
      return { executable: resolution.path || this.defaultBinary, args: ['agent', 'exec', request.taskPrompt, '--cwd', request.worktreePath, '--local', '--json'], cwd: request.worktreePath, env: { ...(process.env as Record<string, string>), ...request.envOverrides }, terminal: false, outputParser: 'plain' };
    }
    return { executable: resolution.path || this.defaultBinary, args: ['tui', '--local'], cwd: request.worktreePath, env: { ...(process.env as Record<string, string>), ...request.envOverrides }, terminal: true, outputParser: 'plain' };
  }

  parseExit(exitCode: number | null, signal: string | null): AgentExitResult {
    if (signal) return { succeeded: false, reason: `OpenClaw stopped by signal: ${signal}` };
    return exitCode === 0 ? { succeeded: true, reason: 'OpenClaw completed successfully' } : { succeeded: false, reason: `OpenClaw exited with code: ${exitCode}` };
  }
}
