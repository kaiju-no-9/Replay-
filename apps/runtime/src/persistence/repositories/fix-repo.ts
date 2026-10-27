import { Database as DatabaseType } from 'better-sqlite3';
import { FixDecision, FixDecisionSchema, FixProposal, FixProposalSchema, FixWorkflow, FixWorkflowSchema } from '@relay/contracts';

export class FixProposalRepository {
  constructor(private db: DatabaseType) {}
  create(proposal: FixProposal): void {
    const p = FixProposalSchema.parse(proposal);
    this.db.prepare(`INSERT INTO fix_proposals (id,revision,incident_id,investigation_id,rca_report_id,rca_report_revision,status,content_json,provenance_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(p.id,p.revision,p.incidentId,p.investigationId,p.rcaReportId,p.rcaReportRevision,p.status,JSON.stringify(p.content),JSON.stringify(p.provenance),p.createdAt,p.updatedAt);
  }
  get(id: string, revision?: number): FixProposal | null {
    const row = revision ? this.db.prepare('SELECT * FROM fix_proposals WHERE id=? AND revision=?').get(id,revision) : this.db.prepare('SELECT * FROM fix_proposals WHERE id=? ORDER BY revision DESC LIMIT 1').get(id);
    return row ? this.map(row as any) : null;
  }
  revise(id: string, content: FixProposal['content'], status: FixProposal['status'] = 'ready_for_review'): FixProposal {
    const current = this.get(id);
    if (!current) throw new Error('Fix proposal not found');
    const next = FixProposalSchema.parse({ ...current, revision: current.revision + 1, content, status, updatedAt: new Date().toISOString() });
    this.create(next);
    return next;
  }
  setStatus(id: string, revision: number, status: FixProposal['status']): FixProposal {
    const current = this.get(id, revision);
    if (!current) throw new Error('Fix proposal revision not found');
    const latest = this.get(id);
    if (latest?.revision !== revision) throw new Error('Proposal revision is stale; reload the latest revision');
    const next = FixProposalSchema.parse({ ...current, revision: current.revision + 1, status, updatedAt: new Date().toISOString() });
    this.create(next);
    return next;
  }
  private map(r: any): FixProposal { return FixProposalSchema.parse({ id:r.id,revision:r.revision,incidentId:r.incident_id,investigationId:r.investigation_id,rcaReportId:r.rca_report_id,rcaReportRevision:r.rca_report_revision,status:r.status,content:JSON.parse(r.content_json),provenance:JSON.parse(r.provenance_json),createdAt:r.created_at,updatedAt:r.updated_at }); }
}

export class FixWorkflowRepository {
  constructor(private db: DatabaseType) {}
  create(workflow: FixWorkflow): void {
    const w = FixWorkflowSchema.parse(workflow);
    this.db.prepare(`INSERT INTO fix_workflows (id,fix_proposal_id,proposal_revision,project_id,run_id,task_id,status,base_commit,idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(w.id,w.fixProposalId,w.proposalRevision,w.projectId,w.runId,w.taskId,w.status,w.baseCommit,w.idempotencyKey,w.createdAt,w.updatedAt);
  }
  get(id: string): FixWorkflow | null { const r=this.db.prepare('SELECT * FROM fix_workflows WHERE id=?').get(id) as any; return r ? this.map(r) : null; }
  getByIdempotencyKey(key: string): FixWorkflow | null { const r=this.db.prepare('SELECT * FROM fix_workflows WHERE idempotency_key=?').get(key) as any; return r ? this.map(r) : null; }
  linkRun(id: string, runId: string, taskId: string, baseCommit: string): void { this.db.prepare(`UPDATE fix_workflows SET run_id=?,task_id=?,base_commit=?,status='running',updated_at=? WHERE id=?`).run(runId,taskId,baseCommit,new Date().toISOString(),id); }
  updateStatus(id: string, status: FixWorkflow['status']): void { this.db.prepare('UPDATE fix_workflows SET status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),id); }
  private map(r:any): FixWorkflow { return FixWorkflowSchema.parse({id:r.id,fixProposalId:r.fix_proposal_id,proposalRevision:r.proposal_revision,projectId:r.project_id,runId:r.run_id,taskId:r.task_id,status:r.status,baseCommit:r.base_commit,idempotencyKey:r.idempotency_key,createdAt:r.created_at,updatedAt:r.updated_at}); }
}

export class FixDecisionRepository {
  constructor(private db: DatabaseType) {}
  append(decision: FixDecision): void {
    const d=FixDecisionSchema.parse(decision);
    this.db.prepare(`INSERT INTO fix_decisions (id,fix_workflow_id,outcome,dispatch_id,validation_snapshot_json,override_reason,created_at) VALUES (?,?,?,?,?,?,?)`).run(d.id,d.fixWorkflowId,d.outcome,d.dispatchId,JSON.stringify(d.validationSnapshot),d.overrideReason,d.createdAt);
  }
  listByWorkflow(id: string): FixDecision[] { return (this.db.prepare('SELECT * FROM fix_decisions WHERE fix_workflow_id=? ORDER BY created_at').all(id) as any[]).map(r=>FixDecisionSchema.parse({id:r.id,fixWorkflowId:r.fix_workflow_id,outcome:r.outcome,dispatchId:r.dispatch_id,validationSnapshot:JSON.parse(r.validation_snapshot_json),overrideReason:r.override_reason,stale:false,createdAt:r.created_at})); }
}
