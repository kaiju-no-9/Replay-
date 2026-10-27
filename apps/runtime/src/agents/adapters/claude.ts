import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';
import { findBinary, getBinaryVersion } from '../probe-utils.js';

export class ClaudeAdapter implements AgentAdapter {
  readonly id: AgentId = 'claude';
  readonly displayName = 'Claude Code';
  readonly defaultBinary = 'claude';

  getCapabilities(): AgentCapabilities {
    return {
      interactiveTerminal: true,
      oneShotPrompt: true,
      sendInput: true,
      stopProcess: true,
      resumeSession: false,
      structuredOutput: true,
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
        diagnostic: 'Claude Code CLI not found on PATH. Install via npm: npm install -g @anthropic-ai/claude-code',
      };
    }

    const version = await getBinaryVersion(resolution.path, ['--version']);
    return {
      installed: true,
      version,
      binaryPath: resolution.path,
      capabilities: this.getCapabilities(),
      diagnostic: `Claude Code found at ${resolution.path} (version: ${version || 'unknown'}). Requires ANTHROPIC_API_KEY or CLI login.`,
    };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    const resolution = await findBinary(this.defaultBinary);
    const executable = resolution.path || this.defaultBinary;
    const args: string[] = [];

    if (request.model) {
      args.push('--model', request.model);
    }

    if (request.permissionMode === 'bypass-permissions') {
      args.push('--dangerously-skip-permissions');
    }

    // Relay dispatches task prompts through a PTY in interactive mode too.
    // Claude's print mode submits and executes the prompt automatically.
    if (request.taskPrompt) {
      args.push('-p', request.taskPrompt, '--output-format', 'json');
      return {
        executable,
        args,
        cwd: request.worktreePath,
        env: { ...(process.env as Record<string, string>), ...request.envOverrides },
        terminal: false,
        outputParser: 'json-lines',
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
      return { succeeded: true, reason: 'Claude Code process completed with exit code 0' };
    }
    return { succeeded: false, reason: `Claude Code exited with error code: ${exitCode}` };
  }
}
