import {z} from 'zod';
export const InvestigationEvalResultSchema=z.object({rootCauseMatched:z.boolean(),evidenceCoverage:z.number().min(0).max(1),validCitationRatio:z.number().min(0).max(1),alternativesEvaluated:z.number().int().min(0),missingSignalDisclosed:z.boolean(),durationMs:z.number().min(0),toolCallCount:z.number().int().min(0)});
export const CandidateFixEvalResultSchema=z.object({dispatchId:z.string(),processSucceeded:z.boolean(),allValidationPassed:z.boolean(),regressionTestPassed:z.boolean(),filesChanged:z.number().int().min(0),additions:z.number().int().min(0),deletions:z.number().int().min(0),validationDurationMs:z.number().min(0)});
export const DecisionEvalResultSchema=z.object({outcome:z.enum(['candidate_selected','rejected_all','none']),selectedCandidateId:z.string().nullable(),checksReviewed:z.boolean(),overrideRecorded:z.boolean()});
export const EvaluationRunRecordSchema=z.object({id:z.string(),scenarioId:z.string(),timestamp:z.string().datetime(),investigation:InvestigationEvalResultSchema,candidateFixes:z.array(CandidateFixEvalResultSchema),decision:DecisionEvalResultSchema,notes:z.array(z.string())});
export type EvaluationRunRecord=z.infer<typeof EvaluationRunRecordSchema>;
export const GroundTruthSchema=z.object({scenarioId:z.string(),secretLabel:z.string(),expectedRootCause:z.string(),requiredEvidenceKeys:z.array(z.string()),requiredRegressionPattern:z.string()});
export type GroundTruth=z.infer<typeof GroundTruthSchema>;
