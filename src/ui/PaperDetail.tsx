import {useState,type FormEvent} from 'react';
import {stageLabels,statusLabels,statuses,terminalStatuses,type Deadline,type Doc,type SubmissionStatus} from '../core/types.js';
import {currentStatus,titleOf} from '../core/domain.js';
import type {WorkspaceService} from '../core/workspace.js';
import {Badge,Dialog,Field,readText,Empty} from './components.js';
import {PaperDeadlines} from './PaperDeadlines.js';
export function PaperDetail({paper,notes,venues,deadlines,busy,onSubmission,onSubmissionEvent,onEdit,onNewNote,onNewDeadline,onBack}:{paper:Doc<'paper'>;notes:Doc<'note'>[];venues:Doc<'venue'>[];deadlines:Doc<'deadline'>[];busy:boolean;onSubmission:(target:Parameters<WorkspaceService['recordSubmission']>[1])=>Promise<void>;onSubmissionEvent:(id:string,event:Parameters<WorkspaceService['recordSubmissionEvent']>[2])=>Promise<void>;onEdit:(d:Doc)=>void;onNewNote:()=>void;onNewDeadline:(type?:Deadline['deadlineType'])=>void;onBack:()=>void}){
 const [tab,setTab]=useState('submissions'),[modal,setModal]=useState<'submission'|string|null>(null),[error,setError]=useState('');
 const p=paper.data,linked=notes.filter(n=>n.data.paperIds.includes(paper.id)),linkedDeadlines=deadlines.filter(d=>!d.deleted&&d.data.paperId===paper.id);
 const canSubmit=!p.submissions.some(s=>!terminalStatuses.has(currentStatus(s)));
 async function saveForm(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');const f=new FormData(e.currentTarget);try{
  if(modal==='submission'){
   const chosen=readText(f,'venue'),[venueId,editionId]=chosen.split('|'),venue=venues.find(v=>v.id===venueId),edition=venue?.data.editions.find(e=>e.id===editionId);
   const venueName=venue?(edition?.label??venue.data.name):readText(f,'venueName');
   await onSubmission({venueName,venueId:venue?.id,editionId:edition?.id,submittedOn:readText(f,'submittedOn')||null,manuscriptNumber:readText(f,'manuscriptNumber')});
  }else await onSubmissionEvent(modal!,{status:readText(f,'status') as SubmissionStatus,occurredOn:readText(f,'occurredOn')||null,note:readText(f,'note')});
  setModal(null);
 }catch(err){setError(err instanceof Error?err.message:String(err));}}
 return <>
 <button className="text-button back" onClick={onBack}>← 返回我的稿件</button>
 <section className="detail-heading"><div><div className="eyebrow">MANUSCRIPT / 稿件档案</div><h1>{p.title}</h1><div className="inline"><Badge tone="green">{stageLabels[p.stage]}</Badge>{p.tags.map(t=><Badge key={t}>{t}</Badge>)}</div></div><button onClick={()=>onEdit(paper)}>编辑稿件</button></section>
 <div className="next-action"><span>下一步</span><strong>{p.nextAction||'还没有填写下一步。'}</strong></div>
 {p.summary&&<p className="summary">{p.summary}</p>}
 <div className="tabs"><button className={tab==='submissions'?'active':''} onClick={()=>setTab('submissions')}>投稿经历 <b>{p.submissions.length}</b></button><button className={tab==='notes'?'active':''} onClick={()=>setTab('notes')}>关联随笔 <b>{linked.length}</b></button><button className={tab==='targets'?'active':''} onClick={()=>setTab('targets')}>候选目标 <b>{p.targets.length}</b></button><button className={tab==='deadlines'?'active':''} onClick={()=>setTab('deadlines')}>关联日程 <b>{linkedDeadlines.filter(d=>!d.data.completed).length}</b></button></div>
 {tab==='submissions'&&<><div className="section-toolbar"><p className="muted">转投新增一次投稿；修回留在原投稿中。日期不确定可留空；已保存的投稿与事件暂不支持修改或补填。</p><button className="primary" disabled={!canSubmit||busy} onClick={()=>{setError('');setModal('submission');}}>＋ 新增投稿</button></div>
 {!p.submissions.length?<Empty title="还没有投稿记录" body="准备投稿的期刊可先放在候选目标中。"/>:[...p.submissions].reverse().map((s,i)=><article className="submission-card" key={s.id}>
 <div className="card-heading"><div><span className="eyebrow">第 {p.submissions.length-i} 次投稿</span><h3>{s.venueNameSnapshot}</h3><p className="muted">投稿日期：{s.submittedOn??'未填写'}{s.manuscriptNumber&&` · 稿件编号：${s.manuscriptNumber}`}</p></div><Badge tone={currentStatus(s)==='accepted'?'green':currentStatus(s).includes('revision')?'amber':'neutral'}>{statusLabels[currentStatus(s)]}</Badge></div>
 <p className="snapshot-title">当时题名：{s.titleSnapshot}</p>
 <ol className="timeline">{[...s.events].reverse().map(e=><li key={e.id}><div><strong>{statusLabels[e.status]}</strong><time>{e.occurredOn??'发生日期未填写'}</time></div>{e.note&&<p>{e.note}</p>}<small>录入：{new Date(e.recordedAt).toLocaleString()}</small></li>)}</ol>
 {!terminalStatuses.has(currentStatus(s))&&<button disabled={busy} onClick={()=>{setError('');setModal(s.id);}}>记录状态变化／修回</button>}</article>)}</>}
 {tab==='notes'&&<><div className="section-toolbar"><p className="muted">这些随笔也可以在“灵感随笔”中独立查看。</p><button onClick={onNewNote}>＋ 写一条随笔</button></div>{!linked.length?<Empty title="还没有关联随笔" body="创新点不必先形成论文，也能独立保存。"/>:<div className="note-grid">{linked.map(n=><article className="note-card" key={n.id}><Badge>{n.data.noteType==='idea'?'创新灵感':n.data.noteType==='progress'?'进展记录':'随笔'}</Badge><h3>{titleOf(n)}</h3><p className="note-body">{n.data.body}</p><button className="text-button" onClick={()=>onEdit(n)}>编辑随笔 →</button></article>)}</div>}</>}
 {tab==='targets'&&(!p.targets.length?<Empty title="还没有候选目标" body="编辑稿件时，可以选择已收藏的期刊会议，并记下选择理由。"/>:<div className="stack">{p.targets.map(t=><article className="plain-card" key={t.venueId}><h3>{venues.find(v=>v.id===t.venueId)?.data.name??'目标已删除，关联 ID 仍保留'}</h3><p>{t.reason||'暂未填写选择理由。'}</p><Badge>候选，不代表已投稿</Badge></article>)}</div>)}
 {tab==='deadlines'&&<PaperDeadlines deadlines={linkedDeadlines} busy={busy} onEdit={onEdit} onNewDeadline={onNewDeadline}/>}
 {modal&&<Dialog title={modal==='submission'?'新增一次投稿':'记录投稿变化'} onClose={()=>setModal(null)}><form onSubmit={saveForm}>
 {modal==='submission'?<><Field label="从期刊会议库选择"><select name="venue"><option value="">手动填写其他目标</option>{venues.flatMap(v=>[<option key={v.id} value={v.id}>{v.data.name}</option>,...v.data.editions.map(e=><option key={e.id} value={`${v.id}|${e.id}`}>↳ {e.label}</option>)])}</select></Field><Field label="其他投稿对象" hint="上方已选择时，这里可不填。"><input name="venueName" placeholder="期刊名称／会议与届次"/></Field><Field label="实际投稿日期" hint="不确定时留空，不会自动用今天代替。"><input type="date" name="submittedOn"/></Field><Field label="稿件编号"><input name="manuscriptNumber"/></Field></>:<><Field label="新状态"><select name="status" defaultValue="under_review">{statuses.filter(s=>s!=='submitted').map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></Field><Field label="实际发生日期"><input type="date" name="occurredOn"/></Field><Field label="说明／修改要点"><textarea name="note" rows={5}/></Field><p className="hint">按录入顺序追加状态事件；此操作不会改变工作阶段。保存后可在稿件的“关联日程”中添加修回截止或个人跟进。</p></>}
 {error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><span className="muted">保存后保留原有历史</span><button className="primary" disabled={busy} type="submit">保存</button></div></form></Dialog>}
 </>;
}
