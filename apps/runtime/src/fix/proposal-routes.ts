import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FixProposalService } from './proposal-service.js';
import { FixProposalRepository } from '../persistence/repositories/fix-repo.js';
import { EventService } from '../orchestration/event-service.js';

export const fixProposalRoutes = (deps: { service: FixProposalService; proposals: FixProposalRepository; events:EventService }): FastifyPluginAsync => async (server) => {
  server.post<{Params:{investigationId:string}}>('/api/v1/rca/investigations/:investigationId/fix-proposals', async (req, reply) => {
    const body=z.object({reportId:z.string().min(1),reportRevision:z.number().int().positive().optional()}).safeParse(req.body);
    if(!body.success) return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'reportId is required'}});
    try { const proposal=deps.service.createFromReport({...body.data,investigationId:req.params.investigationId}); deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.proposal.created',payload:{fixProposalId:proposal.id,investigationId:proposal.investigationId,rcaReportId:proposal.rcaReportId,revision:proposal.revision}}); return reply.code(201).send({data:proposal,error:null}); }
    catch(e:any) { return reply.code(400).send({data:null,error:{code:'PROPOSAL_REJECTED',message:e.message}}); }
  });
  server.get<{Params:{proposalId:string}}>('/api/v1/fix-proposals/:proposalId',async(req,reply)=>{
    const revision=(req.query as any)?.revision ? Number((req.query as any).revision) : undefined;
    const proposal=deps.proposals.get(req.params.proposalId,revision);
    return proposal ? reply.send({data:proposal,error:null}) : reply.code(404).send({data:null,error:{code:'NOT_FOUND',message:'Proposal not found'}});
  });
  server.patch<{Params:{proposalId:string}}>('/api/v1/fix-proposals/:proposalId',async(req,reply)=>{
    const body=z.object({content:z.unknown()}).safeParse(req.body);
    if(!body.success) return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'content is required'}});
    try{const proposal=deps.service.edit(req.params.proposalId,body.data.content);deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.proposal.revised',payload:{fixProposalId:proposal.id,revision:proposal.revision}});return reply.send({data:proposal,error:null});}
    catch(e:any){return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:e.message}});}
  });
  server.post<{Params:{proposalId:string}}>('/api/v1/fix-proposals/:proposalId/approve',async(req,reply)=>{
    const body=z.object({revision:z.number().int().positive()}).safeParse(req.body);
    if(!body.success)return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'revision is required'}});
    try{const proposal=deps.service.approve(req.params.proposalId,body.data.revision);deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.proposal.approved',payload:{fixProposalId:proposal.id,revision:proposal.revision}});return reply.send({data:proposal,error:null});}
    catch(e:any){return reply.code(400).send({data:null,error:{code:'APPROVAL_REJECTED',message:e.message}});}
  });
  server.post<{Params:{proposalId:string}}>('/api/v1/fix-proposals/:proposalId/reject',async(req,reply)=>{
    const body=z.object({revision:z.number().int().positive(),reason:z.string().max(2000).optional()}).safeParse(req.body);
    if(!body.success)return reply.code(400).send({data:null,error:{code:'INVALID_INPUT',message:'revision is required'}});
    const current=deps.proposals.get(req.params.proposalId,body.data.revision);
    if(!current)return reply.code(404).send({data:null,error:{code:'NOT_FOUND',message:'Proposal revision not found'}});
    try{const proposal=deps.proposals.setStatus(current.id,current.revision,'rejected');deps.events.recordEvent({timestamp:new Date().toISOString(),type:'fix.proposal.rejected',payload:{fixProposalId:proposal.id,revision:proposal.revision,reason:body.data.reason??null}});return reply.send({data:proposal,error:null});}
    catch(e:any){return reply.code(400).send({data:null,error:{code:'REJECTION_FAILED',message:e.message}});}
  });
};
