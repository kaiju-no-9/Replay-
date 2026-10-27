import { describe, it, expect } from 'vitest';
import {
  DispatchStateMachine,
  InvalidStateTransitionError,
} from '../src/orchestration/state-machine.js';
import { deriveRunStatus } from '../src/orchestration/run-status.js';

describe('Orchestration State Machine & Run Status', () => {
  it('enforces valid dispatch status transitions', () => {
    expect(() => DispatchStateMachine.validateTransition('queued', 'starting')).not.toThrow();
    expect(() => DispatchStateMachine.validateTransition('starting', 'running')).not.toThrow();
    expect(() => DispatchStateMachine.validateTransition('running', 'succeeded')).not.toThrow();
  });

  it('rejects invalid transitions and transitions out of terminal states', () => {
    expect(() => DispatchStateMachine.validateTransition('queued', 'succeeded')).toThrow(
      InvalidStateTransitionError
    );
    expect(() => DispatchStateMachine.validateTransition('succeeded', 'running')).toThrow(
      InvalidStateTransitionError
    );
    expect(() => DispatchStateMachine.validateTransition('failed', 'queued')).toThrow(
      InvalidStateTransitionError
    );
  });

  it('correctly derives run status from dispatches', () => {
    expect(deriveRunStatus([{ status: 'succeeded' }, { status: 'running' }])).toBe('running');
    expect(deriveRunStatus([{ status: 'succeeded' }, { status: 'succeeded' }])).toBe('completed');
    expect(deriveRunStatus([{ status: 'succeeded' }, { status: 'failed' }])).toBe('partial');
    expect(deriveRunStatus([{ status: 'cancelled' }, { status: 'cancelled' }])).toBe('cancelled');
    expect(deriveRunStatus([{ status: 'failed' }, { status: 'timed_out' }])).toBe('failed');
    expect(deriveRunStatus([])).toBe('queued');
  });
});
