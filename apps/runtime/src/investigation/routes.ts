import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InvestigationService } from './investigation-service.js';

const Intake=z.object({
  title:z.string().min(3).max(200), summary:z.string().min(3).max(4000),
  severity:z.enum(['sev1','sev2','sev3','sev4']), service:z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  startsAt:z.string().datetime(), endsAt:z.string().datetime().optional(),
}).refine(v=>!v.endsAt||new Date(v.endsAt)>new Date(v.startsAt),{message:'endsAt must be after startsAt'});

export const investigationRoutes=(service:InvestigationService):FastifyPluginAsync=>async server=>{
  server.post('/api/v1/investigations',async(request,reply)=>{
    const parsed=Intake.safeParse(request.body);
    if(!parsed.success)return reply.status(400).send({data:null,error:{code:'INVALID_INPUT',message:'Incident intake is invalid'}});
    try{return reply.status(201).send({data:await service.investigate(parsed.data),error:null});}
    catch(error){request.log.error(error);return reply.status(500).send({data:null,error:{code:'INVESTIGATION_FAILED',message:'Investigation could not be completed'}});}
  });
  server.get<{Params:{id:string}}>('/api/v1/investigations/:id',async(request,reply)=>{
    const data=service.get(request.params.id);
    return data?reply.send({data,error:null}):reply.status(404).send({data:null,error:{code:'NOT_FOUND',message:'Investigation not found'}});
  });
  server.post<{Params:{id:string;reportId:string}}>('/api/v1/investigations/:id/reports/:reportId/validate',async(request,reply)=>{
    const parsed=z.object({revision:z.number().int().positive()}).safeParse(request.body);
    if(!parsed.success)return reply.status(400).send({data:null,error:{code:'INVALID_INPUT',message:'Positive report revision is required'}});
    try{return reply.send({data:service.validateReport(request.params.id,request.params.reportId,parsed.data.revision),error:null});}
    catch(error){return reply.status(400).send({data:null,error:{code:'RCA_VALIDATION_FAILED',message:error instanceof Error?error.message:'RCA validation failed'}});}
  });
};
