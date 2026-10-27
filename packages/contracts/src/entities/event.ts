import { z } from 'zod';

export const RuntimeEventSchema = z.object({
  id: z.number().int(), // Monotonically increasing sequence ID
  timestamp: z.string().datetime(),
  type: z.string(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  dispatchId: z.string().uuid().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  payload: z.record(z.unknown()),
});

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
