import { systemContext, statuses, stages, terminalStatuses, type Context, type Doc, type Paper, type Submission, type SubmissionStatus, type Workspace } from './types.js';
import {DomainError} from './errors.js';
export function currentStatus(s:Submission):SubmissionStatus {
  // Recorded order is explicit; backfilling a date does not silently reorder history.
  return s.events.at(-1)?.status ?? 'submitted';
}
export const latestSubmission = (paper:Paper) => paper.submissions.at(-1);
export function addSubmission(paper:Paper, target:{venueName:string;venueId?:string;editionId?:string;submittedOn?:string|null;manuscriptNumber?:string}, ctx:Context=systemContext):Paper {
  if (!target.venueName.trim()) throw new DomainError('VALIDATION','请填写投稿对象。');
  if (paper.submissions.some(s=>!terminalStatuses.has(currentStatus(s)))) throw new DomainError('VALIDATION','已有未结束的投稿，请先记录其最终结果，再创建下一次投稿。');
  const p=structuredClone(paper);
  p.submissions.push({id:ctx.uid(),venueId:target.venueId??null,editionId:target.editionId??null,
    venueNameSnapshot:target.venueName.trim(),titleSnapshot:p.title,
    manuscriptNumber:target.manuscriptNumber??'',submittedOn:target.submittedOn??null,
    events:[{id:ctx.uid(),status:'submitted',occurredOn:target.submittedOn??null,recordedAt:ctx.now(),note:'创建投稿记录'}]});
  return p;
}
export function addSubmissionEvent(paper:Paper,submissionId:string,status:SubmissionStatus,occurredOn:string|null,note:string,ctx:Context=systemContext):Paper {
  const p=structuredClone(paper), s=p.submissions.find(x=>x.id===submissionId);
  if (!s) throw new DomainError('NOT_FOUND','投稿记录不存在。');
  if (terminalStatuses.has(currentStatus(s))) throw new DomainError('VALIDATION','这次投稿已经结束；转投请新增投稿记录。');
  if (!statuses.includes(status)) throw new DomainError('VALIDATION','未知的投稿状态。');
  s.events.push({id:ctx.uid(),status,occurredOn,recordedAt:ctx.now(),note});
  return p;
}
export function visible<K extends Doc['kind']>(ws:Workspace,kind:K):Extract<Doc,{kind:K}>[] {
  return Object.values(ws.docs).filter((d):d is Extract<Doc,{kind:K}>=>d.kind===kind&&!d.deleted)
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export function safeUrl(value:string):string|null {
  try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}
}
export function titleOf(doc:Doc):string {return doc.kind==='venue'?doc.data.name:doc.data.title||('body' in doc.data?doc.data.body.split('\n')[0].slice(0,60):'未命名');}
/** Collect values only. Searching JSON.stringify(data) also matches field names,
 *  so a query like "title" used to hit every record. */
function collectValues(value:unknown,out:string[]){
  if(typeof value==='string')out.push(value);
  else if(typeof value==='number'||typeof value==='boolean')out.push(String(value));
  else if(Array.isArray(value))for(const item of value)collectValues(item,out);
  else if(value&&typeof value==='object')for(const item of Object.values(value))collectValues(item,out);
}
export const searchDocs = (ws:Workspace,q:string,opts?:{kinds?:readonly Doc['kind'][]}) => {
  const needle=q.trim().toLowerCase();
  if(!needle)return [];
  const kinds=opts?.kinds;
  return Object.values(ws.docs).filter(d=>{
    if(d.deleted)return false;
    if(kinds&&!kinds.includes(d.kind))return false;
    const values:string[]=[];collectValues(d.data,values);
    return values.some(v=>v.toLowerCase().includes(needle));
  });
};
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
// Every field is required and extra fields are forbidden in document.schema.json.
const shape=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>isObject(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const str=(v:unknown)=>typeof v==='string';
const strings=(v:unknown)=>Array.isArray(v)&&v.every(str);
const calendarDate=(v:unknown):v is string=>{
  if(!str(v)||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [year,month,day]=v.split('-').map(Number);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
};
const date=(v:unknown)=>v===null||calendarDate(v);
// Match the schema's UUID format, including nil and max UUIDs.
const uuid=(v:unknown)=>str(v)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const iso=(v:unknown)=>{
  if(!str(v))return false;
  const match=/^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(v);
  return !!match&&calendarDate(match[1])&&Number(match[2])<24&&Number(match[3])<60&&Number(match[4])<60&&(!match[5]||(Number(match[5])<24&&Number(match[6])<60));
};
const ref=(v:unknown)=>v===null||uuid(v);
/** Import/server data is untrusted. Paired with server JSON Schema and contract fixtures. */
export function validateDoc(value:unknown):asserts value is Doc {
  const fail=()=>{throw new DomainError('VALIDATION','记录格式不正确，未写入数据。');};
  if (!shape(value,['id','kind','data','createdAt','updatedAt','version','deleted'])||!uuid(value.id)||!str(value.kind)||!iso(value.createdAt)||!iso(value.updatedAt)||!Number.isInteger(value.version)||Number(value.version)<0||typeof value.deleted!=='boolean'||!isObject(value.data)) return fail();
  const d=value.data;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength>500_000) throw new DomainError('VALIDATION','单条记录过大，请改用外部文件链接。');
  switch(value.kind){
    case 'paper':
      if(!shape(d,['title','summary','stage','nextAction','tags','archived','targets','submissions'])||!str(d.title)||!d.title.trim()||!str(d.summary)||!stages.includes(d.stage as never)||!str(d.nextAction)||!strings(d.tags)||typeof d.archived!=='boolean'||!Array.isArray(d.targets)||!Array.isArray(d.submissions)) return fail();
      for(const t of d.targets) if(!shape(t,['venueId','reason','priority'])||!uuid(t.venueId)||!str(t.reason)||!Number.isInteger(t.priority)) return fail();
      for(const s of d.submissions){
        if(!shape(s,['id','venueId','editionId','venueNameSnapshot','titleSnapshot','manuscriptNumber','submittedOn','events'])||!uuid(s.id)||!ref(s.venueId)||!ref(s.editionId)||!str(s.venueNameSnapshot)||!str(s.titleSnapshot)||!str(s.manuscriptNumber)||!date(s.submittedOn)||!Array.isArray(s.events)||!s.events.length) return fail();
        for(const e of s.events) if(!shape(e,['id','status','occurredOn','recordedAt','note'])||!uuid(e.id)||!statuses.includes(e.status as never)||!date(e.occurredOn)||!iso(e.recordedAt)||!str(e.note)) return fail();
        if(new Set(s.events.map((e:any)=>e.id)).size!==s.events.length) return fail();
      }
      if(new Set(d.submissions.map((s:any)=>s.id)).size!==d.submissions.length) return fail();
      if(d.submissions.filter((s:any)=>!terminalStatuses.has(s.events.at(-1).status)).length>1) return fail();
      break;
    case 'note':
      if(!shape(d,['title','body','noteType','paperIds','tags','pinned'])||!str(d.title)||!str(d.body)||!d.body.trim()||!str(d.noteType)||!['idea','note','progress'].includes(d.noteType)||!strings(d.paperIds)||!d.paperIds.every(uuid)||!strings(d.tags)||typeof d.pinned!=='boolean') return fail();break;
    case 'venue':
      if(!shape(d,['name','abbreviation','venueType','website','submissionUrl','notes','checkedOn','editions'])||!str(d.name)||!d.name.trim()||!str(d.abbreviation)||!str(d.venueType)||!['journal','conference'].includes(d.venueType)||!str(d.website)||!str(d.submissionUrl)||!str(d.notes)||!date(d.checkedOn)||!Array.isArray(d.editions)) return fail();
      for(const e of d.editions)if(!shape(e,['id','label','year','website','notes'])||!uuid(e.id)||!str(e.label)||!Number.isInteger(e.year)||Number(e.year)<1900||Number(e.year)>2200||!str(e.website)||!str(e.notes))return fail();
      if(new Set(d.editions.map((e:any)=>e.id)).size!==d.editions.length) return fail();break;
    case 'deadline':
      if(!shape(d,['title','deadlineType','timing','paperId','venueId','editionId','sourceUrl','checkedOn','notes','completed'])||!str(d.title)||!d.title.trim()||!str(d.deadlineType)||!['submission','revision','followup','conference','other'].includes(d.deadlineType)||!ref(d.paperId)||!ref(d.venueId)||!ref(d.editionId)||!str(d.sourceUrl)||!date(d.checkedOn)||!str(d.notes)||typeof d.completed!=='boolean'||!isObject(d.timing))return fail();
      if(d.timing.precision==='date'){if(!shape(d.timing,['precision','date'])||!calendarDate(d.timing.date))return fail();}
      else if(d.timing.precision==='instant'){
        if(!shape(d.timing,['precision','at','timezone','original'])||!iso(d.timing.at)||!str(d.timing.timezone)||!str(d.timing.original)) return fail();
        try{new Intl.DateTimeFormat('en',{timeZone:d.timing.timezone});}catch{return fail();}
      }else return fail();break;
    default:return fail();
  }
}
