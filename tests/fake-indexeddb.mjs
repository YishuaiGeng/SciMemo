/**
 * Minimal IndexedDB stand-in for failure-path tests.
 *
 * Not a general implementation. It models only the behaviours the driver depends on,
 * and specifically the ones that make storage failures easy to get wrong:
 *
 *  - a request error fires on the request and bubbles to tx.onerror while tx.error is
 *    still null, then the transaction aborts with tx.error set;
 *  - a put can succeed and the transaction can still abort at commit (Chrome reports
 *    quota exhaustion this way), in which case nothing is written;
 *  - an explicit tx.abort() discards staged writes and fires onabort with error null;
 *  - db.transaction() throws InvalidStateError synchronously once the connection was
 *    closed, e.g. by onversionchange when another tab upgrades the database.
 *
 * `faults` may be changed between operations to simulate a transient failure.
 */
const domError=(name,message)=>new DOMException(message,name);

class FakeRequest {
  result=undefined;error=null;onsuccess=null;onerror=null;onupgradeneeded=null;onblocked=null;
}

class FakeTransaction {
  error=null;oncomplete=null;onerror=null;onabort=null;
  #idb;#mode;#staged=new Map();#queue=[];#scheduled=false;#finished=false;
  constructor(idb,mode){this.#idb=idb;this.#mode=mode;this.#schedule();}
  objectStore(){
    const tx=this;
    return {
      get(key){return tx.#enqueue(req=>{req.result=tx.#staged.has(key)?structuredClone(tx.#staged.get(key)):structuredClone(tx.#idb.data.get(key));});},
      put(value,key){return tx.#enqueue(()=>{
        if(tx.#idb.faults.putQuota)throw domError('QuotaExceededError','The quota has been exceeded.');
        tx.#staged.set(key,structuredClone(value));
      });},
    };
  }
  abort(){
    if(this.#finished)return;
    this.#finished=true;this.#staged.clear();this.error=null;
    setTimeout(()=>this.onabort?.({target:this}),0);
  }
  #enqueue(op){const req=new FakeRequest();this.#queue.push({req,op});this.#schedule();return req;}
  #schedule(){if(this.#scheduled||this.#finished)return;this.#scheduled=true;setTimeout(()=>this.#step(),0);}
  #fail(error,event){
    this.#finished=true;this.#staged.clear();
    if(event)this.onerror?.(event);
    this.error=error;
    this.onabort?.({target:this});
  }
  #step(){
    this.#scheduled=false;
    if(this.#finished)return;
    const next=this.#queue.shift();
    if(next){
      try{next.op(next.req);}
      catch(error){
        next.req.error=error;
        const event={target:next.req};
        next.req.onerror?.(event);
        return this.#fail(error,event);
      }
      next.req.onsuccess?.({target:next.req});
      if(this.#finished||this.#queue.length)return this.#schedule();
    }
    if(this.#mode==='readwrite'&&this.#idb.faults.commitQuota)
      return this.#fail(domError('QuotaExceededError','Commit aborted: quota exceeded.'),null);
    for(const [key,value] of this.#staged)this.#idb.data.set(key,value);
    this.#finished=true;
    this.oncomplete?.({target:this});
  }
}

class FakeDatabase {
  onversionchange=null;closed=false;
  #idb;
  constructor(idb){this.#idb=idb;}
  createObjectStore(){}
  close(){this.closed=true;}
  transaction(_store,mode='readonly'){
    if(this.closed)throw domError('InvalidStateError','The database connection is closing.');
    return new FakeTransaction(this.#idb,mode);
  }
}

export class FakeIndexedDB {
  data=new Map();faults={};connections=[];#created=false;
  constructor(faults={}){this.faults=faults;}
  open(){
    const req=new FakeRequest();
    queueMicrotask(()=>{
      if(this.faults.openError){req.error=domError('UnknownError','Internal error opening backing store.');return req.onerror?.({target:req});}
      if(this.faults.blocked)return req.onblocked?.({target:req});
      const db=new FakeDatabase(this);this.connections.push(db);req.result=db;
      if(!this.#created){this.#created=true;req.onupgradeneeded?.({target:req});}
      req.onsuccess?.({target:req});
    });
    return req;
  }
  /** What another tab's higher-version open() does to this tab's connection. */
  versionChangeFromAnotherTab(){for(const db of this.connections)db.onversionchange?.();}
}
