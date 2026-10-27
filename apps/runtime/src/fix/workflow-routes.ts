import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AgentIdEnum } from '@relay/contracts';
import { FixWorkflowService } from './workflow-service.js';
import { FixProposalRepository, FixWorkflowRepository } from '../persistence/repositories/fix-repo.js';
import { FixDecisionRepository } from '../persistence/repositories/fix-repo.js';
import { CandidateSelector } from '../validation/candidate-selector.js';
import { randomUUID } from 'node:crypto';
import { EventService } from '../orchestration/event-service.js';
import { StalenessDetector } from '../recovery/staleness-detector.js';

const launchSchema=z.object({revision:z.number().int().positive(),projectId:z.string().uuid(),agentIds:z.array(AgentIdEnum).min(1),validationProfileId:z.string().uuid().nullable().optional(),concurrencyLimit:z.number().int().min(1).max(5).optional(),idempotencyKey:z.string().min(8).max(128)});
export const fixWorkflowRoutes=(deps:{service:FixWorkflowService;proposals:FixProposalRepository;workflows:FixWorkflowRepository;decisions:FixDecisionRepository;candidateSelector:CandidateSelector;db:any;events:EventService}):FastifyPluginAsync=>async(server)=>{
  const staleness=new StalenessDetector(deps.db);
  server.post<{Params:{proposalId:string}}>('/api/v1/fix-proposals/:proposalId/preflight',async(req,reply)=>{
    const body=launchSchema.safeParse(req.body);if(!body.success)return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'Invalid launch settings'}});
    const checks=await deps.service.preflight(req.params.proposalId,body.data.revision,body.data);deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.workflow.preflight_completed',payload:{fixProposalId:req.params.proposalId,checks}});return reply.send({data:checks,error:null});
  });
  server.post<{Params:{proposalId:string}}>('/api/v1/fix-proposals/:proposalId/launch',async(req,reply)=>{
    const body=launchSchema.safeParse(req.body);if(!body.success)return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'Invalid launch settings'}});
    try{const result=await deps.service.launch(req.params.proposalId,body.data.revision,body.data);deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.workflow.created',projectId:result.run?.projectId,runId:result.run?.id,taskId:result.task?.id,payload:{fixWorkflowId:result.workflow?.id,fixProposalId:req.params.proposalId,runId:result.run?.id,taskId:result.task?.id,dispatchIds:result.dispatches.map(d=>d.id)}});return reply.code(201).send({data:result,error:null});}
    catch(e:any){return reply.code(e.checks?409:400).send({data:null,error:{code:e.checks?'PREFLIGHT_FAILED':'LAUNCH_FAILED',message:e.message,details:e.checks}});}
  });
  server.get<{Params:{workflowId:string}}>('/api/v1/fix-workflows/:workflowId',async(req,reply)=>{
    let workflow=deps.workflows.get(req.params.workflowId);
    if(!workflow)return reply.code(404).send({data:null,error:{code:'NOT_FOUND',message:'Fix workflow not found'}});
    if(workflow.runId&&!['selected','rejected','cancelled','failed','partial'].includes(workflow.status)){
      const rows=deps.db.prepare(`SELECT status,validation_status FROM dispatches WHERE task_id IN (SELECT id FROM tasks WHERE run_id=?)`).all(workflow.runId) as any[];
      const next=rows.some(r=>['queued','starting','running','waiting_input','stopping'].includes(r.status))?'running':rows.some(r=>r.validation_status==='running')?'validating':'ready_for_review';
      deps.workflows.updateStatus(workflow.id,next);workflow=deps.workflows.get(workflow.id);
      if(!workflow)return reply.code(404).send({data:null,error:{code:'NOT_FOUND',message:'Fix workflow not found'}});
    }
    const proposal=deps.proposals.get(workflow.fixProposalId,workflow.proposalRevision);
    return reply.send({data:{workflow,proposal},error:null});
  });
  server.get<{Params:{workflowId:string}}>('/api/v1/fix-workflows/:workflowId/decisions',async(req,reply)=>reply.send({data:deps.decisions.listByWorkflow(req.params.workflowId).map(d=>({...d,...staleness.decision(d.id)})),error:null}));
  server.post<{Params:{workflowId:string}}>('/api/v1/fix-workflows/:workflowId/decisions',async(req,reply)=>{
    const body=z.object({outcome:z.enum(['select_candidate','reject_all']),dispatchId:z.string().uuid().nullable().optional(),overrideReason:z.string().trim().min(1).max(2000).optional()}).safeParse(req.body);
    if(!body.success)return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'Invalid decision'}});
    const workflow=deps.workflows.get(req.params.workflowId);if(!workflow||!workflow.runId)return reply.code(409).send({data:null,error:{code:'WORKFLOW_NOT_READY',message:'Workflow has no linked Build run'}});
    const dispatchId=body.data.dispatchId??null;
    const dispatch=dispatchId?deps.db.prepare('SELECT * FROM dispatches WHERE id=?').get(dispatchId) as any:null;
    if(body.data.outcome==='select_candidate'){
      if(!dispatchId)return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'dispatchId is required'}});
      if(!dispatch||dispatch.status!=='succeeded')return reply.code(409).send({data:null,error:{code:'CANDIDATE_NOT_READY',message:'Candidate process must have succeeded before review'}});
      const failed=dispatch.validation_status!=='passed';
      if(failed&&!body.data.overrideReason)return reply.code(409).send({data:null,error:{code:'OVERRIDE_REQUIRED',message:'A reason is required to select a candidate without passing validation'}});
      try{deps.candidateSelector.selectCandidate(workflow.runId,dispatchId);}catch(e:any){return reply.code(400).send({data:null,error:{code:'INVALID_CANDIDATE',message:e.message}});}
    }
    const d={id:randomUUID(),fixWorkflowId:workflow.id,outcome:body.data.outcome,dispatchId,validationSnapshot:dispatchId?{dispatch:deps.db.prepare('SELECT base_commit,head_commit,validation_status FROM dispatches WHERE id=?').get(dispatchId),results:deps.db.prepare('SELECT id,command_id,status,exit_code,started_at,finished_at FROM validation_results WHERE dispatch_id=? ORDER BY started_at').all(dispatchId)}:[],overrideReason:body.data.overrideReason??null,stale:false,createdAt:new Date().toISOString()};
    deps.decisions.append(d);
    deps.workflows.updateStatus(workflow.id,body.data.outcome==='select_candidate'?'selected':'rejected');
    deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.decision.recorded',runId:workflow.runId??undefined,dispatchId:dispatchId??undefined,payload:{fixWorkflowId:workflow.id,decisionId:d.id,outcome:d.outcome,dispatchId}});
    return reply.code(201).send({data:d,error:null});
  });
};
