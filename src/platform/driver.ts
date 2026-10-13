import { emptyWorkspace, type Driver, type Workspace } from '../core/types.js';
import {DomainError} from '../core/errors.js';

/** Human-readable cause from an Error, a DOMException, or the plain string Tauri rejects with. */
function causeOf(error:unknown):string {
  if(typeof error==='string')return error;
  if(error&&typeof error==='object'){
    const {name,message}=error as {name?:unknown;message?:unknown};
    const parts=[name,message].filter((part):part is string=>typeof part==='string'&&part.length>0);
    return [...new Set(parts)].join(': ');
  }
  return '';
}
const withCause=(text:string,error:unknown)=>{const cause=causeOf(error);return cause?`${text}（${cause}）`:text;};

/** A failed write must never look like a successful one. */
export const writeFailure=(error:unknown):DomainError =>
  new DomainError('STORAGE',withCause('工作区未能保存，本次编辑没有写入。请保留当前内容并重试。',error));
/** A failed read is not "your edit was lost" — nothing was being written. */
export const readFailure=(error:unknown):DomainError =>
  new DomainError('STORAGE',withCause('本机工作区无法读取。不会改用临时内存存储；请重新打开应用，必要时先导出备份。',error));

/**
 * Stable prefix the native side puts on a compare-and-swap mismatch.
 *
 * Rust commands reject with plain strings. Without a stable marker, a revision
 * conflict (another window wrote first; retry after reload) is indistinguishable
 * from a real I/O failure and would be shown as a sticky storage alarm.
 */
export const NATIVE_LOCAL_CONFLICT='LOCAL_CONFLICT:';

/** Map a native save rejection onto the error taxonomy. */
export function classifyNativeSave(error:unknown):DomainError {
  if(causeOf(error).startsWith(NATIVE_LOCAL_CONFLICT))
    return new DomainError('LOCAL_CONFLICT','另一个窗口已先保存，本次编辑没有写入。请重新加载后重试。');
  return writeFailure(error);
}

/**
 * IndexedDB driver. The factory is injectable so failure paths (quota, blocked
 * upgrade, closed connection, aborted commit) can be exercised without a browser.
 */
export class IndexedDbDriver implements Driver {
  readonly name='浏览器 IndexedDB（开发／预览）';
  private ready:Promise<IDBDatabase>;
  constructor(factory:IDBFactory=indexedDB,dbName='scimemo-v1'){this.ready=new Promise((resolve,reject)=>{
    let req:IDBOpenDBRequest;
    try{req=factory.open(dbName,1);}catch(error){reject(readFailure(error));return;}
    req.onupgradeneeded=()=>req.result.createObjectStore('workspace');
    // Another tab upgrading the database closes this connection; later calls then fail
    // with InvalidStateError, which openTransaction classifies below.
    req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>reject(readFailure(req.error));
    req.onblocked=()=>reject(new DomainError('LOCAL_CONFLICT','数据库升级被其他标签页阻塞，请关闭其他标签页后重试。'));
  });}
  /**
   * db.transaction() throws synchronously when the connection was closed (for example
   * by a version change from another tab). Left alone, that raw InvalidStateError would
   * escape the taxonomy and be shown as a validation problem.
   */
  private openTransaction(db:IDBDatabase,mode:IDBTransactionMode,onFail:(error:unknown)=>DomainError):IDBTransaction {
    try{return db.transaction('workspace',mode);}
    catch(error){throw onFail(error);}
  }
  async load():Promise<Workspace>{const db=await this.ready;return new Promise((resolve,reject)=>{
    const tx=this.openTransaction(db,'readonly',readFailure),req=tx.objectStore('workspace').get('default');
    let result:Workspace|undefined;
    req.onsuccess=()=>{result=req.result??emptyWorkspace();};
    tx.oncomplete=()=>resolve(result??emptyWorkspace());
    tx.onerror=event=>reject(readFailure((event.target as IDBRequest|null)?.error??tx.error));
    tx.onabort=()=>reject(readFailure(tx.error));
  });}
  async save(expected:number,next:Workspace){const db=await this.ready;return new Promise<void>((resolve,reject)=>{
    const tx=this.openTransaction(db,'readwrite',writeFailure),store=tx.objectStore('workspace');let failure:DomainError|null=null;
    const req=store.get('default');req.onsuccess=()=>{
      const current:Workspace=req.result??emptyWorkspace();
      if(current.localRevision!==expected){failure=new DomainError('LOCAL_CONFLICT','其他标签页已修改数据，请重新加载后重试。');tx.abort();return;}
      store.put(next,'default');
    };
    // Resolve only on complete: a put that "succeeded" can still be rolled back by an
    // abort at commit time (Chrome reports quota exhaustion this way).
    tx.oncomplete=()=>resolve();
    // On the error event tx.error is still null; the cause lives on the failing request.
    tx.onerror=event=>{failure??=writeFailure((event.target as IDBRequest|null)?.error??tx.error);};
    // An abort without a known cause is treated as a storage failure, not guessed to be
    // a conflict: either way nothing was written, and the sticky wording is the safe one.
    tx.onabort=()=>reject(failure??writeFailure(tx.error));
  });}
}

type Invoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
const tauriInvoke:Invoke=async(command,args)=>{const {invoke}=await import('@tauri-apps/api/core');return invoke(command,args);};

export class TauriDriver implements Driver {
  readonly name='本地 SQLite';
  constructor(private readonly invoke:Invoke=tauriInvoke){}
  async load():Promise<Workspace>{try{return await this.invoke<Workspace>('read_workspace');}catch(error){throw readFailure(error);}}
  async save(expectedRevision:number,next:Workspace){try{await this.invoke('save_workspace',{expectedRevision,next});}catch(error){throw classifyNativeSave(error);}}
}
export const isNative=()=>('__TAURI_INTERNALS__' in window);
export function createDriver():Driver{return isNative()?new TauriDriver():new IndexedDbDriver();}
/**
 * Export a text file. Natively this opens the system save dialog inside the Rust
 * command (the UI never supplies a path) and writes atomically. Returns null when the
 * user cancels, which is not an error.
 */
export async function exportText(filename:string,content:string,mime='text/plain'):Promise<string|null>{
  if(isNative()){
    try{return await tauriInvoke<string|null>('export_with_dialog',{filename,content});}
    catch(error){throw new DomainError('STORAGE',`导出文件未能写入，原有文件未被改动。（${causeOf(error)}）`);}
  }
  const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);return '已交给浏览器保存';
}
