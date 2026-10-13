import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDoc,uid,emptyWorkspace} from '../.test-build/core/types.js';
import {WorkspaceService,MemoryDriver} from '../.test-build/core/workspace.js';
import {exportBackup} from '../.test-build/core/backup.js';
import {auditReferences} from '../.test-build/core/references.js';

const paper=()=>makeDoc('paper',{title:'Fictional paper',summary:'',stage:'writing',nextAction:'',tags:[],archived:false,targets:[],submissions:[]});
const note=()=>makeDoc('note',{title:'Fictional idea',body:'Keep both the idea and its evidence.',noteType:'idea',paperIds:[],tags:[],pinned:false});

test('submission commands preserve stale-editor protection and atomic outbox',async()=>{
  const service=new WorkspaceService(new MemoryDriver()),p=paper();
  await service.put(p);
  const saved=(await service.load()).docs[p.id];
  await service.recordSubmission(saved,{venueName:'Fictional journal'});
  const before=await service.load(),current=before.docs[p.id];
  assert.equal(current.data.submissions[0].submittedOn,null);
  assert.deepEqual(before.outbox[0].doc,current);
  await assert.rejects(()=>service.recordSubmission(saved,{venueName:'Stale target'}),/其他位置/);
  assert.deepEqual(await service.load(),before);
  await service.recordSubmissionEvent(current,current.data.submissions[0].id,{status:'major_revision',occurredOn:null,note:'Add a sensitivity analysis'});
  const after=await service.load();
  assert.equal(after.docs[p.id].data.submissions[0].events.length,2);
  assert.deepEqual(after.outbox[0].doc,after.docs[p.id]);
});

test('failed persistence leaves both submission history and outbox unchanged',async()=>{
  const driver=new MemoryDriver(),service=new WorkspaceService(driver),p=paper();
  await service.put(p);
  const before=await service.load();
  driver.save=async()=>{throw new Error('disk full');};
  await assert.rejects(()=>service.recordSubmission(before.docs[p.id],{venueName:'Fictional journal'}),/disk full/);
  assert.deepEqual(await service.load(),before);
});

test('local edits cannot change immutable document identity',async()=>{
  const service=new WorkspaceService(new MemoryDriver()),d=note();
  await service.put(d);
  const before=await service.load(),saved=before.docs[d.id];
  await assert.rejects(()=>service.put({...saved,createdAt:'2000-01-01T00:00:00Z'}),/不可更改/);
  await assert.rejects(()=>service.put({...paper(),id:d.id,createdAt:saved.createdAt,updatedAt:saved.updatedAt}),/不可更改/);
  assert.deepEqual(await service.load(),before);
});

test('queued save snapshots caller input before asynchronous work',async()=>{
  const service=new WorkspaceService(new MemoryDriver()),d=note(),body=d.data.body;
  const saving=service.put(d);
  d.data.body='Caller changed this object before the queue ran.';
  await saving;
  assert.equal((await service.load()).docs[d.id].data.body,body);
});

test('demo empty-workspace check occurs inside the transaction queue',async()=>{
  const service=new WorkspaceService(new MemoryDriver()),d=note();
  const saving=service.put(d),seeding=service.loadDemo();
  await saving;
  await assert.rejects(()=>seeding,/全新空工作区/);
  assert.deepEqual(Object.keys((await service.load()).docs),[d.id]);
});

test('portable restore is one service transaction and cannot race an existing edit',async()=>{
  const source=emptyWorkspace(),d=note();source.docs[d.id]=d;
  const service=new WorkspaceService(new MemoryDriver());
  await service.restoreBackup(exportBackup(source));
  const restored=await service.load();
  assert.equal(restored.localRevision,1);
  assert.equal(restored.docs[d.id].version,0);
  assert.deepEqual(restored.outbox[0].doc,restored.docs[d.id]);
  const other=new WorkspaceService(new MemoryDriver());
  const saving=other.put(note()),restoring=other.restoreBackup(exportBackup(source));
  await saving;
  await assert.rejects(()=>restoring,/全新空工作区/);
  assert.equal(Object.keys((await other.load()).docs).length,1);
});

test('reference audit distinguishes unavailable targets without mutating history',()=>{
  const ws=emptyWorkspace(),p=paper(),n=note(),deleted=paper();deleted.deleted=true;
  n.data.paperIds=[p.id,deleted.id,uid(),n.id];
  ws.docs[p.id]=p;ws.docs[deleted.id]=deleted;ws.docs[n.id]=n;
  const before=structuredClone(ws),issues=auditReferences(ws);
  assert.deepEqual(issues.map(i=>i.reason),['deleted','missing','wrong_kind']);
  assert.ok(issues.every(i=>i.sourceId===n.id));
  assert.deepEqual(ws,before);
  n.deleted=true;
  assert.deepEqual(auditReferences(ws),[]);
});

test('reference audit keeps manual submission targets valid and detects missing editions',async()=>{
  const service=new WorkspaceService(new MemoryDriver()),p=paper();
  await service.put(p);
  await service.recordSubmission((await service.load()).docs[p.id],{venueName:'Manual fictional target'});
  const ws=await service.load();
  assert.deepEqual(auditReferences(ws),[]);
  const venue=makeDoc('venue',{name:'Fictional conference',abbreviation:'',venueType:'conference',website:'',submissionUrl:'',notes:'',checkedOn:null,editions:[]});
  ws.docs[venue.id]=venue;
  const submission=ws.docs[p.id].data.submissions[0];submission.venueId=venue.id;submission.editionId=uid();
  assert.equal(auditReferences(ws)[0].reason,'missing_edition');
  submission.venueId=null;
  assert.equal(auditReferences(ws)[0].reason,'missing_parent');
  assert.equal(submission.venueNameSnapshot,'Manual fictional target');
});
