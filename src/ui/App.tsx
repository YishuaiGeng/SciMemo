import {useEffect,useMemo,useRef,useState} from 'react';
import {emptyWorkspace,makeDoc,stageLabels,statusLabels,type Deadline,type Doc,type Kind,type Workspace} from '../core/types.js';
import {visible,currentStatus,latestSubmission,titleOf,searchDocs} from '../core/domain.js';
import {kindCounts,paperStats,readContext} from '../core/read/index.js';
import {WorkspaceService} from '../core/workspace.js';
import {calendarExport,noteMarkdown,papersCsv} from '../core/backup.js';
import {createDriver,exportText,isNative} from '../platform/driver.js';
import {RecordEditor} from './RecordEditor.js';
import {PaperDetail} from './PaperDetail.js';
import {AgendaView} from './AgendaView.js';
import {Settings} from './Settings.js';
import {Badge,ConfirmDialog,Empty,Link,fileStamp} from './components.js';
import {presentError,presentSuccess,type ErrorPresentation} from './messages.js';
type Page='paper'|'note'|'venue'|'deadline'|'settings';
const titles:Record<Page,[string,string,string]>={
  paper:['MANUSCRIPTS','我的稿件','每篇论文，当前状态与下一步。'],
  note:['IDEAS & NOTES','灵感随笔','先把想法记下来，不必立即成为一篇论文。'],
  venue:['JOURNALS & CONFERENCES','期刊会议','整理自己的投稿目标，保留来源与选择理由。'],
  deadline:['WHAT NEEDS YOU','该我动作','到期、临近，以及长期没有变化的投稿。'],
  settings:['DATA','设置与数据',''],
};
const nav:[Page,string,string][]=[['paper','▤','我的稿件'],['note','✧','灵感随笔'],['venue','▦','期刊会议'],['deadline','◷','该我动作']];
const defaultQuietDays=21;

/**
 * Classified notice bar.
 *
 * Successful actions disappear on their own. Sticky failures (unsaved edits, stopped
 * sync) stay until dismissed, because a message that vanishes while the user reads it
 * is how "I thought it saved" happens.
 */
function NoticeView({notice,onDismiss}:{notice:ErrorPresentation;onDismiss:()=>void}){
 useEffect(()=>{
  if(notice.sticky)return;
  const timer=window.setTimeout(onDismiss,4200);
  return ()=>window.clearTimeout(timer);
 },[notice,onDismiss]);
 return <div role={notice.ok?'status':'alert'} className={`notice ${notice.ok?'':'error'}`}>
  <div className="notice-body">
   <strong>{notice.title}</strong>
   <span>{notice.detail}</span>
   {notice.action&&<small>{notice.action}</small>}
  </div>
  <button aria-label="关闭提示" onClick={onDismiss}>×</button>
 </div>;
}

export default function App(){
 const service=useMemo(()=>new WorkspaceService(createDriver()),[]);
 const [ws,setWs]=useState<Workspace>(emptyWorkspace()),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[page,setPage]=useState<Page>('paper'),[selected,setSelected]=useState<string|null>(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('active'),[notice,setNotice]=useState<ErrorPresentation|null>(null),[editor,setEditor]=useState<{kind:Kind;doc?:Doc}|null>(null),[quietDays,setQuietDays]=useState(defaultQuietDays),[pendingRemoval,setPendingRemoval]=useState<Doc|null>(null);
 const refresh=async()=>{setWs(await service.load());};
 useEffect(()=>{service.load().then(s=>{setWs(s);setReady(true);}).catch(e=>setNotice(presentError(e)));},[service]);
 async function run<T>(f:()=>Promise<T>,success:string|((result:T)=>string)='已保存在本机'):Promise<boolean>{setBusy(true);setNotice(null);try{const result=await f();await refresh();setNotice(presentSuccess(typeof success==='function'?success(result):success));return true;}catch(e){setNotice(presentError(e));return false;}finally{setBusy(false);}}
 // Returns false on failure so callers keep the editor open instead of discarding input.
 const saveCommand=async(command:()=>Promise<unknown>):Promise<boolean>=>{setBusy(true);setNotice(null);try{await command();await refresh();setNotice(presentSuccess('已保存在本机'));return true;}catch(e){setNotice(presentError(e));return false;}finally{setBusy(false);}};
 const save=(d:Doc)=>saveCommand(()=>service.put(d));
 const edit=(d:Doc)=>setEditor({kind:d.kind,doc:d});
 const remove=(d:Doc)=>setPendingRemoval(d);
 const confirmRemoval=async()=>{const d=pendingRemoval;if(!d)return;setPendingRemoval(null);await run(()=>service.remove(d.id),'已移入回收站');};
 const papers=visible(ws,'paper'),notes=visible(ws,'note'),venues=visible(ws,'venue');
 const selectedDoc=selected?ws.docs[selected]:null;
 // Derived views come from core/read so the UI never recomputes business rules inline.
 const stats=useMemo(()=>paperStats(ws),[ws]);
 const counts=useMemo(()=>kindCounts(ws),[ws]);
 // Recomputed when the workspace changes; the clock is read once per change, not per render.
 const ctx=useMemo(()=>readContext(),[ws]);
 const visiblePapers=papers.filter(p=>p.data.archived===(filter==='archived'));
 const navigate=(p:Page)=>{setPage(p);setSelected(null);setFilter('active');setQuery('');};
 const openDoc=(d:Doc)=>{if(d.kind==='paper'){setSelected(d.id);setPage('paper');setQuery('');}else edit(d);};
 const openPaper=(id:string)=>{setSelected(id);setPage('paper');setQuery('');};
 const addNoteToPaper=()=>{const d=makeDoc('note',{title:'',body:'',noteType:'idea',paperIds:selected?[selected]:[],tags:[],pinned:false});setEditor({kind:'note',doc:d});};
 const addDeadlineToPaper=(deadlineType:Deadline['deadlineType']='other')=>{
  const draft=makeDoc('deadline',{title:'',deadlineType,timing:{precision:'date',date:''},paperId:selected,venueId:null,editionId:null,sourceUrl:'',checkedOn:null,notes:'',completed:false});
  setEditor({kind:'deadline',doc:draft});
 };
 const exportFile=(filename:string,content:string,mime:string,label:string)=>run(()=>exportText(filename,content,mime),path=>path===null?'已取消导出，没有写入文件':`已导出${label}${path&&path!=='已交给浏览器保存'?`：${path}`:''}`);
 const seed=()=>run(()=>service.loadDemo(),'已加载虚构示例，可删除或编辑');
 function renderMain(){
  if(page==='settings')return <Settings ws={ws} service={service} busy={busy} run={run} refresh={refresh} onEdit={edit} quietDays={quietDays} onQuietDays={setQuietDays}/>;
  if(selectedDoc?.kind==='paper'&&!selectedDoc.deleted)return <PaperDetail paper={selectedDoc} notes={notes} venues={venues} deadlines={visible(ws,'deadline')} busy={busy} onSubmission={async target=>{await saveCommand(()=>service.recordSubmission(selectedDoc,target));}} onSubmissionEvent={async(id,event)=>{await saveCommand(()=>service.recordSubmissionEvent(selectedDoc,id,event));}} onEdit={edit} onNewNote={addNoteToPaper} onNewDeadline={addDeadlineToPaper} onBack={()=>setSelected(null)}/>;
  if(query.trim()){const results=searchDocs(ws,query);return <><div className="page-heading"><div><div className="eyebrow">SEARCH</div><h1>搜索记录</h1><p>搜索稿件、投稿历史、随笔、期刊会议与日程的字段内容。</p></div></div><div className="stack">{results.map(d=><button className="search-result" key={d.id} onClick={()=>openDoc(d)}><Badge>{titles[d.kind][1]}</Badge><strong>{titleOf(d)}</strong><span>→</span></button>)}</div>{!results.length&&<Empty title="没有找到相关记录" body="试试题名、标签或正文中的关键词。搜索匹配字段内容，不匹配字段名称。"/>}</>;}
  return <><div className="page-heading"><div><div className="eyebrow">{titles[page][0]}</div><h1>{titles[page][1]}</h1><p>{titles[page][2]}</p></div><button className="primary" disabled={busy} onClick={()=>setEditor({kind:page})}>＋ {page==='paper'?'新建稿件':page==='note'?'写一条随笔':page==='venue'?'收藏期刊／会议':'添加日程'}</button></div>
  {page==='paper'&&<><div className="metrics"><div><span>进行中的稿件</span><strong>{stats.active.toString().padStart(2,'0')}</strong></div><div><span>投稿与审稿中</span><strong>{stats.underReview.toString().padStart(2,'0')}</strong></div><div><span>等待修回</span><strong>{stats.awaitingRevision.toString().padStart(2,'0')}</strong></div></div><div className="section-toolbar"><div className="segmented"><button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>进行中</button><button className={filter==='archived'?'active':''} onClick={()=>setFilter('archived')}>已归档</button></div><button className="text-button" onClick={()=>exportFile(`papers-${fileStamp()}.csv`,papersCsv(papers),'text/csv','稿件概览 CSV')}>导出概览 CSV ↗</button></div>
  {!papers.length?<Empty title="从你正在写的那篇论文开始" body="先填名称即可。之后记录投稿、审稿与修回经历。" action={<div className="inline center"><button className="primary" onClick={()=>setEditor({kind:'paper'})}>新建第一篇稿件</button>{!Object.keys(ws.docs).length&&<button onClick={seed}>看看虚构示例</button>}</div>}/>:<div className="paper-list">{visiblePapers.map(p=>{const s=latestSubmission(p.data);return <article key={p.id} className="paper-row"><div className="paper-main"><button className="title-button" onClick={()=>setSelected(p.id)}>{p.data.title}</button><div className="inline"><Badge>{stageLabels[p.data.stage]}</Badge>{s?<><Badge tone={currentStatus(s).includes('revision')?'amber':currentStatus(s)==='accepted'?'green':'neutral'}>{statusLabels[currentStatus(s)]}</Badge><span className="muted venue-label">{s.venueNameSnapshot}</span></>:<Badge>尚未投稿</Badge>}</div><p className="paper-next"><span>下一步</span>{p.data.nextAction||'尚未填写'}</p></div><div className="row-actions"><button className="text-button" onClick={()=>setSelected(p.id)}>打开 →</button><button className="text-button" disabled={busy} onClick={()=>run(()=>service.put({...p,data:{...p.data,archived:!p.data.archived}}))}>{p.data.archived?'取消归档':'归档'}</button><button className="text-button danger" onClick={()=>remove(p)}>删除</button></div></article>;})}</div>}</>}
  {page==='note'&&(!notes.length?<Empty title="一个念头，也值得留一页" body="创新点、实验设想、讨论结论都可以独立保存；关联论文是可选项。"/>:<div className="note-grid">{[...notes].sort((a,b)=>Number(b.data.pinned)-Number(a.data.pinned)).map(n=><article className="note-card" key={n.id}><div className="card-heading"><Badge tone={n.data.noteType==='idea'?'amber':'neutral'}>{n.data.noteType==='idea'?'创新灵感':n.data.noteType==='progress'?'进展记录':'随笔'}</Badge>{n.data.pinned&&<span className="muted">置顶</span>}</div><button className="title-button" onClick={()=>edit(n)}>{titleOf(n)}</button><p className="note-body">{n.data.body}</p><div className="inline">{n.data.tags.map(t=><span className="tag" key={t}>#{t}</span>)}</div>{n.data.paperIds.length>0&&<small>关联 {n.data.paperIds.length} 篇稿件</small>}<footer><button className="text-button" onClick={()=>edit(n)}>编辑</button><button className="text-button" onClick={()=>exportFile(`note-${n.id}-${fileStamp()}.md`,noteMarkdown(n),'text/markdown','随笔 Markdown')}>导出</button><button className="text-button danger" onClick={()=>remove(n)}>删除</button></footer></article>)}</div>)}
  {page==='venue'&&<><div className="notice subtle">这是你手动维护的投稿目标库，不自动获取分区、会议日期或费用。请从官方来源核查动态信息。</div>{!venues.length?<Empty title="收藏一个值得考虑的投稿目标" body="期刊与会议系列独立保存，会议还可以继续添加具体届次。"/>:<div className="venue-grid">{venues.map(v=><article className="plain-card venue-card" key={v.id}><div className="card-heading"><span className="venue-initial">{(v.data.abbreviation||v.data.name).slice(0,2)}</span><Badge>{v.data.venueType==='journal'?'期刊':'会议系列'}</Badge></div><h3>{v.data.name}</h3>{v.data.abbreviation&&<p className="muted">{v.data.abbreviation}</p>}<p className="venue-note">{v.data.notes||'还没有写下个人判断。'}</p>{v.data.editions.map(e=><div className="edition" key={e.id}><span>{e.label}</span><Link url={e.website} label="本届官网"/></div>)}<p className="hint">最近核查：{v.data.checkedOn??'未填写'}</p><div className="inline"><Link url={v.data.website} label="官网"/><Link url={v.data.submissionUrl} label="投稿入口"/></div><footer><button onClick={()=>edit(v)}>编辑／添加届次</button><button className="text-button danger" onClick={()=>remove(v)}>删除</button></footer></article>)}</div>}</>}
  {page==='deadline'&&<AgendaView ws={ws} ctx={ctx} quietDays={quietDays} busy={busy} onEdit={edit} onOpenPaper={openPaper} onNewDeadline={()=>setEditor({kind:'deadline'})} onExportCalendar={()=>exportFile(`deadlines-${fileStamp()}.ics`,calendarExport(visible(ws,'deadline')),'text/calendar','日历 .ics')}/>}
  </>;
 }
 return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={()=>navigate('paper')}><span className="brand-mark">S<span>·</span></span><span><strong>SciMemo</strong><small>研笺 · 个人科研手账</small></span></button><div className="sidebar-caption">我的工作区</div><nav>{nav.map(([p,icon,label])=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}><span className="nav-symbol">{icon}</span>{label}<small>{p==='paper'?stats.active:p==='note'?counts.note:p==='venue'?counts.venue:counts.openDeadlines}</small></button>)}</nav><div className="sidebar-bottom"><p>记录想法，<br/>也记录每次投稿的去向。</p><button className={page==='settings'?'active':''} onClick={()=>navigate('settings')}>⚙ 设置与数据</button><div className="local-indicator"><i/> {isNative()?'本地 SQLite':'浏览器预览 · IndexedDB'}</div><small>开发脚手架 v0.1 · 无遥测</small></div></aside><div className="workspace"><header className="topbar"><span className="breadcrumb">SciMemo <span>/</span> {titles[page][1]}</span><div className="top-actions"><input aria-label="搜索全部记录" className="search" value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);if(page==='settings')setPage('paper');}} placeholder="搜索题名、想法、期刊…"/><span className="offline-label">先存本机</span><button className="text-button" aria-label="设置与数据" onClick={()=>navigate('settings')}>⚙</button></div></header><main aria-busy={busy}>{notice&&<NoticeView notice={notice} onDismiss={()=>setNotice(null)}/>}{!ready?<Empty title={notice?'工作区未能打开':'正在打开工作区'} body={notice?'请检查下方错误；不会退回临时内存存储冒充保存成功。':'正在读取本地数据。'}/>:renderMain()}</main><footer className="app-footer"><span>数据在本机 · 同步由你决定</span><span>{counts.paper} 篇稿件 · {counts.note} 条随笔 · {counts.venue} 个投稿目标 · {counts.openDeadlines} 项未完成日程 · {ws.conflicts.filter(c=>!c.resolved).length} 个待处理冲突</span></footer></div>{pendingRemoval&&<ConfirmDialog title="移入回收站？" body={`将“${titleOf(pendingRemoval)}”移入回收站。关联的随笔与日程不会被自动删除，之后仍可从回收站恢复。`} confirmLabel="移入回收站" onConfirm={()=>void confirmRemoval()} onCancel={()=>setPendingRemoval(null)}/>}{editor&&<RecordEditor key={editor.doc?.id??editor.kind} kind={editor.kind} doc={editor.doc} papers={papers} venues={venues} busy={busy} onSave={async d=>{if(await save(d))setEditor(null);}} onClose={()=>setEditor(null)}/>}</div>;
}
