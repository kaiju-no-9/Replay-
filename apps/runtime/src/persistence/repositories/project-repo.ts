import { Database as DatabaseType } from 'better-sqlite3';
import { Project, ProjectSchema } from '@relay/contracts';

export class ProjectRepository {
  constructor(private db: DatabaseType) {}

  create(project: Project): void {
    const v = ProjectSchema.parse(project);
    this.db
      .prepare(
        `INSERT INTO projects (id, name, repo_path, default_branch, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(v.id, v.name, v.repoPath, v.defaultBranch, v.createdAt, v.updatedAt);
  }

  getById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    return row ? this.map(row) : null;
  }

  getByRepoPath(repoPath: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE repo_path = ?').get(repoPath) as any;
    return row ? this.map(row) : null;
  }

  list(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => this.map(r));
  }

  private map(row: any): Project {
    return ProjectSchema.parse({
      id: row.id,
      name: row.name,
      repoPath: row.repo_path,
      defaultBranch: row.default_branch,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
