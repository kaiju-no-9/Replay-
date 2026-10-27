import fs from 'node:fs';
import path from 'node:path';

export class PathTraversalError extends Error { constructor(message:string){super(message);this.name='PathTraversalError';} }

export class PathGuard {
  static assertWithinRoot(candidatePath:string,allowedRoot:string):string {
    if(candidatePath.includes('\0'))throw new PathTraversalError('Null byte detected in path');
    const root=fs.realpathSync(path.resolve(allowedRoot));
    const target=path.isAbsolute(candidatePath)?path.resolve(candidatePath):path.resolve(root,candidatePath);
    // Resolve the closest existing ancestor too, so a not-yet-created target below a symlink is rejected.
    let ancestor=target; const suffix:string[]=[];
    while(!fs.existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)break;suffix.unshift(path.basename(ancestor));ancestor=parent;}
    const canonical=path.join(fs.realpathSync(ancestor),...suffix);
    const relative=path.relative(root,canonical);
    if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new PathTraversalError(`Path escapes authorized root: ${candidatePath}`);
    return canonical;
  }
  static validateBranchName(branchName:string):string {
    if(!/^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,127}$/.test(branchName)||branchName.includes('..')||branchName.endsWith('.lock')||branchName.endsWith('/')||branchName.includes('//'))throw new PathTraversalError('Invalid or unsafe branch name');
    return branchName;
  }
}
