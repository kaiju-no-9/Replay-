import { Database as DatabaseType } from 'better-sqlite3';
import { Dispatch, DispatchSchema, DispatchStatus, DispatchValidationStatus } from '@relay/contracts';

export const VALID_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  queued: ['starting', 'cancelled', 'lost'],
  starting: ['running', 'failed', 'cancelled', 'lost'],
  running: ['waiting_input', 'stopping', 'succeeded', 'failed', 'timed_out', 'lost'],
  waiting_input: ['running', 'stopping', 'failed', 'cancelled', 'timed_out', 'lost'],
  stopping: ['cancelled', 'failed', 'lost'],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
  lost: [],
};

export class DispatchRepository {
  constructor(private db: DatabaseType) {}

  create(dispatch: Dispatch): void {
    const v = DispatchSchema.parse(dispatch);
    this.db
      .prepare(
        `INSERT INTO dispatches (
           id, task_id, attempt_number, retry_of_dispatch_id, agent_id, worktree_id,
           process_id, session_id, status, started_at, finished_at, exit_code, error_code,
           agent_summary, last_heartbeat_at, base_commit, head_commit, validation_status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        v.id,
        v.taskId,
        v.attemptNumber,
        v.retryOfDispatchId ?? null,
        v.agentId,
        v.worktreeId,
        v.processId,
        v.sessionId,
        v.status,
        v.startedAt,
        v.finishedAt,
        v.exitCode,
        v.errorCode,
        v.agentSummary,
        v.lastHeartbeatAt,
        v.baseCommit,
        v.headCommit,
        v.validationStatus,
        v.createdAt ?? new Date().toISOString()
      );
  }

  getById(id: string): Dispatch | null {
    const row = this.db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id) as any;
    return row ? this.map(row) : null;
  }

  listByTask(taskId: string): Dispatch[] {
    const rows = this.db
      .prepare('SELECT * FROM dispatches WHERE task_id = ? ORDER BY created_at ASC, attempt_number ASC')
      .all(taskId) as any[];
    return rows.map((r) => this.map(r));
  }

  listByRun(runId: string): Dispatch[] {
    const rows = this.db
      .prepare(
        `SELECT d.* FROM dispatches d JOIN tasks t ON d.task_id = t.id
         WHERE t.run_id = ? ORDER BY d.created_at ASC, d.attempt_number ASC`
      )
      .all(runId) as any[];
    return rows.map((r) => this.map(r));
  }

  updateStatus(id: string, newStatus: DispatchStatus, extra?: Partial<{
    startedAt: string; finishedAt: string; exitCode: number | null; errorCode: string | null;
    processId: number | null; sessionId: string | null; headCommit: string | null;
    agentSummary: string | null; lastHeartbeatAt: string;
  }>): Dispatch {
    const current = this.getById(id);
    if (!current) throw new Error(`Dispatch with ID ${id} not found`);

    const allowed = VALID_TRANSITIONS[current.status];
    if (current.status !== newStatus && !allowed.includes(newStatus)) {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot transition dispatch from '${current.status}' to '${newStatus}'`
      );
    }

    this.db
      .prepare(
        `UPDATE dispatches SET status = ?,
           started_at = COALESCE(?, started_at),
           finished_at = COALESCE(?, finished_at),
           exit_code = COALESCE(?, exit_code),
           error_code = COALESCE(?, error_code),
           process_id = COALESCE(?, process_id),
           session_id = COALESCE(?, session_id),
           head_commit = COALESCE(?, head_commit),
           agent_summary = COALESCE(?, agent_summary),
           last_heartbeat_at = COALESCE(?, last_heartbeat_at)
         WHERE id = ?`
      )
      .run(
        newStatus,
        extra?.startedAt ?? null,
        extra?.finishedAt ?? null,
        extra?.exitCode ?? null,
        extra?.errorCode ?? null,
        extra?.processId ?? null,
        extra?.sessionId ?? null,
        extra?.headCommit ?? null,
        extra?.agentSummary ?? null,
        extra?.lastHeartbeatAt ?? null,
        id
      );

    return this.getById(id)!;
  }

  updateValidationStatus(id: string, status: DispatchValidationStatus): void {
    this.db.prepare('UPDATE dispatches SET validation_status = ? WHERE id = ?').run(status, id);
  }

  private map(row: any): Dispatch {
    return DispatchSchema.parse({
      id: row.id,
      taskId: row.task_id,
      attemptNumber: row.attempt_number,
      retryOfDispatchId: row.retry_of_dispatch_id ?? null,
      agentId: row.agent_id,
      worktreeId: row.worktree_id,
      processId: row.process_id ?? null,
      sessionId: row.session_id ?? null,
      status: row.status,
      startedAt: row.started_at ?? null,
      finishedAt: row.finished_at ?? null,
      exitCode: row.exit_code ?? null,
      errorCode: row.error_code ?? null,
      agentSummary: row.agent_summary ?? null,
      lastHeartbeatAt: row.last_heartbeat_at ?? null,
      baseCommit: row.base_commit ?? null,
      headCommit: row.head_commit ?? null,
      validationStatus: row.validation_status,
      createdAt: row.created_at ?? undefined,
    });
  }
}
