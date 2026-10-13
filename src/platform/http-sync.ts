import type { Operation, PullResult, PushResult, SyncTransport } from '../core/types.js';
export function httpTransport(base:string,token:string):SyncTransport {
  const u=new URL(base);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('请使用不含账号、参数或片段的服务地址。');
  if(u.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('远程同步必须使用 HTTPS；HTTP 仅允许本机调试。');
  if(token.length<32)throw new Error('同步令牌至少需要 32 个字符。');
  const root=base.replace(/\/+$/,'');
  async function request<T>(path:string,init:RequestInit={}):Promise<T>{
    const r=await fetch(root+path,{...init,redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(20000)});
    if(!r.ok){let detail='';try{const b=await r.json();detail=typeof b.detail==='string'?b.detail:'';}catch{/* no body */}throw new Error(`同步失败 (${r.status})${detail?': '+detail:''}`);}
    return r.json() as Promise<T>;
  }
  return {info:()=>request<{serverId:string;protocol:1}>('/v1/info'),
    push:(operations:Operation[],serverId:string)=>request<{results:PushResult[]}>('/v1/sync/push',{method:'POST',body:JSON.stringify({serverId,operations})}),
    pull:(cursor:number,serverId:string)=>request<PullResult>(`/v1/sync/pull?cursor=${cursor}&serverId=${encodeURIComponent(serverId)}`)};
}
