import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class CodexAdapter implements AgentAdapter {
  readonly id: AgentId = 'codex';
  readonly displayName = 'OpenAI Codex';
  readonly defaultBinary = 'codex';

  getCapabilities(): AgentCapabilities {
    return {
      interactiveTerminal: true,
      oneShotPrompt: true,
      sendInput: true,
      stopProcess: true,
      resumeSession: false,
      structuredOutput: false,
      modelSelection: true,
      permissionModes: true,
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
        diagnostic: resolution.error || 'Codex CLI binary not found on PATH. Install via npm or instructions at https://developers.openai.com/codex/cli/',
      };
    }

    const version = await getBinaryVersion(resolution.path, ['--version']);
    return {
      installed: true,
      version,
      binaryPath: resolution.path,
      capabilities: this.getCapabilities(),
      diagnostic: `Codex CLI found at ${resolution.path} (version: ${version || 'unknown'}). Authentication must be configured in environment or CLI profile.`,
    };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const executable = resolution.path || this.defaultBinary;
    const args: string[] = [];

    if (request.model) {
      args.push('--model', request.model);
    }

    // Relay dispatches task prompts through a PTY in interactive mode too.
    // Use Codex's exec command whenever there is a task to run.
    if (request.taskPrompt) {
      args.push('exec', request.taskPrompt);
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
      return { succeeded: false, reason: `Process terminated by signal: ${signal}` };
    }
    if (exitCode === 0) {
      return { succeeded: true, reason: 'Codex process completed successfully with exit code 0' };
    }
    return { succeeded: false, reason: `Codex exited with non-zero exit code: ${exitCode}` };
  }
}
