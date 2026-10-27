import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Database as DatabaseType } from 'better-sqlite3';
import {
  ValidationCommand,
  ValidationProfile,
  ValidationResult,
  ValidationResultStatus,
} from '@relay/contracts';
import { BoundedBuffer } from './buffer-limiter.js';
import { EventService } from '../orchestration/event-service.js';
import { DispatchRepository } from '../persistence/repositories/dispatch-repo.js';
import { WorktreeRepository } from '../persistence/repositories/worktree-repo.js';
import { SecretRedactor } from '../security/secret-redactor.js';

export class ValidationService {
  constructor(
    private readonly db: DatabaseType,
    private readonly eventService: EventService,
    private readonly dispatchRepo: DispatchRepository,
    private readonly worktreeRepo: WorktreeRepository
  ) {}

  createProfile(
    projectId: string,
    name: string,
    commands: Array<Omit<ValidationCommand, 'id' | 'cwdMode'> & { cwdMode?: 'worktree_root' }>
  ): ValidationProfile {
    const id = randomUUID();
    const now = new Date().toISOString();
    const fullCommands: ValidationCommand[] = commands.map((c) => ({
      id: randomUUID(),
      label: c.label,
      executable: c.executable,
      args: c.args,
      timeoutMs: c.timeoutMs || 60_000,
      cwdMode: 'worktree_root',
    }));

    this.db
      .prepare(
        `INSERT INTO validation_profiles (id, project_id, name, commands_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, projectId, name, JSON.stringify(fullCommands), now, now);

    return { id, projectId, name, commands: fullCommands, createdAt: now, updatedAt: now };
  }

  getProfile(profileId: string): ValidationProfile | null {
    const row = this.db.prepare('SELECT * FROM validation_profiles WHERE id = ?').get(profileId) as any;
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      commands: JSON.parse(row.commands_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getProfilesForProject(projectId: string): ValidationProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM validation_profiles WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as any[];
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      commands: JSON.parse(row.commands_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Run validation profile commands in a candidate dispatch's worktree.
   */
  async runValidation(dispatchId: string, profileId: string): Promise<ValidationResult[]> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Validation profile ${profileId} not found`);
    }

    const dispatch = this.dispatchRepo.getById(dispatchId);
    if (!dispatch) {
      throw new Error(`Dispatch ${dispatchId} not found`);
    }

    const worktree = this.worktreeRepo.getById(dispatch.worktreeId);
    if (!worktree) {
      throw new Error(`Worktree for dispatch ${dispatchId} not found`);
    }

    this.dispatchRepo.updateValidationStatus(dispatchId, 'running');
    const fixWorkflow=this.db.prepare('SELECT fw.id, t.run_id FROM fix_workflows fw JOIN tasks t ON t.run_id=fw.run_id JOIN dispatches d ON d.task_id=t.id WHERE d.id=? LIMIT 1').get(dispatchId) as {id:string;run_id:string}|undefined;
    this.eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'validation.started',
      dispatchId,
      payload: { profileId, profileName: profile.name, commandCount: profile.commands.length },
    });
    if(fixWorkflow)this.eventService.recordEvent({timestamp:new Date().toISOString(),type:'fix.candidate.validation_started',runId:fixWorkflow.run_id,dispatchId,payload:{fixWorkflowId:fixWorkflow.id,profileId}});

    const results: ValidationResult[] = [];
    let hasFailed = false;

    for (const cmd of profile.commands) {
      const result = await this.executeCommand(cmd, worktree.path, dispatchId);
      results.push(result);
      this.saveValidationResult(result);

      this.eventService.recordEvent({
        timestamp: new Date().toISOString(),
        type: 'validation.command.finished',
        dispatchId,
        payload: {
          commandId: cmd.id,
          label: cmd.label,
          status: result.status,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        },
      });

      if (result.status !== 'passed') {
        hasFailed = true;
      }
    }

    const overallStatus = hasFailed ? 'failed' : 'passed';
    this.dispatchRepo.updateValidationStatus(dispatchId, overallStatus);

    this.eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'validation.completed',
      dispatchId,
      payload: {
        profileId,
        overallStatus,
        totalCommands: profile.commands.length,
        passedCommands: results.filter((r) => r.status === 'passed').length,
      },
    });
    if(fixWorkflow)this.eventService.recordEvent({timestamp:new Date().toISOString(),type:'fix.candidate.validation_completed',runId:fixWorkflow.run_id,dispatchId,payload:{fixWorkflowId:fixWorkflow.id,profileId,overallStatus,results}});

    return results;
  }

  private executeCommand(
    command: ValidationCommand,
    worktreePath: string,
    dispatchId: string
  ): Promise<ValidationResult> {
    const resultId = randomUUID();
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const stdoutLimiter = new BoundedBuffer();
    const stderrLimiter = new BoundedBuffer();

    return new Promise<ValidationResult>((resolve) => {
      let isSettled = false;
      let timer: NodeJS.Timeout | null = null;

      const child = spawn(command.executable, command.args, {
        cwd: worktreePath,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...(process.env as Record<string, string>),
          CI: 'true',
        },
      });

      const cleanup = () => {
        if (timer) clearTimeout(timer);
      };

      const finish = (status: ValidationResultStatus, exitCode: number | null, errorMsg?: string) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();

        const finishedAt = new Date().toISOString();
        const durationMs = Date.now() - startTime;
        if (errorMsg) stderrLimiter.append(errorMsg);

        const { content: rawStdout, truncated: stdoutTruncated } = stdoutLimiter.toString();
        const { content: rawStderr, truncated: stderrTruncated } = stderrLimiter.toString();
        const stdout = SecretRedactor.redact(rawStdout);
        const stderr = SecretRedactor.redact(rawStderr);

        resolve({
          id: resultId,
          dispatchId,
          commandId: command.id,
          commandLabel: command.label,
          status,
          exitCode,
          durationMs,
          stdout,
          stderr,
          stdoutTruncated,
          stderrTruncated,
          startedAt,
          finishedAt,
        });
      };

      timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!isSettled) child.kill('SIGKILL');
          }, 2000);
        } catch {
          // Process may have exited
        }
        finish('timed_out', null, `Command timed out after ${command.timeoutMs}ms`);
      }, command.timeoutMs);

      child.stdout.on('data', (chunk) => stdoutLimiter.append(chunk));
      child.stderr.on('data', (chunk) => stderrLimiter.append(chunk));

      child.on('error', (err) => {
        finish('error', null, `Failed to spawn process: ${err.message}`);
      });

      child.on('close', (code) => {
        const status: ValidationResultStatus = code === 0 ? 'passed' : 'failed';
        finish(status, code);
      });
    });
  }

  private saveValidationResult(result: ValidationResult): void {
    this.db
      .prepare(
        `INSERT INTO validation_results (
           id, dispatch_id, command_id, command_label, status, exit_code,
           duration_ms, stdout, stderr, stdout_truncated, stderr_truncated,
           started_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.id,
        result.dispatchId,
        result.commandId,
        result.commandLabel,
        result.status,
        result.exitCode,
        result.durationMs,
        result.stdout,
        result.stderr,
        result.stdoutTruncated ? 1 : 0,
        result.stderrTruncated ? 1 : 0,
        result.startedAt,
        result.finishedAt
      );
  }

  getResultsForDispatch(dispatchId: string): ValidationResult[] {
    const rows = this.db
      .prepare('SELECT * FROM validation_results WHERE dispatch_id = ? ORDER BY started_at ASC')
      .all(dispatchId) as any[];

    return rows.map((r) => ({
      id: r.id,
      dispatchId: r.dispatch_id,
      commandId: r.command_id,
      commandLabel: r.command_label ?? '',
      status: r.status as ValidationResultStatus,
      exitCode: r.exit_code,
      durationMs: r.duration_ms,
      stdout: r.stdout,
      stderr: r.stderr,
      stdoutTruncated: Boolean(r.stdout_truncated),
      stderrTruncated: Boolean(r.stderr_truncated),
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }));
  }
}
