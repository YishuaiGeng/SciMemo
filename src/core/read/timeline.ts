import type {Doc,Paper,SubmissionStatus,Workspace} from '../types.js';
import {statusLabels} from '../types.js';
import {agenda} from './agenda.js';
import type {ReadContext} from './context.js';

export type TimelineKind = 'created'|'candidate'|'submission'|'event'|'deadline';

export interface TimelineEntry {
  id:string;
  kind:TimelineKind;
  /** Date the thing happened, when known. Null when the user never recorded one. */
  occurredOn:string|null;
  /** When it was entered into SciMemo. Never null. */
  recordedAt:string;
  label:string;
  detail:string;
  status?:SubmissionStatus;
  submissionId?:string;
}

/**
 * Everything known about one manuscript, in the order it was recorded.
 *
 * Sorting is by `recordedAt`, not `occurredOn`, matching `currentStatus`: recorded
 * order is the explicit fact, and backfilling an older date must not make an event
 * jump to a different position. Both dates are exposed so the UI can label them
 * separately ("发生于 / 记录于") instead of hiding the distinction.
 */
export function timeline(paper:Doc<'paper'>,ws:Workspace,ctx:ReadContext):TimelineEntry[] {
  const entries:TimelineEntry[]=[];
  const venueName=(id:string)=>{
    const venue=ws.docs[id];
    if(!venue)return `已删除的目标（${id.slice(0,8)}…）`;
    if(venue.kind==='venue')return venue.data.abbreviation||venue.data.name;
    return id.slice(0,8)+'…';
  };
  entries.push({
    id:`${paper.id}-created`,kind:'created',occurredOn:null,recordedAt:paper.createdAt,
    label:'建立记录',detail:'稿件记录创建',
  });
  for(const target of paper.data.targets){
    entries.push({
      id:`${paper.id}-target-${target.venueId}`,kind:'candidate',occurredOn:null,recordedAt:paper.createdAt,
      label:'考虑过的目标',detail:target.reason?`${venueName(target.venueId)} · ${target.reason}`:venueName(target.venueId),
    });
  }
  for(const submission of paper.data.submissions){
    entries.push({
      id:submission.id,kind:'submission',occurredOn:submission.submittedOn,recordedAt:paper.createdAt,
      label:`投稿至 ${submission.venueNameSnapshot}`,
      detail:submission.manuscriptNumber?`稿号 ${submission.manuscriptNumber}`:submission.titleSnapshot,
      submissionId:submission.id,
    });
    for(const event of submission.events){
      entries.push({
        id:event.id,kind:'event',occurredOn:event.occurredOn,recordedAt:event.recordedAt,
        label:statusLabels[event.status],detail:event.note,status:event.status,submissionId:submission.id,
      });
    }
  }
  for(const item of agenda(ws,ctx)){
    if(item.doc.data.paperId!==paper.id)continue;
    entries.push({
      id:item.doc.id,kind:'deadline',occurredOn:item.dueOn,recordedAt:item.doc.createdAt,
      label:item.doc.data.completed?'日程（已完成）':'日程',detail:item.doc.data.title,
    });
  }
  // Insertion order is meaningful (a submission precedes its own events), so keep it
  // as an explicit tiebreaker rather than relying on Array.sort stability plus indexOf.
  const order=new Map(entries.map((entry,index)=>[entry.id,index]));
  return entries.sort((a,b)=>{
    const byRecorded=a.recordedAt.localeCompare(b.recordedAt);
    if(byRecorded)return byRecorded;
    return (order.get(a.id)??0)-(order.get(b.id)??0);
  });
}

/** Entries with no known date, which cannot be placed on a date axis. */
export const undatedEntries=(entries:TimelineEntry[]):TimelineEntry[]=>entries.filter(e=>!e.occurredOn);
