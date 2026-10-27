import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database as DatabaseType } from 'better-sqlite3';
import DatabaseConstructor from 'better-sqlite3';
import { runMigrations } from '../src/persistence/migrations.js';
import { ProjectRepository } from '../src/persistence/repositories/project-repo.js';
import { DispatchRepository } from '../src/persistence/repositories/dispatch-repo.js';
import { EventService } from '../src/orchestration/event-service.js';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 1 Persistence & Contracts Integration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('runs migrations and creates expected tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('projects');
    expect(tables).toContain('worktrees');
    expect(tables).toContain('runs');
    expect(tables).toContain('tasks');
    expect(tables).toContain('dispatches');
    expect(tables).toContain('runtime_events');
    expect(tables).toContain('validation_profiles');
    expect(tables).toContain('validation_results');
  });

  it('creates Project and Dispatch and enforces valid state transitions', () => {
    const projectRepo = new ProjectRepository(db);
    const dispatchRepo = new DispatchRepository(db);

    const projectId = uuidv4();
    projectRepo.create({
      id: projectId,
      name: 'Test Project',
      repoPath: '/tmp/repo',
      defaultBranch: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const worktreeId = uuidv4();
    db.prepare(
      `INSERT INTO worktrees (id, project_id, path, branch_name, base_commit, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(worktreeId, projectId, '/tmp/wt', 'relay/test', 'abc1234', 'ready', new Date().toISOString(), new Date().toISOString());

    const runId = uuidv4();
    db.prepare(
      `INSERT INTO runs (id, project_id, title, objective, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(runId, projectId, 'Test Run', 'Test Objective', 'queued', new Date().toISOString());

    const taskId = uuidv4();
    db.prepare(
      `INSERT INTO tasks (id, run_id, title, spec, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, runId, 'Test Task', 'Implement feature', 'pending', new Date().toISOString(), new Date().toISOString());

    const dispatchId = uuidv4();
    dispatchRepo.create({
      id: dispatchId,
      taskId,
      attemptNumber: 1,
      retryOfDispatchId: null,
      agentId: 'codex',
      worktreeId,
      processId: null,
      sessionId: null,
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      errorCode: null,
      agentSummary: null,
      lastHeartbeatAt: null,
      baseCommit: 'abc1234',
      headCommit: null,
      validationStatus: 'not_run',
    });

    dispatchRepo.updateStatus(dispatchId, 'starting');
    expect(dispatchRepo.getById(dispatchId)?.status).toBe('starting');

    dispatchRepo.updateStatus(dispatchId, 'running');
    expect(dispatchRepo.getById(dispatchId)?.status).toBe('running');

    dispatchRepo.updateStatus(dispatchId, 'succeeded');
    expect(dispatchRepo.getById(dispatchId)?.status).toBe('succeeded');

    expect(() => {
      dispatchRepo.updateStatus(dispatchId, 'running');
    }).toThrow(/INVALID_STATE_TRANSITION/);
  });

  it('records events transactionally with monotonic sequence IDs', () => {
    const eventService = new EventService(db);
    const eventsReceived: any[] = [];
    eventService.on('event', (e) => eventsReceived.push(e));

    const e1 = eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'dispatch.status',
      payload: { status: 'starting' },
    });

    const e2 = eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'dispatch.status',
      payload: { status: 'running' },
    });

    expect(e1.id).toBe(1);
    expect(e2.id).toBe(2);
    expect(eventsReceived.length).toBe(2);

    const replayed = eventService.getEventsSince(0);
    expect(replayed.length).toBe(2);
    expect(replayed[0].payload).toEqual({ status: 'starting' });
  });
});
