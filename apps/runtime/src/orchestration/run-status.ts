import { DispatchStatus, RunStatus } from '@relay/contracts';

export function deriveRunStatus(dispatches: Array<{ status: DispatchStatus }>): RunStatus {
  if (dispatches.length === 0) return 'queued';

  const hasActive = dispatches.some(
    (d) => d.status === 'running' || d.status === 'starting' || d.status === 'stopping'
  );
  if (hasActive) return 'running';

  const hasWaiting = dispatches.some((d) => d.status === 'waiting_input');
  if (hasWaiting) return 'waiting';

  const hasQueued = dispatches.some((d) => d.status === 'queued');
  if (hasQueued) return 'running';

  const allSucceeded = dispatches.every((d) => d.status === 'succeeded');
  if (allSucceeded) return 'completed';

  const allCancelled = dispatches.every((d) => d.status === 'cancelled');
  if (allCancelled) return 'cancelled';

  const allFailed = dispatches.every(
    (d) => d.status === 'failed' || d.status === 'timed_out' || d.status === 'lost'
  );
  if (allFailed) return 'failed';

  return 'partial';
}
