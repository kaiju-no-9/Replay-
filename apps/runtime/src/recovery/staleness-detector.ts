import { Database as DatabaseType } from 'better-sqlite3';
export interface Staleness { stale:boolean; reasons:string[] }
export class StalenessDetector {
  constructor(private db:DatabaseType){}
  decision(decisionId:string):Staleness {
    const d=this.db.prepare('SELECT * FROM fix_decisions WHERE id=?').get(decisionId) as any;
    if(!d)return {stale:true,reasons:['decision_missing']};
    const w=this.db.prepare('SELECT * FROM fix_workflows WHERE id=?').get(d.fix_workflow_id) as any;
    const reasons:string[]=[];
    if(!w)reasons.push('workflow_missing');
    if(w?.run_id&&d.dispatch_id){const selected=this.db.prepare('SELECT selected_dispatch_id FROM runs WHERE id=?').get(w.run_id) as any;if(selected?.selected_dispatch_id!==d.dispatch_id)reasons.push('candidate_selection_changed');const latest=this.db.prepare('SELECT head_commit FROM dispatches WHERE id=?').get(d.dispatch_id) as any;const recorded=JSON.parse(d.validation_snapshot_json) as any;const reviewedHead=recorded?.dispatch?.head_commit??null;if(reviewedHead!==latest?.head_commit)reasons.push('candidate_commit_changed');}
    const latestProposal=w&&this.db.prepare('SELECT MAX(revision) AS revision FROM fix_proposals WHERE id=?').get(w.fix_proposal_id) as any;
    if(latestProposal?.revision!==w?.proposal_revision)reasons.push('proposal_revision_changed');
    return {stale:reasons.length>0,reasons};
  }
}
