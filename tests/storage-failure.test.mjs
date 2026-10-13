import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeDoc} from '../.test-build/core/types.js';
import {WorkspaceService} from '../.test-build/core/workspace.js';
import {isDomainError} from '../.test-build/core/errors.js';
import {IndexedDbDriver,TauriDriver,classifyNativeSave,NATIVE_LOCAL_CONFLICT} from '../.test-build/platform/driver.js';
import {presentError} from '../.test-build/ui/messages.js';
import {FakeIndexedDB} from './fake-indexeddb.mjs';

const note=(body='an idea worth keeping')=>makeDoc('note',{title:'',body,noteType:'idea',paperIds:[],tags:[],pinned:false});
const paper=()=>makeDoc('paper',{title:'Manuscript',summary:'',stage:'writing',nextAction:'',tags:[],archived:false,targets:[],submissions:[]});

async function rejection(promise){
  try{await promise;}catch(error){
    assert.ok(isDomainError(error),`expected a classified DomainError, got ${error?.name}: ${error?.message}`);
    return error;
  }
  assert.fail('expected the operation to reject');
}

function setup(faults={}){
  const idb=new FakeIndexedDB(faults);
  const driver=new IndexedDbDriver(idb,'test-db');
  return {idb,driver,service:new WorkspaceService(driver)};
}

/* ── The fake itself behaves like the happy path ─────────────────────────── */

test('IndexedDB driver round-trips a workspace through the fake store',async()=>{
  const {service}=setup();
  const d=note();
  await service.put(d);
  const ws=await service.load();
  assert.equal(ws.docs[d.id].data.body,d.data.body);
  assert.equal(ws.outbox.length,1);
  assert.equal(ws.localRevision,1);
});

/* ── Write failures ──────────────────────────────────────────────────────── */

test('a quota error on put is STORAGE and nothing is written',async()=>{
  const {service,idb}=setup();
  await service.put(note('saved before the disk filled'));
  const before=await service.load();
  idb.faults.putQuota=true;
  const error=await rejection(service.put(note('this edit must not pretend to be saved')));
  assert.equal(error.code,'STORAGE');
  assert.match(error.message,/没有写入/);
  // The browser's cause is kept for diagnosis instead of being swallowed.
  assert.match(error.message,/QuotaExceededError/);
  idb.faults.putQuota=false;
  assert.deepEqual(await service.load(),before);
});

test('a commit-time abort after a successful put is STORAGE, not success',async()=>{
  // Chrome reports quota exhaustion by aborting at commit. Resolving on the put's
  // success event would report a save that was rolled back.
  const {service,idb}=setup();
  const before=await service.load();
  idb.faults.commitQuota=true;
  const error=await rejection(service.put(note()));
  assert.equal(error.code,'STORAGE');
  assert.match(error.message,/QuotaExceededError/);
  idb.faults.commitQuota=false;
  assert.deepEqual(await service.load(),before);
});

test('a revision mismatch is LOCAL_CONFLICT, not a storage alarm',async()=>{
  const {driver,idb}=setup();
  const ws=await driver.load();
  await driver.save(0,{...ws,localRevision:1});
  const error=await rejection(driver.save(0,{...ws,localRevision:1}));
  assert.equal(error.code,'LOCAL_CONFLICT');
  assert.equal(error.sticky,false);
  assert.equal(idb.data.get('default').localRevision,1);
});

test('a connection closed by another tab is classified, not a raw InvalidStateError',async()=>{
  const {service,idb}=setup();
  await service.put(note());
  idb.versionChangeFromAnotherTab();
  const writeError=await rejection(service.put(note('after the other tab upgraded')));
  assert.equal(writeError.code,'STORAGE');
  assert.match(writeError.message,/InvalidStateError/);
  const readError=await rejection(service.load());
  assert.equal(readError.code,'STORAGE');
  // A read failure must not claim that an edit was lost.
  assert.doesNotMatch(readError.message,/本次编辑/);
});

/* ── Opening the database ────────────────────────────────────────────────── */

test('failing to open the database is a STORAGE read failure',async()=>{
  const {service}=setup({openError:true});
  const error=await rejection(service.load());
  assert.equal(error.code,'STORAGE');
  assert.match(error.message,/无法读取/);
  assert.match(error.message,/不会改用临时内存存储/);
});

test('a blocked upgrade is LOCAL_CONFLICT with an actionable message',async()=>{
  const {service}=setup({blocked:true});
  const error=await rejection(service.load());
  assert.equal(error.code,'LOCAL_CONFLICT');
  assert.match(error.message,/其他标签页/);
});

/* ── Service behaviour around a storage failure ──────────────────────────── */

test('a failed submission record leaves history and outbox exactly as they were',async()=>{
  const {service,idb}=setup();
  const p=paper();
  await service.put(p);
  const before=await service.load();
  idb.faults.commitQuota=true;
  await rejection(service.recordSubmission(before.docs[p.id],{venueName:'Journal A'}));
  idb.faults.commitQuota=false;
  const after=await service.load();
  assert.deepEqual(after,before);
  assert.equal(after.docs[p.id].data.submissions.length,0);
});

test('the write queue is not poisoned: the same edit succeeds once storage recovers',async()=>{
  const {service,idb}=setup();
  const d=note();
  idb.faults.putQuota=true;
  await rejection(service.put(d));
  idb.faults.putQuota=false;
  await service.put(d);
  const ws=await service.load();
  assert.equal(ws.docs[d.id].data.body,d.data.body);
  // Exactly one pending operation: the failed attempt left nothing behind.
  assert.equal(ws.outbox.length,1);
  assert.equal(ws.localRevision,1);
});

/* ── What the user is told ───────────────────────────────────────────────── */

test('a storage failure is presented as sticky, unsaved and retryable',async()=>{
  const {service,idb}=setup();
  idb.faults.putQuota=true;
  const error=await rejection(service.put(note()));
  const shown=presentError(error);
  assert.equal(shown.ok,false);
  assert.equal(shown.title,'未能保存到本机');
  assert.equal(shown.sticky,true,'an unsaved edit must not disappear on a timer');
  assert.equal(shown.unsaved,true);
  assert.equal(shown.retryable,true);
  assert.match(shown.action,/导出备份/);
});

test('a local conflict is presented as transient and points to reloading',async()=>{
  const {driver}=setup();
  const ws=await driver.load();
  await driver.save(0,{...ws,localRevision:1});
  const shown=presentError(await rejection(driver.save(0,{...ws,localRevision:1})));
  assert.equal(shown.sticky,false);
  assert.equal(shown.unsaved,true);
  assert.match(shown.action,/重新加载/);
});

/* ── Native driver ───────────────────────────────────────────────────────── */

test('a native revision conflict is LOCAL_CONFLICT; other native errors are STORAGE',()=>{
  const conflict=classifyNativeSave(`${NATIVE_LOCAL_CONFLICT} local revision changed in another window`);
  assert.equal(conflict.code,'LOCAL_CONFLICT');
  const disk=classifyNativeSave('disk I/O error');
  assert.equal(disk.code,'STORAGE');
  // Tauri rejects with plain strings; the cause must survive.
  assert.match(disk.message,/disk I\/O error/);
});

test('native load failures are STORAGE, not the VALIDATION fallback',async()=>{
  const driver=new TauriDriver(async()=>{throw 'database disk image is malformed';});
  const error=await rejection(driver.load());
  assert.equal(error.code,'STORAGE');
  assert.match(error.message,/malformed/);
});

test('native save routes through the same classification',async()=>{
  const conflicting=new TauriDriver(async()=>{throw `${NATIVE_LOCAL_CONFLICT} reload before editing`;});
  assert.equal((await rejection(conflicting.save(0,{}))).code,'LOCAL_CONFLICT');
  const full=new TauriDriver(async()=>{throw 'Workspace exceeds starter size limit';});
  const error=await rejection(full.save(0,{}));
  assert.equal(error.code,'STORAGE');
  assert.match(error.message,/size limit/);
});

test('the Rust command emits the prefix the TypeScript driver matches',async()=>{
  // Rust is not compiled in this environment, so pin the string contract at source level.
  const rust=await readFile(new URL('../src-tauri/src/storage.rs',import.meta.url),'utf8');
  assert.ok(rust.includes(`"${NATIVE_LOCAL_CONFLICT}`),`storage.rs must reject a revision mismatch with "${NATIVE_LOCAL_CONFLICT} …"`);
});
