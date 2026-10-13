import type {Deadline,Doc} from '../core/types.js';
import {Badge,Empty,Link} from './components.js';

const deadlineLabels:Record<Deadline['deadlineType'],string>={submission:'投稿截止',revision:'修回截止',followup:'个人跟进',conference:'会议举办',other:'其他'};

export function PaperDeadlines({deadlines,busy,onEdit,onNewDeadline}:{deadlines:Doc<'deadline'>[];busy:boolean;onEdit:(doc:Doc)=>void;onNewDeadline:(type?:Deadline['deadlineType'])=>void}){
 return <>
  <div className="section-toolbar"><p className="muted">这里与“近期日程”展示同一批记录。修回截止与个人跟进需自行确认日期。</p><button className="primary" disabled={busy} onClick={()=>onNewDeadline()}>＋ 添加日程</button></div>
  <div className="inline"><button disabled={busy} onClick={()=>onNewDeadline('revision')}>添加修回截止</button><button disabled={busy} onClick={()=>onNewDeadline('followup')}>添加个人跟进</button></div>
  {!deadlines.length?<Empty title="还没有关联日程" body="收到修回通知后记录实际截止日期，也可以安排一次个人跟进。新日程会预先关联当前稿件。"/>:<div className="stack">{deadlines.map(doc=>{const d=doc.data,t=d.timing;return <article className="plain-card" key={doc.id}>
   <div className="card-heading"><h3>{d.title}</h3><Badge tone={d.completed?'green':'neutral'}>{d.completed?'已完成':'未完成'}</Badge></div>
   <p><Badge>{deadlineLabels[d.deadlineType]}</Badge> {t.precision==='date'?`${t.date} · 仅日期，未指定截止时刻`:`${new Date(t.at).toLocaleString()}（当前设备时区）`}</p>
   {t.precision==='instant'&&<p className="hint">原时区 {t.timezone} · {t.original||'未填写原始时间说明'}</p>}
   {d.notes&&<p>{d.notes}</p>}
   <div className="inline"><Link url={d.sourceUrl}/><span className="hint">最近核查：{d.checkedOn??'未填写'}</span></div>
   <button disabled={busy} onClick={()=>onEdit(doc)}>编辑日程 →</button>
  </article>;})}</div>}
 </>;
}
