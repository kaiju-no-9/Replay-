import { AgentAdapter, AgentCapabilities, AgentId, AgentProbeResult } from './types.js';
import { CodexAdapter } from './adapters/codex.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { OpenCodeAdapter } from './adapters/opencode.js';
import { AntigravityAdapter } from './adapters/antigravity.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { CopilotAdapter } from './adapters/copilot.js';
import { HermesAdapter } from './adapters/hermes.js';
import { OpenClawAdapter } from './adapters/openclaw.js';
import { DemoWinnerAdapter, DemoLoserAdapter } from './adapters/demo-fixture.js';

export interface AgentRegistryOptions {
  onProbeComplete?: (agentId: AgentId, result: AgentProbeResult) => Promise<void>;
}

export class AgentRegistry {
  private adapters = new Map<AgentId, AgentAdapter>();
  private probeCache = new Map<AgentId, { result: AgentProbeResult; probedAt: number }>();
  private onProbeComplete?: (agentId: AgentId, result: AgentProbeResult) => Promise<void>;

  constructor(options?: AgentRegistryOptions) {
    this.onProbeComplete = options?.onProbeComplete;
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register(new CodexAdapter());
    this.register(new ClaudeAdapter());
    this.register(new OpenCodeAdapter());
    this.register(new AntigravityAdapter());
    this.register(new GeminiAdapter());
    this.register(new CopilotAdapter());
    this.register(new HermesAdapter());
    this.register(new OpenClawAdapter());

    // Deterministic demo fixtures: real processes/worktrees, no LLM keys.
    // Clearly labelled as fixtures; only enabled explicitly.
    if (process.env.RELAY_DEMO_MODE === 'true' || process.env.RELAY_DEMO_MODE === '1') {
      this.register(new DemoWinnerAdapter());
      this.register(new DemoLoserAdapter());
    }
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: AgentId): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  getAllAdapters(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  getCapabilities(id: AgentId): AgentCapabilities | undefined {
    return this.adapters.get(id)?.getCapabilities();
  }

  async probeOne(id: AgentId): Promise<AgentProbeResult> {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Unknown agent adapter: '${id}'`);
    }

    const result = await adapter.probe();
    this.probeCache.set(id, { result, probedAt: Date.now() });

    if (this.onProbeComplete) {
      try {
        await this.onProbeComplete(id, result);
      } catch (err) {
        console.error(`Failed to persist probe result for ${id}:`, err);
      }
    }

    return result;
  }

  async probeAll(): Promise<Record<AgentId, AgentProbeResult>> {
    const results: Partial<Record<AgentId, AgentProbeResult>> = {};
    const promises = Array.from(this.adapters.entries()).map(async ([id, adapter]) => {
      const res = await adapter.probe();
      this.probeCache.set(id, { result: res, probedAt: Date.now() });
      if (this.onProbeComplete) {
        await this.onProbeComplete(id, res).catch(() => {});
      }
      results[id] = res;
    });

    await Promise.all(promises);
    return results as Record<AgentId, AgentProbeResult>;
  }

  getCachedProbe(id: AgentId): AgentProbeResult | undefined {
    return this.probeCache.get(id)?.result;
  }
}

export const agentRegistry = new AgentRegistry();
