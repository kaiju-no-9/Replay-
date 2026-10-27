import { z } from 'zod';

export const FixProposalStatusSchema = z.enum(['draft', 'ready_for_review', 'approved', 'rejected', 'expired']);
export const FixProposalContentSchema = z.object({
  title: z.string().min(1),
  problem: z.string().min(1),
  rootCause: z.string().min(1),
  desiredOutcome: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  affectedServices: z.array(z.string()),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string()),
  uncertainty: z.array(z.string()),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
});
export const FixProposalSchema = z.object({
  id: z.string().uuid(), incidentId: z.string().min(1), investigationId: z.string().min(1),
  rcaReportId: z.string().min(1), rcaReportRevision: z.number().int().positive(),
  revision: z.number().int().positive(), status: FixProposalStatusSchema,
  content: FixProposalContentSchema, provenance: z.object({ templateVersion: z.string(), sourceEvidenceIds: z.array(z.string()), createdBy: z.string().optional() }),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type FixProposal = z.infer<typeof FixProposalSchema>;
export type FixProposalContent = z.infer<typeof FixProposalContentSchema>;

export const FixWorkflowStatusSchema = z.enum(['preflight', 'awaiting_approval', 'queued', 'running', 'validating', 'ready_for_review', 'selected', 'rejected', 'cancelled', 'partial', 'failed']);
export const FixWorkflowSchema = z.object({
  id: z.string().uuid(), fixProposalId: z.string().uuid(), proposalRevision: z.number().int().positive(),
  projectId: z.string().uuid(), runId: z.string().uuid().nullable(), taskId: z.string().uuid().nullable(),
  status: FixWorkflowStatusSchema, baseCommit: z.string().nullable(), idempotencyKey: z.string().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type FixWorkflow = z.infer<typeof FixWorkflowSchema>;

export const FixDecisionSchema = z.object({
  id: z.string().uuid(), fixWorkflowId: z.string().uuid(), outcome: z.enum(['select_candidate', 'reject_all', 'approve_merge', 'decline_merge']),
  dispatchId: z.string().uuid().nullable(), validationSnapshot: z.unknown(), overrideReason: z.string().nullable(),
  stale: z.boolean().default(false), createdAt: z.string().datetime(),
});
export type FixDecision = z.infer<typeof FixDecisionSchema>;

export const FixTraceIdsSchema = z.object({ incidentId: z.string().optional(), investigationId: z.string().optional(), rcaReportId: z.string().optional(), fixProposalId: z.string().optional(), fixWorkflowId: z.string().optional(), runId: z.string().optional(), taskId: z.string().optional(), dispatchId: z.string().optional(), decisionId: z.string().optional() });
export type FixTraceIds = z.infer<typeof FixTraceIdsSchema>;

export const FixEventSchema = z.object({ type: z.string().regex(/^fix\./), sequence: z.number().int().positive(), timestamp: z.string().datetime(), fixWorkflowId: z.string().uuid().optional(), payload: z.record(z.unknown()) });
export type FixEvent = z.infer<typeof FixEventSchema>;
