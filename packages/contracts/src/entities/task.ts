import { z } from 'zod';

export const TaskStatusEnum = z.enum([
  'pending',
  'ready',
  'dispatched',
  'completed',
  'failed',
  'blocked',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  title: z.string().min(1),
  spec: z.string().min(1),
  status: TaskStatusEnum.default('pending'),
  dependencies: z.array(z.string().uuid()).default([]),
  resultSummary: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;
