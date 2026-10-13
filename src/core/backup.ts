import {emptyWorkspace,uid,type Workspace,type Doc,type Note,type Deadline} from './types.js';
import {validateDoc,titleOf,safeUrl} from './domain.js';
import {DomainError} from './errors.js';
export function exportBackup(ws:Workspace){return JSON.stringify({format:'scimemo-backup',version:1,exportedAt:new Date().toISOString(),docs:Object.values(ws.docs),conflicts:ws.conflicts},null,2);}
/** Portable restore into an empty, disconnected workspace only. Never reuse old sync cursors. */
export function importBackup(text:string,current:Workspace):Workspace {
  if(Object.keys(current.docs).length||current.outbox.length||current.conflicts.length||current.serverId)throw new DomainError('PRECONDITION','仅允许恢复到全新空工作区，避免覆盖现有数据。');
  if(text.length>20_000_000)throw new DomainError('IMPORT_FORMAT','备份超过 20 MB 限制。');
  // A raw SyntaxError from JSON.parse would escape the error taxonomy, so a bad file
  // would surface as an unclassified failure. Classify it where it happens.
  let data:unknown;
  try{data=JSON.parse(text);}catch{throw new DomainError('IMPORT_FORMAT','备份文件不是有效的 JSON，当前工作区未被修改。');}
  // Imported files are untrusted: narrow the shape explicitly before touching it.
  if(!data||typeof data!=='object')throw new DomainError('IMPORT_FORMAT','不支持的备份格式。');
  const envelope=data as {format?:unknown;version?:unknown;docs?:unknown;conflicts?:unknown};
  if(envelope.format!=='scimemo-backup'||envelope.version!==1||!Array.isArray(envelope.docs)||!Array.isArray(envelope.conflicts))throw new DomainError('IMPORT_FORMAT','不支持的备份格式。');
  const rawDocs=envelope.docs,rawConflicts=envelope.conflicts;
  const ws=emptyWorkspace();ws.localRevision=current.localRevision;
  for(const doc of rawDocs){validateDoc(doc);if(ws.docs[doc.id])throw new DomainError('IMPORT_FORMAT','备份包含重复 ID。');const d={...doc,version:0};ws.docs[d.id]=d;ws.outbox.push({opId:uid(),baseVersion:0,doc:d});}
  for(const c of rawConflicts){validateDoc(c.local);if(c.remote)validateDoc(c.remote);if(typeof c.id!=='string'||typeof c.detectedAt!=='string'||typeof c.resolved!=='boolean')throw new DomainError('IMPORT_FORMAT','冲突历史格式不正确。');
    // Archive historical conflicts, not active edits against a disconnected old server.
    ws.conflicts.push({...c,resolved:true});
  }
  return ws;
}
export function noteMarkdown(doc:Doc<'note'>){const n:Note=doc.data;return `# ${titleOf(doc)}\n\n${n.body}\n\n---\n类型：${n.noteType}\n标签：${n.tags.join(', ')}\n记录 ID：${doc.id}\n`;}
const esc=(s:string)=>s.replaceAll('\\','\\\\').replaceAll('\r','').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');
function fold(s:string){let result='',line='';for(const c of s){if(new TextEncoder().encode(line+c).length>73){result+=line+'\r\n ';line='';}line+=c;}return result+line;}
const stamp=(iso:string)=>new Date(iso).toISOString().replaceAll('-','').replaceAll(':','').replace(/\.\d{3}Z$/,'Z');
export function calendarExport(docs:Doc<'deadline'>[]){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SciMemo//Personal deadlines//ZH','CALSCALE:GREGORIAN'];
 for(const doc of docs){const d:Deadline=doc.data;if(doc.deleted||d.completed)continue;
  lines.push('BEGIN:VEVENT',`UID:${doc.id}@scimemo.local`,`DTSTAMP:${stamp(new Date().toISOString())}`,`SUMMARY:${esc(d.title)}`);
  if(d.timing.precision==='date'){
   const start=d.timing.date.replaceAll('-',''),end=new Date(`${d.timing.date}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+1);
   lines.push(`DTSTART;VALUE=DATE:${start}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replaceAll('-','')}`);
  }else lines.push(`DTSTART:${stamp(d.timing.at)}`);
  lines.push(`DESCRIPTION:${esc(d.notes+(d.timing.precision==='date'?'\n仅日期；未提供精确时刻。':`\n原时区：${d.timing.timezone}\n原始说明：${d.timing.original}`))}`);
  const url=safeUrl(d.sourceUrl);if(url)lines.push(`URL:${esc(url)}`);lines.push('END:VEVENT');
 }lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
const csvCell=(s:string)=>'"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';
export function papersCsv(docs:Doc<'paper'>[]){return '\ufeff'+[['id','title','stage','next_action','submissions'],...docs.map(d=>[d.id,d.data.title,d.data.stage,d.data.nextAction,String(d.data.submissions.length)])].map(row=>row.map(csvCell).join(',')).join('\r\n');}
