import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class CopilotAdapter implements AgentAdapter {
  readonly id: AgentId = 'copilot';
  readonly displayName = 'GitHub Copilot CLI';
  readonly defaultBinary = 'copilot';

  getCapabilities(): AgentCapabilities {
    return { interactiveTerminal: true, oneShotPrompt: true, sendInput: true, stopProcess: true, resumeSession: false, structuredOutput: false, modelSelection: true, permissionModes: false };
  }

  async probe(): Promise<AgentProbeResult> {
    const resolution = await findBinary(this.defaultBinary);
    if (!resolution.found || !resolution.path) return { installed: false, version: null, binaryPath: null, capabilities: this.getCapabilities(), diagnostic: 'GitHub Copilot CLI not found on PATH. See https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli.' };
    const version = await getBinaryVersion(resolution.path, ['--version']);
    return { installed: true, version, binaryPath: resolution.path, capabilities: this.getCapabilities(), diagnostic: `GitHub Copilot CLI found at ${resolution.path} (version: ${version || 'unknown'}). Sign in with GitHub Copilot CLI before running tasks.` };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const args: string[] = [];
    if (request.model) args.push('--model', request.model);
    if (request.taskPrompt) args.push('-p', request.taskPrompt);
    return { executable: resolution.path || this.defaultBinary, args, cwd: request.worktreePath, env: { ...(process.env as Record<string, string>), ...request.envOverrides }, terminal: !request.taskPrompt, outputParser: 'plain' };
  }

  parseExit(exitCode: number | null, signal: string | null): AgentExitResult {
    if (signal) return { succeeded: false, reason: `GitHub Copilot CLI stopped by signal: ${signal}` };
    return exitCode === 0 ? { succeeded: true, reason: 'GitHub Copilot CLI completed successfully' } : { succeeded: false, reason: `GitHub Copilot CLI exited with code: ${exitCode}` };
  }
}
