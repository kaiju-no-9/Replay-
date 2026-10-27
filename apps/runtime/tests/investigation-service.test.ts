import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/persistence/migrations.js';
import { InvestigationService } from '../src/investigation/investigation-service.js';

describe('InvestigationService',()=>{
  let db:Database|undefined;
  afterEach(()=>{db?.close();db=undefined;});
  it('persists source evidence and drafts an RCA with competing cited hypotheses',async()=>{
    db=new Database(':memory:');db.pragma('foreign_keys=ON');runMigrations(db);
    const connectors={collect:async()=>[
      {source:'kubernetes',query:{method:'GET'},status:'ok' as const,data:{pods:[{name:'api-0',phase:'CrashLoopBackOff'}]}},
      {source:'prometheus',query:{path:'/api/v1/query_range'},status:'unavailable' as const,error:'not configured'},
    ]};
    const service=new InvestigationService(db,connectors as any);
    const result=await service.investigate({title:'API errors',summary:'Error rate increased',severity:'sev2',service:'api',startsAt:new Date(Date.now()-60_000).toISOString()});
    expect(result?.investigation.status).toBe('partial');
    expect(result?.evidence).toHaveLength(2);
    expect(result?.reports[0].status).toBe('draft');
    expect(result?.reports[0].content.evidenceIds).toHaveLength(2);
    expect(result?.hypotheses.length).toBeGreaterThan(1);
    const validated=service.validateReport(result!.investigation.id,result!.reports[0].id,1);
    expect(validated.status).toBe('validated');
    expect(validated.revision).toBe(2);
  });
  it('rejects cross-investigation and missing report evidence references',async()=>{
    db=new Database(':memory:');db.pragma('foreign_keys=ON');runMigrations(db);
    const service=new InvestigationService(db,{collect:async()=>[]} as any);
    const one=await service.investigate({title:'First',summary:'First incident',severity:'sev3',service:'api',startsAt:new Date(Date.now()-60_000).toISOString()});
    const two=await service.investigate({title:'Second',summary:'Second incident',severity:'sev3',service:'worker',startsAt:new Date(Date.now()-60_000).toISOString()});
    const report=one!.reports[0];
    db.prepare('UPDATE rca_reports SET content_json=? WHERE id=? AND revision=1').run(JSON.stringify({...report.content,evidenceIds:[two!.evidence[0]?.id??'foreign-id']}),report.id);
    expect(()=>service.validateReport(one!.investigation.id,report.id,1)).toThrow(/missing or cross-investigation/);
  });
});
