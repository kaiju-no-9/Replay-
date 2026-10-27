import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class AntigravityAdapter implements AgentAdapter {
  readonly id: AgentId = 'antigravity';
  readonly displayName = 'Antigravity';
  readonly defaultBinary = 'agy'; // IMPORTANT: binary name is 'agy', not 'antigravity'

  getCapabilities(): AgentCapabilities {
    return {
      interactiveTerminal: true,
      oneShotPrompt: true,
      sendInput: true,
      stopProcess: true,
      resumeSession: false,
      structuredOutput: false,
      modelSelection: false,
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
        diagnostic: "Antigravity CLI ('agy') not found on PATH. See https://www.antigravity.google/docs/cli/overview/",
      };
    }

    const version = await getBinaryVersion(resolution.path, ['--version']);
    return {
      installed: true,
      version,
      binaryPath: resolution.path,
      capabilities: this.getCapabilities(),
      diagnostic: `Antigravity CLI ('agy') found at ${resolution.path} (version: ${version || 'unknown'}).`,
    };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const executable = resolution.path || this.defaultBinary;
    const args: string[] = [];

    // Antigravity's documented CLI accepts an initial prompt positionally.
    // There is no documented agy exec subcommand.
    if (request.taskPrompt) {
      args.push(request.taskPrompt);
      return {
        executable,
        args,
        cwd: request.worktreePath,
        env: { ...(process.env as Record<string, string>), ...request.envOverrides },
        terminal: true,
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
      return { succeeded: false, reason: `Antigravity stopped by signal: ${signal}` };
    }
    if (exitCode === 0) {
      return { succeeded: true, reason: 'Antigravity run completed with exit code 0' };
    }
    return { succeeded: false, reason: `Antigravity exited with code: ${exitCode}` };
  }
}
