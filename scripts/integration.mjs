/** Run against a separately started temporary test server. Never use a real workspace. */
import assert from 'node:assert/strict';
import {WorkspaceService,MemoryDriver} from '../.integration-build/core/workspace.js';
import {makeDoc} from '../.integration-build/core/types.js';
import {syncOnce} from '../.integration-build/core/sync.js';
import {httpTransport} from '../.integration-build/platform/http-sync.js';
const endpoint=process.env.SCIMEMO_TEST_URL;
const token=process.env.SCIMEMO_TEST_TOKEN;
if(!endpoint||!token)throw new Error('Set SCIMEMO_TEST_URL and SCIMEMO_TEST_TOKEN for a temporary test-only server.');
const t=httpTransport(endpoint,token),a=new WorkspaceService(new MemoryDriver()),b=new WorkspaceService(new MemoryDriver());
const d=makeDoc('note',{title:'integration test',body:'initial',noteType:'idea',paperIds:[],tags:[],pinned:false});
await a.put(d);await syncOnce(a,t);await syncOnce(b,t);
assert.equal((await b.load()).docs[d.id].data.body,'initial');
const da=(await a.load()).docs[d.id],db=(await b.load()).docs[d.id];
await a.put({...da,data:{...da.data,body:'device A'}});
await b.put({...db,data:{...db.data,body:'device B'}});
await syncOnce(a,t);await syncOnce(b,t);
const c=(await b.load()).conflicts.find(c=>c.local.id===d.id);
assert.equal(c.local.data.body,'device B');assert.equal(c.remote.data.body,'device A');
await b.resolve(c.id,'local');await syncOnce(b,t);await syncOnce(a,t);
assert.equal((await a.load()).docs[d.id].data.body,'device B');
await a.remove(d.id);await syncOnce(a,t);await syncOnce(b,t);
assert.equal((await b.load()).docs[d.id].deleted,true);
// The server commits, then the client loses the HTTP acknowledgement. The opId
// must survive locally so retrying does not append a second change remotely.
const lost=makeDoc('note',{title:'fictional lost acknowledgement',body:'retry once',noteType:'note',paperIds:[],tags:[],pinned:false});
await a.put(lost);const beforeLost=await a.load();
await assert.rejects(()=>syncOnce(a,{...t,push:async(...args)=>{
  await t.push(...args);throw new Error('simulated lost HTTP acknowledgement');
}}),/lost HTTP acknowledgement/);
assert.deepEqual(await a.load(),beforeLost);
await syncOnce(a,t);
const lostChanges=await t.pull(beforeLost.cursor,beforeLost.serverId);
assert.equal(lostChanges.changes.filter(c=>c.doc.id===lost.id).length,1);
assert.equal((await a.load()).outbox.length,0);

// Twelve valid documents exceed the server's 5 MB request limit together.
// Repeated manual syncs must drain them in smaller UTF-8 byte-limited batches.
const large=new WorkspaceService(new MemoryDriver()),largeIds=[];
for(let i=0;i<12;i++){
  const doc=makeDoc('note',{title:`fictional batch ${i}`,body:'研'.repeat(145_000),noteType:'note',paperIds:[],tags:[],pinned:false});
  largeIds.push(doc.id);await large.put(doc);
}
let requests=0;
const limited={...t,push:async(operations,serverId)=>{
  requests++;
  assert.ok(new TextEncoder().encode(JSON.stringify({serverId,operations})).length<=4_000_000);
  return t.push(operations,serverId);
}};
await syncOnce(large,limited);
assert.ok((await large.load()).outbox.length>0);
await syncOnce(large,limited);
assert.equal((await large.load()).outbox.length,0);assert.equal(requests,2);
await syncOnce(b,t);
for(const id of largeIds)assert.equal((await b.load()).docs[id].data.body.length,145_000);
console.log('PASS: real HTTP roundtrip, conflict, deletion, lost-ack replay and byte-limited large batches');
