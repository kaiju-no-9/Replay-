export interface UntrustedPayload<T=string>{data:T;untrusted:true;sanitizedAt:string}
export class InjectionSanitizer {
  static sanitize(text:string):string { return text.replace(/<\/?untrusted_telemetry>/gi,'&lt;untrusted_telemetry&gt;').replace(/###\s*(System|Human|Assistant)\s*:/gi,'### [UNTRUSTED ROLE TEXT] $1:').replace(/\[\/?INST\]/gi,'[UNTRUSTED TOKEN]').replace(/<\|im_(?:start|end)\|>/gi,'&lt;|im_token|&gt;'); }
  static wrap<T extends string>(data:T):UntrustedPayload<string>{return {data:this.sanitize(data),untrusted:true,sanitizedAt:new Date().toISOString()};}
}
