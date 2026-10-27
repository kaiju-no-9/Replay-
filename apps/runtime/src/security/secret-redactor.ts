const patterns:Array<[RegExp,string]>=[
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g,'[REDACTED_GITHUB_TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/g,'[REDACTED_AWS_KEY]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,'[REDACTED_PRIVATE_KEY]'],
  [/((?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["']?)[^\s"']{8,}/gi,'$1[REDACTED]'],
  [/([a-z][a-z0-9+.-]*:\/\/[^:/\s]+:)[^@/\s]+(@)/gi,'$1[REDACTED]$2'],
  [/((?:client-key-data|client-certificate-data|token)\s*:\s*)[A-Za-z0-9+/=]{20,}/gi,'$1[REDACTED]'],
];
export class SecretRedactor {
  static redact(text:string):string { let out=text; for(const [re,repl] of patterns)out=out.replace(re,repl);return out; }
  static redactJson<T>(value:T):T { if(typeof value==='string')return this.redact(value) as T; if(Array.isArray(value))return value.map(x=>this.redactJson(x)) as T; if(value&&typeof value==='object'){const obj:Record<string,unknown>={};for(const [k,v] of Object.entries(value as object)){if(/password|secret|token|api.?key|private.?key/i.test(k))obj[k]='[REDACTED]';else obj[k]=this.redactJson(v);}return obj as T;}return value; }
}
