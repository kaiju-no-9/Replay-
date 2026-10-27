export type CandidateLabel = 'Validated' | 'Needs Review' | 'Execution Failed';

export interface DiffStatSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
  changedFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: 'added' | 'modified' | 'deleted';
  }>;
}

export interface CandidateScorecardItem {
  dispatchId: string;
  agentId: string;
  attemptNumber: number;
  worktreePath: string;
  branchName: string;
  processStatus: string;
  processExitCode: number | null;
  processDurationMs: number;
  validationStatus: string;
  validationResults: import('@relay/contracts').ValidationResult[];
  diffStats: DiffStatSummary;
  agentSummary: { text: string; untrusted: true };
  derivedLabel: CandidateLabel;
  labelReason: string;
  isSelected: boolean;
}

export interface RunScorecard {
  runId: string;
  projectId: string;
  validationProfileId: string | null;
  validationProfileName: string | null;
  generatedAt: string;
  selectedDispatchId: string | null;
  candidates: CandidateScorecardItem[];
}
