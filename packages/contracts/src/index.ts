export * from './entities/project.js';
export * from './entities/agent.js';
export * from './entities/worktree.js';
export * from './entities/run.js';
export * from './entities/task.js';
export * from './entities/dispatch.js';
export * from './entities/validation.js';
export * from './entities/event.js';
export * from './entities/fix.js';
export * from './api/envelope.js';
export * from './api/websocket.js';

// ---- Legacy Phase 0 health check contract ----
import { z } from 'zod';

export const HealthCheckResponseSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    version: z.string(),
    uptime: z.number(),
    timestamp: z.string(),
  }),
  error: z.null(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
