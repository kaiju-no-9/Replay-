import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../src/agents/adapters/codex.js';
import { ClaudeAdapter } from '../src/agents/adapters/claude.js';
import { OpenCodeAdapter } from '../src/agents/adapters/opencode.js';
import { AntigravityAdapter } from '../src/agents/adapters/antigravity.js';

describe('Agent Adapters - Command Construction & Safety', () => {
  const maliciousPrompt = 'Fix bug; rm -rf /; cat /etc/passwd && echo "hacked"';
  const baseRequest = {
    projectPath: '/Users/test/project',
    worktreePath: '/Users/test/project/.relay/wt-1',
    taskPrompt: maliciousPrompt,
    mode: 'one-shot' as const,
  };

  it('CodexAdapter passes malicious prompt as a single array argument without shell interpolation', async () => {
    const adapter = new CodexAdapter();
    const spec = await adapter.buildLaunchSpec(baseRequest);

    expect(spec.args).toContain('exec');
    expect(spec.args).toContain(maliciousPrompt);
    const promptArgIndex = spec.args.indexOf(maliciousPrompt);
    expect(promptArgIndex).toBeGreaterThan(-1);
    expect(spec.cwd).toBe(baseRequest.worktreePath);
  });

  it('ClaudeAdapter passes prompt to -p flag safely and enables json lines in one-shot mode', async () => {
    const adapter = new ClaudeAdapter();
    const spec = await adapter.buildLaunchSpec(baseRequest);

    const pIndex = spec.args.indexOf('-p');
    expect(pIndex).toBeGreaterThan(-1);
    expect(spec.args[pIndex + 1]).toBe(maliciousPrompt);
    expect(spec.args).toContain('--output-format');
    expect(spec.args).toContain('json');
    expect(spec.outputParser).toBe('json-lines');
  });

  it('ClaudeAdapter does NOT include --dangerously-skip-permissions by default', async () => {
    const adapter = new ClaudeAdapter();
    const spec = await adapter.buildLaunchSpec(baseRequest);
    expect(spec.args).not.toContain('--dangerously-skip-permissions');
  });

  it('OpenCodeAdapter constructs run command safely', async () => {
    const adapter = new OpenCodeAdapter();
    const spec = await adapter.buildLaunchSpec(baseRequest);

    expect(spec.args[0]).toBe('run');
    expect(spec.args[1]).toBe(maliciousPrompt);
  });

  it('AntigravityAdapter targets binary "agy"', async () => {
    const adapter = new AntigravityAdapter();
    expect(adapter.defaultBinary).toBe('agy');

    const spec = await adapter.buildLaunchSpec(baseRequest);
    expect(spec.executable).toMatch(/agy/);
    expect(spec.args).toContain(maliciousPrompt);
  });

  it('capabilities accurately represent each provider', () => {
    const claude = new ClaudeAdapter();
    expect(claude.getCapabilities().structuredOutput).toBe(true);
    expect(claude.getCapabilities().permissionModes).toBe(true);

    const agy = new AntigravityAdapter();
    expect(agy.getCapabilities().structuredOutput).toBe(false);
    expect(agy.getCapabilities().permissionModes).toBe(false);
  });

  it('missing CLI returns installed:false without throwing', async () => {
    const adapter = new CodexAdapter();
    // Force probe against a binary that definitely doesn't exist by subclassing
    class MissingAdapter extends CodexAdapter {
      override readonly defaultBinary = 'definitely-not-a-real-binary-xyz-123';
    }
    const missing = new MissingAdapter();
    const result = await missing.probe();
    expect(result.installed).toBe(false);
    expect(result.diagnostic).toContain('definitely-not-a-real-binary-xyz-123');
  });
});
