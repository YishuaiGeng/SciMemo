# Single-person optional sync service. Not a multi-tenant SaaS backend.
from __future__ import annotations
import hashlib, hmac, json, os, sqlite3, uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from jsonschema import Draft202012Validator, FormatChecker

SCHEMA=Path(__file__).resolve().parents[2]/'schemas'/'document.schema.json'
if not SCHEMA.exists():  # source tree: server/app -> project root
    SCHEMA=Path(__file__).resolve().parents[2].parent/'schemas'/'document.schema.json'
VALIDATOR=Draft202012Validator(json.loads(SCHEMA.read_text()), format_checker=FormatChecker())
TERMINAL={'accepted','rejected','withdrawn'}

def validate_doc(doc:dict[str,Any])->None:
    errors=list(VALIDATOR.iter_errors(doc))
    if errors:raise HTTPException(422,'Invalid document schema')
    if len(json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8'))>500_000:raise HTTPException(413,'Document exceeds 500 KB')
    data=doc['data']
    if doc['kind']=='paper':
        subs=data['submissions']
        if not data['title'].strip():raise HTTPException(422,'Empty title')
        if len({s['id'] for s in subs})!=len(subs):raise HTTPException(422,'Duplicate submission IDs')
        if sum(s['events'][-1]['status'] not in TERMINAL for s in subs)>1:raise HTTPException(422,'Multiple active submissions')
        for s in subs:
            if len({e['id'] for e in s['events']})!=len(s['events']):raise HTTPException(422,'Duplicate event IDs')
    if doc['kind']=='note' and not data['body'].strip():raise HTTPException(422,'Empty note')
    if doc['kind']=='venue':
        if not data['name'].strip():raise HTTPException(422,'Empty venue name')
        if len({e['id'] for e in data['editions']})!=len(data['editions']):raise HTTPException(422,'Duplicate edition IDs')
    if doc['kind']=='deadline':
        if not data['title'].strip():raise HTTPException(422,'Empty deadline title')
        if data['timing']['precision']=='instant':
            try:ZoneInfo(data['timing']['timezone'])
            except (ZoneInfoNotFoundError,ValueError):raise HTTPException(422,'Invalid IANA timezone')

class Operation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    opId:uuid.UUID
    baseVersion:int=Field(ge=0)
    doc:dict[str,Any]
class PushRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    serverId:uuid.UUID
    operations:list[Operation]=Field(max_length=100)

def create_app(db_path:str|None=None, token:str|None=None, origins:list[str]|None=None)->FastAPI:
    secret=token or os.environ.get('SCIMEMO_SYNC_TOKEN','')
    if len(secret)<32:raise RuntimeError('Set SCIMEMO_SYNC_TOKEN to a random secret of at least 32 characters')
    path=Path(db_path or os.environ.get('SCIMEMO_DB_PATH','server/data/sync.sqlite3'))
    path.parent.mkdir(parents=True,exist_ok=True)
    @contextmanager
    def connect():
        db=sqlite3.connect(path,timeout=10,isolation_level=None)
        db.row_factory=sqlite3.Row
        try:yield db
        finally:db.close()
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY,version INTEGER NOT NULL,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL);
        ''')
        db.execute('INSERT OR IGNORE INTO meta VALUES (?,?)',('server_id',str(uuid.uuid4())))
        db.execute('INSERT OR IGNORE INTO meta VALUES (?,?)',('schema_version','1'))
        if db.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0]!='1':raise RuntimeError('Unsupported server database version')
        server_id=db.execute("SELECT value FROM meta WHERE key='server_id'").fetchone()[0]
    def authorize(authorization:Annotated[str|None,Header()]=None):
        if not authorization or not hmac.compare_digest(authorization,'Bearer '+secret):raise HTTPException(401,'Invalid credentials')
    app=FastAPI(title='SciMemo Sync',version='0.1.0',docs_url=None,redoc_url=None,openapi_url=None)
    allowed=origins if origins is not None else os.environ.get('SCIMEMO_ALLOWED_ORIGINS','http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost').split(',')
    if '*' in allowed:raise RuntimeError('Use explicit CORS origins, not *')
    app.add_middleware(CORSMiddleware,allow_origins=allowed,allow_methods=['GET','POST'],allow_headers=['Authorization','Content-Type'],allow_credentials=False)
    @app.middleware('http')
    async def body_limit(request:Request, call_next):
        # Content-Length may be absent or untrusted: check the actual body too.
        from starlette.responses import JSONResponse
        if request.method=='POST':
            body=b''
            async for part in request.stream():
                body+=part
                if len(body)>5_000_000:return JSONResponse({'detail':'Request exceeds 5 MB'},status_code=413)
            request._body=body
        response=await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        return response
    @app.get('/healthz')
    def health():return {'status':'ok'}
    @app.get('/v1/info',dependencies=[Depends(authorize)])
    def info():return {'serverId':server_id,'protocol':1}
    @app.get('/v1/openapi.json',dependencies=[Depends(authorize)])
    def openapi():return app.openapi()
    @app.post('/v1/sync/push',dependencies=[Depends(authorize)])
    def push(body:PushRequest):
        if str(body.serverId)!=server_id:raise HTTPException(409,'Server workspace changed')
        for op in body.operations:validate_doc(op.doc)
        results=[]
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                for op in body.operations:
                    key=str(op.opId)
                    canonical=json.dumps(op.model_dump(mode='json'),sort_keys=True,separators=(',',':'))
                    digest=hashlib.sha256(canonical.encode()).hexdigest()
                    previous=db.execute('SELECT hash,result FROM operations WHERE id=?',(key,)).fetchone()
                    if previous:
                        if previous['hash']!=digest:raise HTTPException(409,'Idempotency key reused with different content')
                        results.append(json.loads(previous['result']));continue
                    row=db.execute('SELECT version,body FROM documents WHERE id=?',(op.doc['id'],)).fetchone()
                    current=json.loads(row['body']) if row else None
                    if (row['version'] if row else 0)!=op.baseVersion:
                        result={'opId':key,'status':'conflict','doc':current}
                    else:
                        if current and (current['kind']!=op.doc['kind'] or current['createdAt']!=op.doc['createdAt']):raise HTTPException(422,'Immutable document identity changed')
                        updated={**op.doc,'version':op.baseVersion+1}
                        # A version gaining a digit must not create an oversized
                        # document that clients cannot validate or acknowledge.
                        validate_doc(updated)
                        encoded=json.dumps(updated,ensure_ascii=False)
                        db.execute('INSERT INTO documents VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,body=excluded.body',(updated['id'],updated['version'],encoded))
                        db.execute('INSERT INTO changes(body) VALUES (?)',(encoded,))
                        result={'opId':key,'status':'accepted','doc':updated}
                    db.execute('INSERT INTO operations VALUES (?,?,?)',(key,digest,json.dumps(result,ensure_ascii=False)))
                    results.append(result)
                db.execute('COMMIT')
            except Exception:
                db.execute('ROLLBACK');raise
        return {'results':results}
    @app.get('/v1/sync/pull',dependencies=[Depends(authorize)])
    def pull(serverId:uuid.UUID,cursor:int=Query(0,ge=0),limit:int=Query(200,ge=1,le=1000)):
        if str(serverId)!=server_id:raise HTTPException(409,'Server workspace changed')
        with connect() as db:
            # Snapshot + bound prevent writes during paging from changing this page.
            db.execute('BEGIN')
            high=db.execute('SELECT COALESCE(MAX(seq),0) FROM changes').fetchone()[0]
            if cursor>high:raise HTTPException(409,'Cursor ahead of server; database may have been restored')
            rows=db.execute('SELECT seq,body FROM changes WHERE seq>? AND seq<=? ORDER BY seq LIMIT ?',(cursor,high,limit)).fetchall()
            db.execute('COMMIT')
        new_cursor=rows[-1]['seq'] if rows else cursor
        return {'serverId':server_id,'changes':[{'seq':r['seq'],'doc':json.loads(r['body'])} for r in rows],'cursor':new_cursor,'hasMore':new_cursor<high}
    return app
