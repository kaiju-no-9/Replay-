import { DispatchStatus } from '@relay/contracts';

export const TERMINAL_DISPATCH_STATES: ReadonlySet<DispatchStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
  'lost',
]);

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly currentStatus: DispatchStatus,
    public readonly targetStatus: DispatchStatus
  ) {
    super(`Invalid dispatch transition from '${currentStatus}' to '${targetStatus}'`);
    this.name = 'InvalidStateTransitionError';
  }
}

const ALLOWED_TRANSITIONS: Record<DispatchStatus, readonly DispatchStatus[]> = {
  queued: ['starting', 'cancelled', 'lost'],
  starting: ['running', 'failed', 'cancelled', 'lost'],
  running: ['waiting_input', 'stopping', 'succeeded', 'failed', 'timed_out', 'lost'],
  waiting_input: ['running', 'stopping', 'cancelled', 'timed_out', 'failed', 'lost'],
  stopping: ['cancelled', 'failed', 'lost'],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
  lost: [],
};

export class DispatchStateMachine {
  static validateTransition(current: DispatchStatus, target: DispatchStatus): void {
    if (current === target) return;

    if (TERMINAL_DISPATCH_STATES.has(current)) {
      throw new InvalidStateTransitionError(current, target);
    }

    const allowed = ALLOWED_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new InvalidStateTransitionError(current, target);
    }
  }

  static isTerminal(status: DispatchStatus): boolean {
    return TERMINAL_DISPATCH_STATES.has(status);
  }
}
