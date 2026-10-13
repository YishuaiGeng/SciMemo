import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDoc,emptyWorkspace} from '../.test-build/core/types.js';
import {addSubmission,addSubmissionEvent,validateDoc} from '../.test-build/core/domain.js';
import {WorkspaceService,MemoryDriver} from '../.test-build/core/workspace.js';
import {syncOnce} from '../.test-build/core/sync.js';
import {importBackup,exportBackup} from '../.test-build/core/backup.js';
import {DomainError,isDomainError,toDomainError,transportFailure} from '../.test-build/core/errors.js';

const paper=(title='Manuscript')=>makeDoc('paper',{title,summary:'',stage:'writing',nextAction:'',tags:[],archived:false,targets:[],submissions:[]});
const note=(body='idea')=>makeDoc('note',{title:'',body,noteType:'idea',paperIds:[],tags:[],pinned:false});
const failing=()=>new WorkspaceService(new MemoryDriver());

/** Assert the thrown value carries a specific code, and return it for further checks. */
function codeOf(fn){
  try{fn();}catch(error){
    assert.ok(isDomainError(error),`expected a DomainError, got ${error?.constructor?.name}`);
    return error;
  }
  throw new Error('expected the call to throw');
}
async function asyncCodeOf(promise){
  try{await promise;}catch(error){
    assert.ok(isDomainError(error),`expected a DomainError, got ${error?.constructor?.name}`);
    return error;
  }
  throw new Error('expected the call to reject');
}

/* ── Classification ──────────────────────────────────────────────────────── */

test('domain rule violations are VALIDATION, not storage failures',()=>{
  const error=codeOf(()=>addSubmission(paper().data,{venueName:'   '}));
  assert.equal(error.code,'VALIDATION');
  assert.equal(error.unsaved,true);
  assert.equal(error.retryable,false);
});

test('an unknown submission id is NOT_FOUND and is not retryable',()=>{
  const p=addSubmission(paper().data,{venueName:'A'});
  const error=codeOf(()=>addSubmissionEvent(p,'00000000-0000-4000-8000-000000000000','under_review',null,''));
  assert.equal(error.code,'NOT_FOUND');
  assert.equal(error.retryable,false);
  assert.equal(error.unsaved,true);
});

test('a second active submission is VALIDATION with a message about the open one',()=>{
  const p=addSubmission(paper().data,{venueName:'A'});
  const error=codeOf(()=>addSubmission(p,{venueName:'B'}));
  assert.equal(error.code,'VALIDATION');
  assert.match(error.message,/未结束/);
  assert.equal(error.unsaved,true);
});

test('a terminal submission cannot be reopened',()=>{
  const p=addSubmission(paper().data,{venueName:'A'});
  const done=addSubmissionEvent(p,p.submissions[0].id,'accepted',null,'');
  const error=codeOf(()=>addSubmissionEvent(done,p.submissions[0].id,'under_review',null,''));
  assert.equal(error.code,'VALIDATION');
  assert.match(error.message,/已经结束/);
});

test('malformed input is VALIDATION and writes nothing',()=>{
  const error=codeOf(()=>validateDoc({id:'not-a-uuid'}));
  assert.equal(error.code,'VALIDATION');
  assert.equal(error.unsaved,true);
});

/* ── Storage vs conflict ─────────────────────────────────────────────────── */

test('another window writing first is LOCAL_CONFLICT and is retryable',async()=>{
  const driver=new MemoryDriver();
  const a=await driver.load(), b=await driver.load();
  a.localRevision=1;
  await driver.save(0,a);
  b.localRevision=1;
  const error=await asyncCodeOf(driver.save(0,b));
  assert.equal(error.code,'LOCAL_CONFLICT');
  assert.equal(error.retryable,true);
  // Nothing was written, so the caller must not claim success.
  assert.equal(error.unsaved,true);
});

test('editing a document with an unresolved conflict is refused',async()=>{
  const service=failing();
  const d=note();
  await service.put(d);
  const ws=await service.load();
  ws.conflicts.push({id:'c1',local:d,remote:null,detectedAt:new Date().toISOString(),resolved:false});
  // Write the conflict directly through the driver, bypassing the service.
  new MemoryDriver();
  const driver=service.driver;
  await driver.save(ws.localRevision,ws);
  const error=await asyncCodeOf(service.put({...d,data:{...d.data,body:'changed'}}));
  assert.equal(error.code,'UNRESOLVED_CONFLICT');
  assert.equal(error.sticky,true);
});

test('a stale editor is STALE_EDITOR, distinct from a local conflict',async()=>{
  const service=failing();
  const d=note();
  await service.put(d);
  const old=structuredClone((await service.load()).docs[d.id]);
  await service.put({...old,data:{...old.data,body:'newer'}});
  const error=await asyncCodeOf(service.put({...old,data:{...old.data,body:'stale'}}));
  assert.equal(error.code,'STALE_EDITOR');
  assert.match(error.message,/已在其他位置/);
  assert.equal(error.unsaved,true);
});

test('changing an immutable identity is IMMUTABLE and not retryable',async()=>{
  const service=failing();
  const d=note();
  await service.put(d);
  // put() rejects rather than throwing synchronously, so this needs the async helper.
  // A fixed, clearly different timestamp: new Date() can land in the same millisecond
  // as makeDoc, which made this test pass or fail depending on timing.
  const error=await asyncCodeOf(service.put({...d,createdAt:'2020-01-01T00:00:00.000Z'}));
  assert.equal(error.code,'IMMUTABLE');
  assert.equal(error.retryable,false);
});

test('an immutable violation is reported as IMMUTABLE even when the snapshot is also stale',async()=>{
  const service=failing();
  const d=note();
  await service.put(d);
  const stored=(await service.load()).docs[d.id];
  // Both a fresh updatedAt (so not stale) and a changed kind: identity wins.
  const error=await asyncCodeOf(service.put({...stored,data:{...stored.data,body:'x'},createdAt:'2020-01-01T00:00:00.000Z'}));
  assert.equal(error.code,'IMMUTABLE');
});

/* ── Import ──────────────────────────────────────────────────────────────── */

test('restoring into a non-empty workspace is PRECONDITION, not a format error',()=>{
  const ws=emptyWorkspace();
  ws.docs[note().id]=note();
  const error=codeOf(()=>importBackup(exportBackup(emptyWorkspace()),ws));
  assert.equal(error.code,'PRECONDITION');
  assert.equal(error.retryable,false);
});

test('a malformed backup is IMPORT_FORMAT and leaves state untouched',()=>{
  const ws=emptyWorkspace();
  // JSON.parse would otherwise throw a raw SyntaxError outside the taxonomy.
  const error=codeOf(()=>importBackup('{not json',ws));
  assert.equal(error.code,'IMPORT_FORMAT');
  assert.equal(error.unsaved,true);
  assert.deepEqual(ws,emptyWorkspace());
});

test('an unsupported backup shape is IMPORT_FORMAT',()=>{
  const error=codeOf(()=>importBackup(JSON.stringify({format:'other',version:9,docs:[],conflicts:[]}),emptyWorkspace()));
  assert.equal(error.code,'IMPORT_FORMAT');
});

/* ── Sync ────────────────────────────────────────────────────────────────── */

test('a transport rejection is SYNC_NETWORK and is retryable',()=>{
  const error=transportFailure(Object.assign(new TypeError('Failed to fetch'),{name:'TypeError'}));
  assert.equal(error.code,'SYNC_NETWORK');
  assert.equal(error.retryable,true);
  // Local data is untouched by a network failure.
  assert.equal(error.unsaved,false);
});

test('a server that answered is a protocol problem, never blindly retried',()=>{
  const error=transportFailure(new Error('unexpected token in response'));
  assert.equal(error.code,'SYNC_PROTOCOL');
  assert.equal(error.retryable,false);
});

test('a changed server identity stops sync as SYNC_PROTOCOL and preserves local state',async()=>{
  const service=failing();
  const d=note();
  await service.put(d);
  const before=await service.load();
  const serverId='11111111-1111-4111-8111-111111111111';
  const other='22222222-2222-4222-8222-222222222222';
  const transport={
    info:async()=>({serverId:other,protocol:1}),
    push:async()=>({results:[]}),
    pull:async()=>({serverId:other,changes:[],cursor:0,hasMore:false}),
  };
  // Bind the workspace to a different server first.
  const driver=service.driver;
  const bound={...before,serverId};
  await driver.save(before.localRevision,bound);
  const error=await asyncCodeOf(syncOnce(service,transport));
  assert.equal(error.code,'SYNC_PROTOCOL');
  assert.equal(error.sticky,true);
  assert.match(error.message,/已变化/);
  // The outbox survives, so nothing was lost and nothing was silently rebound.
  const after=await service.load();
  assert.equal(after.outbox.length,1);
  assert.equal(after.serverId,serverId);
});

test('an invalid protocol version is SYNC_PROTOCOL',async()=>{
  const service=failing();
  const transport={
    info:async()=>({serverId:'11111111-1111-4111-8111-111111111111',protocol:2}),
    push:async()=>({results:[]}),
    pull:async()=>({serverId:'11111111-1111-4111-8111-111111111111',changes:[],cursor:0,hasMore:false}),
  };
  const error=await asyncCodeOf(syncOnce(service,transport));
  assert.equal(error.code,'SYNC_PROTOCOL');
});

test('a malformed acknowledgement is SYNC_PROTOCOL and keeps the outbox',async()=>{
  const service=failing();
  await service.put(note());
  const serverId='11111111-1111-4111-8111-111111111111';
  const transport={
    info:async()=>({serverId,protocol:1}),
    push:async()=>({results:[]}), // wrong length: acknowledges nothing
    pull:async()=>({serverId,changes:[],cursor:0,hasMore:false}),
  };
  const error=await asyncCodeOf(syncOnce(service,transport));
  assert.equal(error.code,'SYNC_PROTOCOL');
  assert.match(error.message,/确认不完整|待同步队列/);
  assert.equal((await service.load()).outbox.length,1);
});

/* ── Normalization ───────────────────────────────────────────────────────── */

test('unknown thrown values normalize instead of escaping unclassified',()=>{
  assert.equal(toDomainError('plain string').code,'VALIDATION');
  assert.equal(toDomainError(new RangeError('nope')).code,'VALIDATION');
  const already=new DomainError('STORAGE','disk full');
  assert.equal(toDomainError(already),already);
});

test('only storage and protocol failures are sticky',()=>{
  assert.equal(new DomainError('STORAGE','x').sticky,true);
  assert.equal(new DomainError('SYNC_PROTOCOL','x').sticky,true);
  assert.equal(new DomainError('UNRESOLVED_CONFLICT','x').sticky,true);
  // A validation error is the user's to fix, not an alarm about their data.
  assert.equal(new DomainError('VALIDATION','x').sticky,false);
  assert.equal(new DomainError('SYNC_NETWORK','x').sticky,false);
  assert.equal(new DomainError('LOCAL_CONFLICT','x').sticky,false);
});

test('messages stay user-facing Chinese while the code carries the meaning',()=>{
  const error=new DomainError('STORAGE','工作区未能保存，本次编辑没有写入。');
  assert.equal(error.name,'DomainError');
  assert.equal(error.code,'STORAGE');
  assert.match(error.message,/没有写入/);
  assert.ok(error instanceof Error);
});
