import type { Database as Db } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { ReadOnlyInvestigationConnectors, makeEvidence, type IncidentInput } from './connectors.js';

export class InvestigationService {
  constructor(private db:Db, private connectors = new ReadOnlyInvestigationConnectors()) {}

  async investigate(input:IncidentInput) {
    const incidentId=randomUUID(), investigationId=randomUUID(), now=new Date().toISOString();
    this.db.prepare('INSERT INTO incidents (id,title,summary,severity,service,starts_at,ends_at,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(incidentId,input.title,input.summary,input.severity,input.service,input.startsAt,input.endsAt??null,now);
    this.db.prepare('INSERT INTO investigations (id,incident_id,status,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(investigationId,incidentId,'running',now,now);
    const collections=await this.connectors.collect(input);
    const evidenceIds:string[]=[];
    const insertEvidence=this.db.prepare('INSERT INTO evidence_items (id,investigation_id,type,data_json,created_at) VALUES (?,?,?,?,?)');
    const insertSource=this.db.prepare('INSERT INTO investigation_sources (id,investigation_id,source,query_json,result_json,status,error,collected_at) VALUES (?,?,?,?,?,?,?,?)');
    this.db.transaction(()=>{
      for(const collection of collections){
        const evidence=makeEvidence(collection.source,{status:collection.status,query:collection.query,data:collection.data,error:collection.error});
        evidenceIds.push(evidence.id);
        insertEvidence.run(evidence.id,investigationId,collection.source,JSON.stringify({source:collection.source,data:evidence.data}),evidence.collectedAt);
        insertSource.run(randomUUID(),investigationId,collection.source,JSON.stringify(collection.query),JSON.stringify(collection.data??null),collection.status,collection.error??null,evidence.collectedAt);
      }
      const healthy=collections.filter(c=>c.status==='ok');
      const failed=collections.filter(c=>c.status!=='ok');
      const status=healthy.length && !failed.length?'completed':healthy.length?'partial':'failed';
      const reportId=randomUUID();
      const rootCause=healthy.length
        ? `The collected ${healthy.map(c=>c.source).join(', ')} observations are associated with service ${input.service} during the incident window. They are correlation evidence and do not establish causality by themselves.`
        : 'No configured investigation source returned usable observations; root cause is undetermined.';
      const content={title:`RCA: ${input.title}`,summary:input.summary,problem:input.summary,rootCause,desiredOutcome:'Restore the affected service and verify the suspected cause with additional evidence.',evidenceIds,affectedServices:[input.service],acceptanceCriteria:['Human reviewer confirms the causal explanation against cited evidence.','Create a regression check for the verified failure mode.'],constraints:['Read-only production investigation.','Do not expose cluster credentials or secrets to build agents.'],uncertainty:failed.map(c=>`${c.source}: ${c.error??'source unavailable'}`).concat(['Telemetry correlation does not prove causality.']),risk:'medium',sourceStatus:Object.fromEntries(collections.map(c=>[c.source,c.status]))};
      this.db.prepare('INSERT INTO rca_reports (id,revision,investigation_id,status,content_json,created_at) VALUES (?,1,?,?,?,?)')
        .run(reportId,investigationId,'draft',JSON.stringify(content),new Date().toISOString());
      const hypotheses=healthy.length?[
        {title:'Service-local failure',explanation:`A fault in ${input.service} may explain the reported symptoms; inspect correlated pod events, logs and traces.`,confidence:0.45},
        {title:'Dependency or shared-infrastructure fault',explanation:'A downstream dependency or shared component may have caused the service symptoms; current collection is insufficient to rule this out.',confidence:0.35},
        {title:'Insufficient telemetry',explanation:'Missing, delayed, or incomplete telemetry may account for the observed incident report.',confidence:0.2},
      ]:[{title:'Undetermined',explanation:'No telemetry source returned usable data. Configure and verify read-only sources before assessing cause.',confidence:1}];
      for(const h of hypotheses)this.db.prepare('INSERT INTO rca_hypotheses (id,investigation_id,title,explanation,confidence,evidence_ids_json,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),investigationId,h.title,h.explanation,h.confidence,JSON.stringify(healthy.length?evidenceIds:[]),new Date().toISOString());
      this.db.prepare('UPDATE investigations SET status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),investigationId);
    })();
    return this.get(investigationId);
  }

  get(id:string) {
    const investigation=this.db.prepare('SELECT * FROM investigations WHERE id=?').get(id) as any;
    if(!investigation) return null;
    const incident=this.db.prepare('SELECT * FROM incidents WHERE id=?').get(investigation.incident_id);
    const sources=this.db.prepare('SELECT id,source,query_json,result_json,status,error,collected_at FROM investigation_sources WHERE investigation_id=? ORDER BY collected_at').all(id) as any[];
    const evidence=this.db.prepare('SELECT id,type,data_json,created_at FROM evidence_items WHERE investigation_id=? ORDER BY created_at').all(id) as any[];
    const reports=this.db.prepare('SELECT id,revision,status,content_json,created_at FROM rca_reports WHERE investigation_id=? ORDER BY revision DESC').all(id) as any[];
    const hypotheses=this.db.prepare('SELECT id,title,explanation,confidence,evidence_ids_json,created_at FROM rca_hypotheses WHERE investigation_id=?').all(id) as any[];
    return {investigation,incident,sources:sources.map(x=>({...x,query:JSON.parse(x.query_json),result:JSON.parse(x.result_json)})),evidence:evidence.map(x=>({...x,data:JSON.parse(x.data_json)})),reports:reports.map(x=>({...x,content:JSON.parse(x.content_json)})),hypotheses:hypotheses.map(x=>({...x,evidenceIds:JSON.parse(x.evidence_ids_json)}))};
  }

  validateReport(investigationId:string,reportId:string,revision:number) {
    const report=this.db.prepare('SELECT * FROM rca_reports WHERE id=? AND revision=? AND investigation_id=?').get(reportId,revision,investigationId) as any;
    if(!report)throw new Error('RCA report revision not found');
    const content=JSON.parse(report.content_json);
    const cited=new Set(content.evidenceIds??[]);
    if(!cited.size)throw new Error('RCA report must cite evidence before validation');
    const rows=this.db.prepare(`SELECT id FROM evidence_items WHERE investigation_id=? AND id IN (${[...cited].map(()=>'?').join(',')})`).all(investigationId,...cited) as Array<{id:string}>;
    if(rows.length!==cited.size)throw new Error('RCA report has missing or cross-investigation evidence references');
    const nextRevision=revision+1, now=new Date().toISOString();
    this.db.prepare('INSERT INTO rca_reports (id,revision,investigation_id,status,content_json,created_at) VALUES (?,?,?,?,?,?)').run(reportId,nextRevision,investigationId,'validated',report.content_json,now);
    return {id:reportId,revision:nextRevision,status:'validated',content,createdAt:now};
  }
}
