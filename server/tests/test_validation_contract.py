"""Keep the JavaScript validator and Python schema contract on shared examples."""
import copy
import json
import sqlite3
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from server.app.main import create_app,validate_doc

FIXTURES=Path(__file__).resolve().parents[2]/'tests'/'fixtures'
DOCS=json.loads((FIXTURES/'demo.json').read_text())
CASES=json.loads((FIXTURES/'validation-cases.json').read_text())

def fixture(kind):
    return copy.deepcopy(next(doc for doc in DOCS if (
        doc['kind']=='venue' and doc['data']['venueType']=='conference'
        if kind=='conference' else
        doc['kind']==kind and (kind!='paper' or doc['data']['submissions'])
    )))

@pytest.mark.parametrize('case',CASES,ids=lambda case:case['name'])
def test_shared_validation_contract(case):
    doc=fixture(case['kind'])
    target=doc
    for key in case['path'][:-1]:target=target[key]
    target[case['path'][-1]]=copy.deepcopy(case['value'])
    if case['valid']:validate_doc(doc)
    else:
        with pytest.raises(HTTPException) as exc:validate_doc(doc)
        assert exc.value.status_code==422

@pytest.mark.parametrize(('body','accepted'),[
    ('中'*150_000,True),('中'*170_000,False),('😀'*125_000,False),
])
def test_document_limit_counts_utf8_bytes(body,accepted):
    doc=fixture('note');doc['data']['body']=body
    size=len(json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    assert (size<=500_000)==accepted
    if accepted:validate_doc(doc)
    else:
        with pytest.raises(HTTPException) as exc:validate_doc(doc)
        assert exc.value.status_code==413

def test_exact_document_byte_limit():
    doc=fixture('note');doc['data']['body']='中😀'
    size=len(json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
    doc['data']['body']+='a'*(500_000-size)
    assert len(json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8'))==500_000
    validate_doc(doc)
    doc['data']['body']+='a'
    with pytest.raises(HTTPException) as exc:validate_doc(doc)
    assert exc.value.status_code==413

def test_version_growth_cannot_commit_an_oversized_document_or_partial_batch(tmp_path):
    path=tmp_path/'version-boundary.sqlite3'
    token='fictional-test-token-'+('x'*40)
    headers={'Authorization':'Bearer '+token}
    with TestClient(create_app(str(path),token)) as client:
        server_id=client.get('/v1/info',headers=headers).json()['serverId']
        def push(operations):
            return client.post('/v1/sync/push',headers=headers,json={'serverId':server_id,'operations':operations})
        def operation(doc,base):
            return {'opId':str(uuid.uuid4()),'baseVersion':base,'doc':doc}
        doc=fixture('note')
        for base in range(9):
            response=push([operation(doc,base)])
            assert response.status_code==200
            doc=response.json()['results'][0]['doc']
        assert doc['version']==9
        doc['data']['body']='中😀'
        size=len(json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8'))
        doc['data']['body']+='a'*(500_000-size)
        validate_doc(doc)
        other=fixture('note');other['id']=str(uuid.uuid4())
        operations=[operation(other,0),operation(doc,9)]
        assert push(operations).status_code==413
        with sqlite3.connect(path) as db:
            assert db.execute('SELECT COUNT(*) FROM documents').fetchone()[0]==1
            assert db.execute('SELECT version FROM documents').fetchone()[0]==9
            assert db.execute('SELECT COUNT(*) FROM changes').fetchone()[0]==9
            assert db.execute('SELECT COUNT(*) FROM operations').fetchone()[0]==9
        # The rejected transaction kept no idempotency keys. Correcting the
        # size and retrying these keys must succeed without a partial write.
        doc['data']['body']=doc['data']['body'][:-1]
        response=push(operations)
        assert response.status_code==200
        updated=response.json()['results'][1]['doc']
        assert updated['version']==10
        assert len(json.dumps(updated,ensure_ascii=False,separators=(',',':')).encode('utf-8'))==500_000
        validate_doc(updated)
