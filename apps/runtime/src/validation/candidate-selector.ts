import { Database as DatabaseType } from 'better-sqlite3';
import { EventService } from '../orchestration/event-service.js';
import { RunRepository } from '../persistence/repositories/run-repo.js';

/**
 * Marks a candidate as the selected winner. Never merges; only records the choice.
 */
export class CandidateSelector {
  constructor(
    private readonly db: DatabaseType,
    private readonly eventService: EventService,
    private readonly runRepo: RunRepository
  ) {}

  selectCandidate(runId: string, dispatchId: string): void {
    const run = this.runRepo.getById(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const dispatch = this.db
      .prepare(
        `SELECT d.* FROM dispatches d JOIN tasks t ON d.task_id = t.id
         WHERE d.id = ? AND t.run_id = ?`
      )
      .get(dispatchId, runId) as any;

    if (!dispatch) {
      throw new Error(`Dispatch ${dispatchId} does not belong to run ${runId}`);
    }

    this.runRepo.selectCandidate(runId, dispatchId);

    this.eventService.recordEvent({
      timestamp: new Date().toISOString(),
      type: 'run.candidate_selected',
      projectId: run.projectId,
      runId,
      dispatchId,
      payload: { agentId: dispatch.agent_id },
    });
  }
}
