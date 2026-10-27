import { z } from 'zod';

export const ValidationCommandSchema = z.object({
  id: z.string(),
  label: z.string(),
  executable: z.string(),
  args: z.array(z.string()),
  cwdMode: z.literal('worktree_root').default('worktree_root'),
  timeoutMs: z.number().int().default(60000),
});

export type ValidationCommand = z.infer<typeof ValidationCommandSchema>;

export const ValidationProfileSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  commands: z.array(ValidationCommandSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ValidationProfile = z.infer<typeof ValidationProfileSchema>;

export const ValidationResultStatusEnum = z.enum(['passed', 'failed', 'timed_out', 'cancelled', 'error']);
export type ValidationResultStatus = z.infer<typeof ValidationResultStatusEnum>;

export const ValidationResultSchema = z.object({
  id: z.string().uuid(),
  dispatchId: z.string().uuid(),
  commandId: z.string(),
  commandLabel: z.string().default(''),
  status: ValidationResultStatusEnum,
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  stdoutTruncated: z.boolean().default(false),
  stderrTruncated: z.boolean().default(false),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;
