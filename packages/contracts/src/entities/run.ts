import { z } from 'zod';

export const RunStatusEnum = z.enum([
  'draft',
  'queued',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'partial',
]);
export type RunStatus = z.infer<typeof RunStatusEnum>;

export const RunSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().min(1),
  objective: z.string().min(1),
  status: RunStatusEnum.default('draft'),
  validationProfileId: z.string().uuid().nullable().default(null),
  concurrencyLimit: z.number().int().min(1).max(10).default(3),
  selectedDispatchId: z.string().uuid().nullable().default(null),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null),
});

export type Run = z.infer<typeof RunSchema>;
