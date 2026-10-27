import { z } from 'zod';
import { DispatchStatusEnum } from '../entities/dispatch.js';
import { WorktreeStatusEnum } from '../entities/worktree.js';
import { RunStatusEnum } from '../entities/run.js';

export const WebSocketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dispatch.status'),
    sequence: z.number().int(),
    dispatchId: z.string(),
    status: DispatchStatusEnum,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('run.status'),
    sequence: z.number().int(),
    runId: z.string(),
    status: RunStatusEnum,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('terminal.output'),
    sequence: z.number().int(),
    dispatchId: z.string(),
    data: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('terminal.snapshot'),
    sequence: z.number().int(),
    dispatchId: z.string(),
    data: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('terminal.exit'),
    sequence: z.number().int(),
    dispatchId: z.string(),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('validation.command.finished'),
    sequence: z.number().int(),
    dispatchId: z.string(),
    result: z.record(z.unknown()),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('worktree.updated'),
    sequence: z.number().int(),
    worktreeId: z.string(),
    status: WorktreeStatusEnum,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('runtime.error'),
    sequence: z.number().int(),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('ping'),
    timestamp: z.string().optional(),
  }),
  z.object({
    type: z.literal('pong'),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('event.snapshot'),
    events: z.array(z.object({ id:z.number().int(),type:z.string(),timestamp:z.string(),payload:z.record(z.unknown()).optional() }).passthrough()),
    cursor: z.number().int(),
    hasMore: z.boolean(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.enum(['fix.proposal.created','fix.proposal.revised','fix.proposal.approved','fix.proposal.rejected','fix.workflow.preflight_completed','fix.workflow.created','fix.candidate.ready_for_validation','fix.candidate.validation_started','fix.candidate.validation_completed','fix.candidate.diff_updated','fix.decision.recorded']),
    sequence: z.number().int(), timestamp: z.string(), payload: z.record(z.unknown()),
    runId: z.string().optional(), dispatchId: z.string().optional(),
  }),
]);

export const WebSocketClientMessageSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('ping')}).strict(),
  z.object({type:z.literal('subscribe_events'),after:z.number().int().min(0).default(0)}).strict(),
  z.object({type:z.literal('subscribe_terminal'),dispatchId:z.string().uuid()}).strict(),
  z.object({type:z.literal('terminal.input'),dispatchId:z.string().uuid(),data:z.string().max(16384)}).strict(),
  z.object({type:z.literal('terminal.resize'),dispatchId:z.string().uuid(),cols:z.number().int().min(2).max(500),rows:z.number().int().min(2).max(300)}).strict(),
]);
export type WebSocketClientMessage=z.infer<typeof WebSocketClientMessageSchema>;

export type WebSocketEvent = z.infer<typeof WebSocketEventSchema>;
