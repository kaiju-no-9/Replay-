import { Database as DatabaseType } from 'better-sqlite3';
import { Run, RunSchema, RunStatus } from '@relay/contracts';

export class RunRepository {
  constructor(private db: DatabaseType) {}

  create(run: Run): void {
    const v = RunSchema.parse(run);
    this.db
      .prepare(
        `INSERT INTO runs (id, project_id, title, objective, status, validation_profile_id,
           concurrency_limit, selected_dispatch_id, created_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        v.id,
        v.projectId,
        v.title,
        v.objective,
        v.status,
        v.validationProfileId ?? null,
        v.concurrencyLimit,
        v.selectedDispatchId ?? null,
        v.createdAt,
        v.startedAt,
        v.finishedAt
      );
  }

  getById(id: string): Run | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any;
    return row ? this.map(row) : null;
  }

  list(limit = 50): Run[] {
    const rows = this.db
      .prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((r) => this.map(r));
  }

  updateStatus(id: string, status: RunStatus, timestamps?: { startedAt?: string; finishedAt?: string }): void {
    this.db
      .prepare('UPDATE runs SET status = ?, started_at = COALESCE(?, started_at), finished_at = COALESCE(?, finished_at) WHERE id = ?')
      .run(status, timestamps?.startedAt ?? null, timestamps?.finishedAt ?? null, id);
  }

  selectCandidate(id: string, dispatchId: string): void {
    this.db.prepare('UPDATE runs SET selected_dispatch_id = ? WHERE id = ?').run(dispatchId, id);
  }

  private map(row: any): Run {
    return RunSchema.parse({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      objective: row.objective,
      status: row.status,
      validationProfileId: row.validation_profile_id ?? null,
      concurrencyLimit: row.concurrency_limit,
      selectedDispatchId: row.selected_dispatch_id ?? null,
      createdAt: row.created_at,
      startedAt: row.started_at ?? null,
      finishedAt: row.finished_at ?? null,
    });
  }
}
