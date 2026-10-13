import {now,type Doc,type Operation,type PullResult,type PushResult,type SyncTransport} from './types.js';
import {validateDoc} from './domain.js';
import {WorkspaceService} from './workspace.js';
import {DomainError,transportFailure} from './errors.js';

// Leave room below the service's 5 MB request limit for transport/proxy overhead.
const MAX_PUSH_BYTES=4_000_000;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const counter=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
function identity(a:Doc,b:Doc){
  if(a.id!==b.id||a.kind!==b.kind||a.createdAt!==b.createdAt)throw new DomainError('SYNC_PROTOCOL','服务端记录身份与本机记录不匹配。');
}
function remoteDoc(value:unknown):asserts value is Doc {
  validateDoc(value);
  if(!counter(value.version)||value.version===0)throw new DomainError('SYNC_PROTOCOL','非法的服务端记录版本。');
}
function batch(operations:Operation[],serverId:string):Operation[] {
  const result:Operation[]=[];
  let size=bytes({serverId,operations:[]});
  for(const op of operations.slice(0,100)){
    const extra=bytes(op)+(result.length?1:0);
    if(size+extra>MAX_PUSH_BYTES){
      if(!result.length)throw new DomainError('VALIDATION','单条待同步操作超过 4 MB，请导出备份并缩小该记录后重试。');
      break;
    }
    result.push(op);size+=extra;
  }
  return result;
}
function acknowledgements(value:unknown,pending:Operation[]):PushResult[] {
  if(!object(value)||!Array.isArray(value.results)||value.results.length!==pending.length)throw new DomainError('SYNC_PROTOCOL','同步确认不完整，待同步队列未清除。');
  const seen=new Set<string>();
  for(const r of value.results){
    if(!object(r)||typeof r.opId!=='string')throw new DomainError('SYNC_PROTOCOL','非法的同步确认。');
    const op=pending.find(x=>x.opId===r.opId);
    if(!op||seen.has(r.opId))throw new DomainError('SYNC_PROTOCOL','非法的同步确认。');
    seen.add(r.opId);
    if(r.doc!==null){remoteDoc(r.doc);identity(op.doc,r.doc);}
    if(r.status==='accepted'){
      if(!r.doc||!counter(op.baseVersion+1)||r.doc.version!==op.baseVersion+1)throw new DomainError('SYNC_PROTOCOL','同步确认的版本不匹配。');
      if(!same(r.doc,{...op.doc,version:op.baseVersion+1}))throw new DomainError('SYNC_PROTOCOL','同步确认的内容与提交内容不匹配。');
    }else if(r.status==='conflict'){
      if((r.doc?.version??0)===op.baseVersion)throw new DomainError('SYNC_PROTOCOL','非法的同步冲突版本。');
    }else throw new DomainError('SYNC_PROTOCOL','未知同步结果。');
  }
  return value.results as PushResult[];
}
function pageResult(value:unknown,cursor:number,serverId:string):PullResult {
  if(!object(value)||value.serverId!==serverId||!counter(value.cursor)||value.cursor<cursor||typeof value.hasMore!=='boolean'||!Array.isArray(value.changes)||value.changes.length>1000)throw new DomainError('SYNC_PROTOCOL','非法同步分页或游标。');
  let previous=cursor;
  for(const change of value.changes){
    if(!object(change)||!counter(change.seq)||change.seq<=previous||change.seq>value.cursor)throw new DomainError('SYNC_PROTOCOL','非法同步变更顺序。');
    remoteDoc(change.doc);previous=change.seq;
  }
  if(previous!==value.cursor||(value.hasMore&&previous===cursor))throw new DomainError('SYNC_PROTOCOL','同步游标与变更记录不匹配。');
  return value as unknown as PullResult;
}
export async function syncOnce(service:WorkspaceService,transport:SyncTransport){
  return service.exclusive(async()=>{
    const before=await service.load(),ws=structuredClone(before);
    let info;
    try{info=await transport.info();}catch(error){throw transportFailure(error);}
    if(!object(info)||info.protocol!==1)throw new DomainError('SYNC_PROTOCOL','同步协议版本不匹配。');
    if(!uuid(info.serverId))throw new DomainError('SYNC_PROTOCOL','非法的服务端工作区标识。');
    if(ws.serverId&&ws.serverId!==info.serverId)throw new DomainError('SYNC_PROTOCOL','服务端工作区标识已变化。为避免覆盖，已停止同步；请导出备份后检查服务器。');
    ws.serverId=info.serverId;
    const pending=batch(structuredClone(ws.outbox),info.serverId);
    let pushed;
    try{pushed=await transport.push(pending,info.serverId);}catch(error){throw transportFailure(error);}
    const results=acknowledgements(pushed,pending);
    for(const r of results){
      const op=pending.find(x=>x.opId===r.opId)!;
      if(r.status==='accepted')ws.docs[op.doc.id]=r.doc!;
      else ws.conflicts.push({id:op.opId,local:op.doc,remote:r.doc,detectedAt:now(),resolved:false});
      ws.outbox=ws.outbox.filter(x=>x.opId!==r.opId);
    }
    const apply=(doc:Doc)=>{
      const old=ws.docs[doc.id];if(old)identity(old,doc);
      const conflict=ws.conflicts.find(c=>!c.resolved&&c.local.id===doc.id);
      if(conflict){
        if(conflict.remote?.version===doc.version&&!same(conflict.remote,doc))throw new DomainError('SYNC_PROTOCOL','同一服务端版本包含不同内容。');
        if(!conflict.remote||doc.version>conflict.remote.version)conflict.remote=doc;
        return;
      }
      // Do not overwrite an edit that has not been sent in this batch.
      if(ws.outbox.some(o=>o.doc.id===doc.id))return;
      if(old?.version===doc.version&&!same(old,doc))throw new DomainError('SYNC_PROTOCOL','同一服务端版本包含不同内容。');
      if(!old||doc.version>old.version)ws.docs[doc.id]=doc;
    };
    for(let page=0;page<100;page++){
      let page0;
      try{page0=await transport.pull(ws.cursor,info.serverId);}catch(error){throw transportFailure(error);}
      const pull=pageResult(page0,ws.cursor,info.serverId);
      for(const change of pull.changes)apply(change.doc);
      ws.cursor=pull.cursor;if(!pull.hasMore)break;
      if(page===99)throw new DomainError('SYNC_PROTOCOL','同步分页超过上限，未提交本地更改。');
    }
    // Lost HTTP acknowledgements replay safely because opId is retained until this commit.
    await service.commit(before,ws);return ws;
  });
}
