import { Database as DatabaseType } from 'better-sqlite3';
import type { ValidationService } from './validation-service.js';
import type { DiffCollector } from './diff-collector.js';
import type { CandidateLabel, CandidateScorecardItem, DiffStatSummary, RunScorecard } from './types.js';

export class ScorecardService {
  constructor(
    private readonly db: DatabaseType,
    private readonly validationService: ValidationService,
    private readonly diffCollector: DiffCollector
  ) {}

  async generateScorecard(runId: string): Promise<RunScorecard> {
    const run = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    let profileName: string | null = null;
    if (run.validation_profile_id) {
      const prof = this.validationService.getProfile(run.validation_profile_id);
      profileName = prof?.name ?? null;
    }

    const dispatches = this.db
      .prepare(
        `SELECT d.*, w.path AS worktree_path, w.branch_name, w.base_commit AS wt_base_commit
         FROM dispatches d
         JOIN tasks t ON d.task_id = t.id
         JOIN worktrees w ON d.worktree_id = w.id
         WHERE t.run_id = ?
         ORDER BY d.created_at ASC, d.attempt_number ASC`
      )
      .all(runId) as any[];

    const candidates: CandidateScorecardItem[] = [];

    for (const d of dispatches) {
      const validationResults = this.validationService.getResultsForDispatch(d.id);

      const baseCommit = d.base_commit || d.wt_base_commit || 'HEAD';
      let diffStats: DiffStatSummary = { filesChanged: 0, additions: 0, deletions: 0, changedFiles: [] };
      try {
        diffStats = await this.diffCollector.collectDiff(d.worktree_path, baseCommit);
      } catch {
        // Worktree may be in a broken state; keep zeroed stats
      }

      const { label, reason } = this.deriveLabel(d.status, d.exit_code, validationResults);

      candidates.push({
        dispatchId: d.id,
        agentId: d.agent_id,
        attemptNumber: d.attempt_number,
        worktreePath: d.worktree_path,
        branchName: d.branch_name,
        processStatus: d.status,
        processExitCode: d.exit_code,
        processDurationMs:
          d.finished_at && d.started_at
            ? new Date(d.finished_at).getTime() - new Date(d.started_at).getTime()
            : 0,
        validationStatus: d.validation_status || 'not_run',
        validationResults,
        diffStats,
        agentSummary: {
          text: d.agent_summary || 'No agent summary provided.',
          untrusted: true,
        },
        derivedLabel: label,
        labelReason: reason,
        isSelected: run.selected_dispatch_id === d.id,
      });
    }

    return {
      runId,
      projectId: run.project_id,
      validationProfileId: run.validation_profile_id || null,
      validationProfileName: profileName,
      generatedAt: new Date().toISOString(),
      selectedDispatchId: run.selected_dispatch_id || null,
      candidates,
    };
  }

  private deriveLabel(
    processStatus: string,
    exitCode: number | null,
    validationResults: Array<{ status: string }>
  ): { label: CandidateLabel; reason: string } {
    if (processStatus !== 'succeeded' || (exitCode !== null && exitCode !== 0)) {
      return {
        label: 'Execution Failed',
        reason: `Agent process finished with status '${processStatus}' (exit code ${exitCode ?? 'n/a'})`,
      };
    }

    if (validationResults.length === 0) {
      return {
        label: 'Needs Review',
        reason: 'Agent process finished, but no validation commands were executed',
      };
    }

    const allPassed = validationResults.every((r) => r.status === 'passed');
    if (allPassed) {
      return {
        label: 'Validated',
        reason: `All ${validationResults.length} validation checks passed cleanly (exit 0)`,
      };
    }

    const failedCount = validationResults.filter((r) => r.status !== 'passed').length;
    return {
      label: 'Needs Review',
      reason: `${failedCount} of ${validationResults.length} validation checks failed or timed out`,
    };
  }
}
