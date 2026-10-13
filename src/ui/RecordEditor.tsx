import {useState,type FormEvent} from 'react';
import {makeDoc,stages,stageLabels,uid,type Doc,type Kind,type Timing} from '../core/types.js';
import {titleOf} from '../core/domain.js';
import {Dialog,Field,readText,readBody,tagsFrom} from './components.js';
import {presentError} from './messages.js';
const labels:Record<Kind,string>={paper:'稿件',note:'灵感随笔',venue:'期刊／会议',deadline:'日程'};
export function RecordEditor({kind,doc,papers,venues,busy,onSave,onClose}:{kind:Kind;doc?:Doc;papers:Doc<'paper'>[];venues:Doc<'venue'>[];busy:boolean;onSave:(doc:Doc)=>Promise<void>;onClose:()=>void}){
 const [precision,setPrecision]=useState(doc?.kind==='deadline'?doc.data.timing.precision:'date');
 const [venueType,setVenueType]=useState(doc?.kind==='venue'?doc.data.venueType:'journal');
 const [error,setError]=useState('');
 const p=doc?.kind==='paper'?doc.data:null,n=doc?.kind==='note'?doc.data:null,v=doc?.kind==='venue'?doc.data:null,d=doc?.kind==='deadline'?doc.data:null;
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');const f=new FormData(e.currentTarget);try{
  let next:Doc;
  if(kind==='paper'){
   let priority=Math.max(0,...(p?.targets??[]).map(t=>t.priority));
   const targets=[...f.getAll('target').map(x=>({venueId:String(x),reason:readText(f,`reason-${x}`),priority:p?.targets.find(t=>t.venueId===String(x))?.priority??++priority})),...(p?.targets??[]).filter(t=>!venues.some(v=>v.id===t.venueId))].sort((a,b)=>a.priority-b.priority);
   const data={title:readText(f,'title'),summary:readBody(f,'summary'),stage:readText(f,'stage') as typeof stages[number],nextAction:readText(f,'nextAction'),tags:tagsFrom(readText(f,'tags')),archived:p?.archived??false,submissions:p?.submissions??[],targets};
   next=doc?.kind==='paper'?{...doc,data}:makeDoc('paper',data);
  }else if(kind==='note'){
   const data={title:readText(f,'title'),body:readBody(f,'body'),noteType:readText(f,'noteType') as 'idea'|'note'|'progress',paperIds:[...f.getAll('paperIds').map(String),...(n?.paperIds??[]).filter(id=>!papers.some(p=>p.id===id))],tags:tagsFrom(readText(f,'tags')),pinned:f.has('pinned')};
   next=doc?.kind==='note'?{...doc,data}:makeDoc('note',data);
  }else if(kind==='venue'){
   const editions=structuredClone(v?.editions??[]),year=readText(f,'editionYear');
   if(venueType==='conference'&&year)editions.push({id:uid(),year:Number(year),label:readText(f,'editionLabel')||`${readText(f,'name')} ${year}`,website:readText(f,'editionUrl'),notes:''});
   const data={name:readText(f,'name'),abbreviation:readText(f,'abbreviation'),venueType,website:readText(f,'website'),submissionUrl:readText(f,'submissionUrl'),notes:readBody(f,'notes'),checkedOn:readText(f,'checkedOn')||null,editions};
   next=doc?.kind==='venue'?{...doc,data}:makeDoc('venue',data);
  }else{
   const at=readText(f,'at');const timing:Timing=precision==='date'?{precision:'date',date:readText(f,'date')}:{precision:'instant',at,timezone:readText(f,'timezone'),original:readText(f,'original')};
   const edition=readText(f,'editionId').split('|');
   const data={title:readText(f,'title'),deadlineType:readText(f,'deadlineType') as 'submission'|'revision'|'followup'|'conference'|'other',timing,paperId:readText(f,'paperId')||null,venueId:edition.length===2?edition[0]:readText(f,'venueId')||null,editionId:edition.length===2?edition[1]:null,sourceUrl:readText(f,'sourceUrl'),checkedOn:readText(f,'checkedOn')||null,notes:readBody(f,'notes'),completed:d?.completed??false};
   next=doc?.kind==='deadline'?{...doc,data}:makeDoc('deadline',data);
  }
  await onSave(next);
 }catch(err){const p=presentError(err);setError(`${p.title}：${p.detail}`);}}
 return <Dialog title={`${doc?'编辑':'新建'}${labels[kind]}`} onClose={onClose}><form onSubmit={submit}>
 {kind==='paper'&&<>
  <Field label="名称／论文题名"><input name="title" required autoFocus defaultValue={p?.title} placeholder="可以先写暂定名称"/></Field>
  <div className="form-row"><Field label="工作阶段"><select name="stage" defaultValue={p?.stage??'idea'}>{stages.map(s=><option key={s} value={s}>{stageLabels[s]}</option>)}</select></Field><Field label="标签"><input name="tags" defaultValue={p?.tags.join(', ')} placeholder="用逗号分隔，可不填"/></Field></div>
  <Field label="下一步"><input name="nextAction" defaultValue={p?.nextAction} placeholder="下一件最值得推进的事情"/></Field>
  <Field label="简要说明"><textarea name="summary" rows={4} defaultValue={p?.summary}/></Field>
  {!!venues.length&&<fieldset><legend>候选投稿目标（不是已投稿）</legend>{venues.map(t=><div key={t.id} className="target-choice"><label><input type="checkbox" name="target" value={t.id} defaultChecked={p?.targets.some(x=>x.venueId===t.id)}/>{t.data.abbreviation||t.data.name}</label><input name={`reason-${t.id}`} defaultValue={p?.targets.find(x=>x.venueId===t.id)?.reason} placeholder="为什么考虑这里？（可选）"/></div>)}</fieldset>}
 </>}
 {kind==='note'&&<>
  <Field label="标题（可选）"><input name="title" defaultValue={n?.title} placeholder="留空时显示正文首行"/></Field>
  <div className="form-row"><Field label="记录类型"><select name="noteType" defaultValue={n?.noteType??'idea'}><option value="idea">创新点／灵感</option><option value="note">随笔／资料</option><option value="progress">进展记录</option></select></Field><Field label="标签"><input name="tags" defaultValue={n?.tags.join(', ')} placeholder="用逗号分隔"/></Field></div>
  <Field label="正文" hint="支持保存 Markdown 原文；当前不渲染原始 HTML。"><textarea className="note-editor" name="body" rows={11} required autoFocus defaultValue={n?.body} placeholder="先记下来，不必马上整理成一项工作。"/></Field>
  {!!papers.length&&<Field label="关联稿件（可选，可多选）"><select name="paperIds" multiple defaultValue={n?.paperIds??[]} size={Math.min(papers.length,4)}>{papers.map(x=><option key={x.id} value={x.id}>{x.data.title}</option>)}</select></Field>}
  <label className="checkline"><input type="checkbox" name="pinned" defaultChecked={n?.pinned}/>置顶这条随笔</label>
 </>}
 {kind==='venue'&&<>
  <Field label="名称"><input name="name" required autoFocus defaultValue={v?.name}/></Field>
  <div className="form-row"><Field label="简称"><input name="abbreviation" defaultValue={v?.abbreviation}/></Field><Field label="类型"><select value={venueType} onChange={e=>setVenueType(e.target.value as 'journal'|'conference')}><option value="journal">期刊</option><option value="conference">会议系列</option></select></Field></div>
  <Field label="官网"><input type="url" name="website" defaultValue={v?.website} placeholder="https://…"/></Field>
  <Field label="投稿入口"><input type="url" name="submissionUrl" defaultValue={v?.submissionUrl}/></Field>
  <Field label="个人备注"><textarea name="notes" rows={4} defaultValue={v?.notes} placeholder="主题匹配、篇幅、自己的判断；动态信息请保留来源与核查日期。"/></Field>
  <Field label="最近核查日期"><input type="date" name="checkedOn" defaultValue={v?.checkedOn??''}/></Field>
  {venueType==='conference'&&<fieldset><legend>新增具体届次（可选）</legend>{v?.editions.map(e=><p className="muted" key={e.id}>已有：{e.label} · {e.year}</p>)}<div className="form-row"><Field label="年份"><input type="number" min="1900" max="2200" name="editionYear" placeholder="2027"/></Field><Field label="届次名称"><input name="editionLabel" placeholder="会议名 2027"/></Field></div><Field label="本届官网"><input type="url" name="editionUrl"/></Field></fieldset>}
 </>}
 {kind==='deadline'&&<>
  <Field label="日程标题"><input name="title" required autoFocus defaultValue={d?.title} placeholder="修回截止／会议投稿／下次跟进"/></Field>
  <div className="form-row"><Field label="日期用途"><select name="deadlineType" defaultValue={d?.deadlineType??'submission'}><option value="submission">投稿截止</option><option value="revision">修回截止</option><option value="followup">个人跟进</option><option value="conference">会议举办</option><option value="other">其他</option></select></Field><Field label="时间精度"><select value={precision} onChange={e=>setPrecision(e.target.value as 'date'|'instant')}><option value="date">仅日期，不知道具体时刻</option><option value="instant">精确时刻（含时区）</option></select></Field></div>
  {precision==='date'?<Field label="日期" hint="不会擅自当作该日 UTC 零点截止。"><input type="date" name="date" required defaultValue={d?.timing.precision==='date'?d.timing.date:''}/></Field>:<><Field label="带时区偏移的时间" hint="例如 2027-01-15T23:59:00-12:00；AoE 不等于你的电脑时区。"><input name="at" required placeholder="2027-01-15T23:59:00-12:00" defaultValue={d?.timing.precision==='instant'?d.timing.at:''}/></Field><Field label="公告时区（IANA）"><input name="timezone" required placeholder="例如 Etc/GMT+12（UTC−12 / AoE）" defaultValue={d?.timing.precision==='instant'?d.timing.timezone:''}/></Field><Field label="原始时间说明"><input name="original" defaultValue={d?.timing.precision==='instant'?d.timing.original:''}/></Field></>}
  <Field label="关联稿件"><select name="paperId" defaultValue={d?.paperId??''}><option value="">不关联</option>{d?.paperId&&!papers.some(p=>p.id===d.paperId)&&<option value={d.paperId}>已删除稿件（保留关联）</option>}{papers.map(p=><option key={p.id} value={p.id}>{p.data.title}</option>)}</select></Field>
  <div className="form-row"><Field label="期刊／会议系列"><select name="venueId" defaultValue={d?.venueId??''}><option value="">不关联</option>{d?.venueId&&!venues.some(v=>v.id===d.venueId)&&<option value={d.venueId}>已删除目标（保留关联）</option>}{venues.map(v=><option key={v.id} value={v.id}>{v.data.name}</option>)}</select></Field><Field label="会议具体届次" hint="选择届次后优先关联其所属会议。"><select name="editionId" defaultValue={d?.editionId?`${d.venueId}|${d.editionId}`:''}><option value="">不关联具体届次</option>{d?.editionId&&!venues.some(v=>v.data.editions.some(e=>e.id===d.editionId))&&<option value={`${d.venueId}|${d.editionId}`}>原届次暂不可见（保留关联）</option>}{venues.flatMap(v=>v.data.editions.map(e=><option key={e.id} value={`${v.id}|${e.id}`}>{e.label}</option>))}</select></Field></div>
  <Field label="公告来源"><input type="url" name="sourceUrl" defaultValue={d?.sourceUrl}/></Field><Field label="核查日期"><input type="date" name="checkedOn" defaultValue={d?.checkedOn??''}/></Field><Field label="备注"><textarea name="notes" rows={3} defaultValue={d?.notes}/></Field>
 </>}
 {error&&<p role="alert" className="form-error">{error}</p>}
 <div className="form-actions"><span className="muted">先保存在本机，不自动上传</span><button disabled={busy} className="primary" type="submit">{busy?'保存中…':'保存记录'}</button></div>
 </form></Dialog>;
}
