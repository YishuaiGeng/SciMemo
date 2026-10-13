import type {Deadline,Doc,Workspace} from '../types.js';
import {auditReferences} from '../references.js';
import {compareCalendarDates,instantToLocalDate,referenceTitle,type ReadContext} from './context.js';

export type AgendaBucket = 'overdue'|'today'|'next7'|'next30'|'later';

export interface AgendaItem {
  doc:Doc<'deadline'>;
  bucket:AgendaBucket;
  /** Calendar day used for ordering, or null when the deadline has no usable date. */
  dueOn:string|null;
  /** True when the instant has already passed. Only meaningful for `instant` timing. */
  instantPassed:boolean;
  paperTitle:string|null;
  venueName:string|null;
  /** At least one reference from this record is missing, deleted or the wrong kind. */
  danglingRef:boolean;
}

const bucketOrder:AgendaBucket[] = ['overdue','today','next7','next30','later'];

/** Calendar days between two YYYY-MM-DD strings. Both are date-only, so no DST effect. */
export function daysBetween(from:string,to:string):number {
  return Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86_400_000);
}

function bucketFor(dueOn:string|null,ctx:ReadContext):AgendaBucket {
  // An unusable date must not be silently treated as "today". It goes to `later`
  // and the caller labels it as unconfirmed.
  if(!dueOn)return 'later';
  if(compareCalendarDates(dueOn,ctx.today)<0)return 'overdue';
  const gap=daysBetween(ctx.today,dueOn);
  if(gap===0)return 'today';
  if(gap<=7)return 'next7';
  if(gap<=30)return 'next30';
  return 'later';
}

/**
 * Unfinished deadlines ordered by urgency.
 *
 * Date-only deadlines are not overdue on the day itself: a submission due today is
 * still submittable. Instant deadlines additionally carry `instantPassed`, because
 * a stated time on today's date can already be in the past.
 */
export function agenda(ws:Workspace,ctx:ReadContext):AgendaItem[] {
  const dangling=new Set(auditReferences(ws).map(issue=>issue.sourceId));
  const items:AgendaItem[]=[];
  for(const doc of Object.values(ws.docs)){
    if(doc.kind!=='deadline'||doc.deleted)continue;
    const d:Deadline=doc.data;
    if(d.completed)continue;
    const dueOn=d.timing.precision==='date'?d.timing.date||null:instantToLocalDate(d.timing.at);
    items.push({
      doc,
      bucket:bucketFor(dueOn,ctx),
      dueOn,
      instantPassed:d.timing.precision==='instant'&&Date.parse(d.timing.at)<=Date.parse(ctx.nowIso),
      paperTitle:referenceTitle(ws,d.paperId,'paper'),
      venueName:referenceTitle(ws,d.venueId,'venue'),
      danglingRef:dangling.has(doc.id),
    });
  }
  const rank=(item:AgendaItem)=>bucketOrder.indexOf(item.bucket);
  return items.sort((a,b)=>{
    const byBucket=rank(a)-rank(b);
    if(byBucket)return byBucket;
    // Undated items sort last inside their bucket rather than pretending to be urgent.
    if(!a.dueOn&&!b.dueOn)return a.doc.createdAt.localeCompare(b.doc.createdAt);
    if(!a.dueOn)return 1;
    if(!b.dueOn)return -1;
    const byDate=compareCalendarDates(a.dueOn,b.dueOn);
    return byDate||a.doc.createdAt.localeCompare(b.doc.createdAt);
  });
}

/** Grouped form for rendering, preserving the bucket order. */
export function agendaByBucket(ws:Workspace,ctx:ReadContext):{bucket:AgendaBucket;items:AgendaItem[]}[] {
  const items=agenda(ws,ctx);
  return bucketOrder.map(bucket=>({bucket,items:items.filter(item=>item.bucket===bucket)})).filter(group=>group.items.length>0);
}

export const bucketLabels:Record<AgendaBucket,string>={
  overdue:'已过期',today:'今天',next7:'未来 7 天',next30:'未来 30 天',later:'更晚或日期待确认',
};
