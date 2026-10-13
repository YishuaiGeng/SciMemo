import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDoc} from '../.test-build/core/domain.js';

// Python's schema + semantic validation consumes the same cases. These examples
// capture boundary contracts without adding a second JavaScript schema engine.
const docs=JSON.parse(readFileSync(new URL('./fixtures/demo.json',import.meta.url),'utf8'));
const cases=JSON.parse(readFileSync(new URL('./fixtures/validation-cases.json',import.meta.url),'utf8'));
const fixture=kind=>structuredClone(docs.find(doc=>kind==='conference'?
  doc.kind==='venue'&&doc.data.venueType==='conference':
  doc.kind===kind&&(kind!=='paper'||doc.data.submissions.length)));

test('shared fictional fixtures match client validation',()=>docs.forEach(validateDoc));
for(const c of cases)test(`shared validation contract: ${c.name}`,()=>{
  const doc=fixture(c.kind);
  let target=doc;
  for(const key of c.path.slice(0,-1))target=target[key];
  target[c.path.at(-1)]=structuredClone(c.value);
  if(c.valid)assert.doesNotThrow(()=>validateDoc(doc));
  else assert.throws(()=>validateDoc(doc));
});

test('document limit counts UTF-8 bytes for Chinese and emoji',()=>{
  for(const [body,accepted] of [['中'.repeat(150_000),true],['中'.repeat(170_000),false],['😀'.repeat(125_000),false]]){
    const doc=fixture('note');doc.data.body=body;
    assert.equal(Buffer.byteLength(JSON.stringify(doc),'utf8')<=500_000,accepted);
    if(accepted)assert.doesNotThrow(()=>validateDoc(doc));
    else assert.throws(()=>validateDoc(doc),/记录过大/);
  }
});

test('document byte limit accepts exactly 500000 and rejects one byte more',()=>{
  const doc=fixture('note');doc.data.body='中😀';
  doc.data.body+='a'.repeat(500_000-Buffer.byteLength(JSON.stringify(doc),'utf8'));
  assert.equal(Buffer.byteLength(JSON.stringify(doc),'utf8'),500_000);
  assert.doesNotThrow(()=>validateDoc(doc));
  doc.data.body+='a';
  assert.throws(()=>validateDoc(doc),/记录过大/);
});
