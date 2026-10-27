import { Database as DatabaseType } from 'better-sqlite3';
/** Reconciles durable active records after a runtime restart. PTYs are process-owned and cannot be resumed safely. */
export class RecoveryManager {
  constructor(private db:DatabaseType){}
  reconcile():{dispatchesMarkedFailed:number;workflowsMarkedPartial:number} {
    const now=new Date().toISOString();
    const active=this.db.prepare(`SELECT d.id,d.task_id FROM dispatches d WHERE d.status IN ('starting','running','waiting_input','stopping')`).all() as any[];
    let workflowsMarkedPartial=0;
    const tx=this.db.transaction(()=>{
      for(const d of active){this.db.prepare(`UPDATE dispatches SET status='failed',finished_at=?,error_code='RUNTIME_RESTARTED' WHERE id=?`).run(now,d.id);this.db.prepare(`UPDATE worktrees SET status='ready',active_dispatch_id=NULL,updated_at=(datetime('now')) WHERE active_dispatch_id=?`).run(d.id);}
      this.db.prepare(`UPDATE runs SET status='partial',finished_at=COALESCE(finished_at,?) WHERE id IN (SELECT DISTINCT t.run_id FROM tasks t JOIN dispatches d ON d.task_id=t.id WHERE d.error_code='RUNTIME_RESTARTED')`).run(now);
      workflowsMarkedPartial=this.db.prepare(`UPDATE fix_workflows SET status='partial',updated_at=? WHERE run_id IN (SELECT id FROM runs WHERE status='partial') AND status IN ('running','validating','queued')`).run(now).changes;
    }); tx();
    return {dispatchesMarkedFailed:active.length,workflowsMarkedPartial};
  }
}
