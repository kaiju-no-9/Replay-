import { Database as DatabaseType } from 'better-sqlite3';

export function runMigrations(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const row = db.prepare('SELECT MAX(version) AS currentVersion FROM schema_migrations').get() as {
    currentVersion: number | null;
  };
  const currentVersion = row?.currentVersion ?? 0;

  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          repo_path TEXT NOT NULL UNIQUE,
          default_branch TEXT NOT NULL DEFAULT 'main',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_installations (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          binary_path TEXT NOT NULL,
          installed INTEGER NOT NULL DEFAULT 0,
          version TEXT,
          capabilities_json TEXT NOT NULL,
          last_probe_at TEXT,
          diagnostic TEXT
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS worktrees (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path TEXT NOT NULL UNIQUE,
          branch_name TEXT NOT NULL,
          base_commit TEXT NOT NULL,
          status TEXT NOT NULL,
          active_dispatch_id TEXT,
          kept INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_worktrees_project ON worktrees(project_id);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          objective TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          validation_profile_id TEXT,
          concurrency_limit INTEGER NOT NULL DEFAULT 3,
          selected_dispatch_id TEXT,
          created_at TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
        CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          spec TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          dependencies_json TEXT NOT NULL DEFAULT '[]',
          result_summary TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks(run_id);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS dispatches (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          attempt_number INTEGER NOT NULL DEFAULT 1,
          retry_of_dispatch_id TEXT,
          agent_id TEXT NOT NULL,
          worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE RESTRICT,
          process_id INTEGER,
          session_id TEXT,
          status TEXT NOT NULL DEFAULT 'queued',
          started_at TEXT,
          finished_at TEXT,
          exit_code INTEGER,
          error_code TEXT,
          agent_summary TEXT,
          last_heartbeat_at TEXT,
          base_commit TEXT,
          head_commit TEXT,
          validation_status TEXT NOT NULL DEFAULT 'not_run',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_dispatches_task ON dispatches(task_id);
        CREATE INDEX IF NOT EXISTS idx_dispatches_worktree ON dispatches(worktree_id);
        CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS runtime_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          project_id TEXT,
          run_id TEXT,
          task_id TEXT,
          dispatch_id TEXT,
          session_id TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_dispatch ON runtime_events(dispatch_id);
        CREATE INDEX IF NOT EXISTS idx_events_run ON runtime_events(run_id);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON runtime_events(timestamp);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS validation_profiles (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          commands_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_val_profiles_proj ON validation_profiles(project_id);
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS validation_results (
          id TEXT PRIMARY KEY,
          dispatch_id TEXT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
          command_id TEXT NOT NULL,
          command_label TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          exit_code INTEGER,
          duration_ms INTEGER NOT NULL,
          stdout TEXT NOT NULL,
          stderr TEXT NOT NULL,
          stdout_truncated INTEGER NOT NULL DEFAULT 0,
          stderr_truncated INTEGER NOT NULL DEFAULT 0,
          started_at TEXT NOT NULL,
          finished_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_val_results_dispatch ON validation_results(dispatch_id);
      `);

      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(
        new Date().toISOString()
      );
    })();
  }

  const latest = db.prepare('SELECT MAX(version) AS currentVersion FROM schema_migrations').get() as { currentVersion: number | null };
  if ((latest?.currentVersion ?? 0) < 2) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS investigations (
          id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, status TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS evidence_items (
          id TEXT PRIMARY KEY, investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
          type TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_investigation ON evidence_items(investigation_id);
        CREATE TABLE IF NOT EXISTS rca_reports (
          id TEXT NOT NULL, revision INTEGER NOT NULL, investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
          status TEXT NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(id, revision)
        );
        CREATE INDEX IF NOT EXISTS idx_rca_investigation ON rca_reports(investigation_id, revision);
        CREATE TABLE IF NOT EXISTS fix_proposals (
          id TEXT NOT NULL, revision INTEGER NOT NULL, incident_id TEXT NOT NULL,
          investigation_id TEXT NOT NULL, rca_report_id TEXT NOT NULL,
          rca_report_revision INTEGER NOT NULL, status TEXT NOT NULL, content_json TEXT NOT NULL,
          provenance_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (id, revision)
        );
        CREATE INDEX IF NOT EXISTS idx_fix_proposals_investigation ON fix_proposals(investigation_id, created_at);
        CREATE TABLE IF NOT EXISTS fix_workflows (
          id TEXT PRIMARY KEY, fix_proposal_id TEXT NOT NULL, proposal_revision INTEGER NOT NULL,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
          run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
          task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
          status TEXT NOT NULL, base_commit TEXT, idempotency_key TEXT UNIQUE,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY(fix_proposal_id, proposal_revision) REFERENCES fix_proposals(id, revision) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_fix_workflows_proposal ON fix_workflows(fix_proposal_id);
        CREATE TABLE IF NOT EXISTS fix_decisions (
          id TEXT PRIMARY KEY, fix_workflow_id TEXT NOT NULL REFERENCES fix_workflows(id) ON DELETE RESTRICT,
          outcome TEXT NOT NULL, dispatch_id TEXT REFERENCES dispatches(id) ON DELETE RESTRICT,
          validation_snapshot_json TEXT NOT NULL, override_reason TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_fix_decisions_workflow ON fix_decisions(fix_workflow_id, created_at);
        CREATE TRIGGER IF NOT EXISTS fix_decisions_no_update BEFORE UPDATE ON fix_decisions BEGIN SELECT RAISE(ABORT, 'fix decisions are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS fix_decisions_no_delete BEFORE DELETE ON fix_decisions BEGIN SELECT RAISE(ABORT, 'fix decisions are append-only'); END;
      `);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(new Date().toISOString());
    })();
  }

  const latestAfterV2 = db.prepare('SELECT MAX(version) AS currentVersion FROM schema_migrations').get() as { currentVersion: number | null };
  if ((latestAfterV2?.currentVersion ?? 0) < 3) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL,
          severity TEXT NOT NULL, service TEXT NOT NULL, starts_at TEXT NOT NULL,
          ends_at TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS investigation_sources (
          id TEXT PRIMARY KEY, investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
          source TEXT NOT NULL, query_json TEXT NOT NULL, result_json TEXT NOT NULL,
          status TEXT NOT NULL, error TEXT, collected_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_investigation_sources_investigation ON investigation_sources(investigation_id, collected_at);
        CREATE TABLE IF NOT EXISTS rca_hypotheses (
          id TEXT PRIMARY KEY, investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
          title TEXT NOT NULL, explanation TEXT NOT NULL, confidence REAL NOT NULL,
          evidence_ids_json TEXT NOT NULL, created_at TEXT NOT NULL
        );
      `);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)').run(new Date().toISOString());
    })();
  }
}
