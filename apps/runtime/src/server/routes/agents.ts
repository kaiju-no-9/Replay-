import { FastifyPluginAsync } from 'fastify';
import { agentRegistry } from '../../agents/registry.js';
import { AgentId } from '../../agents/types.js';

const ICON_BASE_URL = 'https://unpkg.com/@lobehub/icons-static-svg@1.97.0/icons';
const AGENT_ICON_FILES: Partial<Record<AgentId, string>> = {
  codex: 'codex-color.svg',
  claude: 'claudecode-color.svg',
  opencode: 'opencode.svg',
  antigravity: 'antigravity-color.svg',
  gemini: 'geminicli.svg',
  copilot: 'githubcopilot.svg',
  hermes: 'hermesagent.svg',
  openclaw: 'openclaw-color.svg',
};

function getAgentIcon(agentId: AgentId, displayName: string) {
  const file = AGENT_ICON_FILES[agentId];
  return file ? { src: `${ICON_BASE_URL}/${file}`, alt: displayName } : null;
}

export const agentRoutes: FastifyPluginAsync = async (server) => {
  server.get('/api/v1/agents', async (_request, reply) => {
    const adapters = agentRegistry.getAllAdapters();
    const probeResults = await agentRegistry.probeAll();

    const data = adapters.map((adapter) => {
      const probe = probeResults[adapter.id];
      return {
        id: adapter.id,
        agentId: adapter.id,
        displayName: adapter.displayName,
        icon: getAgentIcon(adapter.id, adapter.displayName),
        defaultBinary: adapter.defaultBinary,
        capabilities: adapter.getCapabilities(),
        installed: probe?.installed ?? false,
        version: probe?.version ?? null,
        binaryPath: probe?.binaryPath ?? null,
        diagnostic: probe?.diagnostic ?? 'Not yet probed',
        probe: probe ?? {
          installed: false,
          version: null,
          binaryPath: null,
          capabilities: adapter.getCapabilities(),
          diagnostic: 'Not yet probed',
        },
      };
    });

    return reply.send({ data, error: null });
  });

  server.post<{ Params: { agentId: string } }>(
    '/api/v1/agents/:agentId/probe',
    async (request, reply) => {
      const { agentId } = request.params;
      const adapter = agentRegistry.getAdapter(agentId as AgentId);

      if (!adapter) {
        return reply.status(404).send({
          data: null,
          error: {
            code: 'NOT_FOUND',
            message: `Unknown agent ID '${agentId}'. Supported agents: codex, claude, opencode, antigravity, gemini, copilot, hermes, openclaw`,
          },
        });
      }

      const probeResult = await agentRegistry.probeOne(agentId as AgentId);
      return reply.send({
        data: {
          id: adapter.id,
          agentId: adapter.id,
          displayName: adapter.displayName,
          icon: getAgentIcon(adapter.id, adapter.displayName),
          capabilities: adapter.getCapabilities(),
          installed: probeResult.installed,
          version: probeResult.version,
          binaryPath: probeResult.binaryPath,
          diagnostic: probeResult.diagnostic,
          probe: probeResult,
        },
        error: null,
      });
    }
  );
};
