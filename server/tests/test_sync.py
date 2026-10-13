import copy,json,sqlite3,uuid
from pathlib import Path
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from server.app.main import create_app,validate_doc
TOKEN='test-only-'+('x'*40)
HEADERS={'Authorization':'Bearer '+TOKEN}
def document(body='idea'):
    return {'id':str(uuid.uuid4()),'kind':'note','data':{'title':'','body':body,'noteType':'idea','paperIds':[],'tags':[],'pinned':False},'createdAt':'2026-01-01T00:00:00Z','updatedAt':'2026-01-01T00:00:00Z','version':0,'deleted':False}
def operation(doc,base=0):return {'opId':str(uuid.uuid4()),'baseVersion':base,'doc':doc}
@pytest.fixture
def api(tmp_path):
    path=tmp_path/'test.sqlite3'
    with TestClient(create_app(str(path),TOKEN)) as client:
        info=client.get('/v1/info',headers=HEADERS).json()
        yield client,info['serverId'],path

def push(api,ops):
    client,sid,_=api
    return client.post('/v1/sync/push',headers=HEADERS,json={'serverId':sid,'operations':ops})
def test_missing_auth_is_denied(api):assert api[0].get('/v1/info').status_code==401
def test_wrong_auth_is_denied(api):assert api[0].get('/v1/info',headers={'Authorization':'Bearer wrong'}).status_code==401
def test_server_requires_nontrivial_token(tmp_path):
    with pytest.raises(RuntimeError):create_app(str(tmp_path/'bad.db'),'short')
def test_health_does_not_expose_workspace(api):assert api[0].get('/healthz').json()=={'status':'ok'}
def test_push_pull_roundtrip(api):
    d=document();r=push(api,[operation(d)]);assert r.status_code==200
    assert r.json()['results'][0]['doc']['version']==1
    r=api[0].get('/v1/sync/pull',headers=HEADERS,params={'serverId':api[1],'cursor':0})
    assert r.json()['changes'][0]['doc']['data']['body']=='idea'
    assert r.json()['cursor']==1
    assert r.json()['hasMore'] is False

def test_idempotent_replay_does_not_duplicate_changes(api):
    op=operation(document());a=push(api,[op]);b=push(api,[op]);assert a.json()==b.json()
    with sqlite3.connect(api[2]) as db:assert db.execute('SELECT COUNT(*) FROM changes').fetchone()[0]==1

def test_changed_payload_with_same_key_rejected(api):
    op=operation(document());push(api,[op]);changed=copy.deepcopy(op);changed['doc']['data']['body']='changed'
    assert push(api,[changed]).status_code==409

def test_conflict_contains_remote_version(api):
    d=document();push(api,[operation(d)]);d['data']['body']='stale'
    r=push(api,[operation(d)]).json()['results'][0];assert r['status']=='conflict';assert r['doc']['data']['body']=='idea'

def test_new_update_uses_version_not_wall_clock(api):
    d=document();first=push(api,[operation(d)]).json()['results'][0]['doc']
    first['updatedAt']='2000-01-01T00:00:00Z';first['data']['body']='older clock, newer version'
    r=push(api,[operation(first,1)]).json()['results'][0];assert r['status']=='accepted';assert r['doc']['version']==2

def test_delete_remains_in_change_log(api):
    d=document();v=push(api,[operation(d)]).json()['results'][0]['doc'];v['deleted']=True
    push(api,[operation(v,1)])
    changes=api[0].get('/v1/sync/pull',params={'serverId':api[1],'cursor':1},headers=HEADERS).json()['changes']
    assert changes[0]['doc']['deleted'] is True

def test_invalid_document_rejected_before_writes(api):
    good=operation(document());bad=operation(document());bad['doc']['data']['noteType']='nonsense'
    assert push(api,[good,bad]).status_code==422
    with sqlite3.connect(api[2]) as db:assert db.execute('SELECT COUNT(*) FROM documents').fetchone()[0]==0

def test_transaction_rolls_back_if_idempotency_error_mid_batch(api):
    old=operation(document());push(api,[old]);changed=copy.deepcopy(old);changed['doc']['data']['body']='different'
    assert push(api,[operation(document('new')),changed]).status_code==409
    with sqlite3.connect(api[2]) as db:assert db.execute('SELECT COUNT(*) FROM documents').fetchone()[0]==1

def test_pagination_and_cursor(api):
    push(api,[operation(document(str(i))) for i in range(5)])
    r=api[0].get('/v1/sync/pull',params={'serverId':api[1],'cursor':0,'limit':2},headers=HEADERS).json()
    assert len(r['changes'])==2 and r['hasMore'] and r['cursor']==2
    r=api[0].get('/v1/sync/pull',params={'serverId':api[1],'cursor':2,'limit':3},headers=HEADERS).json()
    assert len(r['changes'])==3 and not r['hasMore']

def test_server_identity_mismatch_rejected(api):
    assert api[0].post('/v1/sync/push',headers=HEADERS,json={'serverId':str(uuid.uuid4()),'operations':[]}).status_code==409

def test_ahead_cursor_rejected(api):
    assert api[0].get('/v1/sync/pull',params={'serverId':api[1],'cursor':100},headers=HEADERS).status_code==409

def test_untrusted_uuid_and_extra_properties_rejected(api):
    d=document();d['id']='../../outside';assert push(api,[operation(d)]).status_code==422
    d=document();d['data']['script']='bad';assert push(api,[operation(d)]).status_code==422

def test_oversize_document_rejected(api):
    assert push(api,[operation(document('x'*510_000))]).status_code==413

def test_body_limit_without_assuming_valid_schema(api):
    r=api[0].post('/v1/sync/push',headers={**HEADERS,'Content-Type':'application/json'},content='x'*5_000_001)
    assert r.status_code==413

def test_bad_cors_origin_not_allowed(api):
    r=api[0].options('/v1/sync/push',headers={'Origin':'https://evil.example','Access-Control-Request-Method':'POST'})
    assert r.status_code==400

def test_shared_fixtures_match_server_schema():
    path=Path(__file__).resolve().parents[2]/'tests'/'fixtures'/'demo.json'
    docs=json.loads(path.read_text())
    for doc in docs:validate_doc(doc)

def test_server_schema_matches_semantic_restriction_on_active_submissions():
    path=Path(__file__).resolve().parents[2]/'tests'/'fixtures'/'demo.json'
    d=next(x for x in json.loads(path.read_text()) if x['kind']=='paper' and x['data']['submissions'])
    another=copy.deepcopy(d['data']['submissions'][0]);another['id']=str(uuid.uuid4());d['data']['submissions'].append(another)
    with pytest.raises(HTTPException):validate_doc(d)
