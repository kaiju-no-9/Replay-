export class WorkflowLockManager {
  private readonly locked=new Set<string>();
  async withLock<T>(key:string,operation:()=>Promise<T>):Promise<T>{if(this.locked.has(key))throw new Error(`WORKFLOW_BUSY: ${key}`);this.locked.add(key);try{return await operation();}finally{this.locked.delete(key);}}
  isLocked(key:string):boolean{return this.locked.has(key);}
}

export function assertWorkflowInvariant(input:{approved:boolean;hasRun:boolean;selectedDispatches:string[];worktreeOwners:Map<string,string>}):void {
  if(input.hasRun&&!input.approved)throw new Error('Invariant violation: a fix workflow cannot link a Build run without proposal approval');
  if(new Set(input.selectedDispatches).size>1)throw new Error('Invariant violation: a workflow can select at most one candidate');
  const owners=new Set<string>();for(const [worktree,dispatch] of input.worktreeOwners){if(owners.has(worktree))throw new Error(`Invariant violation: worktree ${worktree} has multiple dispatch owners`);owners.add(worktree);if(!dispatch)throw new Error(`Invariant violation: worktree ${worktree} has no dispatch owner`);}
}
