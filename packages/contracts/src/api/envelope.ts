import { z } from 'zod';

export const ApiErrorCodeEnum = z.enum([
  'RUNTIME_UNAVAILABLE',
  'AUTH_REQUIRED',
  'ORIGIN_NOT_ALLOWED',
  'AGENT_NOT_INSTALLED',
  'AGENT_PROBE_FAILED',
  'AGENT_CAPABILITY_UNSUPPORTED',
  'REPOSITORY_NOT_ALLOWED',
  'NOT_A_GIT_REPOSITORY',
  'WORKTREE_BUSY',
  'WORKTREE_DIRTY',
  'DISPATCH_NOT_ACTIVE',
  'VALIDATION_TIMEOUT',
  'PROCESS_START_FAILED',
  'PROCESS_STOP_TIMEOUT',
  'STALE_BASE_COMMIT',
  'CONFLICT_DETECTED',
  'INVALID_STATE_TRANSITION',
  'NOT_FOUND',
  'INVALID_INPUT',
  'INTERNAL_ERROR',
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeEnum>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  requestId?: string;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function err<T = never>(code: string, message: string, details?: unknown): ApiResponse<T> {
  return { data: null, error: { code, message, details } };
}
