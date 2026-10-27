import { Database as DatabaseType } from 'better-sqlite3';
import { Task, TaskSchema, TaskStatus } from '@relay/contracts';

export class TaskRepository {
  constructor(private db: DatabaseType) {}

  create(task: Task): void {
    const v = TaskSchema.parse(task);
    this.db
      .prepare(
        `INSERT INTO tasks (id, run_id, title, spec, status, dependencies_json, result_summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        v.id,
        v.runId,
        v.title,
        v.spec,
        v.status,
        JSON.stringify(v.dependencies),
        v.resultSummary ?? null,
        v.createdAt,
        v.updatedAt
      );
  }

  getById(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? this.map(row) : null;
  }

  listByRun(runId: string): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks WHERE run_id = ?').all(runId) as any[];
    return rows.map((r) => this.map(r));
  }

  updateStatus(id: string, status: TaskStatus): void {
    this.db
      .prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
  }

  private map(row: any): Task {
    return TaskSchema.parse({
      id: row.id,
      runId: row.run_id,
      title: row.title,
      spec: row.spec,
      status: row.status,
      dependencies: JSON.parse(row.dependencies_json || '[]'),
      resultSummary: row.result_summary ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
