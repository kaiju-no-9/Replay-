import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import { ValidationService } from '../src/validation/validation-service.js';
import { ScorecardService } from '../src/validation/scorecard-service.js';
import { DiffCollector } from '../src/validation/diff-collector.js';
import { CandidateSelector } from '../src/validation/candidate-selector.js';
import { EventService } from '../src/orchestration/event-service.js';
import { DispatchRepository } from '../src/persistence/repositories/dispatch-repo.js';
import { WorktreeRepository } from '../src/persistence/repositories/worktree-repo.js';
import { RunRepository } from '../src/persistence/repositories/run-repo.js';
import { runMigrations } from '../src/persistence/migrations.js';

describe('Validation Engine & Comparison Scorecard', () => {
  let db: DatabaseType;
  let tmpDir: string;
  let validationService: ValidationService;
  let scorecardService: ScorecardService;
  let candidateSelector: CandidateSelector;
  let eventService: EventService;
  let dispatchRepo: DispatchRepository;
  let worktreeRepo: WorktreeRepository;
  let runRepo: RunRepository;

  const projectId = uuidv4();
  const runId = uuidv4();
  const taskId = uuidv4();

  function seedBase() {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO projects (id, name, repo_path, default_branch, created_at, updated_at)
                VALUES (?, 'proj', '/tmp/x', 'main', ?, ?)`).run(projectId, now, now);
    db.prepare(`INSERT INTO runs (id, project_id, title, objective, status, created_at)
                VALUES (?, ?, 'r', 'o', 'running', ?)`).run(runId, projectId, now);
    db.prepare(`INSERT INTO tasks (id, run_id, title, spec, status, created_at, updated_at)
                VALUES (?, ?, 't', 's', 'dispatched', ?, ?)`).run(taskId, runId, now, now);
  }

  function seedDispatch(id: string, worktreePath: string, status = 'succeeded', exitCode: number | null = 0) {
    const now = new Date().toISOString();
    const wtId = uuidv4();
    db.prepare(`INSERT INTO worktrees (id, project_id, path, branch_name, base_commit, status, created_at, updated_at)
                VALUES (?, ?, ?, 'b1', 'HEAD', 'ready', ?, ?)`).run(wtId, projectId, worktreePath, now, now);
    db.prepare(`INSERT INTO dispatches (id, task_id, worktree_id, agent_id, attempt_number, status, exit_code, created_at)
                VALUES (?, ?, ?, 'codex', 1, ?, ?, ?)`).run(id, taskId, wtId, status, exitCode, now);
  }

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-val-test-'));
    eventService = new EventService(db);
    dispatchRepo = new DispatchRepository(db);
    worktreeRepo = new WorktreeRepository(db);
    runRepo = new RunRepository(db);

    validationService = new ValidationService(db, eventService, dispatchRepo, worktreeRepo);
    const diffCollector = new DiffCollector();
    scorecardService = new ScorecardService(db, validationService, diffCollector);
    candidateSelector = new CandidateSelector(db, eventService, runRepo);

    seedBase();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('enforces command timeout properly', async () => {
    const dispatchId = uuidv4();
    seedDispatch(dispatchId, tmpDir);

    const profile = validationService.createProfile(projectId, 'Timeout Check', [
      {
        label: 'Sleep Long',
        executable: 'node',
        args: ['-e', 'setTimeout(() => {}, 10000)'],
        timeoutMs: 500,
      },
    ]);

    const results = await validationService.runValidation(dispatchId, profile.id);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('timed_out');
  });

  it('bounds stdout when command produces excess output', async () => {
    const dispatchId = uuidv4();
    seedDispatch(dispatchId, tmpDir);

    const profile = validationService.createProfile(projectId, 'Flood Check', [
      {
        label: 'Spam Output',
        executable: 'node',
        args: ['-e', 'console.log("X".repeat(1024 * 600))'],
        timeoutMs: 15000,
      },
    ]);

    const results = await validationService.runValidation(dispatchId, profile.id);
    expect(results[0].stdoutTruncated).toBe(true);
    expect(results[0].stdout).toContain('[OUTPUT TRUNCATED AT 512KB]');
  });

  it('runs a passing command and records exit 0', async () => {
    const dispatchId = uuidv4();
    seedDispatch(dispatchId, tmpDir);

    const profile = validationService.createProfile(projectId, 'Pass Check', [
      { label: 'True', executable: 'node', args: ['-e', 'process.exit(0)'], timeoutMs: 5000 },
    ]);

    const results = await validationService.runValidation(dispatchId, profile.id);
    expect(results[0].status).toBe('passed');
    expect(results[0].exitCode).toBe(0);
  });

  it('selectCandidate marks dispatch as selected in run without merge', () => {
    const dispatchId = uuidv4();
    seedDispatch(dispatchId, tmpDir);

    candidateSelector.selectCandidate(runId, dispatchId);

    const run = runRepo.getById(runId);
    expect(run?.selectedDispatchId).toBe(dispatchId);
  });

  it('derives scorecard labels from verifiable outcomes', async () => {
    const passId = uuidv4();
    const failId = uuidv4();
    const wtA = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-wt-a-'));
    const wtB = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-wt-b-'));
    seedDispatch(passId, wtA, 'succeeded', 0);
    seedDispatch(failId, wtB, 'succeeded', 0);

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO validation_results (id, dispatch_id, command_id, command_label, status, exit_code, duration_ms, stdout, stderr, started_at, finished_at)
                VALUES (?, ?, 'c1', 'Test', 'passed', 0, 100, 'OK', '', ?, ?),
                       (?, ?, 'c1', 'Test', 'failed', 1, 100, '', 'FAILED', ?, ?)`)
      .run(uuidv4(), passId, now, now, uuidv4(), failId, now, now);

    const scorecard = await scorecardService.generateScorecard(runId);
    const passCandidate = scorecard.candidates.find((c) => c.dispatchId === passId);
    const failCandidate = scorecard.candidates.find((c) => c.dispatchId === failId);

    expect(passCandidate?.derivedLabel).toBe('Validated');
    expect(failCandidate?.derivedLabel).toBe('Needs Review');
    expect(passCandidate?.agentSummary.untrusted).toBe(true);

    fs.rmSync(wtA, { recursive: true, force: true });
    fs.rmSync(wtB, { recursive: true, force: true });
  });
});
