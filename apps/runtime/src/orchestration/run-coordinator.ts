import crypto from 'node:crypto';
import { AgentId, Dispatch, DispatchStatus, Run, Task } from '@relay/contracts';
import { agentRegistry } from '../agents/registry.js';
import { gitService } from '../git/git-service.js';
import { worktreeService } from '../git/worktree-service.js';
import { ProcessManager } from '../sessions/process-manager.js';
import { EventService } from './event-service.js';
import { DispatchStateMachine } from './state-machine.js';
import { deriveRunStatus } from './run-status.js';
import { DispatchRepository } from '../persistence/repositories/dispatch-repo.js';
import { RunRepository } from '../persistence/repositories/run-repo.js';
import { TaskRepository } from '../persistence/repositories/task-repo.js';
import { WorktreeRepository } from '../persistence/repositories/worktree-repo.js';
import { ProjectRepository } from '../persistence/repositories/project-repo.js';

export interface CreateRunParams {
  projectId: string;
  projectRoot: string;
  title: string;
  objective: string;
  agentIds: AgentId[];
  concurrencyLimit?: number;
  validationProfileId?: string | null;
  baseCommit?: string;
}

export interface RunCoordinatorHooks {
  /** Called when a dispatch reaches a terminal state; used to trigger validation. */
  onDispatchTerminal?: (dispatchId: string, runId: string, status: DispatchStatus) => void;
}

/**
 * Coordinates Runs, Tasks, and Dispatches with SQLite-backed durability.
 * Every state transition is persisted BEFORE events are emitted.
 */
export class RunCoordinator {
  constructor(
    private runRepo: RunRepository,
    private taskRepo: TaskRepository,
    private dispatchRepo: DispatchRepository,
    private worktreeRepo: WorktreeRepository,
    private projectRepo: ProjectRepository,
    private processManager: ProcessManager,
    private eventService: EventService,
    private hooks: RunCoordinatorHooks = {}
  ) {
    // Reconcile process exits with persisted dispatch state
    this.processManager.on('exit', (evt: { dispatchId: string; exitCode: number | null; signal: string | null }) => {
      this.handleProcessExit(evt.dispatchId, evt.exitCode, evt.signal).catch((err) =>
        console.error('Error handling process exit:', err)
      );
    });
  }

  async createRun(params: CreateRunParams): Promise<{ run: Run; task: Task; dispatches: Dispatch[] }> {
    const { projectId, projectRoot, title, objective, agentIds } = params;
    const concurrencyLimit = Math.min(Math.max(params.concurrencyLimit || 3, 1), 5);

    if (agentIds.length === 0) {
      throw new Error('At least one agent must be selected');
    }

    // Verify all selected agents are installed before launching anything
    for (const agentId of agentIds) {
      const probe = agentRegistry.getCachedProbe(agentId) ?? (await agentRegistry.probeOne(agentId));
      if (!probe.installed) {
        throw new Error(`AGENT_NOT_INSTALLED: Agent '${agentId}' is not installed: ${probe.diagnostic}`);
      }
    }

    const repoInfo = await gitService.getRepoInfo(projectRoot);
    const baseCommit = params.baseCommit ?? repoInfo.headSha;
    if (!baseCommit) {
      throw new Error('Could not resolve base commit (HEAD) for repository');
    }

    const runId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const run: Run = {
      id: runId,
      projectId,
      title,
      objective,
      status: 'queued',
      validationProfileId: params.validationProfileId ?? null,
      concurrencyLimit,
      selectedDispatchId: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    };
    this.runRepo.create(run);

    const task: Task = {
      id: taskId,
      runId,
      title: objective.slice(0, 80) || title,
      spec: objective,
      status: 'pending',
      dependencies: [],
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
    };
    this.taskRepo.create(task);

    const dispatches: Dispatch[] = [];

    for (const agentId of agentIds) {
      const worktreeId = crypto.randomUUID();
      const { worktreePath, branchName } = await worktreeService.createWorktree({
        projectRoot,
        baseCommit,
        runId,
        agentId,
        attemptNumber: 1,
      });

      this.worktreeRepo.create({
        id: worktreeId,
        projectId,
        path: worktreePath,
        branchName,
        baseCommit,
        status: 'ready',
        activeDispatchId: null,
        kept: false,
        createdAt: now,
        updatedAt: now,
      });

      const dispatch: Dispatch = {
        id: crypto.randomUUID(),
        taskId,
        attemptNumber: 1,
        retryOfDispatchId: null,
        agentId,
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
        baseCommit,
        headCommit: null,
        validationStatus: 'not_run',
        createdAt: now,
      };

      this.dispatchRepo.create(dispatch);
      this.worktreeRepo.updateStatus(worktreeId, 'active', dispatch.id);
      dispatches.push(dispatch);

      this.eventService.recordEvent({
        timestamp: new Date().toISOString(),
        type: 'dispatch.status',
        projectId,
        runId,
        taskId,
        dispatchId: dispatch.id,
        payload: { status: 'queued', agentId, worktreePath, branchName },
      });
    }

    this.taskRepo.updateStatus(taskId, 'dispatched');
    this.eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'run.created',
      projectId,
      runId,
      taskId,
      payload: { title, objective, agentIds, baseCommit, concurrencyLimit },
    });

    await this.drainQueue(runId);
    return { run, task, dispatches };
  }

  /**
   * Start queued dispatches up to the run's concurrency limit.
   */
  async drainQueue(runId: string): Promise<void> {
    const run = this.runRepo.getById(runId);
    if (!run) return;

    const dispatches = this.dispatchRepo.listByRun(runId);
    const activeCount = dispatches.filter((d) => d.status === 'running' || d.status === 'starting').length;
    const availableSlots = run.concurrencyLimit - activeCount;
    if (availableSlots <= 0) {
      this.reconcileRunStatus(runId);
      return;
    }

    const queued = dispatches.filter((d) => d.status === 'queued').slice(0, availableSlots);
    for (const dispatch of queued) {
      this.startDispatch(dispatch.id).catch((err) => {
        console.error(`Error starting dispatch ${dispatch.id}:`, err);
      });
    }

    this.reconcileRunStatus(runId);
  }

  async startDispatch(dispatchId: string): Promise<void> {
    const dispatch = this.dispatchRepo.getById(dispatchId);
    if (!dispatch) throw new Error(`Dispatch not found: ${dispatchId}`);

    const task = this.taskRepo.getById(dispatch.taskId);
    if (!task) throw new Error(`Task not found for dispatch: ${dispatchId}`);

    const worktree = this.worktreeRepo.getById(dispatch.worktreeId);
    if (!worktree) throw new Error(`Worktree not found for dispatch: ${dispatchId}`);

    this.transition(dispatchId, 'starting');

    const adapter = agentRegistry.getAdapter(dispatch.agentId as AgentId);
    if (!adapter) {
      this.transition(dispatchId, 'failed', { errorCode: `Adapter not found: ${dispatch.agentId}` });
      return;
    }

    try {
      const launchSpec = await adapter.buildLaunchSpec({
        projectPath: worktree.path,
        worktreePath: worktree.path,
        taskPrompt: task.spec,
        mode: 'interactive',
      });

      const sessionId = crypto.randomUUID();
      const session = this.processManager.spawn({
        sessionId,
        dispatchId,
        executable: launchSpec.executable,
        args: launchSpec.args,
        cwd: launchSpec.cwd,
        env: launchSpec.env,
      });

      this.transition(dispatchId, 'running', {
        startedAt: new Date().toISOString(),
        processId: session.pid,
        sessionId,
      });
    } catch (err: any) {
      this.transition(dispatchId, 'failed', {
        errorCode: err.message || 'PROCESS_START_FAILED',
        finishedAt: new Date().toISOString(),
      });
    }
  }

  private async handleProcessExit(dispatchId: string, exitCode: number | null, signal: string | null): Promise<void> {
    const dispatch = this.dispatchRepo.getById(dispatchId);
    if (!dispatch) return;

    // Stale-event guard: terminal dispatches cannot be mutated by late process events
    if (DispatchStateMachine.isTerminal(dispatch.status)) {
      return;
    }

    const adapter = agentRegistry.getAdapter(dispatch.agentId as AgentId);
    const exitResult = adapter?.parseExit
      ? adapter.parseExit(exitCode, signal)
      : { succeeded: exitCode === 0, reason: `Exited with code ${exitCode}` };

    const worktree = this.worktreeRepo.getById(dispatch.worktreeId);
    let headCommit: string | null = null;
    if (worktree) {
      headCommit = await gitService.getHeadSha(worktree.path).catch(() => null);
    }

    const wasStopping = dispatch.status === 'stopping';
    const finalStatus: DispatchStatus = wasStopping
      ? 'cancelled'
      : exitResult.succeeded
        ? 'succeeded'
        : 'failed';

    this.transition(dispatchId, finalStatus, {
      finishedAt: new Date().toISOString(),
      exitCode,
      errorCode: exitResult.succeeded || wasStopping ? null : exitResult.reason,
      headCommit,
    });

    // Free the worktree for further use
    if (worktree) {
      this.worktreeRepo.updateStatus(worktree.id, 'ready', null);
    }

    if (dispatch.taskId) {
      const task = this.taskRepo.getById(dispatch.taskId);
      if (task) {
        // Fire validation hook (e.g. auto-validate when run has a profile)
        this.hooks.onDispatchTerminal?.(dispatchId, task.runId, finalStatus);
        await this.drainQueue(task.runId);
      }
    }
  }

  /**
   * Persist-first status transition + event emission.
   */
  private transition(
    dispatchId: string,
    nextStatus: DispatchStatus,
    extra?: Parameters<DispatchRepository['updateStatus']>[2]
  ): Dispatch {
    DispatchStateMachine.validateTransition(
      this.dispatchRepo.getById(dispatchId)?.status ?? 'queued',
      nextStatus
    );

    const updated = this.dispatchRepo.updateStatus(dispatchId, nextStatus, extra);

    const task = this.taskRepo.getById(updated.taskId);
    const run = task ? this.runRepo.getById(task.runId) : null;
    this.eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'dispatch.status',
      projectId: run?.projectId,
      runId: task?.runId,
      taskId: updated.taskId,
      dispatchId,
      payload: { status: nextStatus, exitCode: updated.exitCode, errorCode: updated.errorCode },
    });

    if (task) {
      this.reconcileRunStatus(task.runId);
    }

    return updated;
  }

  reconcileRunStatus(runId: string): void {
    const run = this.runRepo.getById(runId);
    if (!run) return;

    const dispatches = this.dispatchRepo.listByRun(runId);
    const newStatus = deriveRunStatus(dispatches);

    if (run.status !== newStatus) {
      const timestamps: { startedAt?: string; finishedAt?: string } = {};
      if (newStatus === 'running' && !run.startedAt) {
        timestamps.startedAt = new Date().toISOString();
      }
      if (['completed', 'failed', 'cancelled', 'partial'].includes(newStatus)) {
        timestamps.finishedAt = new Date().toISOString();
      }
      this.runRepo.updateStatus(runId, newStatus, timestamps);

      this.eventService.recordEvent({
        timestamp: new Date().toISOString(),
        type: 'run.status',
        projectId: run.projectId,
        runId,
        payload: { status: newStatus },
      });
    }
  }

  async stopDispatch(dispatchId: string): Promise<void> {
    const dispatch = this.dispatchRepo.getById(dispatchId);
    if (!dispatch) throw new Error(`Dispatch not found: ${dispatchId}`);

    if (DispatchStateMachine.isTerminal(dispatch.status)) return;

    this.transition(dispatchId, 'stopping');

    const session = this.processManager.getSessionByDispatchId(dispatchId);
    if (session) {
      await this.processManager.stop(session.sessionId, 5000);
    }

    // If the process exit event already transitioned us (to cancelled), done.
    const after = this.dispatchRepo.getById(dispatchId);
    if (after && after.status === 'stopping') {
      this.transition(dispatchId, 'cancelled', { finishedAt: new Date().toISOString() });
    }
  }

  async sendInput(dispatchId: string, input: string): Promise<void> {
    const dispatch = this.dispatchRepo.getById(dispatchId);
    if (!dispatch) throw new Error(`Dispatch not found: ${dispatchId}`);

    const adapter = agentRegistry.getAdapter(dispatch.agentId as AgentId);
    if (!adapter?.getCapabilities().sendInput) {
      throw new Error(`AGENT_CAPABILITY_UNSUPPORTED: Agent ${dispatch.agentId} does not support interactive input`);
    }

    const session = this.processManager.getSessionByDispatchId(dispatchId);
    if (!session) throw new Error(`DISPATCH_NOT_ACTIVE: No active process session for dispatch ${dispatchId}`);

    this.processManager.sendInput(session.sessionId, input);

    if (dispatch.status === 'waiting_input') {
      this.transition(dispatchId, 'running');
    }
  }

  /**
   * Retry a terminal dispatch. Always creates a NEW dispatch with a fresh worktree.
   */
  async retryDispatch(dispatchId: string): Promise<Dispatch> {
    const old = this.dispatchRepo.getById(dispatchId);
    if (!old) throw new Error(`Dispatch not found: ${dispatchId}`);

    if (!DispatchStateMachine.isTerminal(old.status)) {
      throw new Error('Cannot retry an active dispatch. Stop it first.');
    }

    const task = this.taskRepo.getById(old.taskId);
    if (!task) throw new Error(`Task not found: ${old.taskId}`);
    const run = this.runRepo.getById(task.runId);
    if (!run) throw new Error(`Run not found: ${task.runId}`);

    const proj = this.projectRepo.getById(run.projectId);
    if (!proj) throw new Error('Project not found for dispatch');

    const nextAttempt = old.attemptNumber + 1;
    const worktreeId = crypto.randomUUID();
    const { worktreePath, branchName } = await worktreeService.createWorktree({
      projectRoot: proj.repoPath,
      baseCommit: old.baseCommit ?? proj.defaultBranch,
      runId: run.id,
      agentId: old.agentId,
      attemptNumber: nextAttempt,
    });

    const now = new Date().toISOString();
    this.worktreeRepo.create({
      id: worktreeId,
      projectId: proj.id,
      path: worktreePath,
      branchName,
      baseCommit: old.baseCommit ?? '',
      status: 'ready',
      activeDispatchId: null,
      kept: false,
      createdAt: now,
      updatedAt: now,
    });

    const newDispatch: Dispatch = {
      id: crypto.randomUUID(),
      taskId: old.taskId,
      attemptNumber: nextAttempt,
      retryOfDispatchId: old.id,
      agentId: old.agentId,
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
      baseCommit: old.baseCommit,
      headCommit: null,
      validationStatus: 'not_run',
      createdAt: now,
    };

    this.dispatchRepo.create(newDispatch);
    this.worktreeRepo.updateStatus(worktreeId, 'active', newDispatch.id);

    this.eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'dispatch.status',
      projectId: proj.id,
      runId: run.id,
      taskId: old.taskId,
      dispatchId: newDispatch.id,
      payload: { status: 'queued', retryOfDispatchId: old.id, attemptNumber: nextAttempt },
    });

    await this.drainQueue(run.id);
    return newDispatch;
  }

  async cancelRun(runId: string): Promise<void> {
    const dispatches = this.dispatchRepo.listByRun(runId);
    const active = dispatches.filter((d) => !DispatchStateMachine.isTerminal(d.status));
    for (const d of active) {
      if (d.status === 'queued') {
        this.transition(d.id, 'cancelled', { finishedAt: new Date().toISOString() });
      } else {
        await this.stopDispatch(d.id);
      }
    }
    this.reconcileRunStatus(runId);
  }

  getRun(runId: string) {
    const run = this.runRepo.getById(runId);
    if (!run) return null;
    const tasks = this.taskRepo.listByRun(runId);
    const dispatches = this.dispatchRepo.listByRun(runId);
    return { run, tasks, dispatches };
  }

  listRuns() {
    return this.runRepo.list();
  }
}
