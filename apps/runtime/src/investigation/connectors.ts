import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { InjectionSanitizer } from '../security/injection-sanitizer.js';
import { KubernetesReadOnlyGuard } from '../security/k8s-guard.js';
import { SecretRedactor } from '../security/secret-redactor.js';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const WINDOW_MS = 30 * 60_000;

export type IncidentInput = { title: string; summary: string; severity: 'sev1'|'sev2'|'sev3'|'sev4'; service: string; startsAt: string; endsAt?: string };
export type Collection = { source: string; query: unknown; status: 'ok'|'unavailable'|'error'; data?: unknown; error?: string };

function bounded(value: unknown): unknown {
  const clean = SecretRedactor.redactJson(value);
  const serialized = JSON.stringify(clean);
  if (serialized.length > MAX_BYTES) return { truncated: true, preview: serialized.slice(0, MAX_BYTES) };
  return clean;
}

function projectKubernetesItems(items:any[]):unknown[] {
  return items.map(item=>{
    const metadata=item.metadata??{};
    const base={kind:item.kind,name:metadata.name,namespace:metadata.namespace,createdAt:metadata.creationTimestamp};
    if(item.kind==='Event') return {
      ...base, reason:item.reason,
      message:typeof item.message==='string'?SecretRedactor.redact(item.message).slice(0,2000):undefined,
      type:item.type, firstTimestamp:item.firstTimestamp, lastTimestamp:item.lastTimestamp, count:item.count,
    };
    if(item.kind==='Pod') {
      const containers=(item.status?.containerStatuses??[]).map((container:any)=>{
        let state:unknown={running:Boolean(container.state?.running)};
        if(container.state?.waiting) state={waiting:{reason:container.state.waiting.reason,message:String(container.state.waiting.message??'').slice(0,1000)}};
        if(container.state?.terminated) state={terminated:{reason:container.state.terminated.reason,exitCode:container.state.terminated.exitCode,finishedAt:container.state.terminated.finishedAt}};
        return {name:container.name,image:container.image,restartCount:container.restartCount,ready:container.ready,state};
      });
      return {
        ...base, phase:item.status?.phase, nodeName:item.spec?.nodeName,
        conditions:(item.status?.conditions??[]).map((condition:any)=>({type:condition.type,status:condition.status,reason:condition.reason,lastTransitionTime:condition.lastTransitionTime})),
        containers,
      };
    }
    if(item.kind==='Deployment') return {
      ...base, replicas:item.status?.replicas, readyReplicas:item.status?.readyReplicas,
      updatedReplicas:item.status?.updatedReplicas, availableReplicas:item.status?.availableReplicas,
      conditions:(item.status?.conditions??[]).map((condition:any)=>({type:condition.type,status:condition.status,reason:condition.reason,message:String(condition.message??'').slice(0,1000),lastUpdateTime:condition.lastUpdateTime})),
    };
    return base;
  });
}

function configuredUrl(name: string): URL | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a plain HTTP(S) base URL without credentials, query, or fragment`);
  }
  return url;
}

async function getJson(base: URL, path: string, params: Record<string,string>): Promise<unknown> {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers: Record<string,string> = { accept: 'application/json' };
  const bearer = process.env.RELAY_TELEMETRY_BEARER_TOKEN;
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error' });
  if (!response.ok) throw new Error(`Telemetry endpoint returned HTTP ${response.status}`);
  const declaredLength=Number(response.headers.get('content-length')??0);
  if(declaredLength>MAX_BYTES)throw new Error('Telemetry response exceeded the 1 MB limit');
  if(!response.body)throw new Error('Telemetry endpoint returned an empty response');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw new Error('Telemetry response exceeded the 1 MB limit');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(merged);
  return bounded(JSON.parse(text));
}

export class ReadOnlyInvestigationConnectors {
  async collect(incident: IncidentInput): Promise<Collection[]> {
    const end = incident.endsAt ? new Date(incident.endsAt) : new Date();
    const start = new Date(Math.max(new Date(incident.startsAt).getTime(), end.getTime() - WINDOW_MS));
    const range = { start: start.toISOString(), end: end.toISOString() };
    const jobs: Array<Promise<Collection>> = [];
    jobs.push(this.kubernetes(incident));
    for (const [source, env, path, params] of [
      ['prometheus','RELAY_PROMETHEUS_URL','/api/v1/query_range',{query:`up{service="${incident.service.replace(/["\\]/g,'')}"}`,start:String(start.getTime()/1000),end:String(end.getTime()/1000),step:'30s'}],
      ['loki','RELAY_LOKI_URL','/loki/api/v1/query_range',{query:`{service="${incident.service.replace(/["\\]/g,'')}"}`,start:String(start.getTime()*1e6),end:String(end.getTime()*1e6),limit:'200'}],
      ['tempo','RELAY_TEMPO_URL','/api/search',{q:`{ resource.service.name = "${incident.service.replace(/["\\]/g,'')}" }`,start:String(Math.floor(start.getTime()/1000)),end:String(Math.floor(end.getTime()/1000)),limit:'100'}],
    ] as const) {
      jobs.push(this.telemetry(source, env, path, params, range));
    }
    return Promise.all(jobs);
  }

  private async telemetry(source:string, env:string, path:string, params:Record<string,string>, range:unknown):Promise<Collection> {
    const query = { path, params, range };
    try {
      const base = configuredUrl(env);
      if (!base) return {source, query, status:'unavailable', error:`${env} is not configured`};
      return {source, query, status:'ok', data: await getJson(base, path, params)};
    } catch (error) {
      return {source, query, status:'error', error: SecretRedactor.redact(error instanceof Error ? error.message : String(error))};
    }
  }

  private async kubernetes(incident:IncidentInput):Promise<Collection> {
    const args = ['get','pods,deployments,events','--all-namespaces','-o','json','--request-timeout=15s'];
    const context = process.env.RELAY_KUBERNETES_CONTEXT;
    if (context) args.push('--context', context);
    const query = { method:'GET', verb:'GET', resource:'pods,deployments,events', namespace:'all', service:incident.service };
    try {
      KubernetesReadOnlyGuard.assertReadOnly('GET', 'GET');
      const { stdout } = await execFileAsync(process.env.KUBECTL_PATH || 'kubectl', args, { timeout:REQUEST_TIMEOUT_MS, maxBuffer:MAX_BYTES, windowsHide:true, env:{ PATH:process.env.PATH, HOME:process.env.HOME, KUBECONFIG:process.env.KUBECONFIG } });
      const payload = JSON.parse(stdout);
      const items = Array.isArray(payload.items) ? payload.items.filter((item:any) => {
        const labels = item.metadata?.labels ?? {};
        const owner = item.metadata?.name ?? '';
        if(item.kind==='Event')return String(item.involvedObject?.name??'').includes(incident.service)||String(item.message??'').includes(incident.service);
        return labels.app === incident.service || labels['app.kubernetes.io/name'] === incident.service || owner.includes(incident.service);
      }) : [];
      return { source:'kubernetes', query, status:'ok', data:bounded({apiVersion:payload.apiVersion,items:projectKubernetesItems(items)}) };
    } catch (error) {
      return { source:'kubernetes', query, status:'error', error:error instanceof Error && error.name==='TimeoutError'?'kubectl request timed out':'kubectl collection failed; check local read-only credentials and cluster connectivity' };
    }
  }
}

export function makeEvidence(source:string, data:unknown) {
  const text = InjectionSanitizer.sanitize(JSON.stringify(bounded(data)));
  return { id:randomUUID(), source, data:text, collectedAt:new Date().toISOString() };
}
