import { Database as DatabaseType } from 'better-sqlite3';
import { Worktree, WorktreeSchema, WorktreeStatus } from '@relay/contracts';

export class WorktreeRepository {
  constructor(private db: DatabaseType) {}

  create(worktree: Worktree): void {
    const v = WorktreeSchema.parse(worktree);
    this.db
      .prepare(
        `INSERT INTO worktrees (id, project_id, path, branch_name, base_commit, status, active_dispatch_id, kept, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        v.id,
        v.projectId,
        v.path,
        v.branchName,
        v.baseCommit,
        v.status,
        v.activeDispatchId,
        v.kept ? 1 : 0,
        v.createdAt,
        v.updatedAt
      );
  }

  getById(id: string): Worktree | null {
    const row = this.db.prepare('SELECT * FROM worktrees WHERE id = ?').get(id) as any;
    return row ? this.map(row) : null;
  }

  getByPath(path: string): Worktree | null {
    const row = this.db.prepare('SELECT * FROM worktrees WHERE path = ?').get(path) as any;
    return row ? this.map(row) : null;
  }

  listByProject(projectId: string): Worktree[] {
    const rows = this.db
      .prepare('SELECT * FROM worktrees WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as any[];
    return rows.map((r) => this.map(r));
  }

  updateStatus(id: string, status: WorktreeStatus, activeDispatchId?: string | null): void {
    this.db
      .prepare(
        `UPDATE worktrees SET status = ?, active_dispatch_id = ?, updated_at = ? WHERE id = ?`
      )
      .run(status, activeDispatchId === undefined ? null : activeDispatchId, new Date().toISOString(), id);
  }

  setKept(id: string, kept: boolean): void {
    this.db
      .prepare('UPDATE worktrees SET kept = ?, updated_at = ? WHERE id = ?')
      .run(kept ? 1 : 0, new Date().toISOString(), id);
  }

  private map(row: any): Worktree {
    return WorktreeSchema.parse({
      id: row.id,
      projectId: row.project_id,
      path: row.path,
      branchName: row.branch_name,
      baseCommit: row.base_commit,
      status: row.status,
      activeDispatchId: row.active_dispatch_id ?? null,
      kept: Boolean(row.kept),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
