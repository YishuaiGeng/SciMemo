import { emptyWorkspace,now,uid,type Doc,type Driver,type Workspace,type SubmissionStatus } from './types.js';
import {addSubmission,addSubmissionEvent,validateDoc} from './domain.js';
import {importBackup} from './backup.js';
import {DomainError} from './errors.js';
import {demoDocs} from './demo.js';
export class WorkspaceService {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(public readonly driver:Driver){}
  load(){return this.driver.load();}
  /** Lock mutations within this process; driver CAS detects another tab/window. */
  exclusive<T>(work:()=>Promise<T>):Promise<T>{
    const p=this.queue.then(work,work);this.queue=p.catch(()=>{});return p;
  }
  async update(fn:(state:Workspace)=>void):Promise<Workspace>{
    return this.exclusive(async()=>{const before=await this.load(),next=structuredClone(before);fn(next);await this.commit(before,next);return next;});
  }
  async commit(before:Workspace,next:Workspace){next.localRevision=before.localRevision+1;await this.driver.save(before.localRevision,next);}
  put(input:Doc){const doc=structuredClone(input);validateDoc(doc);return this.update(ws=>{
    if(ws.conflicts.some(c=>!c.resolved&&c.local.id===doc.id))throw new DomainError('UNRESOLVED_CONFLICT','请先处理这条记录的同步冲突。');
    const old=ws.docs[doc.id];
    if(old&&(old.kind!==doc.kind||old.createdAt!==doc.createdAt))throw new DomainError('IMMUTABLE','记录类型和创建时间不可更改。');
    // A stale editor cannot overwrite a newer local version silently.
    if(old&&(old.updatedAt!==doc.updatedAt||old.version!==doc.version))throw new DomainError('STALE_EDITOR','这条记录已在其他位置更新，请重新打开后编辑。');
    const next=structuredClone(doc);next.updatedAt=new Date(Math.max(Date.now(),old?Date.parse(old.updatedAt)+1:0)).toISOString();next.version=old?.version??0;
    validateDoc(next);
    const pending=ws.outbox.find(x=>x.doc.id===doc.id);
    ws.outbox=ws.outbox.filter(x=>x.doc.id!==doc.id);
    // New content gets a new idempotency key. Existing base version remains intact.
    ws.outbox.push({opId:uid(),baseVersion:pending?.baseVersion??next.version,doc:next});ws.docs[next.id]=next;
  });}
  /** Use-case commands keep submission policy and import transactions out of UI code. */
  recordSubmission(paper:Doc<'paper'>,target:Parameters<typeof addSubmission>[1]){
    return this.put({...paper,data:addSubmission(paper.data,target)});
  }
  recordSubmissionEvent(paper:Doc<'paper'>,submissionId:string,event:{status:SubmissionStatus;occurredOn:string|null;note:string}){
    return this.put({...paper,data:addSubmissionEvent(paper.data,submissionId,event.status,event.occurredOn,event.note)});
  }
  restoreBackup(text:string){return this.update(ws=>Object.assign(ws,importBackup(text,ws)));}
  loadDemo(){return this.update(ws=>{
    if(Object.keys(ws.docs).length||ws.outbox.length||ws.conflicts.length||ws.serverId)throw new DomainError('PRECONDITION','演示数据只能加载到全新空工作区。');
    for(const doc of demoDocs()){validateDoc(doc);ws.docs[doc.id]=doc;ws.outbox.push({opId:uid(),baseVersion:0,doc});}
  });}
  async remove(id:string){const ws=await this.load(),d=ws.docs[id];if(!d)throw new DomainError('NOT_FOUND','记录不存在。');return this.put({...d,deleted:true});}
  async restore(id:string){const ws=await this.load(),d=ws.docs[id];if(!d)throw new DomainError('NOT_FOUND','记录不存在。');return this.put({...d,deleted:false});}
  async resolve(conflictId:string,choice:'local'|'remote'){
    return this.update(ws=>{const c=ws.conflicts.find(x=>x.id===conflictId&&!x.resolved);if(!c)throw new DomainError('NOT_FOUND','冲突不存在。');
      c.resolved=true;ws.outbox=ws.outbox.filter(o=>o.doc.id!==c.local.id);
      if(choice==='remote'&&c.remote){ws.docs[c.local.id]=structuredClone(c.remote);}
      else if(choice==='remote'){delete ws.docs[c.local.id];}
      else {const doc={...structuredClone(c.local),version:c.remote?.version??0,updatedAt:now()};ws.docs[doc.id]=doc;ws.outbox.push({opId:uid(),baseVersion:doc.version,doc});}
      // Both original versions remain in conflict history / JSON exports.
    });
  }
}
export class MemoryDriver implements Driver {
  readonly name='Memory (test only)';private state=emptyWorkspace();
  async load(){return structuredClone(this.state);}
  async save(expected:number,next:Workspace){if(this.state.localRevision!==expected)throw new DomainError('LOCAL_CONFLICT','本地版本冲突，请重新加载。');this.state=structuredClone(next);}
}
