export class KubernetesReadOnlyGuard {
  static assertReadOnly(method:string,verb?:string):void {
    const normalized=(verb??method).toUpperCase();
    if(!['GET','HEAD'].includes(normalized))throw new Error(`KUBERNETES_MUTATION_BLOCKED: ${normalized} is not permitted in investigation mode`);
  }
  static wrap<T extends {method?:string;verb?:string}>(request:T):T { this.assertReadOnly(request.method??'',request.verb); return request; }
}
