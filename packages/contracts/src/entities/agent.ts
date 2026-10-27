import { z } from 'zod';

export const AgentIdEnum = z.enum([
  'codex',
  'claude',
  'opencode',
  'antigravity',
  'gemini',
  'copilot',
  'hermes',
  'openclaw',
  'custom',
  // Deterministic demo fixtures — registered only when RELAY_DEMO_MODE=true
  'demo-winner',
  'demo-loser',
]);
export type AgentId = z.infer<typeof AgentIdEnum>;

export const AgentCapabilitiesSchema = z.object({
  interactiveTerminal: z.boolean().default(false),
  oneShotPrompt: z.boolean().default(true),
  sendInput: z.boolean().default(false),
  stopProcess: z.boolean().default(true),
  resumeSession: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  modelSelection: z.boolean().default(false),
  permissionModes: z.boolean().default(false),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

export const AgentInstallationSchema = z.object({
  id: z.string(),
  agentId: AgentIdEnum,
  displayName: z.string(),
  binaryPath: z.string(),
  installed: z.boolean(),
  version: z.string().nullable(),
  capabilities: AgentCapabilitiesSchema,
  lastProbeAt: z.string().datetime().nullable(),
  diagnostic: z.string().nullable(),
});

export type AgentInstallation = z.infer<typeof AgentInstallationSchema>;
