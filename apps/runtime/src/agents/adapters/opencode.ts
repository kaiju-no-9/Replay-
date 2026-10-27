import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class OpenCodeAdapter implements AgentAdapter {
  readonly id: AgentId = 'opencode';
  readonly displayName = 'OpenCode';
  readonly defaultBinary = 'opencode';

  getCapabilities(): AgentCapabilities {
    return {
      interactiveTerminal: true,
      oneShotPrompt: true,
      sendInput: true,
      stopProcess: true,
      resumeSession: false,
      structuredOutput: false,
      modelSelection: true,
      permissionModes: false,
    };
  }

  async probe(): Promise<AgentProbeResult> {
    const resolution = await findBinary(this.defaultBinary);
    if (!resolution.found || !resolution.path) {
      return {
        installed: false,
        version: null,
        binaryPath: null,
        capabilities: this.getCapabilities(),
        diagnostic: 'OpenCode CLI not found on PATH. Install via instructions at https://opencode.ai/docs/cli/',
      };
    }

    const version = await getBinaryVersion(resolution.path, ['--version']);

    return {
      installed: true,
      version,
      binaryPath: resolution.path,
      capabilities: this.getCapabilities(),
      diagnostic: `OpenCode CLI detected at ${resolution.path} (version: ${version || 'unknown'}).`,
    };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const executable = resolution.path || this.defaultBinary;
    const args: string[] = [];

    if (request.model) {
      args.push('--model', request.model);
    }

    // Relay dispatches launch through a PTY, but OpenCode's TUI --prompt flag
    // only fills the composer. Use `run` so the supplied task is submitted and
    // executed automatically for both one-shot and Relay-managed launches.
    if (request.taskPrompt) {
      args.push('run', request.taskPrompt);
      return {
        executable,
        args,
        cwd: request.worktreePath,
        env: { ...(process.env as Record<string, string>), ...request.envOverrides },
        terminal: false,
        outputParser: 'plain',
      };
    }

    return {
      executable,
      args,
      cwd: request.worktreePath,
      env: { ...(process.env as Record<string, string>), ...request.envOverrides },
      terminal: true,
      outputParser: 'plain',
    };
  }

  parseExit(exitCode: number | null, signal: string | null): AgentExitResult {
    if (signal) {
      return { succeeded: false, reason: `OpenCode stopped by signal: ${signal}` };
    }
    if (exitCode === 0) {
      return { succeeded: true, reason: 'OpenCode execution completed successfully (0)' };
    }
    return { succeeded: false, reason: `OpenCode failed with exit code: ${exitCode}` };
  }
}
