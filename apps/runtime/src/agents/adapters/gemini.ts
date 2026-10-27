import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class GeminiAdapter implements AgentAdapter {
  readonly id: AgentId = 'gemini';
  readonly displayName = 'Gemini CLI';
  readonly defaultBinary = 'gemini';

  getCapabilities(): AgentCapabilities {
    return { interactiveTerminal: true, oneShotPrompt: true, sendInput: true, stopProcess: true, resumeSession: false, structuredOutput: true, modelSelection: true, permissionModes: true };
  }

  async probe(): Promise<AgentProbeResult> {
    const resolution = await findBinary(this.defaultBinary);
    if (!resolution.found || !resolution.path) return { installed: false, version: null, binaryPath: null, capabilities: this.getCapabilities(), diagnostic: 'Gemini CLI not found on PATH. Install and authenticate it using https://github.com/google-gemini/gemini-cli.' };
    const version = await getBinaryVersion(resolution.path, ['--version']);
    return { installed: true, version, binaryPath: resolution.path, capabilities: this.getCapabilities(), diagnostic: `Gemini CLI found at ${resolution.path} (version: ${version || 'unknown'}). Authenticate with Gemini CLI before running tasks.` };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const args: string[] = [];
    if (request.model) args.push('--model', request.model);
    if (request.permissionMode === 'bypass-permissions') args.push('--yolo');
    if (request.taskPrompt) args.push('-p', request.taskPrompt, '--output-format', 'stream-json');
    return { executable: resolution.path || this.defaultBinary, args, cwd: request.worktreePath, env: { ...(process.env as Record<string, string>), ...request.envOverrides }, terminal: !request.taskPrompt, outputParser: request.taskPrompt ? 'json-lines' : 'plain' };
  }

  parseExit(exitCode: number | null, signal: string | null): AgentExitResult {
    if (signal) return { succeeded: false, reason: `Gemini CLI stopped by signal: ${signal}` };
    return exitCode === 0 ? { succeeded: true, reason: 'Gemini CLI completed successfully' } : { succeeded: false, reason: `Gemini CLI exited with code: ${exitCode}` };
  }
}
