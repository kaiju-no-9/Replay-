import { z } from 'zod';
import { AgentIdEnum } from './agent.js';

export const DispatchStatusEnum = z.enum([
  'queued',
  'starting',
  'running',
  'waiting_input',
  'stopping',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
  'lost',
]);
export type DispatchStatus = z.infer<typeof DispatchStatusEnum>;

export const ValidationStatusEnum = z.enum([
  'not_run',
  'running',
  'passed',
  'failed',
  'partial',
]);
export type DispatchValidationStatus = z.infer<typeof ValidationStatusEnum>;

export const DispatchSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  attemptNumber: z.number().int().min(1).default(1),
  retryOfDispatchId: z.string().uuid().nullable().default(null),
  agentId: AgentIdEnum,
  worktreeId: z.string().uuid(),
  processId: z.number().int().nullable().default(null),
  sessionId: z.string().nullable().default(null),
  status: DispatchStatusEnum.default('queued'),
  startedAt: z.string().datetime().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  errorCode: z.string().nullable().default(null),
  agentSummary: z.string().nullable().default(null),
  lastHeartbeatAt: z.string().datetime().nullable().default(null),
  baseCommit: z.string().nullable().default(null),
  headCommit: z.string().nullable().default(null),
  validationStatus: ValidationStatusEnum.default('not_run'),
  createdAt: z.string().datetime().optional(),
});

export type Dispatch = z.infer<typeof DispatchSchema>;
