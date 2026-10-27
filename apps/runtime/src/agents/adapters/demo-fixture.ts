import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentAdapter, AgentCapabilities, AgentId, AgentLaunchRequest, AgentLaunchSpec, AgentProbeResult, AgentExitResult } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../../../tests/fixtures/fake-agents');

/**
 * Deterministic demo fixture agent. Executes a real local bash script inside a
 * real worktree — real process, real git commits, real validation — without
 * requiring any LLM API keys. Registered ONLY when RELAY_DEMO_MODE=true.
 */
abstract class DemoFixtureAdapter implements AgentAdapter {
  abstract readonly id: AgentId;
  abstract readonly displayName: string;
  abstract readonly scriptName: string;
  readonly defaultBinary = 'bash';

  getCapabilities(): AgentCapabilities {
    return {
      interactiveTerminal: false,
      oneShotPrompt: true,
      sendInput: false,
      stopProcess: true,
      resumeSession: false,
      structuredOutput: false,
      modelSelection: false,
      permissionModes: false,
    };
  }

  protected scriptPath(): string {
    return path.join(FIXTURES_DIR, this.scriptName);
  }

  async probe(): Promise<AgentProbeResult> {
    const script = this.scriptPath();
    const exists = fs.existsSync(script);
    return {
      installed: exists,
      version: exists ? 'fixture-1.0.0' : null,
      binaryPath: exists ? script : null,
      capabilities: this.getCapabilities(),
      diagnostic: exists
        ? `Demo fixture agent (deterministic script — no real LLM). For offline demos only.`
        : `Demo fixture script not found at ${script}`,
    };
  }

  async buildLaunchSpec(request: AgentLaunchRequest): Promise<AgentLaunchSpec> {
    return {
      executable: 'bash',
      args: [this.scriptPath()],
      cwd: request.worktreePath,
      env: { ...(process.env as Record<string, string>), ...request.envOverrides },
      terminal: false,
      outputParser: 'plain',
    };
  }

  parseExit(exitCode: number | null, signal: string | null): AgentExitResult {
    if (signal) return { succeeded: false, reason: `Terminated by signal: ${signal}` };
    return exitCode === 0
      ? { succeeded: true, reason: 'Demo agent script completed' }
      : { succeeded: false, reason: `Demo agent script exited with code ${exitCode}` };
  }
}

export class DemoWinnerAdapter extends DemoFixtureAdapter {
  readonly id: AgentId = 'demo-winner';
  readonly displayName = 'Demo Winner (fixture)';
  readonly scriptName = 'agent-winner.sh';
}

export class DemoLoserAdapter extends DemoFixtureAdapter {
  readonly id: AgentId = 'demo-loser';
  readonly displayName = 'Demo Loser (fixture)';
  readonly scriptName = 'agent-loser.sh';
}
