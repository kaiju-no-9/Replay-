import { z } from 'zod';

export const WorktreeStatusEnum = z.enum([
  'ready',
  'dirty',
  'active',
  'cleanup_pending',
  'removed',
  'error',
]);
export type WorktreeStatus = z.infer<typeof WorktreeStatusEnum>;

export const WorktreeSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  path: z.string(),
  branchName: z.string(),
  baseCommit: z.string(),
  status: WorktreeStatusEnum,
  activeDispatchId: z.string().uuid().nullable().default(null),
  kept: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Worktree = z.infer<typeof WorktreeSchema>;
