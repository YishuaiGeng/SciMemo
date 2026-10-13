import type {Doc,Workspace} from '../core/types.js';
import {
  agendaByBucket,bucketLabels,defaultQuietDays,stalled,type AgendaBucket,type StalledItem,
} from '../core/read/index.js';
import {Badge,Empty,Link} from './components.js';

const deadlineLabels:Record<Doc<'deadline'>['data']['deadlineType'],string>={
  submission:'投稿截止',revision:'修回截止',followup:'个人跟进',conference:'会议举办',other:'其他',
};

const toneFor=(bucket:AgendaBucket) =>
  bucket==='overdue'?'amber':bucket==='today'?'green':'neutral';

export function AgendaView({ws,ctx,quietDays,busy,onEdit,onOpenPaper,onNewDeadline,onExportCalendar}:{
  ws:Workspace;
  ctx:{today:string;nowIso:string};
  quietDays:number;
  busy:boolean;
  onEdit:(doc:Doc)=>void;
  onOpenPaper:(id:string)=>void;
  onNewDeadline:()=>void;
  onExportCalendar:()=>void;
}){
  const groups=agendaByBucket(ws,ctx);
  const silent=stalled(ws,{quietDays},ctx);
  // A paper already carrying a follow-up deadline is tracked; do not prompt twice.
  const prompting=silent.filter(item=>!item.hasUpcomingDeadline);
  const total=groups.reduce((sum,group)=>sum+group.items.length,0);

  return <>
    <div className="section-toolbar">
      <p className="muted">按日期紧迫程度排序；仅日期不虚构时刻。这里无法自动知道期刊的意图。</p>
      <div className="inline">
        <button className="text-button" disabled={busy} onClick={onExportCalendar}>导出日历 .ics ↗</button>
        <button className="primary" disabled={busy} onClick={onNewDeadline}>＋ 添加日程</button>
      </div>
    </div>

    {prompting.length>0&&<section className="plain-card watchlist">
      <div className="card-heading">
        <h3>长时间没有状态变化</h3>
        <Badge tone="amber">{prompting.length}</Badge>
      </div>
      <p className="hint">
        只显示距上次记录已过去 {quietDays} 天的进行中投稿。这是经过的时间，不代表期刊已经遗忘或需要催促——
        是否跟进由你判断。阈值可在设置中调整。
      </p>
      <div className="stack">
        {prompting.map(item=><SilentRow key={item.paper.id} item={item} onOpenPaper={onOpenPaper}/>)}
      </div>
    </section>}

    {total===0
      ? <Empty
          title="近期没有到期事项"
          body="可以记录投稿截止、修回截止，或你自己计划跟进审稿状态的日期。个人跟进不代表期刊承诺。"
          action={<button className="primary" disabled={busy} onClick={onNewDeadline}>添加第一条日程</button>}
        />
      : <div className="stack">
          {groups.map(group=><section key={group.bucket}>
            <div className="section-toolbar">
              <h3 className="bucket-heading">
                {bucketLabels[group.bucket]}
                <span className="muted">{group.items.length}</span>
              </h3>
            </div>
            <div className="stack">{group.items.map(item=><AgendaRow key={item.doc.id} item={item} busy={busy} onEdit={onEdit} onOpenPaper={onOpenPaper}/>)}</div>
          </section>)}
        </div>}
  </>;
}

function AgendaRow({item,busy,onEdit,onOpenPaper}:{
  item:ReturnType<typeof agendaByBucket>[number]['items'][number];
  busy:boolean;
  onEdit:(doc:Doc)=>void;
  onOpenPaper:(id:string)=>void;
}){
  const {doc,bucket,dueOn,paperTitle,venueName,danglingRef}=item;
  const d=doc.data;
  return <article className="agenda-row">
    <div className={`date-tile ${bucket==='overdue'?'overdue':''}`}>
      <span>{dueOn?dueOn.slice(0,7):'日期'}</span>
      <strong>{dueOn?dueOn.slice(8):'待定'}</strong>
    </div>
    <div className="agenda-main">
      <button className="title-button" onClick={()=>onEdit(doc)}>{d.title}</button>
      <div className="inline">
        <Badge tone={toneFor(bucket)}>{bucketLabels[bucket]}</Badge>
        <Badge>{deadlineLabels[d.deadlineType]}</Badge>
        {d.completed
          ? <Badge tone="green">已完成</Badge>
          : item.instantPassed&&bucket!=='overdue'&&<Badge tone="amber">已过具体时刻</Badge>}
        <span className="muted">
          {d.timing.precision==='date'?'仅日期，未指定截止时刻':`${d.timing.at}（原时区 ${d.timing.timezone}）`}
        </span>
      </div>
      {(paperTitle||venueName)&&<p className="agenda-links">
        {paperTitle&&<button className="link-button" onClick={()=>onOpenPaper(doc.data.paperId!)}>关联稿件：{paperTitle}</button>}
        {venueName&&<span className="muted">目标：{venueName}</span>}
      </p>}
      {danglingRef&&<small className="muted">关联对象已删除或暂未同步到；原始关联 ID 仍保留。</small>}
      {d.notes&&<p>{d.notes}</p>}
      <Link url={d.sourceUrl}/>
    </div>
    <div className="row-actions">
      <button disabled={busy} onClick={()=>onEdit(doc)}>编辑</button>
    </div>
  </article>;
}

function SilentRow({item,onOpenPaper}:{item:StalledItem;onOpenPaper:(id:string)=>void}){
  const {paper,venueNameSnapshot,daysSinceChange,lastChangeOn,manuscriptNumber}=item;
  return <article className="plain-card silent-row">
    <div className="card-heading">
      <h4>{paper.data.title}</h4>
      {daysSinceChange===null
        ? <Badge>无日期记录</Badge>
        : <Badge tone="amber">{daysSinceChange} 天未变化</Badge>}
    </div>
    <p className="muted">
      投稿至 {venueNameSnapshot}
      {manuscriptNumber&&` · 稿号 ${manuscriptNumber}`}
      {lastChangeOn&&` · 最近记录 ${lastChangeOn}`}
    </p>
    {daysSinceChange===null&&<p className="hint">这条投稿没有可用的日期，无法计算静默时长。补充日期后才会参与提醒。</p>}
    <button className="text-button" onClick={()=>onOpenPaper(paper.id)}>打开稿件 →</button>
  </article>;
}

export const defaultQuietDaysForUi=defaultQuietDays;
