import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDoc,uid} from '../.test-build/core/types.js';
import {MemoryDriver,WorkspaceService} from '../.test-build/core/workspace.js';
import {syncOnce} from '../.test-build/core/sync.js';

const service=()=>new WorkspaceService(new MemoryDriver());
const note=(body='fictional protocol test')=>makeDoc('note',{title:'',body,noteType:'idea',paperIds:[],tags:[],pinned:false});
class Server {
  id=uid();docs=new Map();operations=new Map();changes=[];batches=[];
  info=async()=>({serverId:this.id,protocol:1});
  push=async(operations,serverId)=>{
    this.batches.push(structuredClone({serverId,operations}));
    return {results:operations.map(op=>{
      if(this.operations.has(op.opId))return structuredClone(this.operations.get(op.opId));
      const old=this.docs.get(op.doc.id);
      const doc={...structuredClone(op.doc),version:op.baseVersion+1};
      const result=(old?.version??0)!==op.baseVersion
        ?{opId:op.opId,status:'conflict',doc:old??null}
        :{opId:op.opId,status:'accepted',doc};
      if(result.status==='accepted'){
        this.docs.set(doc.id,doc);this.changes.push({seq:this.changes.length+1,doc});
      }
      this.operations.set(op.opId,structuredClone(result));return structuredClone(result);
    })};
  };
  pull=async(cursor)=>({serverId:this.id,changes:structuredClone(this.changes.filter(c=>c.seq>cursor)),cursor:this.changes.length,hasMore:false});
}
async function seeded(){const s=service(),server=new Server(),doc=note();await s.put(doc);return {s,server,doc};}
const mutatedPush=(server,mutate)=>({...server,push:async(...args)=>mutate(await server.push(...args))});
const mutatedPull=(server,mutate)=>({...server,pull:async(...args)=>mutate(await server.pull(...args))});

test('untrusted info cannot bind an invalid workspace or start writes',async()=>{
  for(const info of [null,{},[],{serverId:'invalid',protocol:1},{serverId:uid(),protocol:'1'},{serverId:uid(),protocol:2}]){
    const {s,server}=await seeded(),before=await s.load();
    await assert.rejects(()=>syncOnce(s,{...server,info:async()=>info}));
    assert.deepEqual(await s.load(),before);assert.equal(server.batches.length,0);
  }
});
test('malformed push acknowledgements retain the entire local transaction',async()=>{
  const changes=[
    ()=>null,
    ()=>({results:null}),
    r=>({results:[...r.results,...r.results]}),
    r=>{r.results[0].opId=uid();return r;},
    r=>{r.results[0].status='unknown';return r;},
    r=>{r.results[0].doc=null;return r;},
    r=>{delete r.results[0].doc;return r;},
    r=>{r.results[0].doc.version=0;return r;},
    r=>{r.results[0].doc.version=2;return r;},
    r=>{r.results[0].doc.version=Number.MAX_SAFE_INTEGER+1;return r;},
    r=>{r.results[0].doc.id=uid();return r;},
    r=>{r.results[0].doc.createdAt='2020-01-01T00:00:00Z';return r;},
    r=>{r.results[0].doc.data.body='server changed submitted content';return r;},
    r=>{r.results[0].status='conflict';r.results[0].doc=null;return r;},
  ];
  for(const mutate of changes){
    const {s,server}=await seeded(),before=await s.load();
    await assert.rejects(()=>syncOnce(s,mutatedPush(server,mutate)));
    assert.deepEqual(await s.load(),before);
    // A real server may have committed before a malformed/lost response arrived.
    await syncOnce(s,server);assert.equal(server.changes.length,1);
    assert.equal((await s.load()).outbox.length,0);
  }
});
test('duplicate ack IDs cannot clear a different pending operation',async()=>{
  const {s,server}=await seeded();await s.put(note('second record'));const before=await s.load();
  await assert.rejects(()=>syncOnce(s,mutatedPush(server,r=>({results:[r.results[0],r.results[0]]}))));
  assert.deepEqual(await s.load(),before);
});
test('valid acknowledgement content does not depend on JSON object key order',async()=>{
  const {s,server}=await seeded();
  await syncOnce(s,mutatedPush(server,r=>{
    const d=r.results[0].doc;r.results[0].doc=Object.fromEntries(Object.entries(d).reverse());return r;
  }));
  assert.equal((await s.load()).outbox.length,0);
});
test('malformed pull pages roll back accepted writes and retain retry keys',async()=>{
  const changes=[
    ()=>null,
    r=>({...r,changes:null}),
    r=>({...r,serverId:uid()}),
    r=>({...r,cursor:'1'}),
    r=>({...r,cursor:-1}),
    r=>({...r,cursor:0.5}),
    r=>({...r,cursor:Number.MAX_SAFE_INTEGER+1}),
    r=>({...r,hasMore:'false'}),
    r=>({...r,changes:[],hasMore:true,cursor:0}),
    r=>({...r,changes:[],cursor:1}),
    r=>({...r,cursor:2}),
    r=>{r.changes[0].seq='1';return r;},
    r=>{r.changes[0].seq=0;return r;},
    r=>{r.changes[0].seq=2;return r;},
    r=>({...r,changes:[r.changes[0],r.changes[0]]}),
    r=>{r.changes[0].doc.version=0;return r;},
    r=>{r.changes[0].doc.createdAt='2020-01-01T00:00:00Z';return r;},
    r=>{r.changes[0].doc.data.body='same version with different content';return r;},
  ];
  for(const mutate of changes){
    const {s,server}=await seeded(),before=await s.load();
    await assert.rejects(()=>syncOnce(s,mutatedPull(server,mutate)));
    assert.deepEqual(await s.load(),before);
    await syncOnce(s,server);assert.equal(server.changes.length,1);
    assert.equal((await s.load()).outbox.length,0);
  }
});
test('lost push acknowledgement replays one server write',async()=>{
  const {s,server}=await seeded(),before=await s.load();
  await assert.rejects(()=>syncOnce(s,{...server,push:async(...args)=>{
    await server.push(...args);throw new Error('lost acknowledgement');
  }}),/lost acknowledgement/);
  assert.deepEqual(await s.load(),before);
  await syncOnce(s,server);assert.equal(server.changes.length,1);
});
test('byte-limited batches drain large valid records over repeated syncs',async()=>{
  const s=service(),server=new Server();
  for(let i=0;i<12;i++)await s.put(note('研'.repeat(145_000)));
  const before=await s.load(),first=await syncOnce(s,server);
  assert.ok(first.outbox.length>0&&first.outbox.length<12);
  assert.deepEqual(first.outbox,before.outbox.slice(12-first.outbox.length));
  assert.ok(new TextEncoder().encode(JSON.stringify(server.batches[0])).length<=4_000_000);
  await syncOnce(s,server);
  assert.equal((await s.load()).outbox.length,0);assert.equal(server.changes.length,12);
  assert.ok(server.batches.every(b=>new TextEncoder().encode(JSON.stringify(b)).length<=4_000_000));
});
test('operation count still limits a batch when byte size is small',async()=>{
  const s=service(),server=new Server();for(let i=0;i<101;i++)await s.put(note(String(i)));
  await syncOnce(s,server);assert.equal(server.batches[0].operations.length,100);
  assert.equal((await s.load()).outbox.length,1);
  await syncOnce(s,server);assert.equal((await s.load()).outbox.length,0);
});
test('conflict and deletion histories survive validated synchronization',async()=>{
  const {s:a,server,doc}=await seeded(),b=service();await syncOnce(a,server);await syncOnce(b,server);
  const local=(await b.load()).docs[doc.id];
  await a.remove(doc.id);await b.put({...local,data:{...local.data,body:'preserve local edit'}});
  await syncOnce(a,server);await syncOnce(b,server);
  const conflict=(await b.load()).conflicts[0];
  assert.equal(conflict.local.data.body,'preserve local edit');assert.equal(conflict.remote.deleted,true);
  await b.resolve(conflict.id,'remote');
  const resolved=await b.load();assert.equal(resolved.docs[doc.id].deleted,true);
  assert.deepEqual(resolved.conflicts[0].local,conflict.local);
  assert.deepEqual(resolved.conflicts[0].remote,conflict.remote);
  assert.equal(resolved.conflicts[0].resolved,true);
});
